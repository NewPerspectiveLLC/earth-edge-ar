"""Generate geometry/GEOMETRY.md, geometry/HANDOFF.md and geometry/handoff.json from record.json + vortex-table.json.
Run order: build_data.py -> to_vectors.py -> vortex.py -> build_record.py -> render.py -> make_docs.py"""
import json, os, hashlib, sys
G = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(G)
sys.path.insert(0, G)
rec = json.load(open(os.path.join(G, 'record.json'))); vt = json.load(open(os.path.join(G, 'vortex-table.json')))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
O = rec['objects']; by = {}
for o in O: by.setdefault(o['cat'], []).append(o)
def count_pts(p):
    j = json.load(open(p)); n = 0
    def walk(c):
        nonlocal n
        if isinstance(c, list) and c and isinstance(c[0], (int, float)): n += 1
        elif isinstance(c, list): [walk(x) for x in c]
    for f in j['features']: walk(f['geometry']['coordinates'])
    return n, len(j['features'])
DATA = []
for rel, desc, srcv, lic in [
    ('geometry/continents.geojson', 'continent outlines+fills: Africa, North America, South America, Asia, Europe (continents.json) + Antarctica, Australia(+Tasmania), Antarctic ice shelves (landmass.json)', 'Natural Earth 1:50m admin-0 (v5.x), dissolved by continent, Douglas-Peucker 4 km, polygons <300 km2 dropped (as built into the app 2026-10-14/16)', 'public domain (Natural Earth)'),
    ('geometry/pt-shoreline.geojson', 'Port Townsend / Quimper Peninsula coastline (LineStrings) + 3 lagoons + 112 harbour structures (Polygons) + 7 labels (Points); bbox S48.04 W-122.86 N48.17 E-122.72', 'OSM natural=coastline via Overpass, osm_base 2026-10-17T17:55:26Z, DP 0.5 m; lagoons/harbour from shore.json (OSM 2026-10-15, full detail)', 'ODbL 1.0 - (c) OpenStreetMap contributors'),
    ('geometry/src/osm-coastline-pt-2026-10-17.json', 'raw Overpass response (32 ways, 1431 nodes) used for pt-shoreline', 'Overpass API, maps.mail.ru mirror', 'ODbL 1.0'),
    ('geometry/vectors/continents.f32', 'continents.geojson as float32 unit vectors (x,y,z), ring index in vectors/index.json', 'derived', 'public domain'),
    ('geometry/vectors/pt-shoreline.f32', 'pt-shoreline.geojson as float32 unit vectors', 'derived', 'ODbL 1.0'),
    ('trails.json', "trail ways (cappy: 7, ra: 2) [lat,lon] + parcel outlines cappy_outline (998002802), ra_parcel_outline", 'OSM Overpass 2026-10-16 + WA Current_Parcels', 'ODbL / WA public'),
    ('streets.json', 'road paths (Hastings Ave, Water St, Downtown->Fort Worden->North Beach) [lat,lon]', 'OSM', 'ODbL'),
    ('sheridan.json', 'Sheridan St segments [lat,lon]', 'OSM', 'ODbL'),
    ('mountains.json', 'Mount Rainier, Mount Baker heightfields', 'USGS 3DEP via AWS Terrain Tiles', 'public domain'),
    ('coast.json', 'wider OSM coastline used for the ocean mask (bbox 48.01..48.19,-122.915..-122.645)', 'OSM Overpass 2026-10-14', 'ODbL'),
    ('pillars.json', 'd44 Matt Ready prism pillar positions (id, name, kind, area, lat, lon)', 'OSM-derived public spots, 2026-10-17', 'ODbL'),
    ('pillar-matt.jpg', 'pillar texture (see textures)', 'project asset', 'project'),
    ('geometry/vortex-table.json', 'vortex normals / antipodes / wedge tests', 'computed', '-')]:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p): DATA.append({'file': rel, 'status': 'pending'}); continue
    d = {'file': rel, 'bytes': os.path.getsize(p), 'sha256': sha(p), 'content': desc, 'source': srcv, 'license': lic}
    if rel.endswith('.geojson'): d['vertices'], d['features'] = count_pts(p)
    if rel.endswith('.f32'): d['vertices'] = os.path.getsize(p) // 12
    DATA.append(d)
