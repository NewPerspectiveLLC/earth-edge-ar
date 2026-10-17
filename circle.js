// Glowing meditation circle at Matt's Meditation Garden (48.1316475, -122.7992293), centred on the Garden pillar.
// 12 standing stones with glowing rune veins, a ring of 12 pavers with lit seams, 12 softly lit purple/teal cushions (one inside each stone), a lotus dais
// with edge-lit petals, and floating orbs. Cheap fake bloom: radial halo sprites + fresnel shells (no post-processing),
// 2 point lights. setNight(t 0..1): glow ~2.5x at night, subtle by day. Normal blending everywhere (safe over iOS video).
import * as THREE from 'three';
import { GARDEN as GARDEN_REG, CIRCLE as CIRCLE_REG } from './figures-registry.js?v=1792265745763';
export const GARDEN = GARDEN_REG;
const PI = Math.PI, TAU = 2 * PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PURPLE = 0xa45cff, TEAL = 0x2ff5df, GOLD = 0xffc46b;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function halo(color, size, op = .25) {
  const t = canvasTex(64, 64, (g) => { const col = new THREE.Color(color), rgb = `${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0}`; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, `rgba(${rgb},.85)`); r.addColorStop(.35, `rgba(${rgb},.3)`); r.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: op })); s.scale.setScalar(size); s.userData.op = op; return s;
}
function fresnelShell(geo, color, power = 2.2, op = .55) { // rim-glow shell (fake bloom around orbs/dais)
  return new THREE.Mesh(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: { c: { value: new THREE.Color(color) }, p: { value: power }, o: { value: op } },
    vertexShader: 'varying vec3 n;varying vec3 v;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 c;uniform float p;uniform float o;varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),p);gl_FragColor=vec4(c,f*o);}' }));
}

