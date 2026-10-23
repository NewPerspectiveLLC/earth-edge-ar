// tour.js (d54): "Matt's 3D World" - automatic drone tour over Port Townsend (tour.html). Plain 3D (no camera / GPS / compass / AR).
// Minimal layers: continents (Natural Earth) + Port Townsend shoreline (OSM) outlines, a green low-relief terrain over the land (tour-terrain.json, real
// elevation), c.1850s dirt roads (tour-roads.json), a few small 3D details (downtown, Freemason Hall, Keohans Tree, Ready Athletics, Cappy's, Fort Worden)
// and the giant drive-in screen (drivein.js). Sound: Matt Ready Radio = the Master DJ loop + live voice/announcements (dj.js / djvoice.js), played FROM the
// orb (orbball.js + orbit.js: wanders 25-34 m around the camera, so it stays loud), HRTF-panned. The entry tap unlocks audio (iOS + desktop).
import * as THREE from 'three';
import { DJ } from './dj.js?v=1792470000056';
import './djvoice.js?v=1792455290575';
import { initOrb } from './orbball.js?v=1792455290575';
import { initDriveIn } from './drivein.js?v=1792470000057';
window.EEAR_DJ_NOUI = true;
window.EEAR = window.EEAR || {}; EEAR.LAY = { orbTours: 0 };   // orbit.js: no 1-6 km trail tours here, the orb stays with the visitor
const V = '?v=' + (window.EEAR_V || '1792455290575');
const MOBILE = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const D = Math.PI / 180, RE = 6371000, $ = id => document.getElementById(id);
// ---------- frame: exact ENU on a sphere around downtown-ish origin; three: x = east, y = up, z = -north ----------
const O = [48.117, -122.785], sl0 = Math.sin(O[0] * D), cl0 = Math.cos(O[0] * D), so0 = Math.sin(O[1] * D), co0 = Math.cos(O[1] * D);
function enu(lat, lon, h = 0, v = new THREE.Vector3()) { const r = RE + h, cl = Math.cos(lat * D), x = r * cl * Math.cos(lon * D), y = r * cl * Math.sin(lon * D), z = r * Math.sin(lat * D);
  const dx = x - RE * cl0 * co0, dy = y - RE * cl0 * so0, dz = z - RE * sl0;
  const e = -so0 * dx + co0 * dy, n = -sl0 * co0 * dx - sl0 * so0 * dy + cl0 * dz, u = cl0 * co0 * dx + cl0 * so0 * dy + sl0 * dz; return v.set(e, u, -n) }
function toLL(p) { const e = p.x, n = -p.z, u = p.y; const x = RE * cl0 * co0 + (-so0 * e - sl0 * co0 * n + cl0 * co0 * u), y = RE * cl0 * so0 + (co0 * e - sl0 * so0 * n + cl0 * so0 * u), z = RE * sl0 + (cl0 * n + sl0 * u);
  const r = Math.hypot(x, y, z); return { lat: Math.asin(z / r) / D, lon: Math.atan2(y, x) / D, alt: r - RE } }
const toLocal = (lat, lon) => enu(lat, lon, 0);
// ---------- renderer / scene ----------
const canvas = $('c'), ren = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
ren.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 2 : 1.75)); ren.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02030a);
const cam = new THREE.PerspectiveCamera(MOBILE ? 68 : 60, 1, 1, 1e5); scene.add(cam);
const world = new THREE.Group(); scene.add(world);
function fit() { const w = innerWidth, h = innerHeight; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix() }
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 300)); if (window.visualViewport) visualViewport.addEventListener('resize', fit); fit();
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
scene.add(new THREE.HemisphereLight(0xdfefff, 0x203018, 1.6)); const sun = new THREE.DirectionalLight(0xfff2d8, 1.5); sun.position.set(-0.4, 0.8, 0.45); scene.add(sun);
const globe = new THREE.Mesh(new THREE.SphereGeometry(RE - 30, 160, 80), new THREE.MeshBasicMaterial({ color: 0x030a1c })); globe.position.set(0, -RE, 0);   // dark ocean/Earth; centre straight below the origin
world.add(globe);
// ---------- outlines: continents + local shoreline ----------
function lineSet(rings, h, color, opacity = 1, close = false) { const P = [];
  for (const R of rings) { if (!R || R.length < 2) continue; const n = R.length + (close ? 1 : 0); let prev = null;
    for (let i = 0; i < n; i++) { const [a, l] = R[i % R.length]; const v = enu(a, l, h); if (prev) P.push(prev.x, prev.y, prev.z, v.x, v.y, v.z); prev = v } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }); const o = new THREE.LineSegments(g, m); o.frustumCulled = false; world.add(o); return o }
