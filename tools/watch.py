#!/usr/bin/env python3
"""Matt's Reality (Live Geometry) - read-only GM watcher (does NOT join the game, never appears as a player).

  python3 tools/watch.py                    # one snapshot table
  python3 tools/watch.py --follow           # live, re-polls every 3 s (--every N); add --sse for the SSE stream on the LAN
  python3 tools/watch.py --png out.png      # also render a map snapshot
  python3 tools/watch.py --json             # raw JSON
Options: --url BASE (default: the live tunnel, or $EEAR_URL)  --window SEC  --all (include players who left)
Key: read from /home/box/agent-data/secrets/earth-edge-ar-gm-key.txt (or $EEAR_GM_KEY_FILE); sent only as the X-GM-Key header, never printed.
"""
import argparse, json, math, os, sys, time, io, datetime, urllib.request, ssl

KEYFILE = os.environ.get('EEAR_GM_KEY_FILE', '/home/box/agent-data/secrets/earth-edge-ar-gm-key.txt')
DEFAULT_URL = os.environ.get('EEAR_URL', 'https://fiction-annotation-wash-winston.trycloudflare.com')
RA = (48.1062, -122.8057)
LANDMARKS = [("Ready Athletics", 48.1062, -122.8057), ("Cappy's Trails garden", 48.13165, -122.79921),
             ("Matt's Meditation Garden", 48.1316475, -122.7992293), ("Memory's Vault, Fort Worden", 48.1384642, -122.7647029),
             ("PT City Hall", 48.1161771, -122.753612), ("Jefferson County Sheriff", 48.0241638, -122.764488),
             ("Jefferson Healthcare Hospital", 48.1060007, -122.7889962), ("Masonic Lodge No. 6", 48.1139683, -122.7628233)]
PT_TZ = datetime.timezone(datetime.timedelta(hours=-7), 'PT')  # PDT; good until Nov 1 2026

def key():
    with open(KEYFILE) as f: return f.read().strip()

def req(url, stream=False):
    r = urllib.request.Request(url, headers={'X-GM-Key': key(), 'User-Agent': 'eear-watch/1', 'Accept': 'text/event-stream' if stream else 'application/json'})
    ctx = ssl.create_default_context()
    if '192.168.' in url or 'localhost' in url or '127.0.0.1' in url: ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE  # Monster self-signed LAN cert
    return urllib.request.urlopen(r, timeout=None if stream else 20, context=ctx)

