# Live Geometry - HANDOFF v1.0 (locked 2026-10-17)

Minimal, self-contained definition of the geometry. Build the replica from this file plus the hashed data files; `handoff.json` holds the same content in machine form.

## 1. Sphere and frames
- Earth: sphere, centre O, **R = 6,371,000 m**. Heights are radial: P = (R+h)·v.
- v(lat,lon) = (cos lat·cos lon, cos lat·sin lon, sin lat); +X→(0°,0°), +Y→(0°,90°E), +Z→North Pole. Inverse: lat = asin(z/|P|), lon = atan2(y,x).
- Local ENU at (lat0,lon0): E = (−sin lon0, cos lon0, 0), N = (−sin lat0·cos lon0, −sin lat0·sin lon0, cos lat0), U = v0; enu = (E·d, N·d, U·d), d = P − P0.
- Scene: x = E, y = U, z = −N. Bearings clockwise from true north; d_θ = cos θ·N + sin θ·E.
- Figures/landmark pillars/streets/prism pillars use the app's flat map: x = (lon−lon0)·111320·cos lat0, z = −(lat−lat0)·111320, y = −1.6 m (floor), origin = viewer rounded to 0.001°. A perfect replica may use exact ENU instead (difference ≤ 3 m within 2.5 km).

## 2. Lines and shapes
- Distance: d = 2R·asin√(sin²(Δlat/2) + cos lat1·cos lat2·sin²(Δlon/2)). Bearing: θ = atan2(sin Δlon·cos lat2, cos lat1·sin lat2 − sin lat1·cos lat2·cos Δlon).
- Destination: δ = d/R; lat2 = asin(sin lat1·cos δ + cos lat1·sin δ·cos θ); lon2 = lon1 + atan2(sin θ·sin δ·cos lat1, cos δ − sin lat1·sin lat2).
- Great circle through v heading θ: plane n·p = 0, **n = v × d_θ**; points p(s) = cos s·v + sin s·d_θ. Two circles meet at ±(n1×n2)/|n1×n2|.
- Small circle (centre c, ground radius r): p·c = cos(r/R); p(t) = cos ρ·c + sin ρ·(cos t·N + sin t·E).
- Line to landmark: segment viewer floor → landmark floor (Quest: label on the true direction at min(d, 400 m)).
- Edge-of-Earth markers: for b ∈ {0,90,180,270}: destination(viewer, b, πR/2) → 10,007.5 km of arc, chord 9,010 km, elevation −45°; sphere r 150 km + line + label. Horizon ring 9,990–10,000 km in the tangent plane; wireframe globe r 6,371 km.
- Horizon distance for eye height h: √(2Rh + h²) (4,515 m at 1.6 m). Anything beyond is drawn at its true position through the Earth with depth testing off (Quest: projected to a 3 km shell along the true direction).

## 3. Vortex rings and wedges
Generator for each centre c (v = v(c)): 12 half-lines θ_k = 30k°, k = 0..11 (= 6 great circles k = 0..5, normals n_k = v × d_{30k}); all meet again at the antipode −v. Wedge k = bearings [30k, 30k+30) from c; membership: k = ⌊(bearing(c→p) mod 360)/30⌋, or p·n(30k) < 0 and p·n(30k+30) > 0. Ground half-lines 110 km, white hub 180 m, wedge fill radius **300 m** (alpha (1−smoothstep(.15,1,r/300))·0.2), pillar cylinders r 16/6 h 420 m, ring 10–14 m, spiral funnel 6 arms r(u) = 0.6(2+28u²), y = 24u, angle 2πk/6 + 6πu.

| vortex | lat | lon | colour | antipode | n₀ (θ=0/180) | n₃ (θ=90/270) |
|---|---|---|---|---|---|---|
| Ready Athletics Vortex | 48.1062 | -122.8057 | #ffc800 | -48.1062000, 57.1943000 | -0.840513, 0.541792, 0.000000 | 0.403301, 0.625664, 0.667752 |
| Cappy's (Happy's) Trails Vortex pillar | 48.13165 | -122.79921 | #30ff60 | -48.1316500, 57.2007900 | -0.840574, 0.541697, -0.000000 | 0.403391, 0.625959, 0.667421 |
| Matt's Meditation Garden vortex (Happy's Trails Vortex music source) | 48.1316475 | -122.7992293 | #c080ff | -48.1316475, 57.2007707 | -0.840574, 0.541697, 0.000000 | 0.403391, 0.625959, 0.667421 |

