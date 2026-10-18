"""Geometry record v1.0: every non-human object in the Live Geometry world, from code/data only (no guessed positions).
Writes geometry/record.json. Run from anywhere: python3 geometry/build_record.py"""
import json, os, sys, hashlib, math, datetime, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sphere as S, vortex as V
G = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(G)
J = lambda f: json.load(open(os.path.join(ROOT, f)))
sha = lambda f: hashlib.sha256(open(os.path.join(ROOT, f), 'rb').read()).hexdigest()
r7 = lambda x: round(float(x), 7)
def off(lat, lon, e, n):  # the app's flat offset (figures-registry offsetLL)
    return r7(lat + n / 111320), r7(lon + e / (111320 * math.cos(math.radians(lat))))
REC = []
def add(cat, id, name, type, shape, lat=None, lon=None, size=None, anchor='ground', src='', **kw):
    o = {'cat': cat, 'id': id, 'name': name, 'type': type, 'shape': shape, 'lat': None if lat is None else r7(lat), 'lon': None if lon is None else r7(lon), 'size': size or {}, 'anchor': anchor, 'source': src}
    o.update(kw); REC.append(o); return o
GARDEN = (48.1316475, -122.7992293); CAPPY = (48.13165, -122.79921); RA = (48.1062, -122.8057)
# ---------------- 1. landmarks (index.html TARGETS; quest.html PLACES)
TARGETS = [('Ready Athletics (997800502)', 48.1062, -122.8057, '#ffc800', 'field'), ("Cappy's Trails garden (998002802)", 48.13165, -122.79921, '#30ff60', 'park'),
           ("Memory's Vault, Fort Worden", 48.1384642, -122.7647029, '#c060ff', 'landmark'), ('Port Townsend City Hall', 48.1161771, -122.753612, '#40e0ff', 'building'),
           ("Jefferson County Sheriff's Office", 48.0241638, -122.764488, '#ff7020', 'building'), ('Jefferson Healthcare Hospital', 48.1060007, -122.7889962, '#ff4060', 'hospital'),
           ('Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St)', 48.1139683, -122.7628233, '#e0c080', 'building')]
SHAPES = {'field': 'ground disc r 25 m', 'park': 'ground disc r 25 m', 'landmark': 'obelisk: 4-sided frustum r 2->0.9 h 14 + pyramid cap h 2.5', 'building': 'box 10x6x10 + 4-sided roof cone r 7.5 h 4',
          'hospital': 'box 12x7x12 + cross (8x2.4 and 2.4x8 bars, 0.6 thick) at y 9'}
for i, (n, la, lo, c, t) in enumerate(TARGETS):
    k = f'lm{i+1}'
    add('landmarks', k + '.pillar', n + ' - pillar', 'landmark pillar', 'cylinder 8-sided', la, lo, {'r_m': 1.5, 'h_m': 120}, 'floor (-1.6 m below eye), flat local map', 'index.html TARGETS', color=c)
    add('landmarks', k + '.beam', n + ' - light beam', 'beam', 'open cylinder, fades upward', la, lo, {'r_m': 2.5, 'h_m': 200}, 'floor', 'index.html addBeamShape', color=c)
    add('landmarks', k + '.ring', n + ' - ground ring', 'ring', 'annulus', la, lo, {'r_in_m': 5, 'r_out_m': 7}, 'floor +0.05 m', 'index.html addBeamShape', color=c)
    add('landmarks', k + '.shape', n + ' - type shape (' + t + ')', 'type shape', SHAPES[t], la, lo, {}, 'floor', 'index.html addBeamShape', color=c)
    add('landmarks', k + '.label', n + ' - label', 'label', 'sprite pill 160x40, live distance', la, lo, {'y_m': 135}, 'floor', 'index.html', color=c)
    hero = t == 'field'; d = 30 if hero else 18; sl, so = off(la, lo, d, -d); s = 2.2 if hero else 1
    add('saucers', k + '.saucer', n + ' - saucer + landing pad', 'saucer', f'pad: disc r {9*s:g} m + ring {9*s:g}-{10*s:g} m + H; saucer: flattened sphere r {6*s:g} m (y-scale .22), dome r {2.4*s:g}, rim torus; 8 pad lights at r {10.8*s:g}' + ('; tractor beam cone r 2.5*S..9*S' if hero else ''),
        sl, so, {'hover_y_m': 34 if hero else 22, 'scale': s}, f'floor; offset {d} m east, {d} m south of the landmark (flat)', 'index.html buildX + extras.makeSaucer', color=c)
    add('lines', k + '.line', 'Line to ' + n, 'line to landmark', 'segment from viewer floor point (0,-1.6,0) to landmark floor point; quest: label at true ENU direction, shown at min(d,400 m)', la, lo, {}, 'viewer-relative generator (no viewer position recorded)', 'index.html updLocal / quest.html PLACES', color=c)
