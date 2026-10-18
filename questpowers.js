// questpowers.js (d48): Quest superpowers - local to this headset only (nothing is sent to the server; real players are never targets).
// Weapons (right controller): A (or right grip) = fire, hold A >0.6 s = long-press, right thumbstick click = next weapon (Freeze -> Web lock -> Tow line).
//  FREEZE (water gun): water jet (<=30 droplets, gravity arc) -> target freezes in place 60 s in an icy crystalline shell (frost sparkles, mist puff).
//    Shoot a frozen target again = thaw (cracks, shatters into shards + melt drips). Long-press = thaw all.
//  WEB LOCK: sticky catenary strand -> pearly silk cocoon anchored to the ground; holds the being at that spot until cleared
//    (aim + long-press = clear one; panel 'Clear all webs'). Webs persist across reloads on this headset (localStorage eearWebs).
//  TOW LINE: taut glowing strand to the being; it keeps moving and your rig is smoothly dragged ~4 m behind it (head look stays free;
//    ground level unless flying). Fire again or long-press = release; auto-release if the target disappears. One tow at a time; overrides the position lock while active.
// Targets: the 12 edge bots + other BOT/TEST figures, Ren, the GhostBot, performers. Frozen/webbed edge bots hold their DISPLAYED spot locally while their live
// position keeps updating underneath (they keep wandering toward Ready Athletics); on release they glide back to it (the stick-fig lerp).
// Cheap: shared materials/geometries, instanced droplets, merged cocoon geometry, CPU ribbons (24 segments), no post-processing. Lite mode drops the glow ribbons + sparkles.
const T = THREE, V3 = T.Vector3, LITE = () => !!window.EEAR_LITE;
const LS = { on: 'eearPowOn', w: 'eearPowW', webs: 'eearWebs' };
const P = window.QPOW = { enabled: localStorage[LS.on] !== '0', weapon: +(localStorage[LS.w] || 0) % 3, frozen: new Map(), webbed: new Map(), towing: null, fx: [], targets: [], last: '' };
const NAMES = ['FREEZE (water)', 'WEB LOCK', 'TOW LINE'], COLS = ['#8fe3ff', '#ffffff', '#ffd23f'];
const sc = document.querySelector('a-scene'), floor = () => document.getElementById('floor').object3D, rh = () => document.getElementById('rh').object3D;
// ---------- sound (tiny WebAudio synths; no files)
function actx() { const A = window.EEAR_AUDIO; if (A && A.ctx) return A.ctx; if (!P._ac) { const AC = window.AudioContext || window.webkitAudioContext; P._ac = new AC() } return P._ac }
function sfx(kind) { try { const c = actx(); if (c.state !== 'running') c.resume(); const t = c.currentTime, g = c.createGain(); g.connect(c.destination);
  const noise = (dur, f, q, vol) => { const b = c.createBuffer(1, Math.max(1, c.sampleRate * dur | 0), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2; const s = c.createBufferSource(); s.buffer = b; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const gg = c.createGain(); gg.gain.value = vol; s.connect(bp); bp.connect(gg); gg.connect(c.destination); s.start(t) };
  const tone = (f0, f1, dur, vol, type = 'sine') => { const o = c.createOscillator(), gg = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); gg.gain.setValueAtTime(vol, t); gg.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(gg); gg.connect(c.destination); o.start(t); o.stop(t + dur + .02) };
  if (kind === 'squirt') noise(.25, 2500, 1.2, .35); else if (kind === 'freeze') { noise(.35, 5000, 2, .5); tone(2400, 1800, .4, .08, 'triangle') } else if (kind === 'shatter') { noise(.3, 3500, .8, .6); [2900, 3700, 4400].forEach((f, i) => setTimeout(() => sfx('ping' + f), i * 60)) }
  else if (kind.startsWith('ping')) tone(+kind.slice(4), +kind.slice(4) * .9, .25, .06, 'sine'); else if (kind === 'thwip') { tone(1400, 300, .16, .18, 'sawtooth'); noise(.12, 1800, 3, .25) } else if (kind === 'snap') { noise(.08, 1200, 4, .7); tone(500, 120, .1, .15, 'square') }
  else if (kind === 'tow') { tone(220, 660, .3, .12, 'sawtooth') } else if (kind === 'release') tone(660, 200, .25, .1, 'triangle'); else if (kind === 'switch') tone(900, 1200, .06, .06, 'square') } catch (e) { } }
