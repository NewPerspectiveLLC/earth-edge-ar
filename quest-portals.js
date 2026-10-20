// quest-portals.js (d51): Quest main-world portals.
//  🎬 MOVIE THEATER portal -> a big dim theater room (rows of seats, 24 m screen) playing the Videos on Loop reel WITH sound,
//     server-time synced like the drive-in (same epoch: pos = ((serverNow - epoch)/1000) mod duration). EXIT portal (behind the seats) -> back.
//  🌀 READY ATHLETICS portal -> the RA vortex standing spot (ra-center.json?v=1792455290575 'standing' 48.1062,-122.8057); a '↩ Back' portal appears there.
// Enter: walk/fly into a portal ring, or aim the right laser at it and pull the trigger (trigger fast flight is untouched; it still flies).
// Also in the Y-panel: Portals section. While in the theater only the room + your rig render (camera layer 5), so the world / passthrough
// disappear; leaving restores the normal view. Lite-friendly: unlit materials, instanced seats, 640x360 reel in Lite mode.
const T = AFRAME.THREE;
const RA = [48.1062, -122.8057], LAYER = 5, D = Math.PI / 180;
const wait = () => new Promise(r => { const iv = setInterval(() => { const sc = document.querySelector('a-scene'); if (window.QF && sc && sc.camera && sc.hasLoaded) { clearInterval(iv); r(sc) } }, 250) });
const sc = await wait();
const rigEl = document.getElementById('rig'), rig = rigEl.object3D, cam = () => sc.camera, F = window.QF;
const sayQ = t => { try { (window.qSay || window.say)(t) } catch (e) { } };
const home = () => { try { return HOME } catch (e) { return RA } };   // quest.html global (manual location or RA)
const where = (a, l) => { const h = home(), m = 111320 * Math.cos(h[0] * D); return new T.Vector3((l - h[1]) * m, 0, -(a - h[0]) * 111320) };
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t }
function label(text, sub, col) { const t = tex(512, 160, (g, w, h) => { g.fillStyle = 'rgba(10,6,20,.85)'; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = col; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 62, w - 40); g.fillStyle = '#fff'; g.font = '30px sans-serif'; g.fillText(sub, w / 2, 122, w - 40) });
  const m = new T.Mesh(new T.PlaneGeometry(2.4, .75), new T.MeshBasicMaterial({ map: t, transparent: true, side: T.DoubleSide })); m.userData.bill = 1; return m }
function portal(name, sub, col, onEnter) {
  const g = new T.Group(); g.name = 'portal:' + name;
  const ring = new T.Mesh(new T.TorusGeometry(1.1, .09, 8, 40), new T.MeshBasicMaterial({ color: col })); ring.position.y = 1.35; g.add(ring);
  const sw = tex(256, 256, (c, w, h) => { const r = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); r.addColorStop(0, '#ffffff'); r.addColorStop(.35, col); r.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = r; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 6; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(w / 2, h / 2, 20 + i * 18, i, i + 2.2); c.stroke() } });
  const disc = new T.Mesh(new T.CircleGeometry(1.02, 32), new T.MeshBasicMaterial({ map: sw, transparent: true, opacity: .85, side: T.DoubleSide, depthWrite: false })); disc.position.y = 1.35; g.add(disc);
  const base = new T.Mesh(new T.CylinderGeometry(1.2, 1.3, .08, 32), new T.MeshBasicMaterial({ color: 0x1a1030 })); base.position.y = .04; g.add(base);
  const lb = label(name, sub, col); lb.position.y = 2.95; g.add(lb);
  g.userData = { onEnter, disc, ring, r: 1.15, cool: 0, inside: true }; return g
}
// ---------------- main-world portals (in the world frame, a few metres north of the start spot) ----------------
const P = { mode: 'world', back: null, theater: null, video: null, cfg: null, list: [] };
const mainG = new T.Group(); mainG.name = 'portals'; F.add(mainG);
const pTh = portal('🎬 MOVIE THEATER', 'walk in · or aim + trigger', '#ffc860', () => enterTheater());
const pRA = portal('🌀 READY ATHLETICS', 'RA vortex standing spot', '#2ff5df', () => goRA());
pTh.position.set(-2.2, 0, -5); pRA.position.set(2.2, 0, -5); mainG.add(pTh, pRA); P.list.push(pTh, pRA);
let pBack = null;   // '↩ Back' portal at the RA spot
function rigWorldFeet() { const p = new T.Vector3(); cam().getWorldPosition(p); p.y = rig.position.y; return p }
function teleportTo(worldP) {   // move the rig so the head lands on worldP (feet on its y)
  const h = new T.Vector3(); cam().getWorldPosition(h); rig.position.x += worldP.x - h.x; rig.position.z += worldP.z - h.z; rig.position.y = Math.max(0, worldP.y);
  if (window.QFLY) { QFLY.alt = rig.position.y; QFLY.take = null } }
