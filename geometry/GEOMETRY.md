# Live Geometry - Core Geometry Spec v1.0
**Status: LOCKED - 2026-10-17.** App: Live Geometry. Worlds: Matt's Reality / Ready Security Services Map 1 / Base Geometry Reality (formerly Earth Edge AR).

Reference implementation: `geometry/sphere.py` (equations), `geometry/vortex.py` (wedges), `geometry/build_record.py` (record). Rebuild: `python3 geometry/build_data.py && python3 geometry/to_vectors.py && python3 geometry/vortex.py && python3 geometry/build_record.py && python3 geometry/render.py && python3 geometry/make_docs.py`.

## 1. Locked equations (the Earth is a sphere)

1. **R**: R = 6,371,000 m (all renderers). Distance read-outs in some places use 6,371 km or 6,371.0088 km (<=1.4 ppm). Earth = sphere, heights h are radial.
2. **unit vector**: v(lat,lon) = (cos lat cos lon, cos lat sin lon, sin lat); +X=(0,0), +Y=(0,90E), +Z=North Pole
3. **position**: P = (R + h) v
4. **inverse**: lat = asin(Pz/|P|), lon = atan2(Py, Px), h = |P| - R
5. **ENU basis at (lat0,lon0)**: E = (-sin lon0, cos lon0, 0); N = (-sin lat0 cos lon0, -sin lat0 sin lon0, cos lat0); U = v(lat0,lon0); enu = (E.(P-P0), N.(P-P0), U.(P-P0))
6. **scene axes**: Three.js: x = E, y = U, z = -N (y-up, right-handed). index.html world group: metres*1e-3 (km); local group: metres; quest: metres from HOME (default Ready Athletics or the manual location)
7. **flat local map (figures, landmark pillars, streets, pillars)**: x = (lon-lon0)*111320*cos(lat0), z = -(lat-lat0)*111320, y = -1.6 m (floor); lat0/lon0 = viewer position rounded to 0.001 deg. Exact = ENU above. Error: scale +0.11% (111320 vs R*pi/180 = 111194.9 m/deg) and no drop; 2.8 m at Cappy's seen from Ready Athletics (2.4 km), 11.7 m at 10 km.
8. **great-circle distance (haversine)**: d = 2R asin( sqrt( sin^2(dlat/2) + cos lat1 cos lat2 sin^2(dlon/2) ) )
9. **initial bearing**: theta = atan2( sin dlon cos lat2, cos lat1 sin lat2 - sin lat1 cos lat2 cos dlon ) (clockwise from north)
10. **destination**: delta = d/R; lat2 = asin(sin lat1 cos delta + cos lat1 sin delta cos theta); lon2 = lon1 + atan2(sin theta sin delta cos lat1, cos delta - sin lat1 sin lat2)
11. **direction vector**: d_theta = cos theta N + sin theta E (unit tangent at v)
12. **great circle**: plane through Earth centre {p : p.n = 0}; n = v x d_theta (through v heading theta) or n = (v1 x v2)/|v1 x v2| (through two points)
13. **point on great circle**: p(s) = cos s v + sin s d_theta, s = arc/R in radians, s in [0, 2pi)
14. **intersection of two great circles**: x = +-(n1 x n2)/|n1 x n2|
15. **small circle**: centre c, ground radius r: {p : p.c = cos rho}, rho = r/R; p(t) = cos rho c + sin rho (cos t N + sin t E). App draws a flat tangent-plane circle of radius r (difference: sagitta r^2/2R = 7 mm at 300 m).
16. **wedge index (any point on Earth)**: k = floor( ((theta(c->p) - 0) mod 360) / 30 ), k = 0..11; equivalently lune test p.n(30k) < 0 and p.n(30k+30) > 0 with n(theta) = v x d_theta, n(theta+180) = -n(theta)
17. **spherical polygon area**: A = R^2 |sum_i 2 atan2( c.(a_i x a_i+1), 1 + c.a_i + a_i.a_i+1 + a_i+1.c )|, c = normalised vertex mean (vertices joined by great-circle arcs)
18. **point in spherical polygon**: ray-cast along a great circle from p to a point known outside; or (small polygons) flat test in ENU/azimuthal-equidistant at the polygon centre
19. **horizon**: distance to the geometric horizon for eye height h: d = sqrt(2Rh + h^2) (h = 1.6 m -> 4,515 m; 1.8 m -> 4,789 m; 100 m -> 35.7 km). Ground drop at arc s: R(1 - cos(s/R)) ~ s^2/2R (1 km 7.8 cm, 10 km 7.85 m, 110 km 950 m).
20. **past the horizon**: every world object is placed at its TRUE ENU position (through the planet, negative elevation), drawn with depth test off so it shows through the ground; world great circles skip points < 60 km from the viewer (the 110 km ground half-lines own the near part); Quest projects world points to a 3 km shell along the true direction (direction and angular size preserved). Edge-of-Earth markers sit 90 deg of arc away (10,007.5 km): chord R*sqrt2 = 9,010 km, elevation -45 deg. Antipode: chord 2R = 12,742 km, elevation -90 deg.
21. **antipode**: v_anti = -v: lat_a = -lat, lon_a = lon + 180 (wrapped to [-180,180))
22. **azimuthal-equidistant (continent triangulation)**: c = acos(sin lat0 sin lat + cos lat0 cos lat cos dlon); k = c/sin c; x = k cos lat sin dlon R, y = k (cos lat0 sin lat - sin lat0 cos lat cos dlon) R; earcut there, triangles subdivided to <= 150-250 km, each vertex placed back on the sphere

### How the app maps the sphere into Three.js (as coded)
- `index.html`: `ecef()` + `toENU()` from the viewer; world group in km (`SC = 1e-3`): globe, continents, mountains, far markers, edge markers, vortex great circles, antipodes. Local group in metres, re-centred so the viewer stays at the origin (`local.position = -smoothed position`).
- Exact ENU (with curvature drop) is used for the vortex centres, the 110 km vortex ground half-lines, the PT shoreline, night glow and trails (daynight `proj`), satellite tiles and terrain.
- The flat 111,320 m/deg map is used for landmark pillars/beams/labels, saucers, streets/Sheridan, Ren, the meditation circle, performers, bots and the d44 pillars (`toLocalW`). Floor y = −1.6 m (eye height), no drop.
- `quest.html`: `enu()` in metres from HOME (manual location or Ready Athletics); world shapes beyond reach are pushed to a 3 km shell (`makeVortexWorldTubes`) or labels to ≤ 400 m along the true direction.
- Up = +y, North = −z, East = +x in every page.

## 2. Vortex wedge geometry (locked)
- Centres: Ready Athletics (48.1062, −122.8057) gold; Cappy's Trails / Happy's Trails vortex pillar (48.13165, −122.79921) green; Matt's Meditation Garden (48.1316475, −122.7992293) purple (the Happy's Trails Vortex music source, 1.46 m from Cappy's pillar at bearing 259°).
- Dividing lines: bearings θ_k = 30k°, k = 0..11 → 6 full great circles (k = 0..5). Normal **n_k = v × d_θk**, d_θ = cos θ·N + sin θ·E. All 12 half-lines meet at the antipode −v.
- Wedge k = bearings [30k, 30k+30). Test: k = ⌊(bearing(c→p) mod 360)/30⌋ ⇔ p·n(30k) < 0 ∧ p·n(30k+30) > 0 (verified on 2,000 random points per vortex).
- Coloured fill radius 300 m (flat sector in the tangent plane); ground half-lines 110 km; hub 180 m; world circles full 360°.