// ---------- shared materials
const U = { t: { value: 0 } };
const iceMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { t: U.t, k: { value: 1 } }, extensions: { derivatives: true },
  vertexShader: 'varying vec3 vN,vV,vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader: 'uniform float t,k;varying vec3 vN,vV,vW;void main(){vec3 n=normalize(cross(dFdx(vW),dFdy(vW)));float f=pow(1.-abs(dot(n,vV)),2.);float facet=fract(sin(dot(floor(vW*4.),vec3(12.9,78.2,37.7)))*43758.5);'
    + 'vec3 c=mix(vec3(.55,.85,1.),vec3(.95,1.,1.),f)+vec3(.15,.25,.35)*facet*.5;float spec=pow(max(0.,dot(reflect(-vV,n),normalize(vec3(.3,1.,.2)))),24.);gl_FragColor=vec4(c+spec,(.28+.55*f+.3*spec)*k);}' });
const pearlMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { t: U.t, k: { value: 1 } },
  vertexShader: 'varying vec3 vN,vV;varying vec2 vU;void main(){vU=uv;vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader: 'uniform float t,k;varying vec3 vN,vV;varying vec2 vU;void main(){float d=abs(dot(normalize(vN),vV)),f=pow(1.-d,2.5);vec3 ir=.5+.5*cos(6.283*(vec3(0.,.33,.67)+f*1.3+t*.05));'
    + 'vec3 c=mix(vec3(.93,.92,.97),ir,.25*f)+vec3(1.)*pow(d,18.)*.6;float sh=smoothstep(.0,.08,abs(fract(vU.x*3.-t*.4)-.5)-.38);gl_FragColor=vec4(c+.25*sh,(.75+.25*f)*k);}' });
const shellMat = new T.MeshBasicMaterial({ color: 0xf2eefc, transparent: true, opacity: .28, depthWrite: false });
const strandMat = (col, add) => new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: add ? T.AdditiveBlending : T.NormalBlending, uniforms: { t: U.t, c: { value: new T.Color(col) }, a: { value: add ? .35 : .95 }, pulse: { value: 0 } },
  vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform float t,a,pulse;uniform vec3 c;varying vec2 vU;void main(){float e=1.-abs(vU.y*2.-1.);float sh=exp(-pow((fract(vU.x*.5-t*.7)-.5)*14.,2.));float pl=pulse*exp(-pow((fract(vU.x*.15-t*1.6)-.5)*10.,2.));gl_FragColor=vec4(c*(1.+.8*sh+2.*pl),a*smoothstep(0.,.6,e));}' });
const silkM = strandMat(0xffffff, false), glowM = strandMat(0xcfe8ff, true), towM = strandMat(0xffe27a, false), towG = strandMat(0xffc040, true); towM.uniforms.pulse.value = towG.uniforms.pulse.value = 1;
const dropMat = new T.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: .85, depthWrite: false });
const sparkMat = new T.PointsMaterial({ color: 0xffffff, size: .06, transparent: true, opacity: .9, depthWrite: false, blending: T.AdditiveBlending });
const shardMat = new T.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: .8, depthWrite: false });
const mistMat = new T.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(230,248,255,.8)'); r.addColorStop(1, 'rgba(230,248,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c) })(), transparent: true, depthWrite: false });
const icoG = new T.IcosahedronGeometry(1, 1), shardG = new T.TetrahedronGeometry(.12), dropG = new T.SphereGeometry(.035, 6, 4), shellG = new T.SphereGeometry(1, 12, 8);
for (const m of [iceMat, pearlMat, shellMat, silkM, glowM, towM, towG, dropMat, sparkMat, shardMat, mistMat]) m.userData.pf = 1;
// ---------- ribbon (CPU, camera-facing) along a catenary-ish curve a->b with sag
function ribbon(mat, n = 24) { const g = new T.BufferGeometry(), p = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), ix = [];
  for (let i = 0; i <= n; i++) { uv.set([i / n * 10, 0, i / n * 10, 1], i * 4); if (i < n) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) } }
  g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(ix); const m = new T.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 30; m.userData.n = n; return m }
