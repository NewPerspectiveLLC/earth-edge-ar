// parcels.js (d49): official Jefferson County assessor parcel outlines (parcels.json, from /workspace/parcels/*.geojson) drawn on the ground:
// glowing ground-hugging ribbon (depth-tested, gentle pulse) + soft outer glow, corner posts, small floating label. One Layers key per parcel.
// + 8 ft (2.44 m) stone columns at each parcel's 4 principal corners (parcels.json?v=1792453209966 .corners): plinth, fluted shaft, capital, abacus; one merged low-poly geometry,
//   one shared matcap stone material (procedural 256 px canvas texture, no scene lights needed), one InstancedMesh per parcel (own Layers key .colsKey). Lite: 8 sides, no flutes.
// addParcels(T, parent, origin[lat,lon], groundY, mx, my, label, opts) -> {groups, parcels}. Shared by index.html and quest.html.
let PJ = null; export const loadParcels = () => PJ || (PJ = fetch('parcels.json?v=1792453209966').then(r => r.json()));
function ribbon(T, pts, w, y) { const pos = [], idx = []; const n = pts.length;
  for (let i = 0; i < n; i++) { const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    pos.push(p[0] - dz * w / 2, y, p[1] + dx * w / 2, p[0] + dz * w / 2, y, p[1] - dx * w / 2) }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = i * 2, b = j * 2; idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g }
let COL = null;
function columnAssets(T, lite) { if (COL && COL.lite === lite) return COL; const parts = [], seg = lite ? 8 : 20;
  const lathe = (pts, flute) => { const g = new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg); if (flute) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < .42 || y > 2.08) continue; const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 - .05 * Math.abs(Math.cos(a * 6)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k) } g.computeVertexNormals() } return g };
  const box = (w, h, y) => { const b = new T.BoxGeometry(w, h, w); b.translate(0, y, 0); return b };
  parts.push(box(.72, .2, .1), box(.6, .1, .25));                                                                  // plinth (2 steps)
  parts.push(lathe([[0, .3], [.27, .3], [.29, .34], [.27, .38], [.24, .4], [.235, .42]]));                           // base moulding (torus-like)
  parts.push(lathe([[.235, .42], [.225, 1.2], [.205, 2.08], [0, 2.08]], !lite));                                      // shaft with slight entasis + flutes
  parts.push(lathe([[0, 2.08], [.215, 2.08], [.25, 2.16], [.3, 2.26], [.31, 2.3], [0, 2.3]]));                         // capital (echinus)
  parts.push(box(.66, .14, 2.37));                                                                                  // abacus -> top at 2.44 m
  const geo = merge(T, parts); const tex = stoneTex(T), mc = matcap(T);
  const mat = new T.MeshMatcapMaterial({ matcap: mc, map: tex, color: 0xf2ece0 }); COL = { geo, mat, lite }; return COL }
function merge(T, gs) { const P = [], N = [], U = []; for (let g of gs) { g = g.index ? g.toNonIndexed() : g; P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); U.push(...(g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2))) }
  const o = new T.BufferGeometry(); o.setAttribute('position', new T.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); o.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); o.computeBoundingSphere(); return o }