def dist_bear(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = 2 * 6371000 * math.asin(math.sqrt(math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2))
    br = (math.degrees(math.atan2(math.sin(lo2-lo1)*math.cos(la2), math.cos(la1)*math.sin(la2)-math.sin(la1)*math.cos(la2)*math.cos(lo2-lo1))) + 360) % 360
    return d, br

def compass(b): return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][int((b+11.25)//22.5) % 16]
def fmt_d(m): return f"{m:.0f} m" if m < 1000 else f"{m/1000:.2f} km"
def age(s): return f"{s}s" if s < 120 else (f"{s//60}m" if s < 7200 else f"{s//3600}h")

def table(snap):
    t = datetime.datetime.fromtimestamp(snap['server_time']/1000, PT_TZ).strftime('%Y-%m-%d %H:%M:%S PT')
    out = [f"Matt's Reality live: {snap['count']} player(s) seen in last {snap['window_ms']//1000}s - server time {t}"]
    hdr = f"{'name':<16}{'game/team':<20}{'lat, lon':<24}{'acc':>6}{'hdg':>6}  {'from Ready Athletics':<22}{'nearest landmark':<40}{'seen':>6}  flags"
    out += [hdr, '-'*len(hdr)]
    for p in sorted(snap['players'], key=lambda p: p['last_seen_age_s']):
        gt = (p['game'].get('code') or '?') + ('/' + p['team']['name'] if p.get('team') else '')
        fl = ','.join(x for x, on in (('STEALTH', p['stealth']), ('dummy', p.get('dummy')), ('left', not p['live'])) if on)
        if p['lat'] is None:
            out.append(f"{p['name'][:15]:<16}{gt[:19]:<20}{'(no fix yet)':<24}{'':>6}{'':>6}  {'':<22}{'':<40}{age(p['last_seen_age_s']):>6}  {fl}"); continue
        d, b = dist_bear(RA, (p['lat'], p['lon']))
        nl = min(((dist_bear((la, lo), (p['lat'], p['lon']))[0], n) for n, la, lo in LANDMARKS))
        hd = '' if p['heading'] is None else f"{p['heading']:.0f}"
        out.append(f"{p['name'][:15]:<16}{gt[:19]:<20}{p['lat']:.6f}, {p['lon']:.6f}  {p['accuracy'] or 0:>5.0f}m{hd:>6}  "
                   f"{fmt_d(d)+' '+f'{b:.0f}° '+compass(b):<22}{(nl[1][:28]+' ('+fmt_d(nl[0])+')'):<40}{age(p['last_seen_age_s']):>6}  {fl}")
    return '\n'.join(out)

# ---- PNG map (OSM tiles, falls back to a plain background if tiles can't load)
def png(snap, path, size=900):
    from PIL import Image, ImageDraw, ImageFont
    pts = [(p['lat'], p['lon']) for p in snap['players'] if p['lat'] is not None] + [(la, lo) for _, la, lo in LANDMARKS if abs(la-RA[0]) < .05]
    la0, la1 = min(p[0] for p in pts), max(p[0] for p in pts); lo0, lo1 = min(p[1] for p in pts), max(p[1] for p in pts)
    def merc(la, lo, z): n = 2**z*256; return ((lo+180)/360*n, (1-math.log(math.tan(math.radians(la))+1/math.cos(math.radians(la)))/math.pi)/2*n)
    z = 18
    while z > 3:
        x0, y1 = merc(la0, lo0, z); x1, y0 = merc(la1, lo1, z)
        if x1-x0 < size*.8 and y1-y0 < size*.8: break
        z -= 1
    cx, cy = (x0+x1)/2, (y0+y1)/2; ox, oy = cx-size/2, cy-size/2
    img = Image.new('RGB', (size, size), (30, 34, 40)); tiles_ok = 0
    for tx in range(int(ox//256), int((ox+size)//256)+1):
        for ty in range(int(oy//256), int((oy+size)//256)+1):
            try:
                r = urllib.request.urlopen(urllib.request.Request(f'https://tile.openstreetmap.org/{z}/{tx}/{ty}.png', headers={'User-Agent': 'EarthEdgeAR-watch/1 (NewPerspectiveLLC)'}), timeout=10)
                img.paste(Image.open(io.BytesIO(r.read())).convert('RGB'), (int(tx*256-ox), int(ty*256-oy))); tiles_ok += 1
            except Exception: pass
    d = ImageDraw.Draw(img)
    try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
    except Exception: F = ImageFont.load_default()
    P = lambda la, lo: (merc(la, lo, z)[0]-ox, merc(la, lo, z)[1]-oy)
    def tag(x, y, s, col): w = d.textlength(s, font=F); d.rectangle([x+8, y-10, x+14+w, y+10], fill=(0, 0, 0)); d.text((x+11, y-9), s, fill=col, font=F)
    for n, la, lo in LANDMARKS:
        x, y = P(la, lo)
        if 0 <= x < size and 0 <= y < size: d.rectangle([x-5, y-5, x+5, y+5], fill=(255, 200, 0), outline=(0, 0, 0)); tag(x, y, n, (255, 220, 120))
    mpp = 156543.03*math.cos(math.radians(RA[0]))/2**z
    for p in snap['players']:
        if p['lat'] is None: continue
        x, y = P(p['lat'], p['lon']); col = (160, 160, 160) if p['stealth'] else ((255, 64, 200) if not p.get('team') else tuple(int(p['team']['color'][i:i+2], 16) for i in (1, 3, 5)))
        ar = (p['accuracy'] or 0)/mpp
        if ar > 3: d.ellipse([x-ar, y-ar, x+ar, y+ar], outline=col, width=2)
        if p['heading'] is not None:
            h = math.radians(p['heading']); d.line([x, y, x+28*math.sin(h), y-28*math.cos(h)], fill=col, width=4)
        d.ellipse([x-8, y-8, x+8, y+8], fill=col, outline=(255, 255, 255), width=2)
        tag(x, y, f"{p['name']} ({age(p['last_seen_age_s'])}{', stealth' if p['stealth'] else ''})", (255, 255, 255))
    t = datetime.datetime.fromtimestamp(snap['server_time']/1000, PT_TZ).strftime('%Y-%m-%d %H:%M:%S PT')
    d.rectangle([0, size-24, size, size], fill=(0, 0, 0)); d.text((8, size-21), f"Matt's Reality GM watch - {snap['count']} player(s) - {t}" + ('  -  map © OpenStreetMap contributors' if tiles_ok else '  (map tiles unavailable)'), fill=(255, 255, 255), font=F)
    img.save(path); return path

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--url', default=DEFAULT_URL); ap.add_argument('--window', type=int, default=60, help='seconds (default 60 = live)')
    ap.add_argument('--all', action='store_true'); ap.add_argument('--json', action='store_true'); ap.add_argument('--png')
    ap.add_argument('--follow', action='store_true', help='live: re-poll every --every seconds'); ap.add_argument('--sse', action='store_true', help='with --follow: use the SSE stream instead (LAN only; the quick tunnel buffers it)'); ap.add_argument('--every', type=int, default=3)
    a = ap.parse_args(); base = a.url.rstrip('/'); qs = f"window={a.window*1000}" + ('&all=1' if a.all else '')
    def show(s):
        print(json.dumps(s, indent=1) if a.json else table(s), flush=True)
        if a.png: print('PNG:', png(s, a.png), flush=True)
    try:
        if not a.follow: return show(json.load(req(f"{base}/api/gm/snapshot?{qs}")))
        if not a.sse:  # poll (works through the Cloudflare quick tunnel, which buffers SSE)
            while True:
                s = json.load(req(f"{base}/api/gm/snapshot?{qs}"))
                if not a.json: print('\033[2J\033[H', end='')
                show(s); time.sleep(max(1, a.every))
        r = req(f"{base}/api/gm/stream?{qs}&every={a.every*1000}", stream=True); buf = ''
        for raw in r:
            line = raw.decode().rstrip('\n')
            if line.startswith('data: '): buf += line[6:]
            elif line == '' and buf:
                if not a.json: print('\033[2J\033[H', end='')
                show(json.loads(buf)); buf = ''
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()[:200]}")
    except KeyboardInterrupt: pass

if __name__ == '__main__': main()
