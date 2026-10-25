// Ren (3dguru): a friendly hovering guru robot who lives at Cappy's Trails (next to Matt's Meditation Garden).
// Procedural Three.js model (no external assets), ~1.7 m tall, normal blending only (safe over iOS camera video),
// self-lit via a tiny procedural environment map (looks right even in scenes with no lights).
// Features: idle bob / 12-wedge halo spin / blinking / orbiting shapes; waves + talks (live LLM via POST <API>/api/ren)
// when a player comes within 15 m; billboard speech bubble with typing dots; "Talk to Ren" text box + speech-to-text
// (phone/desktop) and a 3D Talk button + presets (Quest/XR); optional speechSynthesis that respects the music mute;
// beat-synced per-song dances that are improvised + recorded once, then shared via <API>/api/ren/dance.
import * as THREE from 'three';
import * as BEAT from './beat.js?v=1792886745171';
import { REN as REN_REG } from './figures-registry.js?v=1792886745171';
export { TRACK_META, apiBase } from './beat.js?v=1792886745171';

export const REN_VERSION = 1;
export const REN_HOME = REN_REG.home; // Cappy's Trails pillar (figures-registry.js?v=1792886745171)
export const REN_EAST_M = REN_REG.eastM;            // stand ~4 m east of Cappy's pillar (clear of Cappy's + Meditation Garden beams)
export const TALK_RADIUS = REN_REG.talkRadius, LEAVE_RADIUS = REN_REG.leaveRadius;
const FALLBACK = 'Ren is meditating… try again soon.';
const PURPLE = 0x9b4dff, PURPLE_DEEP = 0x5b1fc0, TEAL = 0x2ff5df, SHELL = 0xf4f1fb;
const PRESETS = ['Hi Ren', 'What is this place?', 'Tell me about the vortex'];
let INST = null; // last instance (for the module-level update()/clearDance())
export function update(dt, playerPos) { if (INST) INST.update(dt, playerPos); }
export function clearDance(trackId, gmKey) { return INST ? INST.clearDance(trackId, gmKey) : Promise.resolve(false); }
export function say(text) { if (INST) INST.say(text); }
export function setNight(t) { if (INST) INST.setNight(t); }

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const PI = Math.PI, TAU = PI * 2;

function envTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#d9ccff'); gr.addColorStop(.35, '#ffffff'); gr.addColorStop(.5, '#bff8f0');
  gr.addColorStop(.56, '#6b5a8f'); gr.addColorStop(1, '#1c1430');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#ffffff'; g.fillRect(40, 18, 46, 22); g.fillRect(170, 26, 30, 14); // softboxes -> glossy highlights
  g.fillStyle = '#c9a6ff'; g.fillRect(110, 40, 40, 8);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function makeSprite(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(m); s.renderOrder = 1000; s.userData.canvas = c; s.userData.g = c.getContext('2d'); return s;
}

function wrapLines(g, text, maxW) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' '); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur); return lines;
}

