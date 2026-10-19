#!/usr/bin/env python3
"""loop_sync.py - keep the Live Geometry shared DJ loop in step with Matt's Drive folder
'Matt Ready Library/songs on loop' (folder id in the manifest). Idempotent: re-running changes nothing
when there is nothing new. Drive itself is reached by the agent's Drive connector (this script never
talks to Google); everything else (probe, dedupe, encode, library, commit, queue) is here.

Files (box):  manifest  /workspace/songs/loop_sync/manifest.json   {folder_id, tracks:{<drive id>: {...slug...}}}
              sources   /workspace/songs/loop_sync/src/<drive id>.mp3   (downloaded by the agent)
              repo      /workspace/earth-edge-ar   (audio/dj/<slug>.mp3 + audio/dj/library.json)

Routine (see /workspace/songs/loop_sync/README.md for the full agent steps):
  1  agent: Drive search_files  parentId = '<folder_id>' and mimeType contains 'audio'  -> save JSON (write_to_file)
  2  python3 tools/loop_sync.py plan    --listing <that file>   -> prints ids to download (+ skipped non-MP3s)
  3  agent: DownloadFile each id -> /workspace/songs/loop_sync/src/<id>.mp3
  4  python3 tools/loop_sync.py apply   --listing <that file>   -> dedupe, encode, library, git commit (no push)
  5  python3 tools/loop_sync.py maccmd                          -> prints ONE shell command for the Mac (backup + fetch at commit)
     agent: git push (gh credential helper), run that command on the Mac Studio
  6  python3 tools/loop_sync.py verify                          -> cell + Pages serve every loop file / library entry
  7  python3 tools/loop_sync.py queue                           -> appends missing loop songs to the live queue (op add, no restart)
  status: python3 tools/loop_sync.py status
"""
import json, os, re, sys, subprocess, hashlib, time, argparse, urllib.request, unicodedata
REPO = '/workspace/earth-edge-ar'
BASE = '/workspace/songs/loop_sync'
MAN = BASE + '/manifest.json'
SRC = BASE + '/src'
LIB = REPO + '/audio/dj/library.json'
KEYF = '/home/box/agent-data/secrets/earth-edge-ar-gm-key.txt'
CELL = 'https://verse-concerning-summit-equipped.trycloudflare.com'
PAGES = 'https://newperspectivellc.github.io/earth-edge-ar'
RAW = 'https://raw.githubusercontent.com/NewPerspectiveLLC/earth-edge-ar'
TARGET = -14.4

def sh(*a, **k): return subprocess.run(a, capture_output=True, text=True, errors='replace', **k)
def load(p, d=None):
    try: return json.load(open(p))
    except FileNotFoundError: return d
def save(p, o):
    with open(p + '.tmp', 'w') as f: json.dump(o, f, indent=1, ensure_ascii=False); f.write('\n')
    os.replace(p + '.tmp', p)
def man(): m = load(MAN); assert m and m.get('folder_id'), 'manifest missing: ' + MAN; return m

def _page(path):
    t = open(path).read(); i = t.find('{')
    while i >= 0:
        try: o, _ = json.JSONDecoder().raw_decode(t[i:])
        except ValueError: i = t.find('{', i + 1); continue
        if isinstance(o, dict) and ('files' in o or not o): return o
        i = t.find('{', i + 1)
    raise SystemExit('no Drive search_files result ({"files":[...]} or {}) in ' + path)

def listing(paths):
    """One or more raw search_files results (one per page, in order) -> de-duplicated list of file dicts.
    Drive pages at ~5 files here: keep calling search_files with pageToken until a page has no nextPageToken
    (or comes back {}), and pass every page file."""
    out, seen = [], set()
    for p in paths:
        o = _page(p)
        for f in o.get('files', []):
            if f['id'] not in seen: seen.add(f['id']); out.append(f)
    if paths and _page(paths[-1]).get('nextPageToken') and _page(paths[-1]).get('files'):
        raise SystemExit('the last listing page has a nextPageToken: fetch the next page(s) and pass them too')
    return out

def split(files, folder):
    mp3, skip = [], []
    for f in files:
        if f.get('parentId') and f['parentId'] != folder: skip.append((f, 'not directly in the folder')); continue
        if f.get('mimeType') == 'audio/mpeg' or f.get('title', '').lower().endswith('.mp3'): mp3.append(f)
        else: skip.append((f, 'not an MP3 (' + str(f.get('mimeType')) + ')'))
    return mp3, skip

