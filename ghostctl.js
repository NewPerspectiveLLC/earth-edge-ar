// ghostctl.js (d47; d49: + Orb flight section from orbctl.js -> 'Ghost & Orb controls'): Ghost controls. Per-device settings for the Ghost bot (the tuxedo 'shadow' that walks near you in Live Geometry).
// Client-side only: the ghost bot is drawn on this device and never sent to the server (nothing about it, or you, is shared). Settings: localStorage.eearGhostCfg,
// applied live (also from ghost.html in another tab via the 'storage' event). Mode 'classic' = the original loop/wander behaviour; the others are driven here.
import { DANCES, resetPose, walkPose } from './extras.js?v=1792453397229';
export const DEFAULTS = { mode: 'classic', speedMin: .3, speedMax: .9, distMin: 2, distMax: 8, dir: 'ccw', loopR: 3, height: 0, jitter: .2, pauseEvery: 20, pauseLen: 4, lag: 1.5, opacity: 1, size: 1, glow: 1, approach: 0, trail: false };
export const PRESETS = {
  Calm: { mode: 'orbit', speedMin: .15, speedMax: .4, distMin: 3, distMax: 6, dir: 'ccw', height: 0, jitter: .05, pauseEvery: 15, pauseLen: 8, lag: 4, opacity: .9, size: 1, glow: .8, approach: 0, trail: false },
  Playful: { mode: 'wander', speedMin: .5, speedMax: 2.5, distMin: 1.5, distMax: 10, dir: 'random', height: .3, jitter: .5, pauseEvery: 10, pauseLen: 3, lag: 1, opacity: 1, size: 1, glow: 1.3, approach: .5, trail: true },
  Shadowing: { mode: 'follow', speedMin: .5, speedMax: 3, distMin: 1, distMax: 2.5, dir: 'ccw', height: 0, jitter: .05, pauseEvery: 0, pauseLen: 2, lag: .6, opacity: .6, size: 1, glow: .5, approach: 0, trail: false },
  Wild: { mode: 'orbit', speedMin: 4, speedMax: 15, distMin: 2, distMax: 40, dir: 'random', height: 1.5, jitter: 1, pauseEvery: 6, pauseLen: 1.5, lag: .3, opacity: 1, size: 1.3, glow: 2, approach: -.6, trail: true } };
// [key, label, min, max, step, one-line help]
export const CONTROLS = [
  ['speedMin', 'Speed min (m/s)', .05, 15, .05, 'slowest the ghost moves (it varies between min and max)'],
  ['speedMax', 'Speed max (m/s)', .05, 15, .05, 'fastest the ghost moves'],
  ['distMin', 'Distance min (m)', .5, 200, .5, 'closest it keeps to you'],
  ['distMax', 'Distance max (m)', .5, 200, .5, 'farthest it roams from you'],
  ['loopR', 'Ghost loop radius (m)', .5, 50, .5, 'circle size in Classic mode (same as the Ghost loop button)'],
  ['height', 'Float height (m)', -1, 20, .1, 'lifts the ghost off the ground (gentle bob when > 0)'],
  ['jitter', 'Jitter / randomness', 0, 1, .05, 'how wobbly and unpredictable its path is'],
  ['pauseEvery', 'Pause every (s, 0 = never)', 0, 120, 1, 'how often it stops to linger, dance or wave'],
  ['pauseLen', 'Pause length (s)', .5, 30, .5, 'how long each linger lasts'],
  ['lag', 'Follow lag (s)', .1, 20, .1, 'how slowly it reacts when you move (higher = lazier)'],
  ['approach', 'Shy ← → Bold', -1, 1, .1, 'shy backs off when you walk at it, bold comes closer'],
  ['opacity', 'Opacity', .1, 1, .05, 'see-through ↔ solid'],
  ['size', 'Size (×)', .3, 5, .1, 'scale of the ghost'],
  ['glow', 'Glow', 0, 3, .1, 'self-illumination of the tux'] ];
const KEY = 'eearGhostCfg';
export function load() { let c = {}; try { c = JSON.parse(localStorage[KEY] || '{}') } catch (e) { } const s = { ...DEFAULTS, ...c }; s.loopR = +(localStorage.eearGhostR || s.loopR); return s }
let S = load(), dirty = true;
export function get() { return { ...S } }
export function set(p) { S = { ...S, ...p }; if (S.speedMin > S.speedMax) [S.speedMin, S.speedMax] = [S.speedMax, S.speedMin]; if (S.distMin > S.distMax) [S.distMin, S.distMax] = [S.distMax, S.distMin];
  localStorage[KEY] = JSON.stringify(S); if ('loopR' in p) { localStorage.eearGhostR = S.loopR; try { window.EEAR_GHOSTCIRCLE && EEAR_GHOSTCIRCLE() } catch (e) { } const b = document.getElementById('grB'); if (b) b.textContent = 'Ghost loop: ' + S.loopR + ' m' } dirty = true; return get() }
