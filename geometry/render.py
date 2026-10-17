"""Quick renders: /workspace/geometry-globe.png (two orthographic hemispheres: Port Townsend side + antipode side, continents + vortex
great circles) and /workspace/geometry-pt.png (Port Townsend shoreline, local metres, 12 vortex half-lines + 300 m wedge fills)."""
import json, os, sys, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Wedge
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sphere as S, vortex as V
G = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(G)
cont = json.load(open(os.path.join(G, 'continents.geojson'))); pt = json.load(open(os.path.join(G, 'pt-shoreline.geojson')))
def ortho(P, la0, lo0):
    E, N, U = S.enu_basis(la0, lo0); return P @ E, P @ N, P @ U
def plot_poly(ax, P, la0, lo0, **kw):
    x, y, z = ortho(P, la0, lo0); x = np.where(z > 0, x, np.nan); y = np.where(z > 0, y, np.nan); ax.plot(x, y, **kw)
fig, axs = plt.subplots(1, 2, figsize=(16, 8), facecolor='#020814')
for ax, (la0, lo0, title) in zip(axs, [(35, -115, 'Port Townsend hemisphere'), (-35, 65, 'Antipode hemisphere')]):
    ax.set_facecolor('#020814'); ax.add_patch(plt.Circle((0, 0), 1, color='#08223f')); ax.add_patch(plt.Circle((0, 0), 1, fill=False, color='#4aa8ff', lw=1))
    for k in range(-80, 81, 20): plot_poly(ax, S.small_circle(90, 0, (90 - k) * S.D * S.R, 180), la0, lo0, color='#1c3c66', lw=.4)
    for k in range(0, 360, 30): plot_poly(ax, S.ll2v(np.linspace(-90, 90, 181), np.full(181, k)), la0, lo0, color='#1c3c66', lw=.4)
    for f in cont['features']:
        polys = f['geometry']['coordinates']
        for poly in polys:
            a = np.asarray(poly[0]); plot_poly(ax, S.ll2v(a[:, 1], a[:, 0]), la0, lo0, color='#9ff0c8' if 'ice' not in f['properties']['id'] else '#d8f4ff', lw=.7)
    for t in V.table():
        for k in range(6):
            s = np.linspace(0, 2 * np.pi, 721); P = S.gc_point(t['lat'], t['lon'], k * 30, s); plot_poly(ax, P, la0, lo0, color=t['color'], lw=1.1, alpha=.8)
        for (a, o, mk) in [(t['lat'], t['lon'], 'o'), (*t['antipode_latlon'], 'x')]:
            x, y, z = ortho(S.ll2v(a, o), la0, lo0)
            if z > 0: ax.plot(x, y, mk, color=t['color'], ms=9, mew=2)
    ax.set_xlim(-1.05, 1.05); ax.set_ylim(-1.05, 1.05); ax.set_aspect('equal'); ax.axis('off')
    ax.set_title(f'{title} (orthographic, centre {la0},{lo0})', color='w')
fig.suptitle("Live Geometry v1.0 - sphere R = 6,371,000 m: continents (Natural Earth 1:50m) + 6 great circles per vortex (12 half-lines, meeting at antipode x)", color='w')
fig.text(.5, .02, 'Vortices: Ready Athletics (gold), Cappy\'s pillar (green), Meditation Garden (purple) - at globe scale the three sets coincide (centres 2.4 km apart). Antipodes ~(-48.12, 57.20) south of Madagascar/Kerguelen gap, Indian Ocean.', color='#ccc', ha='center')
plt.savefig('/workspace/geometry-globe.png', dpi=110, facecolor=fig.get_facecolor()); plt.close()

