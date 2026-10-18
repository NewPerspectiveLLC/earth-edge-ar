// dj.js (d45): Master DJ client. ONE global queue (server /api/dj, GM-controlled from dj.html) plays to everyone in Matt's Reality.
// Clock: server time (offset measured on every fetch); queue[index] started at startedAt; auto-advance + loop computed locally between updates.
// Updates: SSE /api/dj/stream + 30 s poll. Pages copy: API on the live tunnel; if unreachable, the library's seeded order on a fixed epoch (all offline clients agree).
// Audio: one streaming <audio> element -> MediaElementSource on the app AudioContext -> DJ.node; audio.js (beacon) and pillars.js (proximity voices) connect to DJ.node.
// Paused / empty queue = silence. The element plays only while a consumer wants it (Music on + beacon on Master DJ, or a pillar in earshot).
const TUNNEL = 'https://verse-concerning-summit-equipped.trycloudflare.com';
const BASE = window.EEAR_API || (location.hostname.endsWith('github.io') ? TUNNEL : '');
const EPOCH = Date.UTC(2026, 9, 17, 22, 0, 0);   // offline fallback clock (Pages without the API)
const S = { st: null, off: 0, src: 'none', lib: null, el: null, node: null, ctx: null, wants: {}, lastSeek: 0, pend: false, url: null, key: '', es: null, err: null };
const resolve = u => new URL(u, document.baseURI).href;
async function lib() { if (S.lib) return S.lib; const v = window.EEAR_V ? '?v=' + EEAR_V : ''; S.lib = await fetch('audio/dj/library.json' + v).then(r => r.json()); return S.lib }
function setState(st, t0, t1) { if (t0 != null && st.t) S.off = st.t - (t0 + t1) / 2; S.st = st; S.src = 'live'; S.err = null; changed() }
async function fetchState() {
  try { const t0 = Date.now(), r = await fetch(BASE + '/api/dj', { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), t1 = Date.now(); setState(j, t0, t1); return true }
  catch (e) { S.err = String(e.message || e); if (S.src !== 'live') await offline(); return false }
}
async function offline() { try { const L = await lib(), T = Object.fromEntries(L.tracks.map(t => [t.id, t])), Q = L.seed.map(id => T[id]).filter(Boolean).map((t, i) => ({ qid: 's' + i, ...t }));
  S.st = { t: Date.now(), rev: 0, playing: Q.length > 0, index: 0, startedAt: EPOCH, offset: 0, current: Q[0] || null, queue: Q }; S.off = 0; S.src = 'offline'; changed() } catch (e) { S.err = 'library: ' + (e.message || e) } }
function stream() { if (!window.EventSource) return; try { S.es && S.es.close() } catch (e) { }
  const es = S.es = new EventSource(BASE + '/api/dj/stream');
  es.addEventListener('dj', ev => { try { const j = JSON.parse(ev.data); if (!S.st || j.rev !== S.st.rev || S.src !== 'live') { S.st = j; S.src = 'live'; changed() } } catch (e) { } });
  es.onerror = () => { /* browser retries; poll keeps us going */ };
  for (const k in EV) es.addEventListener(k, ev => { let j; try { j = JSON.parse(ev.data) } catch (e) { return } EV[k].forEach(fn => { try { fn(j) } catch (e) { } }) });
}
const EV = {};   // d47: extra SSE event listeners (voice 'pcm' chunks) on the same /api/dj/stream connection
export function on(ev, fn) { const first = !EV[ev]; (EV[ev] = EV[ev] || []).push(fn); if (first && S.es) S.es.addEventListener(ev, e => { let j; try { j = JSON.parse(e.data) } catch (x) { return } EV[ev].forEach(f => { try { f(j) } catch (x) { } }) }) }
/** GM write helper (X-GM-Key from localStorage.eearGM): POST /api/dj or /api/dj/live */
export async function gm(body, path = '/api/dj') { const k = localStorage.eearGM || ''; const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gm-key': k }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status })); if (!r.ok) { const e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e } if (j && j.queue) setState(j); return j }
export const now = () => Date.now() + S.off;
/** current {item, offset s, index} at server time t (same normalisation as the server) */
export function at(t = now()) {
  const st = S.st; if (!st || !st.queue || !st.queue.length) return { item: null, offset: 0, index: 0, playing: false };
  const Q = st.queue; let i = st.index >= 0 && st.index < Q.length ? st.index : 0;
  if (!st.playing) return { item: Q[i], offset: st.offset || 0, index: i, playing: false };
  const tot = Q.reduce((a, x) => a + (+x.duration || 0), 0) * 1000; if (!(tot > 0)) return { item: null, offset: 0, index: 0, playing: false };
  let el = t - st.startedAt; if (el < 0) el = 0; el %= tot;
  for (let k = 0; k <= Q.length && el >= Q[i].duration * 1000; k++) { el -= Q[i].duration * 1000; i = (i + 1) % Q.length }
  return { item: Q[i], offset: el / 1000, index: i, playing: true };
}
let lastKey = '';
function changed() { const c = at(), k = (c.item ? c.item.qid + c.item.id : '') + '|' + c.playing; ui(c); if (k !== lastKey) { lastKey = k; try { dispatchEvent(new CustomEvent('eear:dj', { detail: { item: c.item, playing: c.playing } })) } catch (e) { } } }
function label(c = at()) { const st = S.st; if (!st) return '🎧 Master DJ: connecting…'; if (!st.queue || !st.queue.length) return '🎧 Master DJ: queue empty';
  const n = c.item ? c.item.title + ' — ' + c.item.artist : ''; return (c.playing ? '🎧 Now playing: ' : '🎧 DJ paused: ') + n + (S.src === 'offline' ? ' (offline order)' : '') }
function ui(c) { if (window.EEAR_DJ_NOUI) return; let d = document.getElementById('djNow');
  if (!d && document.body) { const s = document.createElement('style'); s.textContent = '#djNow{position:fixed;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 358px);z-index:21;max-width:min(260px,calc(100vw - 16px));font:600 11px system-ui,sans-serif;color:#fff;background:#2a1446d9;border:1px solid #a45cff88;border-radius:8px;padding:4px 8px;line-height:1.3;pointer-events:auto;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'; document.head.appendChild(s);
    d = document.createElement('div'); d.id = 'djNow'; d.title = 'Tap: pick the song for everyone'; d.onclick = () => { if (window.EEAR_DJPANEL) EEAR_DJPANEL.open(); else import('./djpanel.js?v=1792357111589').then(M => M.open()) }; document.body.appendChild(d) }
  if (d) d.textContent = label(c) }
// ---- audio element
function el() { if (S.el) return S.el; const a = S.el = new Audio(); a.preload = 'auto'; a.playsInline = true; a.setAttribute('playsinline', ''); a.setAttribute('webkit-playsinline', '');
  a.addEventListener('loadedmetadata', () => { S.pend = true }); a.addEventListener('ended', () => tick()); return a }
export function attach(ctx) { if (S.ctx === ctx && S.node) return S.node; S.ctx = ctx; const a = el(); try { const src = ctx.createMediaElementSource(a); S.node = ctx.createGain(); S.node.gain.value = 1; src.connect(S.node) } catch (e) { S.err = 'attach: ' + (e.message || e) } return S.node }
/** call inside a user tap (iOS): starts the element once so later play() calls are allowed */
export function unlock() { const a = el(), c = at(); if (!a.src && c.item) { a.src = resolve(c.item.url); S.url = a.src; S.pend = false } try { const p = a.play(); p && p.catch(() => { }) } catch (e) { } setTimeout(tick, 50) }
export function want(who, v) { const b = !!v; if (S.wants[who] !== b) { S.wants[who] = b; tick() } }
function tick() {
  const a = S.el, c = at(), wanted = Object.values(S.wants).some(Boolean); ui(c); if (!a) return;
  if (!wanted || !c.playing || !c.item || !S.node) { if (!a.paused) a.pause(); return }
  const u = resolve(c.item.url);
  if (S.url !== u) { S.url = u; S.pend = false; a.src = u; a.load() }
  if (S.pend || (a.readyState >= 1 && Math.abs(a.currentTime - c.offset) > .6 && performance.now() - S.lastSeek > 3000 && !a.seeking)) {
    if (a.readyState >= 1) { S.pend = false; S.lastSeek = performance.now(); try { a.currentTime = Math.min(c.offset, (a.duration || 1e9) - .05) } catch (e) { } } }
  if (a.paused && c.offset < (c.item.duration - .3)) { const p = a.play(); p && p.catch(e => { S.err = 'play: ' + (e.message || e) }) }
}
setInterval(tick, 500); setInterval(changed, 1000);
let polls = 0; setInterval(() => { polls++; if (S.src !== 'live' || polls % 2 === 0) fetchState(); if (S.src === 'live' && (!S.es || S.es.readyState === 2)) stream() }, 30000);
fetchState().then(ok => { if (ok) stream() });
addEventListener('visibilitychange', () => { if (!document.hidden) fetchState() });
export const DJ = { at, now, attach, unlock, want, label: () => label(), get node() { return S.node }, get el() { return S.el }, get state() { return S.st }, get source() { return S.src }, get err() { return S.err }, get offsetMs() { return S.off }, get current() { return at().item }, base: BASE, fetchState, on, gm };
window.EEAR_DJ = DJ;