const J = u => fetch(u + V).then(r => r.json());
J('continents.json').then(j => { for (const k in j.continents) lineSet(j.continents[k].rings, 0, 0x5fd3ff, .85, true) }).catch(e => console.warn('continents', e));
J('landmass.json').then(j => { for (const k in j.rings) lineSet([j.rings[k]], 0, 0x5fd3ff, .85, true) }).catch(() => { });
J('coast.json').then(j => lineSet(j.lines, 1.5, 0x7fe8ff, 1)).catch(() => { });
J('shore.json').then(j => { lineSet(j.harbor, 1.5, 0xa8f0ff, .8); lineSet(j.lagoon, 1.5, 0x7fe8ff, .8) }).catch(() => { });
// ---------- terrain (green, real elevation, land only) ----------
const VEX = 1.6; let TER = null;
function hRaw(lat, lon) { const T = TER; if (!T) return 0; const [S, W, N, E] = T.bbox; const fx = (lon - W) / (E - W) * (T.nx - 1), fy = (N - lat) / (N - S) * (T.ny - 1);
  if (fx < 0 || fy < 0 || fx > T.nx - 1 || fy > T.ny - 1) return 0; const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, i1 = Math.min(i + 1, T.nx - 1), j1 = Math.min(j + 1, T.ny - 1);
  const g = (a, b) => Math.max(0, T.h[b * T.nx + a]); return (g(i, j) * (1 - u) + g(i1, j) * u) * (1 - v) + (g(i, j1) * (1 - u) + g(i1, j1) * u) * v }
const ground = (lat, lon) => hRaw(lat, lon) * VEX;
const terrReady = J('tour-terrain.json').then(T => { TER = T; const [S, W, N, E] = T.bbox, nx = T.nx, ny = T.ny, pos = [], col = [], idx = [], c = new THREE.Color();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const la = N - (N - S) * j / (ny - 1), lo = W + (E - W) * i / (nx - 1), h = Math.max(0, T.h[j * nx + i]); const v = enu(la, lo, h * VEX); pos.push(v.x, v.y, v.z);
    const k = Math.min(1, h / 120); c.setRGB(.16 + .16 * k, .42 + .2 * k - .1 * k * k, .14 + .06 * k); col.push(c.r, c.g, c.b) }
  const L = (i, j) => T.h[j * nx + i] >= 0;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
    if (L(i, j) && L(i + 1, j) && L(i, j + 1)) idx.push(a, cc, b); if (L(i + 1, j) && L(i, j + 1) && L(i + 1, j + 1)) idx.push(b, cc, d);
    else if (L(i, j) && L(i + 1, j) && L(i + 1, j + 1) && !L(i, j + 1)) idx.push(a, d, b); else if (L(i, j) && L(i, j + 1) && L(i + 1, j + 1) && !L(i + 1, j)) idx.push(a, cc, d) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.name = 'terrain'; world.add(m); return T }).catch(e => { console.warn('terrain', e) });
// ---------- c.1850s dirt roads (ribbons draped on the terrain) ----------
function ribbon(pts, w, color) { const P = [], I = [], A = new THREE.Vector3(), B = new THREE.Vector3(); let dense = [];
  for (let k = 0; k < pts.length - 1; k++) { const [a1, o1] = pts[k], [a2, o2] = pts[k + 1], d = Math.hypot((a2 - a1) * 111320, (o2 - o1) * 74400), n = Math.max(1, Math.ceil(d / 25));
    for (let s = 0; s < n; s++) dense.push([a1 + (a2 - a1) * s / n, o1 + (o2 - o1) * s / n]) } dense.push(pts[pts.length - 1]);
  const V3 = dense.map(([a, o]) => enu(a, o, ground(a, o) + 2.6));
  for (let k = 0; k < V3.length; k++) { const p = V3[k], q = V3[Math.min(k + 1, V3.length - 1)], r = V3[Math.max(k - 1, 0)]; A.subVectors(q, r); A.y = 0; A.normalize(); B.set(-A.z, 0, A.x).multiplyScalar(w / 2);
    P.push(p.x + B.x, p.y, p.z + B.z, p.x - B.x, p.y, p.z - B.z); if (k) { const b = (k - 1) * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2) } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); world.add(o); return o }
const roadsReady = terrReady.then(() => J('tour-roads.json')).then(R => { for (const r of R.roads) for (const s of r.lines) ribbon(s, Math.max(12, r.w * 1.6), r.approx ? 0xa77d4c : 0xc49a62); return R }).catch(e => console.warn('roads', e));
// ---------- labels ----------
const labels = [];
function label(text, sub, color = '#ffd77a') { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,6,20,.72)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, 504, 120, 22) : g.rect(4, 4, 504, 120); g.fill(); g.strokeStyle = color; g.lineWidth = 4; g.stroke();
  g.fillStyle = color; let fs = 44; do { g.font = 'bold ' + fs + 'px -apple-system,Helvetica,sans-serif'; fs -= 2 } while (g.measureText(text).width > 470 && fs > 20); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, sub ? 48 : 64);
  if (sub) { g.fillStyle = '#e8dcff'; let f2 = 26; do { g.font = '500 ' + f2 + 'px -apple-system,Helvetica,sans-serif'; f2 -= 2 } while (g.measureText(sub).width > 480 && f2 > 14); g.fillText(sub, 256, 96) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(.28, .07, 1); s.renderOrder = 50; s.center.set(.5, 0); labels.push(s); return s }
