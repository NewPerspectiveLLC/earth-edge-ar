// Performer bots for Earth Edge AR: singer bots that rise in at Matt's Meditation Garden whenever a track with vocals plays.
// Track metadata: { id, singers:[{id,name}] }. No singers (instrumentals like 'disco') -> no performers (Ren just dances).
// One bot per singer, between the circle's cushions on a ~3 m arc around the Garden pillar, facing outward toward the player.
// They DANCE on the shared beat grid (beat.js, same engine as Ren): per-song choreography saved per singer under
// trackId + '--' + singerId via /api/ren/dance. Lip-sync + mic/hand gestures follow the 300 Hz-3 kHz vocal band.
// Matt Ready gets the full engine: 36-move library, planted-foot leg IK (pinned support feet, auto re-plant steps),
// arm IK, spring-blended transitions, phrase-aware choice, 8th/16th timing with anticipation + follow-through, an always-on
// foot-tap layer and hand-gesture layer (snaps on 2 & 4, points, open palms, flourishes, mic gestures), articulated gloves,
// and secondary motion on tails / hat / bow tie. Other singers use a simpler library and no extra layers.
import * as THREE from 'three';
import * as BEAT from './beat.js?v=1792190990688';

export const GARDEN = { lat: 48.1316475, lon: -122.7992293, name: "Matt's Meditation Garden" };
const PI = Math.PI, TAU = 2 * PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const easeBack = t => { const c = 1.2; return t < .5 ? ((2 * t) ** 2 * ((c + 1) * 2 * t - c)) / 2 : ((2 * t - 2) ** 2 * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; };
const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

let ENV = null;
function envTexture() {
  if (ENV) return ENV; const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#d9ccff'); gr.addColorStop(.35, '#ffffff'); gr.addColorStop(.5, '#bff8f0'); gr.addColorStop(.56, '#6b5a8f'); gr.addColorStop(1, '#1c1430');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128); g.fillStyle = '#fff'; g.fillRect(40, 18, 46, 22); g.fillRect(170, 26, 30, 14); g.fillStyle = '#c9a6ff'; g.fillRect(110, 40, 40, 8);
  ENV = new THREE.CanvasTexture(c); ENV.mapping = THREE.EquirectangularReflectionMapping; ENV.colorSpace = THREE.SRGBColorSpace; return ENV;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function makeLabel(text, accent = '#b37bff') {
  const c = document.createElement('canvas'), g = c.getContext('2d'); const F = '700 58px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; g.font = F;
  const w = Math.ceil(g.measureText(text).width) + 110; c.width = w; c.height = 128; g.font = F;
  roundRect(g, 6, 14, w - 12, 100, 50); g.fillStyle = 'rgba(24,10,44,.82)'; g.fill(); g.lineWidth = 6; g.strokeStyle = accent; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 67);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false })); s.renderOrder = 1000; s.userData.aspect = w / 128; return s;
}
function glowSprite(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const col = new THREE.Color(color), rgb = `${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0}`; r.addColorStop(0, `rgba(${rgb},.9)`); r.addColorStop(.4, `rgba(${rgb},.35)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: .3 })); s.scale.setScalar(size); return s;
}
const hueOf = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 360) / 360; };

// ---------------------------------------------------------------- rig
const THIGH = .44, SHIN = .44, ANKLE_Y = .072, PELVIS_Y = .95, HIPJ = [.1, -.02];
const UPPER = .33, FORE = .31;
/**
 * makePerformerBot(opts) -> { group, rig, height }   (default builder; registerSinger builders can call it)
 * opts: { name, coat, coatSheen, trousers, shoes:'silver'|'black', hat:'top'|'beret'|null, hatColor, tails, bow, height (m), accent, detail:'full'|'simple' }
 */
export function makePerformerBot(o = {}) {
  const env = envTexture(), full = o.detail !== 'simple';
  const coatC = new THREE.Color(o.coat ?? 0x6a1fb8);
  const velvet = new THREE.MeshPhysicalMaterial({ color: coatC, roughness: .85, metalness: 0, sheen: 1, sheenRoughness: .35, sheenColor: new THREE.Color(o.coatSheen ?? 0xd8a8ff), envMap: env, envMapIntensity: .8, emissive: coatC.clone().multiplyScalar(.35), emissiveIntensity: .6 });
  const satin = new THREE.MeshPhysicalMaterial({ color: coatC.clone().multiplyScalar(.55), roughness: .25, clearcoat: .6, envMap: env, emissive: coatC.clone().multiplyScalar(.2), emissiveIntensity: .6, side: THREE.DoubleSide });
  const pants = new THREE.MeshPhysicalMaterial({ color: o.trousers ?? 0x1a1026, roughness: .7, sheen: .6, sheenColor: new THREE.Color(0x7a4fb0), envMap: env, emissive: 0x0c0614, emissiveIntensity: .6 });
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf4f1fb, roughness: .28, clearcoat: 1, clearcoatRoughness: .12, envMap: env, envMapIntensity: 1.25, emissive: 0x2a2140, emissiveIntensity: .35 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .5, envMap: env, emissive: 0x3a3448, emissiveIntensity: .5 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0b0a10, roughness: .2, clearcoat: 1, envMap: env, emissive: 0x050308, emissiveIntensity: .5 });
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xa9b1c2, metalness: 1, roughness: .18, envMap: env, envMapIntensity: 1.6, emissive: 0x30323a, emissiveIntensity: .4 });
  const screen = new THREE.MeshPhysicalMaterial({ color: 0x0a0d22, roughness: .08, clearcoat: 1, envMap: env, envMapIntensity: .9, emissive: 0x0d1b46, emissiveIntensity: .6 });
  const glowM = new THREE.MeshBasicMaterial({ color: o.accent ?? 0x2ff5df, transparent: true });
  const mats = { velvet, satin, pants, shell, white, black, silver, screen, glowM };
  const k = (o.height ?? 1.95) / 1.95;
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body); body.scale.setScalar(k);
  const rig = { body, mats, glow: [], k, full };
  const add = (p, g, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); p.add(me); return me; };
  const pelvis = new THREE.Group(); pelvis.position.y = PELVIS_Y; pelvis.rotation.order = 'YXZ'; body.add(pelvis); rig.pelvis = pelvis;
  add(pelvis, new THREE.SphereGeometry(.19, 20, 12), pants, 0, .02, 0).scale.set(1, .5, .8);
  rig.legs = [];
  for (const s of [1, -1]) {
    const thigh = new THREE.Group(), shin = new THREE.Group(), foot = new THREE.Group(); body.add(thigh, shin, foot);
    add(thigh, new THREE.CapsuleGeometry(.07, THIGH - .1, 4, 12), pants, 0, -THIGH / 2, 0);
    add(shin, new THREE.SphereGeometry(.066, 12, 8), pants);
    add(shin, new THREE.CapsuleGeometry(.062, SHIN - .08, 4, 12), pants, 0, -SHIN / 2, 0);
    add(foot, new THREE.CylinderGeometry(.064, .07, .05, 12), black, 0, .012, 0);
    const shoe = add(foot, new THREE.SphereGeometry(.1, 20, 12), o.shoes === 'black' ? black : silver, 0, -.034, .05); shoe.scale.set(.62, .38, 1.3);
    add(foot, new THREE.BoxGeometry(.11, .014, .25), black, 0, -.066, .045);
    add(foot, new THREE.BoxGeometry(.085, .03, .055), black, 0, -.052, -.06);
    if (full) add(foot, new THREE.TorusGeometry(.045, .006, 5, 16, PI), glowM, 0, -.012, .135).rotation.x = -PI / 2;
    rig.legs.push({ s, thigh, shin, foot });
  }
  const torso = new THREE.Group(); torso.position.y = .02; torso.rotation.order = 'YXZ'; pelvis.add(torso); rig.torso = torso;
  const prof = [[.15, 0], [.17, .06], [.165, .18], [.19, .32], [.215, .45], [.2, .53], [.12, .58]].map(([r, y]) => new THREE.Vector2(r, y));
  add(torso, new THREE.LatheGeometry(prof, 28), velvet).scale.z = .8;
  const front = new THREE.Shape(); front.moveTo(-.095, .55); front.lineTo(.095, .55); front.lineTo(0, .13); front.closePath();
  add(torso, new THREE.ShapeGeometry(front), white, 0, 0, .182).rotation.x = -.1;
  for (const s of [1, -1]) { const L = new THREE.Shape(); L.moveTo(s * .095, .55); L.lineTo(s * .175, .5); L.lineTo(s * .03, .15); L.lineTo(0, .13); L.closePath(); const m = add(torso, new THREE.ShapeGeometry(L), satin, 0, 0, .186); m.rotation.x = -.1; m.rotation.y = s * .25; }
  for (const y of [.11, .05]) add(torso, new THREE.SphereGeometry(.016, 8, 6), silver, 0, y, .16);
  if (o.bow !== false) { const bow = new THREE.Group(); bow.position.set(0, .545, .17); torso.add(bow); rig.bow = bow;
    for (const s of [1, -1]) { const c = add(bow, new THREE.ConeGeometry(.034, .075, 4), black, s * .035, 0, 0); c.rotation.z = s * PI / 2; c.scale.z = .45; }
    add(bow, new THREE.SphereGeometry(.018, 8, 6), black); }
  if (o.tails) { rig.tails = [];
    for (const s of [1, -1]) { const piv = new THREE.Group(); piv.position.set(s * .07, .08, -.12); torso.add(piv);
      const sh = new THREE.Shape(); sh.moveTo(-.075, 0); sh.lineTo(.075, 0); sh.lineTo(.05 + s * .02, -.55); sh.lineTo(s * .03, -.62); sh.lineTo(-.03 + s * .01, -.5); sh.closePath();
      add(piv, new THREE.ExtrudeGeometry(sh, { depth: .02, bevelEnabled: false }), velvet).rotation.x = .1; rig.tails.push(piv); } }
  const mkArm = s => {
    const sh = new THREE.Group(); sh.position.set(s * .225, .5, 0); torso.add(sh);
    add(sh, new THREE.SphereGeometry(.07, 14, 10), velvet); add(sh, new THREE.CapsuleGeometry(.05, .24, 4, 10), velvet, 0, -.165, 0);
    const el = new THREE.Group(); el.position.y = -UPPER; sh.add(el);
    add(el, new THREE.CapsuleGeometry(.045, .22, 4, 10), velvet, 0, -.14, 0);
    add(el, new THREE.CylinderGeometry(.05, .05, .035, 14), white, 0, -.275, 0);
    const wr = new THREE.Group(); wr.position.y = -FORE; wr.rotation.order = 'YXZ'; el.add(wr); wr.scale.setScalar(full ? 1.25 : 1.1);
    const palm = add(wr, new THREE.SphereGeometry(.046, 12, 10), white, 0, -.045, 0); palm.scale.set(.6, 1, 1.05);
    const fingers = [];
    if (full) {
      [.03, .01, -.01, -.028].forEach((z, i) => { const f1 = new THREE.Group(); f1.position.set(0, -.083, z); wr.add(f1);
        add(f1, new THREE.CapsuleGeometry(.0125, .022, 2, 6), white, 0, -.02, 0); const f2 = new THREE.Group(); f2.position.y = -.04; f1.add(f2);
        add(f2, new THREE.CapsuleGeometry(.0115, .016 - i * .001, 2, 6), white, 0, -.017, 0); fingers.push([f1, f2]); });
      const t1 = new THREE.Group(); t1.position.set(-s * .012, -.03, .042); t1.rotation.set(-.9, 0, 0); wr.add(t1);
      add(t1, new THREE.CapsuleGeometry(.014, .02, 2, 6), white, 0, -.018, 0); const t2 = new THREE.Group(); t2.position.y = -.036; t1.add(t2);
      add(t2, new THREE.CapsuleGeometry(.013, .014, 2, 6), white, 0, -.015, 0); fingers.unshift([t1, t2]);
    } else { add(wr, new THREE.SphereGeometry(.04, 10, 8), white, 0, -.09, 0).scale.set(.7, 1, 1); }
    return { s, sh, el, wr, fingers };
  };
  rig.armL = mkArm(1); rig.armR = mkArm(-1);
  const mic = new THREE.Group(); mic.position.set(0, -.07, .03); mic.rotation.set(-1.45, 0, 0); rig.armR.wr.add(mic); rig.mic = mic;
  add(mic, new THREE.CylinderGeometry(.013, .009, .14, 10), silver, 0, .05, 0); add(mic, new THREE.SphereGeometry(.03, 14, 10), black, 0, .14, 0);
  rig.glow.push(add(mic, new THREE.TorusGeometry(.026, .005, 6, 18), glowM, 0, .118, 0)); rig.glow[0].rotation.x = PI / 2;
  add(torso, new THREE.CylinderGeometry(.05, .065, .09, 14), black, 0, .62, 0);
  const head = new THREE.Group(); head.position.y = .82; head.rotation.order = 'YXZ'; torso.add(head); rig.head = head;
  const HR = .17, SX = 1.05, SY = 1.18; add(head, new THREE.SphereGeometry(HR, 30, 20), shell).scale.set(SX, SY, 1);
  add(head, new THREE.SphereGeometry(HR * 1.012, 30, 18, .6, PI - 1.2, PI * .5 - .72, 1.42), screen).scale.set(SX, SY, 1);
  const fz = (x, y) => HR * 1.012 * Math.sqrt(Math.max(0, 1 - (x / (HR * 1.012 * SX)) ** 2 - (y / (HR * 1.012 * SY)) ** 2)) + .005;
  const onFace = (m, x, y) => { m.position.set(x, y, fz(x, y)); m.lookAt(m.position.clone().multiplyScalar(2)); return m; };
  rig.eyes = [];
  for (const s of [1, -1]) {
    const e = onFace(add(head, new THREE.CircleGeometry(.03, 18), glowM), s * .062, .03); e.scale.set(1.05, 1, 1); rig.eyes.push(e);
    const lid = onFace(add(head, new THREE.CircleGeometry(.035, 18, 0, PI), screen), s * .062, .042); lid.position.z += .002; lid.scale.set(1, .42, 1);
    const by = .082 + (s > 0 ? .012 : 0), bc = new THREE.CatmullRomCurve3([-1, 0, 1].map(t => { const x = s * .06 + t * .03, y = by + (1 - t * t) * .008 + (s > 0 ? t * .006 : -t * .004); return new THREE.Vector3(x, y, fz(x, y)); }));
    add(head, new THREE.TubeGeometry(bc, 8, .006, 5), glowM);
  }
  const smP = [[-.05, -.058], [-.018, -.07], [.018, -.07], [.048, -.06], [.07, -.04]].map(([x, y]) => new THREE.Vector3(x, y, fz(x, y)));
  rig.smirk = add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smP), 14, .0085, 5), glowM);
  rig.mouth = onFace(add(head, new THREE.CircleGeometry(.03, 20), glowM), .005, -.07); rig.mouth.visible = false;
  rig.hatSocket = { pos: new THREE.Vector3(.015, HR * SY * .86, -.01), rot: new THREE.Euler(-.05, 0, -.1) };
  if (o.hat === 'top') { const hatM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(o.hatColor ?? o.coat ?? 0x6a1fb8), roughness: .8, sheen: 1, sheenRoughness: .3, sheenColor: new THREE.Color(0xe0b8ff), envMap: env, emissive: coatC.clone().multiplyScalar(.35), emissiveIntensity: .6 });
    const hat = new THREE.Group(); body.add(hat); rig.hat = hat;
    add(hat, new THREE.CylinderGeometry(.205, .205, .014, 28), hatM); add(hat, new THREE.CylinderGeometry(.13, .12, .25, 26), hatM, 0, .13, 0);
    add(hat, new THREE.CylinderGeometry(.122, .122, .045, 26), black, 0, .035, 0);
    const ring = add(hat, new THREE.TorusGeometry(.124, .005, 5, 30), glowM, 0, .06, 0); ring.rotation.x = PI / 2; rig.glow.push(ring); }
  else if (o.hat === 'beret') { const bm = new THREE.MeshPhysicalMaterial({ color: coatC, roughness: .8, sheen: 1, envMap: env, emissive: coatC.clone().multiplyScalar(.3) });
    const b = add(head, new THREE.SphereGeometry(.15, 20, 10), bm, .03, HR * SY * .85, 0); b.scale.set(1.1, .35, 1.1); b.rotation.z = -.25; }
  const footGlow = glowSprite(o.accent ?? 0x2ff5df, 1.1); footGlow.position.y = .05; body.add(footGlow); rig.footGlow = footGlow;
  return { group, rig, height: (o.hat === 'top' ? 2.2 : 1.95) * k };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const DOWN = new THREE.Vector3(0, -1, 0);
function kneeOf(H, A, l1, l2, pole, out) {
  _a.subVectors(A, H); const L = Math.max(_a.length(), 1e-4), Lc = clamp(L, .05, (l1 + l2) * .999); _a.multiplyScalar(1 / L);
  const x = (l1 * l1 - l2 * l2 + Lc * Lc) / (2 * Lc), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a)); if (_b.lengthSq() < 1e-6) _b.set(0, 0, 1); _b.normalize();
  return out.copy(H).addScaledVector(_a, x).addScaledVector(_b, h);
}
function aim(obj, from, to, pole) {
  _c.subVectors(from, to).normalize(); _d.copy(pole).addScaledVector(_c, -pole.dot(_c)); if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1); _d.normalize();
  _b.crossVectors(_c, _d); _m.makeBasis(_b, _c, _d); obj.quaternion.setFromRotationMatrix(_m);
}
function spr(s, target, dt, w, z) { const n = Math.min(8, Math.ceil(dt * w / .25)) || 1, h = dt / n; for (let i = 0; i < n; i++) { s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h; } return s.x; }
const HP = { relax: [.35, .3, .35, .42, .48, .05], open: [0, 0, 0, 0, 0, .4], point: [.75, 0, 1, 1, 1, 0], fist: [.85, 1, 1, 1, 1, 0], snapPre: [.65, .3, .6, 1, 1, 0],
  snapRel: [.2, .25, 1, 1, 1, 0], mic: [.75, .92, .92, .92, .92, 0], pinch: [.6, .62, .3, .2, .12, .1], jazz: [0, 0, 0, 0, 0, .7], flourish: [0, .1, .2, .3, .4, .5] };

// ---------------------------------------------------------------- move library
// A move: { len (beats), travel [dx,dz] (anchor delta, unmirrored), fam, noMirror, f(t, i, v) -> partial pose }
// Pose: feet L/R {x,z,y,c(0 air/1 planted/2 slide),yo(toe-out),ry(abs yaw),ph(toe lift about heel),pt(heel lift about ball)},
//  w (0 weight on L .. 1 on R), bend, hx/hz/hy, hyaw/hroll/hpitch (pelvis), tyaw/troll/tpitch (torso), hdy/hdp/hdr (head),
//  aL/aR {t:[out,y,z] torso-space hand target (x outward), p:[pole], h:'handPose', wr:[x,y,z]}, gL (gesture weight), mic (mic-to-mouth weight),
//  hat {w (0 head..1 hand), tilt, lift, spin}, flare (tails), tap ('auto'|'L'|'R'|false), kneeL/kneeR (knee wobble), bow (tie tug)
const FL = [.12, 0], FR = [-.12, 0];
function seq(t, from, keys, base) {
  let p = from, aft = null;
  for (const k of keys) { const [t0, t1, to, l = .08, sh = 'arc', af] = k;
    if (t < t0) break;
    if (t < t1) { const u = (t - t0) / (t1 - t0), e = sh === 'slide' ? sstep(0, 1, u) : ease(u); const y = sh === 'up' ? l * Math.sin(PI / 2 * u) : sh === 'down' ? l * Math.cos(PI / 2 * u) : sh === 'slide' ? 0 : l * Math.sin(PI * u);
      const r = { x: lerp(p[0], to[0], e), z: lerp(p[1], to[1], e), y, c: sh === 'slide' ? 2 : (sh === 'up' || sh === 'down') ? (sh === 'down' && u > .97 ? 1 : 0) : (y > .004 ? 0 : 1) };
      for (const o of [base, af && af.during]) if (o) for (const k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }
    p = to; aft = af; }
  const r = { x: p[0], z: p[1], y: 0, c: 1 }; for (const o of [base, aft && aft.after]) if (o) for (const k in o) if (o[k] !== undefined) r[k] = o[k]; return r;
}
const wk = (t, keys) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return lerp(va, vb, sstep(a, b, t)); } return keys[keys.length - 1][1]; };
const acc = d => d < -.25 || d > 1.2 ? 0 : d < 0 ? -.3 * sstep(-.25, -.08, d) * (1 - sstep(-.04, 0, d)) : (1 - Math.exp(-d * 28)) * Math.exp(-d * 3.2) * 1.15;
const bacc = t => { const f = t - Math.floor(t); return f > .75 ? acc(f - 1) : acc(f); };
const A = (x, y, z, h, p, wr) => ({ t: [x, y, z], h, p, wr });
const BRIM = [.07, .99, .2], TIE = [.04, .57, .24], MOUTH = [.05, .74, .25];
const MOVES = {}, def = (id, len, fam, travel, f, x = {}) => { MOVES[id] = { id, len, fam, travel, f, ...x }; };
const W4 = [[0, .5], [.35, 1], [.95, 1], [1.35, 0], [1.95, 0], [2.35, 1], [2.95, 1], [3.35, 0], [4, .5]];

// footwork
def('stepTouch', 4, 'foot', [0, 0], (t, i) => { const R = seq(t, FR, [[0, .42, [-.34, 0]], [3, 3.42, FR, .06]]), L = seq(t, FL, [[1, 1.42, [-.1, .02], .06, 'arc', { after: { pt: .35 } }], [2, 2.42, FL]]);
  const w = wk(t, [[0, .5], [.35, 1], [1.95, 1], [2.35, 0], [3.9, 0], [4, .5]]); return { L, R, w, bend: .05 + .06 * i * bacc(t), hroll: (w - .5) * .14, troll: -(w - .5) * .12, hdr: (w - .5) * .12, tap: false }; });
def('stepTouchFwd', 4, 'foot', [0, 0], (t, i) => { const R = seq(t, FR, [[0, .42, [-.12, .26]], [3, 3.42, FR, .06]]), L = seq(t, FL, [[1, 1.42, [.12, .3], .06, 'arc', { after: { pt: .35 } }], [2, 2.42, FL]]);
  const w = wk(t, [[0, .5], [.35, 1], [1.95, 1], [2.35, 0], [3.9, 0], [4, .5]]); return { L, R, w, hz: wk(t, [[0, 0], [.4, .12], [2, .12], [2.4, 0]]), bend: .05 + .06 * i * bacc(t), tpitch: .06 * bacc(t), tap: false }; });
def('grapevine', 4, 'foot', [-.5, 0], (t, i) => { const R = seq(t, FR, [[0, .4, [-.36, 0]], [2, 2.4, [-.62, 0]]]), L = seq(t, FL, [[1, 1.4, [-.3, -.12]], [3, 3.4, [-.38, 0], .06, 'arc', { after: { pt: .3 } }]]);
  return { L, R, w: wk(t, [[0, .5], [.3, 1], [.95, 1], [1.35, 0], [1.95, 0], [2.35, 1], [4, 1]]), hyaw: -.25 * Math.sin(PI * t / 2), tyaw: .15 * Math.sin(PI * t), bend: .06 + .05 * i * bacc(t), hdy: -.2, tap: false }; });
def('boxStep', 4, 'foot', [0, 0], (t, i) => { const R = seq(t, FR, [[0, .42, [-.12, .25]], [2, 2.42, FR]]), L = seq(t, FL, [[1, 1.42, [.16, .25]], [3, 3.42, FL]]);
  return { L, R, w: wk(t, W4), hz: wk(t, [[0, 0], [.4, .12], [2, .12], [2.4, 0]]), hyaw: .12 * Math.sin(PI * t / 2), bend: .05 + .05 * bacc(t), tap: false }; });
def('jazzSquare', 4, 'foot', [0, 0], (t, i) => { const R = seq(t, FR, [[0, .42, [.04, .16]], [2, 2.42, [-.18, -.06]], [3.5, 3.85, FR, .05]]), L = seq(t, FL, [[1, 1.42, [.16, -.14]], [3, 3.42, FL]]);
  return { L, R, w: wk(t, W4), hyaw: wk(t, [[0, 0], [.4, .35], [1.4, .1], [2.4, -.2], [3.4, 0]]), tyaw: -.1 * Math.sin(PI * t), bend: .06, tap: false }; });
def('kickBallChange', 4, 'foot', [0, 0], (t, i) => { const hk = .24 + .12 * i;
  const R = seq(t, FR, [[0, .3, [-.12, .3], hk, 'up'], [.3, .55, [-.12, -.1], hk, 'down', { after: { pt: .5 } }], [2.9, 3.15, FR, .04]]);
  const L = seq(t, FL, [[.9, 1.15, FL, .04], [2, 2.3, [.12, .3], hk, 'up'], [2.3, 2.55, [.12, -.1], hk, 'down', { after: { pt: .5 } }], [3.5, 3.85, FL, .04]]);
  return { L, R, w: wk(t, [[0, 0], [.5, .3], [.6, 1], [1, 1], [1.2, 0], [1.9, 0], [2.0, 1], [2.6, .7], [3.1, 0], [3.9, .5]]), hy: .03 * Math.sin(PI * (t % 1)), tpitch: -.08 * (t < 2 ? sstep(0, .25, t) * (1 - sstep(.5, .9, t)) : sstep(2, 2.25, t) * (1 - sstep(2.5, 2.9, t))), tap: false }; });
def('charleston', 4, 'foot', [0, 0], (t, i) => { const hk = .22 * (.6 + .4 * i);
  const R = seq(t, FR, [[0, .42, [-.12, .2]], [2.9, 3.3, [-.12, -.34], .12, 'arc', { after: { pt: .5 } }], [3.55, 3.92, FR, .05]]);
  const L = seq(t, FL, [[1, 1.35, [.12, .4], hk, 'up'], [1.35, 1.9, [.12, -.18], hk, 'down'], [3.5, 3.85, FL, .04]]);
  const sw = Math.sin(PI * (t - .5)); return { L, R, w: wk(t, [[0, .5], [.35, 1], [1.9, 1], [2.1, 0], [3.9, 0], [4, .5]]), aL: A(.3, .2 + .15 * sw, .2 + .25 * sw, 'jazz'), aR: A(.3, .2 - .15 * sw, .2 - .25 * sw), mic: .4, gL: .2, bend: .08 + .06 * bacc(t), tpitch: .1 * sw, tap: false }; });
def('chacha', 4, 'foot', [-.2, 0], (t, i) => { const R = seq(t, FR, [[0, .35, [-.12, .22]], [2, 2.3, [-.36, 0]], [3, 3.3, [-.32, 0], .04]]), L = seq(t, FL, [[1, 1.25, FL, .03], [2.5, 2.8, [-.08, 0], .05]]);
  const w = wk(t, [[0, .5], [.3, 1], [.95, 1], [1.2, 0], [1.95, 0], [2.25, 1], [2.45, 1], [2.7, 0], [2.95, 0], [3.25, 1], [4, 1]]); return { L, R, w, hx: (w - .5) * .08, hroll: (w - .5) * .2, troll: -(w - .5) * .12, bend: .06, tap: false }; });
def('shuffleTap', 4, 'foot', [0, 0], (t, i) => { const b = Math.floor(t), u = t - b, side = b % 2 ? 'L' : 'R', H = side === 'L' ? FL : FR;
  const f = seq(u, H, [[0, .2, [H[0], .2], .035], [.2, .45, [H[0], -.06], .035], [.5, .7, H, .05, 'arc', { after: { pt: .2 } }]]), o = { x: (side === 'L' ? FR : FL)[0], z: 0, c: 1 };
  return { L: side === 'L' ? f : o, R: side === 'R' ? f : o, w: side === 'L' ? .1 : .9, hy: .02 * Math.sin(TAU * t * 2), aL: A(.3, .25, .15, 'jazz'), gL: .3, tpitch: .05, hdp: .1, tap: false }; });
def('electricBack', 4, 'foot', [0, -.5], (t, i) => { const R = seq(t, FR, [[0, .4, [-.12, -.18]], [2, 2.4, [-.12, -.5]]]), L = seq(t, FL, [[1, 1.4, [.12, -.36]], [3, 3.4, [.12, -.5], .05, 'arc', { after: { pt: .3 } }]]);
  return { L, R, w: wk(t, [[0, .5], [.3, 1], [.95, 1], [1.35, 0], [1.95, 0], [2.35, 1], [4, 1]]), tpitch: -.05, bend: .07 + .05 * bacc(t), hroll: .08 * Math.sin(PI * t), tap: false }; });
def('walkFwd', 4, 'foot', [0, .5], (t, i) => { const R = seq(t, FR, [[0, .42, [-.12, .22]], [2, 2.42, [-.12, .5]]]), L = seq(t, FL, [[1, 1.42, [.12, .44]], [3, 3.4, [.12, .5], .04]]);
  const w = wk(t, [[0, .5], [.35, 1], [.95, 1], [1.35, 0], [1.95, 0], [2.35, 1], [3.9, .6]]); return { L, R, w, hroll: (w - .5) * .18, tyaw: (w - .5) * .25, hdp: .08 * bacc(t), bend: .04, tap: false }; });
// hips
def('hipSway', 4, 'hips', [0, 0], (t, i) => { const s = Math.sin(PI * t), c = Math.sin(TAU * t); return { L: { x: .17, z: 0, c: 1 }, R: { x: -.17, z: 0, c: 1 }, w: .5 + .35 * s, hx: .07 * s * i, hz: .025 * c, hroll: .14 * s, troll: -.1 * s, hdr: .06 * s, bend: .08 }; });
def('hipPop', 4, 'hips', [0, 0], (t, i) => { const b = Math.floor(t), sg = b % 2 ? -1 : 1, a = bacc(t) * sg; return { L: { x: .16, z: 0, c: 1 }, R: { x: -.16, z: .04, c: 1 }, w: .5 + .35 * a, hx: .08 * a, hroll: .18 * a, troll: -.12 * a, bend: .07, aL: A(.24, .1, .05, 'fist', [1, .2, -.4]), gL: .15, tap: 'R' }; });
def('twist', 4, 'hips', [0, 0], (t, i) => { const s = Math.sin(TAU * t); return { L: { x: .11, z: 0, c: 2, ry: .55 * s }, R: { x: -.11, z: 0, c: 2, ry: .55 * s }, hyaw: .6 * s * (.6 + .4 * i), tyaw: -.45 * s, bend: .16 + .03 * Math.abs(s), aL: A(.3, .3, .2 - .12 * s, 'fist'), aR: A(.3, .3, .2 + .12 * s), mic: .5, gL: .1, tap: false }; });
def('wobbleKnees', 4, 'hips', [0, 0], (t, i) => { const wob = Math.sin(TAU * t * 4) * (.6 + .4 * i); return { L: { x: .16, z: 0, c: 1 }, R: { x: -.16, z: .06, c: 1, pt: .45 }, w: .12, kneeR: wob, hroll: -.1, hx: .04, aL: A(.55, .45, .2, 'jazz'), gL: .25, hdr: .12, tpitch: -.05, tap: false }; });
def('slide', 4, 'hips', [-.4, 0], (t, i) => { const R = seq(t, FR, [[0, .4, [-.52, 0]]]), L = seq(t, FL, [[1, 2.6, [-.28, 0], 0, 'slide']]); return { L, R, w: wk(t, [[0, .5], [.3, .95], [3, .8], [4, .5]]), hroll: -.12 * sstep(0, .4, t), tyaw: .2 * sstep(1, 2.5, t), aL: A(.65, .55, .15, 'open', null, [0, 0, -.6]), gL: .4, bend: .1 * (1 - sstep(1, 2.6, t)) + .04, tap: t > 2.8 ? 'L' : false }; });
def('swivel', 4, 'hips', [-.4, 0], (t, i) => { const n = Math.floor(t * 2), u = t * 2 - n, sw = (n % 2 ? -1 : 1) * Math.sin(PI * u), dx = -.05 * (n + sstep(0, 1, u));
  return { L: { x: .08 + dx, z: 0, c: 2, yo: .1 + .45 * sw }, R: { x: -.08 + dx, z: 0, c: 2, yo: .1 + .45 * sw }, bend: .12 + .03 * Math.sin(TAU * t * 2), hroll: .06 * sw, aL: A(.4, .35, .25, 'jazz'), gL: .3, tap: false }; });
def('strut', 8, 'hips', [0, 0], (t, i) => { const R = seq(t, FR, [[0, .42, [-.12, .25]], [2, 2.42, [-.12, .5]], [5, 5.42, FR]]), L = seq(t, FL, [[1, 1.42, [.12, .5]], [4, 4.42, [.12, .25]], [6, 6.42, FL]]);
  const w = wk(t, [[0, .5], [.35, 1], [.95, 1], [1.35, 0], [1.95, 0], [2.35, 1], [3.9, 1], [4.3, 0], [4.95, 0], [5.35, 1], [5.95, 1], [6.35, 0], [8, .5]]);
  return { L, R, w, hroll: (w - .5) * .22, hx: (w - .5) * .06, tyaw: (w - .5) * .3, hdp: .1 * bacc(t), tap: (t > 3 && t < 4) ? 'L' : (t > 7) ? 'R' : false }; });
// upper body
def('shoulderShimmy', 4, 'upper', [0, 0], (t, i) => { const L = seq(t, FL, [[0, .3, [.27, 0]], [3.5, 3.85, FL, .05]]), R = seq(t, FR, [[.15, .45, [-.27, 0]], [3.6, 3.95, FR, .05]]), sh = Math.sin(TAU * t * 2) * (.6 + .4 * i);
  return { L, R, tyaw: .16 * sh, troll: .04 * sh, bend: .14 + .02 * Math.sin(TAU * t * 4), aL: A(.6, .22, .25, 'jazz'), aR: A(.6, .22, .25), mic: .5, gL: .2, hdp: .1, tap: false }; });
def('pointCrowd', 4, 'upper', [0, 0], (t, i) => { const P = [[.5, .6, .5], [.15, .62, .65], [-.08, .64, .6], [.55, 1.0, .3]], b = Math.floor(t), u = t - b, a = P[b % 4], pv = P[(b + 3) % 4], e = easeBack(clamp(u / .3, 0, 1));
  const R = seq(t, FR, [[0, .35, [-.3, .06], .06, 'arc', { after: { pt: .2 } }], [3.4, 3.8, FR, .05]]);
  return { L: { x: .13, z: 0, c: 1 }, R, w: .25, aL: A(lerp(pv[0], a[0], e), lerp(pv[1], a[1], e), lerp(pv[2], a[2], e), 'point'), gL: 0, hdy: [.35, .05, -.2, .2][b % 4] * e, hx: .05 * bacc(t), hroll: .08 * bacc(t), tap: 'L' }; });
def('discoPoint', 4, 'upper', [0, 0], (t, i) => { const k = sstep(1.8, 2.15, t) - sstep(3.8, 4, t), up = [.55, 1.15, .25], dn = [-.08, -.02, .35];
  const R = seq(t, FR, [[0, .3, [-.32, .06], .05, 'arc', { after: { pt: .3 } }], [1, 1.3, FR, .05], [2, 2.3, [-.32, .06], .05, 'arc', { after: { pt: .3 } }], [3, 3.3, FR, .05]]);
  return { L: { x: .13, z: 0, c: 1 }, R, w: .2, aL: A(lerp(up[0], dn[0], k), lerp(up[1], dn[1], k), lerp(up[2], dn[2], k), 'point'), gL: 0, hroll: lerp(-.1, .1, k), hdy: lerp(.3, -.3, k), hdp: lerp(-.25, .25, k), hx: .04 * Math.sin(PI * t), bend: .06 + .04 * bacc(t) }; });
def('bowTieAdjust', 4, 'upper', [0, 0], (t, i) => { const on = sstep(0, .5, t) * (1 - sstep(2.3, 2.7, t)), wig = t > 1 && t < 2 ? Math.sin(TAU * t * 4) : 0;
  return { aL: on > .01 ? A(lerp(.3, TIE[0] + .015 * wig, on), lerp(.3, TIE[1], on), lerp(.25, TIE[2], on), on > .6 ? 'pinch' : undefined, [1, -.3, -.2]) : null, gL: 1 - on, bow: wig * .3, hdr: .14 * on, hdp: -.06 * on, troll: .05 * on, tap: 'auto' }; }, { noMirror: true });
def('micSwing', 4, 'upper', [0, 0], (t, i) => { const a = TAU * t / 4; return { aR: A(.38 + .2 * Math.cos(a), .55 + .25 * Math.sin(a), .35), mic: 0, aL: A(.55, .5, .2, 'open'), gL: .3, tpitch: -.1, hdp: -.15, hroll: .06 * Math.sin(PI * t), bend: .06 + .04 * bacc(t) }; }, { noMirror: true });
def('hatTip', 4, 'upper', [0, 0], (t, i) => { const on = sstep(.1, .6, t) * (1 - sstep(1.9, 2.4, t)), nod = sstep(.8, 1.1, t) * (1 - sstep(1.5, 2, t));
  return { aL: on > .01 ? A(lerp(.32, BRIM[0], on), lerp(.3, BRIM[1], on), lerp(.25, BRIM[2], on), on > .6 ? 'pinch' : undefined, [1, .2, -.3]) : null, gL: 1 - on, hdp: .28 * nod, hat: { w: 0, tilt: .3 * nod }, bend: .04 + .06 * nod, tap: 'auto' }; }, { noMirror: true });
def('lungeReach', 4, 'upper', [0, 0], (t, i) => { const R = seq(t, FR, [[0, .35, [-.5, .14]], [2.6, 3.1, FR]]), on = sstep(0, .4, t) * (1 - sstep(2.5, 3, t));
  return { L: { x: .14, z: 0, c: 1 }, R, w: .5 + .35 * on, bend: .05 + .18 * on, hroll: -.08 * on, hyaw: -.3 * on, aR: A(.42, .6, .55), mic: 1 - on * .9, aL: A(.5, .45, -.25, 'open'), gL: 1 - on, hdy: -.3 * on, tap: false }; }, { noMirror: true });
// big moves (phrase downbeats / drops)
function spinCore(t, i, turns, tight) { const wind = -.4 * sstep(0, .9, t) * (1 - sstep(.9, 1.1, t)), sp = ease(clamp((t - 1) / 2, 0, 1)), yaw = wind + TAU * turns * sp, inAir = t > 1.05 && t < 2.9;
  const L = seq(t, FL, [[0, .45, [.03, 0], .05], [3.4, 3.8, FL, .05]], { ry: t > .9 && t < 3.2 ? yaw : undefined, pt: inAir ? .3 : 0, c: t > .9 && t < 3.2 ? 2 : undefined });
  const R = inAir ? { x: -.05 * Math.cos(yaw) + .1 * Math.sin(yaw), z: .1 * Math.cos(yaw) + .05 * Math.sin(yaw), y: .3, c: 0, ry: yaw } : seq(t, FR, [[0, .45, [-.08, 0], .05], [2.9, 3.2, FR, .06]]);
  const hit = sstep(2.9, 3.15, t); return { L, R, w: inAir ? 0 : t < 1 ? .3 : .5, hyaw: yaw, bend: .1 * sstep(.4, .9, t) * (1 - sstep(.9, 1.1, t)) + .06 * hit, flare: sstep(1.1, 1.5, t) * (1 - sstep(2.8, 3.3, t)),
    aL: tight && inAir ? A(.12, .45, .25, 'fist') : hit > .01 ? A(lerp(.2, .78, hit), lerp(.4, .7, hit), .1, 'open') : A(.2, .35, .25, 'fist'), aR: tight && inAir ? A(.12, .45, .25) : A(.2, .4, .25), mic: inAir ? .3 : .8, gL: 0, hdp: -.08 * hit, tap: false }; }
def('spinTail', 4, 'big', [0, 0], (t, i) => spinCore(t, i, 1, false));
def('doubleSpin', 4, 'big', [0, 0], (t, i) => spinCore(t, i, 2, true));
def('pivotTurn', 4, 'big', [0, 0], (t, i) => { const yaw = PI * (ease(clamp((t - .9) / .7, 0, 1)) + ease(clamp((t - 2.9) / .7, 0, 1)));
  const piv = t > .8 && t < 3.7, L = piv ? { x: .06 * Math.cos(yaw), z: -.06 * Math.sin(yaw), c: 2, ry: yaw, pt: .25 } : seq(t, FL, [[0, .4, [.06, 0], .04], [3.7, 3.95, FL, .04]]), R = piv ? { x: -.06 * Math.cos(yaw), z: .06 * Math.sin(yaw), c: 2, ry: yaw, pt: .25 } : seq(t, FR, [[0, .4, [-.06, 0], .04], [3.75, 4, FR, .04]]);
  return { L, R, hyaw: yaw, flare: .4 * Math.abs(Math.sin(yaw)), bend: .05, aL: A(.45, .45, .2, 'open'), gL: .4, tap: false }; });
def('kickLine', 4, 'big', [0, 0], (t, i) => { const b = Math.floor(t), u = t - b, side = b % 2 ? 'L' : 'R', H = side === 'L' ? FL : FR, o = side === 'L' ? FR : FL, hi = .32 + .12 * i;
  const kf = seq(u, H, [[0, .32, [H[0] * .6, .42], hi, 'up'], [.32, .8, H, hi, 'down']]); return { L: side === 'L' ? kf : { x: o[0], z: 0, c: 1 }, R: side === 'R' ? kf : { x: o[0], z: 0, c: 1 }, w: side === 'L' ? .95 : .05, hy: .04 * Math.sin(PI * u), tpitch: -.08 * Math.sin(PI * u), aL: A(.75, .55, .05, 'open'), aR: A(.6, .5, .1), mic: .5, gL: 0, flare: .5 * Math.sin(PI * u), tap: false }; });
def('moonwalk', 4, 'big', [0, -.6], (t, i) => { const k = Math.min(3, Math.floor(t)), u = t - k, toeIsL = k % 2 === 0, zt = -.15 * k;
  const toe = { z: zt, c: 1, pt: .55 }, sl = { z: lerp(k === 0 ? 0 : zt + .15, zt - .15, sstep(0, 1, u)), c: 2 };
  let L = { ...(toeIsL ? toe : sl), x: .1 }, R = { ...(toeIsL ? sl : toe), x: -.1 };
  if (t > 3.5) { R = { x: -.1, z: lerp(-.45, -.6, sstep(3.5, 4, t)), c: 2, pt: .55 * (1 - sstep(3.5, 3.8, t)) }; L = { x: .1, z: -.6, c: 1 }; }
  return { L, R, w: toeIsL ? .85 : .15, tpitch: .08, bend: .07, hat: { w: 0, tilt: .18 }, hdp: .05, aL: A(.3, .2 + .08 * Math.sin(TAU * t), .15, 'relax'), gL: .4, tap: false }; });
def('hatFlip', 4, 'big', [0, 0], (t, i) => { const grab = sstep(0, .35, t) * (1 - sstep(.5, .7, t)), air = clamp((t - .55) / 1.45, 0, 1), lift = air > 0 && air < 1 ? 4 * air * (1 - air) * .7 : 0, catchH = sstep(1.9, 2.1, t) * (1 - sstep(3.3, 3.8, t)), flying = air > 0 && air < 1;
  return { aL: grab > .01 ? A(lerp(.3, BRIM[0], grab), lerp(.3, BRIM[1], grab), lerp(.25, BRIM[2], grab), 'pinch', [1, .2, -.3]) : flying ? A(.35, .9 + .3 * Math.sin(PI * air), .25, 'open') : catchH > .01 ? A(.7, .75, .1, 'jazz') : null,
    gL: grab > .01 || flying || catchH > .01 ? 0 : 1, hat: { w: 0, lift, spin: TAU * ease(air) }, hdp: -.35 * Math.sin(PI * air), bend: .04 + .1 * sstep(1.9, 2.05, t) * (1 - sstep(2.05, 2.5, t)), tap: 'auto' }; }, { noMirror: true });
def('hatSweepBow', 8, 'big', [0, 0], (t, i) => { const grab = sstep(0, .6, t), toHand = sstep(.7, 1.2, t) * (1 - sstep(6.4, 6.9, t)), back = sstep(6.9, 7.4, t), bow = sstep(1.8, 2.8, t) * (1 - sstep(5.4, 6.4, t)), sweep = sstep(1.2, 3, t);
  const R = seq(t, FR, [[1.5, 1.9, [-.12, -.22], .05, 'arc', { after: { pt: .35 } }], [6.4, 6.8, FR, .05]]);
  let aL; if (t < 1.2 || t > 6.3) aL = A(BRIM[0] + (t < 1.2 ? .25 * (1 - grab) : .25 * back), BRIM[1] - (t > 6.3 ? .6 * back : 0), BRIM[2], 'pinch', [1, .2, -.3]);
  else aL = A(lerp(.2, .62, sweep), lerp(.9, .15, sweep) + .1 * bow, lerp(.3, .45, sweep), 'pinch');
  return { R, w: .35, tpitch: .55 * bow, hpitch: .08 * bow, hdp: .3 * bow, aL, gL: 0, hat: { w: toHand }, aR: bow > .2 ? A(.25, .15, .35) : null, mic: 1 - bow, bend: .05 + .05 * bow, tap: false }; }, { noMirror: true });
// freezes (phrase ends): anticipation crouch, sharp hit, hold, release
function freeze(t, pose) { const pre = sstep(0, .18, t) * (1 - sstep(.18, .3, t)), hit = sstep(.2, .34, t) * (1 - sstep(3.45, 3.95, t)); const p = pose(hit); p.bend = (p.bend || 0) * hit + .12 * pre; p.gL = 1 - hit; p.tap = false; return p; }
def('freezeStar', 4, 'freeze', [0, 0], t => freeze(t, h => ({ R: h > .5 ? { x: -.42, z: .06, c: 1, pt: .7, yo: .5 } : { x: -.12, z: 0, c: 1 }, w: .2, aL: A(lerp(.3, .58, h), lerp(.3, 1.15, h), .15, 'jazz'), hroll: .12 * h, hdr: .16 * h, hdp: -.12 * h, bend: .02 })));
def('freezeHatLow', 4, 'freeze', [0, 0], t => freeze(t, h => ({ R: h > .5 ? { x: .03, z: .13, c: 1, pt: .6 } : { x: -.12, z: 0, c: 1 }, w: .15, aL: A(lerp(.3, BRIM[0], h), lerp(.3, BRIM[1] - .04, h), BRIM[2], 'pinch', [1, .2, -.3]), hat: { w: 0, tilt: .45 * h }, hdp: .32 * h, bend: .14 })), { noMirror: true });
def('freezeSky', 4, 'freeze', [0, 0], t => freeze(t, h => ({ L: { x: .12, z: 0, c: 1, pt: .5 * h }, R: { x: -.12, z: 0, c: 1, pt: .5 * h }, hy: .07 * h, aL: A(lerp(.3, .25, h), lerp(.3, 1.32, h), .12, 'point'), hdp: -.42 * h, troll: .05 * h, bend: 0 })));
def('freezeLean', 4, 'freeze', [0, 0], t => freeze(t, h => ({ L: { x: .12, z: 0, c: 1 }, R: { x: -.12, z: 0, c: 1 }, hz: .3 * h, hpitch: .32 * h, hy: -.02 * h, aL: A(.25, .05, -.15, 'relax'), aR: A(.25, .1, -.05), mic: 1 - h * .6, hat: { w: 0, tilt: .2 * h }, bend: 0 })));
export const MATT_MOVES = Object.keys(MOVES);
const FAM = {}; for (const id in MOVES) (FAM[MOVES[id].fam] ||= []).push(id);
const SIMPLE = ['stepTouch', 'hipSway', 'shoulderShimmy', 'pointCrowd', 'spinTail', 'stepTouchFwd', 'hipPop', 'discoPoint'];
export const SIMPLE_MOVES = SIMPLE;

// ---------------------------------------------------------------- pose evaluation
const NEG = ['hx', 'hyaw', 'hroll', 'tyaw', 'troll', 'hdy', 'hdr'];
const DEF = { w: .5, bend: .06, hx: 0, hz: 0, hy: 0, hyaw: 0, hroll: 0, hpitch: 0, tyaw: 0, troll: 0, tpitch: 0, hdy: 0, hdp: 0, hdr: 0, mic: 1, flare: 0, kneeL: 0, kneeR: 0, bow: 0 };
const SC = Object.keys(DEF).concat('gL'), YAWS = { hyaw: 1, tyaw: 1 };
const HAT0 = { w: 0, tilt: 0, lift: 0, spin: 0 };
const mirF = f => f && { ...f, x: -f.x, ry: f.ry === undefined ? undefined : -f.ry };
function evalMove(id, t, i, mir, v) {
  const mv = MOVES[id] || MOVES.hipSway; let p = mv.f(t, i, v) || {};
  if (mir < 0 && !mv.noMirror) { const q = { ...p }; q.L = mirF(p.R); q.R = mirF(p.L); q.aL = p.aR; q.aR = p.aL; q.kneeL = p.kneeR; q.kneeR = p.kneeL;
    if (p.w !== undefined) q.w = 1 - p.w; for (const k of NEG) if (p[k] !== undefined) q[k] = -p[k]; q.tap = p.tap === 'L' ? 'R' : p.tap === 'R' ? 'L' : p.tap; p = q; }
  if (p.gL === undefined) p.gL = p.aL ? .25 : 1;
  for (const k in DEF) if (p[k] === undefined) p[k] = DEF[k];
  p.L = p.L || { x: .12, z: 0, c: 1 }; p.R = p.R || { x: -.12, z: 0, c: 1 }; p.hat = { ...HAT0, ...(p.hat || {}) }; if (p.tap === undefined) p.tap = 'auto';
  return p;
}
const angD = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
const tapCurve = (b, dbl) => { const f = b - Math.floor(b); let a = f >= .5 ? sstep(.5, .86, f) * (1 - sstep(.93, 1, f)) : 0; if (f < .14) a += .14 * Math.sin(PI * f / .14);
  if (dbl && f > .06 && f < .25) a = Math.max(a, .75 * sstep(.06, .16, f) * (1 - sstep(.2, .25, f))); return a; };
const MIC_W = [.09, .5, .31], MOUTH_P = new THREE.Vector3(0, .76, .2), FWD = new THREE.Vector3(0, 0, 1);
const vH = new THREE.Vector3(), vK = new THREE.Vector3(), vA = new THREE.Vector3(), vP = new THREE.Vector3(), vT = new THREE.Vector3(), vE = new THREE.Vector3(), vD = new THREE.Vector3();
const tmpO = new THREE.Object3D(), tmpO2 = new THREE.Object3D(), qInv = new THREE.Quaternion(), qW = new THREE.Quaternion();
const mInv = new THREE.Matrix4(), m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), sc = new THREE.Vector3();
const HSOCK = new THREE.Matrix4().compose(new THREE.Vector3(.02, -.11, .02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -PI / 2)), new THREE.Vector3(.8, .8, .8));

// ---------------------------------------------------------------- dancer
class Dancer {
  constructor(bot, id, full) {
    this.bot = bot; this.rig = bot.rig; this.id = id; this.full = full; this.seed = hash(Math.floor(hueOf(id) * 1e6) + 17);
    this.s = {}; for (const k of SC) this.s[k] = { x: k === 'gL' ? 1 : DEF[k], v: 0 };
    const F = s => ({ s, x: s * .12, z: 0, y: 0, ry: s * .12, px: 0, pin: true, step: null });
    this.feet = { L: F(1), R: F(-1) }; this.anc = { x: { x: 0, v: 0 }, z: { x: 0, v: 0 } };
    const V = a => a.map(x => ({ x, v: 0 })); this.arm = { L: V([.24, .05, .1]), R: V(MIC_W) };
    this.hand = { L: HP.relax.slice(), R: HP.mic.slice() };
    this.sec = { tl: { x: .12, v: 0 }, tz: { x: 0, v: 0 }, bow: { x: 0, v: 0 }, hx: { x: 0, v: 0 }, hz: { x: 0, v: 0 } };
    this.blinkAt = 1 + Math.random() * 3; this.blinkT = -1; this.t = 0; this.idleBeat = 0; this.store = null; this.pending = null; this.mouth = 0; this.cur = null;
  }
  /** test / GM hook: force a choreography (validChoreo shape) for this dancer's current key */
  setChoreo(c) { this.pending = c; if (this.store) { this.store.setData(c); this.pending = null; } }
  improvise(b, R, st) {
    const c = R.ctx, rn = Math.random; c.anc ||= [0, 0];
    const e = clamp(st && st.energy !== undefined ? st.energy : .5, 0, 1), I = Math.round(clamp(.55 + .45 * e + (rn() - .5) * .2, .3, 1) * 100) / 100, v = rn() < .5 ? 0 : 1;
    const w = [Math.round(c.anc[0] * 10), Math.round(c.anc[1] * 10)];
    if (!this.full) {   // simpler bots: hold a move for 4-8 bars, mirror every 2 bars, stay on the spot
      if (!c.cur || b >= c.until || b < (c.from ?? 0)) { const pool = SIMPLE.filter(x => x !== c.cur); c.cur = pool[Math.floor(rn() * pool.length)]; c.from = b; c.until = b + (rn() < .5 ? 4 : 8); }
      return { m: [c.cur, I, (b - c.from) % 4 < 2 ? 1 : -1, v], w: [0, 0] };
    }
    const ph = b % 8, big = ph === 0 && ((st && st.drop) || b % 16 === 0 || rn() < .3);
    let pool;
    if (ph === 7) pool = FAM.freeze;
    else if (big) pool = FAM.big;
    else { if (!c.fam || b % 4 === 0) { const fams = ['foot', 'hips', 'upper'].filter(f => f !== c.fam); c.fam = e > .6 && rn() < .5 && c.fam !== 'foot' ? 'foot' : fams[Math.floor(rn() * fams.length)]; } pool = FAM[c.fam]; }
    const inB = (x, z) => Math.abs(x) <= (z < -.45 ? .6 : .3) && z >= -1 && z <= .3   , d0 = Math.hypot(c.anc[0], c.anc[1]);   // lateral room only once inside the cushion ring, d0 = Math.hypot(c.anc[0], c.anc[1]);
    let cands = [];
    for (const id of pool) { const M = MOVES[id]; if (id === c.last) continue;
      if (M.len === 8 && (ph % 2 || ph >= 6 || b + 1 >= R.bars || R.moves[b + 1] !== undefined)) continue;
      for (const m of (M.noMirror ? [1] : [1, -1])) { const nx = c.anc[0] + M.travel[0] * m, nz = c.anc[1] + M.travel[1]; if (!inB(nx, nz)) continue;
        const d1 = Math.hypot(nx, nz); cands.push({ id, m, wt: (d0 > .45 ? (d1 < d0 - .05 ? 3 : d1 > d0 + .05 ? .3 : 1) : 1) * ((c.used || {})[id] ? .45 : 1) }); } }
    if (!cands.length) cands = [{ id: 'hipSway', m: 1, wt: 1 }];
    let r = rn() * cands.reduce((a, x) => a + x.wt, 0), pick = cands[0]; for (const x of cands) { r -= x.wt; if (r <= 0) { pick = x; break; } }
    const M = MOVES[pick.id]; c.last = pick.id; (c.used ||= {})[pick.id] = 1; c.anc = [c.anc[0] + M.travel[0] * pick.m, c.anc[1] + M.travel[1]];
    const m = [pick.id, I, pick.m, v];
    if (M.len === 8) { R.moves[b + 1] = [pick.id, I, pick.m, v, 1]; R.wander[b + 1] = w; }
    return { m, w };
  }
  stepFoot(F, spb, h) { F.step = { x0: F.x, z0: F.z, r0: F.ry, u: 0, d: clamp(spb * .35, .12, .3), h }; F.pin = false; }
  gesture(beat, singing) {
    const slot = Math.floor(beat / 2), f2 = beat - slot * 2, bt = beat - Math.floor(beat), r = hash(slot * 13 + Math.floor(this.seed * 1e3)), ac = bacc(beat);
    const micOut = hash(slot * 7 + 3) < .45 && singing < .3;
    if (r < .38) { const u = ((beat - 1) % 2 + 2) % 2, a = acc(u > 1.5 ? u - 2 : u);   // finger snaps on 2 & 4
      return { t: [.36, .42 + .05 * a - .04 * sstep(1.55, 1.95, u), .24], h: u > 1.55 ? 'snapPre' : u < .32 ? 'snapRel' : 'snapPre', wr: [0, 0, .35 * a], micOut, kind: 'snap' }; }
    if (r < .56) return { t: [.5, .42 + .05 * ac, .38 + .03 * ac], h: 'open', wr: [0, .15, 0], micOut, kind: 'palm' };
    if (r < .70) return { t: [.42 + .1 * Math.sin(slot), .62 + .08 * ac, .5 + .07 * ac], h: 'point', wr: [0, 0, 0], micOut, kind: 'point' };
    if (r < .86) { const a = TAU * f2 / 2; return { t: [.45 + .1 * Math.cos(a), .5 + .1 * Math.sin(a), .35], h: 'flourish', wr: [.3 * Math.sin(a), 0, .4 * Math.cos(a)], fl: true, micOut, kind: 'flourish' }; }
    return { t: [.4, .45 + .1 * (bt < .5 ? 1 - bt * 2 : (bt - .5) * 2), .3], h: 'pinch', wr: [.2 * ac, 0, 0], micOut, kind: 'conduct' };
  }
  solveArm(arm, t, pole, hpName, wrOff, micDir, handArr, beat, flourish, doHands) {
    const s = arm.s, S = arm.sh.position; vT.set(s * t[0], t[1], t[2]); const pl = pole || [1, -.6, -.5]; vP.set(s * pl[0], pl[1], pl[2]);
    kneeOf(S, vT, UPPER, FORE, vP, vE);
    aim(arm.sh, S, vE, FWD); aim(tmpO, vE, vT, FWD);
    qInv.copy(arm.sh.quaternion).invert(); arm.el.quaternion.multiplyQuaternions(qInv, tmpO.quaternion);
    if (micDir) { vD.subVectors(vE, vT).normalize(); vA.copy(micDir).negate(); _c.copy(vD); _d.copy(vA).addScaledVector(_c, -vA.dot(_c)).normalize(); _b.crossVectors(_c, _d); _m.makeBasis(_b, _c, _d); qW.setFromRotationMatrix(_m); }
    else qW.copy(tmpO.quaternion);
    const P = HP[hpName] || HP.relax, wo = wrOff || [0, 0, 0];
    _e.set(wo[0], wo[1] + s * (P[5] || 0) * 2.2, s * wo[2], 'YXZ'); _q.setFromEuler(_e);
    qInv.copy(tmpO.quaternion).invert(); arm.wr.quaternion.multiplyQuaternions(qInv, qW).multiply(_q);
    if (!arm.fingers.length || !doHands) return;
    const k = .35;
    for (let i = 0; i < 5; i++) { const tgt = flourish ? (i ? .45 + .45 * Math.sin(TAU * beat - i * .9) : .2) : P[i]; handArr[i] += (tgt - handArr[i]) * k; }
    const F = arm.fingers; F[0][0].rotation.z = -s * handArr[0] * .9; F[0][1].rotation.z = -s * handArr[0] * .8;
    for (let i = 1; i < 5; i++) { F[i][0].rotation.z = -s * handArr[i] * 1.45; F[i][1].rotation.z = -s * handArr[i] * 1.5; }
  }
  update(dt, st, key, fade, doHands = true) {
    const R = this.rig, full = this.full; this.t += dt;
    let beat, tm, id = 'hipSway', I = .45, mir = 1, v = 0, part = 0, w = [0, 0], singing = 0, bar = 0;
    if (st.on && st.beat >= 0) {
      beat = st.beat; bar = Math.floor(beat / 4);
      this.store = BEAT.choreo(key, { bars: st.meta ? st.meta.bars : 32, improvise: (b, Rr, s) => this.improvise(b, Rr, s), localOnly: st.key === 'user' });
      if (this.pending) { this.store.setData(this.pending); this.pending = null; }
      const e = this.store.get(bar, st); if (e) { id = e.m[0]; I = e.m[1] ?? .7; mir = e.m[2] ?? 1; v = e.m[3] ?? 0; part = e.m[4] ?? 0; w = e.w || w; }
      tm = beat - bar * 4 + part * 4; singing = clamp((st.vocS || 0) * 2.2, 0, 1) * fade;
    } else { this.idleBeat += dt * 100 / 60; beat = this.idleBeat; tm = beat % 4; I = .4; if (!full) id = 'hipSway'; }
    if (!full && !SIMPLE.includes(id)) id = 'hipSway';
    this.cur = { id, I, mir, part, tm, bar, mode: this.store ? this.store.mode : 'idle' };
    const P = evalMove(id, tm, I, mir, v);
    const fam = (MOVES[id] || MOVES.hipSway).fam;
    if (full) { P.hy -= .012 * bacc(beat * 2) * I; if (fam !== 'freeze' && fam !== 'big') { P.bend += .045 * bacc(beat) * I; P.hx += .025 * Math.sin(PI * beat) * I; P.troll -= .03 * Math.sin(PI * beat) * I; } }
    else P.bend += .035 * bacc(beat);
    const spb = 60 / (st.bpm || 100), W = full ? 22 : 12, Z = full ? .75 : .9;
    spr(this.anc.x, w[0] / 10, dt, 5, 1); spr(this.anc.z, w[1] / 10, dt, 5, 1);
    for (const k of SC) { const S = this.s[k]; let tg = P[k]; if (YAWS[k]) tg = tg + TAU * Math.round((S.x - tg) / TAU); spr(S, tg, dt, k === 'w' ? 16 : W, Z); }
    const sv = k => this.s[k].x;
    // ---- feet: planted feet stay pinned; slides follow; air follows; auto re-plant steps on big target jumps
    const ax = this.anc.x.x, az = this.anc.z.x;
    for (const side of ['L', 'R']) { const F = this.feet[side], f = P[side], s = F.s;
      const tx = ax + f.x, tz = az + (f.z || 0), ty = f.y || 0, c = f.c ?? 1, tr = f.ry !== undefined ? f.ry : s * (f.yo ?? .12);
      F.tpx = (f.pt || 0) - (f.ph || 0); F.c = c;
      if (F.step) { const S = F.step; S.u += dt / S.d; const u = Math.min(1, S.u), e = ease(u);
        F.x = lerp(S.x0, tx, e); F.z = lerp(S.z0, tz, e); F.ry = S.r0 + angD(tr, S.r0) * e; F.y = S.h * Math.sin(PI * u);
        if (u >= 1) { F.step = null; F.pin = c === 1; F.y = 0; } }
      else if (c === 1) {
        if (!F.pin) { if (Math.hypot(tx - F.x, tz - F.z) > .08) this.stepFoot(F, spb, .05); else { F.x = tx; F.z = tz; F.ry = F.ry + angD(tr, F.ry); F.y = 0; F.pin = true; } }
        else if (Math.hypot(tx - F.x, tz - F.z) > .12 || Math.abs(angD(tr, F.ry)) > .6) this.stepFoot(F, spb, .06);
      } else { const k = 1 - Math.exp(-dt * 45); F.x = lerp(F.x, tx, k); F.z = lerp(F.z, tz, k); F.ry += angD(tr, F.ry) * k; F.y = lerp(F.y, c === 2 ? 0 : ty, k); F.pin = false; }
    }
    // ---- always-on foot-tap layer (Matt): free foot lifts on the & and strikes on the beat; heel (or ball) stays pinned
    let tapSide = null;
    if (full && P.tap !== false && fade > .5) { const wv = sv('w');
      let cand = P.tap === 'L' || P.tap === 'R' ? P.tap : null;
      if (!cand) { const TL = this.tapLock; // hold the tapping foot for the bar (hysteresis) unless the weight moves onto it
        const bk = Math.floor(beat + .4);   // re-decide just after each strike, never mid-lift
        if (TL && TL.bk === bk) cand = TL.side; else cand = wv > .55 ? 'L' : wv < .45 ? 'R' : (TL ? TL.side : 'R'); this.tapLock = { bk, side: cand }; }
      const F = this.feet[cand];
      if (F.pin && !F.step && P[cand].c !== 0) { tapSide = cand; const hb = hash(bar * 3 + 1), dbl = hb < .3, a = tapCurve(beat, dbl);
        F.tpx += (P[cand].pt || 0) > .05 ? .22 * a : (hb > .3 && hb < .45 ? .32 * a : -.42 * a); } }
    this.tapSide = tapSide;
    for (const side of ['L', 'R']) { const F = this.feet[side]; F.px += (F.tpx - F.px) * (1 - Math.exp(-dt * (full ? 60 : 25))); }
    // ---- pelvis over the support
    const FLs = this.feet.L, FRs = this.feet.R, wv = clamp(sv('w'), 0, 1);
    let px = lerp((FLs.x + FRs.x) / 2, lerp(FLs.x, FRs.x, wv), .5) + sv('hx'), pz = lerp((FLs.z + FRs.z) / 2, lerp(FLs.z, FRs.z, wv), .5) + sv('hz'), py = PELVIS_Y - sv('bend') * .6 + sv('hy');
    const pel = R.pelvis; pel.rotation.set(sv('hpitch'), sv('hyaw'), sv('hroll'));
    // foot transforms (pivot about ball for heel lifts, about heel for toe lifts)
    for (const leg of R.legs) { const F = leg.s > 0 ? FLs : FRs, pz_ = F.px > 0 ? .1 : -.085;
      _e.set(F.px, F.ry, 0, 'YXZ'); leg.foot.quaternion.setFromEuler(_e); vA.set(0, ANKLE_Y, -pz_).applyQuaternion(leg.foot.quaternion);
      leg.foot.position.set(F.x + Math.sin(F.ry) * pz_ + vA.x, F.y + vA.y, F.z + Math.cos(F.ry) * pz_ + vA.z); }
    // reach clamp: lower the pelvis so planted legs can reach; air feet get pulled in instead
    _q.setFromEuler(pel.rotation); const Lmax = (THIGH + SHIN) * .985;
    for (const leg of R.legs) { const F = leg.s > 0 ? FLs : FRs; if (F.c === 0 && !F.step) continue; vH.set(leg.s * HIPJ[0], HIPJ[1], 0).applyQuaternion(_q); const A_ = leg.foot.position;
      const hx = px + vH.x - A_.x, hz = pz + vH.z - A_.z, dh2 = hx * hx + hz * hz, maxY = A_.y + Math.sqrt(Math.max(0, Lmax * Lmax - dh2)) - vH.y; if (py > maxY) py = maxY; }
    pel.position.set(px, py, pz); if (R.footGlow) R.footGlow.position.set(px, .05, pz);
    for (const leg of R.legs) { const F = leg.s > 0 ? FLs : FRs, s = leg.s; vH.set(s * HIPJ[0], HIPJ[1], 0).applyQuaternion(_q).add(pel.position);
      const A_ = leg.foot.position; vA.subVectors(A_, vH); if (vA.length() > Lmax) { vA.setLength(Lmax); A_.copy(vH).add(vA); }
      const kw = s > 0 ? sv('kneeL') : sv('kneeR'); vP.set(Math.sin(F.ry) + s * (.12 + .6 * kw), 0, Math.cos(F.ry));
      kneeOf(vH, A_, THIGH, SHIN, vP, vK); leg.thigh.position.copy(vH); aim(leg.thigh, vH, vK, vP); leg.shin.position.copy(vK); aim(leg.shin, vK, A_, vP); }
    // ---- torso + head
    const bt = beat - Math.floor(beat);
    R.torso.rotation.set(sv('tpitch') + (full ? .03 * bacc(beat) : 0), sv('tyaw'), sv('troll'));
    R.head.rotation.set(sv('hdp') + (full ? .05 : .03) * bacc(beat) + .05 * singing * Math.sin(PI * beat), sv('hdy'), sv('hdr'));
    // ---- arms: move target + gesture layer (left) + mic layer (right)
    const g = full ? this.gesture(beat, singing) : null, gL = clamp(sv('gL'), 0, 1);
    const relax = (s) => [.24, .03 + .03 * Math.sin(PI * beat), .1 + .06 * Math.sin(PI * beat + s)];
    let tL = P.aL ? P.aL.t : relax(1), hL = P.aL && P.aL.h || 'relax', pL = P.aL && P.aL.p, wL = P.aL && P.aL.wr, fl = false;
    if (g && gL > .01) { tL = tL.map((x, i) => lerp(x, g.t[i], gL)); if (gL > .5) { hL = g.h; wL = g.wr; fl = !!g.fl; pL = null; } }
    let tR = P.aR ? P.aR.t : [.22, .22, .25], micDir = vD.set(0, .5, .85).normalize().clone();
    if (g && g.micOut) { const k = P.mic * (1 - singing); tR = tR.map((x, i) => lerp(x, [.42, .52, .48][i], k)); if (k > .5) micDir.set(-.3, .15, .95).normalize(); }
    const micW = clamp(P.mic, 0, 1) * singing; tR = tR.map((x, i) => lerp(x, MIC_W[i], micW));
    const AW = full ? 18 : 11, AZ = full ? .6 : .85;
    tL = this.arm.L.map((S, i) => spr(S, tL[i], dt, AW, AZ)); tR = this.arm.R.map((S, i) => spr(S, tR[i], dt, AW, AZ));
    R.pelvis.updateMatrix(); R.torso.updateMatrix();
    if (micW > .3) { vA.set(-MIC_W[0] * 0 - tR[0] * -1 * 0, 0, 0); micDir.lerp(vA.copy(MOUTH_P).sub(vT.set(-tR[0], tR[1], tR[2])).normalize(), clamp((micW - .3) / .5, 0, 1)).normalize(); }
    this.solveArm(R.armL, tL, pL, hL, wL, null, this.hand.L, beat, fl, doHands);
    this.solveArm(R.armR, tR, P.aR && P.aR.p, 'mic', null, micDir, this.hand.R, beat, false, doHands);
    // ---- secondary motion: tails, bow tie, hat
    const pv = this.sec, idt = 1 / Math.max(dt, 1e-3), yaw = sv('hyaw');
    const vx = pv.px === undefined ? 0 : (px - pv.px) * idt, vz = pv.pz === undefined ? 0 : (pz - pv.pz) * idt, yawV = pv.yaw === undefined ? 0 : (yaw - pv.yaw) * idt;
    pv.px = px; pv.pz = pz; pv.yaw = yaw;
    const lz = vx * Math.sin(yaw) + vz * Math.cos(yaw), lx = vx * Math.cos(yaw) - vz * Math.sin(yaw);
    if (R.tails) { const fl_ = sv('flare'); spr(pv.tl, .12 + clamp(lz * .7, -.25, .7) + clamp(Math.abs(yawV) * .12, 0, .8) + fl_ * 1.1 - .06 * acc(bt), dt, 9, .32);
      spr(pv.tz, clamp(-lx * .6, -.4, .4) - clamp(yawV * .05, -.3, .3), dt, 9, .35);
      R.tails.forEach((p, i) => { const s = i ? -1 : 1; p.rotation.x = pv.tl.x + .03 * s * Math.sin(this.t * 3); p.rotation.z = pv.tz.x + s * (.03 + .5 * fl_); }); }
    if (R.bow) { spr(pv.bow, sv('bow') + clamp(-lx * .3, -.3, .3) + .1 * acc(bt) * (full ? 1 : 0), dt, 16, .3); R.bow.rotation.z = pv.bow.x; }
    if (R.hat) { const H = P.hat, hdp = sv('hdp'), hdr = sv('hdr');
      spr(pv.hx, clamp(-(hdp - (pv.hdp ?? hdp)) * idt * .05, -.3, .3) + .04 * acc(bt), dt, 12, .3); spr(pv.hz, clamp(-(hdr - (pv.hdr ?? hdr)) * idt * .05 - lx * .1, -.3, .3), dt, 12, .3); pv.hdp = hdp; pv.hdr = hdr;
      R.body.updateMatrixWorld(true); mInv.copy(R.body.matrixWorld).invert(); const SO = R.hatSocket;
      m1.multiplyMatrices(mInv, R.head.matrixWorld); m1.decompose(p1, q1, sc); q2.setFromEuler(SO.rot); q1.multiply(q2); p1.add(vA.copy(SO.pos).applyQuaternion(q1));
      pv.hatW = lerp(pv.hatW ?? 0, H.w, 1 - Math.exp(-dt * 14));
      if (pv.hatW > .002) { m2.multiplyMatrices(mInv, R.armL.wr.matrixWorld).multiply(HSOCK); m2.decompose(p2, q2, sc); p1.lerp(p2, pv.hatW); q1.slerp(q2, pv.hatW); }
      _e.set(H.tilt + pv.hx.x, H.spin, pv.hz.x, 'YXZ'); q2.setFromEuler(_e); R.hat.position.copy(p1); R.hat.position.y += H.lift; R.hat.quaternion.copy(q1).multiply(q2); }
    // ---- face: lip-sync (300 Hz-3 kHz band), smirk, blink
    const m = st.on ? clamp(((st.vocal || 0) - .08) * 1.6, 0, 1) * fade : 0; this.mouth = lerp(this.mouth, m, 1 - Math.exp(-dt * 25));
    R.mouth.visible = this.mouth > .04; R.smirk.visible = this.mouth < .35; R.mouth.scale.set(.75 + .35 * this.mouth, .15 + 1.1 * this.mouth, 1);
    if (this.t > this.blinkAt) { this.blinkT = 0; this.blinkAt = this.t + 2.5 + Math.random() * 4; }
    let bs = 1; if (this.blinkT >= 0) { this.blinkT += dt; bs = Math.max(.08, Math.abs(1 - this.blinkT / .07)); if (this.blinkT > .14) { this.blinkT = -1; bs = 1; } }
    R.eyes.forEach(x => x.scale.y = bs);
    this.gest = g && g.kind;
  }
}

// ---------------------------------------------------------------- registry
const BUILDERS = {};
/** registerSinger(id, builder): builder(singer) -> { group, rig (makePerformerBot rig), height?, full? } */
export function registerSinger(id, builder) { BUILDERS[norm(id)] = builder; }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
BUILDERS.mattready = () => ({ ...makePerformerBot({ name: 'Matt Ready', coat: 0x5e17b0, coatSheen: 0xe2b6ff, hat: 'top', tails: true, bow: true, shoes: 'silver', height: 2.0, accent: 0x2ff5df, detail: 'full' }), full: true });
function builderFor(s) { return BUILDERS[norm(s.id)] || BUILDERS[norm(s.name)] || (/^matt ?re(a|d)dy$/i.test(String(s.name || '').trim()) ? BUILDERS.mattready : null); }
function genericBot(s) { const h = hueOf(s.name || s.id), c = new THREE.Color().setHSL(h, .55, .45);
  return makePerformerBot({ name: s.name, coat: c.getHex(), coatSheen: new THREE.Color().setHSL(h, .7, .8).getHex(), hat: 'beret', tails: false, bow: true, shoes: 'black', height: 1.85, accent: 0x2ff5df, detail: 'simple' }); }
export function countTris(o) { let n = 0; o.traverse(m => { if (m.isMesh && m.geometry) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); }

// ---------------------------------------------------------------- stage
/** Per-frame cost cap (iPhone): if the rolling average of update() goes over budgetMs, finger/hand work and simple bots run every other frame. */
export const QUALITY = { budgetMs: 2, avg: 0, handEvery: 1, simpleEvery: 1, frame: 0 };
let S = null;
/**
 * initPerformers(scene, where, camera, opts)
 *  where: toLocal(lat,lon)->Vector3 (called each frame) or the Garden pillar ground position (Vector3).
 *  opts: { radius:3, avoidBearing: 90 (deg; Ren is east), tracks: [{id, singers}] (auto-follow window.EEAR_AUDIO), getPlayerPos }
 */
export function initPerformers(scene, where, camera, opts = {}) {
  const root = new THREE.Group(); root.name = 'Performers'; scene.add(root);
  S = { scene, where, camera, opts, root, bots: [], key: '', night: 0, t: 0 };
  return { showPerformers, hidePerformers, update, setNight, registerSinger, group: root, get bots() { return S.bots; } };
}
function placeRoot() { const v = typeof S.where === 'function' ? S.where(GARDEN.lat, GARDEN.lon) : S.where; if (v) S.root.position.set(v.x, v.y ?? 0, v.z); }
const keyOf = singers => (singers || []).map(s => norm(s.id || s.name)).join('+');
const GAP0 = PI / 12, GAP = PI / 6;   // cushions sit at k*30deg; performers stand in the gaps (15 + k*30 deg)
/** showPerformers(singers:[{id,name}]) - rise in one bot per singer (no-op if the same set is already up) */
export function showPerformers(singers) {
  if (!S) throw new Error('initPerformers first'); singers = (singers || []).filter(Boolean); const key = keyOf(singers);
  if (key === S.key) return; hidePerformers(); S.key = key; if (!singers.length) return;
  placeRoot(); const pp = (S.opts.getPlayerPos && S.opts.getPlayerPos()) || S.camera.getWorldPosition(new THREE.Vector3());
  let c = Math.atan2(pp.x - S.root.position.x, -(pp.z - S.root.position.z)); if (!isFinite(c) || Math.hypot(pp.x - S.root.position.x, pp.z - S.root.position.z) < 1) c = 200 * PI / 180;
  const n = singers.length, step = n > 3 ? GAP : 2 * GAP, avoid = (S.opts.avoidBearing ?? 90) * PI / 180;
  c = GAP0 + Math.round((c - GAP0) / GAP) * GAP; if (n % 2 === 0 && step === 2 * GAP) c += 0; else if (n % 2 === 0) c += GAP / 2 * 0;
  const spots = cc => singers.map((_, i) => cc + (i - (n - 1) / 2) * step);
  const clear = cc => spots(cc).every(a => Math.abs(angD(a, avoid)) > 45 * PI / 180);
  for (let k = 1; k < 12 && !clear(c); k++) { const cand = c + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * GAP; if (clear(cand)) { c = cand; break; } }
  // even counts with 30deg spacing would land on cushions; nudge by half a gap so every spot is in a gap
  const offs = (n % 2 === 0 && step === GAP) ? GAP / 2 : 0;
  const R = S.opts.radius ?? 3;
  spots(c + offs).forEach((a, i) => { const s = singers[i];
    const b = (builderFor(s) || genericBot)(s); b.full = !!b.full; b.id = norm(s.id || s.name);
    b.group.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R); b.group.rotation.y = Math.atan2(b.group.position.x, b.group.position.z);
    const label = makeLabel(s.name || s.id); b.group.add(label); b.label = label;
    b.state = 'in'; b.f = 0; b.name = s.name; b.mats = []; b.fading = true;
    b.group.traverse(m => { if (m.material) { m.material = m.material.clone(); if (!m.isSprite) { m.material.userData.op = m.material.opacity; b.mats.push(m.material); } } });
    b.dancer = new Dancer(b, b.id, b.full); S.root.add(b.group); S.bots.push(b); });
  applyNight();
}
/** hidePerformers() - fade/sink out every performer */
export function hidePerformers() { if (!S) return; S.key = ''; S.bots.forEach(b => b.state = 'out'); }
/** setNight(t 0..1) - boost emissive accents at night (~2.5x) */
export function setNight(t) { if (!S) return; S.night = clamp(+t || 0, 0, 1); applyNight(); }
function applyNight() { const n = S.night; S.bots.forEach(b => b.mats.forEach(M => { if (M.emissiveIntensity !== undefined) { M.userData.ei ??= M.emissiveIntensity; M.emissiveIntensity = M.userData.ei * (1 + 1.6 * n); } })); }
const _cam = new THREE.Vector3(), _wp = new THREE.Vector3();
/** update(dt, analyser?) - call every frame. Beat/vocal analysis comes from beat.js (taps window.EEAR_AUDIO.pan); `analyser` is accepted for API compatibility. */
export function update(dt, analyser) {
  if (!S) return; dt = clamp(dt || 1 / 60, 0, .1); S.t += dt; placeRoot();
  const st = BEAT.tick();
  if (S.opts.tracks) { const A = window.EEAR_AUDIO, k = st.on ? st.key : null, T = k && S.opts.tracks.find(t => t.id === k || (A && t.id === A.track)); const sg = T && T.singers || [];
    if (keyOf(sg) !== S.key) sg.length ? showPerformers(sg) : hidePerformers(); }
  if (!S.bots.length) return;
  const t0 = performance.now(), fr = ++QUALITY.frame; S.camera.getWorldPosition(_cam);
  for (let i = S.bots.length - 1; i >= 0; i--) { const b = S.bots[i];
    b.f = clamp(b.f + (b.state === 'in' ? dt / 1.6 : -dt / 1.2), 0, 1);
    if (b.state === 'out' && b.f <= 0) { S.root.remove(b.group); b.group.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) { m.material.map && m.material.map.dispose(); m.material.dispose(); } }); S.bots.splice(i, 1); continue; }
    const e = sstep(0, 1, b.f), fading = e < .999;
    if (fading || b.fading) { b.mats.forEach(M => { M.transparent = fading || M.userData.op < 1; M.opacity = (M.userData.op ?? 1) * e; }); b.label.material.opacity = e; b.fading = fading; }
    b.rig.body.position.y = -.9 * (1 - e);
    const run = b.full || (fr % QUALITY.simpleEvery === 0);
    if (run) b.dancer.update(b.full ? dt : dt * QUALITY.simpleEvery, st, (st.key || 'idle') + BEAT.KEY_SEP + b.id, e, fr % QUALITY.handEvery === 0);
    if (b.rig.footGlow) b.rig.footGlow.material.opacity = (.18 + .35 * S.night + .2 * (st.vocal || 0)) * e;
    b.group.getWorldPosition(_wp); const d = Math.max(1, _wp.distanceTo(_cam)), visH = 2 * d * Math.tan(((S.camera.fov || 60) * PI / 180) / 2), lh = Math.max(.16, visH * .032);
    b.label.scale.set(lh * b.label.userData.aspect, lh, 1); b.label.position.set(0, (b.height || 2.1) + .15 + lh * .6, 0);
  }
  const ms = performance.now() - t0; QUALITY.avg = QUALITY.avg ? lerp(QUALITY.avg, ms, .05) : ms; QUALITY.last = ms;
  QUALITY.handEvery = QUALITY.avg > QUALITY.budgetMs ? 2 : 1; QUALITY.simpleEvery = QUALITY.avg > QUALITY.budgetMs * 1.5 ? 2 : 1;
}
export function performers() { return S ? S.bots : []; }
export { BEAT, MOVES };