# ---------- PT zoom (local ENU metres around lat0/lon0, exact sphere ENU)
la0, lo0 = 48.117, -122.785
def L(lat, lon): e = S.to_enu(np.asarray(lat), np.asarray(lon), 0, la0, lo0); return e[..., 0], e[..., 1]
fig, ax = plt.subplots(figsize=(13, 13), facecolor='#020814'); ax.set_facecolor('#06182c')
for f in pt['features']:
    k = f['properties']['kind']; g = f['geometry']
    if g['type'] == 'LineString': a = np.asarray(g['coordinates']); ax.plot(*L(a[:, 1], a[:, 0]), color='#7fe8ff', lw=1.3)
    elif g['type'] == 'Polygon': a = np.asarray(g['coordinates'][0]); ax.fill(*L(a[:, 1], a[:, 0]), color='#3a7bd5' if k == 'lagoon' else '#9ab', alpha=.6, lw=.4)
    elif k == 'label': x, y = L(g['coordinates'][1], g['coordinates'][0]); ax.text(x, y, f['properties']['name'], color='#bfe', fontsize=8)
tr = json.load(open(os.path.join(ROOT, 'trails.json')))
for key, col in [('cappy', '#6dffc0'), ('ra', '#ffe070')]:
    for w in tr[key]: a = np.asarray(w['pts']); ax.plot(*L(a[:, 0], a[:, 1]), color=col, lw=1.6)
a = np.asarray(tr['cappy_outline']); ax.plot(*L(a[:, 0], a[:, 1]), color='#30ff60', lw=1.2, ls='--')
for t in V.table():
    cx, cy = L(t['lat'], t['lon'])
    for k in range(12):
        d = np.linspace(0, 12000, 200); la, lo = S.destination(t['lat'], t['lon'], k * 30, d); ax.plot(*L(la, lo), color=t['color'], lw=.8, alpha=.75)
        ax.add_patch(Wedge((cx, cy), V.FILL_R, 90 - (k + 1) * 30, 90 - k * 30, color=V.WEDGE_COLS[k], alpha=.35, lw=0))
    ax.plot(cx, cy, 'o', color=t['color'], ms=7, mec='w')
ax.text(*L(48.11035, -122.80591), '  Ready Athletics Vortex', color='#ffc800', fontsize=10)
ax.text(*L(48.13165, -122.79921), "  Cappy's pillar + Meditation Garden vortex (1.5 m apart)", color='#c9a0ff', fontsize=10)
for n, la, lo in [("Memory's Vault", 48.1384642, -122.7647029), ('City Hall', 48.1161771, -122.753612), ('Jefferson Healthcare', 48.1060007, -122.7889962), ('Masonic Lodge', 48.1139683, -122.7628233)]:
    x, y = L(la, lo); ax.plot(x, y, 's', color='#ff9', ms=5); ax.text(x, y, '  ' + n, color='#ff9', fontsize=8)
e = json.load(open(os.path.join(G, 'record.json'))) if os.path.exists(os.path.join(G, 'record.json')) else None
x, y = L(48.100386, -122.81329); ax.plot(x, y, '*', color='#9cf', ms=12); ax.text(x, y, '  edge-ring anchor (12 edge marker bots, r 7 m)', color='#9cf', fontsize=8)
pj = os.path.join(ROOT, 'pillars.json')
if os.path.exists(pj):
    P = json.load(open(pj)); P = P.get('pillars', P) if isinstance(P, dict) else P
    xy = np.array([L(p['lat'], p['lon']) for p in P if 'lat' in p]); 
    if len(xy): ax.plot(xy[:, 0], xy[:, 1], '^', color='#e0a0ff', ms=4, label=f'{len(xy)} Matt Ready prism pillars (d44)'); ax.legend(loc='lower left')
ax.set_xlim(-6500, 6500); ax.set_ylim(-7000, 6000); ax.set_aspect('equal'); ax.tick_params(colors='#9ab'); ax.grid(color='#123', lw=.5)
ax.set_xlabel('East (m, exact sphere ENU from 48.117,-122.785)', color='#9ab'); ax.set_ylabel('North (m)', color='#9ab')
ax.set_title("Port Townsend shoreline (OSM, ODbL) + vortex half-lines (great circles) + 300 m wedge fills - Live Geometry v1.0", color='w')
plt.savefig('/workspace/geometry-pt.png', dpi=100, facecolor=fig.get_facecolor()); plt.close(); print('ok')
