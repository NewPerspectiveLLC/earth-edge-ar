// orbctl.js (d49): Orb flight controls, shown in the 'Ghost & Orb controls' screen (ghostctl.js?v=1792443133403) + a floating joystick for Manual.
// Settings: localStorage.eearOrbCfg (orbit.js?v=1792443133403 setOrbCfg). The orb's PATH is computed on each device around its own listener (per-device),
// so Manual steering stays local. Matt (GM key) can 'Apply to everyone': mode / tour pick / radius / linger / speed / go-to spot go into the
// server DJ state (.orb, POST /api/orb, GM-gated); every device follows them unless it turns off 'Follow Matt's orb settings'.
const API = () => window.EEAR_ORBAPI;
const BASE = () => (window.EEAR_DJ && EEAR_DJ.base) || window.EEAR_API || (location.hostname.endsWith('github.io') ? 'https://verse-concerning-summit-equipped.trycloudflare.com' : '');
const isGM = () => !!localStorage.eearGM;
const SHARE_KEYS = ['mode', 'tour', 'radius', 'lingerF', 'speed', 'hold', 'goto', 'tourReq'];
export async function share(cfg) { const r = await fetch(BASE() + '/api/orb', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gm-key': localStorage.eearGM || '' }, body: JSON.stringify({ cfg }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); window.EEAR_DJ && EEAR_DJ.fetchState && EEAR_DJ.fetchState(); return j }
const pickShare = c => Object.fromEntries(SHARE_KEYS.filter(k => k in c).map(k => [k, c[k]]));
function apply(p) { const A = API(); if (!A) return; A.setOrbCfg(p); if (localStorage.eearOrbShare === '1' && isGM()) share(pickShare(A.orbCfgLocal())).catch(e => toast('Share failed: ' + e.message)) ; refresh() }
function toast(t) { const T = window.toast || window.say; if (T) T(t); else console.log(t) }
/** send the orb to a map spot (lat/lon): smooth arc, linger ~15 s, back to Auto (unless Hold) */
export function sendGoto(lat, lon) { apply({ mode: 'goto', goto: { lat: +lat.toFixed(6), lon: +lon.toFixed(6), id: Date.now() } }); toast('Orb flying to that spot') }
export function tourNow() { const c = API().orbCfgLocal(); apply({ mode: 'tour', tourReq: Date.now(), tour: c.tour === 'off' ? 'alt' : c.tour }) }
// ---- floating joystick (Manual): pad = direction relative to where you look (or north-up if no camera), side buttons = height
let pad = null, raf = 0; const ST = window.EEAR_ORBSTEER = window.EEAR_ORBSTEER || { x: 0, y: 0, h: 0 }; let jx = 0, jy = 0, jh = 0;
function camFwd() { const E = window.EEAR; if (!E || !E.cam || !E.cam.getWorldDirection) return null; const v = E.cam.getWorldDirection(new E.cam.position.constructor()); const l = Math.hypot(v.x, v.z); return l > 1e-3 ? [v.x / l, -v.z / l] : null }
function steerTick() { const f = camFwd() || [0, 1], r = [f[1], -f[0]]; ST.x = f[0] * jy + r[0] * jx; ST.y = f[1] * jy + r[1] * jx; ST.h = jh; raf = pad && pad.style.display !== 'none' ? requestAnimationFrame(steerTick) : 0 }
export function showPad(on) { if (!pad) { pad = document.createElement('div'); pad.id = 'orbPad'; pad.innerHTML = `<style>#orbPad{position:fixed;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 90px);z-index:75;display:flex;gap:8px;align-items:flex-end;font:600 13px system-ui;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none}
#orbPad .j{width:150px;height:150px;border-radius:75px;background:#2a0f4acc;border:2px solid #b06bff;position:relative}#orbPad .k{position:absolute;left:50px;top:50px;width:50px;height:50px;border-radius:25px;background:radial-gradient(#fff,#c27bff 45%,#7a2bd6);box-shadow:0 0 18px #c27bff}
#orbPad .c{display:flex;flex-direction:column;gap:6px}#orbPad button{width:56px;height:46px;border-radius:10px;border:0;background:#b06bff;color:#fff;font:700 18px system-ui}#orbPad button.d{background:#ffc800;color:#000;font-size:13px}#orbPad .t{position:absolute;top:-20px;left:0;right:0;text-align:center;text-shadow:0 0 3px #000}</style>
<div class=j><div class=t>🛸 steer orb</div><div class=k></div></div><div class=c><button data-h=1>▲</button><button data-h=-1>▼</button><button class=d id=orbPadX>Auto</button></div>`; document.body.appendChild(pad);
    const j = pad.querySelector('.j'), k = pad.querySelector('.k'); let id = null;
    const mv = e => { const b = j.getBoundingClientRect(), x = (e.clientX - b.left - 75) / 55, y = (e.clientY - b.top - 75) / 55, l = Math.hypot(x, y), s = l > 1 ? 1 / l : 1; jx = x * s; jy = -y * s; k.style.left = 50 + jx * 55 + 'px'; k.style.top = 50 - jy * 55 + 'px' };
    j.onpointerdown = e => { id = e.pointerId; j.setPointerCapture(id); mv(e) }; j.onpointermove = e => { if (e.pointerId === id) mv(e) };
    j.onpointerup = j.onpointercancel = () => { id = null; jx = jy = 0; k.style.left = k.style.top = '50px' };
    pad.querySelectorAll('[data-h]').forEach(b => { b.onpointerdown = e => { e.preventDefault(); jh = +b.dataset.h }; b.onpointerup = b.onpointerleave = b.onpointercancel = () => { jh = 0 } });
    pad.querySelector('#orbPadX').onclick = () => { apply({ mode: 'auto' }); showPad(false) } }
  pad.style.display = on ? 'flex' : 'none'; if (on && !raf) steerTick(); if (!on) { jx = jy = jh = 0; ST.x = ST.y = ST.h = 0 } }
// ---- section inside the Ghost & Orb screen
let host = null;
const TOURS = [['alt', 'Alternate (RA ↔ Cappy\'s)'], ['ra', 'Ready Athletics trail'], ['cappy', "Cappy's trails"], ['off', 'Off (no tours)']];
const SL = [['radius', 'Orbit radius (m)', 25, 150, 1, 'how far out it circles you (never closer than 25 m)'], ['lingerF', 'Linger frequency (×, 0 = never)', 0, 3, .1, 'how often it parks and gets louder'], ['speed', 'Speed (×)', .2, 3, .05, 'orbit, tour and steering speed']];
export function render(el) { host = el || host; if (!host) return; const A = API(); if (!A) { host.innerHTML = '<small>Orb loads with the music (Flying sound)…</small>'; setTimeout(() => render(), 1500); return }
  const L = A.orbCfgLocal(), C = A.orbCfg(), b = (m, t) => `<button data-om=${m} class="${C.mode === m ? '' : 'g'}">${t}</button>`;
  host.innerHTML = `<h3 style="margin:14px 0 4px">🛸 Orb flight</h3><small id=orbSt></small>
  <div style="margin-top:6px">${b('auto', 'Auto')}${b('manual', 'Manual')}<button data-om=goto class="${C.mode === 'goto' ? '' : 'g'}">Go-to (Map)</button><button data-om=tour class=g>Tour now</button></div>
  <label>Tours <select id=orbTour>${TOURS.map(([k, l]) => `<option value=${k}${C.tour === k ? ' selected' : ''}>${l}</option>`).join('')}</select><small>which trail the orb flies out to loop every few minutes</small></label>
  ${SL.map(([k, l, mn, mx, st, h]) => `<label><span>${l}<b id=orbv_${k}>${(+C[k]).toFixed(st < 1 ? (st < .1 ? 2 : 1) : 0)}</b></span><input type=range data-ok=${k} min=${mn} max=${mx} step=${st} value=${C[k]}><small>${h}</small></label>`).join('')}
  <label><input type=checkbox id=orbHold${C.hold ? ' checked' : ''}> Hold at the go-to spot <small>stays there until you pick Auto (else lingers ~15 s and comes back)</small></label>
  <label><input type=checkbox id=orbFollow${L.follow !== false ? ' checked' : ''}> Follow Matt's orb settings <small>use the settings Matt shares with everyone (when he has shared some)</small></label>
  ${isGM() ? `<label><input type=checkbox id=orbShare${localStorage.eearOrbShare === '1' ? ' checked' : ''}> GM: my changes drive everyone <small>sends mode, tours, radius, linger, speed and go-to spots to all devices (Manual steering stays on this device)</small></label><button id=orbShareNow>Apply to everyone now</button><button class=g id=orbUnshare>Stop sharing (everyone back to their own)</button>` : ''}
  <small style="margin-top:8px">Each device flies its own orb around its own listener (paths are per-device); shared settings make everyone's orb behave the same way.</small>`;
  const q = s => host.querySelector(s);
  host.querySelectorAll('[data-om]').forEach(x => x.onclick = () => { const m = x.dataset.om;
    if (m === 'manual') { apply({ mode: 'manual' }); showPad(true); window.EEAR_GHOSTCTL && EEAR_GHOSTCTL.close() }
    else if (m === 'goto') { window.EEAR_MAP10_GOTO = 1; const mb = document.getElementById('mapB'); if (mb) mb.click(); else import('./map10.js?v=1792443133403').then(M => M.openMap10({ places: [] })); window.EEAR_GHOSTCTL && EEAR_GHOSTCTL.close(); toast('Tap the map to send the orb there') }
    else if (m === 'tour') tourNow(); else { apply({ mode: m }); showPad(false) } render() });
  q('#orbTour').onchange = e => apply({ tour: e.target.value });
  host.querySelectorAll('[data-ok]').forEach(r => { r.oninput = () => { const k = r.dataset.ok, st = +r.step; q('#orbv_' + k).textContent = (+r.value).toFixed(st < 1 ? (st < .1 ? 2 : 1) : 0); A.setOrbCfg({ [k]: +r.value }) }; r.onchange = () => apply({ [r.dataset.ok]: +r.value }) });
  q('#orbHold').onchange = e => apply({ hold: e.target.checked }); q('#orbFollow').onchange = e => apply({ follow: e.target.checked });
  if (q('#orbShare')) { q('#orbShare').onchange = e => { localStorage.eearOrbShare = e.target.checked ? '1' : '0'; if (e.target.checked) apply({}) };
    q('#orbShareNow').onclick = () => share(pickShare(A.orbCfgLocal())).then(() => toast('Orb settings shared with everyone')).catch(e => toast('Share failed: ' + e.message));
    q('#orbUnshare').onclick = () => { localStorage.eearOrbShare = '0'; share(null).then(() => toast('Stopped sharing orb settings')).catch(e => toast('Failed: ' + e.message)); render() } }
  refresh() }
export function status() { const A = API(); if (!A) return ''; const p = A.orbLatLon(), C = A.orbCfg(), S = A.state;
  const what = S.mode === 'manual' ? 'manual steering' : S.mode.startsWith('tour') ? 'touring ' + (S.tourSite || '') : S.mode.startsWith('go') ? (S.mode === 'goHold' ? 'at the go-to spot' : 'flying to/from a spot') : S.mode === 'linger' ? 'lingering' : 'orbiting';
  return 'orb · ' + (p ? Math.round(p.dist) + ' m' : '–') + ' · ' + what + (C.shared ? " · following Matt's settings" : '') }
function refresh() { if (!host) return; const s = host.querySelector('#orbSt'); if (s) s.textContent = status() }
setInterval(() => { if (host && host.isConnected) refresh() }, 1000);
if (API() && API().orbCfgLocal().mode === 'manual') setTimeout(() => showPad(true), 1500);
window.EEAR_ORBCTL = { render, sendGoto, tourNow, showPad, status, share };
