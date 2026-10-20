// orbit.js (d46): "flying sound" motion model for the Master DJ music player. Pure math, no three.js: shared by audio.js (HRTF panner) and orbball.js (the glowing orb).
// Frame: ENU offset from the LISTENER (metres): e = east, n = north, u = up from eye level. World-anchored around the player, so turning your head
// moves the sound in your ears like a real object. Smooth value-noise wander (varying speed + direction), ~10-16 m out and 11-14 m up;
// every few minutes a TOUR (fly out, loop Ready Athletics or Cappy's trails, fly back); random LINGER phases (3-15 s: parks in one direction, eases closer, +5 dB) and EXCURSIONS (swoops out to 30-60 m, holds, swoops back).
// Loudness: distance law (25/r)^0.8 clamped to [0.22, 1] (never silent) x linger boost; all values eased (no jumps, no clicks).
// d48 HARD RULE: the orb centre is never closer than ORB.min3dM = 25 m (3D) to the listener/camera, in every phase (wander 25-34 m out + 14-20 m up, lingers stop at 25 m and
// get louder instead (+5 dB, gainRef 25 m so 25 m = full level), swoops, tour fly-out/back/overhead passes). Final step: radial push-out onto the 25 m sphere (continuous, no jumps).
export const ORB = { image: 'orb-matt.jpg' /* Project Driftwood poster (unmodified JPEG): under the orb + each player's spawn copy */, imageH: 7, spawnH: 1.8, spawnM: [6, 10], diameterM: 10, min3dM: 25, minR: 22, wanderR: [25, 34], heightM: [14, 20], excursionR: [30, 60],
  linger: { everyS: [14, 40], lastS: [3, 15], boostDb: 5 }, excursion: { everyS: [35, 80], outS: [4, 6], holdS: [2, 4], backS: [3, 5] }, gainRef: 25, gainExp: .8, gainFloor: .22,
  // TOUR (d46c): every few minutes the source flies out from the player, loops a real trail (trails.json: OSM paths), then flies back. Alternates Ready Athletics / Cappy's trails.
  tour: { everyS: [150, 240], firstS: [75, 120], sites: [['ra', "Ready Athletics trail"], ['cappy', "Cappy's trails"]], maxKm: 6, flySpd: 90, flyS: [6, 28], loopSpd: 28, loopS: [14, 45], hAbove: 18, arc: .18, arcMax: 160 } };
