#!/usr/bin/env python3
"""video_sync.py - Drive folder 'Matt Ready Library/videos on loop' -> the Live Geometry drive-in screen reel.
Idempotent: a run with nothing new changes nothing. Read-only on Drive (the agent downloads with DownloadFile; this
script never talks to Google and never moves/renames/deletes anything there).

Files (box):  manifest  /workspace/videos/loop_sync/manifest.json  {folder_id, clips:{<drive id>: {...}}}
              sources   /workspace/videos/loop_sync/src/<drive id>.mp4  (downloaded by the agent, untouched)
              work      /workspace/videos/loop_sync/work/<drive id>-{720,360}.mp4  (normalised per-clip encodes)
              repo      video/drivein/reel-<hash>.mp4 (main 1280x720) + reel-<hash>-lite.mp4 (640x360) + video/drivein/screen.json

Every clip is fitted (unstretched, black bars) into a 16:9 frame, 24 fps, H.264 + AAC 48 kHz stereo, loudness -16 LUFS,
then all clips are concatenated in Drive upload order (createdTime) into ONE reel that loops on the screen
(one <video> element: seamless loop, trivial server-time sync: pos = (serverNow - epoch) mod duration).
The reel file name carries a content hash, so clients never see a stale cached reel.

  plan   --listing <page files...>   -> new ids to download
  apply  --listing <page files...>   -> encode new clips, rebuild reel + screen.json if the clip set changed, git commit (no push)
  status
Deploy like tools/loop_sync.py (push, copy the changed files to the Mac, verify cell + Pages). Not scheduled.
"""
import json, os, re, sys, subprocess, hashlib, time, argparse
REPO = '/workspace/earth-edge-ar'; BASE = '/workspace/videos/loop_sync'; MAN = BASE + '/manifest.json'; SRC = BASE + '/src'; WORK = BASE + '/work'
OUT = REPO + '/video/drivein'; SCREEN = OUT + '/screen.json'
FOLDER = '1NZzabiQ-a-l5JOafTrxm8WqrpdqNwWCW'
EPOCH = 1792440000000   # 2026-10-19 20:00:00 UTC (13:00 PDT); every client: pos = ((serverNow - EPOCH)/1000) mod duration
PAGES_LIMIT = 95 * 2**20
VARIANTS = {'720': dict(w=1280, h=720, crf=23, prof='high', lvl='4.0', ab='128k'), '360': dict(w=640, h=360, crf=27, prof='main', lvl='3.1', ab='96k')}

def sh(*a): return subprocess.run(a, capture_output=True, text=True, errors='replace')
def load(p, d=None):
    try: return json.load(open(p))
    except FileNotFoundError: return d
def save(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p + '.tmp', 'w') as f: json.dump(o, f, indent=1, ensure_ascii=False); f.write('\n')
    os.replace(p + '.tmp', p)
