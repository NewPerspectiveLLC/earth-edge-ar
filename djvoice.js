// djvoice.js (d47): Master DJ VOICE. Matt talks over the music for everyone in Matt's Reality.
// LIVE (primary): mic -> 16 kHz 16-bit PCM mono, ~400 ms chunks -> POST /api/dj/live (GM key) -> server pushes each chunk on the existing SSE /api/dj/stream
//   (event 'pcm') -> every client decodes it with Web Audio (no codec: works on iOS Safari) and schedules it gap-free behind a ~0.35 s jitter buffer.
// SAVED: the server keeps each live session as a WAV; 'announce' (repeat 1-10 x, gap s) / 'Replay last' play it in sync on server time; 'cancel' stops it for everyone.
// While voice plays: music (DJ.node) ducks ~80%. Voice comes from the orb when Flying sound is on, else plain. The mic is only opened when Matt taps Go live.
const DJ = () => window.EEAR_DJ;
const V = { live: false, id: null, seq: 0, ctx: null, own: null, out: null, sched: 0, lastId: null, lat: [], chunks: 0, rx: 0, sending: false, err: '', mic: null, ann: null, annSrc: null, annKey: '', bufs: {}, duck: 1, me: false, listeners: [] };
const SR = 16000, CH_S = .4, JIT = .35;
function ctx() { const A = window.EEAR_AUDIO; if (A && A.ctx) return A.ctx; if (!V.own) { const AC = window.AudioContext || window.webkitAudioContext; V.own = new AC() } return V.own }
function out(c) { const A = window.EEAR_AUDIO; if (A && A.ctx === c && A.voiceIn && A.voiceIn()) return A.voiceIn(); if (!V.out || V.out.context !== c) { V.out = c.createGain(); V.out.gain.value = 1; V.out.connect(c.destination) } return V.out }
addEventListener('pointerdown', () => { try { const c = ctx(); if (c.state === 'suspended') c.resume() } catch (e) { } }, { passive: true });
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s) };
const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u };
// ---- listener: live chunks
const SEEN = new Set();
function onPcm(j) { const k = j.id + ':' + j.seq; if (SEEN.has(k)) return; SEEN.add(k); if (SEEN.size > 400) SEEN.delete(SEEN.values().next().value); V.rx++; if (V.me && j.id === V.id) return;   // never play my own mic back (feedback)
  const c = ctx(); if (c.state !== 'running') { try { c.resume() } catch (e) { } if (c.state !== 'running') return }
  const u = unb64(j.pcm), i16 = new Int16Array(u.buffer, u.byteOffset, u.length >> 1), n = i16.length, sr = j.sr || SR, buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = i16[i] / 32768;
  if (V.lastId !== j.id || V.sched < c.currentTime + .02 || V.sched > c.currentTime + 1.5) { V.sched = c.currentTime + JIT; V.lastId = j.id }   // (re)start / resync the jitter buffer
  const s = c.createBufferSource(); s.buffer = buf; s.connect(out(c)); s.start(V.sched);
  const playAt = DJ() ? DJ().now() + (V.sched - c.currentTime) * 1000 : 0; if (j.tc) { V.lat.push(playAt - j.tc); if (V.lat.length > 40) V.lat.shift() }
  V.sched += n / sr; V.liveUntil = performance.now() + 1500 }
let hooked = false; function hook() { if (hooked || !DJ() || !DJ().on) return; hooked = true; DJ().on('pcm', onPcm) }
// ---- saved announcements (sync on server time)
async function getBuf(c, A) { if (V.bufs[A.id]) return V.bufs[A.id]; const p = V.bufs[A.id] = fetch(DJ().base + A.url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer() }).then(ab => new Promise((ok, no) => c.decodeAudioData(ab, ok, no))); p.catch(() => delete V.bufs[A.id]); return p }
async function annTick() { const st = DJ() && DJ().state, A = st && st.ann, c = ctx(); let want = null;
  if (A && A.dur > 0) { const el = DJ().now() - A.startsAt, per = (A.dur + A.gap) * 1000, k = Math.floor(el / per), w = el - k * per; if (el >= 0 && k < A.repeats && w < A.dur * 1000) want = { key: A.id + ':' + A.startsAt + ':' + k, off: w / 1000 } }
  V.ann = want; if (!want) { if (V.annSrc) { try { V.annSrc.stop() } catch (e) { } V.annSrc = null; V.annKey = '' } return }
  if (V.annKey === want.key) return; V.annKey = want.key; if (V.annSrc) { try { V.annSrc.stop() } catch (e) { } V.annSrc = null }
  try { if (c.state !== 'running') await c.resume().catch(() => { }); const b = await getBuf(c, A); if (V.annKey !== want.key || c.state !== 'running') { if (c.state !== 'running') V.annKey = ''; return }
    const off = (DJ().now() - A.startsAt) / 1000 % (A.dur + A.gap); if (off >= b.duration - .05) return; const s = c.createBufferSource(); s.buffer = b; s.connect(out(c)); s.start(c.currentTime + .02, Math.max(0, off)); V.annSrc = s; s.onended = () => { if (V.annSrc === s) V.annSrc = null } } catch (e) { V.err = 'announce: ' + (e.message || e); V.annKey = '' } }
