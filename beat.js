// Shared music clock + beat tracker + per-key saved choreography for Ren and the singer bots (one analyser, one beat grid).
// Clock: window.EEAR_AUDIO.ctx.currentTime (audio clock). Beats: low-band (<160 Hz) spectral-flux onsets, PLL-locked grid,
// tempo from TRACK_META / EEAR_AUDIO.bpm / inter-onset histogram. Vocal band 300 Hz - 3 kHz with AGC (for lip-sync/gestures).
// Choreography: improvised + recorded once per key, saved via POST <API>/api/ren/dance {trackId:key, choreo}, fetched via GET,
// cached in localStorage. Keys: trackId (Ren) or trackId + KEY_SEP + singerId (singers).
export const TRACK_META = {
  vortex: { bpm: 124, beatOffset: 0, loopBars: 4, bars: 16 },   // built-in procedural loop (4-bar cycle)
  disco:  { bpm: 120, beatOffset: 0, loopBars: 32, bars: 32 },  // disco-jam-loop: 120 BPM, 32 bars = 64.000 s
};
TRACK_META['happys-trails-vortex'] = TRACK_META.vortex; TRACK_META['disco-jam'] = TRACK_META.disco;   // EEAR_AUDIO track ids
export const KEY_SEP = '--';          // server trackId regex is [A-Za-z0-9_.-]{1,64}; '::' would be rejected (see report)
const TUNNEL = 'https://verse-concerning-summit-equipped.trycloudflare.com';
export function apiBase() { if (window.EEAR_API) return window.EEAR_API; return location.hostname.endsWith('github.io') ? TUNNEL : ''; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;

const E = { an: null, anCtx: null, fbuf: null, tbuf: null, prevE: 0, fm: 0, fv: .0005, lastOn: -1, onsets: [], t0: 0, bpm: 120, meta: null, key: null,
  awaitStart: false, startDeadline: 0, energy: 0, voc: 0, vocS: 0, vocMax: .05, gen: 0, stamp: -1, st: { on: false }, barIdx: -1, barAcc: 0, barN: 0, barHist: [], drop: false };
let override = null;
/** test hook: fn() -> {on, track, t, bpm?, startedAt?, energy?, vocal?} replaces the audio clock */
export function setClockOverride(fn) { override = fn; E.key = null; }
export function analyser() { return E.an; }
export function trackIdOf(A) { const t = String(A.track || ''); if (t === 'user') return 'user';
  return t.split('?')[0].replace(/^.*\//, '').replace(/\.(m4a|mp3|ogg|wav|aac)$/i, '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 40) || 'track'; }
function tap(A) {
  if (!A.pan || (E.an && E.anCtx === A.ctx)) return;
  try { const ctx = A.ctx, an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0; A.pan.connect(an); const z = ctx.createGain(); z.gain.value = 0; an.connect(z); z.connect(ctx.destination);
    E.an = an; E.anCtx = ctx; E.fbuf = new Uint8Array(an.frequencyBinCount); E.tbuf = new Uint8Array(an.fftSize); } catch (e) { }
}
function estimateTempo() {
  const O = E.onsets; if (O.length < 16) return; const H = new Float32Array(181);
  for (let i = 0; i < O.length; i++) for (let j = i + 1; j < O.length && O[j] - O[i] < 2.1; j++) { let b = 60 / (O[j] - O[i]); while (b < 90) b *= 2; while (b > 180) b /= 2; for (let k = -2; k <= 2; k++) { const q = Math.round(b) + k; if (q >= 90 && q <= 180) H[q] += Math.exp(-k * k / 2); } }
  let best = 120, bv = 0; for (let q = 90; q <= 180; q++) if (H[q] > bv) { bv = H[q]; best = q; } E.bpm = lerp(E.bpm, best, .3);
}
function analyse(t, src, dt) {
  let rms = 0, low = 0, voc = 0;
  if (src.energy !== undefined) { rms = src.energy; voc = src.vocal || 0; }
  else if (E.an) {
    E.an.getByteFrequencyData(E.fbuf); const hz = E.anCtx.sampleRate / E.an.fftSize, top = Math.max(2, Math.round(160 / hz)), b0 = Math.round(300 / hz), b1 = Math.round(3000 / hz);
    for (let i = 1; i <= top; i++) low += E.fbuf[i]; low /= top * 255; for (let i = b0; i <= b1; i += 2) voc += E.fbuf[i]; voc /= ((b1 - b0) / 2 + 1) * 255;
    E.an.getByteTimeDomainData(E.tbuf); for (let i = 0; i < E.tbuf.length; i += 8) { const x = (E.tbuf[i] - 128) / 128; rms += x * x; } rms = Math.sqrt(rms / (E.tbuf.length / 8));
    const flux = Math.max(0, low - E.prevE); E.prevE = low; E.fm = lerp(E.fm, flux, .02); E.fv = lerp(E.fv, (flux - E.fm) ** 2, .02);
    if (flux > E.fm + 1.6 * Math.sqrt(E.fv) && low > .12 && t - E.lastOn > .22) {
      E.lastOn = t; E.onsets.push(t); while (E.onsets.length && t - E.onsets[0] > 12) E.onsets.shift();
      if (E.awaitStart) { E.t0 = t - (E.meta ? E.meta.beatOffset : 0); E.awaitStart = false; }       // first hit after (re)start = bar 0 downbeat
      else { const L = 60 / E.bpm, ph = (t - E.t0) / L, err = ph - Math.round(ph); if (Math.abs(err) < .3) E.t0 += err * L * .18; } // PLL
      if (!E.meta && !src.bpm) estimateTempo();
    }
    if (E.awaitStart && t > E.startDeadline) E.awaitStart = false;
  }
  E.energy = lerp(E.energy, rms, .05);
  E.vocMax = Math.max(E.vocMax * (1 - dt * .1), voc, .05); const v = clamp((voc / E.vocMax - .35) / .65, 0, 1);
  E.voc = lerp(E.voc, v, 1 - Math.exp(-dt * 18)); E.vocS = lerp(E.vocS, v, 1 - Math.exp(-dt * 1.5));
}
/** tick(): call freely every frame (cached per frame). Returns {on,key,t,beat,bpm,meta,energy,vocal,vocS,drop,gen} */
export function tick() {
  const now = performance.now(); if (now - E.stamp < 3) return E.st; const dt = clamp((now - E.stamp) / 1000, 0, .1); E.stamp = now;
  let src;
  if (override) src = override();
  else { const A = window.EEAR_AUDIO; const on = !!(A && A.on && A.ctx && A.ctx.state === 'running'); src = on ? { on, track: trackIdOf(A), t: A.ctx.currentTime, bpm: A.bpm, startedAt: A.startedAt, A } : { on: false }; }
  if (!src.on) { E.key = null; return E.st = { on: false }; }
  if (src.A) tap(src.A);
  const t = src.t;
  if (src.track !== E.key) {
    E.key = src.track; E.meta = TRACK_META[src.track] || null; E.bpm = src.bpm || (E.meta ? E.meta.bpm : 120); E.gen++;
    if (typeof src.startedAt === 'number') { E.t0 = src.startedAt + (E.meta ? E.meta.beatOffset : 0); E.awaitStart = false; }
    else { E.t0 = t + .06; E.awaitStart = true; E.startDeadline = t + 4; }
    E.onsets.length = 0; E.barHist.length = 0; E.barIdx = -1; E.drop = false;
  }
  if (src.bpm) E.bpm = src.bpm;
  analyse(t, src, dt);
  const beat = (t - E.t0) / (60 / E.bpm), bar = Math.floor(beat / 4);
  // drop detection: last bar's mean energy vs the 4 bars before it
  if (bar !== E.barIdx) { if (E.barN) { E.barHist.push(E.barAcc / E.barN); if (E.barHist.length > 6) E.barHist.shift(); }
    const H = E.barHist, n = H.length; E.drop = n >= 3 && H[n - 1] > 1.3 * (H.slice(0, -1).reduce((a, b) => a + b, 0) / (n - 1)); E.barIdx = bar; E.barAcc = 0; E.barN = 0; }
  E.barAcc += E.energy; E.barN++;
  return E.st = { on: true, key: E.key, t, beat, bpm: E.bpm, meta: E.meta, energy: E.energy, vocal: E.voc, vocS: E.vocS, drop: E.drop, gen: E.gen };
}

// ---------------------------------------------------------------- choreography store
const LS = id => 'renDance:' + id, STORES = new Map();
export function validChoreo(c) { return c && c.v === 1 && Array.isArray(c.moves) && c.moves.length >= 1 && c.moves.length <= 128 && c.bpm > 40 && c.bpm < 240; }
/**
 * choreo(key, {bars, improvise(bar, rec, st) -> {m, w}, localOnly}) -> store
 *  store.get(barAbs, st) -> {m, w} (records on first play, replays after), store.peek(barAbs) -> {m,w}|null, store.mode, store.data
 */
export function choreo(key, opts) {
  let S = STORES.get(key); if (S && S.gen === E.gen) return S;
  S = { key, gen: E.gen, opts, data: null, rec: null, mode: 'loading', forced: false,
    get(barAbs, st) { const C = this.data || this.rec; if (!C) return null; const n = C.bars, b = ((barAbs % n) + n) % n;
      if (!this.data && this.rec && !this.rec.locked && this.rec.moves[b] === undefined) { const r = this.opts.improvise(b, this.rec, st || E.st); if (this.rec.moves[b] === undefined) { this.rec.moves[b] = r.m; this.rec.wander[b] = r.w; } this.check(); }
      const m = C.moves[b]; return m === undefined ? null : { m, w: C.wander[b] || [0, 0], bar: b }; },
    peek(barAbs) { const C = this.data || this.rec; if (!C) return null; const n = C.bars, b = ((barAbs % n) + n) % n; const m = C.moves[b]; return m === undefined ? null : { m, w: C.wander[b] || [0, 0], bar: b }; },
    check() { const R = this.rec; let k = 0; for (let i = 0; i < R.bars; i++) if (R.moves[i] !== undefined) k++; if (k >= R.bars) finish(this); },
    setData(c) { this.data = c; this.rec = null; this.mode = 'replay'; this.forced = true; } };
  STORES.set(key, S); load(S); return S;
}
function startRec(S) { const bars = S.opts.bars || (E.meta ? E.meta.bars : 32); S.rec = { bars, moves: new Array(bars), wander: new Array(bars), locked: false, ctx: {} }; S.mode = 'record'; }
async function load(S) {
  const id = S.key; let local = null; try { local = JSON.parse(localStorage[LS(id)] || 'null'); } catch (e) { }
  if (validChoreo(local)) { S.data = local; S.mode = 'replay'; }
  if (S.opts.localOnly || override && !S.opts.useServerInTest) { if (!S.data) startRec(S); return; }
  try { const r = await fetch(apiBase() + '/api/ren/dance?trackId=' + encodeURIComponent(id), { cache: 'no-store' });
    if (S.forced) return;
    if (r.ok) { const d = await r.json(); if (validChoreo(d.choreo)) { S.data = d.choreo; S.rec = null; S.mode = 'replay'; localStorage[LS(id)] = JSON.stringify(d.choreo); return; } }
    if (r.status === 404 && local && local._unsent) { post(S, local); return; }
  } catch (e) { }
  if (!S.data && !S.rec) startRec(S);
}
function finish(S) {
  const R = S.rec; R.locked = true;
  const c = { v: 1, trackId: S.key, bpm: Math.round(E.bpm * 100) / 100, beatOffset: E.meta ? E.meta.beatOffset : 0, beatsPerBar: 4, bars: R.bars, loopBars: E.meta ? E.meta.loopBars : R.bars,
    moves: R.moves, wander: R.wander, created: new Date().toISOString(), by: 'beat.js/2' };
  S.data = c; S.rec = null; S.mode = 'replay';
  try { localStorage[LS(S.key)] = JSON.stringify({ ...c, _unsent: !S.opts.localOnly }); } catch (e) { }
  if (!S.opts.localOnly) post(S, c);
  if (S.opts.onSaved) S.opts.onSaved(c);
}
async function post(S, c) {
  const { _unsent, ...clean } = c;
  if (override && !S.opts.useServerInTest) { window.__lastChoreoPost = { trackId: S.key, choreo: clean }; return; }
  try { const r = await fetch(apiBase() + '/api/ren/dance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trackId: S.key, choreo: clean }) });
    const d = await r.json().catch(() => ({}));
    if (d.exists && validChoreo(d.choreo)) { S.data = d.choreo; localStorage[LS(S.key)] = JSON.stringify(d.choreo); }   // first save wins
    else if (r.ok) localStorage[LS(S.key)] = JSON.stringify(clean);
  } catch (e) { }
}
/** clearDance(key, gmKey): drop the cached + server copy (server DELETE needs the GM key) and re-record next play */
export async function clearDance(key, gmKey) {
  if (!key) return false; try { localStorage.removeItem(LS(key)); } catch (e) { } let ok = true;
  const k = gmKey || localStorage.eearGM;
  if (k && !/^user/.test(key)) { try { const r = await fetch(apiBase() + '/api/ren/dance?trackId=' + encodeURIComponent(key), { method: 'DELETE', headers: { 'x-gm-key': k } }); ok = r.ok; } catch (e) { ok = false; } }
  const S = STORES.get(key); if (S) { S.data = null; S.forced = false; startRec(S); }
  return ok;
}
export function currentKey() { return E.key; }
