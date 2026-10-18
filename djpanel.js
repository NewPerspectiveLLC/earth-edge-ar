// djpanel.js (d47): in-app Master DJ panel: pick the song for EVERYONE (library + queue, play now / next / prev / pause) and talk LIVE over the music.
// Same GM-key-protected endpoints as dj.html (/api/dj, /api/dj/live); the key is asked once per device (localStorage.eearGM). Opened from the ⋯ music panel
// ('🎧 Pick song for everyone') or by tapping the 'Now playing' pill.
import { VOICE } from './djvoice.js?v=1792353079683';
const DJ = () => window.EEAR_DJ, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let LIB = null, el = null, msgT = 0;
async function lib() { if (LIB) return LIB; const v = window.EEAR_V ? '?v=' + EEAR_V : ''; LIB = await fetch('audio/dj/library.json' + v).then(r => r.json()); return LIB }
const fmt = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') };
function msg(t, bad) { const m = $('djpMsg'); if (m) { m.textContent = t; m.style.color = bad ? '#ff8a8a' : '#c9f' } clearTimeout(msgT); msgT = setTimeout(() => { const m2 = $('djpMsg'); if (m2) m2.textContent = '' }, 6000) }
async function op(body, path) { try { await DJ().gm(body, path); render(); return true } catch (e) { if (e.status === 403) { localStorage.removeItem('eearGM'); msg('GM key not accepted, enter it again', true); render() } else msg(e.message, true); return false } }
function css() { if ($('djpCss')) return; const s = document.createElement('style'); s.id = 'djpCss'; s.textContent = `
#djp{position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 50px);bottom:calc(env(safe-area-inset-bottom,0px) + 70px);max-width:520px;margin:0 auto;z-index:70;background:#1a0b2ef2;color:#fff;border:1px solid #a45cff;border-radius:12px;font:14px system-ui,sans-serif;display:flex;flex-direction:column;box-shadow:0 8px 40px #000a}
#djp header{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #a45cff55}#djp header b{flex:1}
#djp button{font:600 14px system-ui;padding:7px 10px;border-radius:8px;border:0;background:#ffc800;color:#000;margin:2px}#djp button.p{background:#b026ff;color:#fff}#djp button.r{background:#ff4060;color:#fff}#djp button.g{background:#444;color:#fff}
#djp .sc{overflow:auto;flex:1;padding:6px 10px}#djp .row{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #ffffff14}#djp .row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#djp .cur{background:#b026ff33}#djp h4{margin:10px 0 4px;color:#d9b3ff}#djp input,#djp select{font-size:15px;padding:5px;border-radius:6px;border:1px solid #a45cff;background:#0d0618;color:#fff}
#djp .live{background:#ff2050;color:#fff;animation:djpl 1s infinite}@keyframes djpl{50%{opacity:.6}}`; document.head.appendChild(s) }
export function open() { css(); if (!el) { el = document.createElement('div'); el.id = 'djp'; document.body.appendChild(el) } el.style.display = 'flex'; render(); lib().then(render) }
export function close() { if (el) el.style.display = 'none' }
function render() { if (!el || el.style.display === 'none') return; const D = DJ(); if (!D) { el.innerHTML = '<header><b>Master DJ</b><button class=g id=djpX>Close</button></header><div class=sc>Master DJ not loaded.</div>'; $('djpX').onclick = close; return }
  const st = D.state || {}, c = D.at(), Q = st.queue || [], key = !!localStorage.eearGM, V = VOICE.state, L = VOICE.latency(), live = V.live, onAir = !!st.live;
  const ann = st.ann, last = st.lastBc;
  el.innerHTML = `<header><b>🎧 Master DJ · plays to everyone</b><button class=g id=djpX>Close</button></header><div class=sc>
  ${key ? '' : `<div style="margin:6px 0">GM key (asked once on this device): <input id=djpK type=password autocomplete=off style="width:55%"> <button id=djpKs>Save</button></div>`}
  <div style="margin:4px 0"><b>${c.item ? esc(c.item.title) + ' — ' + esc(c.item.artist) : 'queue empty'}</b> ${c.item ? `<small>${fmt(c.offset)} / ${fmt(c.item.duration)}</small>` : ''} ${D.source !== 'live' ? '<small style="color:#ff8a8a">(server not reachable: ' + esc(D.source) + ')</small>' : ''}</div>
  <div><button id=djpPrev>⏮ Prev</button><button id=djpPP>${c.playing ? '⏸ Pause' : '▶ Play'}</button><button id=djpNext>⏭ Next</button><span id=djpMsg style="font-size:12px;margin-left:6px"></span></div>
  <h4>🎙 Talk to everyone (live)</h4>
  <div>${live ? `<button class=live id=djpLive>⏹ End live (on air ${V.chunks * .4 | 0} s)</button>` : `<button class=p id=djpLive>🎙 Go live</button>`}
   <label><small>then repeat</small> <select id=djpRep>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value=${n}${n == (localStorage.eearDjRep || 0) ? ' selected' : ''}>${n ? n + '×' : 'no'}</option>`).join('')}</select></label>
   <label><small>gap</small> <select id=djpGap>${[1, 3, 5, 10, 30, 60].map(n => `<option value=${n}${n == (localStorage.eearDjGap || 3) ? ' selected' : ''}>${n} s</option>`).join('')}</select></label></div>
  <div>${last ? `<button id=djpRe>🔁 Replay last (${fmt(last.dur)})</button>` : ''}<button class=r id=djpStop>⛔ Stop broadcast now</button></div>
  <div style="font-size:12px;color:#d9b3ff;margin:3px 0">${onAir && !live ? '🔴 Someone is live now. ' : ''}${ann ? `📢 Broadcast playing for everyone (${ann.repeats}× , ${fmt(ann.dur)}). ` : ''}${L ? `Live delay here ≈ ${(L.median / 1000).toFixed(1)} s. ` : ''}${V.err ? '<span style="color:#ff8a8a">' + esc(V.err) + '</span>' : ''}
   Music ducks while you talk. Mic opens only when you tap Go live.</div>
  <h4>Queue (${Q.length})</h4>${Q.map((x, i) => `<div class="row${i === c.index ? ' cur' : ''}"><span>${i === c.index ? '▶ ' : ''}${esc(x.title)} <small>— ${esc(x.artist)} · ${fmt(x.duration)}</small></span><button data-q="${esc(x.qid)}">▶ Now</button></div>`).join('') || '<div>empty</div>'}
  <h4>Library</h4>${LIB ? LIB.tracks.map(t => `<div class=row><span>${esc(t.title)} <small>— ${esc(t.artist)} · ${esc(t.genre || '')} · ${fmt(t.duration)}</small></span><button data-l="${esc(t.id)}">▶ Now</button><button class=g data-n="${esc(t.id)}">+ Next</button></div>`).join('') : 'loading…'}
  </div>`;
  $('djpX').onclick = close;
  if ($('djpKs')) $('djpKs').onclick = () => { const v = $('djpK').value.trim(); if (v) { localStorage.eearGM = v; msg('Key saved on this device'); render() } };
  const need = () => { if (!localStorage.eearGM) { msg('Enter the GM key first', true); return false } return true };
  $('djpPrev').onclick = () => need() && op({ op: 'prev' }); $('djpNext').onclick = () => need() && op({ op: 'next' });
  $('djpPP').onclick = () => need() && op({ op: c.playing ? 'pause' : 'resume' });
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => need() && op({ op: 'play', qid: b.dataset.q }).then(ok => ok && msg('Playing for everyone')));
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => need() && op({ op: 'add', id: b.dataset.l, next: true, playNow: true }).then(ok => ok && msg('Playing for everyone')));
  el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => need() && op({ op: 'add', id: b.dataset.n, next: true }).then(ok => ok && msg('Queued next')));
  $('djpRep').onchange = e => localStorage.eearDjRep = e.target.value; $('djpGap').onchange = e => localStorage.eearDjGap = e.target.value;
  $('djpLive').onclick = async () => { if (!need()) return; try { if (VOICE.state.live) { await VOICE.stopLive(+$('djpRep').value, +$('djpGap').value); msg('Live ended' + (+$('djpRep').value ? ', repeating ' + $('djpRep').value + '×' : ', saved for replay')) } else { await VOICE.startLive(); msg('🔴 You are live') } } catch (e) { msg('Mic/live: ' + (e.message || e), true) } render() };
  if ($('djpRe')) $('djpRe').onclick = () => need() && op({ op: 'announce', repeats: Math.max(1, +$('djpRep').value || 1), gap: +$('djpGap').value }, '/api/dj/live').then(ok => ok && msg('Replaying for everyone'));
  $('djpStop').onclick = () => need() && VOICE.cancel().then(() => { msg('Broadcast stopped for everyone'); render() }).catch(e => msg(e.message, true));
}
setInterval(() => { if (el && el.style.display !== 'none' && !el.contains(document.activeElement)) render() }, 2000);
window.EEAR_DJPANEL = { open, close };
