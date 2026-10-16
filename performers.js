// Performer bots for Earth Edge AR: singer bots that rise in at Matt's Meditation Garden whenever a track with vocals plays.
// Track metadata: { id, singers:[{id,name}] }. No singers (instrumentals like 'disco') -> no performers (Ren just dances).
// One bot per singer, in a small arc ~3 m from the Garden pillar, facing outward toward the approaching player.
// Mouth + gestures follow vocal-band energy (300 Hz - 3 kHz) from an AnalyserNode; bodies sway to the beat (low-band onsets).
// Stylized friendly-bot look matching Ren (ren.js?v=1792189732314). Normal blending only; self-lit with a procedural env map.
import * as THREE from 'three';

export const GARDEN = { lat: 48.1316475, lon: -122.7992293, name: "Matt's Meditation Garden" };
const PI = Math.PI, TAU = 2 * PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- shared look
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: .3 })); s.scale.setScalar(size); s.userData.glow = true; return s;
}
const hueOf = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 360) / 360; };

/**
 * makePerformerBot(opts) -> { group, rig, animate(st) }   (the default builder; registerSinger builders can call it)
 * opts: { name, coat, coatSheen, trousers, shoes:'silver'|'black', hat:'top'|null, hatColor, tails:bool, bow:bool, height (m, default 1.95), accent }
 */