def man(): return load(MAN) or {'folder_id': FOLDER, 'clips': {}}
def md5(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

def listing(paths):
    out, seen = [], set()
    for p in paths:
        t = open(p).read(); i = t.find('{'); o = None
        while i >= 0:
            try: o, _ = json.JSONDecoder().raw_decode(t[i:]); break
            except ValueError: i = t.find('{', i + 1)
        if o is None: raise SystemExit('no search_files result in ' + p)
        for f in o.get('files', []):
            if f['id'] not in seen: seen.add(f['id']); out.append(f)
    return out
def videos(files):
    v = [f for f in files if (f.get('parentId') in (None, FOLDER)) and (str(f.get('mimeType', '')).startswith('video/') or re.search(r'\.(mp4|mov|m4v|webm)$', f.get('title', ''), re.I))]
    return sorted(v, key=lambda f: (f.get('createdTime', ''), f['title']))
def probe(p):
    j = json.loads(sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', p).stdout)
    vs = [s for s in j['streams'] if s['codec_type'] == 'video']; a = any(s['codec_type'] == 'audio' for s in j['streams'])
    return float(j['format']['duration']), vs[0]['width'], vs[0]['height'], a

def encode(src, dst, V, has_audio, dur):
    vf = 'scale=%d:%d:force_original_aspect_ratio=decrease:flags=lanczos,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:black,fps=24,setsar=1,format=yuv420p' % (V['w'], V['h'], V['w'], V['h'])
    inp = ['-i', src] + ([] if has_audio else ['-f', 'lavfi', '-t', str(dur), '-i', 'anullsrc=r=48000:cl=stereo'])
    af = 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad,atrim=end=%.3f' % dur
    r = sh('ffmpeg', '-y', '-v', 'error', *inp, '-map', '0:v:0', '-map', '0:a:0' if has_audio else '1:a:0', '-map_metadata', '-1', '-vf', vf, '-af', af,
           '-t', '%.3f' % dur, '-c:v', 'libx264', '-preset', 'slow', '-crf', str(V['crf']), '-profile:v', V['prof'], '-level', V['lvl'], '-g', '24', '-keyint_min', '24', '-sc_threshold', '0',
           '-c:a', 'aac', '-b:a', V['ab'], '-ac', '2', '-ar', '48000', '-movflags', '+faststart', dst)
    if r.returncode: raise SystemExit('ffmpeg failed on %s: %s' % (src, r.stderr[-800:]))

def concat(parts, dst):
    lst = dst + '.txt'; open(lst, 'w').write(''.join("file '%s'\n" % p for p in parts))
    r = sh('ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', dst); os.remove(lst)
    if r.returncode: raise SystemExit('concat failed: ' + r.stderr[-800:])

def c_plan(a):
    m = man(); fs = videos(listing(a.listing))
    for f in fs:
        k = f['id'] in m['clips']; have = os.path.exists('%s/%s.mp4' % (SRC, f['id']))
        print('%-5s %-55s id=%s %s' % ('KNOWN' if k else 'NEW', f['title'], f['id'], '' if k else ('downloaded' if have else 'DOWNLOAD -> %s/%s.mp4' % (SRC, f['id']))))
    print(json.dumps({'download': [f['id'] for f in fs if f['id'] not in m['clips'] and not os.path.exists('%s/%s.mp4' % (SRC, f['id']))]}))

def c_apply(a):
    m = man(); fs = videos(listing(a.listing)); os.makedirs(WORK, exist_ok=True); os.makedirs(OUT, exist_ok=True); changed = False
    for f in fs:
        if f['id'] in m['clips']: continue
        p = '%s/%s.mp4' % (SRC, f['id'])
        if not os.path.exists(p): print('WAIT  %s not downloaded' % f['title']); continue
        h = md5(p); dup = next((k for k, v in m['clips'].items() if v['md5'] == h), None)
        dur, w, hh, au = probe(p)
        rec = {'drive_title': f['title'], 'created': f.get('createdTime'), 'size': os.path.getsize(p), 'md5': h, 'duration': round(dur, 3), 'w': w, 'h': hh, 'audio': au, 'seen': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
        if dup: rec.update(status='duplicate', duplicate_of=dup); m['clips'][f['id']] = rec; print('DUP   %s (= %s)' % (f['title'], m['clips'][dup]['drive_title'])); continue
        for k, V in VARIANTS.items(): encode(p, '%s/%s-%s.mp4' % (WORK, f['id'], k), V, au, dur)
        rec['status'] = 'in_reel'; m['clips'][f['id']] = rec; changed = True; print('NEW   %s %.1fs %dx%d' % (f['title'], dur, w, hh))
    order = [k for k, v in sorted(m['clips'].items(), key=lambda kv: (kv[1].get('created') or '', kv[1]['drive_title'])) if v.get('status') == 'in_reel']
    if not order: print('no clips'); save(MAN, m); return
    if not changed and m.get('reel_order') == order and os.path.exists(SCREEN): print('nothing new'); save(MAN, m); return
    tmp = {k: '%s/reel-%s.mp4' % (WORK, k) for k in VARIANTS}
    for k in VARIANTS: concat(['%s/%s-%s.mp4' % (WORK, i, k) for i in order], tmp[k])
    hsh = md5(tmp['720'])[:10]; old = load(SCREEN, {})
    names = {'720': 'reel-%s.mp4' % hsh, '360': 'reel-%s-lite.mp4' % hsh}
    for k in VARIANTS: os.replace(tmp[k], '%s/%s' % (OUT, names[k]))
    for o in [old.get('main'), old.get('lite')]:   # old reels leave the repo (Drive sources are never touched)
        if o and os.path.basename(o) not in names.values() and os.path.exists(REPO + '/' + o): sh('git', '-C', REPO, 'rm', '-q', o)
    D = probe('%s/%s' % (OUT, names['720']))[0]; t = 0; clips = []
    for n, i in enumerate(order, 1):
        c = m['clips'][i]; d = c['duration']; clips.append({'n': n, 'title': 'Clip %d' % n, 'drive_title': c['drive_title'], 'drive_id': i, 'start': round(t, 3), 'dur': d}); t += d
    sz = {k: os.path.getsize('%s/%s' % (OUT, names[k])) for k in VARIANTS}
    scr = {'epoch': EPOCH, 'duration': round(D, 3), 'main': 'video/drivein/' + names['720'], 'lite': 'video/drivein/' + names['360'], 'sizes': {'main': sz['720'], 'lite': sz['360']},
           'pages_ok': all(v < PAGES_LIMIT for v in sz.values()), 'clips': clips, 'folder': 'My Drive/Matt Ready Library/videos on loop', 'updated': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    save(SCREEN, scr); m['reel_order'] = order; m['reel'] = scr['main']; m['pending_deploy'] = ['video/drivein/screen.json', scr['main'], scr['lite']]; save(MAN, m)
    sh('git', '-C', REPO, 'add', 'video/drivein'); r = sh('git', '-C', REPO, 'commit', '-q', '-m', 'video-sync: drive-in reel %s (%d clips, %.1f s) from Drive "videos on loop"' % (hsh, len(order), D))
    print('REEL  %s  %.1f s  main %.1f MB  lite %.1f MB  pages_ok=%s  %s' % (names['720'], D, sz['720'] / 1e6, sz['360'] / 1e6, scr['pages_ok'], (r.stdout + r.stderr).strip()))

def c_status(a):
    m = man(); print(json.dumps({k: (v['drive_title'], v.get('status'), v['duration']) for k, v in m['clips'].items()}, indent=1)); print(json.dumps(load(SCREEN), indent=1))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest='cmd', required=True)
    for n in ('plan', 'apply'): p = sp.add_parser(n); p.add_argument('--listing', nargs='+', required=True)
    sp.add_parser('status'); a = ap.parse_args(); {'plan': c_plan, 'apply': c_apply, 'status': c_status}[a.cmd](a)