export function buildCircle(opts = {}) {
  const R = rng(opts.seed ?? 12), root = new THREE.Group(); root.name = 'MeditationCircle';
  const em = [], halos = [], shells = [], orbs = [], lights = [];
  const stoneR = opts.stoneRadius ?? CIRCLE_REG.stoneRadius, paveIn = CIRCLE_REG.paveIn, paveOut = CIRCLE_REG.paveOut;
  // ---- textures
  const stoneMap = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6d6a74'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1800; i++) { const v = 80 + R() * 70 | 0; g.fillStyle = `rgba(${v},${v - 4},${v + 8},.35)`; g.fillRect(R() * w, R() * h, 2 + R() * 6, 2 + R() * 6); } });
  const veinMap = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.lineCap = 'round';
    for (let k = 0; k < 7; k++) { let x = R() * w, y = R() * h; g.strokeStyle = k % 3 ? '#9b5cff' : '#2ff5df'; g.lineWidth = 2 + R() * 2.5; g.shadowColor = g.strokeStyle; g.shadowBlur = 8; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 9; s++) { x += (R() - .5) * 60; y += (R() - .3) * 40; g.lineTo(x, y); } g.stroke(); }
    // runes: 12-wedge glyphs
    g.strokeStyle = '#ffd38a'; g.shadowColor = '#ffb347'; g.lineWidth = 3; for (let k = 0; k < 3; k++) { const cx = 40 + R() * 176, cy = 50 + R() * 156, r = 14 + R() * 8; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      for (let i = 0; i < 12; i += 3) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(i * PI / 6) * r, cy + Math.sin(i * PI / 6) * r); g.stroke(); } } });
  const paverMap = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8b8592'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { const v = 110 + R() * 60 | 0; g.fillStyle = `rgba(${v},${v - 6},${v + 6},.3)`; g.fillRect(R() * w, R() * h, 3, 3); } });
  const cushMap = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, '#fff2d0'); r.addColorStop(.5, '#ffb35c'); r.addColorStop(1, '#7a3fd0'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const env = canvasTex(256, 128, (g) => { const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, '#cfc4f0'); r.addColorStop(.45, '#f4f2ff'); r.addColorStop(.55, '#8a8296'); r.addColorStop(1, '#2a2436'); g.fillStyle = r; g.fillRect(0, 0, 256, 128); });
  env.mapping = THREE.EquirectangularReflectionMapping;
  const M = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: .85, envMap: env, envMapIntensity: 1.1, ...o }); if (m.emissiveIntensity !== undefined) { m.userData.ei = m.emissiveIntensity; em.push(m); } return m; };
  // ---- standing stones (12, with glowing veins + runes)
  const stoneM = M({ map: stoneMap, emissiveMap: veinMap, emissive: 0xffffff, emissiveIntensity: .9, color: 0xbab4c4 });
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12, g = new THREE.DodecahedronGeometry(.32, 1), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 1 + (R() - .5) * .18; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * (1.6 + (i % 3) * .25), p.getZ(k) * s * .8); }
    g.computeVertexNormals(); const st = new THREE.Mesh(g, stoneM); st.position.set(Math.sin(a) * stoneR, .38 + (i % 3) * .06, -Math.cos(a) * stoneR); st.rotation.y = -a + (R() - .5) * .3; root.add(st);
    const h = halo(i % 2 ? PURPLE : TEAL, 1.2, .1); h.position.copy(st.position).setY(.55); root.add(h); halos.push(h);
  }
  // ---- pavers: 12 annular wedges, glowing seams (ring + radial lines)
  const paverM = M({ map: paverMap, color: 0xd8d2e2, emissive: 0x3a2a55, emissiveIntensity: .35, roughness: .9 });
  for (let i = 0; i < 12; i++) { const g = new THREE.RingGeometry(paveIn + .03, paveOut - .03, 6, 1, i * TAU / 12 + .012, TAU / 12 - .024); const m = new THREE.Mesh(g, paverM); m.rotation.x = -PI / 2; m.position.y = .012; root.add(m); }
  const seamM = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .8, depthWrite: false }); seamM.userData.isSeam = true;
  for (const r of [paveIn, paveOut]) { const s = new THREE.Mesh(new THREE.RingGeometry(r - .018, r + .018, 96), seamM); s.rotation.x = -PI / 2; s.position.y = .016; root.add(s); }
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12, len = paveOut - paveIn, s = new THREE.Mesh(new THREE.PlaneGeometry(.03, len), seamM); s.rotation.x = -PI / 2; s.rotation.z = -a; const rm = (paveIn + paveOut) / 2; s.position.set(Math.sin(a) * rm, .017, -Math.cos(a) * rm); root.add(s); }
  const floorGlow = new THREE.Mesh(new THREE.RingGeometry(paveIn, paveOut + .5, 64), new THREE.MeshBasicMaterial({ map: canvasTex(8, 64, (g) => { const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, 'rgba(255,196,107,0)'); r.addColorStop(.5, 'rgba(164,92,255,.5)'); r.addColorStop(1, 'rgba(47,245,223,0)'); g.fillStyle = r; g.fillRect(0, 0, 8, 64); }), transparent: true, opacity: .25, depthWrite: false }));
  floorGlow.rotation.x = -PI / 2; floorGlow.position.y = .02; root.add(floorGlow); halos.push(floorGlow); floorGlow.userData.op = .25;
  // ---- 12 cushions (zafu), one just inside each stone, alternating purple / teal, softly lit (performers stand in the gaps)
  const cushTex = (a, b) => canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, '#fff6ff'); r.addColorStop(.45, a); r.addColorStop(1, b); g.fillStyle = r; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(k * PI / 6) * 64, 64 + Math.sin(k * PI / 6) * 64); g.stroke(); } });
  const cushP = cushTex('#c58cff', '#5a1fb0'), cushT = cushTex('#7ffff0', '#0f8f86');
  const cushMs = [M({ map: cushP, color: 0xffffff, emissive: PURPLE, emissiveMap: cushP, emissiveIntensity: .4, roughness: .95 }), M({ map: cushT, color: 0xffffff, emissive: TEAL, emissiveMap: cushT, emissiveIntensity: .4, roughness: .95 })];
  const pipeMs = [new THREE.MeshBasicMaterial({ color: 0xe2c2ff }), new THREE.MeshBasicMaterial({ color: 0xb8fff6 })];
  const cushG = new THREE.SphereGeometry(.25, 18, 9), pipeG = new THREE.TorusGeometry(.245, .011, 5, 28), cushR = opts.cushionRadius ?? (stoneR - CIRCLE_REG.cushionInset);
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12, k = i % 2, c = new THREE.Mesh(cushG, cushMs[k]); c.scale.set(1, .38, 1); c.position.set(Math.sin(a) * cushR, .1, -Math.cos(a) * cushR); root.add(c);
    const piping = new THREE.Mesh(pipeG, pipeMs[k]); piping.rotation.x = PI / 2; piping.position.copy(c.position).setY(.105); root.add(piping);
    const h = halo(k ? TEAL : PURPLE, .85, .13); h.position.copy(c.position).setY(.2); root.add(h); halos.push(h); }
  // ---- lotus dais (around the pillar): base + 12 + 12 edge-lit petals
  const baseM = M({ color: 0xe9e3f5, emissive: 0x4a2a80, emissiveIntensity: .45, roughness: .4, metalness: .1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.78, .86, .18, 48), baseM); base.position.y = .09; root.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.8, .02, 6, 64), new THREE.MeshBasicMaterial({ color: TEAL })); rim.rotation.x = PI / 2; rim.position.y = .18; root.add(rim);
  const petalShape = new THREE.Shape(); petalShape.moveTo(0, 0); petalShape.quadraticCurveTo(.17, .2, 0, .5); petalShape.quadraticCurveTo(-.17, .2, 0, 0);
  const petalG = new THREE.ShapeGeometry(petalShape, 10), edgeG = new THREE.BufferGeometry().setFromPoints(petalShape.getPoints(16));
  const petalM = M({ color: 0xf6e8ff, emissive: 0xc58cff, emissiveIntensity: .45, side: THREE.DoubleSide, roughness: .5 });
  const edgeM = new THREE.LineBasicMaterial({ color: 0xe6c8ff, transparent: true, opacity: .95 });
  const lotus = new THREE.Group(); lotus.position.y = .18; root.add(lotus);
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 + ring * PI / 12, p = new THREE.Group(); p.rotation.y = -a; lotus.add(p);
    const tilt = ring ? .55 : 1.0, rr = ring ? .45 : .62, scale = ring ? .8 : 1.05;
    const pm = new THREE.Mesh(petalG, petalM), pl = new THREE.Line(edgeG, edgeM); for (const o of [pm, pl]) { o.position.set(0, 0, -rr); o.rotation.x = -tilt; o.scale.setScalar(scale); p.add(o); }
  }
  const lotusHalo = halo(PURPLE, 2.4, .2); lotusHalo.position.y = .45; root.add(lotusHalo); halos.push(lotusHalo);
  const daisShell = fresnelShell(new THREE.SphereGeometry(.95, 24, 12, 0, TAU, 0, PI / 2), PURPLE, 2.5, .35); daisShell.scale.y = .45; root.add(daisShell); shells.push(daisShell);
  // ---- floating orbs (6) with fresnel shells + halos
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + PI / 12, col = [TEAL, PURPLE, GOLD][i % 3];
    const o = new THREE.Group(); o.position.set(Math.sin(a) * (stoneR - .05), 1.25, -Math.cos(a) * (stoneR - .05)); o.userData.ph = i * 1.1; root.add(o);
    o.add(new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 10), new THREE.MeshBasicMaterial({ color: col })));
    const sh = fresnelShell(new THREE.SphereGeometry(.13, 16, 10), col, 1.6, .7); o.add(sh); shells.push(sh);
    const h = halo(col, .7, .22); o.add(h); halos.push(h); orbs.push(o); }
  // ---- at most two point lights
  const l1 = new THREE.PointLight(PURPLE, 1.2, 7, 2); l1.position.set(0, 1.2, 0); root.add(l1); l1.userData.i = 1.2; lights.push(l1);
  const l2 = new THREE.PointLight(GOLD, .8, 6, 2); l2.position.set(0, .5, 0); root.add(l2); l2.userData.i = .8; lights.push(l2);
  return { root, em, halos, shells, orbs, lights, seamM, edgeM };
}

