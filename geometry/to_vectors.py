"""Convert geometry/continents.geojson + geometry/pt-shoreline.geojson to sphere unit vectors v = (cos lat cos lon, cos lat sin lon, sin lat).
Writes geometry/vectors/<name>.f32 (little-endian float32 x,y,z triples, all rings concatenated) + geometry/vectors/index.json
(per ring: feature id/kind, offset, count). Multiply by R = 6371000 m for ECEF metres. Usage: python3 geometry/to_vectors.py"""
import json, os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sphere import ll2v
G = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(G, 'vectors'); os.makedirs(OUT, exist_ok=True)
def rings(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'Point': return [[c]]
    if t == 'LineString': return [c]
    if t in ('Polygon', 'MultiLineString'): return c
    if t == 'MultiPolygon': return [r for p in c for r in p]
    return []
index = {}
for name in ['continents', 'pt-shoreline']:
    fc = json.load(open(os.path.join(G, name + '.geojson'))); bufs = []; ent = []; off = 0
    for f in fc['features']:
        for r in rings(f['geometry']):
            a = np.asarray(r, float); v = ll2v(a[:, 1], a[:, 0]).astype('<f4'); bufs.append(v)
            ent.append({'id': f['properties'].get('id') or f['properties'].get('kind'), 'offset': off, 'count': len(v)}); off += len(v)
    np.concatenate(bufs).tofile(os.path.join(OUT, name + '.f32')); index[name] = {'vertices': off, 'rings': ent}
    # self-check: back-convert max error
    V = np.concatenate(bufs).astype(float); print(name, off, 'vertices', 'max |v|-1 =', float(np.abs(np.linalg.norm(V, axis=1) - 1).max()))
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