export function makePerformerBot(o = {}) {
  const env = envTexture();
  const coatC = new THREE.Color(o.coat ?? 0x6a1fb8);
  const velvet = new THREE.MeshPhysicalMaterial({ color: coatC, roughness: .85, metalness: 0, sheen: 1, sheenRoughness: .35, sheenColor: new THREE.Color(o.coatSheen ?? 0xd8a8ff), envMap: env, envMapIntensity: .8, emissive: coatC.clone().multiplyScalar(.35), emissiveIntensity: .6 });
  const satin = new THREE.MeshPhysicalMaterial({ color: coatC.clone().multiplyScalar(.55), roughness: .25, clearcoat: .6, envMap: env, emissive: coatC.clone().multiplyScalar(.2), emissiveIntensity: .6 });
  const pants = new THREE.MeshPhysicalMaterial({ color: o.trousers ?? 0x1a1026, roughness: .7, sheen: .6, sheenColor: new THREE.Color(0x7a4fb0), envMap: env, emissive: 0x0c0614, emissiveIntensity: .6 });
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf4f1fb, roughness: .28, clearcoat: 1, clearcoatRoughness: .12, envMap: env, envMapIntensity: 1.25, emissive: 0x2a2140, emissiveIntensity: .35 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .5, envMap: env, emissive: 0x3a3448, emissiveIntensity: .5 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0b0a10, roughness: .2, clearcoat: 1, envMap: env, emissive: 0x050308, emissiveIntensity: .5 });
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xa9b1c2, metalness: 1, roughness: .18, envMap: env, envMapIntensity: 1.6, emissive: 0x30323a, emissiveIntensity: .4 });
  const screen = new THREE.MeshPhysicalMaterial({ color: 0x0a0d22, roughness: .08, clearcoat: 1, envMap: env, envMapIntensity: .9, emissive: 0x0d1b46, emissiveIntensity: .6 });
  const glowM = new THREE.MeshBasicMaterial({ color: o.accent ?? 0x2ff5df, transparent: true });
  const mats = { velvet, satin, pants, shell, white, black, silver, screen, glowM };
  const k = (o.height ?? 1.95) / 1.95;                      // overall scale; proportions are lanky by design
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body); body.scale.setScalar(k);
  const rig = { body, mats, glow: [] };
  const add = (p, g, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); p.add(me); return me; };
  // legs + shoes (legs hang from hips pivot so the body can sway/bounce)
  const hips = new THREE.Group(); hips.position.y = .95; body.add(hips); rig.hips = hips;
  rig.legs = [];
  for (const s of [1, -1]) {
    const leg = new THREE.Group(); leg.position.set(s * .1, 0, 0); hips.add(leg); rig.legs.push(leg);
    add(leg, new THREE.CapsuleGeometry(.068, .74, 4, 12), pants, 0, -.43, 0);
    const shoe = add(leg, new THREE.SphereGeometry(.1, 18, 12), o.shoes === 'black' ? black : silver, 0, -.9, .05); shoe.scale.set(.62, .36, 1.25);
  }
  add(hips, new THREE.SphereGeometry(.19, 20, 12), pants, 0, .02, 0).scale.set(1, .5, .8);
  // torso (velvet coat): lathe from waist to shoulders
  const torso = new THREE.Group(); torso.position.y = .02; hips.add(torso); rig.torso = torso;
  const prof = [[.15, 0], [.17, .06], [.165, .18], [.19, .32], [.215, .45], [.2, .53], [.12, .58]].map(([r, y]) => new THREE.Vector2(r, y));
  const coat = add(torso, new THREE.LatheGeometry(prof, 28), velvet); coat.scale.z = .8;
  // shirt front, lapels, buttons, bow tie
  const front = new THREE.Shape(); front.moveTo(-.095, .55); front.lineTo(.095, .55); front.lineTo(0, .13); front.closePath();
  add(torso, new THREE.ShapeGeometry(front), white, 0, 0, .182).rotation.x = -.1;
  for (const s of [1, -1]) { const L = new THREE.Shape(); L.moveTo(s * .095, .55); L.lineTo(s * .175, .5); L.lineTo(s * .03, .15); L.lineTo(0, .13); L.closePath(); const m = add(torso, new THREE.ShapeGeometry(L), satin, 0, 0, .186); m.rotation.x = -.1; m.rotation.y = s * .25; m.material.side = THREE.DoubleSide; }
  for (const y of [.11, .05]) add(torso, new THREE.SphereGeometry(.016, 8, 6), silver, 0, y, .16);
  if (o.bow !== false) { const bow = new THREE.Group(); bow.position.set(0, .545, .17); torso.add(bow);
    for (const s of [1, -1]) { const c = add(bow, new THREE.ConeGeometry(.034, .075, 4), black, s * .035, 0, 0); c.rotation.z = s * PI / 2; c.scale.z = .45; }
    add(bow, new THREE.SphereGeometry(.018, 8, 6), black); }
  // tails (swallowtail coat), pivot at the waist back
  if (o.tails) { rig.tails = [];
    for (const s of [1, -1]) { const piv = new THREE.Group(); piv.position.set(s * .07, .08, -.12); torso.add(piv);
      const sh = new THREE.Shape(); sh.moveTo(-.075, 0); sh.lineTo(.075, 0); sh.lineTo(.05 + s * .02, -.55); sh.lineTo(s * .03, -.62); sh.lineTo(-.03 + s * .01, -.5); sh.closePath();
      const t = add(piv, new THREE.ExtrudeGeometry(sh, { depth: .02, bevelEnabled: false }), velvet); t.rotation.x = .1; rig.tails.push(piv); } }
  // arms
  const mkArm = s => { const sh = new THREE.Group(); sh.position.set(s * .225, .5, 0); sh.rotation.order = 'ZYX'; torso.add(sh);
    add(sh, new THREE.SphereGeometry(.07, 14, 10), velvet); add(sh, new THREE.CapsuleGeometry(.05, .26, 4, 10), velvet, 0, -.17, 0);
    const el = new THREE.Group(); el.position.y = -.33; el.rotation.order = 'XZY'; sh.add(el);
    add(el, new THREE.CapsuleGeometry(.045, .24, 4, 10), velvet, 0, -.15, 0);
    const cuff = add(el, new THREE.CylinderGeometry(.05, .05, .03, 14), white, 0, -.29, 0);
    const hand = add(el, new THREE.SphereGeometry(.06, 14, 10), white, 0, -.35, 0); hand.scale.set(.85, 1.1, .8);
    return { sh, el }; };
  rig.armL = mkArm(1); rig.armR = mkArm(-1);
  // microphone in the right hand
  const mic = new THREE.Group(); mic.position.set(0, -.36, .04); mic.rotation.x = -1.2; rig.armR.el.add(mic);
  add(mic, new THREE.CylinderGeometry(.016, .011, .16, 10), silver, 0, .06, 0);
  add(mic, new THREE.SphereGeometry(.035, 14, 10), black, 0, .16, 0);
  rig.glow.push(add(mic, new THREE.TorusGeometry(.03, .006, 6, 18), glowM, 0, .135, 0)); rig.glow[0].rotation.x = PI / 2;
  // neck + head (stylized screen face like Ren, taller oval)
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
    // brows: left one raised a touch (confident)
    const by = .082 + (s > 0 ? .012 : 0), bc = new THREE.CatmullRomCurve3([-1, 0, 1].map(t => { const x = s * .06 + t * .03, y = by + (1 - t * t) * .008 + (s > 0 ? t * .006 : -t * .004); return new THREE.Vector3(x, y, fz(x, y)); }));
    add(head, new THREE.TubeGeometry(bc, 8, .006, 5), glowM);
  }
  const smP = [[-.05, -.058], [-.018, -.07], [.018, -.07], [.048, -.06], [.07, -.04]].map(([x, y]) => new THREE.Vector3(x, y, fz(x, y)));
  rig.smirk = add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smP), 14, .0085, 5), glowM);
  rig.mouth = onFace(add(head, new THREE.CircleGeometry(.03, 20), glowM), .005, -.07); rig.mouth.visible = false;
  // top hat
  if (o.hat === 'top') { const hatM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(o.hatColor ?? o.coat ?? 0x6a1fb8), roughness: .8, sheen: 1, sheenRoughness: .3, sheenColor: new THREE.Color(0xe0b8ff), envMap: env, emissive: coatC.clone().multiplyScalar(.35), emissiveIntensity: .6 });
    const hat = new THREE.Group(); hat.position.set(.015, HR * SY * .86, -.01); hat.rotation.z = -.1; hat.rotation.x = -.05; head.add(hat); rig.hat = hat;
    add(hat, new THREE.CylinderGeometry(.205, .205, .014, 28), hatM); add(hat, new THREE.CylinderGeometry(.13, .12, .25, 26), hatM, 0, .13, 0);
    add(hat, new THREE.CylinderGeometry(.122, .122, .045, 26), black, 0, .035, 0);
    rig.glow.push(add(hat, new THREE.TorusGeometry(.124, .005, 5, 30), glowM, 0, .06, 0)); rig.glow[rig.glow.length - 1].rotation.x = PI / 2; }
  else if (o.hat === 'beret') { const bm = new THREE.MeshPhysicalMaterial({ color: coatC, roughness: .8, sheen: 1, envMap: env, emissive: coatC.clone().multiplyScalar(.3) });
    const b = add(head, new THREE.SphereGeometry(.15, 20, 10), bm, .03, HR * SY * .85, 0); b.scale.set(1.1, .35, 1.1); b.rotation.z = -.25; }
  // soft halo sprite at the feet (fake bloom accent)
  const footGlow = glowSprite(o.accent ?? 0x2ff5df, 1.1); footGlow.position.y = .05; group.add(footGlow); rig.footGlow = footGlow;
  return { group, rig, height: (o.hat === 'top' ? 2.2 : 1.95) * k };
}

