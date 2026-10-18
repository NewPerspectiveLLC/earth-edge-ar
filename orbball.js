// orbball.js (d46): the visible Master DJ "flying sound" orb. Follows orbit.js (the same offsets that drive the HRTF panner in audio.js), so what you see is what you hear.
// Neon purple plasma/fire ball, 10 m across: fbm value-noise fire surface with scrolling flames + fresnel rim (opaque, 1 draw), animated flame corona billboard (1),
// two additive glow halos (2), ember/spark particles shed into the world as a trail (1 draw, Points), Matt Ready "Project Driftwood" billboard hanging below it (1) with a
// purple underglow (1). Everything pulses to the beat (beat.js?v=1792350103534). LOD: fewer shader octaves + embers on phones/Quest and when far. Visible while the music player is on
// Master DJ with Flying sound on and the DJ playing. Also plants ONE copy of the same image on the ground 6-10 m from the player at their first fix: client-side only, never sent.
import * as THREE from 'three';
import { ORB, frame as orbFrame } from './orbit.js?v=1792350103534';
import * as BEAT from './beat.js?v=1792350103534';
const MOBILE = /iPhone|iPad|iPod|Android|OculusBrowser|Quest|Mobile/i.test(navigator.userAgent);
const NOISE = `float hh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z);}
uniform float oct,t,pulse,lin;
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){if(float(i)>=oct)break;s+=a*n3(p);p=p*2.03+vec3(1.7,-t*.9,3.1);a*=.5;}return s;}
const vec3 DEEP=vec3(.02,.0,.09),VIO=vec3(.30,.0,1.),MAG=vec3(.85,.0,.55),HOT=vec3(1.,.72,1.);/* linear-light: #2a0055 deep, #9400ff neon purple, #f000c0 magenta, #ffdcff hot white */`;
const CORE_V = `varying vec3 vP,vN,vV;void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
const CORE_F = NOISE + `varying vec3 vP,vN,vV;void main(){vec3 p=vP*.42;float f=fbm(p+vec3(0.,-t*1.5,0.));float g=fbm(p*1.6+vec3(f*2.2,-t*2.3,f*1.3));
float k=pow(clamp(g*1.3-.1+vP.y*.03,0.,1.),1.6)*(1.+.4*pulse);float fr=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.2);
vec3 c=mix(DEEP,VIO,smoothstep(.10,.45,k));c=mix(c,MAG,smoothstep(.58,.82,k));c=mix(c,HOT,smoothstep(.84,1.,k)*(1.-fr));
c+=mix(VIO,MAG,.3+.3*sin(t*.7))*fr*1.2;c+=VIO*pow(1.-fr,6.)*.06*(1.+pulse);gl_FragColor=vec4(c*(.8+.35*pulse+.2*lin),1.);
#include <colorspace_fragment>
}`;
const COR_V = `varying vec2 vU;void main(){vU=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const COR_F = NOISE + `uniform float rb;varying vec2 vU;void main(){float r=length(vU)*2.,a=atan(vU.y,vU.x);
float fl=fbm(vec3(cos(a)*2.2,sin(a)*2.2,r*4.-t*2.2))+.5*fbm(vec3(cos(a)*5.,sin(a)*5.,-t*3.1));
float out_=1.-smoothstep(rb,rb+.16+.42*fl*(1.+.6*pulse),r),inn=smoothstep(rb-.06,rb+.01,r),v=out_*inn;
vec3 c=mix(VIO,MAG,smoothstep(.45,.95,fl));c=mix(c,HOT,smoothstep(.8,1.,v)*.5);vec3 o=c*v*(1.2+.8*pulse);gl_FragColor=vec4(o,max(v,max(o.r,max(o.g,o.b))));/* d46d: alpha>=rgb (valid premultiplied) */}`;
const EMB_V = `attribute float life,seed;uniform float sz;varying float vL;void main(){vL=life;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=min(40.,sz*(1.-life*.6)*(300./max(1.,-mv.z)));gl_Position=projectionMatrix*mv;}`;
const EMB_F = `varying float vL;void main(){vec2 d=gl_PointCoord-.5;float m=smoothstep(.5,.0,length(d));if(vL>=1.)discard;
vec3 c=mix(vec3(1.,.9,1.),vec3(1.,.16,.82),smoothstep(.0,.3,vL));c=mix(c,vec3(.55,.08,1.),smoothstep(.3,.8,vL));float a=m*(1.-vL);gl_FragColor=vec4(c*a,a);}`;
const additive = (m, pre = true) => { m.transparent = true; m.depthWrite = false; m.blending = THREE.CustomBlending; m.blendSrc = pre ? THREE.OneFactor : THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneFactor; return m };  /* additive; d46d: also ADDS its alpha so the canvas stays valid premultiplied (rgb<=a). Leaving alpha at 0 made glow pixels rgb>a, which iOS WebKit composites as a wash over the page background */
function glowTex(stops) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }
const D = Math.PI / 180;
export function initOrb(parent, toLocal, cam, opts = {}) {
  const R = ORB.diameterM / 2, root = new THREE.Group(); root.name = 'dj-orb'; parent.add(root); root.visible = false;
  const U = { t: { value: 0 }, oct: { value: MOBILE ? 3 : 5 }, pulse: { value: 0 }, lin: { value: 0 } };
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(R, MOBILE ? 3 : 4), new THREE.ShaderMaterial({ uniforms: U, vertexShader: CORE_V, fragmentShader: CORE_F })); root.add(core);
  const UC = { ...U, oct: { value: MOBILE ? 2 : 3 }, rb: { value: R / 11 * .5 * 2 } };   // corona plane 22 m: ball radius = 5/11 of the half-size
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), additive(new THREE.ShaderMaterial({ uniforms: UC, vertexShader: COR_V, fragmentShader: COR_F }))); corona.renderOrder = 5; root.add(corona);
  const hT1 = glowTex([[0, 'rgba(225,160,255,.95)'], [.25, 'rgba(160,40,255,.7)'], [.6, 'rgba(100,10,200,.22)'], [1, 'rgba(60,0,120,0)']]), hT2 = glowTex([[0, 'rgba(200,50,255,.5)'], [.5, 'rgba(140,20,255,.16)'], [1, 'rgba(80,0,160,0)']]);
  const halo1 = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: hT1, color: 0xffffff }), false)), halo2 = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: hT2, color: 0xffffff }), false));
  halo1.scale.set(19, 19, 1); halo2.scale.set(34, 34, 1); halo1.renderOrder = 4; halo2.renderOrder = 3; root.add(halo1, halo2);
  // embers: world-space trail (child of parent, not of root)
  const NE = MOBILE ? 180 : 420, eP = new Float32Array(NE * 3), eV = new Float32Array(NE * 3), eL = new Float32Array(NE).fill(1), eS = new Float32Array(NE), eLt = new Float32Array(NE);
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(eP, 3).setUsage(THREE.DynamicDrawUsage)); eg.setAttribute('life', new THREE.BufferAttribute(eL, 1).setUsage(THREE.DynamicDrawUsage)); eg.setAttribute('seed', new THREE.BufferAttribute(eS, 1));
  const embers = new THREE.Points(eg, additive(new THREE.ShaderMaterial({ uniforms: { sz: { value: MOBILE ? 1.1 : .9 } }, vertexShader: EMB_V, fragmentShader: EMB_F }))); embers.frustumCulled = false; embers.renderOrder = 6; parent.add(embers);
  // Project Driftwood billboard under the orb + underglow
  const tl = new THREE.TextureLoader(), ver = window.EEAR_V ? '?v=' + EEAR_V : '', imgTex = tl.load(ORB.image + ver, t => { const a = t.image.width / t.image.height; matt.scale.x = a * ORB.imageH; spawn.scale.x = a * ORB.spawnH }); imgTex.colorSpace = THREE.SRGBColorSpace; imgTex.anisotropy = 4;
  const imgMat = new THREE.MeshBasicMaterial({ map: imgTex, alphaTest: .5, side: THREE.DoubleSide });   // unlit; alphaTest so a transparent-bottom image would cut out cleanly (this JPEG is opaque)
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);   // origin at bottom centre
  const matt = new THREE.Mesh(plane, imgMat); const mattG = new THREE.Group(); mattG.add(matt); matt.scale.set(.667 * ORB.imageH, ORB.imageH, 1); root.add(mattG);
  const under = new THREE.Sprite(additive(new THREE.SpriteMaterial({ map: hT1, color: 0xc070ff, opacity: .55 }), false)); under.scale.set(9, 6, 1); root.add(under);
  // spawn copy (client-side only)
  const spawn = new THREE.Mesh(plane, imgMat); spawn.scale.set(.667 * ORB.spawnH, ORB.spawnH, 1); spawn.visible = false; parent.add(spawn);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.5, 1.0, 32).rotateX(-Math.PI / 2), additive(new THREE.MeshBasicMaterial({ color: 0x8a2be2, opacity: .45, side: THREE.DoubleSide }), false)); ring.visible = false; parent.add(ring);
  const S = { spawn: null, near: 0, dist: 0, visible: false, emitted: 0, t0: performance.now(), lod: 'near' };
  const cp = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(); let acc = 0, ei = 0;
  function update(dt) {
    dt = Math.min(.1, dt || 0); const now = performance.now(), t = (now - S.t0) / 1000, AU = window.EEAR_AUDIO, DJ = window.EEAR_DJ, L = AU && AU.listener;
    // spawn copy: first listener fix -> random bearing, 6-10 m, kept only in memory
    if (!S.spawn && L && isFinite(L.lat)) { const b = Math.random() * 360, d = ORB.spawnM[0] + Math.random() * (ORB.spawnM[1] - ORB.spawnM[0]);
      S.spawn = { lat: L.lat + d * Math.cos(b * D) / 111320, lon: L.lon + d * Math.sin(b * D) / (111320 * Math.cos(L.lat * D)), d, b } }
    cam.getWorldPosition(cp); parent.worldToLocal(cp);
    if (S.spawn) { const w = toLocal(S.spawn.lat, S.spawn.lon); if (w) { spawn.position.copy(w); ring.position.copy(w); ring.position.y += .03; spawn.rotation.y = Math.atan2(cp.x - w.x, cp.z - w.z); spawn.visible = ring.visible = true; ring.material.opacity = .35 + .25 * Math.sin(t * 2) } }
    const O = orbFrame(now), show = !!(AU && AU.flyOn && DJ && DJ.at().playing); S.visible = root.visible = show;
    // beat pulse
    let pulse = 0; try { const st = BEAT.tick(); if (st && st.on && st.beat >= 0) pulse = Math.exp(-5 * (st.beat - Math.floor(st.beat))) * .8 + Math.min(.4, (st.energy || 0) * .4) } catch (e) { }
    U.pulse.value += (pulse - U.pulse.value) * Math.min(1, dt * 20); U.t.value = t; U.lin.value = O.linger || 0;
    if (show) {
      const bob = Math.sin(t * 1.3) * .35; root.position.set(cp.x + O.e, cp.y + O.u + bob, cp.z - O.n);
      const d = root.position.distanceTo(cp); S.dist = d; const far = d > 35, vfar = d > 300; S.lod = vfar ? 'tour' : far ? 'far' : 'near';
      U.oct.value = (MOBILE ? 3 : 5) - (far ? 1 : 0) - (vfar ? 1 : 0); UC.oct.value = (MOBILE ? 2 : 3) - (far && !MOBILE ? 1 : 0);
      const s = 1 + .06 * U.pulse.value; core.scale.setScalar(s); corona.quaternion.copy(cam.getWorldQuaternion(qa)).premultiply(parent.getWorldQuaternion(qb).invert());   // camera-facing billboard in the parent frame
      /* d46d: halos are capped in SCREEN size relative to the ball (they used to be a fixed 19/34 m, i.e. 1.9x/3.4x the ball radius, so at 15-45 m the outer one
         filled most of the view and washed the map/lines pale blue-lavender, esp. on iOS over the satellite imagery). Halo radius <= ball's angular radius x1.25 (+1.5 deg) / x1.5 (+2.5 deg); wide halos also dim. */
      const cA = Math.asin(Math.min(.99, R / Math.max(d, R + .01))), hs = (nom, k, add) => 2 * d * Math.tan(Math.min(Math.atan(nom / 2 / d), cA * k + add * D));
      const h1 = hs(19 * (1 + .1 * U.pulse.value), 1.25, 1.5), h2 = hs(34, 1.5, 2.5), dim = Math.min(1, 9 * D / Math.max(1e-3, Math.atan(h2 / 2 / d) - cA));
      halo1.material.opacity = (.45 + .3 * U.pulse.value + .15 * U.lin.value) * (.6 + .4 * dim); halo2.material.opacity = (.25 + .2 * U.pulse.value) * dim; halo1.scale.set(h1, h1, 1); halo2.scale.set(h2, h2, 1); S.halo = [h1, h2];
      mattG.position.set(0, -R - .4 - ORB.imageH, 0); mattG.rotation.y = Math.atan2(cp.x - root.position.x, cp.z - root.position.z); under.position.set(0, -R - .6, 0); under.material.opacity = .45 + .3 * U.pulse.value;
      // embers: emit from the surface, live 1.4-3 s, drift up + outward with curl-ish wobble; stay in the world as the orb moves (trail)
      const rate = (NE / 2.2) * (far ? .45 : 1) * (1 + U.pulse.value); acc += rate * dt;
      while (acc >= 1) { acc--; const i = ei; ei = (ei + 1) % NE; const u = Math.random() * 2 - 1, a = Math.random() * 6.283, sr = Math.sqrt(1 - u * u), nx = sr * Math.cos(a), ny = u, nz = sr * Math.sin(a);
        eP[i * 3] = root.position.x + nx * R; eP[i * 3 + 1] = root.position.y + ny * R; eP[i * 3 + 2] = root.position.z + nz * R; const sp = .6 + Math.random() * 1.6;
        eV[i * 3] = nx * sp; eV[i * 3 + 1] = ny * sp + 1 + Math.random(); eV[i * 3 + 2] = nz * sp; eL[i] = 0; eLt[i] = 1.4 + Math.random() * 1.6; eS[i] = Math.random(); S.emitted++ }
    }
    for (let i = 0; i < NE; i++) { if (eL[i] >= 1) continue; eL[i] = Math.min(1, eL[i] + dt / eLt[i]); const k = i * 3, w = t * 2 + eS[i] * 40;
      eV[k] += Math.sin(w) * .8 * dt; eV[k + 2] += Math.cos(w * 1.3) * .8 * dt; eV[k + 1] += .4 * dt; eP[k] += eV[k] * dt; eP[k + 1] += eV[k + 1] * dt; eP[k + 2] += eV[k + 2] * dt }
    eg.attributes.position.needsUpdate = eg.attributes.life.needsUpdate = true; embers.visible = show || eL.some(x => x < 1);
  }
  root.traverse(o => o.frustumCulled = false);   /* never culled: perspective shrink only, no min size (also on 1-3 km trail tours) */
  const api = { update, root, core, embers, spawn, state: S, get orbit() { return window.EEAR_ORB }, MOBILE, drawCalls: 7 };
  return api;
}