const _c = new V3(), _s = new V3(), _q = new V3(), _w = new V3();
function curve(a, b, sag, sway, i, n, out) { const u = i / n; out.lerpVectors(a, b, u); out.y -= sag * 4 * u * (1 - u); if (sway) { out.x += Math.sin(u * Math.PI) * sway * Math.sin(U.t.value * 2.3 + u * 3); out.z += Math.sin(u * Math.PI) * sway * Math.cos(U.t.value * 1.9 + u * 2) } return out }
function setRibbon(m, a, b, sag, width, sway = 0, frac = 1) { const n = m.userData.n, p = m.geometry.attributes.position, cam = sc.camera; cam.getWorldPosition(_c); m.parent.worldToLocal(_c);
  const bb = _w.copy(a).lerp(b, frac), prev = new V3(), cur = new V3(), nxt = new V3();
  for (let i = 0; i <= n; i++) { curve(a, bb, sag * frac, sway, i, n, cur); curve(a, bb, sag * frac, sway, Math.min(n, i + 1), n, nxt); if (i === n) curve(a, bb, sag * frac, sway, n - 1, n, nxt), nxt.sub(cur).negate().add(cur);
    _s.subVectors(nxt, cur).normalize(); _q.subVectors(_c, cur).cross(_s).normalize().multiplyScalar(width / 2); p.setXYZ(i * 2, cur.x + _q.x, cur.y + _q.y, cur.z + _q.z); p.setXYZ(i * 2 + 1, cur.x - _q.x, cur.y - _q.y, cur.z - _q.z) }
  p.needsUpdate = true }
// ---------- targets
function targets() { const L = [], F = floor();
  document.querySelectorAll('#others > a-entity').forEach(el => { if (!el.qKind || el.qKind === 'player') return; L.push({ id: 'p:' + el.qId, kind: el.qKind, name: el.qName || 'bot', obj: el.object3D, h: () => 1.9 * (el.components['stick-fig'] && el.components['stick-fig'].fig ? el.components['stick-fig'].fig.scale.x : 1), fig: el }) });
  F.traverse(o => { if (o.name === 'Ren') L.push({ id: 'ren', kind: 'ren', name: 'Ren', obj: o, h: () => 2 }) });
  if (window.QGHOST) L.push({ id: 'ghost', kind: 'ghost', name: 'GhostBot', obj: QGHOST, h: () => 1.9 * (QGHOST.scale ? QGHOST.scale.y : 1) });
  const PF = window.EEAR_PF; if (PF && PF.bots) PF.bots.forEach((b, i) => { const o = b.root || b.group || b.obj || b.g || b.mesh; if (o && o.isObject3D) L.push({ id: 'pf:' + i, kind: 'performer', name: b.name || 'performer', obj: o, h: () => 1.9 }) });
  const vis = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true };
  return L.filter(x => x.obj && x.obj.parent && vis(x.obj)) }
