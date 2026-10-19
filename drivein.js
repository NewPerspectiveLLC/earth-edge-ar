// drivein.js (d50): Matt Ready DRIVE-IN - a giant double-sided outdoor movie screen floating over the Port Townsend peninsula,
// north of downtown, looping Matt's Drive folder 'Matt Ready Library/videos on loop' (reel built by tools/video_sync.py -> video/drivein/screen.json).
// Sync: everyone sees the same frame: pos = ((serverNow - epoch)/1000) mod duration, serverNow = Date.now() + Master DJ clock offset (dj.js?v=1792443133403).
// Picture: ONE <video> (muted + playsinline + loop: iOS autoplay) -> VideoTexture on a DoubleSide plane, so people behind it (north side) see the
//   same picture mirrored, never a black back. Frame/marquee/glow look right from both sides (marquee text = two back-to-back planes).
// Sound: muted by default. 'Screen sound' (localStorage.eearScreenSound) is the master switch; spatial gain on top (driveinGain):
//   gain = 1 within 1 mile (1609 m) of the screen, then a squared raised-cosine fade to 0 at 10 miles (16093 m), silent beyond.
//   video -> MediaElementSource -> gain -> HRTF panner (direction only, rolloff 0) -> app master volume (audio.js?v=1792443133403). Never ducks the DJ music.
// Far marker: beyond ~9 km (the screen gets tiny, Quest's far plane is 10 km) a gold '🎬 DRIVE-IN' billboard of fixed angular size (~3°) floats
//   exactly in the screen's direction with its distance; iPhone/desktop also get an edge-of-view arrow when it is off screen.
// Lite (Quest Lite): 640x360 reel, no glow plane, cheaper texture filtering.
import * as THREE from 'three';
export const DRIVEIN = {
  lat: 48.1300, lon: -122.7650,   // over the peninsula north of downtown / uptown (Fort Worden side), ~1.9 km NNW of downtown Water St, 4.0 km NE of the RA vortex
  altM: 340,                      // screen centre height above the ground (bottom edge ~197 m)
  wM: 480, hM: 270,               // 16:9 picture, 480 x 270 m (frame adds 8 m a side)
  faceBrg: 190,                   // the front faces bearing 190° (SSW): between downtown (155°) and Ready Athletics (229°); north side sees the mirror image
  fullM: 1609, silentM: 16093,    // sound: full within 1 mi, silent at 10 mi
  markerM: 9000, markerFadeM: 1500, markerDeg: 4, markerR: 600,
  url: 'video/drivein/screen' + '.json',   // fetched no-cache WITHOUT ?v= (the service worker would pin it per build); reel names carry a content hash
};
const D = Math.PI / 180, MI = 1609.344;
/** spatial gain: 1 within fullM, squared raised-cosine fade to 0 at silentM (1 mi 1.00, 3 mi 0.78, 5 mi 0.34, 10 mi 0.00) */
export const driveinGain = d => { if (d <= DRIVEIN.fullM) return 1; if (d >= DRIVEIN.silentM) return 0; const c = .5 * (1 + Math.cos(Math.PI * (d - DRIVEIN.fullM) / (DRIVEIN.silentM - DRIVEIN.fullM))); return c * c };
const dist = (a, b, c, d) => { const y = (c - a) * 111320, x = (d - b) * 111320 * Math.cos(a * D); return Math.hypot(x, y) };
const fmtD = m => m < 1000 ? Math.round(m) + ' m' : (m / MI).toFixed(m < 16 * MI ? 1 : 0) + ' mi · ' + (m / 1000).toFixed(m < 1e4 ? 1 : 0) + ' km';
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.c = c; return t }
export function initDriveIn(parent, toLocal, cam, opts = {}) {
  const C = DRIVEIN, lite = !!opts.lite, enabled = opts.enabled || (() => true), soundWanted = () => localStorage.eearScreenSound === '1';
  const S = { cfg: null, err: null, d: null, dGps: null, gain: 0, playing: false, far: false, clip: null, lastSeek: 0, src: null, ctxOwn: null };
  const root = new THREE.Group(); root.name = 'drivein'; root.userData.layer = 'drivein'; parent.add(root);
  const scr = new THREE.Group(); root.add(scr); scr.rotation.y = Math.PI - C.faceBrg * D;   // +Z (plane normal) -> bearing faceBrg
  // ---- video element (hidden; 'body.eearClean' never hides <video>, so it keeps playing while buttons are hidden) ----
  const v = document.createElement('video'); v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true; v.autoplay = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.id = 'driveinV';
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
  document.body.appendChild(v);
  const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace; vt.minFilter = THREE.LinearFilter; vt.magFilter = THREE.LinearFilter; vt.generateMipmaps = false;
  const picM = new THREE.MeshBasicMaterial({ color: 0x222233, side: THREE.DoubleSide, toneMapped: false });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(C.wM, C.hM), picM); pic.frustumCulled = false; scr.add(pic);
  v.addEventListener('loadeddata', () => { picM.map = vt; picM.color.set(0xffffff); picM.needsUpdate = true });
  // ---- frame: dark box border + warm marquee trim (boxes = same from both sides) ----
  const B = 8, Dp = 5, fm = new THREE.MeshBasicMaterial({ color: 0x1b1026 }), tm = new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false });
  const box = (w, h, d, x, y, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, 0); scr.add(o); return o };
  const W2 = C.wM / 2, H2 = C.hM / 2;
  box(C.wM + 2 * B, B, Dp, 0, H2 + B / 2, fm); box(C.wM + 2 * B, B, Dp, 0, -H2 - B / 2, fm); box(B, C.hM, Dp, -W2 - B / 2, 0, fm); box(B, C.hM, Dp, W2 + B / 2, 0, fm);
  const t = 1.6; box(C.wM + 2 * t, t, Dp + .6, 0, H2 + t / 2, tm); box(C.wM + 2 * t, t, Dp + .6, 0, -H2 - t / 2, tm); box(t, C.hM, Dp + .6, -W2 - t / 2, 0, tm); box(t, C.hM, Dp + .6, W2 + t / 2, 0, tm);
  box(C.wM + 2 * B + 4, 2.4, Dp + 1, 0, H2 + B + 1.2, tm); box(C.wM + 2 * B + 4, 2.4, Dp + 1, 0, -H2 - B - 1.2, tm);
  // marquee: readable from both sides (two back-to-back single-sided planes)
  const mq = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#12081c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffc860'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? '#fff3c0' : '#ffb030'; g.beginPath(); g.arc(24 + i * 37.9, 14, 5, 0, 7); g.fill(); g.beginPath(); g.arc(24 + i * 37.9, h - 14, 5, 0, 7); g.fill() }
    g.fillStyle = '#ffd77a'; g.font = 'bold 66px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff9a00'; g.shadowBlur = 18; g.fillText('★  MATT READY DRIVE-IN  ★', w / 2, h / 2 + 3) });
  const mqM = new THREE.MeshBasicMaterial({ map: mq, toneMapped: false }), mqW = 240, mqH = mqW / 8, mqY = H2 + B + 2.4 + mqH / 2 + 2;
  for (const s of [0, 1]) { const o = new THREE.Mesh(new THREE.PlaneGeometry(mqW, mqH), mqM); o.position.set(0, mqY, s ? -.4 : .4); o.rotation.y = s * Math.PI; scr.add(o) }
  box(mqW + 4, mqH + 4, .6, 0, mqY, fm);
  // glow: soft additive halo around the screen (skipped in Lite)
  if (!lite) { const gt = canvasTex(256, 160, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,220,150,.55)'); r.addColorStop(.55, 'rgba(255,170,80,.22)'); r.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h) });
    const gm = new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, opacity: .8 });
    for (const z of [-3.2, 3.2]) { const o = new THREE.Mesh(new THREE.PlaneGeometry(C.wM * 1.6, C.hM * 1.75), gm); o.position.z = z; o.renderOrder = -1; scr.add(o) } }
  // ---- far marker: fixed angular size billboard in the screen's direction ----
  const mk = new THREE.Group(); mk.visible = false; mk.renderOrder = 999; root.add(mk);
  let mkTxt = ''; const mkT = canvasTex(512, 320, () => { }); mkT.minFilter = THREE.LinearFilter;
  const drawMk = txt => { const c = mkT.userData.c, g = c.getContext('2d'), w = c.width, h = c.height; g.clearRect(0, 0, w, h); g.textAlign = 'left';
    g.fillStyle = 'rgba(18,8,28,.82)'; g.strokeStyle = '#ffc860'; g.lineWidth = 8; const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath() };
    rr(16, 16, w - 32, 200, 28); g.fill(); g.stroke();
    g.fillStyle = '#ffd77a'; g.fillRect(44, 44, 120, 74); g.fillStyle = '#12081c'; g.beginPath(); g.moveTo(92, 60); g.lineTo(92, 102); g.lineTo(124, 81); g.closePath(); g.fill();
    g.fillStyle = '#ffd77a'; g.font = 'bold 60px -apple-system,Helvetica,sans-serif'; g.textBaseline = 'middle'; g.fillText('DRIVE-IN', 184, 82);
    g.fillStyle = '#fff'; g.font = '600 40px -apple-system,Helvetica,sans-serif'; g.textAlign = 'center'; g.fillText(txt, w / 2, 172);
    g.fillStyle = '#ffc860'; g.beginPath(); g.moveTo(w / 2 - 44, 226); g.lineTo(w / 2 + 44, 226); g.lineTo(w / 2, 300); g.closePath(); g.fill(); mkT.needsUpdate = true };
  drawMk('');
  const mkM = new THREE.MeshBasicMaterial({ map: mkT, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const mkP = new THREE.Mesh(new THREE.PlaneGeometry(1, 320 / 512), mkM); mkP.position.y = .3125 - 300 / 320 * .625 < 0 ? -(.3125 - 300 / 320 * .625) : 0; mkP.renderOrder = 999; mkP.frustumCulled = false; mk.add(mkP);   // arrow tip ~ at the screen's direction
  // ---- edge-of-view pointer (iPhone/desktop page only) ----
  let edge = null; if (opts.edge) { edge = document.createElement('div'); edge.id = 'driveinPtr';
    edge.style.cssText = 'position:fixed;z-index:25;display:none;pointer-events:none;transform:translate(-50%,-50%);font:600 12px -apple-system,sans-serif;color:#ffd77a;text-align:center;text-shadow:0 1px 3px #000;white-space:nowrap';
    edge.innerHTML = '<div id=driveinArr style="width:0;height:0;margin:0 auto 2px;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:20px solid #ffc860;filter:drop-shadow(0 1px 2px #000)"></div><span></span>'; document.body.appendChild(edge) }
  // ---- config + playback ----
  fetch(opts.url || C.url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }).then(j => {
    S.cfg = j; v.src = new URL(lite ? j.lite : j.main, document.baseURI).href; v.addEventListener('loadedmetadata', () => sync(true), { once: true }); kick() }).catch(e => { S.err = String(e.message || e); console.warn('drivein', e) });
  const srvNow = () => Date.now() + ((window.EEAR_DJ && EEAR_DJ.offsetMs) || 0);
  const target = () => { const c = S.cfg; if (!c) return 0; const dur = v.duration && isFinite(v.duration) ? v.duration : c.duration; return (((srvNow() - c.epoch) / 1000) % dur + dur) % dur };
  function sync(force) { if (!S.cfg || v.readyState < 1 || v.seeking) return; const dur = v.duration || S.cfg.duration, tg = target(); let e = v.currentTime - tg; if (e > dur / 2) e -= dur; if (e < -dur / 2) e += dur;
    if (force || (Math.abs(e) > .8 && performance.now() - S.lastSeek > 4000)) { S.lastSeek = performance.now(); try { v.currentTime = tg } catch (x) { } } }
  function kick() { if (!S.cfg || !S.want) return; const p = v.play(); if (p && p.catch) p.catch(() => { S.blocked = true }) }
  const gesture = () => { if (S.want && (S.blocked || v.paused)) { S.blocked = false; kick(); sync(false) } if (soundWanted() && (v.muted || !g || (ctx && ctx.state !== 'running'))) applySound(true) };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, gesture, { passive: true, capture: true });
  // ---- sound graph ----
  let g = null, pan = null, ctx = null;
  function graph() { if (g) return true; const AU = window.EEAR_AUDIO; ctx = AU && AU.ctx;
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = S.ctxOwn = new AC() }
    try { S.src = ctx.createMediaElementSource(v) } catch (e) { console.warn('drivein audio', e); return false }
    g = ctx.createGain(); g.gain.value = 0; pan = ctx.createPanner(); Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0, maxDistance: 1e7, coneInnerAngle: 360, coneOuterAngle: 360 });
    S.src.connect(g); g.connect(pan); pan.connect(S.ctxOwn ? ctx.destination : (AU.out || ctx.destination)); return true }
  function applySound(on) {   // call from a tap (iOS: unmuting / resuming audio needs a user gesture)
    if (on) { if (!graph()) return; ctx.resume && ctx.resume().catch(() => { }); v.muted = false; kick() } else { v.muted = true; if (g) g.gain.setTargetAtTime(0, ctx.currentTime, .05) } }
  const camW = new THREE.Vector3(), scrW = new THREE.Vector3(), q = new THREE.Quaternion(), ndc = new THREE.Vector3(); let lastA = 0, lastS = 0, lastP = 0;
  function frame() {
    const now = performance.now(), on = !!enabled(); root.visible = on;
    if (!on) { if (!v.paused) v.pause(); S.want = false; if (edge) edge.style.display = 'none'; if (g) g.gain.value = 0; return }
    if (now - lastP > 500) { lastP = now; const o = toLocal(C.lat, C.lon); if (o) scr.position.set(o.x, o.y + C.altM, o.z) }
    cam.getWorldPosition(camW); parent.worldToLocal(camW); const d3 = camW.distanceTo(scr.position); S.d = d3;
    // far marker (fixed angular size, always in the screen's direction)
    const far = d3 > C.markerM - C.markerFadeM; S.far = d3 > C.markerM; mk.visible = far; pic.visible = d3 < 60000;
    if (far) { const R = C.markerR, k = Math.min(1, (d3 - (C.markerM - C.markerFadeM)) / C.markerFadeM); mkM.opacity = k;
      scrW.copy(scr.position).sub(camW).normalize(); mk.position.copy(camW).addScaledVector(scrW, R);
      cam.getWorldQuaternion(q); const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq); mk.quaternion.copy(pq.invert().multiply(q));
      const s = 2 * R * Math.tan(C.markerDeg * D / 2) / (320 / 512) * 1.6; mk.scale.setScalar(s);
      const txt = fmtD(d3); if (txt !== mkTxt) { mkTxt = txt; drawMk(txt) } }
    if (edge) { let show = false; if (S.far && !(window.EEAR && EEAR.ren && EEAR.ren.xr && EEAR.ren.xr.isPresenting)) { ndc.copy(scr.position); parent.localToWorld(ndc); ndc.project(cam);
        const behind = ndc.z > 1, inside = !behind && Math.abs(ndc.x) < .95 && Math.abs(ndc.y) < .92;
        if (!inside) { let x = ndc.x, y = ndc.y; if (behind) { x = -x; y = -y; if (Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) y = -1 } const m = Math.max(Math.abs(x) / .9, Math.abs(y) / .85); x /= m; y /= m;
          edge.style.left = ((x + 1) / 2 * innerWidth) + 'px'; edge.style.top = ((1 - y) / 2 * innerHeight) + 'px'; edge.firstChild.style.transform = 'rotate(' + (Math.atan2(x, y) / D) + 'deg)'; edge.lastChild.textContent = '🎬 Drive-in ' + fmtD(d3).split(' · ')[0]; show = true } }
      edge.style.display = show ? 'block' : 'none' }
    // playback: keep running while it could be seen or heard (pause far away to save battery)
    const want = d3 < 60000 || (soundWanted() && (S.dGps || d3) < C.silentM); if (want !== S.want) { S.want = want; if (want) { kick(); sync(true) } else v.pause() }
    if (now - lastS > 2000) { lastS = now; if (S.want) { if (v.paused && !S.blocked) kick(); sync(false) } const c = S.cfg; if (c) { const tg = target(); S.clip = c.clips.find(x => tg >= x.start && tg < x.start + x.dur) || c.clips[c.clips.length - 1] } }
    // spatial sound (throttled 10 Hz)
    if (now - lastA > 100) { lastA = now; const AU = window.EEAR_AUDIO, L = AU && AU.listener; let dd = d3, e = scr.position.x - camW.x, n = -(scr.position.z - camW.z), u = scr.position.y - camW.y;
      if (L && L.lat != null && !(window.FLY && FLY.alt > .5)) { const h = dist(L.lat, L.lon, C.lat, C.lon); e = (C.lon - L.lon) * 111320 * Math.cos(L.lat * D); n = (C.lat - L.lat) * 111320; u = C.altM - (L.alt || 0) - 1.6; dd = Math.hypot(h, u); S.dGps = dd }
      const sw = soundWanted(); S.gain = sw ? driveinGain(dd) : 0;
      if (g && ctx) { const tt = ctx.currentTime; g.gain.setTargetAtTime(S.gain * (opts.level || .9), tt, .25);
        if (pan.positionX) { pan.positionX.setTargetAtTime(e, tt, .1); pan.positionY.setTargetAtTime(u, tt, .1); pan.positionZ.setTargetAtTime(-n, tt, .1) } else pan.setPosition(e, u, -n);
        if (!(AU && AU.on) && L && L.hdg != null) { const hh = L.hdg * D, l = ctx.listener, f = [Math.sin(hh), 0, -Math.cos(hh)]; if (l.forwardX) { l.forwardX.setTargetAtTime(f[0], tt, .1); l.forwardY.setTargetAtTime(0, tt, .1); l.forwardZ.setTargetAtTime(f[2], tt, .1); l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0 } else l.setOrientation(f[0], 0, f[2], 0, 1, 0) } }
      if (!sw && !v.muted) v.muted = true }
  }
  const api = {
    update() { try { frame() } catch (e) { if (!S.ferr) { S.ferr = 1; console.warn('drivein frame', e) } } },
    setSound(on) { localStorage.eearScreenSound = on ? '1' : '0'; applySound(!!on); window.dispatchEvent(new Event('eear:screensound')) },
    get sound() { return soundWanted() }, get state() { return { dist: S.d && Math.round(S.d), distGps: S.dGps && Math.round(S.dGps), gain: +S.gain.toFixed(3), far: S.far, playing: !v.paused, muted: v.muted, t: +v.currentTime.toFixed(2), target: S.cfg ? +target().toFixed(2) : null, clip: S.clip && S.clip.title, src: v.currentSrc, err: S.err, ready: v.readyState, lite } },
    gain: driveinGain, cfg: () => S.cfg, root, video: v, C,
  };
  window.EEAR_DRIVEIN = api; return api;
}
