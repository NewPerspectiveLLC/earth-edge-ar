// pillars.js (d44): Matt Ready triangular-prism billboard pillars scattered around Port Townsend + proximity music.
// Data: pillars.json (OSM-derived public spots: street-corner right-of-way, parks, landmarks, trails). Placement/size/audio constants live in figures-registry.js (PILLARS).
// Rendering: one shared prism geometry, one unlit material per image (default PILLAR_IMAGE; a pillar may set "image" to override), InstancedMesh, per-instance distance cull.
// Audio: every pillar plays the Disco Jam from its own spot. Only the nearest PILLARS.audio.voices (2) pillars inside silentM get a looping
// AudioBufferSourceNode -> gain -> HRTF PannerNode; all share ONE decoded buffer and a common loop clock, so switching pillars never restarts the song.
import * as THREE from 'three';
import { PILLARS } from './figures-registry.js?v=1792260464493';
export const PILLAR_IMAGE = PILLARS.image;               // swap this one constant (or PILLARS.image) for a photo of Matt later
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
    I.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I); return g;
}
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
  const ringM = new THREE.MeshBasicMaterial({ color: 0xa45cff, transparent: true, opacity: .15, depthWrite: false, blending: THREE.AdditiveBlending });
  const tl = new THREE.TextureLoader(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  const root = new THREE.Group(); root.name = 'pillars'; parent.add(root);
  const ver = window.EEAR_V ? '?v=' + window.EEAR_V : '';
  fetch((opts.url || PILLARS.url) + ver).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }).then(j => {
    S.list = j.pillars.map(p => ({ ...p, yaw: hash(p.id) * 2 * Math.PI }));
    const by = {}; for (const p of S.list) (by[p.image || PILLAR_IMAGE] ||= []).push(p);
    const mk = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im };
    for (const [img, ps] of Object.entries(by)) {
      const tex = tl.load(img + (img === PILLAR_IMAGE ? ver : '')); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, side: THREE.FrontSide });   // unlit: readable at night, day lighting can't black it out
      S.groups.push({ ps, face: mk(geo, mat, ps.length), mat });
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
  // ---------------- proximity music ----------------
  let pb = null, buf = null, loading = false, lastScan = 0;
  function voiceStop(vc, t, fade = A.fadeS) { try { vc.g.gain.cancelScheduledValues(t); vc.g.gain.setValueAtTime(vc.g.gain.value, t); vc.g.gain.linearRampToValueAtTime(0, t + fade); vc.src.stop(t + fade + .05) } catch (e) { } vc.dead = true; setTimeout(() => { try { vc.src.disconnect(); vc.g.disconnect(); vc.pan.disconnect() } catch (e) { } }, (fade + .3) * 1000) }
  function loopBase(ctx) {   // align to the beacon when it plays the same track, else a fixed epoch: every pillar shares one loop phase
    const AU = window.EEAR_AUDIO; if (AU && AU.track === A.trackId && AU.on && AU.startedAt != null) return AU.startedAt;
    if (S.epoch == null) S.epoch = ctx.currentTime; return S.epoch;
  }
  function voiceStart(ctx, p) {
    const T = (window.EEAR_AUDIO.TRACKS || []).find(t => t.id === A.trackId) || {}, LE = Math.min(T.loopEnd || buf.duration, buf.duration);
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = LE;
    const g = ctx.createGain(); g.gain.value = 0; const tr = ctx.createGain(); tr.gain.value = (T.trim || 1) * A.levelTrim;
    const pan = ctx.createPanner(); Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0, maxDistance: 1e6, coneInnerAngle: 360, coneOuterAngle: 360 });
    src.connect(tr); tr.connect(g); g.connect(pan); pan.connect(pb);
    const t0 = ctx.currentTime + .06, base = loopBase(ctx); S.base = base; const off = (((t0 - base) % LE) + LE) % LE; src.start(t0, off);
    return { p, src, g, pan, base, t0 };
  }
  function audioFrame(now) {
    const AU = window.EEAR_AUDIO; if (!AU || !S.ready) return; const ctx = AU.ctx, L = AU.listener;
    if (!ctx || !AU.on || !L) { if (S.voices.length && ctx) { const t = ctx.currentTime; S.voices.forEach(vc => voiceStop(vc, t, .05)); S.voices = [] } AU && AU.setDuck && AU.setDuck(1);
      if (L && !S.toastd && now - lastScan > 1000) { lastScan = now; const n = nearest(L, 1)[0]; if (n && n.d < A.silentM) { S.toastd = true; window.eearToast && eearToast('🔺 A Matt Ready pillar is playing the Disco Jam nearby. Tap 🎵 Music to hear it.', 5000) } } return }
    if (!pb) { pb = ctx.createGain(); pb.gain.value = 1; pb.connect(AU.out) }
    if (!buf) { if (!loading) { loading = true; AU.buffer(A.trackId).then(b => buf = b).catch(e => { S.err = 'audio: ' + (e.message || e) }).finally(() => loading = false) } return }
    const t = ctx.currentTime;
    if (now - lastScan > A.scanMs) { lastScan = now;
      const want = nearest(L, A.voices).filter(c => c.d < A.silentM + 5), ids = new Set(want.map(c => c.p.id));
      const base = loopBase(ctx);
      for (const vc of S.voices) if (!ids.has(vc.p.id) || Math.abs(vc.base - base) > .02) voiceStop(vc, t);
      S.voices = S.voices.filter(vc => !vc.dead);
      for (const c of want) if (!S.voices.some(vc => vc.p.id === c.p.id)) S.voices.push(voiceStart(ctx, c.p));
      S.near = want[0] ? want[0].p.name + ' ' + Math.round(want[0].d) + ' m' : null; S.nearD = want[0] ? want[0].d : null;
    }
    let mx = 0;
    for (const vc of S.voices) { const p = vc.p, h = dist(L.lat, L.lon, p.lat, p.lon), up = PILLARS.heightM / 2 - 1.6 - (L.alt || 0), d = Math.hypot(h, up), gn = pillarGain(d);
      mx = Math.max(mx, gn); vc.g.gain.setTargetAtTime(gn, Math.max(t, vc.t0), A.tauS);
      const [e, n] = brgEN(L.lat, L.lon, p.lat, p.lon), pp = vc.pan;   // same ENU listener frame as audio.js (listener at origin, -Z = north)
      if (pp.positionX) { pp.positionX.setTargetAtTime(e, t, .05); pp.positionY.setTargetAtTime(up, t, .05); pp.positionZ.setTargetAtTime(-n, t, .05) } else pp.setPosition(e, up, -n) }
    AU.setDuck(1 - A.duck * mx);   // the Garden beacon ducks while a pillar is audible
  }
  function nearest(L, k) { const out = []; for (const p of S.list) { const d = Math.hypot(dist(L.lat, L.lon, p.lat, p.lon), (L.alt || 0)); if (out.length < k || d < out[out.length - 1].d) { out.push({ p, d }); out.sort((a, b) => a.d - b.d); if (out.length > k) out.pop() } } return out }
  const api = {
    update(dt) { const now = performance.now(); if (now - lastPlace > 250) { lastPlace = now; place(false) } try { audioFrame(now) } catch (e) { if (!S.aerr) { S.aerr = 1; console.warn('pillar audio', e) } } },
    setNight(n) { S.night = n; ringM.opacity = .1 + .55 * n; cpM.color.setHSL(.48, 1, .45 + .2 * n); for (const G of S.groups) G.mat.color.setScalar(.88 + .12 * n) },
    get list() { return S.list }, get placed() { return S.placed || 0 }, get near() { return S.near }, get nearD() { return S.nearD }, get voices() { return S.voices.map(v => ({ id: v.p.id, gain: +v.g.gain.value.toFixed(3) })) },
    get err() { return S.err }, gain: pillarGain, root, image: PILLAR_IMAGE, state: S,
  };
  return api;
}
