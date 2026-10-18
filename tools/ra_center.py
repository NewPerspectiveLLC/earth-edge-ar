#!/usr/bin/env python3
"""Ready Athletics vortex centre switch (d49). Reads ../ra-center.json ("use": "pin" | "parcel") and rewrites the RA centre
(lat, lon, and the antipode lat/lon written in the geometry docs) in every listed file from whichever value is currently in them.
Dry run by default; --apply writes. Only exact literals are touched (48.11035 / -122.80591 style, optional trailing zeros,
ASCII or Unicode minus), so other nearby numbers (shoreline, pillars, streets) are never changed. Server BOTS 'Ready Athletics
Keeper', GHOSTS host, GH_LOCAL, index TARGETS (wedges, great circles, pillar, label, Master Map room), quest PLACES/HOME,
daynight SITES (orb tour + night beams), gm.html VX/RA, map defaults and the geometry record all read from those literals."""
import json, os, re, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = json.load(open(os.path.join(R, 'ra-center.json')))
new = C[C['use']]; olds = [C[k] for k in ('pin', 'parcel') if C[k] != new]
def lit(x): s = ('%.7f' % abs(x)).rstrip('0'); return re.escape(s) + r'0*(?!\d)'
def antip(la, lo): return -la, (lo + 180 if lo < 0 else lo - 180)
tot = 0
for f in C['files']:
    p = os.path.join(R, f); s0 = s = open(p, encoding='utf-8').read(); n = 0
    for o in olds:
        pairs = [(o[0], new[0]), (o[1], new[1])]
        a0, a1 = antip(*o), antip(*new); pairs += [(a0[0], a1[0]), (a0[1], a1[1])]
        for ov, nv in pairs:
            rx = re.compile(r'(?<![\d.])' + ('([-\u2212])' if ov < 0 else '()') + lit(ov))
            s, k = rx.subn(lambda m: (m.group(1) if nv < 0 else '') + ('%.7f' % abs(nv)).rstrip('0'), s); n += k
            if ov < 0 and nv >= 0: pass
    tot += n; print('%-28s %3d replacements' % (f, n))
    if n and '--apply' in sys.argv: open(p, 'w', encoding='utf-8').write(s)
print('use=%s -> %s; %d total; %s' % (C['use'], new, tot, 'WRITTEN' if '--apply' in sys.argv else 'dry run (add --apply)'))