function goRA() {
  const from = rigWorldFeet(); const t = where(RA[0], RA[1]); const w = F.localToWorld(t.clone()); teleportTo(w);
  if (!pBack) { pBack = portal('↩ BACK', 'to where you were', '#b98cff', () => { const b = pBack.userData.to; if (b) { teleportTo(b); sayQ('Back where you were') } }); mainG.add(pBack); P.list.push(pBack) }
  pBack.userData.to = from; const fw = new T.Vector3(); cam().getWorldDirection(fw); fw.y = 0; if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1); fw.normalize();
  const bp = w.clone().addScaledVector(fw, 4); pBack.position.copy(F.worldToLocal(bp)); pBack.position.y = 0; pBack.visible = true;
  sayQ('Ready Athletics vortex standing spot (48.1062, -122.8057). The ↩ Back portal is in front of you.') }
// ---------------- theater room ----------------
function buildTheater() {
  const R = new T.Group(); R.name = 'theater'; const lite = !!window.EEAR_LITE;
  const W = 30, L = 42, H = 15, mat = c => new T.MeshBasicMaterial({ color: c });
  const box = (w, h, d, x, y, z, m) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); R.add(o); return o };
  // room (viewer enters at z=0 facing -Z; screen wall at z=-30, back wall at z=+12)
  box(W, .2, L, 0, -.1, -9, mat(0x2a0a12));                       // carpet
  box(W, .2, L, 0, H, -9, mat(0x07050c));                         // ceiling
  box(.4, H, L, -W / 2, H / 2, -9, mat(0x1a0d14)); box(.4, H, L, W / 2, H / 2, -9, mat(0x1a0d14));
  box(W, H, .4, 0, H / 2, -30, mat(0x050308)); box(W, H, .4, 0, H / 2, 12, mat(0x140a10));
  for (const x of [-W / 2 + .3, W / 2 - .3]) for (let i = 0; i < 7; i++) box(.15, 3, .5, x, 6, -26 + i * 5.5, mat(0x5a1220));   // wall drapes
  for (const x of [-W / 2 + .4, W / 2 - .4]) for (let i = 0; i < 8; i++) box(.12, .12, .12, x, 3.2, -26 + i * 5, mat(0xffb040));   // sconces
  for (let i = 0; i < 16; i++) box(.1, .05, .3, -1.2, .03, -24 + i * 2.2, mat(0xffc860)), box(.1, .05, .3, 1.2, .03, -24 + i * 2.2, mat(0xffc860));   // aisle lights
  // screen 24 x 13.5 m + frame + stage
  const SW = 24, SH = 13.5, sy = 1.6 + SH / 2;
  box(SW + 1.2, SH + 1.2, .2, 0, sy, -29.7, mat(0x0d0a12)); box(SW + 2, .6, .4, 0, sy + SH / 2 + .9, -29.6, mat(0xffc860));
  box(W - 2, 1.2, 3, 0, .6, -28, mat(0x3a1018));                  // stage
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.loop = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  v.setAttribute('playsinline', ''); v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1'; v.id = 'theaterV'; document.body.appendChild(v);
  const vt = new T.VideoTexture(v); vt.colorSpace = T.SRGBColorSpace; vt.minFilter = T.LinearFilter; vt.generateMipmaps = false;
  const scrM = new T.MeshBasicMaterial({ color: 0x222233, toneMapped: false }), scr = new T.Mesh(new T.PlaneGeometry(SW, SH), scrM); scr.position.set(0, sy, -29.55); R.add(scr);
  v.addEventListener('loadeddata', () => { scrM.map = vt; scrM.color.set(0xffffff); scrM.needsUpdate = true });
  const glow = new T.Mesh(new T.PlaneGeometry(SW * 1.25, 1.2), new T.MeshBasicMaterial({ color: 0x6a5a80, transparent: true, opacity: .25, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(0, .02, -22); if (!lite) R.add(glow);
  // seats: 9 rows x 16 (two blocks around the centre aisle), instanced seat + back
  const rows = 9, per = 8, seatG = new T.BoxGeometry(.6, .45, .6), backG = new T.BoxGeometry(.6, .7, .12);
  const sM = new T.MeshBasicMaterial({ color: 0x8a1626 }), bM = new T.MeshBasicMaterial({ color: 0x6a0f1c });
  const n = rows * per * 2, IS = new T.InstancedMesh(seatG, sM, n), IB = new T.InstancedMesh(backG, bM, n), m4 = new T.Matrix4(); let k = 0;
  for (let r = 0; r < rows; r++) { const z = -16 + r * 1.6, y = .22 + r * .32; box(W - 1, .1, 1.6, 0, y - .25, z, mat(0x220810));   // tiered risers
    for (const side of [-1, 1]) for (let i = 0; i < per; i++) { const x = side * (1.9 + i * .72); m4.makeTranslation(x, y, z); IS.setMatrixAt(k, m4); m4.makeTranslation(x, y + .5, z + .3); IB.setMatrixAt(k, m4); k++ } }
  R.add(IS, IB);
  // marquee + hint over the screen
  const mq = label('🎬 MATT READY THEATER', 'Videos on Loop · sound on', '#ffc860'); mq.scale.setScalar(4); mq.position.set(0, sy + SH / 2 + 2.6, -29.4); mq.userData.bill = 0; R.add(mq);
  const hint = label('▶ Pull trigger for sound', 'if the movie is silent', '#ffffff'); hint.scale.setScalar(2.2); hint.position.set(0, sy, -29.4); hint.userData.bill = 0; hint.visible = false; R.add(hint);
  // exit portal behind the back row
  const ex = portal('EXIT ↩', 'back to the main world', '#b98cff', () => exitTheater()); ex.position.set(0, 0, 6); ex.rotation.y = Math.PI; R.add(ex);
  R.traverse(o => o.layers.set(LAYER)); R.visible = false; sc.object3D.add(R);
  return { R, v, ex, hint, scr }
}
const srvNow = () => Date.now() + ((window.EEAR_DJ && EEAR_DJ.offsetMs) || 0);
function syncV(force) { const c = P.cfg, v = P.theater && P.theater.v; if (!c || !v || v.readyState < 1 || v.seeking) return; const dur = v.duration || c.duration, tg = (((srvNow() - c.epoch) / 1000) % dur + dur) % dur;
  let e = v.currentTime - tg; if (e > dur / 2) e -= dur; if (e < -dur / 2) e += dur; if (force || (Math.abs(e) > .8 && performance.now() - (P.lastSeek || 0) > 4000)) { P.lastSeek = performance.now(); try { v.currentTime = tg } catch (x) { } } }
function playSound() { const th = P.theater; if (!th) return; th.v.muted = false; th.v.volume = 1; const p = th.v.play(); th.hint.visible = false;
  if (p && p.catch) p.catch(() => { th.v.muted = true; th.v.play().catch(() => { }); th.hint.visible = true }) }
async function enterTheater() {
  if (P.mode === 'theater') return; if (!P.theater) P.theater = buildTheater(); const th = P.theater;
  if (!P.cfg) { try { P.cfg = await fetch('video/drivein/screen' + '.json', { cache: 'no-cache' }).then(r => r.json()) } catch (e) { sayQ('Theater: video list not reachable') } }
  if (P.cfg && !th.v.src) { th.v.src = new URL(window.EEAR_LITE ? P.cfg.lite : P.cfg.main, document.baseURI).href; th.v.addEventListener('loadedmetadata', () => syncV(true), { once: true }) }
  P.back = { pos: rig.position.clone(), quat: rig.quaternion.clone() };
  // put the room around the viewer: feet at the rig floor, facing the screen along the current look direction
  const h = new T.Vector3(); cam().getWorldPosition(h); const fw = new T.Vector3(); cam().getWorldDirection(fw); const yaw = Math.atan2(-fw.x, -fw.z);
  th.R.position.set(h.x, rig.position.y, h.z); th.R.rotation.set(0, yaw, 0); th.R.updateMatrixWorld(true);
  // seat the viewer in row 5, centre aisle (z = -8 in room coords)
  teleportTo(th.R.localToWorld(new T.Vector3(0, .22 + 5 * .32, -8 + .9)));
  th.R.visible = true; P.mode = 'theater'; setLayers(true); playSound(); syncV(true);
  sayQ('🎬 Matt Ready Theater: Videos on Loop with sound. EXIT portal is behind you.') }
function exitTheater() {
  if (P.mode !== 'theater') return; const th = P.theater; th.v.pause(); th.v.muted = true; th.R.visible = false; setLayers(false); P.mode = 'world';
  if (P.back) { rig.position.copy(P.back.pos); rig.quaternion.copy(P.back.quat); if (window.QFLY) { QFLY.alt = rig.position.y; QFLY.take = null } }
  sayQ('Back in the main world') }
function setLayers(on) { const c = cam(); if (on) { c.layers.set(LAYER); rig.traverse(o => o.layers.enable(LAYER)); for (const id of ['msg', 'bm']) { const e = document.getElementById(id); e && e.object3D.traverse(o => o.layers.enable(LAYER)) } } else c.layers.set(0);
  window.QTHEATER = on }
// ---------------- entering: walk-in + laser/trigger ----------------
const rh = document.getElementById('rh');
const rc = new T.Raycaster();
rh && rh.addEventListener('triggerdown', () => { if (P.mode === 'theater') { playSound() }
  const o = rh.object3D; o.getWorldPosition(rc.ray.origin); rc.ray.direction.set(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new T.Quaternion())); rc.far = 40;
  const cand = P.mode === 'theater' ? [P.theater.ex] : P.list.filter(p => p.visible);
  for (const p of cand) { const hit = rc.intersectObject(p.userData.disc, false)[0] || rc.intersectObject(p.userData.ring, false)[0]; if (hit) { fire(p); break } } });
document.addEventListener('click', () => { if (P.mode === 'theater' && P.theater.v.muted) playSound() });
function fire(p) { const now = performance.now(); if (now < (p.userData.cool || 0)) return; for (const q of [...P.list, P.theater && P.theater.ex].filter(Boolean)) q.userData.cool = now + 2500; p.userData.onEnter() }
const hv = new T.Vector3(), pv = new T.Vector3(), cq = new T.Vector3();
let lt = 0, ls = 0;
AFRAME.registerComponent('quest-portals', { tick(t) {
  const c = cam(); if (!c) return; c.getWorldPosition(hv); const th = P.theater;
  if (th && P.mode === 'theater' && c.layers.mask !== (1 << LAYER)) setLayers(true);   // keep the world hidden (XR cameras inherit the mask)
  const live = P.mode === 'theater' ? [th.ex] : P.list.filter(p => p.visible);
  for (const p of live) { p.userData.disc.rotation.z = t / 900; p.getWorldPosition(pv);
    const lb = p.children[p.children.length - 1]; if (lb.userData.bill) { lb.getWorldPosition(cq); lb.lookAt(hv.x, cq.y, hv.z) }
    const dy = hv.y - pv.y, inside = Math.hypot(hv.x - pv.x, hv.z - pv.z) < p.userData.r && dy > -.5 && dy < 3.2;
    if (inside && p.userData.inside === false) fire(p); p.userData.inside = inside }   /* fires on stepping IN (not when you arrive standing in one) */
  if (th && P.mode === 'theater' && t - ls > 2000) { ls = t; syncV(false); if (th.v.paused) th.v.play().catch(() => { }) }
} });
sc.setAttribute('quest-portals', '');
window.QPORTALS = { enterTheater, exitTheater, goRA, back: () => pBack && pBack.userData.onEnter(), get mode() { return P.mode }, state: P, main: mainG };