def probe(p):
    j = json.loads(sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration:format_tags=title,artist,comment', '-of', 'json', p).stdout)['format']
    t = {k.lower(): v for k, v in j.get('tags', {}).items()}
    m = re.search(r'id=([0-9a-f-]{36})', t.get('comment', ''))
    return {'duration': float(j['duration']), 'title': t.get('title'), 'artist': t.get('artist'),
            'suno': bool(re.search(r'made with suno', t.get('comment', ''), re.I)), 'suno_id': m.group(1) if m else None}

def lufs(p):
    o = sh('ffmpeg', '-nostats', '-hide_banner', '-i', p, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-').stderr
    i = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', o)[-1]); pk = float(re.findall(r'Peak:\s+(-?[\d.inf]+) dBFS', o)[-1]); return i, pk

def md5(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-') or 'song'

def encode(src, dst):
    """128 kbps 44.1 kHz MP3, metadata stripped, gain to TARGET LUFS; a -1 dBFS limiter guards boosted tracks. One correction pass."""
    i0, _ = lufs(src); g = TARGET - i0
    for _ in range(3):
        af = 'volume=%.2fdB' % g + (',alimiter=limit=0.89:level=false' if g > 0 else '')
        r = sh('ffmpeg', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-map_metadata', '-1', '-af', af, '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', dst)
        if r.returncode: raise SystemExit('ffmpeg failed: ' + r.stderr)
        i1, pk = lufs(dst)
        if abs(i1 - TARGET) <= 0.3: break
        g += TARGET - i1
    return {'src_lufs': i0, 'gain_db': round(g, 1), 'lufs': i1, 'peak': pk}

def gm_key():
    k = open(KEYF).read().strip(); assert k, 'empty GM key file'; return k

def api(method, path, body=None):
    req = urllib.request.Request(CELL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', 'X-GM-Key': gm_key(), 'User-Agent': 'loop_sync'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
    except urllib.error.HTTPError as e: raise SystemExit('api %s %s -> %s %s' % (method, path, e.code, e.read()[:300]))

def loop_ids(m):
    seen, out = set(), []
    for v in sorted(m['tracks'].values(), key=lambda v: v.get('order', 1e9)):
        if v.get('slug') and v['slug'] not in seen and v.get('status') in ('in_library', 'deployed'): seen.add(v['slug']); out.append(v['slug'])
    return out

# ---------------- commands ----------------
def c_plan(a):
    m = man(); mp3, skip = split(listing(a.listing), m['folder_id'])
    new = [f for f in mp3 if f['id'] not in m['tracks']]
    for f, why in skip: print('SKIP  %-45s %s' % (f.get('title'), why))
    for f in mp3:
        if f['id'] in m['tracks']: print('KNOWN %-45s -> %s' % (f['title'], m['tracks'][f['id']].get('slug')))
    for f in new:
        have = os.path.exists('%s/%s.mp3' % (SRC, f['id']))
        print('NEW   %-45s id=%s  %s' % (f['title'], f['id'], 'already downloaded' if have else 'DOWNLOAD -> %s/%s.mp3' % (SRC, f['id'])))
    print(json.dumps({'download': [f['id'] for f in new if not os.path.exists('%s/%s.mp3' % (SRC, f['id']))]}))

def c_apply(a):
    m = man(); mp3, skip = split(listing(a.listing), m['folder_id']); lib = load(LIB)
    libids = {t['id'] for t in lib['tracks']}; added = []
    order = max([v.get('order', 0) for v in m['tracks'].values()] + [0])
    over = dict(x.split('=', 1) for x in (a.title or []))
    for f in sorted(mp3, key=lambda f: f.get('createdTime', '')):
        if f['id'] in m['tracks']: continue
        p = '%s/%s.mp3' % (SRC, f['id'])
        if not os.path.exists(p): print('WAIT  %s not downloaded yet (%s)' % (f['title'], p)); continue
        pr = probe(p); h = md5(p)
        dup = next((k for k, v in m['tracks'].items() if v.get('md5') == h or (pr['suno_id'] and v.get('suno_id') == pr['suno_id'])), None)
        rec = {'drive_title': f['title'], 'size': int(f.get('fileSize') or os.path.getsize(p)), 'md5': h, 'suno_id': pr['suno_id'],
               'src_duration': round(pr['duration'], 3), 'tag_title': pr['title'], 'tag_artist': pr['artist'], 'seen': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
        if dup:
            rec.update(slug=m['tracks'][dup]['slug'], status='duplicate', duplicate_of=dup); m['tracks'][f['id']] = rec
            print('DUP   %s = %s (%s) - not added again' % (f['title'], m['tracks'][dup]['drive_title'], rec['slug'])); continue
        stem = re.sub(r'\.mp3$', '', f['title'], flags=re.I)
        title = over.get(f['id']) or pr['title'] or stem
        slug = slugify(title)
        if slug in libids and not over.get(f['id']): slug = slugify(stem)
        n = 2
        while slug in libids: slug = '%s-%d' % (slugify(title), n); n += 1
        if slug != slugify(title) and pr['title'] and not over.get(f['id']): title = '%s (%s)' % (pr['title'], stem)
        # credit Matt only when the file's own tags say so (artist meditationmatt or Matt Ready)
        mine = (pr['artist'] or '').strip().lower() in ('meditationmatt', 'matt ready', '@meditationmatt')
        if a.mine and f['id'] in a.mine: mine = True
        dst = '%s/audio/dj/%s.mp3' % (REPO, slug); e = encode(p, dst)
        dur = round(min(pr['duration'], float(sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst).stdout)) - 0.03, 3)
        src = "Matt's Google Drive 'Matt Ready Library/songs on loop/%s' (drive id %s, MP3 %.0f kbps)" % (f['title'], f['id'], rec['size'] * 8 / pr['duration'] / 1000)
        if pr['suno_id']: src = ('Matt Ready (@meditationmatt), made with Suno (clip %s); from ' % pr['suno_id'] if mine else 'Made with Suno (clip %s); from ' % pr['suno_id']) + src
        src += ', transcoded to 128 kbps MP3 44.1 kHz with %+.1f dB to match %.1f LUFS' % (e['gain_db'], TARGET)
        t = {'id': slug, 'title': title, 'artist': 'Matt Ready' if mine else (pr['artist'] or 'Unknown artist'), 'genre': 'Original song' if mine else 'Song',
             'bpm': None, 'url': 'audio/dj/%s.mp3' % slug, 'duration': dur, 'license': 'Original' if mine else 'Owner-provided', 'licenseUrl': None, 'source': src,
             'attribution': ('%s, an original song by Matt Ready (@meditationmatt)' % title) if mine else ('%s, %s' % (title, pr['artist'] or 'from Matt\'s Drive'))}
        # originals sit together near the top of the library (after the last loop song already listed)
        k = max([i for i, x in enumerate(lib['tracks']) if x['id'] in {v.get('slug') for v in m['tracks'].values()}] + [-1]) + 1
        lib['tracks'].insert(k, t); libids.add(slug); order += 1
        rec.update(slug=slug, status='in_library', order=order, encoded=e, duration=dur, out_md5=md5(dst), out_size=os.path.getsize(dst))
        m['tracks'][f['id']] = rec; added.append(slug)
        print('ADD   %-40s -> %s  %.1f s  %+.1f dB  %.1f LUFS peak %.1f' % (f['title'], slug, dur, e['gain_db'], e['lufs'], e['peak']))
    for f, why in skip: print('SKIP  %-45s %s' % (f.get('title'), why))
    # a file that vanished from Drive stays in the loop (never delete on our side); just report it
    gone = [v['drive_title'] for k, v in m['tracks'].items() if k not in {f['id'] for f in mp3} and v.get('status') != 'duplicate']
    if gone: print('NOTE  in manifest but not in the folder listing now (left in the loop):', ', '.join(gone))
    if added:
        save(LIB, lib)
        files = ['audio/dj/library.json'] + ['audio/dj/%s.mp3' % s for s in added]
        sh('git', '-C', REPO, 'add', *files)
        r = sh('git', '-C', REPO, 'commit', '-m', 'loop-sync: add %s to the DJ library from Drive "songs on loop"' % ', '.join(added))
        print(r.stdout.strip() or r.stderr.strip())
        m['pending_deploy'] = sorted(set(m.get('pending_deploy', []) + files))
    m['last_apply'] = time.strftime('%Y-%m-%dT%H:%M:%S%z'); save(MAN, m)
    print(json.dumps({'added': added, 'commit': sh('git', '-C', REPO, 'rev-parse', '--short', 'HEAD').stdout.strip(), 'pending_deploy': m.get('pending_deploy', [])}))

def c_maccmd(a):
    """Print a bash script for the Mac Studio (run it with: bash <<'EOF' ... EOF). Push first: files come from GitHub raw at HEAD."""
    m = man(); files = m.get('pending_deploy', [])
    if not files: print('# nothing pending'); return
    sha = sh('git', '-C', REPO, 'rev-parse', 'HEAD').stdout.strip(); ts = time.strftime('%Y%m%d-%H%M%S')
    L = ['set -e', 'cd ~/earth-edge-ar', 'B=~/earth-edge-ar-backups/pre-loopfolder-%s; mkdir -p $B' % ts,
         'md5 -q server/data.json > $B/data.json.md5', "printf '%%s\\n' %s > $B/files.txt" % ' '.join(files),
         'for f in $(cat $B/files.txt); do mkdir -p $B/$(dirname $f); [ -f $f ] && cp -p $f $B/$f || true; done',
         'R=%s/%s' % (RAW, sha),
         'dl(){ curl -fsSL -o $1.part "$R/$1"; [ "$(md5 -q $1.part)" = "$2" ] || { echo "md5 mismatch $1"; exit 1; }; }']
    L += ['dl %s %s' % (f, md5('%s/%s' % (REPO, f))) for f in files]
    L += ['for f in $(cat $B/files.txt); do mv -f $f.part $f; done',
          '[ "$(md5 -q server/data.json)" = "$(cat $B/data.json.md5)" ] && echo "data.json untouched"',
          'echo "deployed %d files at %s, backup $B"' % (len(files), sha[:7])]
    print('\n'.join(L))
    print('# push first; after the Mac script succeeds:  python3 tools/loop_sync.py deployed', file=sys.stderr)

def c_deployed(a):
    m = man()
    for v in m['tracks'].values():
        if v.get('status') == 'in_library': v['status'] = 'deployed'
    m['pending_deploy'] = []; m['last_deploy'] = time.strftime('%Y-%m-%dT%H:%M:%S%z'); save(MAN, m); print('ok')

def head(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, method='HEAD', headers={'User-Agent': 'loop_sync'}), timeout=20) as r: return r.status, int(r.headers.get('Content-Length') or -1)
    except Exception as e: return getattr(e, 'code', str(e)), -1

def c_verify(a):
    m = man(); ok = True; ids = loop_ids(m)
    for base in (CELL, PAGES):
        try: lib = json.load(urllib.request.urlopen(urllib.request.Request(base + '/audio/dj/library.json?ts=%d' % time.time(), headers={'User-Agent': 'loop_sync'}), timeout=20))
        except Exception as e: print(base, 'library.json', e); ok = False; continue
        li = {t['id'] for t in lib['tracks']}
        for s in ids:
            st, n = head('%s/audio/dj/%s.mp3' % (base, s)); want = os.path.getsize('%s/audio/dj/%s.mp3' % (REPO, s))
            good = st == 200 and s in li and (n in (-1, want)); ok &= good
            print('%-5s %-7s %-40s http %s size %s lib %s' % ('OK' if good else 'FAIL', 'cell' if base == CELL else 'pages', s, st, n, s in li))
    print('ALL OK' if ok else 'SOME FAILED (Pages can lag a few minutes after a push; re-run)'); sys.exit(0 if ok else 1)

def c_queue(a):
    m = man(); ids = loop_ids(m); d = api('GET', '/api/dj')
    if a.set:
        r = api('POST', '/api/dj', {'op': 'repeat', 'mode': 'all', 'ids': ids}); print('set loop to', ids); d = r
    elif d.get('repeat') != 'all':
        print('loop is not on (repeat=%s); queue left alone. Use --set to turn the folder loop back on.' % d.get('repeat')); return
    else:
        have = {q['id'] for q in d['queue']}; miss = [s for s in ids if s not in have]
        if miss: d = api('POST', '/api/dj', {'op': 'add', 'ids': miss}); print('appended', miss)
        else: print('queue already has every loop song')
    print(json.dumps({'rev': d.get('rev'), 'repeat': d.get('repeat'), 'playing': d.get('playing'), 'current': (d.get('current') or {}).get('id'),
                      'queue': [q['id'] for q in d['queue']], 'savedQueue': d.get('savedQueue')}))

def c_status(a):
    m = man(); print('folder', m['folder_id'], m.get('folder_path'))
    for k, v in sorted(m['tracks'].items(), key=lambda kv: kv[1].get('order', 1e9)): print('%-34s %-12s %-38s %s' % (k, v.get('status'), v.get('slug'), v.get('drive_title')))
    print('loop order:', loop_ids(m)); print('pending deploy:', m.get('pending_deploy'))

if __name__ == '__main__':
    p = argparse.ArgumentParser(); s = p.add_subparsers(dest='c', required=True)
    for n in ('plan', 'apply'):
        q = s.add_parser(n); q.add_argument('--listing', required=True, nargs='+', help='search_files result file(s), one per page')
        if n == 'apply':
            q.add_argument('--mine', nargs='*', default=[], help='drive ids confirmed (e.g. on suno.com) as Matt Ready originals although the tags lack the artist')
            q.add_argument('--title', nargs='*', default=[], help='<drive id>=<display title> overrides (also sets the slug)')
    for n in ('maccmd', 'deployed', 'verify', 'status'): s.add_parser(n)
    q = s.add_parser('queue'); q.add_argument('--set', action='store_true', help='make the queue exactly the loop (repeat all), keeping the current song')
    a = p.parse_args(); os.makedirs(SRC, exist_ok=True); globals()['c_' + a.c](a)