const rnd = (a, b) => a + Math.random() * (b - a), ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function noise1() { const K = 64, v = Array.from({ length: K }, () => Math.random() * 2 - 1); return x => { const i = Math.floor(x), f = x - i, a = v[((i % K) + K) % K], b = v[(((i + 1) % K) + K) % K]; return a + (b - a) * ease(f) } }
const fbm = (n, x) => .65 * n(x) + .35 * n(x * 2.3 + 17);
const nSpd = noise1(), nDir = noise1(), nEl = noise1(), nR = noise1();
const S = { t: 0, az: Math.random() * 6.283, azv: 0, r: 28, u: 16, mode: 'wander', mt: 0, mdur: 0, nextL: rnd(8, 20), nextX: rnd(30, 60), xr: 45, linger: 0, boost: 1, gain: .8, e: 0, n: 13, lingers: 0, excursions: 0, tours: 0, tourSkips: 0, tourSite: '', tourW: 0, nextT: rnd(...ORB.tour.firstS), flying: true };
export const state = S;
// d49 ORB CONTROLS (orbctl.js?v=1792455290575 UI; localStorage.eearOrbCfg; GM 'Apply to everyone' -> server DJ state .orb, followed unless the device opts out).
// mode: auto | manual (joystick: window.EEAR_ORBSTEER {x:east,y:north,h:up} -1..1, local only) | goto ({lat,lon,id}: smooth arc there, linger, then Auto unless hold) | tour (start one now)
// tour: alt | ra | cappy | off · radius m (wander centre, hard min 25 m stays) · lingerF x (0 = never) · speed x
export const ORB_DEFAULTS = { mode: 'auto', tour: 'alt', radius: 30, lingerF: 1, speed: 1, hold: false, goto: null, tourReq: 0, follow: true };
const OK = 'eearOrbCfg'; let LC = (() => { try { return { ...ORB_DEFAULTS, ...JSON.parse(localStorage[OK] || '{}') } } catch (e) { return { ...ORB_DEFAULTS } } })();
addEventListener('storage', e => { if (e.key === OK) try { LC = { ...ORB_DEFAULTS, ...JSON.parse(e.newValue || '{}') } } catch (x) { } });
export function orbCfgLocal() { return { ...LC } }
export function setOrbCfg(p) { LC = { ...LC, ...p }; LC.radius = Math.max(25, Math.min(150, +LC.radius || 30)); LC.lingerF = Math.max(0, Math.min(3, +LC.lingerF)); LC.speed = Math.max(.2, Math.min(3, +LC.speed || 1)); try { localStorage[OK] = JSON.stringify(LC) } catch (e) { } return orbCfg() }
const shared = () => { const st = window.EEAR_DJ && EEAR_DJ.state; return st && st.orb && st.orb.cfg || null };
/** effective settings: Matt's shared (GM) settings when following, except a local Manual session always wins */
export function orbCfg() { const sh = LC.follow !== false ? shared() : null; const c = sh ? { ...LC, ...sh, follow: true, shared: true } : { ...LC, shared: false }; if (LC.mode === 'manual') c.mode = 'manual'; return c }
const M2 = 111320;
/** orb lat/lon (from the listener + ENU offset), with a short 5 Hz trail */
export function orbLatLon() { const L = listener(); if (!L) return null; return { lat: L.lat + S.n / M2, lon: L.lon + S.e / (M2 * Math.cos(L.lat * Math.PI / 180)), u: S.u, dist: S.dist, mode: S.mode, site: S.tourSite || (S.gp ? 'spot' : '') } }
S.trail = []; let trT = 0;
const tau = (cur, tgt, dt, k) => cur + (tgt - cur) * (1 - Math.exp(-dt / k));
// ---- tour paths (lat/lon polylines, chained nearest-neighbour, closed back to the start)
let TRAILS = null; fetch('trails.json?v=1792455290575').then(r => r.json()).then(j => TRAILS = j).catch(() => { });
const M = 111320, enu = (la0, lo0, la, lo) => [(lo - lo0) * M * Math.cos(la0 * Math.PI / 180), (la - la0) * M];
function sitePath(key) { const W = (TRAILS && TRAILS[key] || []).map(w => w.pts.slice()); if (!W.length) return null; const out = W.shift();
  while (W.length) { const [la, lo] = out[out.length - 1]; let bi = 0, bd = 1e18, rev = false;
    W.forEach((w, i) => { for (const [p, r] of [[w[0], false], [w[w.length - 1], true]]) { const d = (p[0] - la) ** 2 + (p[1] - lo) ** 2; if (d < bd) { bd = d; bi = i; rev = r } } });
    const w = W.splice(bi, 1)[0]; out.push(...(rev ? w.reverse() : w)) }
  out.push(out[0]); return out }
function pathAt(P, cum, s) { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const f = Math.max(0, Math.min(1, (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]))); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f] }
const listener = () => { const L = window.EEAR_AUDIO && window.EEAR_AUDIO.listener; return L && isFinite(L.lat) && isFinite(L.lon) ? L : null };
function tourStart() { const T = ORB.tour, L = listener(); if (!L || !TRAILS) return false;
  const pick = orbCfg().tour, sites = pick === 'ra' || pick === 'cappy' ? T.sites.filter(x => x[0] === pick) : T.sites;
  for (let k = 0; k < sites.length; k++) { const [key, name] = sites[(S.tours + S.tourSkips + k) % sites.length], P = sitePath(key); if (!P) continue;
    const cum = [0]; for (let i = 1; i < P.length; i++) { const [a, b] = enu(P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]); cum.push(cum[i - 1] + Math.hypot(a, b)) }
    const [e0, n0] = enu(L.lat, L.lon, P[0][0], P[0][1]), dist = Math.hypot(e0, n0); if (dist > T.maxKm * 1000) { S.tourSkips++; continue }
    const len = cum[cum.length - 1], loopS = Math.min(T.loopS[1], Math.max(T.loopS[0], len / T.loopSpd));
    const sp = orbCfg().speed || 1; S.tourP = { P, cum, len, name, key, outS: Math.min(T.flyS[1], Math.max(T.flyS[0], dist / T.flySpd)) / sp, loopS: loopS / sp, backS: 0 }; S.tourSite = name; S.mode = 'tourOut'; S.mt = 0; S.tours++; return true }
  return false }