// ---- duck music while any voice plays
function duckTick() { const st = DJ() && DJ().state, speaking = !!(st && st.live) || (V.liveUntil > performance.now()) || !!V.ann || V.live, g = speaking ? .2 : 1;
  const n = DJ() && DJ().node; if (n && n.context && Math.abs(V.duck - g) > .01) { n.gain.setTargetAtTime(g, n.context.currentTime, speaking ? .08 : .5); V.duck = g } else if (n && n.context && n.gain.value !== g && Math.abs(n.gain.value - g) > .05 && !speaking) n.gain.setTargetAtTime(g, n.context.currentTime, .5) }
setInterval(() => { hook(); annTick(); duckTick() }, 150);
// d47b: long-poll fallback (the trycloudflare tunnel - also used by the Pages copy - buffers SSE, so 'pcm' and 'dj' events never arrive through it).
// GET /api/dj/pull?after=<gs>&rev=<rev> returns new voice chunks at once (or state-rev changes -> refetch DJ state); otherwise held up to 12 s.
let pullGs = -1, pullOn = false, pullRev = -1;
async function pullLoop() { if (pullOn) return; pullOn = true;
  for (;;) { const D = DJ(); if (!D || D.source !== 'live' || document.hidden) { await new Promise(r => setTimeout(r, 1500)); continue }
    try { const rev = pullRev >= 0 ? pullRev : (D.state && D.state.rev != null ? D.state.rev : -1), r = await fetch(D.base + '/api/dj/pull?after=' + pullGs + '&rev=' + rev, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json();
      if (pullGs >= 0) for (const c of j.pcm || []) onPcm(c);
      pullGs = j.gs; pullRev = j.rev; if (j.rev !== rev && D.fetchState) await D.fetchState() }
    catch (e) { await new Promise(r => setTimeout(r, 3000)) } } }
setTimeout(pullLoop, 800);
// ---- broadcaster (GM)
export async function startLive() { if (V.live) return; if (!localStorage.eearGM) throw new Error('GM key needed'); V.err = '';
  const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const AC = window.AudioContext || window.webkitAudioContext, c = new AC(); if (c.state === 'suspended') await c.resume();
  const src = c.createMediaStreamSource(ms), sp = c.createScriptProcessor(4096, 1, 1), z = c.createGain(); z.gain.value = 0; src.connect(sp); sp.connect(z); z.connect(c.destination);
  const r = await DJ().gm({ op: 'start', sr: SR }, '/api/dj/live'); V.id = r.live && r.live.id; V.seq = 0; V.live = true; V.me = true; V.chunks = 0; V.mic = { ms, c, sp, src, z };
  const ratio = c.sampleRate / SR, need = Math.round(SR * CH_S); let acc = new Int16Array(need), fill = 0, pos = 0, t0 = DJ().now();
  sp.onaudioprocess = e => { if (!V.live) return; const x = e.inputBuffer.getChannelData(0);
    for (; pos < x.length; pos += ratio) { const i = Math.floor(pos), f = pos - i, v = x[i] + ((x[i + 1] ?? x[i]) - x[i]) * f; acc[fill++] = Math.max(-32768, Math.min(32767, v * 32767));
      if (fill === need) { const u8 = new Uint8Array(acc.buffer.slice(0)), tc = t0; t0 = DJ().now(); fill = 0; send(u8, tc) } }
    pos -= x.length };
  return V.id }
let Q = Promise.resolve();   // chunks go out strictly in order (one request at a time); if the link stalls they queue up instead of arriving shuffled
function send(u8, tc) { const seq = V.seq++, id = V.id, body = { op: 'chunk', id, seq, tc, pcm: b64(u8) }; V.chunks++;
  Q = Q.then(() => V.id === id ? DJ().gm(body, '/api/dj/live') : null).catch(e => { V.err = String(e.message || e); if (/no live session|cap/.test(V.err)) stopLive(0) }) }
export async function stopLive(repeats = 0, gap = 3) { const m = V.mic; V.live = false; V.mic = null; if (m) { try { m.sp.disconnect(); m.src.disconnect(); m.ms.getTracks().forEach(t => t.stop()); m.c.close() } catch (e) { } }
  setTimeout(() => { V.me = false }, 3000); try { return await DJ().gm({ op: 'stop', repeats, gap }, '/api/dj/live') } catch (e) { V.err = String(e.message || e) } }
export const announce = (repeats = 1, gap = 3, id) => DJ().gm({ op: 'announce', repeats, gap, id }, '/api/dj/live');
export const cancel = () => { if (V.live) stopLive(0); return DJ().gm({ op: 'cancel' }, '/api/dj/live') };
export function latency() { const a = V.lat.slice().sort((x, y) => x - y); return a.length ? { median: Math.round(a[a.length >> 1]), min: Math.round(a[0]), max: Math.round(a[a.length - 1]), n: a.length } : null }
export const VOICE = { startLive, stopLive, announce, cancel, latency, get state() { return { live: V.live, id: V.id, chunks: V.chunks, rx: V.rx, err: V.err, playingAnn: !!V.ann, hearingLive: V.liveUntil > performance.now(), duck: V.duck } } };
window.EEAR_VOICE = VOICE;