// ---------- landmarks ----------
const STOPS = {
  downtown: { name: 'Downtown Port Townsend', sub: 'Water Street · the 1856 waterfront', lat: 48.11625, lon: -122.75465 },
  masonic: { name: 'Freemason Hall', sub: 'Port Townsend Lodge No. 6 · 1338 Jefferson St', lat: 48.1139683, lon: -122.7628233 },
  keohan: { name: 'Keohans Tree', sub: 'near the golf course · placeholder spot', lat: 48.11775, lon: -122.77581 },
  ra: { name: 'Ready Athletics', sub: 'the vortex centre', lat: 48.1062, lon: -122.8057 },
  cappy: { name: "Cappy's Trails", sub: 'garden + trails', lat: 48.13165, lon: -122.79921 },
  worden: { name: 'Fort Worden', sub: "Memory's Vault", lat: 48.1384642, lon: -122.7647029 },
  drivein: { name: 'Matt Ready Drive-In', sub: 'the giant screen over Port Townsend', lat: 48.12395, lon: -122.81995 },
};
const anchor = (lat, lon, dy = 0) => { const g = new THREE.Group(); g.position.copy(enu(lat, lon, ground(lat, lon) + dy)); world.add(g); return g };
const std = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const glowMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function beam(g, color, h = 220) { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4, h, 12, 1, true), glowMat(color)); b.position.y = h / 2; g.add(b); const r = new THREE.Mesh(new THREE.RingGeometry(18, 26, 48).rotateX(-Math.PI / 2), glowMat(color)); r.position.y = 1.5; g.add(r) }
let downtownBuilt = false;
const landmarksReady = Promise.all([terrReady, roadsReady]).then(([, R]) => {
  // downtown: a row of small brick/sandstone blocks along Water Street (simple, no detail)
  { const S = STOPS.downtown, g = anchor(S.lat, S.lon); const ws = R && R.roads.find(r => r.name === 'Water Street'); const pts = ws ? ws.lines.flat().filter(p => p[1] > -122.7585 && p[1] < -122.7512) : [];
    pts.sort((a, b) => a[1] - b[1]); const cols = [0x9c4a32, 0xb8875a, 0x7d3b2a, 0xc9a77a, 0x8a5a3c];
    let n = 0; for (let k = 0; k < pts.length - 1; k++) { const [a1, o1] = pts[k], [a2, o2] = pts[k + 1]; const p1 = enu(a1, o1, 0), p2 = enu(a2, o2, 0), dir = p2.clone().sub(p1); const L = dir.length(); if (L < 25) continue; dir.normalize();
      const nrm = new THREE.Vector3(-dir.z, 0, dir.x), ang = Math.atan2(-dir.z, dir.x);
      for (let s = 12; s < L - 10; s += 26) for (const side of [-1, 1]) { const hgt = 9 + ((n * 37) % 9), w = 20, d = 15; n++;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), std(cols[n % cols.length])); const p = p1.clone().addScaledVector(dir, s).addScaledVector(nrm, side * 19);
        const ll = toLL(p); p.y = enu(ll.lat, ll.lon, ground(ll.lat, ll.lon)).y + hgt / 2 - 1; m.position.copy(p).sub(g.position); m.rotation.y = ang; g.add(m) } }
    const lb = label('Downtown Port Townsend', 'Water Street'); lb.position.y = 70; g.add(lb); downtownBuilt = n; S.g = g }
  // Freemason Hall: a small lodge with a gable roof + gold square & compass
  { const S = STOPS.masonic, g = anchor(S.lat, S.lon); const body = new THREE.Mesh(new THREE.BoxGeometry(22, 14, 28), std(0xd8cdb4)); body.position.y = 7; g.add(body);
    const sh = new THREE.Shape(); sh.moveTo(-12.5, 0); sh.lineTo(12.5, 0); sh.lineTo(0, 7); sh.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 30, bevelEnabled: false }), std(0x5a3a2e)); roof.position.set(0, 14, -15); g.add(roof);
    const gold = new THREE.MeshBasicMaterial({ color: 0xffc860 }), bar = (x, y, r) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.7, 6, .3), gold); m.position.set(x, y, 14.3); m.rotation.z = r; g.add(m) };
    bar(-1.6, 9, -.55); bar(1.6, 9, .55); bar(-1.6, 6.6, .55); bar(1.6, 6.6, -.55);   // square & compass (two V's)
    beam(g, 0xe0c080, 160); const lb = label('Freemason Hall', 'PT Lodge No. 6'); lb.position.y = 55; g.add(lb); S.g = g }
  // Keohans Tree: one big stylised evergreen (placeholder spot near the golf course)
  { const S = STOPS.keohan, g = anchor(S.lat, S.lon); const tr = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 12, 10), std(0x5a3a22)); tr.position.y = 6; g.add(tr);
    [[11, 14, 13], [8.5, 12, 21], [6, 10, 28]].forEach(([r, h, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 14), std(0x1f6b34)); c.position.y = y; g.add(c) });
    const ring = new THREE.Mesh(new THREE.RingGeometry(14, 17, 64).rotateX(-Math.PI / 2), glowMat(0x9cffb0)); ring.position.y = 1.2; g.add(ring); S.ring = ring;
    const lb = label('Keohans Tree', 'placeholder · near the golf course', '#9cffb0'); lb.position.y = 48; g.add(lb); S.g = g }
  // Ready Athletics + Cappy's + Fort Worden: glowing markers
  for (const [k, c, css] of [['ra', 0xffc800, '#ffc800'], ['cappy', 0x30ff60, '#7dff9a'], ['worden', 0xc060ff, '#d6a0ff']]) { const S = STOPS[k], g = anchor(S.lat, S.lon); beam(g, c, 260);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 1.6, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: c })); ring.position.y = 3; g.add(ring); S.ring = ring;
    const lb = label(S.name, S.sub, css); lb.position.y = 90; g.add(lb); S.g = g }
});
// ---------- drive-in (reused module; muted unless 'Screen sound' is on) ----------
/* d57: tour-only half screen (5.0 x 2.8125 km, same centre/bearing); main Live Geometry keeps full 10 x 5.625 km */
const drive = initDriveIn(world, toLocal, cam, { lite: MOBILE, edge: false, enabled: () => camAlt < 60000, wM: 5000, hM: 2812.5 });
// ---------- tour path: keyframes (position + look target), cubic Hermite in time ----------
const off = (S, brg, dist, agl) => { const lat = S.lat + dist * Math.cos(brg * D) / 111320, lon = S.lon + dist * Math.sin(brg * D) / (111320 * Math.cos(S.lat * D)); return enu(lat, lon, ground(lat, lon) + agl) };
const at = (S, agl = 0) => enu(S.lat, S.lon, ground(S.lat, S.lon) + agl);
let KEYS = [], LOOP0 = 0, TOTAL = 0;
function buildTour() { const S = STOPS, K = [], C = drive.C;
  const k = (p, look, o = {}) => K.push({ p, look, ...o });
  const scrC = enu(C.lat, C.lon, C.altM), front = b => off({ lat: C.lat, lon: C.lon }, C.faceBrg, b, 0), back = b => off({ lat: C.lat, lon: C.lon }, C.faceBrg + 180, b, 0);
  // 0: end of the space dive, high over the Quimper Peninsula looking at downtown
  k(off(S.downtown, 200, 4200, 2400), at(S.downtown), { name: 'Arriving over Port Townsend', sub: 'Quimper Peninsula · Admiralty Inlet', dur: 0 });
  LOOP0 = 1;
  k(off(S.downtown, 160, 1300, 420), at(S.downtown), { stop: 'downtown' });
  k(off(S.downtown, 120, 320, 90), at(S.downtown, 10), { stop: 'downtown' });
  k(off(S.downtown, 30, 150, 45), at(S.downtown, 8), { stop: 'downtown', slow: 1 });
  k(off(S.downtown, -40, 200, 55), at(S.downtown, 8), { stop: 'downtown' });
  k(off(S.masonic, 60, 260, 95), at(S.masonic, 8), { stop: 'masonic' });
  k(off(S.masonic, 150, 85, 34), at(S.masonic, 9), { stop: 'masonic', slow: 1 });
  k(off(S.masonic, 250, 85, 34), at(S.masonic, 9), { stop: 'masonic' });
  k(off(S.keohan, 90, 320, 110), at(S.keohan, 15), { stop: 'keohan' });
  k(off(S.keohan, 120, 90, 40), at(S.keohan, 16), { stop: 'keohan', dur: 9 });
  k(off(S.keohan, 135, 62, 30), at(S.keohan, 16), { stop: 'keohan', dur: 6, hold: 1 });         // slow in...
  k(off(S.keohan, 135, 62, 30), at(S.keohan, 16), { stop: 'keohan', dur: 6, hold: 1, quiet: 1 }); // ...respectful pause: hover still, music softens
  k(off(S.keohan, 200, 110, 55), at(S.keohan, 12), { stop: 'keohan', dur: 7 });
  k(off(S.ra, 30, 500, 160), at(S.ra), { stop: 'ra' });
  k(off(S.ra, 80, 110, 50), at(S.ra), { stop: 'ra', slow: 1 });
  k(off(S.ra, 180, 110, 50), at(S.ra), { stop: 'ra' });
  k(off(S.ra, 260, 140, 70), at(S.ra), { stop: 'ra' });
  // drive-in: rise to the front view, fly up and OVER the giant screen, look back at the mirrored side
  k(front(9500).setY(2100), scrC.clone(), { stop: 'drivein', dur: 22 });
  k(front(4200).setY(3600), scrC.clone(), { stop: 'drivein', dur: 14 });
  k(scrC.clone().setY(C.altM + C.hM / 2 + 900), back(3000).setY(1500), { stop: 'drivein', dur: 14 });
  k(back(4500).setY(2600), scrC.clone(), { stop: 'drivein', dur: 12, sub2: 'the back shows the mirror image' });
  k(off(S.cappy, 330, 700, 220), at(S.cappy), { stop: 'cappy', dur: 18 });
  k(off(S.cappy, 20, 120, 55), at(S.cappy), { stop: 'cappy', slow: 1 });
  k(off(S.cappy, 120, 120, 55), at(S.cappy), { stop: 'cappy' });
  k(off(S.worden, 260, 500, 170), at(S.worden), { stop: 'worden' });
  k(off(S.worden, 200, 120, 55), at(S.worden), { stop: 'worden', slow: 1 });
  k(off(S.worden, 120, 140, 60), at(S.worden), { stop: 'worden' });
  k(off(S.downtown, 320, 900, 300), at(S.downtown), { stop: 'downtown', dur: 16 });
  k(K[LOOP0].p.clone(), K[LOOP0].look.clone(), { stop: 'downtown', dur: 12 });   // == loop start
  // timing: distance / altitude-scaled speed
  let t = 0; K[0].t = 0;
  for (let i = 1; i < K.length; i++) { const a = K[i - 1], b = K[i], d = a.p.distanceTo(b.p), alt = (a.p.y + b.p.y) / 2, v = (b.slow ? 22 : 34) + .16 * alt;
    t += b.dur != null ? b.dur : Math.max(5, d / v); b.t = t }
  TOTAL = t;
  for (let i = 0; i < K.length; i++) { const a = K[i - 1] || K[i], b = K[i + 1] || K[i];   // tangents (time-scaled Catmull-Rom); zero on hover holds
    if (K[i].hold || (K[i + 1] && K[i + 1].hold && K[i + 1].p.equals(K[i].p))) { K[i].m = new THREE.Vector3(); K[i].ml = new THREE.Vector3(); continue }
    const dt = (b.t - a.t) || 1; K[i].m = b.p.clone().sub(a.p).divideScalar(dt); K[i].ml = b.look.clone().sub(a.look).divideScalar(dt) }
  K[0].m.set(0, 0, 0); KEYS = K }