VX = [{'id': v['id'], 'name': v['name'], 'lat': v['lat'], 'lon': v['lon'], 'color': v['color'], 'antipode': v['antipode_latlon'], 'normals_k0_5': [c['normal'] for c in v['great_circles']], 'poles_k0_5': [c['pole_latlon'] for c in v['great_circles']]} for v in vt['vortices']]
TEX = rec['textures']; PM = rec['pillars_meta']
pill = by.get('pillars', [])
EQ = [
 ('R', 'R = 6,371,000 m (all renderers). Distance read-outs in some places use 6,371 km or 6,371.0088 km (<=1.4 ppm). Earth = sphere, heights h are radial.'),
 ('unit vector', 'v(lat,lon) = (cos lat cos lon, cos lat sin lon, sin lat); +X=(0,0), +Y=(0,90E), +Z=North Pole'),
 ('position', 'P = (R + h) v'),
 ('inverse', 'lat = asin(Pz/|P|), lon = atan2(Py, Px), h = |P| - R'),
 ('ENU basis at (lat0,lon0)', 'E = (-sin lon0, cos lon0, 0); N = (-sin lat0 cos lon0, -sin lat0 sin lon0, cos lat0); U = v(lat0,lon0); enu = (E.(P-P0), N.(P-P0), U.(P-P0))'),
 ('scene axes', 'Three.js: x = E, y = U, z = -N (y-up, right-handed). index.html world group: metres*1e-3 (km); local group: metres; quest: metres from HOME (default Ready Athletics or the manual location)'),
 ('flat local map (figures, landmark pillars, streets, pillars)', 'x = (lon-lon0)*111320*cos(lat0), z = -(lat-lat0)*111320, y = -1.6 m (floor); lat0/lon0 = viewer position rounded to 0.001 deg. Exact = ENU above. Error: scale +0.11% (111320 vs R*pi/180 = 111194.9 m/deg) and no drop; 2.8 m at Cappy\'s seen from Ready Athletics (2.4 km), 11.7 m at 10 km.'),
 ('great-circle distance (haversine)', 'd = 2R asin( sqrt( sin^2(dlat/2) + cos lat1 cos lat2 sin^2(dlon/2) ) )'),
 ('initial bearing', 'theta = atan2( sin dlon cos lat2, cos lat1 sin lat2 - sin lat1 cos lat2 cos dlon ) (clockwise from north)'),
 ('destination', 'delta = d/R; lat2 = asin(sin lat1 cos delta + cos lat1 sin delta cos theta); lon2 = lon1 + atan2(sin theta sin delta cos lat1, cos delta - sin lat1 sin lat2)'),
 ('direction vector', 'd_theta = cos theta N + sin theta E (unit tangent at v)'),
 ('great circle', 'plane through Earth centre {p : p.n = 0}; n = v x d_theta (through v heading theta) or n = (v1 x v2)/|v1 x v2| (through two points)'),
 ('point on great circle', 'p(s) = cos s v + sin s d_theta, s = arc/R in radians, s in [0, 2pi)'),
 ('intersection of two great circles', 'x = +-(n1 x n2)/|n1 x n2|'),
 ('small circle', 'centre c, ground radius r: {p : p.c = cos rho}, rho = r/R; p(t) = cos rho c + sin rho (cos t N + sin t E). App draws a flat tangent-plane circle of radius r (difference: sagitta r^2/2R = 7 mm at 300 m).'),
 ('wedge index (any point on Earth)', 'k = floor( ((theta(c->p) - 0) mod 360) / 30 ), k = 0..11; equivalently lune test p.n(30k) < 0 and p.n(30k+30) > 0 with n(theta) = v x d_theta, n(theta+180) = -n(theta)'),
 ('spherical polygon area', 'A = R^2 |sum_i 2 atan2( c.(a_i x a_i+1), 1 + c.a_i + a_i.a_i+1 + a_i+1.c )|, c = normalised vertex mean (vertices joined by great-circle arcs)'),
 ('point in spherical polygon', 'ray-cast along a great circle from p to a point known outside; or (small polygons) flat test in ENU/azimuthal-equidistant at the polygon centre'),
 ('horizon', 'distance to the geometric horizon for eye height h: d = sqrt(2Rh + h^2) (h = 1.6 m -> 4,515 m; 1.8 m -> 4,789 m; 100 m -> 35.7 km). Ground drop at arc s: R(1 - cos(s/R)) ~ s^2/2R (1 km 7.8 cm, 10 km 7.85 m, 110 km 950 m).'),
 ('past the horizon', 'every world object is placed at its TRUE ENU position (through the planet, negative elevation), drawn with depth test off so it shows through the ground; world great circles skip points < 60 km from the viewer (the 110 km ground half-lines own the near part); Quest projects world points to a 3 km shell along the true direction (direction and angular size preserved). Edge-of-Earth markers sit 90 deg of arc away (10,007.5 km): chord R*sqrt2 = 9,010 km, elevation -45 deg. Antipode: chord 2R = 12,742 km, elevation -90 deg.'),
 ('antipode', 'v_anti = -v: lat_a = -lat, lon_a = lon + 180 (wrapped to [-180,180))'),
 ('azimuthal-equidistant (continent triangulation)', 'c = acos(sin lat0 sin lat + cos lat0 cos lat cos dlon); k = c/sin c; x = k cos lat sin dlon R, y = k (cos lat0 sin lat - sin lat0 cos lat cos dlon) R; earcut there, triangles subdivided to <= 150-250 km, each vertex placed back on the sphere'),
]
# ---------------- handoff.json
GEN = {
 'vortex': {'centres': [{k: v[k] for k in ('id', 'name', 'lat', 'lon', 'color')} for v in VX], 'k': 12, 'step_deg': 30, 'b0_deg': 0,
            'half_lines': 'for k in 0..11: theta=30k; p(s)=cos s v + sin s d_theta, s in [0, 110 km / R] (ground) ; full circles k=0..5 s in [0,2pi) (world)',
            'wedge_fill': 'sector bearings [30k, 30k+30), radius 300 m, colour WEDGE_COLS[k], alpha (1 - smoothstep(.15,1,r/300))*.2', 'WEDGE_COLS': ['#ff3b30', '#ff9500', '#ffcc00', '#9be22d', '#34c759', '#00c7be', '#30b0ff', '#007aff', '#5856d6', '#af52de', '#ff2d92', '#ff6482'],
            'pillar': 'open cylinders r 16->9.6 & 6->3.6 h 420 m, ring 10-14 m', 'funnel': '6 arms r(u)=0.6(2+28u^2), y=24u, angle=2pi k/6+6pi u', 'hub': 'white, first 180 m of each half-line', 'antipode_marker': 'rings 150-190 & 260-275 (scene km) at -v', 'normals_and_antipodes': VX},
 'meditation_circle': {'centre': [48.1316475, -122.7992293], 'frame': 'local ENU metres at the centre, bearing b clockwise from north: (E,N) = r (sin b, cos b)',
            'stones': 'n=12, r=3.6, b=30k, centre y=.38+.06(k%3), dodecahedron r .32 stretched y 1.6+.25(k%3), z .8', 'cushions': 'n=12, r=3.02, b=30k, sphere r .25 scaled y .38 at y .1, purple (even k) / teal (odd k)',
            'orbs': 'n=6, r=3.55, b=60k+15, y=1.25 (+-.12 bob), sphere r .07', 'pavers': '12 annular sectors r .95..2.55, edges at b=30k', 'lotus': 'cylinder r .78/.86 h .18 + 24 petals at 15 deg', 'fallback_ring': 'annulus 1..9 m'},
 'edge_ring': {'anchor': [48.100386, -122.81329], 'r_m': 7, 'bots': 'n=12, b=30k: lat = lat0 + 7 cos b/111320, lon = lon0 + 7 sin b/(111320 cos lat0); style lightblue if b%90==0, default if b==330, else plaid', 'note': 'anchor GM-editable at runtime (server bots.json)'},
 'landmarks': {'per_target': 'pillar cylinder r 1.5 h 120; beam r 2.5 h 200; ring 5-7 m; type shape; label y 135; saucer pad at +d E, -d N (d=18, 30 for Ready Athletics, scale 2.2) hovering 22/34 m',
               'targets': [{'name': o['name'].replace(' - pillar', ''), 'lat': o['lat'], 'lon': o['lon'], 'color': o.get('color')} for o in by['landmarks'] if o['id'].endswith('.pillar')]},
 'edge_of_earth': 'for b in (0,90,180,270): point = destination(viewer, b, (pi/2) R); sphere r 150 km (scene) + line from viewer + label; horizon ring 9,990-10,000 km in tangent plane; wireframe globe r 6371 km',
 'lines_to_landmarks': 'segment viewer floor point -> landmark floor point (flat local); Quest: label at the true ENU direction at min(d, 400 m)',
 'far_markers': [{'name': o['name'], 'lat': o['lat'], 'lon': o['lon'], 'shape': o['shape']} for o in by['far']],
 'night': 'at Ready Athletics and Cappy\'s: beams r 3.5 & 1.2 h 1500, ring 1..46 m, halos at y 40/700; trails as 1 m ribbons + 6 m glow; parcel 998002802 outline ribbon .6 m',
 'ren': {k: v for k, v in next(o for o in O if o['id'] == 'ren').items() if k in ('lat', 'lon', 'shape', 'size', 'anchor')},
 'keepers': [{'name': o['name'], 'lat': o['lat'], 'lon': o['lon']} for o in O if o['type'] == 'keeper bot'],
 'pillars': {'shape': 'equilateral triangular prism, side s=0.7 m, circumradius s/sqrt3; parts: plinth (side .826, y 0..0.08), 3 image faces (y .08..1.75), cap (side .742, y 1.75..1.80), ground ring .55..1.1 m',
             'corners_local': 'corner k at angle a_k = 120k deg: (x,z) = (s/sqrt3)(sin a_k, cos a_k), then rotated by yaw about +y; world corner bearing = 180 - yaw - 120k',
             'yaw': 'yaw = FNV1a32(id)/2^32 * 360 deg (h=2166136261; per char: h ^= code; h = h*16777619 mod 2^32)',
             'texture': 'tex.pillar-matt on all 3 faces, u corner k->k+1, v bottom->top', 'visible_within_m': 2500,
             'sound': 'disco-jam loop; gain(d)=1 (d<=3), 0.5(1+cos(pi(d-3)/52)) (3<d<55), 0 (d>=55); nearest 2 voices, shared loop clock, HRTF panner',
             'table_cols': ['id', 'lat', 'lon', 'yaw_deg', 'kind'], 'table': [[o['id'].split('.', 1)[1], o['lat'], o['lon'], o['yaw_deg'], o['kind']] for o in pill]} if pill else 'pending d44',
}
H = {'spec': 'Live Geometry HANDOFF v1.0', 'date': '2026-10-17', 'status': 'locked', 'app': 'Live Geometry (worlds: Matt\'s Reality / Ready Security Services Map 1 / Base Geometry Reality)',
     'sphere': {'R_m': 6371000.0, 'axes': '+X (0,0), +Y (0,90E), +Z north pole', 'angles': 'degrees, bearings clockwise from true north', 'scene': 'x=E, y=U, z=-N'},
     'equations': {k: v for k, v in EQ}, 'generators': GEN, 'textures': TEX,
     'data_files': DATA, 'encoding': 'GeoJSON coordinates are [lon,lat] (RFC 7946); the app JSON files (trails/streets/sheridan/shore/continents/landmass/pillars-as-fields) use [lat,lon]. Decimal degrees, 7 decimals (~1.1 cm). Rings closed (first==last). Consecutive vertices are joined by great-circle arcs (slerp). .f32 = little-endian float32 xyz unit vectors (~0.6 m precision; use float64 from the GeoJSON for sub-metre work).',
     'trails': [{'osm_way': o.get('osm_way'), 'name': o['name'], 'length_m': o['size'].get('length_m_sphere'), 'vertices': o['size'].get('vertices')} for o in by['trails'] if o['type'] == 'trail'],
     'parcels': [{'id': o['id'], 'name': o['name'], 'area_m2': o['size'].get('area_m2_sphere'), 'points_latlon': o['points']} for o in by['trails'] if 'parcel' in o['type']],
     'object_counts': rec['counts_by_category'], 'record': 'geometry/record.json (full per-object list, sha256 below)',
     'excluded': [e['what'] + ': ' + str(e['count']) for e in rec['excluded_human_depictions']]}