let C = null;
/** initCircle(scene, where, opts): where = toLocal(lat,lon)->Vector3 (called each frame) or the Garden pillar ground Vector3 */
export function initCircle(scene, where, opts = {}) {
  const B = buildCircle(opts); scene.add(B.root); C = { ...B, where, t: 0, night: 0 }; setNight(opts.night ?? 0); place();
  let tris = 0; B.root.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return { group: B.root, update, setNight, triangles: Math.round(tris) };
}
function place() { const v = typeof C.where === 'function' ? C.where(GARDEN.lat, GARDEN.lon) : C.where; if (v) C.root.position.set(v.x, v.y ?? 0, v.z); }
/** setNight(t 0..1): glow ~2.5x at night, subtler in daylight */
export function setNight(t) { if (!C) return; const n = C.night = clamp(+t || 0, 0, 1), f = .7 + 1.8 * n; // day .7x, night 2.5x
  C.em.forEach(m => m.emissiveIntensity = m.userData.ei * f); C.halos.forEach(h => h.material.opacity = h.userData.op * (.6 + 2.2 * n));
  C.shells.forEach(s => s.material.uniforms.o.value = (s.userData.o ??= s.material.uniforms.o.value) * (.6 + .9 * n));
  C.lights.forEach(l => l.intensity = l.userData.i * (.4 + 2 * n)); C.seamM.opacity = .55 + .45 * n; }
export function update(dt) { if (!C) return; C.t += clamp(dt || 0, 0, .1); place(); const t = C.t;
  C.orbs.forEach(o => { o.position.y = 1.25 + Math.sin(t * .9 + o.userData.ph) * .12; });
  const pulse = 1 + .12 * Math.sin(t * .8); C.halos.forEach(h => { if (h.isSprite) h.material.opacity = h.userData.op * (.6 + 2.2 * C.night) * pulse; }); }