export const reset = () => { localStorage.removeItem(KEY); S = { ...DEFAULTS }; localStorage.eearGhostR = S.loopR; set({ loopR: S.loopR }); return get() };
export const preset = n => set({ ...DEFAULTS, ...PRESETS[n], loopR: S.loopR });
addEventListener('storage', e => { if (e.key === KEY || e.key === 'eearGhostR') { S = load(); dirty = true; if (panel && panel.style.display !== 'none') render() } });
// ---- motion engine
const noise = (() => { const K = 64, v = Array.from({ length: K }, () => Math.random() * 2 - 1), e = x => x * x * (3 - 2 * x); return x => { const i = Math.floor(x), f = x - i; return v[((i % K) + K) % K] + (v[(((i + 1) % K) + K) % K] - v[((i % K) + K) % K]) * e(f) } })();
const M = { th: Math.random() * 6.28, dsgn: 1, tgt: null, sm: null, wt: null, pauseAt: 0, pauseEnd: 0, dPrev: null, va: 0, trail: null, tpts: [], tt: 0, last: null, act: 'idle', dance: 0 };
function applyLook(T, g) { if (!dirty && g.userData._lookK === S.opacity + '|' + S.size + '|' + S.glow) return; dirty = false; g.userData._lookK = S.opacity + '|' + S.size + '|' + S.glow; g.scale.setScalar(S.size);
  g.traverse(o => { const m = o.material; if (!m || o.isSprite) return; if (m.userData.gOp == null) m.userData.gOp = m.opacity; m.transparent = S.opacity < .99 || m.userData.gOp < 1; m.opacity = m.userData.gOp * S.opacity; m.depthWrite = S.opacity > .99; if ('emissiveIntensity' in m) m.emissiveIntensity = S.glow; m.needsUpdate = true }) }
function trail(T, g, on, p, s) { if (!on) { if (M.trail) M.trail.visible = false; return } if (!M.trail) { const N = 90, geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3)); M.trail = new T.Line(geo, new T.LineBasicMaterial({ color: 0xb04cff, transparent: true, opacity: .55, depthWrite: false })); M.trail.frustumCulled = false; M.trail.userData.N = N }
  if (M.trail.parent !== g.parent) g.parent && g.parent.add(M.trail); M.trail.visible = true; if (s - M.tt > .08) { M.tt = s; M.tpts.push([p.x, p.y + .9 * S.size, p.z]); if (M.tpts.length > M.trail.userData.N) M.tpts.shift() }
  const a = M.trail.geometry.attributes.position; for (let i = 0; i < M.trail.userData.N; i++) { const q = M.tpts[Math.min(i, M.tpts.length - 1)] || [p.x, p.y, p.z]; a.setXYZ(i, q[0], q[1], q[2]) } a.needsUpdate = true; M.trail.geometry.setDrawRange(0, Math.max(1, M.tpts.length)) }