/** advance the orbit by dt seconds; returns S {e,n,u,r,gain,linger 0..1,mode} */
export function step(dt) {
  dt = Math.min(.1, Math.max(0, dt || 0)); S.t += dt; S.mt += dt; const t = S.t;
  const C = orbCfg(), sp = C.speed || 1, lf = C.lingerF;
  // d49 controls: manual / go-to / tour-now / tour off
  if (C.mode === 'manual') return manualStep(dt, C);
  if (S.mode === 'manual') { S.mode = 'wander'; S.mt = 0; S.az = Math.atan2(S.e, S.n); S.r = Math.hypot(S.e, S.n); S.uo = S.u }
  if (C.mode === 'goto' && C.goto && C.goto.id !== S.gotoId) { S.gotoId = C.goto.id; const L = listener(); if (L) { const [ge, gn] = enu(L.lat, L.lon, C.goto.lat, C.goto.lon), dd = Math.hypot(ge, gn);
      if (S.mode.startsWith('tour')) { S.tourP = null; S.tourSite = '' } S.gp = { ll: [C.goto.lat, C.goto.lon], outS: Math.min(30, Math.max(4, dd / (ORB.tour.flySpd * sp))), holdS: 15 }; S.mode = 'goOut'; S.mt = 0 } }
  if (S.gp && (C.mode !== 'goto' || !C.goto)) { if (S.mode === 'goOut' || S.mode === 'goHold') { S.mode = 'goBack'; S.mt = 0 } }
  if (C.mode === 'tour' && C.tourReq && C.tourReq !== S.tourReq && !S.mode.startsWith('tour') && !S.gp) { S.tourReq = C.tourReq; S.mode = 'wander'; S.mt = 9; tourStart() }
  if (S.mode === 'goOut' && S.mt >= S.gp.outS) { S.mode = 'goHold'; S.mt = 0 }
  else if (S.mode === 'goHold' && !C.hold && S.mt >= S.gp.holdS) { S.mode = 'goBack'; S.mt = 0 }
  else if (S.mode === 'goBack' && S.mt >= (S.gp.outS || 4)) { S.mode = 'wander'; S.mt = 0; S.gp = null; S.nextL = Math.max(S.nextL, 8) }
  if (C.tour === 'off' || (window.EEAR && EEAR.LAY && EEAR.LAY.orbTours === 0) || (window.QL && QL.orbTours === 0)) S.nextT = Math.max(S.nextT, 5);   // tours off (setting, or the room/Layers 'Orb trail tours')
  if (!(lf > 0)) S.nextL = Math.max(S.nextL, 5); else if (S.mode === 'wander' && S._lf !== lf) { S.nextL = Math.min(S.nextL, ORB.linger.everyS[1] / lf) } S._lf = lf;
  // phase machine
  if (!S.mode.startsWith('tour') && !S.mode.startsWith('go')) S.nextT -= dt;
  if (S.mode === 'wander') { S.nextL -= dt; S.nextX -= dt;
    if (S.nextT <= 0 && S.mt > 3) { if (!tourStart()) S.nextT = 30 }
    if (S.mode !== 'wander') { }
    else if (S.nextX <= 0) { S.mode = 'out'; S.mt = 0; S.xr = rnd(...ORB.excursionR); S.mdur = rnd(...ORB.excursion.outS); S.excursions++ }
    else if (S.nextL <= 0) { S.mode = 'linger'; S.mt = 0; S.mdur = rnd(...ORB.linger.lastS); S.lingers++ } }
  else if (S.mode === 'linger' && S.mt >= S.mdur) { S.mode = 'wander'; S.mt = 0; S.nextL = lf > 0 ? rnd(...ORB.linger.everyS) / lf : 1e9; S.nextX = Math.max(S.nextX, 6) }
  else if (S.mode === 'out' && S.mt >= S.mdur) { S.mode = 'hold'; S.mt = 0; S.mdur = rnd(...ORB.excursion.holdS) }
  else if (S.mode === 'hold' && S.mt >= S.mdur) { S.mode = 'back'; S.mt = 0; S.mdur = rnd(...ORB.excursion.backS) }
  else if (S.mode === 'back' && S.mt >= S.mdur) { S.mode = 'wander'; S.mt = 0; S.nextX = rnd(...ORB.excursion.everyS); S.nextL = Math.max(S.nextL, 5) }
  else if (S.mode === 'tourOut' && S.mt >= S.tourP.outS) { S.mode = 'tourLoop'; S.mt = 0 }
  else if (S.mode === 'tourLoop' && S.mt >= S.tourP.loopS) { S.mode = 'tourBack'; S.mt = 0; S.tourP.backS = S.tourP.outS }
  else if (S.mode === 'tourBack' && S.mt >= S.tourP.backS) { S.mode = 'wander'; S.mt = 0; S.tourSite = ''; S.tourP = null; S.nextT = rnd(...ORB.tour.everyS); S.nextL = Math.max(S.nextL, 8); S.nextX = Math.max(S.nextX, 25) }
  // targets
  const R0 = Math.max(ORB.min3dM, (C.radius || 30) - 4.5), R1 = (C.radius || 30) + 4.5, wr = R0 + (R1 - R0) * (.5 + .5 * fbm(nR, t * .07));
  let rT = wr, azvT = (fbm(nDir, t * .045) > 0 ? 1 : -1) * (.12 + .75 * Math.abs(fbm(nSpd, t * .09))) * sp;   // rad/s, sign flips smoothly through the easing below
  const lt = S.mode === 'linger' ? ease(Math.min(S.mt / 1.5, (S.mdur - S.mt) / 1.5, 1)) : 0;          // 0..1 eased in/out
  S.linger = lt; if (lt) { azvT *= 1 - lt; rT = wr + (ORB.minR - wr) * lt }
  if (S.mode === 'out') rT = wr + (S.xr - wr) * ease(S.mt / S.mdur); else if (S.mode === 'hold') rT = S.xr; else if (S.mode === 'back') rT = S.xr + (wr - S.xr) * ease(S.mt / S.mdur);
  S.azv = tau(S.azv, azvT * Math.min(1, 16 / Math.max(S.r, 1)), dt, .9);   // angular speed eases; slower when far (sane linear speed)
  S.az += S.azv * dt; S.r = tau(S.r, Math.max(ORB.minR, rT), dt, S.mode === 'wander' ? 1.2 : .35);
  const uT = ORB.heightM[0] + (ORB.heightM[1] - ORB.heightM[0]) * (.5 + .5 * fbm(nEl, t * .11)) + (S.mode === 'hold' ? 4 : 0); S.uo = tau(S.uo == null ? S.u : S.uo, uT, dt, .8);
  S.e = S.r * Math.sin(S.az); S.n = S.r * Math.cos(S.az);
  // tour blend: the orbit keeps running underneath; w eases 0->1 (fly out), stays 1 on the loop, 1->0 (fly back). Mid-flight arcs up.
  let ue = S.uo, w = 0; const TP = S.tourP, L = (TP || S.gp) && listener();
  if (S.gp && L) { const G = S.gp, T = ORB.tour; w = S.mode === 'goOut' ? ease(S.mt / G.outS) : S.mode === 'goHold' ? 1 : 1 - ease(S.mt / (G.outS || 4));
    const [te, tn] = enu(L.lat, L.lon, G.ll[0], G.ll[1]), arc = Math.min(T.arcMax, Math.hypot(te, tn) * T.arc) * Math.sin(Math.PI * w) * (S.mode === 'goHold' ? 0 : 1), bob = S.mode === 'goHold' ? 1.5 * Math.sin(S.mt * .8) : 0;
    S.tw = tau(S.tw || 0, w, dt, .15); w = S.tw; S.e = S.e + (te - S.e) * w; S.n = S.n + (tn - S.n) * w; ue = S.uo + (T.hAbove + bob - S.uo) * w + arc }
  else if (TP && L) { const T = ORB.tour; let ll;
    if (S.mode === 'tourOut') { w = ease(S.mt / TP.outS); ll = TP.P[0] } else if (S.mode === 'tourLoop') { w = 1; ll = pathAt(TP.P, TP.cum, TP.len * Math.min(1, S.mt / TP.loopS)) } else { w = 1 - ease(S.mt / TP.backS); ll = TP.P[0] }
    const [te, tn] = enu(L.lat, L.lon, ll[0], ll[1]), arc = Math.min(T.arcMax, Math.hypot(te, tn) * T.arc) * Math.sin(Math.PI * w) * (S.mode === 'tourLoop' ? 0 : 1);
    const tu = T.hAbove;
    S.tw = tau(S.tw || 0, w, dt, .15); w = S.tw; S.e = S.e + (te - S.e) * w; S.n = S.n + (tn - S.n) * w; ue = S.uo + (tu - S.uo) * w + arc }
  else S.tw = 0;
  S.tourW = w; S.u = ue;
  { const d0 = Math.hypot(S.e, S.n, S.u), m = ORB.min3dM; S.pushed = d0 < m; if (d0 < m) { if (d0 < 1e-3) { S.e = 0; S.n = 0; S.u = m } else { const k = m / d0; S.e *= k; S.n *= k; S.u *= k } } ue = S.u }   // d48: 25 m keep-out (3D)
  const d = Math.hypot(S.e, S.n, ue), g = Math.max(ORB.gainFloor, Math.min(1, Math.pow(ORB.gainRef / Math.max(d, 1), ORB.gainExp)));
  S.boost = tau(S.boost, Math.pow(10, ORB.linger.boostDb * lt / 20), dt, .25); S.gain = g * S.boost; S.dist = d; return S;
}
function manualStep(dt, C) { S.mode = 'manual'; const st = window.EEAR_ORBSTEER || { x: 0, y: 0, h: 0 }, v = 12 * (C.speed || 1);
  S.mv = S.mv || { e: 0, n: 0, u: 0 }; S.mv.e = tau(S.mv.e, (+st.x || 0) * v, dt, .35); S.mv.n = tau(S.mv.n, (+st.y || 0) * v, dt, .35); S.mv.u = tau(S.mv.u, (+st.h || 0) * v * .6, dt, .35);
  S.e += S.mv.e * dt; S.n += S.mv.n * dt; S.u = Math.max(3, Math.min(400, S.u + S.mv.u * dt)); const h = Math.hypot(S.e, S.n); if (h > 3000) { S.e *= 3000 / h; S.n *= 3000 / h }
  S.tourP = null; S.tourSite = ''; S.gp = null; S.tw = 0; S.tourW = 0; S.linger = 0;
  { const d0 = Math.hypot(S.e, S.n, S.u), m = ORB.min3dM; S.pushed = d0 < m; if (d0 < m) { if (d0 < 1e-3) { S.e = 0; S.n = 0; S.u = m } else { const k = m / d0; S.e *= k; S.n *= k; S.u *= k } } }
  const d = Math.hypot(S.e, S.n, S.u), g = Math.max(ORB.gainFloor, Math.min(1, Math.pow(ORB.gainRef / Math.max(d, 1), ORB.gainExp))); S.boost = tau(S.boost, 1, dt, .25); S.gain = g * S.boost; S.dist = d; return S }
let lastT = 0;
/** step once per animation frame no matter how many callers (audio.js?v=1792455290575 + orbball.js) */
export function frame(nowMs = performance.now()) { if (nowMs - lastT < 4) return S; let dt = lastT ? Math.min(2, (nowMs - lastT) / 1000) : 0; lastT = nowMs;   /* wall-clock: sub-step slow frames so the orbit never slows down */
  while (dt > .1) { step(.05); dt -= .05 } const r = step(dt); if (nowMs - trT > 200) { trT = nowMs; const p = orbLatLon(); if (p) { S.trail.push([p.lat, p.lon]); if (S.trail.length > 15) S.trail.shift() } } return r }
window.EEAR_ORB = S; window.EEAR_ORBAPI = { orbCfg, orbCfgLocal, setOrbCfg, orbLatLon, ORB_DEFAULTS, state: S };
