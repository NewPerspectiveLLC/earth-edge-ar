# tour_terrain_olympic.py (d58): builds tour-terrain.json — green land over the Olympic Peninsula + Quimper.
# Elevation: AWS Terrain Tiles Terrarium z11 (public). Resampled ~650 m (240 x 160), peninsula/Hood-Canal-west clip,
# connected component containing downtown Port Townsend. Cache: /workspace/dem-olympic.
# Usage (repo root): python3 tools/tour_terrain_olympic.py
import json, math, os, urllib.request, time
import numpy as np
from PIL import Image
from scipy import ndimage

Z = 11
S, N, W, E = 47.34, 48.195, -124.78, -122.60
ny, nx = 160, 240
CACHE = os.environ.get('EEAR_DEM_CACHE', '/workspace/dem-olympic')
os.makedirs(CACHE, exist_ok=True)

def tile_xy(lat, lon, z=Z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

x0, y0 = tile_xy(N, W); x1, y1 = tile_xy(S, E)
tx0, tx1 = int(math.floor(min(x0, x1))), int(math.floor(max(x0, x1)))
ty0, ty1 = int(math.floor(min(y0, y1))), int(math.floor(max(y0, y1)))
tiles = {}
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        path = f'{CACHE}/{Z}_{tx}_{ty}.png'
        if not os.path.isfile(path):
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png'
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(url, timeout=40) as r:
                        open(path, 'wb').write(r.read())
                    break
                except Exception as e:
                    print('retry', tx, ty, e); time.sleep(1.2 * (attempt + 1))
            else:
                raise RuntimeError('failed ' + url)
        tiles[(tx, ty)] = np.asarray(Image.open(path).convert('RGB'), dtype=np.uint16)

def dem(lat, lon):
    x, y = tile_xy(lat, lon)
    tx, ty = int(math.floor(x)), int(math.floor(y))
    if (tx, ty) not in tiles: return -32768.0
    im = tiles[(tx, ty)]
    px, py = (x - tx) * 256, (y - ty) * 256
    x0 = min(255, max(0, int(math.floor(px)))); y0 = min(255, max(0, int(math.floor(py))))
    x1 = min(255, x0 + 1); y1 = min(255, y0 + 1)
    fx, fy = px - x0, py - y0
    def h(ix, iy):
        r, g, b = im[iy, ix]
        return r * 256.0 + g + b / 256.0 - 32768.0
    return (h(x0, y0) * (1 - fx) + h(x1, y0) * fx) * (1 - fy) + (h(x0, y1) * (1 - fx) + h(x1, y1) * fx) * fy

def east_limit(lat):
    if lat >= 48.05: return -122.605
    if lat >= 47.95: return -122.72
    if lat >= 47.80: return -122.80
    if lat >= 47.60: return -122.90
    if lat >= 47.45: return -123.00
    return -123.05

lats = np.linspace(N, S, ny); lons = np.linspace(W, E, nx)
H = np.zeros((ny, nx), np.float32); L = np.zeros((ny, nx), bool)
for j, la in enumerate(lats):
    el = east_limit(la)
    for i, lo in enumerate(lons):
        if lo > el: continue
        h = dem(la, lo)
        if 0.5 < h < 5000:
            L[j, i] = True; H[j, i] = h
lab, _ = ndimage.label(L)
cj = int(round((N - 48.1162) / (N - S) * (ny - 1))); ci = int(round((-122.7536 - W) / (E - W) * (nx - 1)))
best = None
for dj in range(-5, 6):
    for di in range(-5, 6):
        jj, ii = cj + dj, ci + di
        if 0 <= jj < ny and 0 <= ii < nx and lab[jj, ii]:
            d = dj * dj + di * di
            if best is None or d < best[0]: best = (d, lab[jj, ii])
if not best: raise SystemExit('no land near PT seed')
L = lab == best[1]
Hs = ndimage.gaussian_filter(np.where(L, H, 0), 0.7)
H = np.where(L, np.maximum(Hs, 1.0), 0)
out = {'_src': 'Elevation: AWS Terrain Tiles (Terrarium z11, public; USGS 3DEP/SRTM derived), resampled ~650 m over the Olympic Peninsula + Quimper, smoothed. Land = h>0.5 m inside peninsula/Hood-Canal-west clip, connected component containing downtown Port Townsend.',
       'bbox': [S, W, N, E], 'nx': int(nx), 'ny': int(ny), 'rowsFromNorth': True,
       'h': [int(round(v)) if l else -1 for v, l in zip(H.ravel(), L.ravel())]}
json.dump(out, open('tour-terrain.json', 'w'), separators=(',', ':'))
print('terrain', nx, ny, 'land', int(L.sum()), 'max h', float(H.max()))