H['record_sha256'] = sha(os.path.join(G, 'record.json'))
json.dump(H, open(os.path.join(G, 'handoff.json'), 'w'), indent=1)
# ---------------- HANDOFF.md
L = []; A = L.append
A('# Live Geometry - HANDOFF v1.0 (locked 2026-10-17)\n')
A('Minimal, self-contained definition of the geometry. Build the replica from this file plus the hashed data files; `handoff.json` holds the same content in machine form.\n')
A('## 1. Sphere and frames\n- Earth: sphere, centre O, **R = 6,371,000 m**. Heights are radial: P = (R+h)·v.\n- v(lat,lon) = (cos lat·cos lon, cos lat·sin lon, sin lat); +X→(0°,0°), +Y→(0°,90°E), +Z→North Pole. Inverse: lat = asin(z/|P|), lon = atan2(y,x).\n- Local ENU at (lat0,lon0): E = (−sin lon0, cos lon0, 0), N = (−sin lat0·cos lon0, −sin lat0·sin lon0, cos lat0), U = v0; enu = (E·d, N·d, U·d), d = P − P0.\n- Scene: x = E, y = U, z = −N. Bearings clockwise from true north; d_θ = cos θ·N + sin θ·E.\n- Figures/landmark pillars/streets/prism pillars use the app\'s flat map: x = (lon−lon0)·111320·cos lat0, z = −(lat−lat0)·111320, y = −1.6 m (floor), origin = viewer rounded to 0.001°. A perfect replica may use exact ENU instead (difference ≤ 3 m within 2.5 km).\n')
A('## 2. Lines and shapes\n- Distance: d = 2R·asin√(sin²(Δlat/2) + cos lat1·cos lat2·sin²(Δlon/2)). Bearing: θ = atan2(sin Δlon·cos lat2, cos lat1·sin lat2 − sin lat1·cos lat2·cos Δlon).\n- Destination: δ = d/R; lat2 = asin(sin lat1·cos δ + cos lat1·sin δ·cos θ); lon2 = lon1 + atan2(sin θ·sin δ·cos lat1, cos δ − sin lat1·sin lat2).\n- Great circle through v heading θ: plane n·p = 0, **n = v × d_θ**; points p(s) = cos s·v + sin s·d_θ. Two circles meet at ±(n1×n2)/|n1×n2|.\n- Small circle (centre c, ground radius r): p·c = cos(r/R); p(t) = cos ρ·c + sin ρ·(cos t·N + sin t·E).\n- Line to landmark: segment viewer floor → landmark floor (Quest: label on the true direction at min(d, 400 m)).\n- Edge-of-Earth markers: for b ∈ {0,90,180,270}: destination(viewer, b, πR/2) → 10,007.5 km of arc, chord 9,010 km, elevation −45°; sphere r 150 km + line + label. Horizon ring 9,990–10,000 km in the tangent plane; wireframe globe r 6,371 km.\n- Horizon distance for eye height h: √(2Rh + h²) (4,515 m at 1.6 m). Anything beyond is drawn at its true position through the Earth with depth testing off (Quest: projected to a 3 km shell along the true direction).\n')
A('## 3. Vortex rings and wedges\nGenerator for each centre c (v = v(c)): 12 half-lines θ_k = 30k°, k = 0..11 (= 6 great circles k = 0..5, normals n_k = v × d_{30k}); all meet again at the antipode −v. Wedge k = bearings [30k, 30k+30) from c; membership: k = ⌊(bearing(c→p) mod 360)/30⌋, or p·n(30k) < 0 and p·n(30k+30) > 0. Ground half-lines 110 km, white hub 180 m, wedge fill radius **300 m** (alpha (1−smoothstep(.15,1,r/300))·0.2), pillar cylinders r 16/6 h 420 m, ring 10–14 m, spiral funnel 6 arms r(u) = 0.6(2+28u²), y = 24u, angle 2πk/6 + 6πu.\n')
A('| vortex | lat | lon | colour | antipode | n₀ (θ=0/180) | n₃ (θ=90/270) |\n|---|---|---|---|---|---|---|')
for v in VX: A(f"| {v['name']} | {v['lat']} | {v['lon']} | {v['color']} | {v['antipode'][0]:.7f}, {v['antipode'][1]:.7f} | {', '.join(f'{x:.6f}' for x in v['normals_k0_5'][0])} | {', '.join(f'{x:.6f}' for x in v['normals_k0_5'][3])} |")
A('\nAll six normals per vortex are in `vortex-table.json` (also `handoff.json → generators.vortex`). Wedge colours k = 0..11: ' + ' '.join(GEN['vortex']['WEDGE_COLS']) + '.\n')
A('## 4. Continents and Port Townsend shoreline\nEach outline is an ordered vertex list of (lat, lon), mapped by P = R·v(lat,lon) and joined by great-circle arcs (slerp). Polygons are closed; fills are triangulated in an azimuthal-equidistant plane at the continent centre, subdivided to ≤ 250 km, and lifted back onto the sphere.\n')
A('| file | content | vertices | bytes | sha256 | source / licence |\n|---|---|---|---|---|---|')
for d in DATA:
    if d.get('status'): A(f"| {d['file']} | pending | | | | |"); continue
    A(f"| `{d['file']}` | {d['content']} | {d.get('vertices', '')} | {d['bytes']} | `{d['sha256']}` | {d['source']}; {d['license']} |")