# ---------------- 2. vortices
for t in V.table():
    la, lo, c, vid = t['lat'], t['lon'], t['color'], t['id']
    add('vortex', vid + '.pillar', t['name'] + ' - vortex pillar', 'vortex pillar', 'two open cylinders (r 16->9.6 and 6->3.6, h 420) + ring 10-14 m + core line', la, lo, {'h_m': 420}, 'floor, exact ENU', 'extras.makeVortexPillar', color=c)
    add('vortex', vid + '.funnel', t['name'] + ' - spiral funnel', 'spiral', '6 arms: r(u)=0.6*(2+28u^2), y=0.6*40u, angle=2pi k/6 + 6pi u, u in [0,1]; spins', la, lo, {'h_m': 24}, 'floor', 'extras.makeVortexLocal (scale .6)', color=c)
    add('vortex', vid + '.wedges', t['name'] + ' - 12 wedge fills', 'wedge fill', '12 x 30 deg circular sectors, wedge k = bearings [30k,30k+30), alpha fades smoothstep(.15,1,r/300)', la, lo, {'r_m': 300}, 'floor +0.01', 'extras.makeVortexWedges(T,300,0)', color=c, colors=V.WEDGE_COLS)
    add('vortex', vid + '.ground', t['name'] + ' - 12 ground half-lines', 'great-circle half-lines', 'p(s)=cos(s)v+sin(s)d_theta, theta=30k, 0<=s<=110 km/R, exact ENU incl. curvature drop', la, lo, {'len_km': 110}, 'floor +0.05', 'extras.vortexGroundLines', color=c)
    add('vortex', vid + '.hub', t['name'] + ' - white hub lines', 'hub', 'first 180 m of each of the 12 half-lines, white, 7 px', la, lo, {'len_m': 180}, 'floor +0.07', 'index.html addVortexLocal', color='#ffffff')
    add('vortex', vid + '.circles', t['name'] + ' - 6 world great circles', 'great circles', 'full circles at bearings 30k, k=0..5 (through the planet), normals n=v x d_theta (see vortex table)', la, lo, {'k': 6}, 'world (ENU km); Quest: projected to 3 km shell', 'extras.vortexWorldCircles', color=c, normals=[g['normal'] for g in t['great_circles']])
    aa, ao = t['antipode_latlon']
    add('vortex', vid + '.antipode', t['name'] + ' - antipode marker', 'antipode', 'two rings facing viewer: 150-190 and 260-275 (scene km) + label', aa, ao, {}, 'world, through the Earth (12,742 km chord)', 'index.html buildVW', color=c)
    add('vortex', vid + '.label', t['name'] + ' - label', 'label', 'sprite', la, lo, {'y_m': 500 if vid == 'vxGarden' else 440}, 'floor', 'index.html addVortexLocal', color=c)
