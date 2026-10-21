# tour_data.py (d54): builds tour-terrain.json (green land surface for tour.html) + tour-roads.json (c.1850s dirt roads).
# Terrain: AWS Terrain Tiles (Terrarium, z13; Mapzen/USGS 3DEP-derived, public) resampled to ~100 m, land = ocean-mask.png (OSM coastline) == 0,
#          only the land component connected to downtown Port Townsend (Quimper Peninsula and south), lightly smoothed. Heights in metres (int).
# Roads:   OSM (ODbL) via Overpass, modern alignments used as stand-ins for streets/roads documented in the 1856 plat and the 1858 Port Discovery road.
import json, math, sys, numpy as np
from PIL import Image
from scipy import ndimage
DEM = '/workspace/dem/m.npy'; z, tx0, ty0 = map(int, open('/workspace/dem/meta.txt').read().split())
M = np.load(DEM)
def dem(lat, lon):
    n = 2 ** z; x = (lon + 180) / 360 * n * 256 - tx0 * 256; y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n * 256 - ty0 * 256
    return ndimage.map_coordinates(M, [[y], [x]], order=1)[0]
C = json.load(open('coast.json')); S0, W0, N0, E0 = C['bbox']; mk = np.array(Image.open('ocean-mask.png')) > 127; P = mk.shape[0]
def water(lat, lon):
    x = (lon - W0) / (E0 - W0) * (P - 1); y = (N0 - lat) / (N0 - S0) * (P - 1); return mk[int(round(y)), int(round(x))]
S, N, W, E = 48.045, 48.155, -122.90, -122.735
ny, nx = 124, 124
lats = np.linspace(N, S, ny); lons = np.linspace(W, E, nx)
H = np.zeros((ny, nx)); L = np.zeros((ny, nx), bool)
for j, la in enumerate(lats):
    for i, lo in enumerate(lons):
        L[j, i] = not water(la, lo); H[j, i] = dem(la, lo)
lab, n = ndimage.label(L); cj = int(round((N - 48.1161771) / (N - S) * (ny - 1))); ci = int(round((-122.753612 - W) / (E - W) * (nx - 1)))
# downtown cell may sit on the shore line; take the label of the nearest land cell
best = None
for dj in range(-3, 4):
    for di in range(-3, 4):
        if lab[cj + dj, ci + di] and (best is None or dj * dj + di * di < best[0]): best = (dj * dj + di * di, lab[cj + dj, ci + di])
L = lab == best[1]
H = np.clip(ndimage.gaussian_filter(np.where(L, H, 0), .8), 0, None); H = np.where(L, np.maximum(H, 1.0), 0)
out = {'_src': 'Elevation: AWS Terrain Tiles (Terrarium z13, public; USGS 3DEP/SRTM derived), resampled ~100 m, smoothed. Land mask: ocean-mask.png from OSM coastline (ODbL). Only the land connected to downtown Port Townsend.',
       'bbox': [S, W, N, E], 'nx': nx, 'ny': ny, 'rowsFromNorth': True, 'h': [int(round(v)) if l else -1 for v, l in zip(H.ravel(), L.ravel())]}
json.dump(out, open('tour-terrain.json', 'w'), separators=(',', ':'))
print('terrain', nx, ny, 'land cells', int(L.sum()), 'max h', H.max())
# ---- roads
R = json.load(open('/workspace/roads.json'))['elements']
def ways(name, keep=lambda la, lo: True):
    out = []
    for e in R:
        if e['tags'].get('name') != name: continue
        seg = []
        for p in e['geometry']:
            if keep(p['lat'], p['lon']): seg.append([round(p['lat'], 6), round(p['lon'], 6)])
            else:
                if len(seg) > 1: out.append(seg)
                seg = []
        if len(seg) > 1: out.append(seg)
    return out
town = lambda la, lo: lo > -122.7685          # 1856 plat: the waterfront + plateau east of the Kearney St marsh edge
bluff = lambda la, lo: lo > -122.7685 and la < 48.1190
roads = [
  {'name': 'Water Street', 'year': '1856 plat', 'basis': "1856 plat: 'Water Street, the one road on dry land, became the main commercial avenue' (NRHP Port Townsend Historic District nomination; HistoryLink 10752).", 'approx': False, 'w': 14, 'lines': ways('Water Street', town)},
  {'name': 'Washington Street (bluff edge)', 'year': '1856 plat', 'basis': '1856 plat: grid of square blocks on the plateau directly behind the beach, parallel to the waterfront (NRHP nomination). Modern OSM alignment inside the old town.', 'approx': False, 'w': 9, 'lines': ways('Washington Street', town)},
  {'name': 'Jefferson Street', 'year': '1856 plat', 'basis': '1856 plat plateau grid (NRHP nomination). Modern OSM alignment.', 'approx': False, 'w': 9, 'lines': ways('Jefferson Street', town)},
  {'name': 'Lawrence Street (uptown)', 'year': '1856 plat', 'basis': 'Plateau grid; uptown shopping street at Lawrence & Tyler (NRHP nomination; 1871 Port Discovery road plat shows Lawrence x Tyler).', 'approx': False, 'w': 10, 'lines': ways('Lawrence Street', town)},
  {'name': 'Taylor Street (waterfront to bluff)', 'year': '1856 plat', 'basis': 'Cross street of the plat linking Water St to the plateau; the climb itself is APPROXIMATE (the bluff route of the 1850s is not surveyed in a source I found).', 'approx': True, 'w': 9, 'lines': ways('Taylor Street', bluff)},
  {'name': 'Tyler Street (uptown cross street)', 'year': '1856 plat / 1871', 'basis': "1871 'Map, Port Discovery Bay road, Plat No. 1' shows Lawrence x Tyler (DPLA / Northwest Digital Heritage).", 'approx': True, 'w': 9, 'lines': ways('Tyler Street', bluff)},
  {'name': 'Port Discovery road (to Discovery Bay)', 'year': '1858', 'basis': "First road across the Quimper Peninsula, built after the 1858 Port Discovery sawmill (NRHP nomination; 1871 county 'Port Discovery road' plat). Modern Discovery Road used as the stand-in alignment: APPROXIMATE.", 'approx': True, 'w': 10, 'lines': ways('Discovery Road')},
]
# link: west end of Lawrence St (uptown) -> east end of Discovery Road (straight connector, APPROXIMATE)
law = [p for s in roads[3]['lines'] for p in s]; dsc = [p for s in roads[6]['lines'] for p in s]
a = min(law, key=lambda p: p[1]); b = max(dsc, key=lambda p: p[1])
roads.append({'name': 'Town to Port Discovery road link', 'year': 'c.1858', 'basis': 'Straight connector from the west end of the platted town (Lawrence St) to the start of the Discovery Road alignment: APPROXIMATE, no surveyed 1850s line found.', 'approx': True, 'w': 9, 'lines': [[a, b]]})
json.dump({'_src': 'Alignments: OpenStreetMap contributors (ODbL) via Overpass (2026-10-21). Historic basis per road in "basis".', 'roads': roads}, open('tour-roads.json', 'w'), separators=(',', ':'))
for r in roads: print(r['name'], len(r['lines']), sum(len(s) for s in r['lines']))
print('link', a, b)