function stoneTex(T) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), d = g.createImageData(256, 256); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const N = Array.from({ length: 64 * 64 }, r), n = (x, y) => { const xi = Math.floor(x) & 63, yi = Math.floor(y) & 63, fx = x - Math.floor(x), fy = y - Math.floor(y), a = N[yi * 64 + xi], b = N[yi * 64 + ((xi + 1) & 63)], c2 = N[((yi + 1) & 63) * 64 + xi], e = N[((yi + 1) & 63) * 64 + ((xi + 1) & 63)]; return a + (b - a) * fx + (c2 - a) * fy + (a - b - c2 + e) * fx * fy };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = .55 * n(x / 32, y / 32) + .3 * n(x / 9, y / 9) + .15 * n(x / 3, y / 3), vein = Math.max(0, 1 - Math.abs(Math.sin((x + y * .6) / 23 + 6 * n(x / 40, y / 40))) * 12) * .25, k = (.72 + .28 * v - vein) * 255, i = (y * 256 + x) * 4;
    d.data[i] = k * 1.0; d.data[i + 1] = k * .96; d.data[i + 2] = k * .88; d.data[i + 3] = 255 } g.putImageData(d, 0, 0);
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; return t }
function matcap(T) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(46, 40, 4, 64, 64, 64);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(.35, '#d9d2c4'); gr.addColorStop(.75, '#8f877a'); gr.addColorStop(1, '#3d3832'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c) }
export async function addParcels(T, parent, o, G, mx, my, label, opts = {}) { const J = await loadParcels(), groups = {}, mats = [];
  for (const P of J.parcels) { if (opts.only && !opts.only.includes(P.key)) continue;
    const ring = P.ring.slice(0, -1).map(([a, l]) => [(l - o[1]) * mx, -(a - o[0]) * my]), c = new T.Color(P.col), g = new T.Group(); g.userData.layer = P.key; g.name = 'parcel-' + P.pin;
    const core = new T.MeshBasicMaterial({ color: c, transparent: true, opacity: .95, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
    const glow = new T.MeshBasicMaterial({ color: c, transparent: true, opacity: .22, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    mats.push([core, .95, 0], [glow, .22, 1]);
    const m1 = new T.Mesh(ribbon(T, ring, .5, G + .07), core), m2 = new T.Mesh(ribbon(T, ring, 2.2, G + .05), glow); m1.renderOrder = 6; m2.renderOrder = 5; g.add(m2, m1);
    m1.onBeforeRender = () => { const k = .8 + .2 * Math.sin(performance.now() / 1000 * Math.PI * 2 * .4); core.opacity = .95 * (.85 + .15 * k); glow.opacity = .22 * k * 1.2 };   // gentle pulse, no per-frame JS elsewhere
    // corner posts: vertices where the outline turns > 25 deg
    const postG = new T.CylinderGeometry(.09, .12, 2.4, 6), capG = new T.SphereGeometry(.22, 10, 6), pm = new T.MeshBasicMaterial({ color: c }), cm = new T.MeshBasicMaterial({ color: c.clone().lerp(new T.Color('#fff'), .5) });
    const n = P.corners ? 0 : ring.length; for (let i = 0; i < n; i++) { const a = ring[(i - 1 + n) % n], p = ring[i], b = ring[(i + 1) % n], t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]); let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < 25 * Math.PI / 180) continue; const po = new T.Mesh(postG, pm); po.position.set(p[0], G + 1.2, p[1]); const cp = new T.Mesh(capG, cm); cp.position.set(p[0], G + 2.5, p[1]); g.add(po, cp) }
    const [ca, cl] = P.centroid, cx = (cl - o[1]) * mx, cz = -(ca - o[0]) * my;
    if (label) { const s = label(P.label + '\n' + P.acres + ' ac', P.col, { title: P.label, color: P.col }); s.position.set(cx, G + 7, cz); s.userData.layer = P.key; s.userData.parcel = P.pin; parent.add(s) }
    g.userData.parcel = { ...P, local: [cx, cz] }; parent.add(g); groups[P.key] = g;
    if (P.corners && P.colsKey) { const A = columnAssets(T, !!opts.lite), im = new T.InstancedMesh(A.geo, A.mat, P.corners.length), mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
      P.corners.forEach(([a, l], i) => { const x = (l - o[1]) * mx, z = -(a - o[0]) * my; e.set(0, Math.atan2(x - cx, z - cz), 0); q.setFromEuler(e); mt.compose(new T.Vector3(x, G, z), q, new T.Vector3(1, 1, 1)); im.setMatrixAt(i, mt) });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.userData.layer = P.colsKey; im.name = 'columns-' + P.pin; parent.add(im); groups[P.colsKey] = im } }
  return { groups, parcels: J.parcels } }

/** OSM trail polylines from trails.json[key] as a ground-hugging glowing line (depth-tested), one Layers key */
export async function addTrail(T, parent, o, G, mx, my, key, col, layer) { const J = await fetch('trails.json?v=1792453209966').then(r => r.json()); const W = J[key] || [], g = new T.Group(); g.userData.layer = layer; g.name = 'trail-' + key;
  const m = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  for (const w of W) { const pts = w.pts.map(([a, l]) => [(l - o[1]) * mx, -(a - o[0]) * my]); if (pts.length < 2) continue; const pos = [], idx = [], hw = .3;
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; pos.push(pts[i][0] - dz * hw, G + .06, pts[i][1] + dx * hw, pts[i][0] + dz * hw, G + .06, pts[i][1] - dx * hw);
      if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k, k + 1, k - 1) } }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); const me = new T.Mesh(geo, m); me.renderOrder = 6; g.add(me) }
  parent.add(g); return g }