All six normals per vortex are in `vortex-table.json` (also `handoff.json → generators.vortex`). Wedge colours k = 0..11: #ff3b30 #ff9500 #ffcc00 #9be22d #34c759 #00c7be #30b0ff #007aff #5856d6 #af52de #ff2d92 #ff6482.

## 4. Continents and Port Townsend shoreline
Each outline is an ordered vertex list of (lat, lon), mapped by P = R·v(lat,lon) and joined by great-circle arcs (slerp). Polygons are closed; fills are triangulated in an azimuthal-equidistant plane at the continent centre, subdivided to ≤ 250 km, and lifted back onto the sphere.

| file | content | vertices | bytes | sha256 | source / licence |
|---|---|---|---|---|---|
| `geometry/continents.geojson` | continent outlines+fills: Africa, North America, South America, Asia, Europe (continents.json) + Antarctica, Australia(+Tasmania), Antarctic ice shelves (landmass.json) | 19631 | 372512 | `c35895e39f404477462bb8df78643a28855c30a0ad7f084acddf889947a02330` | Natural Earth 1:50m admin-0 (v5.x), dissolved by continent, Douglas-Peucker 4 km, polygons <300 km2 dropped (as built into the app 2026-10-14/16); public domain (Natural Earth) |
| `geometry/pt-shoreline.geojson` | Port Townsend / Quimper Peninsula coastline (LineStrings) + 3 lagoons + 112 harbour structures (Polygons) + 7 labels (Points); bbox S48.04 W-122.86 N48.17 E-122.72 | 2559 | 84348 | `dd190046f8e3049075607db30c37f1d98edd6b6d0a52b9938151737c3f119013` | OSM natural=coastline via Overpass, osm_base 2026-10-17T17:55:26Z, DP 0.5 m; lagoons/harbour from shore.json (OSM 2026-10-15, full detail); ODbL 1.0 - (c) OpenStreetMap contributors |
| `geometry/src/osm-coastline-pt-2026-10-17.json` | raw Overpass response (32 ways, 1431 nodes) used for pt-shoreline |  | 99101 | `3afd13542eecb6d336bfc8177b4d1b33321aa4a4d7f834f13e5e76a0222b9dbf` | Overpass API, maps.mail.ru mirror; ODbL 1.0 |
| `geometry/vectors/continents.f32` | continents.geojson as float32 unit vectors (x,y,z), ring index in vectors/index.json | 19631 | 235572 | `bb5d313552ba405b0813d1686970aa1ed546332b431e2c003e0bd10c0a5f17f7` | derived; public domain |
| `geometry/vectors/pt-shoreline.f32` | pt-shoreline.geojson as float32 unit vectors | 2559 | 30708 | `25b860fffe5e2772415c6761163bcf8b933889eec51ac821dae0d7f6cef3c204` | derived; ODbL 1.0 |
| `trails.json` | trail ways (cappy: 7, ra: 2) [lat,lon] + parcel outlines cappy_outline (998002802), ra_parcel_outline |  | 5235 | `d30d96df2e3ec131183376535aa5e907abd1fb00b80b90b5f8ed4d194b14d120` | OSM Overpass 2026-10-16 + WA Current_Parcels; ODbL / WA public |
| `streets.json` | road paths (Hastings Ave, Water St, Downtown->Fort Worden->North Beach) [lat,lon] |  | 12236 | `97df6e921390ded7ac280e2c429607d3e9ea2c9fced529b25e360ddaaf998580` | OSM; ODbL |
| `sheridan.json` | Sheridan St segments [lat,lon] |  | 5687 | `ea0b47785b8ced565befec9c7eb8030d6e99f4bf06f4bbf61b5efbf018376119` | OSM; ODbL |
| `mountains.json` | Mount Rainier, Mount Baker heightfields |  | 187691 | `1de835ec8053149841d86e8fc25261dced14a7e0e88ab19b7547f52d1dabb67b` | USGS 3DEP via AWS Terrain Tiles; public domain |
| `coast.json` | wider OSM coastline used for the ocean mask (bbox 48.01..48.19,-122.915..-122.645) |  | 112277 | `1ece83fa5f3880a7d84a050d54a733f8f9cbc9c7de76bd54fb2744dbb5d9e400` | OSM Overpass 2026-10-14; ODbL |
| `pillars.json` | d44 Matt Ready prism pillar positions (id, name, kind, area, lat, lon) |  | 14880 | `9bb94d3932fe7f3629e69f9fa4831e88b3a59897e511df9c148dbeb693bd0486` | OSM-derived public spots, 2026-10-17; ODbL |
| `pillar-matt.jpg` | pillar texture (see textures) |  | 39473 | `6e0f410e1bef74fc0fb65db6875e1697c137598c9b7360a4fe2f9577aa516f0e` | project asset; project |
| `geometry/vortex-table.json` | vortex normals / antipodes / wedge tests |  | 14120 | `279d1bbf620a727a764e7c5d51946f427a06ae38399db84883fe46b0eab1e080` | computed; - |