// ---------------------------------------------------------------- model
export function buildRenModel() {
  const env = envTexture();
  const shell = new THREE.MeshPhysicalMaterial({ color: SHELL, roughness: .28, metalness: .05, clearcoat: 1, clearcoatRoughness: .12, envMap: env, envMapIntensity: 1.25, emissive: 0x2a2140, emissiveIntensity: .35 });
  const purple = new THREE.MeshPhysicalMaterial({ color: PURPLE, roughness: .3, metalness: .2, clearcoat: .8, envMap: env, envMapIntensity: 1, emissive: PURPLE_DEEP, emissiveIntensity: .55 });
  const screen = new THREE.MeshPhysicalMaterial({ color: 0x0a0d22, roughness: .08, metalness: .1, clearcoat: 1, clearcoatRoughness: .03, envMap: env, envMapIntensity: .9, emissive: 0x0d1b46, emissiveIntensity: .6 });
  const tealM = new THREE.MeshBasicMaterial({ color: TEAL });
  const purpleGlow = new THREE.MeshBasicMaterial({ color: 0xc28bff });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x241c38, roughness: .5, envMap: env, emissive: 0x120c22, emissiveIntensity: .5 });
  const blush = new THREE.MeshBasicMaterial({ color: 0xff8fd8, transparent: true, opacity: .35, depthWrite: false });
  const M = { shell, purple, screen, tealM, purpleGlow, dark, blush, env };

  const root = new THREE.Group(); root.name = 'Ren';
  const avatar = new THREE.Group(); avatar.name = 'RenAvatar'; root.add(avatar);      // dances/wanders
  const P = { root, avatar, M };

  // hover pad (glow disc + ring) stays on the ground under Ren
  const padC = document.createElement('canvas'); padC.width = padC.height = 128; const pg = padC.getContext('2d');
  const rg = pg.createRadialGradient(64, 64, 4, 64, 64, 62); rg.addColorStop(0, 'rgba(47,245,223,.85)'); rg.addColorStop(.45, 'rgba(155,77,255,.45)'); rg.addColorStop(1, 'rgba(155,77,255,0)');
  pg.fillStyle = rg; pg.fillRect(0, 0, 128, 128); const padT = new THREE.CanvasTexture(padC); padT.colorSpace = THREE.SRGBColorSpace;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(.62, 32), new THREE.MeshBasicMaterial({ map: padT, transparent: true, depthWrite: false }));
  pad.rotation.x = -PI / 2; pad.position.y = .015; pad.name = 'pad'; avatar.add(pad); P.pad = pad;
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(.42, .018, 6, 48), tealM); padRing.rotation.x = PI / 2; padRing.position.y = .03; avatar.add(padRing); P.padRing = padRing;

  const body = new THREE.Group(); body.name = 'body'; avatar.add(body); P.body = body;   // y = hover height (animated)
  // crossed legs (lotus)
  const legG = new THREE.CapsuleGeometry(.105, .46, 6, 14);
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(legG, shell); leg.rotation.z = PI / 2; leg.rotation.y = s * .42; leg.rotation.x = s * .12;
    leg.position.set(0, .11 + (s > 0 ? .035 : 0), .1); body.add(leg);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(.085, 16, 10), purple); knee.position.set(s * .29, .12, -.01 + .2); knee.scale.set(1, .8, 1); body.add(knee);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.08, 14, 10), shell); foot.scale.set(1.25, .7, .9); foot.position.set(-s * .2, .1, .25); body.add(foot);
  }
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(.27, 24, 14), shell); pelvis.scale.set(1.05, .55, .9); pelvis.position.y = .2; body.add(pelvis);
  // torso: egg lathe
  const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16, y = .2 + t * .66, r = .02 + Math.sin(Math.pow(t, .8) * PI * .98) * .29 * (1 - .28 * t); prof.push(new THREE.Vector2(Math.max(r, .02), y)); }
  prof[0].x = .22; prof[16].x = .12;
  const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), shell); body.add(torso);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.272, .03, 10, 40), purple); belt.rotation.x = PI / 2; belt.position.y = .34; body.add(belt);
  // chest emblem: 12-wedge ring + glowing core
  const chest = new THREE.Group(); chest.position.set(0, .56, .272); chest.rotation.x = -.18; body.add(chest); P.chest = chest;
  const chestRing = new THREE.Group(); chest.add(chestRing); P.chestRing = chestRing;
  for (let i = 0; i < 12; i++) { const w = new THREE.Mesh(new THREE.RingGeometry(.045, .07, 3, 1, i * PI / 6 + .05, PI / 6 - .1), i % 2 ? tealM : purpleGlow); chestRing.add(w); }
  const core = new THREE.Mesh(new THREE.CircleGeometry(.032, 20), tealM.clone()); core.position.z = .002; chest.add(core); P.core = core;
  // shoulders + arms
  const mkArm = s => {
    const sh = new THREE.Group(); sh.position.set(s * .27, .74, 0); sh.rotation.order = 'ZYX'; body.add(sh);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.085, 18, 12), purple); sh.add(ball);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(.052, .2, 4, 12), shell); up.position.y = -.15; sh.add(up);
    const el = new THREE.Group(); el.position.y = -.29; el.rotation.order = 'XZY'; sh.add(el);
    el.add(new THREE.Mesh(new THREE.SphereGeometry(.055, 14, 10), dark));
    const fo = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .17, 4, 12), shell); fo.position.y = -.13; el.add(fo);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(.052, .012, 6, 20), tealM); cuff.rotation.x = PI / 2; cuff.position.y = -.21; el.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.068, 16, 12), shell); hand.scale.set(.9, 1.05, .75); hand.position.y = -.29; el.add(hand);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), tealM); tip.position.set(0, -.355, .0); el.add(tip);
    return { sh, el };
  };
  P.armL = mkArm(1); P.armR = mkArm(-1);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.075, .095, .1, 18), dark); neck.position.y = .9; body.add(neck);
  // head
  const head = new THREE.Group(); head.position.y = 1.15; head.rotation.order = 'YXZ'; body.add(head); P.head = head;
  const HR = .27, SX = 1.18, SY = .95;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(HR, 36, 24), shell); skull.scale.set(SX, SY, 1); head.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(HR * 1.012, 36, 20, .62, PI - 1.24, PI * .5 - .78, 1.5), screen);
  face.rotation.y = 0; face.scale.set(SX, SY, 1); head.add(face);
  // face screen points (on the ellipsoid surface)
  const fz = (x, y) => HR * 1.012 * Math.sqrt(Math.max(0, 1 - (x / (HR * 1.012 * SX)) ** 2 - (y / (HR * 1.012 * SY)) ** 2)) + .006;
  const eyes = new THREE.Group(); head.add(eyes); P.eyes = [];
  const eyeG = new THREE.CircleGeometry(.04, 24);
  const happyEyes = new THREE.Group(); head.add(happyEyes); happyEyes.visible = false; P.happyEyes = happyEyes;
  for (const s of [1, -1]) {
    const x = s * .1, y = .035;
    const e = new THREE.Mesh(eyeG, tealM); e.position.set(x, y, fz(x, y)); e.lookAt(e.position.clone().multiply(new THREE.Vector3(2, 2, 2))); e.scale.set(1, 1.15, 1);
    eyes.add(e); P.eyes.push(e);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(.048, 24, 0, PI), screen); lid.position.set(x, y + .012, fz(x, y) + .002); lid.rotation.copy(e.rotation); lid.scale.set(1, .55, 1); eyes.add(lid); // calm half-lid
    const hc = new THREE.CatmullRomCurve3([-1, -.4, 0, .4, 1].map(t => { const xx = x + t * .04, yy = y - .012 + .028 * (1 - t * t); return new THREE.Vector3(xx, yy, fz(xx, yy)); }));
    happyEyes.add(new THREE.Mesh(new THREE.TubeGeometry(hc, 12, .011, 6), tealM));
    const b = new THREE.Mesh(new THREE.CircleGeometry(.03, 16), blush); const bx = s * .17, by = -.045; b.position.set(bx, by, fz(bx, by)); b.lookAt(b.position.clone().multiplyScalar(2)); b.scale.set(1.3, .8, 1); head.add(b);
  }
  // slight smirk: asymmetric curve, the right corner lifted
  const smPts = [[-.05, -.084], [-.02, -.093], [.015, -.093], [.045, -.083], [.07, -.063]].map(([x, y]) => new THREE.Vector3(x, y, fz(x, y)));
  const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smPts), 16, .0095, 6), tealM); head.add(smile); P.smile = smile;
  // ear pods
  for (const s of [1, -1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(.075, .085, .07, 22), purple); pod.rotation.z = PI / 2; pod.position.set(s * HR * SX * .97, 0, 0); head.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.058, .011, 6, 24), tealM); ring.rotation.y = PI / 2; ring.position.set(s * (HR * SX * .97 + .037), 0, 0); head.add(ring);
  }
  // halo: 12-wedge ring (the 12-wedge vortex), alternating purple/teal + thin outer ring
  const halo = new THREE.Group(); halo.position.y = 1.53; halo.rotation.x = -.18; body.add(halo); P.halo = halo;
  const haloSpin = new THREE.Group(); halo.add(haloSpin); P.haloSpin = haloSpin;
  for (let i = 0; i < 12; i++) {
    const w = new THREE.Mesh(new THREE.RingGeometry(.2, .27, 3, 1, i * PI / 6 + .04, PI / 6 - .08), i % 2 ? tealM : purpleGlow);
    w.material = w.material.clone(); w.material.side = THREE.DoubleSide; w.rotation.x = -PI / 2; haloSpin.add(w);
  }
  const outer = new THREE.Mesh(new THREE.TorusGeometry(.3, .007, 4, 64), purpleGlow); outer.rotation.x = PI / 2; haloSpin.add(outer);
  // orbiting geometric shapes (octa / tetra / icosa)
  const orbit = new THREE.Group(); orbit.position.y = .55; body.add(orbit); P.orbit = orbit; P.orbiters = [];
  [[new THREE.OctahedronGeometry(.05), tealM], [new THREE.TetrahedronGeometry(.055), purpleGlow], [new THREE.IcosahedronGeometry(.045), tealM]].forEach(([g, m], i) => {
    const o = new THREE.Mesh(g, m); o.userData.ph = i * TAU / 3; orbit.add(o); P.orbiters.push(o);
  });
  // soft fake-bloom halos (normal-blended radial sprites), stronger at night
  const gsp = (color, size, y) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), col = new THREE.Color(color), rgb = `${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0}`;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, `rgba(${rgb},.8)`); r.addColorStop(.45, `rgba(${rgb},.28)`); r.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: .12 })); s.scale.setScalar(size); s.position.y = y; return s; };
  P.glows = [gsp(PURPLE, .95, 0), gsp(TEAL, .32, .56)]; halo.add(P.glows[0]); chest.add(P.glows[1]); P.glows[1].position.set(0, 0, .03);
  return P;
}

