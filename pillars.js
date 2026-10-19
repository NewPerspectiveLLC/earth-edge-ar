// pillars.js (d44): Matt Ready triangular-prism billboard pillars scattered around Port Townsend + proximity music (Master DJ).
// Data: pillars.json (OSM-derived public spots: street-corner right-of-way, parks, landmarks, trails). Placement/size/audio constants live in figures-registry.js (PILLARS).
// Rendering: one shared prism geometry with 3 face groups, unlit 'contain' materials (whole image fitted unstretched, leftover bands = dark neon-purple gradient);
// default faces = PILLARS.images; a pillar may set "image" (all 3 faces) or "images" [3] to override. InstancedMesh, per-instance distance cull.
// Audio (d45): every pillar plays the CURRENT Master DJ track (dj.js?v=1792368740394) from its own spot; was the fixed Disco Jam loop. Only the nearest PILLARS.audio.voices (2) pillars inside silentM get a looping
// AudioBufferSourceNode -> gain -> HRTF PannerNode; all share ONE decoded buffer and a common loop clock, so switching pillars never restarts the song.
import * as THREE from 'three';
import { PILLARS } from './figures-registry.js?v=1792368740394';
export const PILLAR_IMAGE = PILLARS.image;
export const PILLAR_FACES = PILLARS.images || [PILLAR_IMAGE, PILLAR_IMAGE, PILLAR_IMAGE];   // d46: per-face images (faces 0,1 = Project Driftwood orb-matt.jpg, face 2 = pillar-matt.jpg)               // swap this one constant (or PILLARS.image) for a photo of Matt later
const D = Math.PI / 180, A = PILLARS.audio;
const dist = (a, b, c, d) => { const y = (c - a) * 111320, x = (d - b) * 111320 * Math.cos(a * D); return Math.hypot(x, y) };
const brgEN = (a, b, c, d) => [(d - b) * 111320 * Math.cos(a * D), (c - a) * 111320];
/** proximity gain: 1 within fullM, raised-cosine fade to 0 at silentM */
export const pillarGain = d => d <= A.fullM ? 1 : d >= A.silentM ? 0 : .5 * (1 + Math.cos(Math.PI * (d - A.fullM) / (A.silentM - A.fullM)));
function prismGeo(side, h, y0) {
  const R = side / Math.sqrt(3), P = [], U = [], N = [], I = [];
  for (let k = 0; k < 3; k++) { const a0 = k * 120 * D, a1 = (k + 1) * 120 * D, x0 = R * Math.sin(a0), z0 = R * Math.cos(a0), x1 = R * Math.sin(a1), z1 = R * Math.cos(a1);
    const nx = Math.sin(a0 + 60 * D), nz = Math.cos(a0 + 60 * D), b = P.length / 3;   // face normal points out between the two corners
    P.push(x0, y0, z0, x1, y0, z1, x1, y0 + h, z1, x0, y0 + h, z0); U.push(0, 0, 1, 0, 1, 1, 0, 1); for (let i = 0; i < 4; i++) N.push(nx, 0, nz);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3); /* one draw group per face */ }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I); for (let k = 0; k < 3; k++) g.addGroup(k * 6, 6, k); return g;
}
/* unlit 'contain' image material (instancing-aware): fits the whole image on a face of aspect faceA (w/h) without stretching; leftover bands get a dark neon-purple gradient */
/* d48: near cut - fragments within 1.2 m of the eye are discarded, so flying into / standing inside a pillar never fills the view purple+poster (Quest fast flight) */
const FIT_V = 'varying vec2 vUv;varying float vNC;\nvoid main(){vUv=uv;vec4 p=vec4(position,1.);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\nvec4 mv=modelViewMatrix*p;vNC=-mv.z/max(1e-6,length(modelMatrix[0].xyz));gl_Position=projectionMatrix*mv;}';
const FIT_F = 'uniform sampler2D map;uniform float faceA,imgA,lum;varying vec2 vUv;varying float vNC;\nvoid main(){if(vNC<1.2)discard;vec2 u=vUv;vec2 s=imgA>faceA?vec2(1.,faceA/imgA):vec2(imgA/faceA,1.);vec2 q=(u-.5)/s+.5;\n'
 + 'float inside=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);float e=max(0.,max(max(-q.x,q.x-1.),max(-q.y,q.y-1.)));/* >=0: exp() below must not overflow inside the image */\n'
 + 'vec3 band=mix(vec3(.30,.04,.55),vec3(.035,.005,.07),clamp(e*s.y*6.,0.,1.))+vec3(.55,.1,.9)*exp(-min(e*s.y*90.,30.));\n'
 + 'vec3 c=inside>.5?texture2D(map,clamp(q,0.,1.)).rgb:band;gl_FragColor=vec4(c*lum,1.);\n#include <colorspace_fragment>\n}';