// default animation: sway to the beat, lip-sync + gestures from vocal energy
function animateDefault(b, st) {
  const R = b.rig, { t, beat, voc, vocS, dt } = st, ph = beat * PI;
  const sway = Math.sin(ph), bounce = Math.abs(Math.cos(ph));
  R.hips.position.y = .95 - .025 * bounce; R.hips.rotation.z = .05 * sway; R.torso.rotation.z = -.08 * sway; R.torso.rotation.y = .1 * Math.sin(ph / 2);
  R.legs.forEach((l, i) => { l.rotation.z = (i ? 1 : -1) * .04 - .05 * sway; l.rotation.x = .05 * bounce * (i ? 1 : -1); });
  R.head.rotation.set(-.15 * vocS + .06 * Math.sin(t * 1.3), .12 * Math.sin(ph / 4), .07 * sway);
  // right arm: mic to mouth; left arm: expressive, opens with sustained vocal energy
  R.armR.sh.rotation.set(-1.0 - .1 * vocS, .1, .32); R.armR.el.rotation.set(-2.05, 0, .25);
  const open = clamp(vocS * 1.4, 0, 1);
  R.armL.sh.rotation.set(lerp(-.15, -1.1, open) + .05 * sway, 0, lerp(.12, 1.15, open) + .15 * voc); R.armL.el.rotation.set(lerp(-.25, -.5, open) - .3 * Math.max(0, Math.sin(t * 3)) * open, 0, 0);
  if (R.tails) R.tails.forEach((p, i) => { p.rotation.x = .12 + .08 * bounce + .05 * Math.sin(t * 2 + i); p.rotation.z = -.06 * sway; });
  // mouth: smirk when closed, glowing oval when singing
  const m = clamp((voc - .08) * 2.2, 0, 1); R.mouth.visible = m > .02; R.smirk.visible = m < .35; R.mouth.scale.set(.75 + .35 * m, .15 + 1.1 * m, 1);
  st.blink(R.eyes);
}

