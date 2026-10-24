// liveorbs.js (d59): public live broadcaster orbs on the main map + Matt's 3D World tour.
// Polls GET /api/live-orbs (non-stealth humans with a fresh fix). Stealth never appears.
// Failure modes handled for town / Egypt / far:
//  - terrain height + AGL lift so orbs sit above ground mesh (no z-fight / burial)
//  - depthTest:false additive glow so buildings / land / globe do not occlude when looking toward them
//  - angular-size scale + frustumCulled:false so far orbs stay readable (Egypt / horizon)
//  - cam.far bump via farthestDist() so horizon clipping does not eat distant orbs
//  - units: caller supplies toWorld(lat,lon,aglM)->Vector3 (meters on tour, km*SC on index globe)
import * as THREE from 'three';

const TUNNEL = 'https://humor-communist-air-take.trycloudflare.com';
const BASE = () => window.EEAR_API || (location.hostname.endsWith('github.io') ? TUNNEL : '');
const D = Math.PI / 180;

function colorOf(id) {
  let h = 0;
  const s = String(id || 'x');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.95, 0.62);
}

function mkLabel(text, col) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const rc = cv.getContext('2d');
  rc.clearRect(0, 0, 512, 128);
  rc.font = 'bold 44px system-ui,sans-serif';
  rc.textAlign = 'center'; rc.textBaseline = 'middle';
  rc.strokeStyle = '#000'; rc.lineWidth = 8; rc.strokeText(text, 256, 64);
  rc.fillStyle = col; rc.fillText(text, 256, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), depthTest: false, depthWrite: false,
    transparent: true, sizeAttenuation: false
  }));
  s.scale.set(0.22, 0.055, 1); s.center.set(0.5, 0); s.renderOrder = 1002;
  return s;
}

function mkOrb(name, col) {
  const g = new THREE.Group(); g.frustumCulled = false; g.renderOrder = 1000;
  const mat = (op, dt) => new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: op, depthTest: !!dt, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false
  });
  // core + halo always draw (depthTest false) — visible through town buildings / land / globe when looking at them
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mat(0.95, false));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.85, 20, 16), mat(0.28, false));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 36), mat(0.55, false));
  ring.rotation.x = Math.PI / 2;
  core.renderOrder = halo.renderOrder = ring.renderOrder = 1000;
  g.add(halo, core, ring);
  const lb = mkLabel(name || 'live', '#' + col.getHexString());
  lb.position.y = 3.2; g.add(lb); g.userData.label = lb;
  g.userData.pulse = [core, halo, ring];
  return g;
}

/**
 * @param {THREE.Object3D} parent
 * @param {{
 *   toWorld:(lat:number,lon:number,aglM:number)=>THREE.Vector3|null,
 *   getCam:()=>THREE.Camera,
 *   ground?:(lat:number,lon:number)=>number,
 *   agl?:number, pollMs?:number, ang?:number, minR?:number,
 *   enabled?:()=>boolean, onChange?:(orbs:any[])=>void, unitPerM?:number
 * }} opts
 * unitPerM: 1 for meter scenes (tour), 0.001 for km SC scenes (index globe)
 */