| vortex | antipode | k | bearings | normal n_k | circle pole (lat, lon) |
|---|---|---|---|---|---|
| vxRA | -48.1062000, 57.1943000 | 0 | 0/180 | (-0.840512708, 0.541791830, 0.000000000) | 0.0, 147.1943 |
| vxRA | -48.1062000, 57.1943000 | 1 | 30/210 | (-0.526254824, 0.782037514, 0.333876005) | 19.504203, 123.937708 |
| vxRA | -48.1062000, 57.1943000 | 2 | 60/240 | (-0.070987386, 0.812736877, 0.578290203) | 35.330374, 94.991753 |
| vxRA | -48.1062000, 57.1943000 | 3 | 90/270 | (0.403301066, 0.625664051, 0.667752009) | 41.8938, 57.1943 |
| vxRA | -48.1062000, 57.1943000 | 4 | 120/300 | (0.769525323, 0.270945047, 0.578290203) | 35.330374, 19.396847 |
| vxRA | -48.1062000, 57.1943000 | 5 | 150/330 | (0.929555890, -0.156373463, 0.333876005) | 19.504203, -9.549108 |
| vxCappy | -48.1316500, 57.2007900 | 0 | 0/180 | (-0.840574073, 0.541696620, -0.000000000) | -0.0, 147.20079 |
| vxCappy | -48.1316500, 57.2007900 | 1 | 30/210 | (-0.526263089, 0.782102528, 0.333710649) | 19.494152, 123.935919 |
| vxCappy | -48.1316500, 57.2007900 | 2 | 60/240 | (-0.070940335, 0.812944695, 0.578003799) | 35.310263, 94.987192 |
| vxCappy | -48.1316500, 57.2007900 | 3 | 90/270 | (0.403390824, 0.625958987, 0.667421298) | 41.86835, 57.20079 |
| vxCappy | -48.1316500, 57.2007900 | 4 | 120/300 | (0.769633738, 0.271248074, 0.578003799) | 35.310263, 19.414388 |
| vxCappy | -48.1316500, 57.2007900 | 5 | 150/330 | (0.929653913, -0.156143541, 0.333710649) | 19.494152, -9.534339 |
| vxGarden | -48.1316475, 57.2007707 | 0 | 0/180 | (-0.840573890, 0.541696904, 0.000000000) | 0.0, 147.200771 |
| vxGarden | -48.1316475, 57.2007707 | 1 | 30/210 | (-0.526262833, 0.782102693, 0.333710665) | 19.494153, 123.935901 |
| vxGarden | -48.1316475, 57.2007707 | 2 | 60/240 | (-0.070940075, 0.812944697, 0.578003828) | 35.310265, 94.987174 |
| vxGarden | -48.1316475, 57.2007707 | 3 | 90/270 | (0.403391019, 0.625958827, 0.667421331) | 41.868353, 57.200771 |
| vxGarden | -48.1316475, 57.2007707 | 4 | 120/300 | (0.769633815, 0.271247794, 0.578003828) | 35.310265, 19.414367 |
| vxGarden | -48.1316475, 57.2007707 | 5 | 150/330 | (0.929653852, -0.156143866, 0.333710665) | 19.494153, -9.534359 |

Separations: vxRA-vxCappy: 2870.63 m at 9.659°; vxRA-vxGarden: 2870.11 m at 9.632°; vxCappy-vxGarden: 1.46 m at 259.017°

## 3. Continents and Port Townsend shoreline
See table in HANDOFF.md §4. `continents.geojson` = exactly the rings the app renders (Natural Earth 1:50m, public domain). `pt-shoreline.geojson` = fresh OSM coastline (Overpass, 2026-10-17) for the Quimper Peninsula incl. Point Hudson, Fort Worden/Point Wilson, North Beach, Kah Tai, Boat Haven, plus lagoons/harbour structures from `shore.json` (© OpenStreetMap contributors, ODbL). `to_vectors.py` converts both to unit vectors. Renders: `/workspace/geometry-globe.png`, `/workspace/geometry-pt.png`.

## 4. Geometry record
273 objects. Counts: landmarks 35, saucers 7, lines 7, vortex 25, garden 2, circle 33, night 6, sky 4, trails 11, streets 4, geography 14, far 7, edges 3, bots 15, characters 1, test 2, vehicles 1, pillars 96.

