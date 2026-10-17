"""Build geometry/continents.geojson and geometry/pt-shoreline.geojson from the app's own vendored data (what the app renders).
Sources: continents.json + landmass.json (Natural Earth 1:50m, public domain), coast.json + shore.json (OpenStreetMap, ODbL).
Run from repo root: python3 geometry/build_data.py"""
import json, os, numpy as np
from shapely.geometry import LineString, MultiLineString, box, Polygon, mapping
from shapely.ops import linemerge
from shapely import set_precision
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); G = os.path.join(ROOT, 'geometry')
J = lambda f: json.load(open(os.path.join(ROOT, f)))
r7 = lambda x: round(x, 7)

def ring_ll2xy(ring):  # [[lat,lon],...] -> [[lon,lat],...] closed
    c = [[r7(b), r7(a)] for a, b in ring]
    if c[0] != c[-1]: c.append(c[0])
    return c

# ---------- continents (exactly the rings the app fills/outlines)
C = J('continents.json'); L = J('landmass.json'); feats = []
NAMES = {'africa': 'Africa', 'north_america': 'North America', 'south_america': 'South America', 'asia': 'Asia', 'europe': 'Europe'}
for k, v in C['continents'].items():
    polys = []
    for rg in v['rings']:
        o = rg['o'] if isinstance(rg, dict) else rg; hs = rg.get('h', []) if isinstance(rg, dict) else []
        polys.append([ring_ll2xy(o)] + [ring_ll2xy(h) for h in hs])
    feats.append({'type': 'Feature', 'properties': {'id': k, 'name': NAMES[k], 'app_file': 'continents.json', 'center_latlon': v['center'], 'area_km2_src': v.get('area_km2'),
                  'source': 'Natural Earth 1:50m admin-0 (public domain), dissolved by continent, DP-simplified 4 km'}, 'geometry': {'type': 'MultiPolygon', 'coordinates': polys}})
for k, rings, src in [('antarctica', [L['rings']['antarctica']], 'Natural Earth 1:50m, DP 4 km'), ('australia', [L['rings']['australia'], L['rings']['tasmania']], 'Natural Earth 1:50m, DP 4 km')]:
    feats.append({'type': 'Feature', 'properties': {'id': k, 'name': k.title(), 'app_file': 'landmass.json', 'source': src + ' (public domain)'},
                  'geometry': {'type': 'MultiPolygon', 'coordinates': [[ring_ll2xy(r)] for r in rings]}})
shel = L.get('shelves') or []
if shel:
    feats.append({'type': 'Feature', 'properties': {'id': 'antarctic_ice_shelves', 'name': 'Antarctic ice shelves', 'app_file': 'landmass.json', 'source': 'Natural Earth 1:50m antarctic_ice_shelves_polys (public domain)'},
                  'geometry': {'type': 'MultiPolygon', 'coordinates': [[ring_ll2xy(r.get('o', r) if isinstance(r, dict) else r)] for r in shel]}})
cont = {'type': 'FeatureCollection', 'name': 'Live Geometry continents v1.0', 'crs_note': 'lon,lat degrees on the sphere R=6371000 m; vertices joined by great-circle arcs',
        'attribution': 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com (public domain)', 'features': feats}
json.dump(cont, open(os.path.join(G, 'continents.geojson'), 'w'), separators=(',', ':'))

# ---------- Port Townsend shoreline: OSM natural=coastline (coast.json, Overpass 2026-10-14) clipped to the Quimper Peninsula box,
# merged into continuous ways, simplified 1.0 m (local metres); plus lagoons + harbour structures from shore.json (full detail)
BB = (48.04, -122.86, 48.17, -122.72)  # S W N E : Quimper Peninsula, Point Hudson, Fort Worden, Kah Tai, Boat Haven, Glen Cove
lat0 = 48.117; kx = 111320 * np.cos(np.radians(lat0)); ky = 111320.0
tox = lambda lat, lon: ((lon - BB[1]) * kx, (lat - BB[0]) * ky)
frx = lambda x, y: (BB[0] + y / ky, BB[1] + x / kx)
coast = J('coast.json'); shore = J('shore.json')
OVP = os.path.join(G, 'src', 'osm-coastline-pt-2026-10-17.json')  # fresh Overpass pull (maps.mail.ru mirror), osm_base 2026-10-17T17:55:26Z
if os.path.exists(OVP):
    ov = json.load(open(OVP)); SRC = f"OSM natural=coastline via Overpass, osm_base {ov['osm3s']['timestamp_osm_base']}, {len(ov['elements'])} ways (geometry/src/osm-coastline-pt-2026-10-17.json)"
    lines = [LineString([tox(n['lat'], n['lon']) for n in e['geometry']]) for e in ov['elements'] if len(e.get('geometry', [])) > 1]
else:
    SRC = f"coast.json (Overpass natural=coastline, fetched 2026-10-14, bbox {coast['bbox']})"
    lines = [LineString([tox(a, b) for a, b in l]) for l in coast['lines'] if len(l) > 1]
clip = box(*tox(BB[0], BB[1]), *tox(BB[2], BB[3]))
m = linemerge([g for l in lines for g in (getattr(l.intersection(clip), 'geoms', None) or [l.intersection(clip)]) if not g.is_empty and g.geom_type == 'LineString'])
parts = list(getattr(m, 'geoms', [m])); raw_pts = sum(len(p.coords) for p in parts)
out = []; npts = 0
for p in sorted(parts, key=lambda g: -g.length):
    s = p.simplify(0.5, preserve_topology=False)
    if s.length < 30: continue
    ll = [[r7(frx(x, y)[1]), r7(frx(x, y)[0])] for x, y in s.coords]; npts += len(ll)
    out.append({'type': 'Feature', 'properties': {'kind': 'coastline', 'length_m': round(p.length, 1), 'closed': ll[0] == ll[-1], 'source': 'OSM natural=coastline'},
                'geometry': {'type': 'LineString', 'coordinates': ll}})
for grp in ['lagoon', 'harbor']:
    for poly in shore[grp]:
        out.append({'type': 'Feature', 'properties': {'kind': grp, 'source': 'OSM (shore.json, full detail)'}, 'geometry': {'type': 'Polygon', 'coordinates': [ring_ll2xy(poly)]}})
for nm, a, b in shore['labels']:
    out.append({'type': 'Feature', 'properties': {'kind': 'label', 'name': nm}, 'geometry': {'type': 'Point', 'coordinates': [b, a]}})
pt = {'type': 'FeatureCollection', 'name': 'Port Townsend shoreline v1.0', 'bbox_SWNE': BB, 'attribution': '© OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright)',
      'process': f'{SRC}; clipped to bbox, line-merged, Douglas-Peucker 0.5 m in local metres; {raw_pts} -> {npts} coastline vertices. Lagoons/harbour polygons: shore.json (OSM, fetched 2026-10-15, full detail)',
      'features': out}
json.dump(pt, open(os.path.join(G, 'pt-shoreline.geojson'), 'w'), separators=(',', ':'))
print('continents', len(feats), sum(len(r) for f in feats for poly in f['geometry']['coordinates'] for r in poly), 'pts')
print('pt coast ways', sum(1 for f in out if f['properties']['kind'] == 'coastline'), 'pts', raw_pts, '->', npts, 'lagoons', len(shore['lagoon']), 'harbor', len(shore['harbor']))