add('vortex', 'vxGarden.speaker', "Speaker label: Happy's Trails Vortex - Matt's Meditation Garden", 'label', 'sprite', *GARDEN, {'y_m': 120}, 'floor', 'index.html buildX', color='#e0b0ff')
# ---------------- 3. Meditation Garden layer + meditation circle (circle.js, figures-registry CIRCLE)
add('garden', 'garden.music', "Music beacon: Happy's Trails Vortex (Matt's Meditation Garden)", 'sound source', 'point source, HRTF panner (direction), distance-based volume', *GARDEN, {}, 'ground', 'audio.js SRC', color='#c080ff')
add('garden', 'garden.fallbackRing', 'Garden fallback glow ring (until circle.js loads)', 'ring', 'annulus', *GARDEN, {'r_in_m': 1, 'r_out_m': 9}, 'ground +0.15', 'daynight.js / figures-registry GARDEN_FALLBACK_RING', color='#c080ff')
for k in range(12):
    b = 30 * k; e, n = 3.6 * math.sin(math.radians(b)), 3.6 * math.cos(math.radians(b))
    add('circle', f'circle.stone{k:02d}', f'Standing stone {k}', 'stone', 'dodecahedron r 0.32 detail 1, y-stretch 1.6+0.25*(k%3), z .8, rune-vein emissive', *off(*GARDEN, e, n), {'center_y_m': round(.38 + (k % 3) * .06, 2)}, f'bearing {b} deg, r 3.6 m from Garden pin', 'circle.js', bearing=b)
    e, n = 3.02 * math.sin(math.radians(b)), 3.02 * math.cos(math.radians(b))
    add('circle', f'circle.cushion{k:02d}', f'Cushion {k}', 'cushion', 'sphere r .25 scaled y .38 + piping torus', *off(*GARDEN, e, n), {'y_m': .1}, f'bearing {b} deg, r 3.02 m', 'circle.js', bearing=b, color='#7ffff0' if k % 2 else '#c58cff')
for k in range(6):
    b = 60 * k + 15; e, n = 3.55 * math.sin(math.radians(b)), 3.55 * math.cos(math.radians(b))
    add('circle', f'circle.orb{k}', f'Floating orb {k}', 'orb', 'sphere r .07 + fresnel shell r .13 + halo', *off(*GARDEN, e, n), {'y_m': '1.25 +- .12 (bob)'}, f'bearing {b} deg, r 3.55 m', 'circle.js', bearing=b)
add('circle', 'circle.pavers', '12 pavers (annular wedges) + seams', 'pavers', '12 annular sectors r .95..2.55 m, boundaries at bearings 30k (gap .012 rad), 2 ring seams + 12 radial seams', *GARDEN, {'r_in_m': .95, 'r_out_m': 2.55}, 'ground', 'circle.js')
add('circle', 'circle.lotus', 'Lotus dais', 'dais', 'cylinder r .78/.86 h .18 + rim torus r .8 + 24 petals (12 + 12 offset 15 deg) + fresnel dome r .95 (y .45)', *GARDEN, {'h_m': .18}, 'ground, centred on the Garden pin', 'circle.js')
add('circle', 'circle.floorGlow', 'Circle floor glow', 'glow ring', 'annulus .95..3.05 m', *GARDEN, {}, 'ground', 'circle.js')
# ---------------- 4. night glow (daynight.js SITES) + stars
for key, nm, la, lo, col in [('vxRA', 'Ready Athletics', *RA, '#ffc800'), ('vxCappy', "Cappy's Trails", *CAPPY, '#30ff60')]:
    add('night', f'night.{key}.beams', f'{nm} night beams', 'beam', 'two open cylinders r 3.5 and 1.2, h 1500', la, lo, {'h_m': 1500}, 'ground, fades in with night', 'daynight.js', color=col)
    add('night', f'night.{key}.ring', f'{nm} night ring', 'ring', 'annulus 1..46 m, pulsing', la, lo, {'r_in_m': 1, 'r_out_m': 46}, 'ground +0.12', 'daynight.js', color=col)
    add('night', f'night.{key}.halos', f'{nm} night halos', 'halo sprites', 'screen-size sprites at y 40 and 700 m', la, lo, {}, 'ground', 'daynight.js', color=col)