/** called each frame from index.html ghostAnim. me = my position (local frame), fwd = my horizontal view direction. Returns true if it moved the ghost. */
export function frame(T, g, t, me, ground, dt, fwd, classic) { const s = t / 1000; dt = Math.min(.1, dt || .016); applyLook(T, g); const p = g.position, st = g.userData.ghost;
  trail(T, g, S.trail, p, s);
  if (S.mode === 'classic') { if (st && st.path) st.path.speed = (S.speedMin + S.speedMax) / 2; classic(); p.y += S.height + (S.height > .05 ? Math.sin(s * 1.6) * .15 : 0); return true }
  const B = st && st.B; if (!fwd || fwd.lengthSq() < 1e-6) fwd = new T.Vector3(0, 0, -1);
  const f = new T.Vector3(fwd.x, 0, fwd.z).normalize(), side = new T.Vector3(-f.z, 0, f.x);
  const dNow = Math.hypot(p.x - me.x, p.z - me.z); if (M.dPrev != null) M.va += ((M.dPrev - dNow) / dt - M.va) * Math.min(1, dt * 2); M.dPrev = dNow;   // >0: you are closing in
  const bold = (S.approach + 1) / 2; let dC = S.distMax + (S.distMin - S.distMax) * bold; const dSpan = (S.distMax - S.distMin) / 2;
  let d = Math.max(S.distMin, Math.min(S.distMax, dC + dSpan * .6 * noise(s * .07)));
  if (M.va > .3) d = S.approach < 0 ? Math.min(S.distMax + 4 * -S.approach, d + 6 * -S.approach) : Math.max(S.distMin, d - 3 * S.approach);
  const v = S.speedMin + (S.speedMax - S.speedMin) * (.5 + .5 * noise(s * .2 + 9));
  // pauses
  if (S.pauseEvery > 0) { if (!M.pauseAt) M.pauseAt = s + S.pauseEvery * (.5 + Math.random()); if (s > M.pauseAt && !M.pauseEnd) { M.pauseEnd = s + S.pauseLen * (.6 + .8 * Math.random()); M.act = Math.random() < .5 ? 'dance' : 'idle'; M.dance = (M.dance + 1) % DANCES.length }
    if (M.pauseEnd && s > M.pauseEnd) { M.pauseEnd = 0; M.pauseAt = s + S.pauseEvery * (.5 + Math.random()) } } else M.pauseEnd = 0;
  let tgt;
  if (S.mode === 'orbit') { if (S.dir === 'random' && Math.random() < dt / 9) M.dsgn *= -1; const sg = S.dir === 'cw' ? -1 : S.dir === 'ccw' ? 1 : M.dsgn; if (!M.pauseEnd) M.th += sg * v / Math.max(.5, d) * dt; tgt = new T.Vector3(me.x + Math.sin(M.th) * d, 0, me.z + Math.cos(M.th) * d) }
  else if (S.mode === 'follow') tgt = new T.Vector3(me.x, 0, me.z).addScaledVector(f, -d).addScaledVector(side, S.jitter * 1.5 * noise(s * .3 + 3));
  else if (S.mode === 'mirror') tgt = new T.Vector3(me.x, 0, me.z).addScaledVector(f, d);
  else { if (!M.wt || Math.hypot(M.wt.x - p.x, M.wt.z - p.z) < .4 || Math.hypot(M.wt.x - me.x, M.wt.z - me.z) > S.distMax * 1.3 + 2 || Math.random() < dt / 25) { const a = Math.random() * 6.283, r = S.distMin + Math.random() * (S.distMax - S.distMin); M.wt = new T.Vector3(me.x + Math.sin(a) * r, 0, me.z + Math.cos(a) * r) } tgt = M.wt.clone() }
  if (S.jitter > 0 && S.mode !== 'wander') tgt.add(new T.Vector3(noise(s * .5 + 1), 0, noise(s * .5 + 5)).multiplyScalar(S.jitter * Math.min(2, d * .3)));
  // follow lag: smooth the target (how fast it reacts to you moving)
  if (!M.sm) M.sm = tgt.clone(); M.sm.lerp(tgt, 1 - Math.exp(-dt / Math.max(.1, S.lag)));
  const dx = M.sm.x - p.x, dz = M.sm.z - p.z, dd = Math.hypot(dx, dz), cap = (S.mode === 'orbit' || S.mode === 'mirror' || S.mode === 'follow' ? Math.max(v, S.speedMax * 1.5) : v) * (M.pauseEnd ? 0 : 1);
  const step = Math.min(dd, cap * dt), moving = step / dt > .08; if (dd > 1e-4 && step > 0) { p.x += dx / dd * step; p.z += dz / dd * step }
  if (dNow > 250) { p.x = me.x + f.x * S.distMin; p.z = me.z + f.z * S.distMin; M.sm = null; M.tpts = [] }   // lost: pop back near you
  p.y = ground + S.height + (S.height > .05 ? Math.sin(s * 1.6) * .15 : 0);
  const yawT = moving && S.mode !== 'mirror' ? Math.atan2(dx, dz) : Math.atan2(me.x - p.x, me.z - p.z); let dy = yawT - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 5);
  if (B) { if (M.pauseEnd && M.act === 'dance') { resetPose(B); DANCES[M.dance](B, s) } else if (moving && step / dt < 4) walkPose(B, st.L, s); else { resetPose(B); B.Spine1.rotation.z = Math.sin(s * 1.3) * .03 } }
  if (st && st.bubT && s > st.bubT) { st.bub.visible = false; st.bubT = 0 }
  return true }
