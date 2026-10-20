// d53 iPhone: landscape full-screen layout + 'Mini flight control' (thumb joystick, altitude, speed) + one-time 'Add to Home Screen' hint.
// Builds on the existing FLY state / flyStep in index.html: joystick -> FLYB.jx/jy (analog strafe/forward relative to where you look),
// ▲/▼ -> FLYB.up/dn (same as the Fly panel buttons), speed -> FLY.spd (1x/3x/10x) or FLY.lockBoost (BOOST). Desktop and Quest controls untouched.
(function () {
  const UA = navigator.userAgent, PHONE = matchMedia('(pointer:coarse)').matches && !/OculusBrowser|Quest|Pacific/i.test(UA);
  const IOS = /iP(hone|od|ad)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const STAND = !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches);
  const L = 'max(8px,env(safe-area-inset-left,0px))', R = 'max(8px,env(safe-area-inset-right,0px))', B = 'env(safe-area-inset-bottom,0px)', T = 'env(safe-area-inset-top,0px)';
  const LAND = '@media (pointer:coarse) and (orientation:landscape) and (max-height:540px)';
  const css = `
#mfly{position:fixed;z-index:2147482300;display:none;align-items:flex-end;gap:5px;left:calc(${L} + 134px);bottom:calc(${B} + 100px);opacity:.78;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
body.mflyOn #mfly{display:flex}body.layOpen #mfly,body.flyOn #mfly,body.mpOpen #mfly{display:none!important}
#mflJ{width:80px;height:80px;border-radius:40px;background:radial-gradient(circle,#ffffff14 0 38%,#0000 39%),#0b0f1680;border:1.5px solid #9fd8ff88;position:relative;touch-action:none;box-shadow:0 0 10px #0008}
#mflK{position:absolute;left:23px;top:23px;width:34px;height:34px;border-radius:17px;background:#9fd8ffcc;box-shadow:0 0 8px #9fd8ff;pointer-events:none}
#mflJ.on{border-color:#9fd8ff}#mfly.act{opacity:1}
#mflC{display:flex;flex-direction:column;gap:4px}
#mflC button{width:38px;height:30px;margin:0;padding:0;border-radius:9px;border:1px solid #9fd8ff66;background:#0b0f16a0;color:#9fd8ff;font:700 14px -apple-system,system-ui,sans-serif;touch-action:none;-webkit-tap-highlight-color:transparent}
#mflC button.dn{background:#9fd8ff;color:#000}#mflS.b{background:#ff5a3c;color:#fff;border-color:#ff5a3c;font-size:10px}
#mflA{position:absolute;left:0;top:-15px;width:80px;text-align:center;font:700 10px monospace;color:#9fd8ff;text-shadow:0 1px 3px #000;pointer-events:none;white-space:nowrap}
#a2hs{position:fixed;z-index:2147483500;left:50%;transform:translateX(-50%);top:calc(${T} + 44px);max-width:min(440px,80vw);background:#0b0f16ee;color:#fff;border:1px solid #ffc800;border-radius:12px;padding:8px 12px;font:13px/1.35 -apple-system,system-ui,sans-serif;text-align:center}
#a2hs b{color:#ffc800}
${LAND}{
 #mfly{left:calc(${L} + 206px);bottom:calc(${B} + 6px)}
 #ui{padding-left:${L}!important;padding-right:calc(${R} + 44px)!important;font-size:11px!important;line-height:1.25!important;max-height:30px;overflow:hidden}
 #brand{top:44px!important}
 #layB,#camB,#flyB,#mapB,#hlock,#ghostB,#sumB,#grB,#gcB{font-size:13px!important;padding:7px 10px!important;margin:0!important}
 #mpb{right:${R}!important;bottom:calc(${B} + 6px)!important}#mpb button{font-size:13px!important;padding:7px 10px!important;margin:0!important}
 #layB{right:${R}!important;bottom:calc(${B} + 44px)!important}
 #camB{right:${R}!important;bottom:calc(${B} + 82px)!important}
 #flyB{right:${R}!important;bottom:calc(${B} + 120px)!important}
 #mapB{right:${R}!important;bottom:calc(${B} + 158px)!important}
 #musW{right:${R}!important;bottom:calc(${B} + 196px)!important}#musB,#musS{font-size:13px!important;padding:7px 10px!important}#musR{display:none!important}
 #djNow{right:calc(${R} + 44px)!important;bottom:auto!important;top:calc(${T} + 8px)!important;max-width:min(240px,40vw)!important}
 #hlock{right:${R}!important;top:calc(${T} + 48px)!important}
 #ghostB{right:${R}!important;top:calc(${T} + 84px)!important}
 #gcB{right:calc(${R} + 112px)!important;top:calc(${T} + 48px)!important}
 #sumB{right:calc(${R} + 112px)!important;top:calc(${T} + 84px)!important}
 #grB{right:calc(${R} + 112px)!important;top:calc(${T} + 120px)!important}
 #zoom{right:calc(${R} + 250px)!important;top:calc(${T} + 44px)!important;display:flex;gap:4px}#zoom br{display:none}#zoom button{font-size:13px!important;padding:6px 9px!important;margin:0!important}
 #roomPill{left:${L}!important;top:calc(${T} + 38px)!important}
 #raCard{left:${L}!important;top:calc(${T} + 74px)!important;max-height:40vh;overflow:auto}
 #pairP{left:calc(${L} + 160px)!important;top:calc(${T} + 34px)!important;padding:3px!important}#pairP button{font-size:13px!important;padding:6px 10px!important;margin:0!important}
 #radar{left:${L}!important;width:96px!important;height:96px!important;bottom:calc(${B} + 128px)!important}
 #hpChip{left:${L}!important;bottom:calc(${B} + 82px)!important;font-size:13px!important;padding:7px 11px!important}
 #pingW{left:${L}!important}
 #renT{left:calc(${L} + 340px)!important;transform:none!important;bottom:calc(${B} + 6px)!important}
 #ui2{left:${L}!important}
 #a2hs{top:calc(${T} + 40px)}
}
@media (pointer:coarse) and (orientation:portrait){body.mflyOn #renT{bottom:calc(${B} + 226px)!important}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  // ---- mini flight control
  const W = document.createElement('div'); W.id = 'mfly';
  W.innerHTML = '<div id=mflJ aria-label="flight joystick"><div id=mflA></div><div id=mflK></div></div><div id=mflC><button id=mflU aria-label="climb">▲</button><button id=mflS aria-label="speed">1×</button><button id=mflD aria-label="descend">▼</button></div>';
  document.body.appendChild(W);
  const J = W.querySelector('#mflJ'), K = W.querySelector('#mflK'), A = W.querySelector('#mflA'), S = W.querySelector('#mflS');
  const fb = () => window.FLYB, fl = () => window.FLY;
  const KEY = 'eearMiniFly';
  const on = () => PHONE && localStorage[KEY] !== '0';
  const xr = () => !!(window.EEAR && EEAR.ren && EEAR.ren.xr && EEAR.ren.xr.isPresenting);
  const sync = () => document.body.classList.toggle('mflyOn', on() && !xr());
  window.EEAR_MFLY = { on, set(v) { localStorage[KEY] = v ? '1' : '0'; sync(); dispatchEvent(new Event('eear:minifly')); window.eearToast && eearToast(v ? '✈ Mini flight control on' : '✈ Mini flight control off', 2000) }, phone: PHONE };
  sync(); setInterval(sync, 1000);
  const stop = e => { e.stopPropagation() };
  for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchmove', 'touchend', 'click']) W.addEventListener(ev, stop);
  W.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  let jp = null; const RAD = 28;
  const setK = (x, y) => { K.style.transform = 'translate(' + x + 'px,' + y + 'px)' };
  const curve = v => Math.sign(v) * Math.pow(Math.max(0, (Math.abs(v) - .12) / .88), 1.4);
  J.addEventListener('pointerdown', e => {
    e.preventDefault(); J.setPointerCapture(e.pointerId); const r = J.getBoundingClientRect(); jp = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; J.classList.add('on'); W.classList.add('act'); mv(e) });
  const mv = e => { if (!jp || e.pointerId !== jp.id) return; let dx = e.clientX - jp.cx, dy = e.clientY - jp.cy; const d = Math.hypot(dx, dy); if (d > RAD) { dx *= RAD / d; dy *= RAD / d } setK(dx, dy);
    const F = fb(); if (F) { F.jx = curve(dx / RAD); F.jy = -curve(dy / RAD) } };
  J.addEventListener('pointermove', mv);
  const end = e => { if (!jp || (e && e.pointerId !== jp.id)) return; jp = null; setK(0, 0); J.classList.remove('on'); W.classList.remove('act'); const F = fb(); if (F) { F.jx = 0; F.jy = 0 } };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) J.addEventListener(ev, end);
  const hold = (b, k) => { b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('dn'); W.classList.add('act'); const F = fb(); if (F) F[k] = 1 });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { b.classList.remove('dn'); W.classList.remove('act'); const F = fb(); if (F) F[k] = 0 }) };
  hold(W.querySelector('#mflU'), 'up'); hold(W.querySelector('#mflD'), 'dn');
  // speed: 1x -> 3x -> 10x -> BOOST (the Fly panel's Boost lock) -> 1x; remembered
  const SP = [1, 3, 10, 'B'];
  const spIdx = () => { const F = fl(); if (F && F.lockBoost) return 3; const v = (F && F.spd) || 1; return Math.max(0, SP.indexOf(v)) };
  const spUI = () => { const i = spIdx(); S.textContent = i === 3 ? 'BOOST' : SP[i] + '×'; S.classList.toggle('b', i === 3); const fbo = document.getElementById('flyBo'); const F = fl(); if (fbo && F) fbo.textContent = 'Boost: ' + (F.lockBoost ? 'on' : 'off') };
  const spSet = i => { const F = fl(); if (!F) return; if (SP[i] === 'B') { F.lockBoost = true; F.spd = 1 } else { F.lockBoost = false; F.spd = SP[i] } localStorage.eearMiniFlySpd = String(SP[i]); spUI() };
  S.addEventListener('click', e => { e.preventDefault(); spSet((spIdx() + 1) % 4) });
  const fmt = m => m >= 1e6 ? Math.round(m / 1e3).toLocaleString() + ' km' : m >= 1000 ? (m / 1000).toFixed(m >= 1e5 ? 0 : 1) + ' km' : m.toFixed(0) + ' m';
  let ready = false;
  setInterval(() => { const F = fl(); if (!F) return; if (!ready) { ready = true; const v = localStorage.eearMiniFlySpd; if (v && v !== 'B' && !F.lockBoost) F.spd = +v || 1; spUI() } A.textContent = F.alt > .5 ? 'ALT ' + fmt(F.alt) : ''; if (S.textContent !== (spIdx() === 3 ? 'BOOST' : SP[spIdx()] + '×')) spUI() }, 250);
  // ---- page never scrolls / rubber-bands (that is what shrinks the view and brings Safari's bars back); scrollable panels still scroll
  // only touches on the 3D view itself (canvas / camera video / bare page) are held still; every panel keeps its own scrolling
  const VIEW = t => t === document.body || t === document.documentElement || (t.tagName === 'CANVAS' && t.id !== 'radar' && t.parentNode === document.body) || t.id === 'v';
  document.addEventListener('touchmove', e => { if (VIEW(e.target)) e.preventDefault() }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  // ---- one-time hint: iPhone Safari (not the home-screen app) in landscape
  if (IOS && !STAND && PHONE) {
    const hint = () => { if (localStorage.eearA2HS === '1' || innerWidth < innerHeight || document.getElementById('a2hs')) return; localStorage.eearA2HS = '1';
      const h = document.createElement('div'); h.id = 'a2hs'; h.innerHTML = 'Safari keeps its bar in landscape. For <b>true full screen</b>: Share <b>⎙</b> → <b>Add to Home Screen</b>, then open <b>Live Geometry</b> from the icon. <small>(tap to close)</small>';
      h.onclick = () => h.remove(); document.body.appendChild(h); setTimeout(() => h.remove(), 9000) };
    addEventListener('orientationchange', () => setTimeout(hint, 800)); addEventListener('resize', () => setTimeout(hint, 800)); setTimeout(hint, 4000);
  }
})();