// ---------------------------------------------------------------- registry
const BUILDERS = {};
/** registerSinger(id, builder): builder(opts) -> { group, rig?, height?, animate?(bot, state) } */
export function registerSinger(id, builder) { BUILDERS[String(id).toLowerCase()] = builder; }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
registerSinger('mattready', () => makePerformerBot({ name: 'Matt Ready', coat: 0x5e17b0, coatSheen: 0xe2b6ff, hat: 'top', tails: true, bow: true, shoes: 'silver', height: 2.0, accent: 0x2ff5df }));
function builderFor(s) { return BUILDERS[norm(s.id)] || BUILDERS[norm(s.name)] || (/^matt ?re(a|d)dy$/i.test(String(s.name || '').trim()) ? BUILDERS.mattready : null); }
function genericBot(s) { const c = new THREE.Color().setHSL(hueOf(s.name || s.id), .55, .45); return makePerformerBot({ name: s.name, coat: c.getHex(), coatSheen: new THREE.Color().setHSL(hueOf(s.name || s.id), .7, .8).getHex(), hat: 'beret', tails: false, bow: true, shoes: 'black', height: 1.85, accent: 0x2ff5df }); }

// ---------------------------------------------------------------- stage
let S = null;
/**
 * initPerformers(scene, where, camera, opts)
 *  where: toLocal(lat,lon)->Vector3 (called each frame) or the Garden pillar ground position (Vector3).
 *  opts: { radius:3, avoidBearing: 90 (deg, where Ren stands: east), tracks: [{id, singers}] (auto-follow window.EEAR_AUDIO), getPlayerPos }
 */