Encoding: GeoJSON coordinates are [lon,lat] (RFC 7946); the app JSON files (trails/streets/sheridan/shore/continents/landmass/pillars-as-fields) use [lat,lon]. Decimal degrees, 7 decimals (~1.1 cm). Rings closed (first==last). Consecutive vertices are joined by great-circle arcs (slerp). .f32 = little-endian float32 xyz unit vectors (~0.6 m precision; use float64 from the GeoJSON for sub-metre work).

## 5. Objects (positions and shapes)
Use generators where given; raw tables only for irregular data. Full per-object list: `record.json`.

- **Landmarks** (7): each has pillar cylinder r 1.5 h 120, beam r 2.5 h 200, ring 5–7 m, type shape, label at y 135, saucer pad offset +d E / −d N (d = 18 m; Ready Athletics 30 m, scale 2.2) hovering at 22 or 34 m.

| landmark | lat | lon |
|---|---|---|
| Ready Athletics (997800502) | 48.1062 | -122.8057 |
| Cappy's Trails garden (998002802) | 48.13165 | -122.79921 |
| Memory's Vault, Fort Worden | 48.1384642 | -122.7647029 |
| Port Townsend City Hall | 48.1161771 | -122.753612 |
| Jefferson County Sheriff's Office | 48.0241638 | -122.764488 |
| Jefferson Healthcare Hospital | 48.1060007 | -122.7889962 |
| Masonic Lodge (PT Lodge No. 6, 1338 Jefferson St) | 48.1139683 | -122.7628233 |