A('\nEncoding: ' + H['encoding'] + '\n')
A('## 5. Objects (positions and shapes)\nUse generators where given; raw tables only for irregular data. Full per-object list: `record.json`.\n')
A('- **Landmarks** (7): each has pillar cylinder r 1.5 h 120, beam r 2.5 h 200, ring 5–7 m, type shape, label at y 135, saucer pad offset +d E / −d N (d = 18 m; Ready Athletics 30 m, scale 2.2) hovering at 22 or 34 m.\n\n| landmark | lat | lon |\n|---|---|---|')
for t in GEN['landmarks']['targets']: A(f"| {t['name']} | {t['lat']} | {t['lon']} |")
A('\n- **Far markers**: ' + '; '.join(f"{f['name']} ({f['lat']}, {f['lon']})" for f in GEN['far_markers']) + '. Pillar r 12S h 700S, S = render distance/9010.')
A('- **Meditation circle** at (48.1316475, −122.7992293), offsets (E,N) = r(sin b, cos b): 12 stones r 3.6 b = 30k; 12 cushions r 3.02 b = 30k; 6 orbs r 3.55 b = 60k+15 y 1.25; pavers 12 annular sectors .95–2.55 with edges at 30k; lotus dais r .78/.86 h .18 with 24 petals; fallback glow ring 1–9 m. Music beacon at the same point.')
A('- **Edge ring**: anchor (48.100386, −122.81329); 12 edge marker bots at r 7 m, b = 30k: lat = lat0 + 7cos b/111320, lon = lon0 + 7 sin b/(111320 cos lat0).')
A("- **Keeper bots**: Cappy's (48.13165, −122.79921); Ready Athletics (48.11035, −122.80591). **Ren** (AI robot): 4 m east of Cappy's pillar → (" + f"{GEN['ren']['lat']}, {GEN['ren']['lon']}), h 1.85 hover .32, talk radius 15 m, beam 400 m.")
A("- **Night glow** (Ready Athletics, Cappy's): beams r 3.5/1.2 h 1500, ring 1–46 m, halos y 40/700; trails (trails.json, 9 ways) as 1 m ribbons + 6 m glow; parcel 998002802 outline ribbon .6 m.")
A('- **Quest spaceship**: cockpit fixed to the viewer rig (no world position).')
if pill:
    A(f"- **Matt Ready prism pillars** ({len(pill)}): equilateral triangular prism, side 0.7 m, total height 1.8 m (plinth .08 side .826, faces .08–1.75, cyan cap .05 side .742), ground ring .55–1.1 m; corner k local (s/√3)(sin 120k, cos 120k) rotated by yaw, so world corner bearing = 180 − yaw − 120k; **yaw = FNV-1a32(id)/2³²·360°**. Sound: Disco Jam, gain 1 ≤ 3 m → raised-cosine → 0 at 55 m, nearest 2 voices. Visible within 2.5 km.")
    if TEX:
        t = TEX[0]; A(f"- **Texture asset `{t['file']}`** ({t['format']}, {t['pixels'][0]}×{t['pixels'][1]} px, {t['bytes']} bytes, sha256 `{t['sha256']}`): {t['description']} Mapping: {t['mapping']} Used by: {t['used_by']}.")
    A('\n| id | lat | lon | yaw° | kind |\n|---|---|---|---|---|')
    for r in GEN['pillars']['table']: A(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} |')
