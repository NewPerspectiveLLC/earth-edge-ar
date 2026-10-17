#!/usr/bin/env python3
"""Matt's Reality (Live Geometry) - control the two server-side dummy ghost players (Ghost-1, Ghost-2) via /api/gm/ghost.

  python3 tools/ghosts.py list                          # where they are, their targets, wander on/off
  python3 tools/ghosts.py move Ghost-1 48.11,-122.80    # move to lat,lon (then wanders ~150 m around it)
  python3 tools/ghosts.py move Ghost-2 "Fort Worden"    # move to a landmark/address (app landmarks, else Nominatim, Port Townsend bias)
  python3 tools/ghosts.py move Ghost-1 "City Hall" --hold   # move and hold still
  python3 tools/ghosts.py hold Ghost-1 | wander Ghost-1 # stop / resume wandering in place
Options: --url BASE (default: the live tunnel, or $EEAR_URL)  --json
Key: read from /home/box/agent-data/secrets/earth-edge-ar-gm-key.txt (or $EEAR_GM_KEY_FILE); sent only as X-GM-Key, never printed.
"""
import argparse, json, os, re, sys, ssl, urllib.request, urllib.error, datetime, math

KEYFILE = os.environ.get('EEAR_GM_KEY_FILE', '/home/box/agent-data/secrets/earth-edge-ar-gm-key.txt')
DEFAULT_URL = os.environ.get('EEAR_URL', 'https://verse-concerning-summit-equipped.trycloudflare.com')
RA = (48.11035, -122.80591)
PT_TZ = datetime.timezone(datetime.timedelta(hours=-7), 'PT')

def key():
    with open(KEYFILE) as f: return f.read().strip()

def call(base, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(base.rstrip('/') + '/api/gm/ghost', data=data, method='POST' if data else 'GET',
                               headers={'X-GM-Key': key(), 'content-type': 'application/json', 'User-Agent': 'eear-ghosts/1'})
    ctx = ssl.create_default_context()
    if '192.168.' in base or 'localhost' in base or '127.0.0.1' in base: ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    try:
        return json.load(urllib.request.urlopen(r, timeout=30, context=ctx))
    except urllib.error.HTTPError as e:
        try: msg = json.load(e).get('error')
        except Exception: msg = e.reason
        sys.exit(f"error {e.code}: {msg}")

def dist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    return 2 * 6371000 * math.asin(math.sqrt(math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2))

def show(res, as_json):
    if as_json: print(json.dumps(res, indent=1)); return
    for g in res['ghosts']:
        off = dist((g['lat'], g['lon']), (g['target']['lat'], g['target']['lon']))
        t = datetime.datetime.fromtimestamp(g['updated']/1000, PT_TZ).strftime('%H:%M:%S PT')
        print(f"{g['id']:<8} at {g['lat']:.6f}, {g['lon']:.6f}  ({off:.0f} m from target, {dist(RA,(g['lat'],g['lon'])):.0f} m from Ready Athletics)"
              f"  {'wandering' if g['wander'] else 'holding still'}\n         target: {g['target']['place']}  [{g['target']['lat']:.6f}, {g['target']['lon']:.6f}]  set {t}")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['list', 'move', 'hold', 'wander'])
    ap.add_argument('ghost', nargs='?'); ap.add_argument('where', nargs='*')
    ap.add_argument('--url', default=DEFAULT_URL); ap.add_argument('--hold', action='store_true'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    if a.cmd == 'list': return show(call(a.url), a.json)
    if not a.ghost: sys.exit('which ghost? Ghost-1 or Ghost-2')
    gid = a.ghost if a.ghost.lower().startswith('ghost') else 'Ghost-' + a.ghost
    if a.cmd in ('hold', 'wander'): return show(call(a.url, {'id': gid, 'wander': a.cmd == 'wander'}), a.json)
    where = ' '.join(a.where).strip()
    if not where: sys.exit('move needs "lat,lon" or a place name')
    m = re.fullmatch(r'\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*', where)
    body = {'id': gid, **({'lat': float(m[1]), 'lon': float(m[2])} if m else {'place': where})}
    if a.hold: body['wander'] = False
    show(call(a.url, body), a.json)

if __name__ == '__main__': main()