// ---- panel
let panel = null;
const MODES = [['classic', 'Classic (original loop + wander)'], ['orbit', 'Orbit around me'], ['follow', 'Follow behind me'], ['wander', 'Wander near me'], ['mirror', 'Mirror (faces me, in front)']];
function css() { if (document.getElementById('gcCss')) return; const s = document.createElement('style'); s.id = 'gcCss'; s.textContent = `#gc{position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 50px);bottom:calc(env(safe-area-inset-bottom,0px) + 70px);max-width:520px;margin:0 auto;z-index:70;background:#160a28f2;color:#fff;border:1px solid #a45cff;border-radius:12px;font:14px system-ui,sans-serif;display:flex;flex-direction:column}
#gc header{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #a45cff55}#gc header b{flex:1}#gc .sc{overflow:auto;flex:1;padding:6px 10px}#gc button{font:600 14px system-ui;padding:7px 10px;border-radius:8px;border:0;background:#ffc800;color:#000;margin:2px}#gc button.g{background:#444;color:#fff}
#gc label{display:block;margin:7px 0 0}#gc label span{display:flex;justify-content:space-between}#gc input[type=range]{width:100%}#gc small{color:#bba3dd;display:block;font-size:11.5px}#gc h3{font-size:16px}#gc select{font-size:15px;padding:5px;border-radius:6px;background:#0d0618;color:#fff;border:1px solid #a45cff}`; document.head.appendChild(s) }
export function open(standalone) { css(); if (!panel) { panel = document.createElement('div'); panel.id = 'gc'; document.body.appendChild(panel) } panel.style.display = 'flex'; panel.dataset.sa = standalone ? 1 : ''; render() }
export function close() { if (panel) panel.style.display = 'none' }
function render() { const c = S, fx = (k, v) => { const st = CONTROLS.find(x => x[0] === k)[4]; return st < .1 ? (+v).toFixed(2) : st < 1 ? (+v).toFixed(1) : String(v) };
  panel.innerHTML = `<header><b>👻🛸 Ghost & Orb controls</b>${panel.dataset.sa ? '' : '<button class=g id=gcX>Close</button>'}</header><div class=sc>
  <div>${Object.keys(PRESETS).map(n => `<button data-p="${n}">${n}</button>`).join('')}<button class=g id=gcR>Reset to defaults</button></div>
  <label>Mode <select id=gcM>${MODES.map(([k, l]) => `<option value=${k}${c.mode === k ? ' selected' : ''}>${l}</option>`).join('')}</select><small>how the ghost moves relative to you</small></label>
  <label>Direction <select id=gcD>${['ccw', 'cw', 'random'].map(k => `<option value=${k}${c.dir === k ? ' selected' : ''}>${{ ccw: 'counter-clockwise', cw: 'clockwise', random: 'random (switches)' }[k]}</option>`).join('')}</select><small>which way it circles in Orbit mode</small></label>
  <label><input type=checkbox id=gcT${c.trail ? ' checked' : ''}> Trail <small>leaves a glowing purple trail behind it</small></label>
  ${CONTROLS.map(([k, l, mn, mx, stp, h]) => `<label><span>${l}<b id=gcv_${k}>${fx(k, c[k])}</b></span><input type=range data-k=${k} min=${mn} max=${mx} step=${stp} value=${c[k]}><small>${h}</small></label>`).join('')}
  <small style="margin-top:10px">Settings are saved on this device and apply instantly. The ghost exists only on your screen; nothing about it is sent to the server.</small><div id=gcOrb></div></div>`;
  import('./orbctl.js?v=1792453397229').then(M => M.render(panel.querySelector('#gcOrb'))).catch(e => { const o = panel.querySelector('#gcOrb'); if (o) o.textContent = 'Orb controls failed: ' + e.message });
  const q = s => panel.querySelector(s); if (q('#gcX')) q('#gcX').onclick = close;
  panel.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { preset(b.dataset.p); render() }); q('#gcR').onclick = () => { reset(); render() };
  q('#gcM').onchange = e => set({ mode: e.target.value }); q('#gcD').onchange = e => set({ dir: e.target.value }); q('#gcT').onchange = e => set({ trail: e.target.checked });
  panel.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { const k = r.dataset.k; set({ [k]: +r.value }); const v = panel.querySelector('#gcv_' + k); if (v) v.textContent = fx(k, r.value) }) }
window.EEAR_GHOSTCTL = { frame, get, set, reset, preset, open, close, PRESETS, DEFAULTS, CONTROLS };