const _bx = new T.Box3();
function centerOf(tg, out) { if (tg.fig) { tg.obj.getWorldPosition(out); out.y += tg.h() * .5; return out } _bx.setFromObject(tg.obj); if (_bx.isEmpty()) { tg.obj.getWorldPosition(out); out.y += 1; return out } return _bx.getCenter(out) }
function aimHit() { const R = rh(); if (!R) return null; const o = new V3(), d = new V3(0, 0, -1); R.getWorldPosition(o); d.applyQuaternion(R.getWorldQuaternion(new T.Quaternion())); let best = null;
  for (const tg of P.targets) { const c = centerOf(tg, new V3()), h = tg.h(), r = Math.max(.6, h * .45) + .15 * c.distanceTo(o) / 10; const oc = c.clone().sub(o), t = oc.dot(d); if (t < 0 || t > 250) continue; const dd = oc.lengthSq() - t * t; if (dd > r * r) continue; if (!best || t < best.t) best = { tg, t, p: o.clone().addScaledVector(d, t), c } }
  return { o, d, hit: best } }
// ---------- hold (freeze/web): snapshot local transforms of the being + bones, restore after everything else ticked
function snap(obj) { const S = []; obj.traverse(n => { if (S.length < 300) S.push([n, n.position.clone(), n.quaternion.clone(), n.scale.clone()]) }); return S }
function restore(S) { for (const [n, p, q, s] of S) { n.position.copy(p); n.quaternion.copy(q); n.scale.copy(s) } }
const holds = () => [...P.frozen.values(), ...P.webbed.values()];
function attachFx(tg, mk) { const F = floor(), g = new T.Group(); F.add(g); const c = centerOf(tg, new V3()); F.worldToLocal(c); g.position.copy(c); const h = tg.h(); g.scale.setScalar(h / 1.9); mk(g, h); return g }
// FREEZE
function freeze(tg) { if (P.webbed.has(tg.id)) return; if (P.frozen.has(tg.id)) return thaw(tg.id); sfx('freeze');
  const fx = attachFx(tg, (g, h) => { const sh = new T.Mesh(icoG, iceMat); sh.scale.set(.62, 1.05, .62); g.add(sh);
    if (!LITE()) { const n = 14, pts = new Float32Array(n * 3); for (let i = 0; i < n; i++) pts.set([(Math.random() - .5) * 1.1, (Math.random() - .5) * 2, (Math.random() - .5) * 1.1], i * 3); const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pts, 3)); const sp = new T.Points(pg, sparkMat); sp.userData.tw = 1; g.add(sp) }
    for (let i = 0; i < 4; i++) { const m = new T.Sprite(mistMat.clone()); m.userData.puff = { t0: U.t.value, d: new V3((Math.random() - .5), Math.random() * .4, (Math.random() - .5)) }; m.scale.setScalar(.4); g.add(m) } });
  P.frozen.set(tg.id, { tg, S: snap(tg.obj), fx, until: performance.now() + 60000 }); say('❄ Frozen: ' + tg.name + ' (60 s)') }
function thaw(id, quiet) { const F = P.frozen.get(id); if (!F) return; P.frozen.delete(id); if (F.tg.fig) F.tg.fig.qHold = false; if (!quiet) sfx('shatter'); const g = F.fx, Fl = floor();
  // crack flash -> shards + drips
  const shards = []; for (let i = 0; i < (LITE() ? 5 : 9); i++) { const s = new T.Mesh(shardG, shardMat); s.position.set((Math.random() - .5) * .8, (Math.random() - .3) * 1.4, (Math.random() - .5) * .8); s.userData.v = s.position.clone().normalize().multiplyScalar(1.5 + Math.random() * 2); s.userData.v.y += 1.5; s.userData.r = new V3(Math.random(), Math.random(), Math.random()); g.add(s); shards.push(s) }
  const sh = g.children[0]; P.fx.push({ t0: U.t.value, dur: .8, step(k, dt) { if (sh) { sh.material = sh.material === iceMat ? iceMat.clone() : sh.material; sh.material.uniforms.k.value = Math.max(0, 1 - k * 4); }
    for (const s of shards) { s.userData.v.y -= 9.8 * dt; s.position.addScaledVector(s.userData.v, dt / g.scale.x); s.rotation.x += s.userData.r.x * dt * 8; s.rotation.y += s.userData.r.y * dt * 8 } shardMat.opacity = .8 * (1 - k) }, end() { Fl.remove(g); shardMat.opacity = .8 } }) }