add('sky', 'sky.stars', 'Star field', 'stars', 'seeded random points (Park-Miller seed 7) on the sky sphere r 0.95*skyRadius; opacity by sun altitude', None, None, {}, 'viewer-centred sky', 'daynight.js starField')
add('sky', 'sky.sun', 'Sun', 'celestial body', 'disc at true topocentric az/alt (astronomy-engine), true angular size, reduced distance', None, None, {}, 'viewer-centred, real time', 'sky.js')
add('sky', 'sky.moon', 'Moon', 'celestial body', 'as Sun, with phase', None, None, {}, 'viewer-centred, real time', 'sky.js')
add('sky', 'sky.dome', 'Sky / dark dome', 'sky sphere', 'back-faced sphere r 60 (zenith/horizon/ground gradient)', None, None, {}, 'viewer-centred', 'extras.makeDarkSky / daynight')
# ---------------- 5. trails + parcel (trails.json)
TR = J('trails.json')
for key, nm, col in [('cappy', "Cappy's", '#6dffc0'), ('ra', 'Ready Athletics', '#ffe070')]:
    for w in TR[key]:
        P = np.asarray(w['pts']); L = float(sum(S.haversine(P[i, 0], P[i, 1], P[i + 1, 0], P[i + 1, 1]) for i in range(len(P) - 1)))
        add('trails', f'trail.{key}.{w["osm"]}', f'{nm} trail, OSM way {w["osm"]} ({w["hw"]})', 'trail', f'glowing ribbon 1 m + glow 6 m along {len(P)} vertices (densified), great-circle segments', r7(P[:, 0].mean()), r7(P[:, 1].mean()), {'length_m_sphere': round(L, 1), 'length_m_src': w['len_m'], 'vertices': len(P)}, 'ground', 'trails.json / daynight.js', color=col, osm_way=w['osm'], points=w['pts'])
P = np.asarray(TR['cappy_outline'])
add('trails', 'parcel.998002802', "Parcel 998002802 outline (Cappy's Trails garden)", 'parcel outline', f'closed ribbon .6 m, {len(P)} vertices', r7(P[:-1, 0].mean()), r7(P[:-1, 1].mean()), {'area_m2_sphere': round(S.sph_polygon_area(P[:-1] if (P[0] == P[-1]).all() else P), 1), 'perimeter_m': round(float(sum(S.haversine(*P[i], *P[(i + 1) % len(P)]) for i in range(len(P)))), 1)}, 'ground', 'trails.json cappy_outline (WA Current_Parcels)', color='#30ff60', points=TR['cappy_outline'])
P = np.asarray(TR['ra_parcel_outline'])
add('trails', 'parcel.997800502', 'Parcel 031-997800502 outline (Ready Athletics) - DATA ONLY, not drawn', 'parcel outline (not rendered)', f'{len(P)} vertices', r7(P[:, 0].mean()), r7(P[:, 1].mean()), {'area_m2_sphere': round(S.sph_polygon_area(P[:-1] if (P[0] == P[-1]).all() else P), 1)}, 'n/a', 'trails.json ra_parcel_outline', points=TR['ra_parcel_outline'])
# ---------------- 6. streets
for l in J('streets.json')['lines']:
    P = np.asarray(l['points']); L = float(S.haversine(P[:-1, 0], P[:-1, 1], P[1:, 0], P[1:, 1]).sum())
    add('streets', 'street.' + l['name'][:20], 'Road path: ' + l['name'], 'road path', f'fat line (7/3/1 px glow-ribbon-core) at floor, {len(P)} vertices, labels every ~1/6', r7(P[:, 0].mean()), r7(P[:, 1].mean()), {'length_m': round(L), 'vertices': len(P)}, 'floor -1.55 m, flat local', 'streets.json', color=l['color'])