function countTris(obj) { let n = 0; obj.traverse(o => { if (o.isMesh && o.geometry) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); }
export { countTris };

// ---------------------------------------------------------------- poses
// pose fields: y (extra hover), rx/ry/rz body, hx/hy/hz head, arm L/R: x (forward, -), z (side; L +, R -), y twist, e elbow (- bends), g glow, hs halo speed, eh happy eyes
const P0 = { y: 0, rx: 0, ry: 0, rz: 0, hx: .04, hy: 0, hz: 0, aLx: -.62, aLz: .3, aLy: 0, eL: -.95, aRx: -.62, aRz: -.3, aRy: 0, eR: -.95, g: .75, hs: 1, eh: 0 };
const D0 = { ...P0, aLx: -.35, aLz: .45, eL: -1.45, aRx: -.35, aRz: -.45, eR: -1.45, g: 1.15, hs: 2.4, eh: 1, hx: 0 };
function mirrorArms(p) { const q = { ...p }; q.aLx = p.aRx; q.aRx = p.aLx; q.aLz = -p.aRz; q.aRz = -p.aLz; q.aLy = -p.aRy; q.aRy = -p.aLy; q.eL = p.eR; q.eR = p.eL; q.ry = -p.ry; q.rz = -p.rz; q.hy = -p.hy; q.hz = -p.hz; return q; }
const MOVES = {
  bounce(pb, i) { const b = pb % 1, k = Math.exp(-b * 6); return { y: .03 - .07 * i * k, hx: .16 * i * k, aLx: -.5 - .35 * i * k, aRx: -.5 - .35 * i * k, eL: -1.6, eR: -1.6 }; },
  sway(pb, i) { const s = Math.sin(PI * pb); return { rz: .16 * i * s, hz: -.12 * s, ry: .18 * s, aLz: .55 + .35 * s, aRz: -.55 + .35 * s, eL: -1.1, eR: -1.1, y: .03 * Math.abs(s) }; },
  armPump(pb, i) { const b = pb % 1, k = Math.exp(-b * 5); return { aRz: -2.35, aRx: -.35, eR: -.25 - 1.05 * (1 - k) * i, y: -.05 * k, hx: .12 * k, hz: .1, aLx: -.9, eL: -1.7 }; },
  discoPoint(pb, i) { const t = sstep(1.75, 2.15, pb) - sstep(3.75, 4, pb); const up = { aRz: -2.55, aRx: -.25, eR: -.05, rz: -.1, hy: -.25, hx: -.2 }, dn = { aRz: .45, aRx: -.95, eR: -.08, rz: .1, hy: .3, hx: .25 };
    const o = { aLz: .7, aLx: .35, eL: -2.0, y: .04 * i }; for (const k in up) o[k] = lerp(up[k], dn[k], t); return o; },
  spin(pb, i, v) { const t = ease(clamp(pb / 3.5, 0, 1)); return { ry: TAU * t * (v ? 2 : 1), aLz: 1.35, aRz: -1.35, eL: -.25, eR: -.25, y: .1 * Math.sin(PI * clamp(pb / 3.5, 0, 1)), hs: 6 }; },
  shimmy(pb, i) { const f = Math.sin(TAU * pb * 2); return { ry: .16 * i * f, aLx: -.45 + .28 * f, aRx: -.45 - .28 * f, eL: -1.8, eR: -1.8, y: .02 + .015 * Math.abs(f), hz: .06 * f }; },
  clap(pb, i) { const b = pb % 1, back = Math.floor(pb) % 2 === 1, c = back ? Math.exp(-b * 7) : 0, open = 1 - (back ? sstep(-.01, .15, b) * (1 - sstep(.3, .8, b)) : 0);
    return { aLx: -1.25, aRx: -1.25, aLz: .08 + .55 * open, aRz: -.08 - .55 * open, eL: -.55, eR: -.55, hx: .1 * c, y: -.03 * c }; },
  robot(pb, i, v) { const T = [[-1.5, .2, -1.5, -.2, -1.6, -.2], [-.2, 1.5, -1.6, -1.5, -.1, -1.5], [-1.5, 1.5, -.1, -.2, -1.6, -.1], [-.3, .3, -1.6, -.3, -.3, -1.6]];
    const n = Math.floor(pb), a = T[(n + v) % 4], b = T[(n + v + 3) % 4], s = sstep(0, .12, pb % 1); const m = (j) => lerp(b[j], a[j], s);
    return { aLx: m(0), aLz: m(1), eL: m(2), aRx: m(3), aRz: -m(4) + 0, eR: m(5), hy: [.3, -.3, 0, .2][(n + v) % 4] * s, ry: [.15, -.15, 0, 0][(n + v) % 4] }; },
  lotusRise(pb, i) { const s = Math.sin(PI * pb / 4); return { y: .26 * i * s, aLz: .35 + 1.9 * s, aRz: -.35 - 1.9 * s, aLx: -.2, aRx: -.2, eL: -.35, eR: -.35, g: 1.7, hs: 6, hx: -.2 * s }; },
  rollArms(pb, i) { const f = TAU * pb * 2; return { aLx: -.95 + .28 * Math.sin(f), aRx: -.95 + .28 * Math.sin(f + PI), eL: -1.85 + .25 * Math.cos(f), eR: -1.85 + .25 * Math.cos(f + PI), aLz: .25, aRz: -.25, y: .03 * Math.abs(Math.sin(PI * pb)), rz: .06 * Math.sin(PI * pb) }; },
  headBob(pb, i) { const b = pb % 1, k = Math.exp(-b * 6); return { hx: .26 * i * k, y: -.035 * k, aLx: -.65, aRx: -.65, eL: -1.75, eR: -1.75, hz: .12 * Math.sin(PI * pb), aLz: .3 + .15 * k, aRz: -.3 - .15 * k }; },
  glide(pb, i) { const s = Math.sin(PI * pb); return { rz: .22, ry: -.25, aLz: 1.1 + .4 * s, aRz: -1.1 + .4 * s, eL: -.5 + .3 * s, eR: -.5 - .3 * s, y: .05 + .03 * s, hz: -.1 }; },
};
export const MOVE_IDS = Object.keys(MOVES);
const MOVE_W = { bounce: 3, sway: 3, armPump: 2, discoPoint: 2, spin: 1, shimmy: 2, clap: 2, robot: 1.5, lotusRise: 1, rollArms: 2, headBob: 2.5, glide: 1.5 };
function dancePose(entry, pb) {
  const [id, i = .8, m = 1, v = 0] = entry || ['bounce']; const f = MOVES[id] || MOVES.bounce;
  let p = { ...D0, ...f(pb, i, v | 0) }; if (m < 0) p = mirrorArms(p); return p;
}

// ---------------------------------------------------------------- main
/**
 * addRen(scene, where, camera, opts)
 *  scene  : THREE.Object3D Ren is added to (the app's scene).
 *  where  : toLocal(lat,lon) -> THREE.Vector3 (world position, called every frame so Ren follows the moving local frame),
 *           OR a THREE.Vector3 / {x,y,z} ground position of Cappy's pillar (Ren adds the 4 m east offset itself).
 *  camera : the app camera (labels/bubbles face it; default player position).
 *  opts   : { renderer, getPlayerName:()=>string, home:{lat,lon}, eastM, gmKey, talkUI:true, talkUIStyle:'css', speak:true }
 * returns { group, update(dt, playerPos), say(text), ask(text), ray(raycaster), clearDance(trackId, gmKey), dispose(), triangles }
 */
export function addRen(scene, where, camera, opts = {}) {
  const home = opts.home || REN_HOME, east = opts.eastM ?? REN_EAST_M;
  const P = buildRenModel(); const root = P.root; scene.add(root);
  const triangles = countTris(root);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
  function placeRoot() {
    let v = typeof where === 'function' ? where(home.lat, home.lon) : where;
    if (Array.isArray(v)) v = { x: v[0], y: v.length > 2 ? v[1] : (opts.groundY ?? 0), z: v.length > 2 ? v[2] : v[1] };
    if (v) root.position.set(v.x + east, v.y ?? 0, v.z);   // +x = east in the app's ENU frame
  }
  placeRoot();

  // beam: faint purple column so Ren is findable from afar (normal blending, no depth write)
  const beamM = new THREE.MeshBasicMaterial({ color: 0xb06bff, transparent: true, opacity: .22, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 400, 8, 1, true), beamM); beam.position.y = 1.75 + 200; root.add(beam);
  const beam2M = new THREE.MeshBasicMaterial({ color: 0x9b4dff, transparent: true, opacity: .07, depthWrite: false });
  const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 400, 12, 1, true), beam2M); beam2.position.copy(beam.position); root.add(beam2);
  beam.renderOrder = beam2.renderOrder = 5;

  // name label
  const label = makeSprite(512, 128);
  { const g = label.userData.g; g.clearRect(0, 0, 512, 128); roundRect(g, 6, 14, 500, 100, 50); g.fillStyle = 'rgba(24,10,44,.82)'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#b37bff'; g.stroke();
    g.font = '700 58px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.fillText('Ren', 170, 66); g.fillStyle = '#7ff7ea'; g.font = '600 46px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; g.fillText('(3dguru)', 338, 68); label.material.map.needsUpdate = true; }
  root.add(label);

  // speech bubble
  const bubble = makeSprite(1024, 512); bubble.visible = false; bubble.renderOrder = 1001; root.add(bubble);
  const BB = { text: '', pages: [], page: 0, until: 0, typing: false, fade: 1, H: 256 };
  const FONT = '600 44px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  function drawBubble(text, typing, dots = 3) {
    const c = bubble.userData.canvas, g = bubble.userData.g; g.font = FONT; const lines = typing ? [] : wrapLines(g, text, 880);
    const W = typing ? 400 : Math.min(1024, Math.max(520, 140 + Math.max(...lines.map(l => g.measureText(l).width), 300)));
    const H = typing ? 190 : 120 + lines.length * 56 + 40; if (c.height !== H || c.width !== W) { c.width = W; c.height = H; }
    g.clearRect(0, 0, W, H); const bh = H - 44, cx = W / 2;
    roundRect(g, 8, 8, W - 16, bh, 44); g.fillStyle = 'rgba(255,255,255,.96)'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#9b4dff'; g.stroke();
    g.beginPath(); g.moveTo(cx - 42, bh + 4); g.lineTo(cx, H - 4); g.lineTo(cx + 40, bh + 4); g.closePath(); g.fillStyle = 'rgba(255,255,255,.96)'; g.fill();
    g.beginPath(); g.moveTo(cx - 42, bh + 8); g.lineTo(cx, H - 4); g.lineTo(cx + 40, bh + 8); g.strokeStyle = '#9b4dff'; g.lineWidth = 7; g.stroke();
    g.font = '800 34px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; g.fillStyle = '#7a2fe0'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('Ren', 46, 62);
    if (typing) { for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx - 60 + k * 60, 112, 17, 0, TAU); g.fillStyle = k < dots ? '#7a2fe0' : '#d9c6fb'; g.fill(); } }
    else { g.font = FONT; g.fillStyle = '#1b1530'; lines.forEach((l, k) => g.fillText(l, 46, 122 + k * 56)); }
    bubble.material.map.dispose(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; bubble.material.map = t;
    BB.H = H; BB.W = W; bubble.material.opacity = 1; bubble.visible = true;
  }
  function paginate(text) { const g = bubble.userData.g; g.font = FONT; const L = wrapLines(g, text, 880); const pages = []; for (let i = 0; i < L.length; i += 6) pages.push(L.slice(i, i + 6).join(' ')); return pages.length ? pages : ['…']; }
  function say(text) { BB.typing = false; BB.pages = paginate(text); BB.page = 0; showPage(); speak(text); talkPulse = 2.5; }
  function showPage() { const t = BB.pages[BB.page]; drawBubble(t, false); BB.until = performance.now() + clamp(2500 + t.split(' ').length * 380, 4500, 14000); BB.fade = 1; }
  function typing(on) { BB.typing = on; if (on) { BB.dots = 0; drawBubble('', true, 1); BB.until = Infinity; } }

  // ---- chat (live LLM via server; client side only)
  const history = []; let pending = false, inside = false, lastArrive = 0, talkPulse = 0;
  const timeOfDay = () => { const d = new Date(), h = d.getHours(); return (h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night') + ' (' + String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ')'; };
  async function ask(message, event) {
    if (pending) return; pending = true; typing(true); setBusy(true);
    const name = (opts.getPlayerName && opts.getPlayerName()) || undefined;
    const body = { playerName: name, message, history: history.slice(-12), context: { distance: Math.round(curDist), timeOfDay: timeOfDay(), place: "Cappy's Trails by Matt's Meditation Garden, Port Townsend WA" } };
    if (event) body.event = event;
    let reply = FALLBACK;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(BEAT.apiBase() + '/api/ren', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal, cache: 'no-store' });
      clearTimeout(to); const d = await r.json().catch(() => ({}));
      if (d && typeof d.reply === 'string' && d.reply.trim()) reply = d.reply.trim();
      if (r.ok && !d.fallback) { history.push({ role: 'user', content: message.slice(0, 500) }, { role: 'assistant', content: reply.slice(0, 500) }); while (history.length > 12) history.shift(); }
    } catch (e) { reply = FALLBACK; }
    pending = false; setBusy(false); say(reply);
  }
  function arrive() {
    const now = Date.now(); if (now - lastArrive < 120000) return; lastArrive = now;
    const name = (opts.getPlayerName && opts.getPlayerName()) || 'A visitor';
    ask(`[event: arrive] ${name} just walked into Cappy's Trails by Matt's Meditation Garden, about ${Math.round(curDist)} m from you, in the ${timeOfDay()}. Wave and greet them warmly in one or two short sentences.`, 'arrive');
  }

  // ---- voice out (speechSynthesis), respects the music mute + music volume
  let voiceOn = localStorage.renVoice !== '0';
  function speak(text) {
    if (opts.speak === false || !voiceOn || !window.speechSynthesis) return;
    const A = window.EEAR_AUDIO; if (A && !A.on) return;                         // music muted/off -> Ren stays quiet
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(text).slice(0, 600)); u.pitch = 1.2; u.rate = 1.02; u.volume = clamp((+(localStorage.eearMusV ?? 80)) / 100, 0, 1);
      const vs = speechSynthesis.getVoices(); const v = vs.find(v => /en[-_]US/i.test(v.lang) && /Samantha|Google US|Aria|Jenny|Zira/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)); if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) { }
  }
  const prime = () => { try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(''); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { } window.removeEventListener('pointerdown', prime); };
  window.addEventListener('pointerdown', prime);

  // ---- voice in (Web Speech API)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen(onFail) {
    if (!SR) { onFail && onFail(); return; }
    try { const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1; let got = false;
      rec.onresult = e => { got = true; const t = e.results[0][0].transcript; if (t) ask(t); };
      rec.onerror = () => { if (!got) onFail && onFail(); }; rec.onend = () => setMic(false); setMic(true); rec.start(); typingHint(); } catch (e) { onFail && onFail(); }
  }
  function typingHint() { drawBubble('Listening…', false); BB.until = performance.now() + 6000; }

  // ---- DOM talk UI (phone/desktop)
  let ui = null; const setBusy = b => { if (ui) { ui.send.disabled = b; ui.send.textContent = b ? '…' : 'Send'; } }; const setMic = on => { if (ui && ui.mic) ui.mic.style.background = on ? '#ff5b8a' : '#2a1d45'; };
  if (opts.talkUI !== false && typeof document !== 'undefined') {
    const st = document.createElement('style'); st.textContent = `#renT{position:fixed;${opts.talkUIStyle || 'left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 72px)'};z-index:30;display:none;font:15px system-ui,-apple-system,sans-serif}
#renT .rb{border:0;border-radius:22px;padding:11px 16px;background:#7a2fe0;color:#fff;font:600 16px system-ui,-apple-system,sans-serif;box-shadow:0 2px 12px #0006}
#renP{display:none;gap:6px;align-items:center;background:#120a22ee;border:1px solid #b37bff;border-radius:16px;padding:7px;width:min(380px,calc(100vw - 20px));box-sizing:border-box}
#renP input{flex:1;min-width:0;font-size:16px;padding:9px 10px;border-radius:11px;border:0;background:#fff;color:#111}#renP button{border:0;border-radius:11px;padding:9px 11px;font-size:16px;background:#2a1d45;color:#fff}#renP .snd{background:#7a2fe0;font-weight:600}`;
    document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'renT';
    w.innerHTML = `<button class=rb id=renB>💬 Talk to Ren</button><div id=renP><input id=renI maxlength=300 placeholder="Say something to Ren…" enterkeyhint=send autocomplete=off>${SR ? '<button id=renM aria-label="speak">🎤</button>' : ''}<button class=snd id=renS>Send</button><button id=renV aria-label="Ren voice">${voiceOn ? '🔊' : '🔇'}</button><button id=renX aria-label=close>✕</button></div>`;
    document.body.appendChild(w);
    const $ = id => w.querySelector('#' + id);
    ui = { w, btn: $('renB'), panel: $('renP'), input: $('renI'), send: $('renS'), mic: $('renM'), voice: $('renV') };
    const open = v => { ui.panel.style.display = v ? 'flex' : 'none'; ui.btn.style.display = v ? 'none' : 'inline-block'; if (v) setTimeout(() => ui.input.focus(), 50); };
    ui.btn.onclick = () => open(true); $('renX').onclick = () => open(false);
    const go = () => { const t = ui.input.value.trim(); if (!t || pending) return; ui.input.value = ''; ask(t); };
    ui.send.onclick = go; ui.input.onkeydown = e => { if (e.key === 'Enter') go(); e.stopPropagation(); }; ui.input.onkeyup = e => e.stopPropagation();
    if (ui.mic) ui.mic.onclick = () => listen(() => { drawBubble("I couldn't hear you. Try typing instead!", false); BB.until = performance.now() + 4000; });
    ui.voice.onclick = () => { voiceOn = !voiceOn; localStorage.renVoice = voiceOn ? '1' : '0'; ui.voice.textContent = voiceOn ? '🔊' : '🔇'; if (!voiceOn) try { speechSynthesis.cancel(); } catch (e) { } };
  }

  // ---- 3D talk button + presets (Quest / XR, where DOM is not visible)
  const mkBtn = (text, w = 640) => { const s = makeSprite(w, 128); const g = s.userData.g; roundRect(g, 6, 8, w - 12, 112, 52); g.fillStyle = 'rgba(122,47,224,.95)'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#7ff7ea'; g.stroke();
    g.font = '700 54px system-ui,-apple-system,sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 66); s.material.map.needsUpdate = true; s.visible = false; s.userData.aspect = w / 128; root.add(s); return s; };
  const talkBtn = mkBtn('🎤 Talk to Ren'); const presetBtns = PRESETS.map(t => { const b = mkBtn(t, 760); b.userData.text = t; return b; }); let presetsUntil = 0;
  const isQuest = /OculusBrowser|Quest/i.test(navigator.userAgent);
  const xrOn = () => !!(opts.renderer && opts.renderer.xr && opts.renderer.xr.isPresenting);
  const _ray = new THREE.Raycaster();
  function ray(raycaster) { // call from the app's XR select / click handler; returns true if Ren consumed it
    const hits = (raycaster || _ray).intersectObjects([talkBtn, ...presetBtns].filter(b => b.visible), false); if (!hits.length) return false;
    const b = hits[0].object; if (b === talkBtn) listen(() => { presetsUntil = performance.now() + 12000; drawBubble('Pick something to say:', false); BB.until = presetsUntil; });
    else { presetsUntil = 0; ask(b.userData.text); } return true;
  }

  // ---- dance: shared beat engine + saved choreography (beat.js?v=1792886745171)
  const D = { w: 0, mode: 'off', key: null, store: null };
  function improvise(bar, R, st) { // pick this bar's move (phrase aware: 2-bar repeats, big move at phrase ends)
    const prev = R.moves[(bar + R.bars - 1) % R.bars], e = clamp((st.energy || 0) * 6, .35, 1);
    let id;
    if (bar % 8 === 7) id = ['spin', 'discoPoint', 'lotusRise', 'glide'][Math.floor(Math.random() * 4)];
    else if (bar % 2 === 1 && prev && Math.random() < .6) id = prev[0];
    else { let tot = 0; for (const k in MOVE_W) if (!prev || k !== prev[0]) tot += MOVE_W[k]; let r = Math.random() * tot; for (const k in MOVE_W) { if (prev && k === prev[0]) continue; r -= MOVE_W[k]; if (r <= 0) { id = k; break; } } id = id || 'bounce'; }
    const mir = prev && prev[0] === id ? -prev[2] : (Math.random() < .5 ? 1 : -1);
    const entry = [id, Math.round(e * 100) / 100, mir, Math.random() < .3 ? 1 : 0];
    let w = R.wander[(bar + R.bars - 1) % R.bars] || [0, 0];
    if (bar % 2 === 0 || id === 'glide' || id === 'spin') { const a = Math.random() * TAU, r = (id === 'glide' ? 1.3 : .4 + Math.random() * .9); w = [Math.round(Math.cos(a) * r * 10), Math.round(Math.sin(a) * r * 10)]; }
    if (bar % 8 === 0) w = [0, 0];
    return { m: entry, w };
  }
  function musicTick() {
    const st = BEAT.tick(); if (!st.on || st.beat < 0) { D.mode = 'off'; D.key = null; return null; }
    D.key = st.key; D.store = BEAT.choreo(st.key, { bars: st.meta ? st.meta.bars : 32, improvise, localOnly: st.key === 'user' });
    const barAbs = Math.floor(st.beat / 4), pb = st.beat - barAbs * 4, cur = D.store.get(barAbs, st); if (!cur) return null;
    const nx = D.store.peek(barAbs + 1) || cur, w0 = cur.w, w1 = nx.w, k = ease(clamp(pb / 4, 0, 1));
    D.mode = D.store.mode;
    return { pose: dancePose(cur.m, pb), wx: lerp(w0[0], w1[0], k) / 10, wz: lerp(w0[1], w1[1], k) / 10, pb };
  }
  const clearDanceI = (trackId, gmKey) => BEAT.clearDance(trackId || D.key, gmKey || opts.gmKey);

  // ---------------------------------------------------------------- per-frame
  let T = 0, blinkAt = 2, blinkT = -1, waveT = -1, curDist = 1e9, yaw = 0; const cur = { ...P0 };
  function applyPose(p, waveW, time) {
    const B = P.body; B.position.y = .32 + p.y + Math.sin(time * 1.3) * .045; B.rotation.set(p.rx, p.ry, p.rz);
    P.head.rotation.set(p.hx + Math.sin(time * .7) * .03, p.hy, p.hz);
    let rX = p.aRx, rZ = p.aRz, rE = p.eR, rY = p.aRy, fz = 0;
    if (waveW > 0) { rX = lerp(rX, -.25, waveW); rZ = lerp(rZ, -2.45, waveW); rY = lerp(rY, -.3, waveW); rE = lerp(rE, -.35, waveW); fz = waveW * Math.sin(time * 9) * .45; }
    P.armL.sh.rotation.set(p.aLx, p.aLy, p.aLz); P.armL.el.rotation.set(p.eL, 0, 0);
    P.armR.sh.rotation.set(rX, rY, rZ); P.armR.el.rotation.set(rE, 0, fz);
    P.happyEyes.visible = p.eh > .5 || waveW > .3 || talkPulse > 0 && p.eh > .2; P.eyes.forEach(e => e.parent.visible = !P.happyEyes.visible);
    const g = p.g + .25 * Math.sin(time * 2.2); P.core.material.color.setRGB(.18 * g, .96 * Math.min(g, 1.2), .87 * Math.min(g, 1.2));
    P.chestRing.rotation.z -= .01 * p.hs; P.haloSpin.rotation.y += .006 * p.hs; P.padRing.scale.setScalar(1 + .05 * Math.sin(time * 2));
  }
  function updateI(dt, playerPos) {
    dt = clamp(dt || 1 / 60, 0, .1); T += dt; const now = performance.now();
    placeRoot();
    camera.getWorldPosition(_c);
    const pp = playerPos || _c; root.updateMatrixWorld();
    P.avatar.getWorldPosition(_w); curDist = Math.hypot(pp.x - _w.x, pp.z - _w.z);
    // presence: wave + greet on entering 15 m, leave at 20 m
    if (!inside && curDist < TALK_RADIUS) { inside = true; waveT = 0; arrive(); }
    else if (inside && curDist > LEAVE_RADIUS) inside = false;
    if (ui) ui.w.style.display = inside && !xrOn() ? 'block' : 'none';
    // music / dance
    const dance = musicTick();
    D.w = lerp(D.w, dance ? 1 : 0, 1 - Math.exp(-dt * 3));
    const target = dance ? dance.pose : P0; for (const k in P0) cur[k] = lerp(P0[k], target[k] ?? P0[k], D.w);
    if (dance) cur.ry = target.ry * D.w; // spins are absolute
    P.avatar.position.x = lerp(P.avatar.position.x, dance ? dance.wx : 0, 1 - Math.exp(-dt * 4));
    P.avatar.position.z = lerp(P.avatar.position.z, dance ? dance.wz : 0, 1 - Math.exp(-dt * 4));
    // face the player (within 40 m), otherwise slowly turn back to the player's general direction anyway
    const want = Math.atan2(pp.x - _w.x, pp.z - _w.z); let dy = ((want - yaw + PI) % TAU + TAU) % TAU - PI; yaw += dy * (1 - Math.exp(-dt * (curDist < 40 ? 3 : .8))); P.avatar.rotation.y = yaw;
    // wave (2.6 s) on arrival, again every ~25 s while the player stays close and Ren isn't dancing
    if (waveT >= 0) { waveT += dt; if (waveT > 2.6) waveT = -1; } else if (inside && D.w < .2 && Math.random() < dt / 25) waveT = 0;
    const waveW = waveT < 0 ? 0 : sstep(0, .35, waveT) * (1 - sstep(2.2, 2.6, waveT));
    // blink
    if (T > blinkAt) { blinkT = 0; blinkAt = T + 2.5 + Math.random() * 4; } let bs = 1; if (blinkT >= 0) { blinkT += dt; bs = Math.abs(1 - blinkT / .07); if (blinkT > .14) { blinkT = -1; bs = 1; } bs = Math.max(.08, Math.min(1, bs)); }
    P.eyes.forEach(e => e.scale.y = 1.15 * bs);
    talkPulse = Math.max(0, talkPulse - dt); P.smile.scale.set(1, 1 + (talkPulse > 0 ? .25 * Math.abs(Math.sin(T * 14)) : 0), 1);
    applyPose(cur, waveW, T);
    P.orbiters.forEach((o, i) => { const a = T * (.6 + i * .15) + o.userData.ph; o.position.set(Math.cos(a) * .55, Math.sin(a * 1.7 + i) * .12, Math.sin(a) * .55); o.rotation.x += dt; o.rotation.y += dt * 1.3; });
    // billboards: sizes keep a roughly constant on-screen size (readable from far)
    root.getWorldPosition(_v); const dCam = Math.max(1, _v.distanceTo(_c)), fov = (camera.fov || 60) * PI / 180, visH = 2 * dCam * Math.tan(fov / 2), asp = Math.min(camera.aspect || 1, 1.6);
    const lh = Math.max(.2, visH * .04); label.scale.set(lh * 4, lh, 1); label.position.set(P.avatar.position.x, 1.95 + lh * .6, P.avatar.position.z);
    beamM.opacity = clamp(beamBase + dCam / 600, beamBase, .4); beam2M.opacity = beamM.opacity * .35;
    if (bubble.visible) {
      if (BB.typing) { const d = 1 + Math.floor(now / 350) % 3; if (d !== BB.dots) { BB.dots = d; drawBubble('', true, d); } }
      else if (now > BB.until) { if (BB.page < BB.pages.length - 1) { BB.page++; showPage(); } else { BB.fade -= dt; bubble.material.opacity = clamp(BB.fade, 0, 1); if (BB.fade <= 0) bubble.visible = false; } }
      const bw = clamp(visH * asp * .6, 1.1, 40) * (BB.W || 1024) / 1024, bh = bw * BB.H / (BB.W || 1024); bubble.scale.set(bw, bh, 1); bubble.position.set(P.avatar.position.x, label.position.y + lh * .6 + bh / 2 + .05, P.avatar.position.z);
    }
    // XR talk button / presets
    const showBtn = inside && (xrOn() || isQuest);
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // Ren's right-hand side seen from the player
    talkBtn.visible = showBtn && !pending; const tb = .16 * Math.max(1.5, curDist * .35); talkBtn.scale.set(tb * talkBtn.userData.aspect, tb, 1);
    talkBtn.position.set(P.avatar.position.x - side.x * (.9 + tb), 1.0, P.avatar.position.z - side.z * (.9 + tb));
    presetBtns.forEach((b, i) => { b.visible = showBtn && now < presetsUntil; b.scale.set(tb * b.userData.aspect, tb, 1); b.position.set(P.avatar.position.x + side.x * (.9 + tb * 2.5), 1.4 - i * tb * 1.25, P.avatar.position.z + side.z * (.9 + tb * 2.5)); });
  }

  let night = 0;
  function setNight(t) { night = clamp(+t || 0, 0, 1); const f = 1 + 1.6 * night;
    for (const m of [P.M.shell, P.M.purple, P.M.screen, P.M.dark]) { m.userData.ei ??= m.emissiveIntensity; m.emissiveIntensity = m.userData.ei * f; }
    P.glows[0].material.opacity = .1 + .4 * night; P.glows[1].material.opacity = .12 + .45 * night; P.pad.material.opacity = .7 + .3 * night; beamBase = .12 + .1 * night; }
  let beamBase = .12;
  const inst = { group: root, triangles, setNight, get analyser() { return BEAT.analyser(); }, update: updateI, say, ask, ray, clearDance: clearDanceI, listen,
    get dance() { const S = D.store, st = BEAT.tick(); return { mode: D.mode, trackId: D.key, bpm: st.bpm || 0, choreo: S && S.data, recording: S && S.rec && { bars: S.rec.bars, filled: S.rec.moves.filter(x => x !== undefined).length } }; },
    dispose() { scene.remove(root); if (ui) ui.w.remove(); window.removeEventListener('pointerdown', prime); root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); if (INST === inst) INST = null; } };
  setNight(0); INST = inst; window.REN = inst; return inst;
}