else: A('- **Matt Ready prism pillars**: pending d44.')
A('\n## 6. Excluded (not drawn in the geometry record)\n' + '\n'.join('- ' + e for e in H['excluded']) + '\n')
A(f"Record: `geometry/record.json` sha256 `{H['record_sha256']}`, generated {rec['generated']}.")
open(os.path.join(G, 'HANDOFF.md'), 'w').write('\n'.join(L) + '\n')
# ---------------- GEOMETRY.md
M = []; A = M.append
A('# Live Geometry - Core Geometry Spec v1.0\n**Status: LOCKED - 2026-10-17.** App: Live Geometry. Worlds: Matt\'s Reality / Ready Security Services Map 1 / Base Geometry Reality (formerly Earth Edge AR).\n')
A('Reference implementation: `geometry/sphere.py` (equations), `geometry/vortex.py` (wedges), `geometry/build_record.py` (record). Rebuild: `python3 geometry/build_data.py && python3 geometry/to_vectors.py && python3 geometry/vortex.py && python3 geometry/build_record.py && python3 geometry/render.py && python3 geometry/make_docs.py`.\n')
A('## 1. Locked equations (the Earth is a sphere)\n')
for i, (k, v) in enumerate(EQ, 1): A(f'{i}. **{k}**: {v}')
A('\n### How the app maps the sphere into Three.js (as coded)\n- `index.html`: `ecef()` + `toENU()` from the viewer; world group in km (`SC = 1e-3`): globe, continents, mountains, far markers, edge markers, vortex great circles, antipodes. Local group in metres, re-centred so the viewer stays at the origin (`local.position = -smoothed position`).\n- Exact ENU (with curvature drop) is used for the vortex centres, the 110 km vortex ground half-lines, the PT shoreline, night glow and trails (daynight `proj`), satellite tiles and terrain.\n- The flat 111,320 m/deg map is used for landmark pillars/beams/labels, saucers, streets/Sheridan, Ren, the meditation circle, performers, bots and the d44 pillars (`toLocalW`). Floor y = −1.6 m (eye height), no drop.\n- `quest.html`: `enu()` in metres from HOME (manual location or Ready Athletics); world shapes beyond reach are pushed to a 3 km shell (`makeVortexWorldTubes`) or labels to ≤ 400 m along the true direction.\n- Up = +y, North = −z, East = +x in every page.\n')
A('## 2. Vortex wedge geometry (locked)\n- Centres: Ready Athletics (48.11035, −122.80591) gold; Cappy\'s Trails / Happy\'s Trails vortex pillar (48.13165, −122.79921) green; Matt\'s Meditation Garden (48.1316475, −122.7992293) purple (the Happy\'s Trails Vortex music source, 1.46 m from Cappy\'s pillar at bearing 259°).\n- Dividing lines: bearings θ_k = 30k°, k = 0..11 → 6 full great circles (k = 0..5). Normal **n_k = v × d_θk**, d_θ = cos θ·N + sin θ·E. All 12 half-lines meet at the antipode −v.\n- Wedge k = bearings [30k, 30k+30). Test: k = ⌊(bearing(c→p) mod 360)/30⌋ ⇔ p·n(30k) < 0 ∧ p·n(30k+30) > 0 (verified on 2,000 random points per vortex).\n- Coloured fill radius 300 m (flat sector in the tangent plane); ground half-lines 110 km; hub 180 m; world circles full 360°.\n')
A('| vortex | antipode | k | bearings | normal n_k | circle pole (lat, lon) |\n|---|---|---|---|---|---|')
for v in vt['vortices']:
    for c in v['great_circles']: A(f"| {v['id']} | {v['antipode_latlon'][0]:.7f}, {v['antipode_latlon'][1]:.7f} | {c['k']} | {c['bearings_deg'][0]:g}/{c['bearings_deg'][1]:g} | ({', '.join(f'{x:.9f}' for x in c['normal'])}) | {c['pole_latlon'][0]}, {c['pole_latlon'][1]} |")