// WEB
function cocoonGeo() { const parts = []; for (let i = 0; i < 7; i++) { const t = new T.TorusGeometry(1, .035, 4, 28); t.rotateX(Math.random() * Math.PI); t.rotateZ(Math.random() * Math.PI); t.scale(.5, .95, .5); parts.push(t) }
  return mergeG(parts) }
function mergeG(parts) { let n = 0, m = 0; for (const g of parts) { n += g.attributes.position.count; m += g.index ? g.index.count : g.attributes.position.count } const P3 = new Float32Array(n * 3), N3 = new Float32Array(n * 3), UV = new Float32Array(n * 2), I = new Uint32Array(m); let o = 0, oi = 0;
  for (const g of parts) { const c = g.attributes.position.count; P3.set(g.attributes.position.array, o * 3); if (g.attributes.normal) N3.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) UV.set(g.attributes.uv.array, o * 2); const ix = g.index ? g.index.array : [...Array(c).keys()]; for (let i = 0; i < ix.length; i++) I[oi++] = ix[i] + o; o += c; g.dispose() }
  const G = new T.BufferGeometry(); G.setAttribute('position', new T.BufferAttribute(P3, 3)); G.setAttribute('normal', new T.BufferAttribute(N3, 3)); G.setAttribute('uv', new T.BufferAttribute(UV, 2)); G.setIndex(new T.BufferAttribute(I, 1)); return G }
function anchorGeo(h) { const parts = []; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.random() * .6, r = 1.1 + Math.random() * .5, s = new V3(Math.cos(a) * .35, .2, Math.sin(a) * .35), e = new V3(Math.cos(a) * r, -.95 - 0.02, Math.sin(a) * r);
    const pts = []; for (let k = 0; k <= 10; k++) { const u = k / 10, p = s.clone().lerp(e, u); p.y -= .25 * 4 * u * (1 - u); pts.push(p) } parts.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 10, .012, 3, false)) } return mergeG(parts) }
function web(tg, saved) { if (P.frozen.has(tg.id)) thaw(tg.id, true); if (P.webbed.has(tg.id)) return; if (!saved) sfx('thwip');
  if (saved) { tg.obj.position.set(saved.x, saved.y, saved.z); tg.obj.updateMatrixWorld(true) }
  const fx = attachFx(tg, g => { const co = new T.Mesh(cocoonGeo(), pearlMat); g.add(co); const sh = new T.Mesh(shellG, shellMat); sh.scale.set(.46, .9, .46); g.add(sh); const an = new T.Mesh(anchorGeo(), pearlMat); g.add(an) });
  if (!saved) { fx.scale.multiplyScalar(.05); P.fx.push({ t0: U.t.value, dur: .35, s1: tg.h() / 1.9, step(k) { fx.scale.setScalar(this.s1 * (.05 + .95 * (1 - (1 - k) ** 3))) } }) }
  if (tg.fig) tg.fig.qHold = true; P.webbed.set(tg.id, { tg, S: snap(tg.obj), fx }); saveWebs(); if (!saved) say('🕸 Webbed: ' + tg.name + ' (aim + hold A to clear)') }
function unweb(id) { const W = P.webbed.get(id); if (!W) return; P.webbed.delete(id); saveWebs(); if (W.tg.fig) W.tg.fig.qHold = false; sfx('snap'); const g = W.fx, Fl = floor();
  const n = LITE() ? 10 : 24, pts = new Float32Array(n * 3), vel = []; for (let i = 0; i < n; i++) { pts.set([(Math.random() - .5) * .8, (Math.random() - .5) * 1.6, (Math.random() - .5) * .8], i * 3); vel.push(new V3((Math.random() - .5) * .6, .4 + Math.random() * .6, (Math.random() - .5) * .6)) }
  const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pts, 3)); const sp = new T.Points(pg, sparkMat.clone()); g.add(sp); const s0 = g.scale.x;
  P.fx.push({ t0: U.t.value, dur: .6, step(k, dt) { const w = k < .3 ? 1 + .15 * Math.sin(k / .3 * Math.PI * 3) * (1 - k / .3) : 1; for (const c of g.children) if (c !== sp) c.scale.setScalar(Math.max(.01, (1 - k) * (c.geometry === shellG ? .9 : 1)) * w), c.visible = k < .5;
    const p = pg.attributes.position; for (let i = 0; i < n; i++) p.setXYZ(i, p.getX(i) + vel[i].x * dt, p.getY(i) + vel[i].y * dt, p.getZ(i) + vel[i].z * dt); p.needsUpdate = true; sp.material.opacity = .9 * (1 - k) }, end() { Fl.remove(g) } }) }