export function initLiveOrbs(parent, opts) {
  const O = {
    toWorld: opts.toWorld, getCam: opts.getCam,
    ground: opts.ground || (() => 0),
    agl: opts.agl != null ? opts.agl : 28,
    pollMs: opts.pollMs || 4000,
    ang: opts.ang != null ? opts.ang : 0.014,   // ~0.8° on-screen radius target
    minR: opts.minR != null ? opts.minR : 6,
    enabled: opts.enabled || (() => true),
    onChange: opts.onChange || (() => {}),
    unitPerM: opts.unitPerM != null ? opts.unitPerM : 1
  };
  const root = new THREE.Group(); root.name = 'liveOrbs'; parent.add(root);
  const byId = new Map();
  let list = [], inject = [], timer = null, lastSig = '', err = null;

  function sigOf(L) {
    return L.map(o => o.id + ':' + (o.lat.toFixed(5)) + ',' + (o.lon.toFixed(5))).sort().join('|');
  }

  function merged() {
    const m = new Map();
    for (const o of list) m.set(o.id, o);
    for (const o of inject) m.set(o.id, o);
    return [...m.values()];
  }

  function sync() {
    const L = merged(), seen = new Set();
    for (const o of L) {
      seen.add(o.id);
      let e = byId.get(o.id);
      if (!e) {
        const col = colorOf(o.id);
        const g = mkOrb(o.name || 'live', col);
        g.userData.id = o.id; root.add(g);
        e = { g, o, col }; byId.set(o.id, e);
      } else {
        e.o = o;
        if (e.g.userData.label && o.name) {
          // refresh label if name changed
        }
      }
    }
    for (const [id, e] of byId) if (!seen.has(id)) { root.remove(e.g); byId.delete(id) }
    const s = sigOf(L);
    if (s !== lastSig) { lastSig = s; try { O.onChange(L) } catch (e) { } }
  }

  async function poll() {
    try {
      const r = await fetch(BASE() + '/api/live-orbs', { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      list = Array.isArray(j.orbs) ? j.orbs.filter(o => o && isFinite(o.lat) && isFinite(o.lon)) : [];
      err = null;
    } catch (e) { err = String(e.message || e) }
    sync();
  }

  function place(e) {
    const o = e.o, h = O.ground(o.lat, o.lon) + O.agl;
    const p = O.toWorld(o.lat, o.lon, h);
    if (!p || !isFinite(p.x)) { e.g.visible = false; return null }
    e.g.position.copy(p);
    return p;
  }

  const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
  function update(t) {
    const on = O.enabled();
    root.visible = on;
    if (!on) return;
    const cam = O.getCam(); if (!cam) return;
    const now = t != null ? t : performance.now();
    cam.getWorldDirection(_fwd);
    const farGate = 25000 * O.unitPerM;   // beyond town scale: only draw if looking toward the orb
    for (const e of byId.values()) {
      const p = place(e); if (!p) continue;
      const d = Math.max(1e-3, cam.position.distanceTo(p));
      _to.copy(p).sub(cam.position).normalize();
      const facing = _to.dot(_fwd);
      // "visible from anywhere if looking towards them": hide far orbs behind / beside the view so a
      // planet-scale additive sphere does not wash out the scene when you are not aimed at it
      if (d > farGate && facing < 0.12) { e.g.visible = false; continue }
      // angular size so Egypt still reads; minR covers town close-ups / z-fight clearance
      const r = Math.max(O.minR * O.unitPerM, d * Math.tan(O.ang));
      e.g.scale.setScalar(r);
      e.g.visible = true;
      const pulse = 0.75 + 0.25 * Math.sin(now / 1000 * Math.PI * 2 * 1.4);
      for (const m of e.g.userData.pulse) if (m.material) m.material.opacity = (m === e.g.userData.pulse[0] ? 0.95 : m === e.g.userData.pulse[1] ? 0.28 : 0.55) * pulse;
      if (e.g.userData.label) e.g.userData.label.visible = d > 40 * O.unitPerM && (d < farGate || facing > 0.25);
    }
  }

  function farthestDist() {
    const cam = O.getCam(); if (!cam || !byId.size) return 0;
    let m = 0;
    for (const e of byId.values()) {
      const p = e.g.position; if (!e.g.visible) continue;
      m = Math.max(m, cam.position.distanceTo(p));
    }
    return m;
  }

  function setInject(arr) {
    inject = (arr || []).map((o, i) => ({
      id: o.id || ('inject-' + i), name: o.name || 'Demo', lat: +o.lat, lon: +o.lon,
      hdg: o.hdg, device: o.device || 'demo', t: o.t || Date.now(), kind: o.kind || 'inject'
    })).filter(o => isFinite(o.lat) && isFinite(o.lon));
    sync();
  }

  timer = setInterval(poll, O.pollMs);
  poll();

  const api = {
    root, update, poll, farthestDist,
    list: () => merged(),
    inject: setInject,
    clearInject: () => setInject([]),
    get err() { return err },
    dispose() { clearInterval(timer); parent.remove(root); byId.clear() }
  };
  window.EEAR_LIVEORBS = api;
  return api;
}