| cat | id | name | type | lat | lon | size | anchor | source |
|---|---|---|---|---|---|---|---|---|
| landmarks | lm1.pillar | Ready Athletics (997800502) - pillar | landmark pillar | 48.1062 | -122.8057 | r_m 1.5, h_m 120 | floor (-1.6 m below eye), flat local map | index.html TARGETS |
| landmarks | lm1.beam | Ready Athletics (997800502) - light beam | beam | 48.1062 | -122.8057 | r_m 2.5, h_m 200 | floor | index.html addBeamShape |
| landmarks | lm1.ring | Ready Athletics (997800502) - ground ring | ring | 48.1062 | -122.8057 | r_in_m 5, r_out_m 7 | floor +0.05 m | index.html addBeamShape |
| landmarks | lm1.shape | Ready Athletics (997800502) - type shape (field) | type shape | 48.1062 | -122.8057 |  | floor | index.html addBeamShape |
| landmarks | lm1.label | Ready Athletics (997800502) - label | label | 48.1062 | -122.8057 | y_m 135 | floor | index.html |
| saucers | lm1.saucer | Ready Athletics (997800502) - saucer + landing pad | saucer | 48.1059305 | -122.8052964 | hover_y_m 34, scale 2.2 | floor; offset 30 m east, 30 m south of the landmark (flat) | index.html buildX + extras.makeSaucer |
| lines | lm1.line | Line to Ready Athletics (997800502) | line to landmark | 48.1062 | -122.8057 |  | viewer-relative generator (no viewer position recorded) | index.html updLocal / quest.html PLACES |
| landmarks | lm2.pillar | Cappy's Trails garden (998002802) - pillar | landmark pillar | 48.13165 | -122.79921 | r_m 1.5, h_m 120 | floor (-1.6 m below eye), flat local map | index.html TARGETS |
| landmarks | lm2.beam | Cappy's Trails garden (998002802) - light beam | beam | 48.13165 | -122.79921 | r_m 2.5, h_m 200 | floor | index.html addBeamShape |
| landmarks | lm2.ring | Cappy's Trails garden (998002802) - ground ring | ring | 48.13165 | -122.79921 | r_in_m 5, r_out_m 7 | floor +0.05 m | index.html addBeamShape |
| landmarks | lm2.shape | Cappy's Trails garden (998002802) - type shape (park) | type shape | 48.13165 | -122.79921 |  | floor | index.html addBeamShape |
| landmarks | lm2.label | Cappy's Trails garden (998002802) - label | label | 48.13165 | -122.79921 | y_m 135 | floor | index.html |
| saucers | lm2.saucer | Cappy's Trails garden (998002802) - saucer + landing pad | saucer | 48.1314883 | -122.7989677 | hover_y_m 22, scale 1 | floor; offset 18 m east, 18 m south of the landmark (flat) | index.html buildX + extras.makeSaucer |
| lines | lm2.line | Line to Cappy's Trails garden (998002802) | line to landmark | 48.13165 | -122.79921 |  | viewer-relative generator (no viewer position recorded) | index.html updLocal / quest.html PLACES |
| landmarks | lm3.pillar | Memory's Vault, Fort Worden - pillar | landmark pillar | 48.1384642 | -122.7647029 | r_m 1.5, h_m 120 | floor (-1.6 m below eye), flat local map | index.html TARGETS |
| landmarks | lm3.beam | Memory's Vault, Fort Worden - light beam | beam | 48.1384642 | -122.7647029 | r_m 2.5, h_m 200 | floor | index.html addBeamShape |
| landmarks | lm3.ring | Memory's Vault, Fort Worden - ground ring | ring | 48.1384642 | -122.7647029 | r_in_m 5, r_out_m 7 | floor +0.05 m | index.html addBeamShape |
| landmarks | lm3.shape | Memory's Vault, Fort Worden - type shape (landmark) | type shape | 48.1384642 | -122.7647029 |  | floor | index.html addBeamShape |
| landmarks | lm3.label | Memory's Vault, Fort Worden - label | label | 48.1384642 | -122.7647029 | y_m 135 | floor | index.html |
| saucers | lm3.saucer | Memory's Vault, Fort Worden - saucer + landing pad | saucer | 48.1383025 | -122.7644606 | hover_y_m 22, scale 1 | floor; offset 18 m east, 18 m south of the landmark (flat) | index.html buildX + extras.makeSaucer |
| lines | lm3.line | Line to Memory's Vault, Fort Worden | line to landmark | 48.1384642 | -122.7647029 |  | viewer-relative generator (no viewer position recorded) | index.html updLocal / quest.html PLACES |
| landmarks | lm4.pillar | Port Townsend City Hall - pillar | landmark pillar | 48.1161771 | -122.753612 | r_m 1.5, h_m 120 | floor (-1.6 m below eye), flat local map | index.html TARGETS |
| landmarks | lm4.beam | Port Townsend City Hall - light beam | beam | 48.1161771 | -122.753612 | r_m 2.5, h_m 200 | floor | index.html addBeamShape |
| landmarks | lm4.ring | Port Townsend City Hall - ground ring | ring | 48.1161771 | -122.753612 | r_in_m 5, r_out_m 7 | floor +0.05 m | index.html addBeamShape |
| landmarks | lm4.shape | Port Townsend City Hall - type shape (building) | type shape | 48.1161771 | -122.753612 |  | floor | index.html addBeamShape |
| landmarks | lm4.label | Port Townsend City Hall - label | label | 48.1161771 | -122.753612 | y_m 135 | floor | index.html |
| saucers | lm4.saucer | Port Townsend City Hall - saucer + landing pad | saucer | 48.1160154 | -122.7533698 | hover_y_m 22, scale 1 | floor; offset 18 m east, 18 m south of the landmark (flat) | index.html buildX + extras.makeSaucer |
| lines | lm4.line | Line to Port Townsend City Hall | line to landmark | 48.1161771 | -122.753612 |  | viewer-relative generator (no viewer position recorded) | index.html updLocal / quest.html PLACES |
| landmarks | lm5.pillar | Jefferson County Sheriff's Office - pillar | landmark pillar | 48.0241638 | -122.764488 | r_m 1.5, h_m 120 | floor (-1.6 m below eye), flat local map | index.html TARGETS |
| landmarks | lm5.beam | Jefferson County Sheriff's Office - light beam | beam | 48.0241638 | -122.764488 | r_m 2.5, h_m 200 | floor | index.html addBeamShape |
| landmarks | lm5.ring | Jefferson County Sheriff's Office - ground ring | ring | 48.0241638 | -122.764488 | r_in_m 5, r_out_m 7 | floor +0.05 m | index.html addBeamShape |
| landmarks | lm5.shape | Jefferson County Sheriff's Office - type shape (building) | type shape | 48.0241638 | -122.764488 |  | floor | index.html addBeamShape |
| landmarks | lm5.label | Jefferson County Sheriff's Office - label | label | 48.0241638 | -122.764488 | y_m 135 | floor | index.html |
| saucers | lm5.saucer | Jefferson County Sheriff's Office - saucer + landing pad | saucer | 48.0240021 | -122.7642462 | hover_y_m 22, scale 1 | floor; offset 18 m east, 18 m south of the landmark (flat) | index.html buildX + extras.makeSaucer |
| lines | lm5.line | Line to Jefferson County Sheriff's Office | line to landmark | 48.0241638 | -122.764488 |  | viewer-relative generator (no viewer position recorded) | index.html updLocal / quest.html PLACES |
| landmarks | lm6.pillar | Jefferson Healthcare Hospital - pillar | landmark pillar | 48.1060007 | -122.7889962 | r_m 1.5, h_m 120 | floor (-1.6 m below eye), flat local map | index.html TARGETS |
| landmarks | lm6.beam | Jefferson Healthcare Hospital - light beam | beam | 48.1060007 | -122.7889962 | r_m 2.5, h_m 200 | floor | index.html addBeamShape |
| landmarks | lm6.ring | Jefferson Healthcare Hospital - ground ring | ring | 48.1060007 | -122.7889962 | r_in_m 5, r_out_m 7 | floor +0.05 m | index.html addBeamShape |
| landmarks | lm6.shape | Jefferson Healthcare Hospital - type shape (hospital) | type shape | 48.1060007 | -122.7889962 |  | floor | index.html addBeamShape |
| landmarks | lm6.label | Jefferson Healthcare Hospital - label | label | 48.1060007 | -122.7889962 | y_m 135 | floor | index.html |
| saucers | lm6.saucer | Jefferson Healthcare Hospital - saucer + landing pad | saucer | 48.105839 | -122.7887541 | hover_y_m 22, scale 1 | floor; offset 18 m east, 18 m south of the landmark (flat) | index.html buildX + extras.makeSaucer |
| lines | lm6.line | Line to Jefferson Healthcare Hospital | line to landmark | 48.1060007 | -122.7889962 |  | viewer-relative generator (no viewer position recorded) | index.html updLocal / quest.html PLACES |
| landmarks | lm7.pillar | Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) - pillar | landmark pillar | 48.1139683 | -122.7628233 | r_m 1.5, h_m 120 | floor (-1.6 m below eye), flat local map | index.html TARGETS |
| landmarks | lm7.beam | Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) - light beam | beam | 48.1139683 | -122.7628233 | r_m 2.5, h_m 200 | floor | index.html addBeamShape |
| landmarks | lm7.ring | Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) - ground ring | ring | 48.1139683 | -122.7628233 | r_in_m 5, r_out_m 7 | floor +0.05 m | index.html addBeamShape |
| landmarks | lm7.shape | Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) - type shape (building) | type shape | 48.1139683 | -122.7628233 |  | floor | index.html addBeamShape |
| landmarks | lm7.label | Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) - label | label | 48.1139683 | -122.7628233 | y_m 135 | floor | index.html |
| saucers | lm7.saucer | Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) - saucer + landing pad | saucer | 48.1138066 | -122.7625811 | hover_y_m 22, scale 1 | floor; offset 18 m east, 18 m south of the landmark (flat) | index.html buildX + extras.makeSaucer |
| lines | lm7.line | Line to Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) | line to landmark | 48.1139683 | -122.7628233 |  | viewer-relative generator (no viewer position recorded) | index.html updLocal / quest.html PLACES |
| vortex | vxRA.pillar | Ready Athletics Vortex - vortex pillar | vortex pillar | 48.1062 | -122.8057 | h_m 420 | floor, exact ENU | extras.makeVortexPillar |
| vortex | vxRA.funnel | Ready Athletics Vortex - spiral funnel | spiral | 48.1062 | -122.8057 | h_m 24 | floor | extras.makeVortexLocal (scale .6) |
| vortex | vxRA.wedges | Ready Athletics Vortex - 12 wedge fills | wedge fill | 48.1062 | -122.8057 | r_m 300 | floor +0.01 | extras.makeVortexWedges(T,300,0) |
| vortex | vxRA.ground | Ready Athletics Vortex - 12 ground half-lines | great-circle half-lines | 48.1062 | -122.8057 | len_km 110 | floor +0.05 | extras.vortexGroundLines |
| vortex | vxRA.hub | Ready Athletics Vortex - white hub lines | hub | 48.1062 | -122.8057 | len_m 180 | floor +0.07 | index.html addVortexLocal |
| vortex | vxRA.circles | Ready Athletics Vortex - 6 world great circles | great circles | 48.1062 | -122.8057 | k 6 | world (ENU km); Quest: projected to 3 km shell | extras.vortexWorldCircles |
| vortex | vxRA.antipode | Ready Athletics Vortex - antipode marker | antipode | -48.1062 | 57.1943 |  | world, through the Earth (12,742 km chord) | index.html buildVW |
| vortex | vxRA.label | Ready Athletics Vortex - label | label | 48.1062 | -122.8057 | y_m 440 | floor | index.html addVortexLocal |
| vortex | vxCappy.pillar | Cappy's (Happy's) Trails Vortex pillar - vortex pillar | vortex pillar | 48.13165 | -122.79921 | h_m 420 | floor, exact ENU | extras.makeVortexPillar |
| vortex | vxCappy.funnel | Cappy's (Happy's) Trails Vortex pillar - spiral funnel | spiral | 48.13165 | -122.79921 | h_m 24 | floor | extras.makeVortexLocal (scale .6) |
| vortex | vxCappy.wedges | Cappy's (Happy's) Trails Vortex pillar - 12 wedge fills | wedge fill | 48.13165 | -122.79921 | r_m 300 | floor +0.01 | extras.makeVortexWedges(T,300,0) |
| vortex | vxCappy.ground | Cappy's (Happy's) Trails Vortex pillar - 12 ground half-lines | great-circle half-lines | 48.13165 | -122.79921 | len_km 110 | floor +0.05 | extras.vortexGroundLines |
| vortex | vxCappy.hub | Cappy's (Happy's) Trails Vortex pillar - white hub lines | hub | 48.13165 | -122.79921 | len_m 180 | floor +0.07 | index.html addVortexLocal |
| vortex | vxCappy.circles | Cappy's (Happy's) Trails Vortex pillar - 6 world great circles | great circles | 48.13165 | -122.79921 | k 6 | world (ENU km); Quest: projected to 3 km shell | extras.vortexWorldCircles |
| vortex | vxCappy.antipode | Cappy's (Happy's) Trails Vortex pillar - antipode marker | antipode | -48.13165 | 57.20079 |  | world, through the Earth (12,742 km chord) | index.html buildVW |
| vortex | vxCappy.label | Cappy's (Happy's) Trails Vortex pillar - label | label | 48.13165 | -122.79921 | y_m 440 | floor | index.html addVortexLocal |
| vortex | vxGarden.pillar | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - vortex pillar | vortex pillar | 48.1316475 | -122.7992293 | h_m 420 | floor, exact ENU | extras.makeVortexPillar |
| vortex | vxGarden.funnel | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - spiral funnel | spiral | 48.1316475 | -122.7992293 | h_m 24 | floor | extras.makeVortexLocal (scale .6) |
| vortex | vxGarden.wedges | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - 12 wedge fills | wedge fill | 48.1316475 | -122.7992293 | r_m 300 | floor +0.01 | extras.makeVortexWedges(T,300,0) |
| vortex | vxGarden.ground | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - 12 ground half-lines | great-circle half-lines | 48.1316475 | -122.7992293 | len_km 110 | floor +0.05 | extras.vortexGroundLines |
| vortex | vxGarden.hub | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - white hub lines | hub | 48.1316475 | -122.7992293 | len_m 180 | floor +0.07 | index.html addVortexLocal |
| vortex | vxGarden.circles | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - 6 world great circles | great circles | 48.1316475 | -122.7992293 | k 6 | world (ENU km); Quest: projected to 3 km shell | extras.vortexWorldCircles |
| vortex | vxGarden.antipode | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - antipode marker | antipode | -48.1316475 | 57.2007707 |  | world, through the Earth (12,742 km chord) | index.html buildVW |
| vortex | vxGarden.label | Matt's Meditation Garden vortex (Happy's Trails Vortex music source) - label | label | 48.1316475 | -122.7992293 | y_m 500 | floor | index.html addVortexLocal |
| vortex | vxGarden.speaker | Speaker label: Happy's Trails Vortex - Matt's Meditation Garden | label | 48.1316475 | -122.7992293 | y_m 120 | floor | index.html buildX |
| garden | garden.music | Music beacon: Happy's Trails Vortex (Matt's Meditation Garden) | sound source | 48.1316475 | -122.7992293 |  | ground | audio.js SRC |
| garden | garden.fallbackRing | Garden fallback glow ring (until circle.js loads) | ring | 48.1316475 | -122.7992293 | r_in_m 1, r_out_m 9 | ground +0.15 | daynight.js / figures-registry GARDEN_FALLBACK_RING |
| circle | circle.stone00 | Standing stone 0 | stone | 48.1316798 | -122.7992293 | center_y_m 0.38 | bearing 0 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion00 | Cushion 0 | cushion | 48.1316746 | -122.7992293 | y_m 0.1 | bearing 0 deg, r 3.02 m | circle.js |
| circle | circle.stone01 | Standing stone 1 | stone | 48.1316755 | -122.7992051 | center_y_m 0.44 | bearing 30 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion01 | Cushion 1 | cushion | 48.131671 | -122.799209 | y_m 0.1 | bearing 30 deg, r 3.02 m | circle.js |
| circle | circle.stone02 | Standing stone 2 | stone | 48.1316637 | -122.7991873 | center_y_m 0.5 | bearing 60 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion02 | Cushion 2 | cushion | 48.1316611 | -122.7991941 | y_m 0.1 | bearing 60 deg, r 3.02 m | circle.js |
| circle | circle.stone03 | Standing stone 3 | stone | 48.1316475 | -122.7991808 | center_y_m 0.38 | bearing 90 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion03 | Cushion 3 | cushion | 48.1316475 | -122.7991887 | y_m 0.1 | bearing 90 deg, r 3.02 m | circle.js |
| circle | circle.stone04 | Standing stone 4 | stone | 48.1316313 | -122.7991873 | center_y_m 0.44 | bearing 120 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion04 | Cushion 4 | cushion | 48.1316339 | -122.7991941 | y_m 0.1 | bearing 120 deg, r 3.02 m | circle.js |
| circle | circle.stone05 | Standing stone 5 | stone | 48.1316195 | -122.7992051 | center_y_m 0.5 | bearing 150 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion05 | Cushion 5 | cushion | 48.131624 | -122.799209 | y_m 0.1 | bearing 150 deg, r 3.02 m | circle.js |
| circle | circle.stone06 | Standing stone 6 | stone | 48.1316152 | -122.7992293 | center_y_m 0.38 | bearing 180 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion06 | Cushion 6 | cushion | 48.1316204 | -122.7992293 | y_m 0.1 | bearing 180 deg, r 3.02 m | circle.js |
| circle | circle.stone07 | Standing stone 7 | stone | 48.1316195 | -122.7992535 | center_y_m 0.44 | bearing 210 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion07 | Cushion 7 | cushion | 48.131624 | -122.7992496 | y_m 0.1 | bearing 210 deg, r 3.02 m | circle.js |
| circle | circle.stone08 | Standing stone 8 | stone | 48.1316313 | -122.7992713 | center_y_m 0.5 | bearing 240 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion08 | Cushion 8 | cushion | 48.1316339 | -122.7992645 | y_m 0.1 | bearing 240 deg, r 3.02 m | circle.js |
| circle | circle.stone09 | Standing stone 9 | stone | 48.1316475 | -122.7992778 | center_y_m 0.38 | bearing 270 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion09 | Cushion 9 | cushion | 48.1316475 | -122.7992699 | y_m 0.1 | bearing 270 deg, r 3.02 m | circle.js |
| circle | circle.stone10 | Standing stone 10 | stone | 48.1316637 | -122.7992713 | center_y_m 0.44 | bearing 300 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion10 | Cushion 10 | cushion | 48.1316611 | -122.7992645 | y_m 0.1 | bearing 300 deg, r 3.02 m | circle.js |
| circle | circle.stone11 | Standing stone 11 | stone | 48.1316755 | -122.7992535 | center_y_m 0.5 | bearing 330 deg, r 3.6 m from Garden pin | circle.js |
| circle | circle.cushion11 | Cushion 11 | cushion | 48.131671 | -122.7992496 | y_m 0.1 | bearing 330 deg, r 3.02 m | circle.js |
| circle | circle.orb0 | Floating orb 0 | orb | 48.1316783 | -122.7992169 | y_m 1.25 +- .12 (bob) | bearing 15 deg, r 3.55 m | circle.js |
| circle | circle.orb1 | Floating orb 1 | orb | 48.1316558 | -122.7991831 | y_m 1.25 +- .12 (bob) | bearing 75 deg, r 3.55 m | circle.js |
| circle | circle.orb2 | Floating orb 2 | orb | 48.131625 | -122.7991955 | y_m 1.25 +- .12 (bob) | bearing 135 deg, r 3.55 m | circle.js |
| circle | circle.orb3 | Floating orb 3 | orb | 48.1316167 | -122.7992417 | y_m 1.25 +- .12 (bob) | bearing 195 deg, r 3.55 m | circle.js |
| circle | circle.orb4 | Floating orb 4 | orb | 48.1316392 | -122.7992755 | y_m 1.25 +- .12 (bob) | bearing 255 deg, r 3.55 m | circle.js |
| circle | circle.orb5 | Floating orb 5 | orb | 48.13167 | -122.7992631 | y_m 1.25 +- .12 (bob) | bearing 315 deg, r 3.55 m | circle.js |
| circle | circle.pavers | 12 pavers (annular wedges) + seams | pavers | 48.1316475 | -122.7992293 | r_in_m 0.95, r_out_m 2.55 | ground | circle.js |
| circle | circle.lotus | Lotus dais | dais | 48.1316475 | -122.7992293 | h_m 0.18 | ground, centred on the Garden pin | circle.js |
| circle | circle.floorGlow | Circle floor glow | glow ring | 48.1316475 | -122.7992293 |  | ground | circle.js |
| night | night.vxRA.beams | Ready Athletics night beams | beam | 48.1062 | -122.8057 | h_m 1500 | ground, fades in with night | daynight.js |
| night | night.vxRA.ring | Ready Athletics night ring | ring | 48.1062 | -122.8057 | r_in_m 1, r_out_m 46 | ground +0.12 | daynight.js |
| night | night.vxRA.halos | Ready Athletics night halos | halo sprites | 48.1062 | -122.8057 |  | ground | daynight.js |
| night | night.vxCappy.beams | Cappy's Trails night beams | beam | 48.13165 | -122.79921 | h_m 1500 | ground, fades in with night | daynight.js |
| night | night.vxCappy.ring | Cappy's Trails night ring | ring | 48.13165 | -122.79921 | r_in_m 1, r_out_m 46 | ground +0.12 | daynight.js |
| night | night.vxCappy.halos | Cappy's Trails night halos | halo sprites | 48.13165 | -122.79921 |  | ground | daynight.js |
| sky | sky.stars | Star field | stars | - | - |  | viewer-centred sky | daynight.js starField |
| sky | sky.sun | Sun | celestial body | - | - |  | viewer-centred, real time | sky.js |
| sky | sky.moon | Moon | celestial body | - | - |  | viewer-centred, real time | sky.js |
| sky | sky.dome | Sky / dark dome | sky sphere | - | - |  | viewer-centred | extras.makeDarkSky / daynight |
| trails | trail.cappy.81579942 | Cappy's trail, OSM way 81579942 (path) | trail | 48.1308607 | -122.7995953 | length_m_sphere 535.2, length_m_src 536, vertices 5 | ground | trails.json / daynight.js |
| trails | trail.cappy.81579947 | Cappy's trail, OSM way 81579947 (path) | trail | 48.1341279 | -122.7958988 | length_m_sphere 701.4, length_m_src 702, vertices 24 | ground | trails.json / daynight.js |
| trails | trail.cappy.81579958 | Cappy's trail, OSM way 81579958 (path) | trail | 48.1349094 | -122.7995515 | length_m_sphere 489.1, length_m_src 490, vertices 12 | ground | trails.json / daynight.js |
| trails | trail.cappy.456854675 | Cappy's trail, OSM way 456854675 (path) | trail | 48.1326473 | -122.7950061 | length_m_sphere 351.1, length_m_src 352, vertices 11 | ground | trails.json / daynight.js |
| trails | trail.cappy.493747360 | Cappy's trail, OSM way 493747360 (path) | trail | 48.1309591 | -122.7980461 | length_m_sphere 975.9, length_m_src 977, vertices 47 | ground | trails.json / daynight.js |
| trails | trail.cappy.1306467939 | Cappy's trail, OSM way 1306467939 (path) | trail | 48.1294722 | -122.7952285 | length_m_sphere 416.0, length_m_src 417, vertices 13 | ground | trails.json / daynight.js |
| trails | trail.cappy.1306467995 | Cappy's trail, OSM way 1306467995 (path) | trail | 48.130282 | -122.801936 | length_m_sphere 454.3, length_m_src 455, vertices 9 | ground | trails.json / daynight.js |
| trails | trail.ra.203382512 | Ready Athletics trail, OSM way 203382512 (path) | trail | 48.1133626 | -122.8052215 | length_m_sphere 489.2, length_m_src 490, vertices 5 | ground | trails.json / daynight.js |
| trails | trail.ra.203383552 | Ready Athletics trail, OSM way 203383552 (path) | trail | 48.1101196 | -122.8050789 | length_m_sphere 137.3, length_m_src 137, vertices 4 | ground | trails.json / daynight.js |
| trails | parcel.998002802 | Parcel 998002802 outline (Cappy's Trails garden) | parcel outline | 48.1316469 | -122.7992587 | area_m2_sphere 1872.0, perimeter_m 183.3 | ground | trails.json cappy_outline (WA Current_Parcels) |
| trails | parcel.997800502 | Parcel 031-997800502 outline (Ready Athletics) - DATA ONLY, not drawn | parcel outline (not rendered) | 48.1059194 | -122.8056565 | area_m2_sphere 3007.2 | n/a | trails.json ra_parcel_outline |
| streets | street.Hastings Ave | Road path: Hastings Ave | road path | 48.1163748 | -122.8310571 | length_m 7072, vertices 195 | floor -1.55 m, flat local | streets.json |
| streets | street.Water St | Road path: Water St | road path | 48.1131616 | -122.7595122 | length_m 1507, vertices 63 | floor -1.55 m, flat local | streets.json |
| streets | street.Downtown → Fort Word | Road path: Downtown → Fort Worden → North Beach | road path | 48.1290767 | -122.7649002 | length_m 5568, vertices 221 | floor -1.55 m, flat local | streets.json |
| streets | street.sheridan | Sheridan St | road path | - | - | length_m 2740 | floor | sheridan.json |
| geography | geo.pt_shore | Port Townsend shoreline (OSM coastline, full detail) | shoreline | - | - |  | floor, exact ENU (curvature drop) | shore.json -> geometry/pt-shoreline.geojson |
| geography | geo.ocean | Ocean surface + coast (old) | ocean mesh | - | - |  | floor | extras.makeOcean / coast.json |
| geography | geo.grid | Ground grid | grid | - | - |  | floor, centred on grid origin (round(lat,3),round(lon,3)) | index.html buildLocal / quest grid-plane |
| geography | geo.satellite | Satellite imagery layer (optional) | imagery | - | - |  | ground | sat.js (Imagery (c) Esri) |
| geography | geo.africa | Africa (true-scale outline + fill) | continent | 2.0 | 20.0 | area_km2_src 30856334 | sphere surface (world, ENU km) | continents.json -> geometry/continents.geojson |
| geography | geo.north_america | North America (true-scale outline + fill) | continent | 50.0 | -100.0 | area_km2_src 24717521 | sphere surface (world, ENU km) | continents.json -> geometry/continents.geojson |
| geography | geo.south_america | South America (true-scale outline + fill) | continent | -18.0 | -60.0 | area_km2_src 18030583 | sphere surface (world, ENU km) | continents.json -> geometry/continents.geojson |
| geography | geo.asia | Asia (true-scale outline + fill) | continent | 45.0 | 90.0 | area_km2_src 45999549 | sphere surface (world, ENU km) | continents.json -> geometry/continents.geojson |
| geography | geo.europe | Europe (true-scale outline + fill) | continent | 52.0 | 15.0 | area_km2_src 9880840 | sphere surface (world, ENU km) | continents.json -> geometry/continents.geojson |
| geography | geo.antarctica | Antarctica (true-scale outline + fill) | continent | - | - | area_km2_src None | sphere surface (world, ENU km) | landmass.json -> geometry/continents.geojson |
| geography | geo.australia | Australia (true-scale outline + fill) | continent | - | - | area_km2_src None | sphere surface (world, ENU km) | landmass.json -> geometry/continents.geojson |
| geography | geo.antarctic_ice_shelves | Antarctic ice shelves (true-scale outline + fill) | continent | - | - | area_km2_src None | sphere surface (world, ENU km) | landmass.json -> geometry/continents.geojson |
| geography | geo.rainier | Mount Rainier (true-scale terrain + 15 km ring) | mountain | 46.8528857 | -121.7603744 | summit_m 4392, ring_r_m 15000 | sphere surface + h | mountains.json / extras.makeTerrain |
| geography | geo.baker | Mount Baker (true-scale terrain + 15 km ring) | mountain | 48.7767 | -121.8144 | summit_m 3286, ring_r_m 15000 | sphere surface + h | mountains.json / extras.makeTerrain |
| far | far.north_pole | North Pole | far marker | 90.0 | 0.0 |  | sphere surface, local up, through the Earth | index.html FAR / quest.html PLACES |
| far | far.south_pole | South Pole | far marker | -90.0 | 0.0 |  | sphere surface, local up, through the Earth | index.html FAR / quest.html PLACES |
| far | far.great_pyramid_of_giza | Great Pyramid of Giza | far marker | 29.97917 | 31.13417 |  | sphere surface, local up, through the Earth | index.html FAR / quest.html PLACES |
| far | far.pyramid_of_khafre | Pyramid of Khafre | far marker | 29.97611 | 31.13083 |  | sphere surface, local up, through the Earth | index.html FAR / quest.html PLACES |
| far | far.great_pyramid_of_cholula | Great Pyramid of Cholula | far marker | 19.0575 | -98.30194 |  | sphere surface, local up, through the Earth | index.html FAR / quest.html PLACES |
| far | far.pyramid_of_the_sun | Pyramid of the Sun, Teotihuacan | far marker | 19.693 | -98.844 |  | sphere surface, local up, through the Earth | index.html FAR / quest.html PLACES |
| far | far.icecube_neutrino_observatory | IceCube Neutrino Observatory | far marker | -89.99 | -63.45306 |  | sphere surface, local up, through the Earth | index.html FAR / quest.html PLACES |
| edges | edge.markers | Edge-of-Earth markers N/E/S/W | edge marker | - | - | arc_deg 90, bearings [0, 90, 180, 270] | viewer-relative generator: destination(viewer, b, pi/2*R) | index.html build / quest.html PLACES |
| edges | edge.horizonRing | Horizon ring | ring | - | - |  | viewer-centred | index.html |
| edges | edge.globe | Wireframe globe | sphere | - | - | r_km 6371 | Earth centre | index.html |
| bots | edge.anchor | Edge-ring anchor: SR 20 (W Sims Way) / Mill Rd signal | anchor | 48.100386 | -122.81329 | ring_r_m 7 | ground; GM-editable (persisted on Monster in server/bots.json; code default recorded) | server.js EDGE_DEF |
| bots | edge.bot000 | Edge-0 deg (edge marker bot) | edge marker bot | 48.1004489 | -122.81329 |  | ring r 7 m, bearing 0 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot030 | Edge-30 deg (edge marker bot) | edge marker bot | 48.1004405 | -122.8132429 |  | ring r 7 m, bearing 30 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot060 | Edge-60 deg (edge marker bot) | edge marker bot | 48.1004174 | -122.8132085 |  | ring r 7 m, bearing 60 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot090 | Edge-90 deg (edge marker bot) | edge marker bot | 48.100386 | -122.8131958 |  | ring r 7 m, bearing 90 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot120 | Edge-120 deg (edge marker bot) | edge marker bot | 48.1003546 | -122.8132085 |  | ring r 7 m, bearing 120 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot150 | Edge-150 deg (edge marker bot) | edge marker bot | 48.1003315 | -122.8132429 |  | ring r 7 m, bearing 150 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot180 | Edge-180 deg (edge marker bot) | edge marker bot | 48.1003231 | -122.81329 |  | ring r 7 m, bearing 180 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot210 | Edge-210 deg (edge marker bot) | edge marker bot | 48.1003315 | -122.8133371 |  | ring r 7 m, bearing 210 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot240 | Edge-240 deg (edge marker bot) | edge marker bot | 48.1003546 | -122.8133715 |  | ring r 7 m, bearing 240 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot270 | Edge-270 deg (edge marker bot) | edge marker bot | 48.100386 | -122.8133842 |  | ring r 7 m, bearing 270 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot300 | Edge-300 deg (edge marker bot) | edge marker bot | 48.1004174 | -122.8133715 |  | ring r 7 m, bearing 300 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | edge.bot330 | Edge-330 deg (edge marker bot) | edge marker bot | 48.1004405 | -122.8133371 |  | ring r 7 m, bearing 330 deg (one per Ready Athletics wedge ray) | server.js BOTS edge group |
| bots | bot.keeper.cappy | Cappy's Keeper | keeper bot | 48.13165 | -122.79921 |  | fixed (GM can pause/hide) | server.js BOTS |
| bots | bot.keeper.ra | Ready Athletics Keeper | keeper bot | 48.1062 | -122.8057 |  | fixed | server.js BOTS |
| characters | ren | Ren (3dguru) - AI guide robot | AI character (non-human robot) | 48.13165 | -122.7991562 | h_m 1.85, hover_m 0.32, talk_r_m 15, leave_r_m 20, beam_m 400 | 4 m east of Cappy's pillar (flat offset) | figures-registry REN / ren.js |
| test | test.Ghost-1 | Ghost-1 (server TEST fixture, dummy player marker) | test fixture | 48.1062 | -122.8057 | wander_r_m 150 | target point only (live position not recorded) | server.js GHOSTS |
| test | test.Ghost-2 | Ghost-2 (server TEST fixture, dummy player marker) | test fixture | 48.13165 | -122.79921 | wander_r_m 150 | target point only (live position not recorded) | server.js GHOSTS |
| vehicles | quest.ship | Quest spaceship cockpit | vehicle | - | - |  | viewer-relative (no world position) | quest.html cockpit()/QSHIP |

### Matt Ready prism pillars (96, from pillars.json sha256 `9bb94d3932fe7f36…`)
Shape: equilateral triangular prism, side 0.7 m, height 1.8 m, texture `pillar-matt.jpg` on all 3 faces; yaw = FNV-1a(id). Full table with yaw in HANDOFF.md §5 / record.json.

| id | name | kind | area | lat | lon | yaw° |
|---|---|---|---|---|---|---|
| p001 | Point Wilson Lighthouse (at B-6) | trail | Fort Worden / Point Wilson | 48.1434258 | -122.7550952 | 238.876 |
| p002 | North Beach County Park | park | North Beach | 48.1421571 | -122.782457 | 237.4697 |
| p003 | Battery Tolles (out front) | landmark | Fort Worden / Point Wilson | 48.1419383 | -122.7708056 | 236.0634 |
| p004 | Battery Kinzie | landmark | Fort Worden / Point Wilson | 48.1418321 | -122.7609448 | 234.6572 |
| p005 | 58th St & Gise St | intersection | North Beach | 48.1417394 | -122.7877213 | 233.2509 |
| p006 | 56th St & Landes St | intersection | North Beach | 48.1403495 | -122.7831286 | 231.8446 |
| p007 | 56th St & Hendricks St | intersection | North Beach | 48.1402738 | -122.7928699 | 230.4383 |
| p008 | Fort Worden Radar Building | landmark | Fort Worden / Point Wilson | 48.1402186 | -122.7708938 | 251.5326 |
| p009 | End of the world | landmark | Cappy's trails area / Northwest | 48.1391624 | -122.7997137 | 250.1263 |
| p010 | Lighting the Way | landmark | Fort Worden / Point Wilson | 48.1385543 | -122.7615903 | 51.8279 |
| p011 | Cleveland Street | trail | North Beach | 48.1381253 | -122.7897916 | 53.2342 |
| p012 | Fort Worden Historical State Park | park | Fort Worden / Point Wilson | 48.1378515 | -122.768597 | 54.6405 |
| p013 | Skoshi's Trail | trail | Cappy's trails area / Northwest | 48.1370968 | -122.7983507 | 56.0468 |
| p014 | Battery Stoddard (out front) | landmark | Fort Worden / Point Wilson | 48.1365562 | -122.7642217 | 46.2028 |
| p015 | Trail L-5 | trail | Fort Worden / Point Wilson | 48.1362135 | -122.7743292 | 47.6091 |
| p016 | 50th St & Jackman St | intersection | North Beach | 48.1360092 | -122.7851613 | 49.0154 |
| p017 | Peary Ave & Steve St | intersection | Cappy's trails area / Northwest | 48.1356501 | -122.8102702 | 50.4217 |
| p018 | 49th St & Kuhn St | intersection | North Beach | 48.1353436 | -122.7819718 | 63.0782 |
| p019 | 49th St & Sheridan St | intersection | North Beach | 48.1353359 | -122.7908452 | 64.4845 |
| p020 | Triangle of Fire Viewpoint | landmark | Fort Worden / Point Wilson | 48.1343152 | -122.7631655 | 257.1824 |
| p021 | Coast Artillery Museum (out front) | landmark | Fort Worden / Point Wilson | 48.1342195 | -122.7659165 | 255.7761 |
| p022 | Jefferson County Fairgrounds | park | Fairgrounds / San Juan Ave | 48.1333086 | -122.7830039 | 259.9949 |
| p023 | Cook Ave & Trail Crest Dr | intersection | Cappy's trails area / Northwest | 48.1328399 | -122.8097098 | 258.5886 |
| p024 | Redwood St & W St | intersection | Fairgrounds / San Juan Ave | 48.1326439 | -122.7710496 | 251.5572 |
| p025 | San Juan Ave & U St | intersection | Fairgrounds / San Juan Ave | 48.1317188 | -122.7777583 | 250.1509 |
| p026 | 43rd St & Grant St | intersection | Cappy's trails area / Northwest | 48.1313792 | -122.7918464 | 254.3698 |
| p027 | Chestnut St & V St | intersection | Fort Worden / Point Wilson | 48.1310136 | -122.7638761 | 252.9635 |
| p028 | Cherry St & T St | intersection | Fairgrounds / San Juan Ave | 48.1303002 | -122.7695385 | 245.9321 |
| p029 | Albatross St & Cook Ave | intersection | Cappy's trails area / Northwest | 48.130145 | -122.8136846 | 244.5258 |
| p030 | Cappy's Trails (path) | trail | Cappy's trails area / Northwest | 48.13009 | -122.7996 | 248.7323 |
| p031 | 41st St & Wilson St | intersection | Fairgrounds / San Juan Ave | 48.1299682 | -122.7886622 | 250.1386 |
| p032 | Bobby McGarraugh Park | park | Fairgrounds / San Juan Ave | 48.1283088 | -122.769549 | 245.9198 |
| p033 | San Juan Ave & Tremont St | intersection | Fairgrounds / San Juan Ave | 48.1259238 | -122.7777688 | 247.326 |
| p034 | 35th St & Eddy St | intersection | Hastings / Middle Point | 48.1254882 | -122.8037343 | 254.3575 |
| p035 | Cherry St & M St | intersection | Fairgrounds / San Juan Ave | 48.1253643 | -122.7709581 | 255.7637 |
| p036 | Corona Ave & Greenway Pl | intersection | Hastings / Middle Point | 48.1250652 | -122.7949279 | 251.5449 |
| p037 | Clallam St & McKinley St | intersection | Morgan Hill / Chetzemoka | 48.1250042 | -122.7586533 | 252.9512 |
| p038 | 35th Street Park | park | Hastings / Middle Point | 48.1247688 | -122.7983402 | 237.4821 |
| p039 | Silver St & Umatilla Ave | intersection | Hastings / Middle Point | 48.1245726 | -122.7898327 | 238.8883 |
| p040 | Valley Trail | trail | Fairgrounds / San Juan Ave | 48.1237285 | -122.7754 | 251.4746 |
| p041 | Sather Park | park | Morgan Hill / Chetzemoka | 48.1230253 | -122.7639437 | 250.0683 |
| p042 | Chetzemoka Park | park | Morgan Hill / Chetzemoka | 48.1225607 | -122.7554518 | 248.662 |
| p043 | 30th St & Sherman St | intersection | Hastings / Middle Point | 48.1218962 | -122.7936093 | 247.2557 |
| p044 | Hufford Pl & Maple Pl | intersection | Uptown (Lawrence St) | 48.1217342 | -122.7662103 | 257.0997 |
| p045 | Discovery Rd & Haines St | intersection | Castle Hill / Central | 48.1214382 | -122.7798083 | 255.6935 |
| p046 | Garfield St & Monroe St | intersection | Morgan Hill / Chetzemoka | 48.1209105 | -122.7568498 | 254.2872 |
| p047 | Hastings Ave & Spring St | intersection | Hastings / Middle Point | 48.1201431 | -122.8118816 | 252.8809 |
| p048 | Hastings Ave & Thomas St | intersection | Hastings / Middle Point | 48.1201326 | -122.7996689 | 240.2243 |
| p049 | Hastings Ave & Holcomb St | intersection | Castle Hill / Central | 48.1201059 | -122.7862086 | 238.818 |
| p050 | Blaine St & Taylor St | intersection | Uptown (Lawrence St) | 48.1198779 | -122.7615781 | 243.0246 |
| p051 | Hancock St & Hastings Ave | intersection | Hastings / Middle Point | 48.1201329 | -122.7957831 | 244.4309 |
| p052 | U.S. Coast Guard Memorial | landmark | Point Hudson / east Water St | 48.1181973 | -122.7521523 | 245.8371 |
| p053 | Carolanne St & Cliff St | intersection | Hastings / Middle Point | 48.1179397 | -122.803429 | 247.2434 |
| p054 | Lawrence St & Taylor St | intersection | Uptown (Lawrence St) | 48.1178355 | -122.7596702 | 248.6497 |
| p055 | 24th St & San Juan Ave | intersection | Castle Hill / Central | 48.1174539 | -122.7779344 | 250.056 |
| p056 | Lawrence St & Polk St | intersection | Uptown (Lawrence St) | 48.1169808 | -122.7616981 | 251.4623 |
| p057 | Cherry St & Walker St | intersection | Uptown (Lawrence St) | 48.1169732 | -122.7728113 | 252.8686 |
| p058 | Memorial Field | park | Point Hudson / east Water St | 48.1168699 | -122.7544218 | 231.7743 |
| p059 | Point Hudson (at Jackson St & Water St) | intersection | Point Hudson / east Water St | 48.116553 | -122.75151 | 233.1806 |
| p060 | Port Townsend Public Library (out front) | landmark | Uptown (Lawrence St) | 48.1165011 | -122.7641044 | 43.3779 |
| p061 | Garfield St & Pierce St | intersection | Uptown (Lawrence St) | 48.1164772 | -122.7668663 | 41.9716 |
| p062 | Rothschild House State Park | park | Downtown Water St | 48.1162645 | -122.7578087 | 46.1905 |
| p063 | City Hall | landmark | Point Hudson / east Water St | 48.1161771 | -122.753612 | 44.7842 |
| p064 | 18th St & Wilson St | intersection | Castle Hill / Central | 48.1129662 | -122.7882401 | 49.003 |
| p065 | Crest Ave & Rainier St | intersection | Westside / Ready Athletics vicinity | 48.1159077 | -122.8058278 | 47.5968 |
| p066 | City Dock (at John Pope Marine Park) | park | Downtown Water St | 48.1152989 | -122.7533024 | 51.8156 |
| p067 | Haller Fountain | landmark | Downtown Water St | 48.1152013 | -122.7572599 | 50.4093 |
| p068 | YMCA (out front) | park | Uptown (Lawrence St) | 48.1151747 | -122.7728012 | 54.6282 |
| p069 | Bell Tower (out front) | landmark | Downtown Water St | 48.115057 | -122.7585368 | 53.2219 |
| p070 | Adams St & Water St | intersection | Downtown Water St | 48.1148622 | -122.755466 | 79.929 |
| p071 | 20th St & McNeil St | intersection | Castle Hill / Central | 48.1145182 | -122.7789711 | 81.3352 |
| p072 | 20th St & Jackman St | intersection | Castle Hill / Central | 48.11448 | -122.7851019 | 77.1164 |
| p073 | Union Wharf (at Taylor St & Water St) | intersection | Downtown Water St | 48.1144383 | -122.7564773 | 78.5227 |
| p074 | Discovery Rd & Grant St | intersection | Castle Hill / Central | 48.1137036 | -122.7914868 | 74.3038 |
| p075 | Lawrence St & Walker St | intersection | Uptown (Lawrence St) | 48.1135969 | -122.769814 | 75.7101 |
| p076 | Jefferson County Courthouse (out front) | landmark | Uptown (Lawrence St) | 48.1124045 | -122.7680123 | 71.4913 |
| p077 | Ready Athletics trail | trail | Westside / Ready Athletics vicinity | 48.112 | -122.80521 | 72.8975 |
| p078 | Madrona Blvd & Morning Star Way | intersection | Westside / Ready Athletics vicinity | 48.1119739 | -122.8116587 | 68.6787 |
| p079 | Austin Matthew Ln & Towne Point Ave | intersection | Westside / Ready Athletics vicinity | 48.1119658 | -122.7991517 | 70.085 |
| p080 | 14th St & McPherson St | intersection | Westside / Ready Athletics vicinity | 48.1100024 | -122.8001405 | 82.6712 |
| p081 | Gateway Park | park | Kah Tai Lagoon / Boat Haven / Sims Way | 48.1097966 | -122.7700739 | 81.2649 |
| p082 | Kah Tai Lagoon Nature Park (at Benedict St & East Sims Way) | intersection | Kah Tai Lagoon / Boat Haven / Sims Way | 48.1090189 | -122.7754335 | 79.8587 |
| p083 | Discovery Rd & Howard St | intersection | Westside / Ready Athletics vicinity | 48.1088575 | -122.8053226 | 78.4524 |
| p084 | 12th St & Hill St | intersection | Kah Tai Lagoon / Boat Haven / Sims Way | 48.1086575 | -122.7844025 | 77.0461 |
| p085 | Port Townsend Boat Haven (at Benedict St & Washington St) | intersection | Kah Tai Lagoon / Boat Haven / Sims Way | 48.1079253 | -122.7743683 | 75.6398 |
| p086 | Nora's Neighborhood Park | park | Westside / Ready Athletics vicinity | 48.1078305 | -122.7942766 | 74.2335 |
| p087 | Minnie Nakano Park | park | Kah Tai Lagoon / Boat Haven / Sims Way | 48.1069291 | -122.7836209 | 72.8272 |
| p088 | 9th St & Sheridan St | intersection | Kah Tai Lagoon / Boat Haven / Sims Way | 48.106407 | -122.7903057 | 71.421 |
| p089 | 9th St & Rainier St | intersection | Westside / Ready Athletics vicinity | 48.1063245 | -122.8059248 | 70.0147 |
| p090 | Larry Scott Memorial Trail | trail | Kah Tai Lagoon / Boat Haven / Sims Way | 48.1057596 | -122.7798791 | 74.2212 |
| p091 | 5th St & 7th St | intersection | Westside / Ready Athletics vicinity | 48.1052212 | -122.8106503 | 75.6275 |
| p092 | Cliff St & South Park Ave | intersection | Westside / Ready Athletics vicinity | 48.1043413 | -122.8027995 | 77.0338 |
| p093 | Bishop Play Park | park | Westside / Ready Athletics vicinity | 48.1041554 | -122.7957129 | 78.44 |
| p094 | Evans Vista & Rainier St | intersection | Westside / Ready Athletics vicinity | 48.1016811 | -122.8051792 | 68.5961 |
| p095 | 1st St & Grant St | intersection | Kah Tai Lagoon / Boat Haven / Sims Way | 48.1005447 | -122.7913258 | 70.0023 |
| p096 | Larry Scott Memorial Trail | trail | Westside / Ready Athletics vicinity | 48.1000411 | -122.8132261 | 71.4086 |

### Texture asset
`pillar-matt.jpg` - JPEG 432×1024 px, 39473 B, sha256 `6e0f410e1bef74fc0fb65db6875e1697c137598c9b7360a4fe2f9577aa516f0e`. Purple Matt Ready figure: stylised robot-like body with a dark screen face showing a cyan winking smile, purple velvet tailcoat tuxedo with white shirt-front and black bow tie, purple top hat with cyan band, white gloves, holding a black microphone, dark trousers and shoes, on a purple gradient background with a cyan border and the caption 'MATT READY' in yellow at the bottom. Mapping: the same full image on all 3 side faces of every pillar; per face u: 0 at corner k -> 1 at corner k+1 (left->right seen from outside), v: 0 at face bottom (y=0.08 m) -> 1 at face top (y=1.75 m); unlit (MeshBasicMaterial, sRGB), front side only. Face 0.70 x 1.67 m (aspect .419) vs image 432x1024 (aspect .422): no crop, <1% stretch.

### Excluded human depictions (pending Matt's decision; counts only, no positions)
- real players: live count only (never positions) (humans)
- Matt's Shadow bot: 1 (follows Matt's real location)
- Matt Ready performer bot (purple tuxedo rig): 1 (human depiction - pending Matt)
- other singer performer bots: 0 configured now (one per player-named singer, dynamic) (human depiction - pending Matt)
- GhostBot (purple Victorian tux, client-side, walks loops around the viewer): 1 (human depiction - pending Matt)

## 5. Possible future refinements (not part of v1.0)
- WGS84 ellipsoid (a = 6,378,137 m, f = 1/298.257223563): geodetic→ECEF, ellipsoidal ENU; differences up to ~0.3% in distance and ~0.19° in latitude geometry.
- Geodesics on the ellipsoid (Karney 2013, GeographicLib) for distance/bearing/destination and vortex lines (geodesics are not plane sections on an ellipsoid).
- Geoid heights (EGM2008) and real terrain elevation for ground objects (Port Townsend bluffs up to ~60 m).
- Atmospheric refraction (k ≈ 0.13: effective radius R/(1−k)) for horizon distance and far-object elevation.
- Replace the flat 111,320 m/deg local map by exact ENU so all layers share one projection (removes the 0.11% scale and the drop error).
- Use one radius constant for labels and rendering (6,371,000 vs 6,371,008.8 m).
- Higher-resolution continents (Natural Earth 1:10m / OSM land polygons) and tidal datum for shorelines.