export function initPerformers(scene, where, camera, opts = {}) {
  const root = new THREE.Group(); root.name = 'Performers'; scene.add(root);
  S = { scene, where, camera, opts, root, bots: [], key: '', night: 0, an: null, anCtx: null, fbuf: null, prevE: 0, fm: 0, fv: .0004, lastOn: 0, beatT: 0, bpm: 120, vocMax: .05, voc: 0, vocS: 0, t: 0, center: 200 * PI / 180 };
  return { showPerformers, hidePerformers, update, setNight, registerSinger, group: root };
}
function placeRoot() {
  let v = typeof S.where === 'function' ? S.where(GARDEN.lat, GARDEN.lon) : S.where; if (v) S.root.position.set(v.x, v.y ?? 0, v.z);
}
const keyOf = singers => (singers || []).map(s => norm(s.id || s.name)).join('+');
/** showPerformers(singers:[{id,name}]) — rise in one bot per singer (no-op if the same set is already up) */
export function showPerformers(singers) {
  if (!S) throw new Error('initPerformers first'); singers = (singers || []).filter(Boolean); const key = keyOf(singers);
  if (key === S.key) return; hidePerformers(); S.key = key; if (!singers.length) return;
  // arc facing outward toward the player, rotated away from Ren's side
  placeRoot(); const pp = (S.opts.getPlayerPos && S.opts.getPlayerPos()) || S.camera.getWorldPosition(new THREE.Vector3());
  let brg = Math.atan2(pp.x - S.root.position.x, -(pp.z - S.root.position.z)); if (!isFinite(brg) || Math.hypot(pp.x - S.root.position.x, pp.z - S.root.position.z) < 1) brg = S.center;
  const avoid = (S.opts.avoidBearing ?? 90) * PI / 180; let d = ((brg - avoid + PI) % TAU + TAU) % TAU - PI; if (Math.abs(d) < 60 * PI / 180) brg = avoid + Math.sign(d || 1) * 60 * PI / 180;
  const R = S.opts.radius ?? 3, step = singers.length > 1 ? Math.min(.6, 1.6 / (singers.length - 1)) * 1 : 0; // ~1.6-1.8 m apart on a 3 m arc
  singers.forEach((s, i) => {
    const b = (builderFor(s) || genericBot)(s); const a = brg + (i - (singers.length - 1) / 2) * step;
    b.group.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R); b.group.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a)) + 0; // face outward (+z toward the player side)
    b.group.rotation.y = Math.atan2(b.group.position.x, b.group.position.z);
    const label = makeLabel(s.name || s.id); b.group.add(label); b.label = label;
    b.state = 'in'; b.f = 0; b.seed = i * 1.7; b.name = s.name; b.blinkAt = 1 + Math.random() * 3; b.blinkT = -1;
    b.group.traverse(m => { if (m.material && !m.isSprite) { m.material = m.material.clone(); m.material.transparent = true; m.material.userData.op = m.material.opacity; } if (m.isSprite) m.material = m.material.clone(); });
    S.root.add(b.group); S.bots.push(b);
  });
  applyNight();
}
/** hidePerformers() — fade/sink out every performer */
export function hidePerformers() { if (!S) return; S.key = ''; S.bots.forEach(b => b.state = 'out'); }
/** setNight(t 0..1) — boost emissive accents at night (~2.5x) */
export function setNight(t) { if (!S) return; S.night = clamp(+t || 0, 0, 1); applyNight(); }
function applyNight() { const n = S.night; S.bots.forEach(b => b.group.traverse(m => { const M = m.material; if (!M) return; if (M.emissiveIntensity !== undefined) { M.userData.ei ??= M.emissiveIntensity; M.emissiveIntensity = M.userData.ei * (1 + 1.6 * n); } })); }

function tapAnalyser() { const A = window.EEAR_AUDIO; if (!A || !A.ctx || !A.pan) return null; if (S.an && S.anCtx === A.ctx) return S.an;
  try { const an = A.ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = .5; A.pan.connect(an); const z = A.ctx.createGain(); z.gain.value = 0; an.connect(z); z.connect(A.ctx.destination); S.an = an; S.anCtx = A.ctx; return an; } catch (e) { return null; } }