SH = J('sheridan.json'); segs = SH.get('segments') or [SH['points']]
add('streets', 'street.sheridan', 'Sheridan St', 'road path', f'{len(segs)} segments, {sum(len(s) for s in segs)} vertices, magenta fat line + labels', None, None, {'length_m': round(float(sum(S.haversine(np.asarray(s)[:-1, 0], np.asarray(s)[:-1, 1], np.asarray(s)[1:, 0], np.asarray(s)[1:, 1]).sum() for s in segs)))}, 'floor', 'sheridan.json', color='#ff00cc')
# ---------------- 7. shoreline / ocean / geography
PT = json.load(open(os.path.join(G, 'pt-shoreline.geojson'))); CT = json.load(open(os.path.join(G, 'continents.geojson')))
SHO = J('shore.json')
add('geography', 'geo.pt_shore', 'Port Townsend shoreline (OSM coastline, full detail)', 'shoreline', f'{len(SHO["coast"])} coast lines ({sum(len(x) for x in SHO["coast"])} pts) + {len(SHO["harbor"])} harbour structures + {len(SHO["lagoon"])} lagoons + {len(SHO["labels"])} labels, exact ENU at floor', None, None, {}, 'floor, exact ENU (curvature drop)', 'shore.json -> geometry/pt-shoreline.geojson')
add('geography', 'geo.ocean', 'Ocean surface + coast (old)', 'ocean mesh', 'water mesh masked by coast.json natural=coastline lines in bbox 48.01..48.19, -122.915..-122.645', None, None, {}, 'floor', 'extras.makeOcean / coast.json')
add('geography', 'geo.grid', 'Ground grid', 'grid', 'plane 20x20 km, procedural 20 m / 100 m / 1 km lines, fades 3-10 km', None, None, {}, 'floor, centred on grid origin (round(lat,3),round(lon,3))', 'index.html buildLocal / quest grid-plane')
add('geography', 'geo.satellite', 'Satellite imagery layer (optional)', 'imagery', 'web-mercator tiles draped on proj(lat,lon,h) (follows curvature); globe texture z2 when high', None, None, {}, 'ground', 'sat.js (Imagery (c) Esri)')
for f in CT['features']:
    p = f['properties']; n = sum(len(r) for poly in f['geometry']['coordinates'] for r in poly)
    add('geography', 'geo.' + p['id'], p['name'] + ' (true-scale outline + fill)', 'continent', f'{len(f["geometry"]["coordinates"])} polygons, {n} vertices, earcut in azimuthal-equidistant plane, tris <= 250 km, vertices on sphere', *(p.get('center_latlon') or [None, None]), {'area_km2_src': p.get('area_km2_src')}, 'sphere surface (world, ENU km)', p['app_file'] + ' -> geometry/continents.geojson')
for m in J('mountains.json')['mountains']:
    add('geography', 'geo.' + m['name'].split()[-1].lower(), m['name'] + ' (true-scale terrain + 15 km ring)', 'mountain', 'USGS 3DEP heightfield mesh + small circle r 15 km + label at summit+400 m', m['lat'], m['lon'], {'summit_m': m['summit_m'], 'ring_r_m': 15000}, 'sphere surface + h', 'mountains.json / extras.makeTerrain')
# ---------------- 8. far markers (index.html FAR) + edge of Earth
FAR = [('North Pole', 90, 0, 'flag'), ('South Pole', -90, 0, 'ice island'), ('Great Pyramid of Giza', 29.97917, 31.13417, 'pyramid'), ('Pyramid of Khafre', 29.97611, 31.13083, 'pyramid'),
       ('Great Pyramid of Cholula', 19.0575, -98.30194, 'pyramid'), ('Pyramid of the Sun, Teotihuacan', 19.693, -98.844, 'pyramid'), ('IceCube Neutrino Observatory', -89.99, -63.45306, 'cube')]
for n, la, lo, k in FAR:
    add('far', 'far.' + n.split(',')[0].replace(' ', '_').lower(), n, 'far marker', f'{k}; pillar r 12S h 700S; S = render distance/9010 (size scales with distance)' + ('; square pyramid r 160S h 220S' if k == 'pyramid' else '; cube 220S' if k == 'cube' else ''), la, lo, {}, 'sphere surface, local up, through the Earth', 'index.html FAR / quest.html PLACES')