A('\nSeparations: ' + '; '.join(f"{k}: {v['m']} m at {v['bearing']}°" for k, v in vt['separations'].items()) + '\n')
A('## 3. Continents and Port Townsend shoreline\nSee table in HANDOFF.md §4. `continents.geojson` = exactly the rings the app renders (Natural Earth 1:50m, public domain). `pt-shoreline.geojson` = fresh OSM coastline (Overpass, 2026-10-17) for the Quimper Peninsula incl. Point Hudson, Fort Worden/Point Wilson, North Beach, Kah Tai, Boat Haven, plus lagoons/harbour structures from `shore.json` (© OpenStreetMap contributors, ODbL). `to_vectors.py` converts both to unit vectors. Renders: `/workspace/geometry-globe.png`, `/workspace/geometry-pt.png`.\n')
A('## 4. Geometry record\n' + f"{rec['total']} objects. Counts: " + ', '.join(f'{k} {v}' for k, v in rec['counts_by_category'].items()) + '.\n')
A('| cat | id | name | type | lat | lon | size | anchor | source |\n|---|---|---|---|---|---|---|---|---|')
for o in O:
    if o['cat'] == 'pillars': continue
    sz = ', '.join(f'{k} {v}' for k, v in o['size'].items())
    A(f"| {o['cat']} | {o['id']} | {o['name']} | {o['type']} | {o['lat'] if o['lat'] is not None else '-'} | {o['lon'] if o['lon'] is not None else '-'} | {sz} | {o['anchor']} | {o['source']} |")