function herm(a, b, ma, mb, dt, u, out) { const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return out.set(0, 0, 0).addScaledVector(a, h00).addScaledVector(ma, h10 * dt).addScaledVector(b, h01).addScaledVector(mb, h11 * dt) }
let camAlt = 2.6e6; const P = new THREE.Vector3(), LK = new THREE.Vector3();
function sample(t) { const K = KEYS; let i = 0; while (i < K.length - 2 && K[i + 1].t <= t) i++; const a = K[i], b = K[i + 1], dt = b.t - a.t, u = Math.max(0, Math.min(1, (t - a.t) / dt));
  herm(a.p, b.p, a.m, b.m, dt, u, P); herm(a.look, b.look, a.ml, b.ml, dt, u, LK); return { i, key: u < .5 && a.stop === b.stop ? a : b, seg: b } }
// ---------- intro: dive from space (continents) down to the first key ----------
const INTRO = 16, introFrom = { lat: 44.5, lon: -128.5, alt: 2.6e6 };
function introAt(s, out, look) { const e = s * s * (3 - 2 * s), k0 = KEYS[0], ll = toLL(k0.p), la = introFrom.lat + (ll.lat - introFrom.lat) * e, lo = introFrom.lon + (ll.lon - introFrom.lon) * e,
    alt = Math.exp(Math.log(introFrom.alt) + (Math.log(ll.alt) - Math.log(introFrom.alt)) * Math.pow(s, .8)); enu(la, lo, alt, out);
  const tgt = enu(48.117, -122.76, 0); look.copy(tgt).lerp(k0.look, e) }