add('edges', 'edge.markers', 'Edge-of-Earth markers N/E/S/W', 'edge marker', 'sphere r 150 (scene km) + line from viewer + label at the point 90 deg of arc (10,007.5 km) from the viewer along bearings 0/90/180/270; appears at elevation -45 deg, chord R*sqrt2 = 9,010 km', None, None, {'arc_deg': 90, 'bearings': [0, 90, 180, 270]}, 'viewer-relative generator: destination(viewer, b, pi/2*R)', 'index.html build / quest.html PLACES', colors={'N': '#ff4040', 'E': '#40ff60', 'S': '#40a0ff', 'W': '#ffd040'})
add('edges', 'edge.horizonRing', 'Horizon ring', 'ring', 'flat annulus 9,990..10,000 km in the viewer tangent plane', None, None, {}, 'viewer-centred', 'index.html')
add('edges', 'edge.globe', 'Wireframe globe', 'sphere', 'sphere r 6371 km (48x32 wireframe), centre at the Earth centre in ENU, poles aligned to ECEF Z', None, None, {'r_km': 6371}, 'Earth centre', 'index.html')
# ---------------- 9. edge ring + bots, keepers, Ren, test fixtures, spaceship
E0 = dict(lat=48.100386, lon=-122.81329, r=7)
add('bots', 'edge.anchor', 'Edge-ring anchor: SR 20 (W Sims Way) / Mill Rd signal', 'anchor', 'point (mean of OSM traffic_signals nodes 12630503607-610)', E0['lat'], E0['lon'], {'ring_r_m': 7}, 'ground; GM-editable (persisted on Monster in server/bots.json; code default recorded)', 'server.js EDGE_DEF')
for a in range(0, 360, 30):
    la = E0['lat'] + E0['r'] * math.cos(math.radians(a)) / 111320; lo = E0['lon'] + E0['r'] * math.sin(math.radians(a)) / (111320 * math.cos(math.radians(E0['lat'])))
    add('bots', f'edge.bot{a:03d}', f'Edge-{a} deg (edge marker bot)', 'edge marker bot', 'stick-figure bot marker (mp.js avatar), style ' + ('lightblue' if a % 90 == 0 else 'default' if a == 330 else 'plaid'), la, lo, {}, f'ring r 7 m, bearing {a} deg (one per Ready Athletics wedge ray)', 'server.js BOTS edge group', bearing=a)
add('bots', 'bot.keeper.cappy', "Cappy's Keeper", 'keeper bot', 'bot marker (mp.js avatar)', *CAPPY, {}, 'fixed (GM can pause/hide)', 'server.js BOTS')
add('bots', 'bot.keeper.ra', 'Ready Athletics Keeper', 'keeper bot', 'bot marker (mp.js avatar)', *RA, {}, 'fixed', 'server.js BOTS')
rl, ro = off(*CAPPY, 4, 0)
add('characters', 'ren', 'Ren (3dguru) - AI guide robot', 'AI character (non-human robot)', 'robot body h 1.85 m hovering .32 m, 12-wedge halo, chest emblem; beam 400 m; talk radius 15 m / leave 20 m; dance wander <= 1.3 m', rl, ro, {'h_m': 1.85, 'hover_m': .32, 'talk_r_m': 15, 'leave_r_m': 20, 'beam_m': 400}, "4 m east of Cappy's pillar (flat offset)", 'figures-registry REN / ren.js')
for n, (la, lo), place in [('Ghost-1', RA, 'Ready Athletics'), ('Ghost-2', CAPPY, "Cappy's Trails garden")]:
    add('test', 'test.' + n, n + ' (server TEST fixture, dummy player marker)', 'test fixture', 'bot-style marker; random walk 0.8-3 m/s within 150 m of target', la, lo, {'wander_r_m': 150}, 'target point only (live position not recorded)', 'server.js GHOSTS', place=place)
