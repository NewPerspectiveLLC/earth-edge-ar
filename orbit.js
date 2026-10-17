// orbit.js (d46): "flying sound" motion model for the Master DJ music player. Pure math, no three.js: shared by audio.js (HRTF panner) and orbball.js (the glowing orb).
// Frame: ENU offset from the LISTENER (metres): e = east, n = north, u = up from eye level. World-anchored around the player, so turning your head
// moves the sound in your ears like a real object. Smooth value-noise wander (varying speed + direction), ~10-16 m out and 11-14 m up;
// random LINGER phases (3-15 s: parks in one direction, eases closer, +5 dB) and EXCURSIONS (swoops out to 30-60 m, holds, swoops back).
// Loudness: distance law (12/r)^0.8 clamped to [0.22, 1] (never silent) x linger boost; all values eased (no jumps, no clicks).
export const ORB = { image: 'orb-matt.jpg' /* Project Driftwood poster (unmodified JPEG): under the orb + each player's spawn copy */, imageH: 7, spawnH: 1.8, spawnM: [6, 10], diameterM: 10, minR: 10, wanderR: [10, 16], heightM: [11, 14], excursionR: [30, 60],
  linger: { everyS: [14, 40], lastS: [3, 15], boostDb: 5 }, excursion: { everyS: [35, 80], outS: [4, 6], holdS: [2, 4], backS: [3, 5] }, gainRef: 12, gainExp: .8, gainFloor: .22 };
const rnd = (a, b) => a + Math.random() * (b - a), ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function noise1() { const K = 64, v = Array.from({ length: K }, () => Math.random() * 2 - 1); return x => { const i = Math.floor(x), f = x - i, a = v[((i % K) + K) % K], b = v[(((i + 1) % K) + K) % K]; return a + (b - a) * ease(f) } }
const fbm = (n, x) => .65 * n(x) + .35 * n(x * 2.3 + 17);
const nSpd = noise1(), nDir = noise1(), nEl = noise1(), nR = noise1();
const S = { t: 0, az: Math.random() * 6.283, azv: 0, r: 13, u: 12, mode: 'wander', mt: 0, mdur: 0, nextL: rnd(8, 20), nextX: rnd(30, 60), xr: 45, linger: 0, boost: 1, gain: .8, e: 0, n: 13, lingers: 0, excursions: 0, flying: true };
export const state = S;
const tau = (cur, tgt, dt, k) => cur + (tgt - cur) * (1 - Math.exp(-dt / k));
/** advance the orbit by dt seconds; returns S {e,n,u,r,gain,linger 0..1,mode} */
export function step(dt) {
  dt = Math.min(.1, Math.max(0, dt || 0)); S.t += dt; S.mt += dt; const t = S.t;
  // phase machine
  if (S.mode === 'wander') { S.nextL -= dt; S.nextX -= dt;
    if (S.nextX <= 0) { S.mode = 'out'; S.mt = 0; S.xr = rnd(...ORB.excursionR); S.mdur = rnd(...ORB.excursion.outS); S.excursions++ }
    else if (S.nextL <= 0) { S.mode = 'linger'; S.mt = 0; S.mdur = rnd(...ORB.linger.lastS); S.lingers++ } }
  else if (S.mode === 'linger' && S.mt >= S.mdur) { S.mode = 'wander'; S.mt = 0; S.nextL = rnd(...ORB.linger.everyS); S.nextX = Math.max(S.nextX, 6) }
  else if (S.mode === 'out' && S.mt >= S.mdur) { S.mode = 'hold'; S.mt = 0; S.mdur = rnd(...ORB.excursion.holdS) }
  else if (S.mode === 'hold' && S.mt >= S.mdur) { S.mode = 'back'; S.mt = 0; S.mdur = rnd(...ORB.excursion.backS) }
  else if (S.mode === 'back' && S.mt >= S.mdur) { S.mode = 'wander'; S.mt = 0; S.nextX = rnd(...ORB.excursion.everyS); S.nextL = Math.max(S.nextL, 5) }
  // targets
  const wr = ORB.wanderR[0] + (ORB.wanderR[1] - ORB.wanderR[0]) * (.5 + .5 * fbm(nR, t * .07));
  let rT = wr, azvT = (fbm(nDir, t * .045) > 0 ? 1 : -1) * (.12 + .75 * Math.abs(fbm(nSpd, t * .09)));   // rad/s, sign flips smoothly through the easing below
  const lt = S.mode === 'linger' ? ease(Math.min(S.mt / 1.5, (S.mdur - S.mt) / 1.5, 1)) : 0;          // 0..1 eased in/out
  S.linger = lt; if (lt) { azvT *= 1 - lt; rT = wr + (ORB.minR - wr) * lt }
  if (S.mode === 'out') rT = wr + (S.xr - wr) * ease(S.mt / S.mdur); else if (S.mode === 'hold') rT = S.xr; else if (S.mode === 'back') rT = S.xr + (wr - S.xr) * ease(S.mt / S.mdur);
  S.azv = tau(S.azv, azvT * Math.min(1, 16 / Math.max(S.r, 1)), dt, .9);   // angular speed eases; slower when far (sane linear speed)
  S.az += S.azv * dt; S.r = tau(S.r, Math.max(ORB.minR, rT), dt, S.mode === 'wander' ? 1.2 : .35);
  const uT = ORB.heightM[0] + (ORB.heightM[1] - ORB.heightM[0]) * (.5 + .5 * fbm(nEl, t * .11)) + (S.mode === 'hold' ? 4 : 0); S.u = tau(S.u, uT, dt, .8);
  S.e = S.r * Math.sin(S.az); S.n = S.r * Math.cos(S.az);
  const d = Math.hypot(S.r, S.u), g = Math.max(ORB.gainFloor, Math.min(1, Math.pow(ORB.gainRef / Math.max(d, 1), ORB.gainExp)));
  S.boost = tau(S.boost, Math.pow(10, ORB.linger.boostDb * lt / 20), dt, .25); S.gain = g * S.boost; S.dist = d; return S;
}
let lastT = 0;
/** step once per animation frame no matter how many callers (audio.js?v=1792279505907 + orbball.js) */
export function frame(nowMs = performance.now()) { if (nowMs - lastT < 4) return S; let dt = lastT ? Math.min(2, (nowMs - lastT) / 1000) : 0; lastT = nowMs;   /* wall-clock: sub-step slow frames so the orbit never slows down */
  while (dt > .1) { step(.05); dt -= .05 } return step(dt) }
window.EEAR_ORB = S;