function saveWebs() { const o = {}; for (const [id, W] of P.webbed) { const p = W.S[0][1]; o[id] = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), t: Date.now() } } localStorage[LS.webs] = JSON.stringify(o) }
let pendingWebs = {}; try { pendingWebs = JSON.parse(localStorage[LS.webs] || '{}') } catch (e) { }
// TOW
function tow(tg) { if (P.towing) return release(); if (window.QSHIP && QSHIP.on) return say('Tow line: exit the ship first');
  const R = ribbon(towM), G = LITE() ? null : ribbon(towG), F = floor(); F.add(R); G && F.add(G); const sp = new T.Mesh(new T.CircleGeometry(.18, 12), pearlMat); F.add(sp);
  P.towing = { tg, R, G, sp, t0: U.t.value }; sfx('tow'); say('🪢 Tow line on ' + tg.name + ' (A again to release)') }
function release(quiet) { const W = P.towing; if (!W) return; P.towing = null; const F = floor(); F.remove(W.R); W.G && F.remove(W.G); F.remove(W.sp); W.R.geometry.dispose(); W.G && W.G.geometry.dispose(); if (!quiet) { sfx('release'); say('Tow released') } }
// ---------- shots in flight
const drops = new T.InstancedMesh(dropG, dropMat, 30); drops.frustumCulled = false; drops.count = 0; drops.renderOrder = 31; let D = [];
let strandShot = null;
function fire() { const A = aimHit(); if (!A) return; const F = floor(); if (!drops.parent) F.add(drops); const w = P.weapon, hit = A.hit;
  if (w === 2 && P.towing) return release();
  if (w === 0) { sfx('squirt'); const end = hit ? hit.c.clone() : A.o.clone().addScaledVector(A.d, 25), dist = A.o.distanceTo(end), spd = Math.max(18, dist / .9), tt = dist / spd;
    const v = end.clone().sub(A.o).divideScalar(tt); v.y += .5 * 9.8 * tt;   // ballistic: lands on 'end' at tt
    for (let i = 0; i < 12; i++) D.push({ p: A.o.clone(), v: v.clone().multiplyScalar(1 + (Math.random() - .5) * .04).add(new V3((Math.random() - .5) * .3, (Math.random() - .5) * .3, (Math.random() - .5) * .3)), age: -i * .02, life: tt + .05, hit: i === 0 && hit ? hit.tg : null, splash: i === 0 });
    if (D.length > 30) D = D.slice(-30); return }
  if (!hit) { sfx('thwip'); return say('Missed - aim at a bot, Ren, the ghost or a performer') }
  if (w === 1) { if (P.webbed.has(hit.tg.id)) return say('Already webbed - hold A to clear'); const R = ribbon(silkM), G = LITE() ? null : ribbon(glowM); F.add(R); G && F.add(G); strandShot = { R, G, tg: hit.tg, t0: U.t.value, dur: Math.min(.5, .12 + hit.t / 120) }; sfx('thwip'); return }
  if (w === 2) return tow(hit.tg) }