export function fitMaterial(tex, faceA) { const m = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, faceA: { value: faceA }, imgA: { value: faceA }, lum: { value: 1 } }, vertexShader: FIT_V, fragmentShader: FIT_F, side: THREE.FrontSide });
  const up = () => { const im = tex.image; if (im && im.width) m.uniforms.imgA.value = im.width / im.height }; if (tex.image) up(); else tex.onUpdate = up; m.userData.up = up; return m }
function capGeo(side, h, y0) {   // closed triangular slab (plinth / cap), flat-shaded
  const R = side / Math.sqrt(3), c = [0, 1, 2].map(k => [R * Math.sin(k * 120 * D), R * Math.cos(k * 120 * D)]), P = [];
  const tri = (a, b, e) => P.push(...a, ...b, ...e);
  const lo = c.map(([x, z]) => [x, y0, z]), hi = c.map(([x, z]) => [x, y0 + h, z]);
  tri(hi[0], hi[1], hi[2]); tri(lo[0], lo[2], lo[1]);
  for (let k = 0; k < 3; k++) { const j = (k + 1) % 3; tri(lo[k], lo[j], hi[j]); tri(lo[k], hi[j], hi[k]) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
}
const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967296 };
export function initPillars(parent, toLocal, cam, opts = {}) {
  const S = { list: [], groups: [], night: 0, near: null, nearD: null, voices: [], ready: false, err: null, epoch: null, base: null, toastd: false };
  const geo = prismGeo(PILLARS.sideM, PILLARS.heightM - PILLARS.plinthM - PILLARS.capM, PILLARS.plinthM);
  const plG = capGeo(PILLARS.sideM * 1.18, PILLARS.plinthM, 0), cpG = capGeo(PILLARS.sideM * 1.06, PILLARS.capM, PILLARS.heightM - PILLARS.capM);
  const ringG = new THREE.RingGeometry(.55, 1.1, 24).rotateX(-Math.PI / 2).translate(0, .02, 0);
  const plM = new THREE.MeshLambertMaterial({ color: 0x2a1446, emissive: 0x1a0830 });
  const cpM = new THREE.MeshBasicMaterial({ color: 0x2ff5df });
  for (const m of [plM, cpM]) m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vNC;').replace('#include <project_vertex>', '#include <project_vertex>\nvNC=-mvPosition.z/max(1e-6,length(modelMatrix[0].xyz));');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vNC;').replace('void main() {', 'void main() {\nif(vNC<1.2)discard;') };   // d48 near cut (see FIT_V)
  const ringM = new THREE.MeshBasicMaterial({ color: 0xa45cff, transparent: true, opacity: .15, depthWrite: false, blending: THREE.AdditiveBlending });
  const tl = new THREE.TextureLoader(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  const root = new THREE.Group(); root.name = 'pillars'; parent.add(root);
  const ver = window.EEAR_V ? '?v=' + window.EEAR_V : '';
  fetch((opts.url || PILLARS.url) + ver).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }).then(j => {
    S.list = j.pillars.map(p => ({ ...p, yaw: hash(p.id) * 2 * Math.PI }));
    const faces = p => p.images && p.images.length === 3 ? p.images : p.image ? [p.image, p.image, p.image] : PILLAR_FACES;
    const by = {}; for (const p of S.list) (by[faces(p).join('|')] ||= []).push(p);
    const faceA = PILLARS.sideM / (PILLARS.heightM - PILLARS.plinthM - PILLARS.capM), texs = {};
    const texOf = img => texs[img] ||= (() => { const t = tl.load(img + (PILLAR_FACES.includes(img) ? ver : ''), () => { for (const G of S.groups) G.mats.forEach(m => m.userData.up()) }); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t })();
    const mk = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im };
    for (const [key, ps] of Object.entries(by)) {   // unlit: readable at night, day lighting can't black it out. One material per distinct image (shared across faces/groups)
      const mats = key.split('|').map(img => fitMaterial(texOf(img), faceA)), uniq = [...new Set(mats)];
      S.groups.push({ ps, face: mk(geo, mats, ps.length), mats });
    }
    S.plinth = mk(plG, plM, S.list.length); S.cap = mk(cpG, cpM, S.list.length); S.ring = mk(ringG, ringM, S.list.length); S.ring.renderOrder = 2;
    S.ready = true; place(true); api.setNight(S.night);
  }).catch(e => { S.err = String(e.message || e); console.warn('pillars', e) });
  let lastKey = '', lastPlace = 0;
  function place(force) {
    if (!S.ready) return; const o = toLocal(S.list[0].lat, S.list[0].lon); if (!o) return;
    const key = o.x.toFixed(2) + ',' + o.y.toFixed(2) + ',' + o.z.toFixed(2); const camP = cam && cam.getWorldPosition ? cam.getWorldPosition(new THREE.Vector3()) : null;
    if (camP) root.worldToLocal(camP);
    if (!force && key === lastKey && !camP) return; lastKey = key;
    let all = 0; const vis = PILLARS.visibleM;
    const put = (im, i, p, w) => { q.setFromAxisAngle(Y, p.yaw); m4.compose(w, q, (camP && w.distanceTo(camP) > vis) ? zero : one); im.setMatrixAt(i, m4) };
    for (const G of S.groups) G.ps.forEach((p, i) => { const w = toLocal(p.lat, p.lon); if (!w) return; p._w = w;   /* toLocal already returns parent-local coords (scene in index, rig frame in quest) */ put(G.face, i, p, w) }), G.face.instanceMatrix.needsUpdate = true;
    S.list.forEach((p, i) => { if (!p._w) return; put(S.plinth, i, p, p._w); put(S.cap, i, p, p._w); put(S.ring, i, p, p._w); all++ });
    S.plinth.instanceMatrix.needsUpdate = S.cap.instanceMatrix.needsUpdate = S.ring.instanceMatrix.needsUpdate = true; S.placed = all;
  }
  // ---------------- proximity music (d45: the CURRENT Master DJ track, not a fixed loop) ----------------
  // dj.js owns ONE streaming <audio> synced to server time; its output node feeds up to PILLARS.audio.voices gain -> HRTF panner chains here.
  // Paused / empty DJ queue = silence. Switching pillars never restarts the song (same element, same clock).
  let pb = null, tr = null, lastScan = 0;
  function voiceStop(vc, t, fade = A.fadeS) { try { vc.g.gain.cancelScheduledValues(t); vc.g.gain.setValueAtTime(vc.g.gain.value, t); vc.g.gain.linearRampToValueAtTime(0, t + fade) } catch (e) { } vc.dead = true; setTimeout(() => { try { tr.disconnect(vc.g); vc.g.disconnect(); vc.pan.disconnect() } catch (e) { } }, (fade + .3) * 1000) }
  function voiceStart(ctx, p) {
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createPanner(); Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0, maxDistance: 1e6, coneInnerAngle: 360, coneOuterAngle: 360 });
    tr.connect(g); g.connect(pan); pan.connect(pb); return { p, g, pan, t0: ctx.currentTime + .06 };
  }
  function audioFrame(now) {
    const AU = window.EEAR_AUDIO, DJ = window.EEAR_DJ; if (!AU || !S.ready) return; const ctx = AU.ctx, L = AU.listener;
    if (!ctx || !AU.on || !L || !DJ || !DJ.node) { if (S.voices.length && ctx) { const t = ctx.currentTime; S.voices.forEach(vc => voiceStop(vc, t, .05)); S.voices = [] } DJ && DJ.want('pillars', false); AU && AU.setDuck && AU.setDuck(1);
      if (L && !S.toastd && now - lastScan > 1000) { lastScan = now; const n = nearest(L, 1)[0]; if (n && n.d < A.silentM) { S.toastd = true; const c = DJ && DJ.current; window.eearToast && eearToast('🔺 A Matt Ready pillar is playing the Master DJ' + (c ? ' (' + c.title + ')' : '') + ' nearby. Tap 🎵 Music to hear it.', 5000) } } return }
    if (!pb) { pb = ctx.createGain(); pb.gain.value = 1; pb.connect(AU.out); tr = ctx.createGain(); tr.gain.value = A.levelTrim * (A.djTrim || .7); DJ.node.connect(tr) }
    const t = ctx.currentTime;
    if (now - lastScan > A.scanMs) { lastScan = now;
      const want = nearest(L, A.voices).filter(c => c.d < A.silentM + 5), ids = new Set(want.map(c => c.p.id));
      for (const vc of S.voices) if (!ids.has(vc.p.id)) voiceStop(vc, t);
      S.voices = S.voices.filter(vc => !vc.dead);
      for (const c of want) if (!S.voices.some(vc => vc.p.id === c.p.id)) S.voices.push(voiceStart(ctx, c.p));
      DJ.want('pillars', want.length > 0);
      S.near = want[0] ? want[0].p.name + ' ' + Math.round(want[0].d) + ' m' : null; S.nearD = want[0] ? want[0].d : null;
    }
    const live = DJ.at().playing; let mx = 0;
    for (const vc of S.voices) { const p = vc.p, h = dist(L.lat, L.lon, p.lat, p.lon), up = PILLARS.heightM / 2 - 1.6 - (L.alt || 0), d = Math.hypot(h, up), gn = pillarGain(d);
      if (live) mx = Math.max(mx, gn); vc.g.gain.setTargetAtTime(gn, Math.max(t, vc.t0), A.tauS);
      const [e, n] = brgEN(L.lat, L.lon, p.lat, p.lon), pp = vc.pan;   // same ENU listener frame as audio.js (listener at origin, -Z = north)
      if (pp.positionX) { pp.positionX.setTargetAtTime(e, t, .05); pp.positionY.setTargetAtTime(up, t, .05); pp.positionZ.setTargetAtTime(-n, t, .05) } else pp.setPosition(e, up, -n) }
    AU.setDuck(1 - A.duck * mx);   // the Garden beacon ducks while a pillar is audible (no duck while the DJ is paused)
  }
  function nearest(L, k) { const out = []; for (const p of S.list) { const d = Math.hypot(dist(L.lat, L.lon, p.lat, p.lon), (L.alt || 0)); if (out.length < k || d < out[out.length - 1].d) { out.push({ p, d }); out.sort((a, b) => a.d - b.d); if (out.length > k) out.pop() } } return out }
  const api = {
    update(dt) { const now = performance.now(); if (now - lastPlace > 250) { lastPlace = now; place(false) } try { audioFrame(now) } catch (e) { if (!S.aerr) { S.aerr = 1; console.warn('pillar audio', e) } } },
    setNight(n) { S.night = n; ringM.opacity = .1 + .55 * n; cpM.color.setHSL(.48, 1, .45 + .2 * n); for (const G of S.groups) G.mats.forEach(m => m.uniforms.lum.value = .88 + .12 * n) },
    get list() { return S.list }, get placed() { return S.placed || 0 }, get near() { return S.near }, get nearD() { return S.nearD }, get voices() { return S.voices.map(v => ({ id: v.p.id, gain: +v.g.gain.value.toFixed(3) })) },
    get err() { return S.err }, gain: pillarGain, root, image: PILLAR_IMAGE, state: S,
  };
  return api;
}