// ---------- audio: Matt Ready Radio from the orb ----------
const A = { muted: (() => { try { return sessionStorage.eearTourMute === '1' } catch (e) { return false } })(), ctx: null, master: null, pan: null, orbG: null, vIn: null, quiet: 1 };
const listener = { lat: O[0], lon: O[1], alt: 0, hdg: 0, pitch: 0 };
window.EEAR_AUDIO = { get ctx() { return A.ctx }, get out() { return A.master }, flyOn: true, on: true, listener, voiceIn: () => A.vIn };
function startAudio() { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  A.ios = IOS; A.desk = !IOS;   // d56: desktop uses element volume (d50b pattern); iPhone keeps Web Audio HRTF through the orb
  if (!A.ctx) { const c = A.ctx = new AC(); try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch (e) { }
    A.master = c.createGain(); A.master.gain.value = 1; const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3; A.master.connect(comp); comp.connect(c.destination);
    A.pan = c.createPanner(); Object.assign(A.pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0, maxDistance: 1e6, coneInnerAngle: 360, coneOuterAngle: 360 });
    A.orbG = c.createGain(); A.orbG.gain.value = 1; A.pan.connect(A.orbG); A.orbG.connect(A.master);
    const bus = c.createGain(); bus.gain.value = 1.25; bus.connect(A.pan);
    const n = DJ.attach(c, A.desk ? { dry: true } : undefined);
    if (n && !A.desk) n.connect(bus);   // dry: element speaks on its own; stub node stays silent
    A.vIn = c.createGain(); A.vIn.gain.value = 1.2; A.vIn.connect(A.desk ? A.master : A.pan);   // live voice: plain on desktop, from the orb on iPhone
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0) }
  const kick = () => { DJ.want('tour', true); DJ.unlock(); if (A.desk && DJ.el) { try { DJ.el.muted = false } catch (e) { } } };
  kick();
  const r = A.ctx.state !== 'running' ? A.ctx.resume() : Promise.resolve();
  r.then(kick).catch(() => { });
  // keep kicking for a few seconds in case /api/dj was still loading at Enter (autoplay needs a gesture-linked play)
  if (!A.kickTimer) { let n = 0; A.kickTimer = setInterval(() => { kick(); if (++n >= 10 || (DJ.el && !DJ.el.paused && DJ.el.currentSrc)) { clearInterval(A.kickTimer); A.kickTimer = 0 } }, 400) }
}
const fw = new THREE.Vector3(), up = new THREE.Vector3(), rel = new THREE.Vector3();
function audioFrame() { const c = A.ctx; if (!c) return; const t = c.currentTime;
  cam.getWorldDirection(fw); up.set(0, 1, 0).applyQuaternion(cam.quaternion); const l = c.listener;
  if (l.forwardX) { l.forwardX.setTargetAtTime(fw.x, t, .05); l.forwardY.setTargetAtTime(fw.y, t, .05); l.forwardZ.setTargetAtTime(fw.z, t, .05); l.upX.setTargetAtTime(up.x, t, .05); l.upY.setTargetAtTime(up.y, t, .05); l.upZ.setTargetAtTime(up.z, t, .05) } else l.setOrientation(fw.x, fw.y, fw.z, up.x, up.y, up.z);
  rel.copy(orb.root.position).sub(cam.position); if (!orb.root.visible) rel.set(0, 20, -25);
  if (A.pan.positionX) { A.pan.positionX.setTargetAtTime(rel.x, t, .05); A.pan.positionY.setTargetAtTime(rel.y, t, .05); A.pan.positionZ.setTargetAtTime(rel.z, t, .05) } else A.pan.setPosition(rel.x, rel.y, rel.z);
  const og = window.EEAR_ORB ? Math.max(.85, Math.min(1, EEAR_ORB.gain || 1)) : 1, lvl = A.muted ? 0 : og * A.quiet;
  if (A.desk && DJ.el) { const vv = Math.max(0, Math.min(1, lvl * .95)); if (Math.abs((DJ.el.volume || 0) - vv) > .01) DJ.el.volume = vv; if (DJ.el.muted && !A.muted) DJ.el.muted = false }
  else if (A.orbG) A.orbG.gain.setTargetAtTime(lvl, t, A.muted ? .05 : .4) }