function longPress() { const A = aimHit(), hit = A && A.hit; if (P.weapon === 0) { const n = P.frozen.size; for (const id of [...P.frozen.keys()]) thaw(id); say(n ? 'Thawed all (' + n + ')' : 'Nothing frozen') }
  else if (P.weapon === 1) { if (hit && P.webbed.has(hit.tg.id)) unweb(hit.tg.id); else say('Aim at a webbed being, then hold A to clear it (panel: Clear all webs)') } else release() }
// ---------- per-frame
let aWas = false, aT = 0, sWas = false, gWas = false, lastT = performance.now(), lastTg = 0, hud = null;
function hudUpdate() { if (!hud) { hud = document.createElement('a-text'); hud.setAttribute('align', 'center'); hud.setAttribute('width', .5); hud.setAttribute('position', '0 .06 -.06'); hud.setAttribute('rotation', '-50 0 0'); document.getElementById('rh').appendChild(hud) }
  const s = P.enabled ? NAMES[P.weapon] + (P.towing ? ' · towing' : '') : ''; if (s !== P.last) { P.last = s; hud.setAttribute('value', s); hud.setAttribute('color', COLS[P.weapon]); hud.setAttribute('visible', !!s) } }
function frame() { const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1000); lastT = now; U.t.value += dt;
  if (now - lastTg > 1000) { lastTg = now; P.targets = targets(); for (const tg of P.targets) if (pendingWebs[tg.id]) { const s = pendingWebs[tg.id]; delete pendingWebs[tg.id]; web(tg, s) } hudUpdate() }
  const ss = sc.xrSession; if (ss && P.enabled) { let a = false, s = false, g = false; for (const src of ss.inputSources) if (src.handedness === 'right' && src.gamepad) { const B = src.gamepad.buttons; a = !!(B[4] && B[4].pressed); s = !!(B[3] && B[3].pressed); g = !!(B[1] && B[1].pressed) }
    if (s && !sWas) { P.weapon = (P.weapon + 1) % 3; localStorage[LS.w] = P.weapon; sfx('switch'); say('Weapon: ' + NAMES[P.weapon]); hudUpdate() } sWas = s;
    const f = a || g; if (f && !aWas) aT = now; if (!f && aWas) { if (now - aT > 600) longPress(); else fire() } aWas = f }
  // holds: frozen until expiry, webs forever. Restore AFTER the beings' own ticks (this component ticks last).
  for (const [id, F] of P.frozen) { if (now > F.until || !F.tg.obj.parent) { thaw(id); continue } if (F.tg.fig) F.tg.fig.qHold = true; restore(F.S); F.fx.children.forEach(c => { if (c.userData.puff) { const k = Math.min(1, (U.t.value - c.userData.puff.t0) / .7); c.position.copy(c.userData.puff.d).multiplyScalar(k * .8); c.scale.setScalar(.4 + k * 1.4); c.material.opacity = .7 * (1 - k); c.visible = k < 1 } if (c.userData.tw) c.material.size = .04 + .03 * Math.abs(Math.sin(U.t.value * 6)) }) }
  for (const [id, W] of P.webbed) { if (!W.tg.obj.parent) { const tg = P.targets.find(x => x.id === id); if (tg && tg.obj !== W.tg.obj) { W.tg = tg; tg.obj.position.copy(W.S[0][1]); W.S = snap(tg.obj); if (tg.fig) tg.fig.qHold = true } continue } restore(W.S) }
  // water droplets
  if (D.length) { const m4 = new T.Matrix4(), F = floor(), lp = new V3(); let n = 0; for (const d of D) { d.age += dt; if (d.age < 0) continue; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt); if (d.age > d.life) { if (d.hit) { freeze(d.hit); d.hit = null } d.dead = 1; continue } lp.copy(d.p); F.worldToLocal(lp); m4.makeTranslation(lp.x, lp.y, lp.z); drops.setMatrixAt(n++, m4) } D = D.filter(d => !d.dead); drops.count = n; drops.instanceMatrix.needsUpdate = true }
  // web strand in flight -> cocoon
  if (strandShot) { const S = strandShot, F = floor(), k = Math.min(1, (U.t.value - S.t0) / S.dur), a = new V3(), b = centerOf(S.tg, new V3()); rh().getWorldPosition(a); F.worldToLocal(a); F.worldToLocal(b);
    setRibbon(S.R, a, b, .02 * a.distanceTo(b), .025, .05, k); S.G && setRibbon(S.G, a, b, .02 * a.distanceTo(b), .09, .05, k);
    if (k >= 1) { web(S.tg); P.fx.push({ t0: U.t.value, dur: .25, step(q) { S.R.material = silkM; S.R.scale.setScalar(1); S.R.visible = q < .9; S.G && (S.G.visible = q < .5) }, end() { F.remove(S.R); S.G && F.remove(S.G); S.R.geometry.dispose(); S.G && S.G.geometry.dispose() } }); strandShot = null } }
  // tow: strand + drag the rig ~4 m behind (eased; only horizontal unless flying)
  if (P.towing) { const W = P.towing, tg = W.tg, F = floor(); if (!tg.obj.parent || !P.targets.some(x => x.obj === tg.obj)) { release(); say('Tow released (target gone)') }
    else { const tp = new V3(); tg.obj.getWorldPosition(tp); const cam = sc.camera, cp = new V3(); cam.getWorldPosition(cp); const rig = document.getElementById('rig').object3D;
      const dx = cp.x - tp.x, dz = cp.z - tp.z, dh = Math.hypot(dx, dz) || 1, want = Math.max(3, Math.min(5, dh)), gx = tp.x + dx / dh * want, gz = tp.z + dz / dh * want, k = 1 - Math.exp(-dt / .8);
      rig.position.x += (gx - cp.x) * k; rig.position.z += (gz - cp.z) * k; const fly = window.QFLY && QFLY.alt > .5; if (!fly) rig.position.y += (0 - rig.position.y) * k;
      const a = new V3(), b = centerOf(tg, new V3()); rh().getWorldPosition(a); F.worldToLocal(a); F.worldToLocal(b); const d = a.distanceTo(b), slack = Math.max(0, 5.5 - d) * .12; setRibbon(W.R, a, b, slack, .03, 0); W.G && setRibbon(W.G, a, b, slack, .1, 0);
      W.sp.position.copy(b); W.sp.lookAt(a) } }
  // effects
  P.fx = P.fx.filter(e => { const k = Math.min(1, (U.t.value - e.t0) / e.dur); e.step && e.step(k, dt); if (k >= 1) { e.end && e.end(); return false } return true }) }