/** update(dt, analyser?) — call every frame. analyser: an AnalyserNode on the music (e.g. REN.analyser); if omitted, taps window.EEAR_AUDIO.pan */
export function update(dt, analyser) {
  if (!S) return; dt = clamp(dt || 1 / 60, 0, .1); S.t += dt; placeRoot();
  // auto-follow the music system when track metadata was given
  if (S.opts.tracks) { const A = window.EEAR_AUDIO, on = A && A.on; const T = on && S.opts.tracks.find(t => t.id === A.track); const sg = T && T.singers || [];
    if (keyOf(sg) !== S.key) sg.length ? showPerformers(sg) : hidePerformers(); }
  if (!S.bots.length) return;
  const an = analyser || tapAnalyser(); let low = 0, voc = 0;
  if (an) { if (!S.fbuf || S.fbuf.length !== an.frequencyBinCount) S.fbuf = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(S.fbuf);
    const hz = an.context.sampleRate / an.fftSize, b0 = Math.round(300 / hz), b1 = Math.round(3000 / hz), lt = Math.max(2, Math.round(160 / hz));
    for (let i = 1; i <= lt; i++) low += S.fbuf[i]; low /= lt * 255; for (let i = b0; i <= b1; i++) voc += S.fbuf[i]; voc /= (b1 - b0 + 1) * 255;
    const flux = Math.max(0, low - S.prevE); S.prevE = low; S.fm = lerp(S.fm, flux, .02); S.fv = lerp(S.fv, (flux - S.fm) ** 2, .02);
    const now = an.context.currentTime; if (flux > S.fm + 1.6 * Math.sqrt(S.fv) && low > .12 && now - S.lastOn > .25) { const dtb = now - S.lastOn; S.lastOn = now; if (dtb > .3 && dtb < 1) S.bpm = lerp(S.bpm, 60 / dtb, .1); S.beatT = Math.round(S.beatT); } }
  const rb = window.REN && window.REN.dance && window.REN.dance.bpm; if (rb) S.bpm = rb;
  S.beatT += dt * S.bpm / 60;
  S.vocMax = Math.max(S.vocMax * (1 - dt * .1), voc, .05); const v = clamp((voc / S.vocMax - .35) / .65, 0, 1); // AGC'd vocal energy 0..1
  S.voc = lerp(S.voc, v, 1 - Math.exp(-dt * 18)); S.vocS = lerp(S.vocS, v, 1 - Math.exp(-dt * 1.5));
  const cam = S.camera.getWorldPosition(new THREE.Vector3());
  for (let i = S.bots.length - 1; i >= 0; i--) { const b = S.bots[i];
    b.f = clamp(b.f + (b.state === 'in' ? dt / 1.6 : -dt / 1.2), 0, 1); if (b.state === 'out' && b.f <= 0) { S.root.remove(b.group); b.group.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) { m.material.map && m.material.map.dispose(); m.material.dispose(); } }); S.bots.splice(i, 1); continue; }
    const e = sstep(0, 1, b.f); b.rig.body.position.y = -.9 * (1 - e); b.group.traverse(m => { const M = m.material; if (M) M.opacity = (M.userData.op ?? 1) * e; });
    const st = { t: S.t + b.seed, beat: S.beatT + (i % 2) * .0, voc: S.voc * e, vocS: S.vocS * e, dt, blink: eyes => { if (S.t > b.blinkAt) { b.blinkT = 0; b.blinkAt = S.t + 2.5 + Math.random() * 4; } let s = 1; if (b.blinkT >= 0) { b.blinkT += dt; s = Math.max(.08, Math.abs(1 - b.blinkT / .07)); if (b.blinkT > .14) { b.blinkT = -1; s = 1; } } eyes.forEach(x => x.scale.y = s); } };
    (b.animate || animateDefault)(b, st);
    if (b.rig.footGlow) b.rig.footGlow.material.opacity = (.18 + .35 * S.night + .2 * S.voc) * e;
    // label: constant-ish screen size, always readable
    const wp = b.group.getWorldPosition(new THREE.Vector3()), d = Math.max(1, wp.distanceTo(cam)), visH = 2 * d * Math.tan(((S.camera.fov || 60) * PI / 180) / 2), lh = Math.max(.16, visH * .032);
    b.label.scale.set(lh * b.label.userData.aspect, lh, 1); b.label.position.set(0, (b.height || 2.1) + .15 + lh * .6, 0);
  }
}