// ---------- orb ----------
const orb = initOrb(world, toLocal, cam, {}); orb.state.spawn = { lat: -O[0], lon: O[1] + 180, d: 0, b: 0 };   // no ground poster in the tour (parked on the far side of the Earth)
orb.spawn.visible = false;
// ---------- HUD / UI ----------
const HUD = { stop: '', t0: 0 }; let paused = false, running = false, tT = 0, intro = 0, lastNow = 0;
function setStop(name, sub) { if (HUD.stop === name) return; HUD.stop = name; $('stop').textContent = name; $('sub').textContent = sub || '' }
let capT = 0; function caption(txt, ms = 4000) { const c = $('cap'); c.textContent = txt; c.style.opacity = 1; clearTimeout(capT); capT = setTimeout(() => c.style.opacity = 0, ms) }
function nowPlaying() { const c = DJ.at(), st = window.EEAR_DJ && DJ.state; let t = '📻 Matt Ready Radio';
  if (A.muted) t = '🔇 Music muted'; else { if (st && st.live) t += ' · 🎙 LIVE'; if (c.item && c.playing) t += ': ' + c.item.title + (c.item.artist ? ' — ' + c.item.artist : ''); else if (st && !c.playing) t += ' · paused by the DJ'; else t += ': tuning in…' }
  $('now').textContent = t }
setInterval(nowPlaying, 1000);
function scrBtn() { $('bScreen').textContent = '🎬 Screen sound: ' + (drive.sound ? 'on' : 'off') }
$('bScreen').onclick = () => { drive.setSound(!drive.sound); scrBtn(); startAudio() };
$('bPause').onclick = () => { paused = !paused; $('bPause').textContent = paused ? '▶ Resume' : '⏸ Pause'; startAudio() };
if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('bFs').style.display = 'none';
$('bFs').onclick = () => { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => { })).call(d) };
function enter(e) { if (e) e.preventDefault(); if (HAS_MOTION) askMotion(); startAudio(); try { drive.video.play().catch(() => { }) } catch (x) { }
  const d = document.documentElement; if (!MOBILE || !/iPhone|iPod/.test(navigator.userAgent)) try { const p = (d.requestFullscreen || d.webkitRequestFullscreen || (() => { })).call(d, { navigationUI: 'hide' }); p && p.catch && p.catch(() => { }) } catch (x) { }
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }) } catch (x) { }
  $('front').style.display = 'none'; $('hud').style.display = 'block'; $('btns').style.display = 'flex'; scrBtn(); running = true; intro = 0; tT = 0; recenter(false); motBtn();
  if (A.muted) caption('Music is muted — tap 🔊 Mute music to hear the radio', 5000); setStop("Matt's 3D World", 'Diving in from space…'); caption('Welcome to Matt\'s 3D World', 3500); setTimeout(fit, 400) }