add('vehicles', 'quest.ship', 'Quest spaceship cockpit', 'vehicle', 'see-through cockpit group fixed to the XR rig (viewer); inertial flight', None, None, {}, 'viewer-relative (no world position)', 'quest.html cockpit()/QSHIP')
# ---------------- 10. d44 Matt Ready prism pillars + texture asset
PIL = None; TEX = None
if os.path.exists(os.path.join(ROOT, 'pillars.json')):
    PJ = J('pillars.json'); img = PJ.get('image', 'pillar-matt.jpg'); reg = dict(heightM=1.8, sideM=0.7, plinthM=.08, capM=.05, visibleM=2500, audio=dict(fullM=3, silentM=55, voices=2))
    def fnv(s):
        h = 2166136261
        for ch in s: h ^= ord(ch); h = (h * 16777619) & 0xffffffff
        return h / 4294967296
    if os.path.exists(os.path.join(ROOT, img)):
        from PIL import Image
        im = Image.open(os.path.join(ROOT, img))
        TEX = {'id': 'tex.pillar-matt', 'file': img, 'format': im.format, 'mode': im.mode, 'pixels': list(im.size), 'bytes': os.path.getsize(os.path.join(ROOT, img)), 'sha256': sha(img),
               'description': "Purple Matt Ready figure: stylised robot-like body with a dark screen face showing a cyan winking smile, purple velvet tailcoat tuxedo with white shirt-front and black bow tie, purple top hat with cyan band, white gloves, holding a black microphone, dark trousers and shoes, on a purple gradient background with a cyan border and the caption 'MATT READY' in yellow at the bottom.",
               'mapping': 'the same full image on all 3 side faces of every pillar; per face u: 0 at corner k -> 1 at corner k+1 (left->right seen from outside), v: 0 at face bottom (y=0.08 m) -> 1 at face top (y=1.75 m); unlit (MeshBasicMaterial, sRGB), front side only. Face 0.70 x 1.67 m (aspect .419) vs image 432x1024 (aspect .422): no crop, <1% stretch.',
               'used_by': f'all {PJ.get("count", len(PJ["pillars"]))} pillars (pillars.js PILLAR_IMAGE / figures-registry PILLARS.image); a pillar may override with its own "image" field (none do)'}
    PIL = {'file': 'pillars.json', 'sha256': sha('pillars.json'), 'count': len(PJ['pillars']), 'src': PJ.get('src'), 'constants': reg}
    for p in PJ['pillars']:
        yaw = fnv(p['id']) * 360
        add('pillars', 'pillar.' + p['id'], p['name'], 'Matt Ready prism pillar', 'equilateral triangular prism (billboard) side .7 m: plinth (side .826, h .08) + 3 image faces (h 1.67) + cyan cap (side .742, h .05) + ground ring .55-1.1 m; texture tex.pillar-matt on all 3 faces',
            p['lat'], p['lon'], {'h_m': 1.8, 'side_m': .7}, 'floor, flat local map; yaw about up axis', 'pillars.json / pillars.js', yaw_deg=round(yaw, 4), corner_bearings_deg=[round((180 - yaw - 120 * k) % 360, 3) for k in range(3)], kind=p['kind'], area=p['area'],
            sound={'track': 'disco-jam (64 s loop, 120 BPM, A minor)', 'gain': '1 if d<=3 m; 0.5(1+cos(pi(d-3)/52)) if 3<d<55; 0 if d>=55', 'voices': 'nearest 2 within 55 m, shared loop clock'})
# ---------------- excluded (humans / human depictions) - counts only, no positions
EXCL = [{'what': 'real players', 'count': 'live count only (never positions)', 'why': 'humans'},
        {'what': "Matt's Shadow bot", 'count': 1, 'why': "follows Matt's real location"},
        {'what': 'Matt Ready performer bot (purple tuxedo rig)', 'count': 1, 'why': 'human depiction - pending Matt'},
        {'what': 'other singer performer bots', 'count': '0 configured now (one per player-named singer, dynamic)', 'why': 'human depiction - pending Matt'},
        {'what': 'GhostBot (purple Victorian tux, client-side, walks loops around the viewer)', 'count': 1, 'why': 'human depiction - pending Matt'}]
from collections import Counter
cnt = Counter(o['cat'] for o in REC)
src_files = sorted({f for f in ['index.html', 'quest.html', 'extras.js', 'daynight.js', 'circle.js', 'figures-registry.js', 'ren.js', 'audio.js', 'server/server.js', 'trails.json', 'streets.json', 'sheridan.json', 'shore.json', 'coast.json', 'continents.json', 'landmass.json', 'mountains.json', 'pillars.json', 'pillars.js', 'pillar-matt.jpg'] if os.path.exists(os.path.join(ROOT, f))})
out = {'spec': 'Live Geometry geometry record v1.0', 'date': '2026-10-17', 'status': 'locked (pillars: as of d44 working tree)', 'generated': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
       'sphere': {'R_m': S.R, 'frame': 'ECEF-like, +Z north pole, +X lat0/lon0; heights spherical'}, 'counts_by_category': dict(cnt), 'total': len(REC),
       'textures': [TEX] if TEX else [], 'pillars_meta': PIL or 'pending d44', 'excluded_human_depictions': EXCL,
       'source_hashes': {f: sha(f) for f in src_files}, 'objects': REC}
json.dump(out, open(os.path.join(G, 'record.json'), 'w'), indent=1)
print(len(REC), dict(cnt), 'tex' if TEX else 'no tex')