function say(t) { try { window.qSay ? qSay(t) : console.log(t) } catch (e) { } }
function holdApply() { for (const F of P.frozen.values()) { restore(F.S); F.tg.obj.updateMatrixWorld(true) } for (const W of P.webbed.values()) if (W.tg.obj.parent) { restore(W.S); W.tg.obj.updateMatrixWorld(true) } }
{ const so = sc.object3D, prev = so.onBeforeRender; so.onBeforeRender = function (...a) { try { holdApply() } catch (e) { } return prev && prev.apply(this, a) } }   // after every tick / rAF animation, before drawing
AFRAME.registerComponent('qpow-tick', { tick() { try { frame() } catch (e) { if (!P._err) { P._err = 1; console.warn('qpow', e) } } } });
sc.setAttribute('qpow-tick', '');
export const POW = Object.assign(P, { fire, longPress, freeze, web, unweb, tow, release, thaw,
  setEnabled(v) { P.enabled = !!v; localStorage[LS.on] = v ? '1' : '0'; if (!v) release(true); hudUpdate() }, setWeapon(w) { P.weapon = ((w % 3) + 3) % 3; localStorage[LS.w] = P.weapon; hudUpdate() },
  thawAll() { for (const id of [...P.frozen.keys()]) thaw(id) }, clearWebs() { for (const id of [...P.webbed.keys()]) unweb(id); localStorage[LS.webs] = '{}'; pendingWebs = {} }, get names() { return NAMES } });