$('enter').addEventListener('click', enter);
$('bMot').onclick = () => { if (LOOK.on) { LOOK.on = false; LOOK.want = false; motBtn() } else if (LOOK.perm === 'granted' || LOOK.perm === 'not required') { LOOK.on = true; LOOK.want = true; recenter(true); motBtn() } else askMotion() };
function muteBtn() { const b = $('bMute'); b.textContent = A.muted ? '🔇 Music muted' : '🔊 Mute music'; b.classList.toggle('on', A.muted) }
$('bMute').onclick = () => { A.muted = !A.muted; try { sessionStorage.eearTourMute = A.muted ? '1' : '0' } catch (e) { } muteBtn(); startAudio(); audioFrame() }; muteBtn();
$('bCtr').onclick = () => recenter(false);
addEventListener('pointerdown', () => { if (running) startAudio() }, { passive: true });
if (/[?&]autostart=1/.test(location.search)) addEventListener('load', () => setTimeout(() => enter(), 300));
// ---------- d55 LOOK AROUND: phone motion (DeviceOrientation) + touch/mouse drag, as an offset on top of the tour camera ----------
// Device quaternion = the main Live Geometry app's math (index.html setCam / three DeviceOrientationControls): Euler(beta, alpha, -gamma, 'YXZ')
// x q1 (-90 deg about X: camera looks out of the back of the screen) x rotZ(-screen angle). Offset = q0^-1 x qDevice (relative to the pose at Recenter),
// expressed in the camera's own frame, so turning the phone turns the view the same way whatever the tour is doing. Drag adds yaw/pitch on top.
const baseQ = new THREE.Quaternion();
const LOOK = { q: new THREE.Quaternion(), on: false, perm: 'unknown', got: false, ori: null, q0: null, qs: new THREE.Quaternion(), yaw: 0, pitch: 0, dragging: false, events: 0 };
const zee = new THREE.Vector3(0, 0, 1), q1 = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5)), eu = new THREE.Euler(), qDev = new THREE.Quaternion(), qRel = new THREE.Quaternion(), qDrag = new THREE.Quaternion(), qz = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0);
const scrAngle = () => (window.TOUR_SO != null ? TOUR_SO : (screen.orientation && screen.orientation.angle != null ? screen.orientation.angle : (window.orientation || 0)));
function devQ(o, out) { eu.set((o.beta || 0) * D, (o.alpha || 0) * D, -(o.gamma || 0) * D, 'YXZ'); out.setFromEuler(eu); out.multiply(q1); out.multiply(qz.setFromAxisAngle(zee, -scrAngle() * D)); return out }
function onOri(e) { if (e.alpha == null && e.beta == null) return; LOOK.ori = { alpha: e.alpha, beta: e.beta, gamma: e.gamma }; LOOK.events++;
  if (!LOOK.got) { LOOK.got = true; if (LOOK.perm !== 'denied') { LOOK.on = LOOK.on || LOOK.want !== false; motBtn() } } if (LOOK.on && !LOOK.q0) recenter(true) }
addEventListener('deviceorientation', onOri);
function recenter(motionOnly) { if (LOOK.ori) LOOK.q0 = devQ(LOOK.ori, new THREE.Quaternion()); else LOOK.q0 = null; LOOK.qs.identity(); if (!motionOnly) { LOOK.yaw = 0; LOOK.pitch = 0 } }
addEventListener('orientationchange', () => setTimeout(() => recenter(true), 250)); if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => setTimeout(() => recenter(true), 250));
function askMotion() {   // must be called straight from a tap (iOS)
  const DOE = window.DeviceOrientationEvent; if (!DOE) { LOOK.perm = 'unsupported'; motBtn(); return Promise.resolve('unsupported') }
  if (typeof DOE.requestPermission === 'function') return DOE.requestPermission().then(r => { LOOK.perm = r; if (r === 'granted') { LOOK.on = true; LOOK.want = true; recenter(true) } else LOOK.on = false; motBtn(); return r }).catch(e => { LOOK.perm = 'error'; motBtn(); return 'error' });
  LOOK.perm = 'not required'; LOOK.on = true; LOOK.want = true; recenter(true); motBtn(); return Promise.resolve('not required') }
function lookFrame(dt) { if (LOOK.on && LOOK.ori) { if (!LOOK.q0) recenter(true); devQ(LOOK.ori, qDev); qRel.copy(LOOK.q0).invert().multiply(qDev); LOOK.qs.slerp(qRel, 1 - Math.exp(-dt * 14)) }   // light smoothing (~70 ms)
  else LOOK.qs.slerp(qz.identity(), 1 - Math.exp(-dt * 4));
  if (!LOOK.dragging && !LOOK.on) { /* drag offset stays until Recenter */ }
  eu.setFromQuaternion(LOOK.qs, 'YXZ'); LOOK.ey = eu.y + LOOK.yaw; LOOK.ex = Math.max(-1.5, Math.min(1.5, eu.x + LOOK.pitch)); LOOK.ez = eu.z;
  qYaw.setFromAxisAngle(yAx, LOOK.ey); eu.set(LOOK.ex, 0, LOOK.ez, 'YXZ'); LOOK.q.setFromEuler(eu) }   // yaw about the WORLD vertical (no pitch/yaw mixing while the tour looks down), pitch + roll in the camera frame
// drag look (touch fallback on phones, mouse on desktop): on the 3D view only
{ let px = 0, py = 0, id = null; const K = () => (cam.fov * D) / Math.max(1, innerHeight);
  canvas.addEventListener('pointerdown', e => { id = e.pointerId; px = e.clientX; py = e.clientY; LOOK.dragging = true; try { canvas.setPointerCapture(id) } catch (x) { } });
  canvas.addEventListener('pointermove', e => { if (e.pointerId !== id) return; const k = K(); LOOK.yaw += (e.clientX - px) * k; LOOK.pitch = Math.max(-1.45, Math.min(1.45, LOOK.pitch + (e.clientY - py) * k)); px = e.clientX; py = e.clientY });
  const up = e => { if (e.pointerId === id) { id = null; LOOK.dragging = false } }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up) }