if pill:
    A(f"\n### Matt Ready prism pillars ({len(pill)}, from pillars.json sha256 `{PM['sha256'][:16]}…`)\nShape: equilateral triangular prism, side 0.7 m, height 1.8 m, texture `pillar-matt.jpg` on all 3 faces; yaw = FNV-1a(id). Full table with yaw in HANDOFF.md §5 / record.json.\n")
    A('| id | name | kind | area | lat | lon | yaw° |\n|---|---|---|---|---|---|---|')
    for o in pill: A(f"| {o['id'].split('.',1)[1]} | {o['name']} | {o['kind']} | {o['area']} | {o['lat']} | {o['lon']} | {o['yaw_deg']} |")
if TEX:
    t = TEX[0]; A(f"\n### Texture asset\n`{t['file']}` - {t['format']} {t['pixels'][0]}×{t['pixels'][1]} px, {t['bytes']} B, sha256 `{t['sha256']}`. {t['description']} Mapping: {t['mapping']}")
A('\n### Excluded human depictions (pending Matt\'s decision; counts only, no positions)\n' + '\n'.join(f"- {e['what']}: {e['count']} ({e['why']})" for e in rec['excluded_human_depictions']))
A('\n## 5. Possible future refinements (not part of v1.0)\n- WGS84 ellipsoid (a = 6,378,137 m, f = 1/298.257223563): geodetic→ECEF, ellipsoidal ENU; differences up to ~0.3% in distance and ~0.19° in latitude geometry.\n- Geodesics on the ellipsoid (Karney 2013, GeographicLib) for distance/bearing/destination and vortex lines (geodesics are not plane sections on an ellipsoid).\n- Geoid heights (EGM2008) and real terrain elevation for ground objects (Port Townsend bluffs up to ~60 m).\n- Atmospheric refraction (k ≈ 0.13: effective radius R/(1−k)) for horizon distance and far-object elevation.\n- Replace the flat 111,320 m/deg local map by exact ENU so all layers share one projection (removes the 0.11% scale and the drop error).\n- Use one radius constant for labels and rendering (6,371,000 vs 6,371,008.8 m).\n- Higher-resolution continents (Natural Earth 1:10m / OSM land polygons) and tidal datum for shorelines.\n')
open(os.path.join(G, 'GEOMETRY.md'), 'w').write('\n'.join(M) + '\n')
print('docs ok', len(L), len(M))