- **Far markers**: North Pole (90.0, 0.0); South Pole (-90.0, 0.0); Great Pyramid of Giza (29.97917, 31.13417); Pyramid of Khafre (29.97611, 31.13083); Great Pyramid of Cholula (19.0575, -98.30194); Pyramid of the Sun, Teotihuacan (19.693, -98.844); IceCube Neutrino Observatory (-89.99, -63.45306). Pillar r 12S h 700S, S = render distance/9010.
- **Meditation circle** at (48.1316475, −122.7992293), offsets (E,N) = r(sin b, cos b): 12 stones r 3.6 b = 30k; 12 cushions r 3.02 b = 30k; 6 orbs r 3.55 b = 60k+15 y 1.25; pavers 12 annular sectors .95–2.55 with edges at 30k; lotus dais r .78/.86 h .18 with 24 petals; fallback glow ring 1–9 m. Music beacon at the same point.
- **Edge ring**: anchor (48.100386, −122.81329); 12 edge marker bots at r 7 m, b = 30k: lat = lat0 + 7cos b/111320, lon = lon0 + 7 sin b/(111320 cos lat0).
- **Keeper bots**: Cappy's (48.13165, −122.79921); Ready Athletics (48.1062, −122.8057). **Ren** (AI robot): 4 m east of Cappy's pillar → (48.13165, -122.7991562), h 1.85 hover .32, talk radius 15 m, beam 400 m.
- **Night glow** (Ready Athletics, Cappy's): beams r 3.5/1.2 h 1500, ring 1–46 m, halos y 40/700; trails (trails.json, 9 ways) as 1 m ribbons + 6 m glow; parcel 998002802 outline ribbon .6 m.
- **Quest spaceship**: cockpit fixed to the viewer rig (no world position).
- **Matt Ready prism pillars** (96): equilateral triangular prism, side 0.7 m, total height 1.8 m (plinth .08 side .826, faces .08–1.75, cyan cap .05 side .742), ground ring .55–1.1 m; corner k local (s/√3)(sin 120k, cos 120k) rotated by yaw, so world corner bearing = 180 − yaw − 120k; **yaw = FNV-1a32(id)/2³²·360°**. Sound: Disco Jam, gain 1 ≤ 3 m → raised-cosine → 0 at 55 m, nearest 2 voices. Visible within 2.5 km.
- **Texture asset `pillar-matt.jpg`** (JPEG, 432×1024 px, 39473 bytes, sha256 `6e0f410e1bef74fc0fb65db6875e1697c137598c9b7360a4fe2f9577aa516f0e`): Purple Matt Ready figure: stylised robot-like body with a dark screen face showing a cyan winking smile, purple velvet tailcoat tuxedo with white shirt-front and black bow tie, purple top hat with cyan band, white gloves, holding a black microphone, dark trousers and shoes, on a purple gradient background with a cyan border and the caption 'MATT READY' in yellow at the bottom. Mapping: the same full image on all 3 side faces of every pillar; per face u: 0 at corner k -> 1 at corner k+1 (left->right seen from outside), v: 0 at face bottom (y=0.08 m) -> 1 at face top (y=1.75 m); unlit (MeshBasicMaterial, sRGB), front side only. Face 0.70 x 1.67 m (aspect .419) vs image 432x1024 (aspect .422): no crop, <1% stretch. Used by: all 96 pillars (pillars.js PILLAR_IMAGE / figures-registry PILLARS.image); a pillar may override with its own "image" field (none do).

| id | lat | lon | yaw° | kind |
|---|---|---|---|---|
| p001 | 48.1434258 | -122.7550952 | 238.876 | trail |
| p002 | 48.1421571 | -122.782457 | 237.4697 | park |
| p003 | 48.1419383 | -122.7708056 | 236.0634 | landmark |
| p004 | 48.1418321 | -122.7609448 | 234.6572 | landmark |
| p005 | 48.1417394 | -122.7877213 | 233.2509 | intersection |
| p006 | 48.1403495 | -122.7831286 | 231.8446 | intersection |
| p007 | 48.1402738 | -122.7928699 | 230.4383 | intersection |
| p008 | 48.1402186 | -122.7708938 | 251.5326 | landmark |
| p009 | 48.1391624 | -122.7997137 | 250.1263 | landmark |
| p010 | 48.1385543 | -122.7615903 | 51.8279 | landmark |
| p011 | 48.1381253 | -122.7897916 | 53.2342 | trail |
| p012 | 48.1378515 | -122.768597 | 54.6405 | park |
| p013 | 48.1370968 | -122.7983507 | 56.0468 | trail |
| p014 | 48.1365562 | -122.7642217 | 46.2028 | landmark |
| p015 | 48.1362135 | -122.7743292 | 47.6091 | trail |
| p016 | 48.1360092 | -122.7851613 | 49.0154 | intersection |
| p017 | 48.1356501 | -122.8102702 | 50.4217 | intersection |
| p018 | 48.1353436 | -122.7819718 | 63.0782 | intersection |
| p019 | 48.1353359 | -122.7908452 | 64.4845 | intersection |
| p020 | 48.1343152 | -122.7631655 | 257.1824 | landmark |
| p021 | 48.1342195 | -122.7659165 | 255.7761 | landmark |
| p022 | 48.1333086 | -122.7830039 | 259.9949 | park |
| p023 | 48.1328399 | -122.8097098 | 258.5886 | intersection |
| p024 | 48.1326439 | -122.7710496 | 251.5572 | intersection |
| p025 | 48.1317188 | -122.7777583 | 250.1509 | intersection |
| p026 | 48.1313792 | -122.7918464 | 254.3698 | intersection |
| p027 | 48.1310136 | -122.7638761 | 252.9635 | intersection |
| p028 | 48.1303002 | -122.7695385 | 245.9321 | intersection |
| p029 | 48.130145 | -122.8136846 | 244.5258 | intersection |
| p030 | 48.13009 | -122.7996 | 248.7323 | trail |
| p031 | 48.1299682 | -122.7886622 | 250.1386 | intersection |
| p032 | 48.1283088 | -122.769549 | 245.9198 | park |
| p033 | 48.1259238 | -122.7777688 | 247.326 | intersection |
| p034 | 48.1254882 | -122.8037343 | 254.3575 | intersection |
| p035 | 48.1253643 | -122.7709581 | 255.7637 | intersection |
| p036 | 48.1250652 | -122.7949279 | 251.5449 | intersection |
| p037 | 48.1250042 | -122.7586533 | 252.9512 | intersection |
| p038 | 48.1247688 | -122.7983402 | 237.4821 | park |
| p039 | 48.1245726 | -122.7898327 | 238.8883 | intersection |
| p040 | 48.1237285 | -122.7754 | 251.4746 | trail |
| p041 | 48.1230253 | -122.7639437 | 250.0683 | park |
| p042 | 48.1225607 | -122.7554518 | 248.662 | park |
| p043 | 48.1218962 | -122.7936093 | 247.2557 | intersection |
| p044 | 48.1217342 | -122.7662103 | 257.0997 | intersection |
| p045 | 48.1214382 | -122.7798083 | 255.6935 | intersection |
| p046 | 48.1209105 | -122.7568498 | 254.2872 | intersection |
| p047 | 48.1201431 | -122.8118816 | 252.8809 | intersection |
| p048 | 48.1201326 | -122.7996689 | 240.2243 | intersection |
| p049 | 48.1201059 | -122.7862086 | 238.818 | intersection |
| p050 | 48.1198779 | -122.7615781 | 243.0246 | intersection |
| p051 | 48.1201329 | -122.7957831 | 244.4309 | intersection |
| p052 | 48.1181973 | -122.7521523 | 245.8371 | landmark |
| p053 | 48.1179397 | -122.803429 | 247.2434 | intersection |
| p054 | 48.1178355 | -122.7596702 | 248.6497 | intersection |
| p055 | 48.1174539 | -122.7779344 | 250.056 | intersection |
| p056 | 48.1169808 | -122.7616981 | 251.4623 | intersection |
| p057 | 48.1169732 | -122.7728113 | 252.8686 | intersection |
| p058 | 48.1168699 | -122.7544218 | 231.7743 | park |
| p059 | 48.116553 | -122.75151 | 233.1806 | intersection |
| p060 | 48.1165011 | -122.7641044 | 43.3779 | landmark |
| p061 | 48.1164772 | -122.7668663 | 41.9716 | intersection |
| p062 | 48.1162645 | -122.7578087 | 46.1905 | park |
| p063 | 48.1161771 | -122.753612 | 44.7842 | landmark |
| p064 | 48.1129662 | -122.7882401 | 49.003 | intersection |
| p065 | 48.1159077 | -122.8058278 | 47.5968 | intersection |
| p066 | 48.1152989 | -122.7533024 | 51.8156 | park |
| p067 | 48.1152013 | -122.7572599 | 50.4093 | landmark |
| p068 | 48.1151747 | -122.7728012 | 54.6282 | park |
| p069 | 48.115057 | -122.7585368 | 53.2219 | landmark |
| p070 | 48.1148622 | -122.755466 | 79.929 | intersection |
| p071 | 48.1145182 | -122.7789711 | 81.3352 | intersection |
| p072 | 48.11448 | -122.7851019 | 77.1164 | intersection |
| p073 | 48.1144383 | -122.7564773 | 78.5227 | intersection |
| p074 | 48.1137036 | -122.7914868 | 74.3038 | intersection |
| p075 | 48.1135969 | -122.769814 | 75.7101 | intersection |
| p076 | 48.1124045 | -122.7680123 | 71.4913 | landmark |
| p077 | 48.112 | -122.80521 | 72.8975 | trail |
| p078 | 48.1119739 | -122.8116587 | 68.6787 | intersection |
| p079 | 48.1119658 | -122.7991517 | 70.085 | intersection |
| p080 | 48.1100024 | -122.8001405 | 82.6712 | intersection |
| p081 | 48.1097966 | -122.7700739 | 81.2649 | park |
| p082 | 48.1090189 | -122.7754335 | 79.8587 | intersection |
| p083 | 48.1088575 | -122.8053226 | 78.4524 | intersection |
| p084 | 48.1086575 | -122.7844025 | 77.0461 | intersection |
| p085 | 48.1079253 | -122.7743683 | 75.6398 | intersection |
| p086 | 48.1078305 | -122.7942766 | 74.2335 | park |
| p087 | 48.1069291 | -122.7836209 | 72.8272 | park |
| p088 | 48.106407 | -122.7903057 | 71.421 | intersection |
| p089 | 48.1063245 | -122.8059248 | 70.0147 | intersection |
| p090 | 48.1057596 | -122.7798791 | 74.2212 | trail |
| p091 | 48.1052212 | -122.8106503 | 75.6275 | intersection |
| p092 | 48.1043413 | -122.8027995 | 77.0338 | intersection |
| p093 | 48.1041554 | -122.7957129 | 78.44 | park |
| p094 | 48.1016811 | -122.8051792 | 68.5961 | intersection |
| p095 | 48.1005447 | -122.7913258 | 70.0023 | intersection |
| p096 | 48.1000411 | -122.8132261 | 71.4086 | trail |

## 6. Excluded (not drawn in the geometry record)
- real players: live count only (never positions)
- Matt's Shadow bot: 1
- Matt Ready performer bot (purple tuxedo rig): 1
- other singer performer bots: 0 configured now (one per player-named singer, dynamic)
- GhostBot (purple Victorian tux, client-side, walks loops around the viewer): 1

Record: `geometry/record.json` sha256 `9f3b0bf00d6b8857975bd55653270d6959d08d9984affbd5122f6b8f953a7435`, generated 2026-10-18T13:58:31-07:00.