const HAS_MOTION = !!window.DeviceOrientationEvent && MOBILE;
function motBtn() { const b = $('bMot'); if (!b) return; b.style.display = HAS_MOTION || LOOK.got ? '' : 'none';
  b.textContent = '📱 Motion look: ' + (LOOK.perm === 'denied' ? 'blocked (tap to retry)' : LOOK.perm === 'error' ? 'error (tap to retry)' : LOOK.on ? 'on' : 'off') }
// ---------- main loop ----------
const qT = new THREE.Quaternion(), mtx = new THREE.Matrix4(), tmp = new THREE.Vector3();
let built = false; Promise.all([landmarksReady]).then(() => { buildTour(); built = true; if (!running) { cam.position.copy(enu(introFrom.lat, introFrom.lon, introFrom.alt)); cam.lookAt(enu(48.117, -122.76, 0)) } });
cam.position.copy(enu(introFrom.lat, introFrom.lon, introFrom.alt)); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); baseQ.copy(cam.quaternion);
let lastStop = '';
function loop(now) { requestAnimationFrame(loop); const dt = Math.min(.1, (now - (lastNow || now)) / 1000); lastNow = now;
  if (built && running && !paused) {
    let s;
    if (intro < INTRO) { intro += dt; introAt(Math.min(1, intro / INTRO), P, LK); }
    else { tT += dt; if (tT > TOTAL) tT = KEYS[LOOP0].t + (tT - TOTAL); s = sample(tT); }
    cam.position.copy(P); mtx.lookAt(P, LK, tmp.set(0, 1, 0)); qT.setFromRotationMatrix(mtx);
    if (intro < INTRO && intro < dt * 2) baseQ.copy(qT); else baseQ.slerp(qT, 1 - Math.exp(-dt * (intro < INTRO ? 6 : 2.6)));
    if (s) { const k = s.key, st = k.stop && STOPS[k.stop]; if (st) setStop(st.name, k.sub2 || st.sub); else if (k.name) setStop(k.name, k.sub);
      if (k.stop !== lastStop) { lastStop = k.stop; if (k.stop === 'drivein') caption('Flying over the giant drive-in screen', 4500) }
      const quiet = s.seg.quiet && s.seg.hold; if (quiet && A.quiet === 1) caption('A quiet moment at Keohans Tree', 6000); A.quiet = quiet ? .45 : 1 }
    else if (intro >= INTRO * .55) setStop('Arriving over Port Townsend', 'Quimper Peninsula · Admiralty Inlet') }
  lookFrame(dt); cam.quaternion.copy(qYaw).multiply(baseQ).multiply(LOOK.q);   // d55: look-around offset (phone motion and/or drag) on top of the tour direction
  // near/far for the altitude (orb is always 25-34 m away; continents from space)
  const alt = toLL(cam.position).alt; camAlt = alt; const agl = Math.max(1, cam.position.y - (TER ? 0 : 0)); const space = alt > 20000;
  cam.near = space ? alt * .003 : Math.min(8, Math.max(.5, alt * .02)); cam.far = space ? alt * 4 + 2e6 : Math.max(9e4, alt * 45); cam.updateProjectionMatrix();
  globe.scale.setScalar(1); globe.position.y = -RE - (space ? alt * .002 : 0);
  const ll = toLL(cam.position); listener.lat = ll.lat; listener.lon = ll.lon; listener.alt = alt; cam.getWorldDirection(fw); listener.hdg = (Math.atan2(fw.x, -fw.z) / D + 360) % 360; listener.pitch = Math.asin(Math.max(-1, Math.min(1, fw.y))) / D;
  try { orb.update(dt) } catch (e) { if (!orb.err) { orb.err = 1; console.warn('orb', e) } } if (space) orb.root.visible = false; orb.spawn.visible = false;
  drive.update(); audioFrame();
  const K = STOPS.keohan; if (K.ring) K.ring.material.opacity = .25 + .15 * Math.sin(now / 700);
  for (const k of ['ra', 'cappy', 'worden']) if (STOPS[k].ring) STOPS[k].ring.rotation.y = now / 3000;
  for (const s of labels) { s.getWorldPosition(tmp); const d = tmp.distanceTo(cam.position); s.visible = d < 6000 && !space; s.material.opacity = Math.min(1, (6000 - d) / 1500) }
  ren.render(scene, cam) }
requestAnimationFrame(loop);
window.TOUR = { LOOK, recenter, baseQ, get t() { return tT }, get intro() { return intro }, get keys() { return KEYS }, get total() { return TOTAL }, STOPS, orb, drive, A, DJ, cam, seek(t) { intro = INTRO; tT = t }, keyTime(stop) { const k = KEYS.find(k => k.stop === stop && k.slow || k.stop === stop && k.hold); return k ? k.t : null }, get stop() { return HUD.stop }, enu, toLL, ground, get downtownBlocks() { return downtownBuilt } };
