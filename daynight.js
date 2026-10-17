// daynight.js — real day/night cycle for Matt's Reality (index.html + quest.html).
// Night factor comes from the REAL sun altitude (astronomy-engine, same clock as the Sun/Moon bodies).
// Clock: Real (default) · Fast cycle (1 day ≈ 10 min) · preview slider / ?t=HH:MM or ?t=ISO.
// Night scene: sky gradient + sidereal-rotating star field (camera off / desktop / VR only), cool hemi light,
// glowing pillars + ground rings + km-visible halos at Ready Athletics and Cappy's Trails, glowing trail ribbons
// along REAL path geometry (trails.json: OSM ways + WA parcel outlines). Broadcasts window 'eear:night' {f,phase,sunAlt}
// and calls setNight(f) on EEAR_CIRCLE / EEAR_REN / EEAR_PERFORMERS when present.
const D=Math.PI/180;
const sst=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
export const phaseOf=a=>a>-0.833?'day':a>-6?'civil twilight':a>-12?'nautical twilight':a>-18?'astronomical twilight':'night';
export const nightOf=a=>sst(1,-12,a);/* 0 = day (sun > 1°), 1 = full night (sun < -12°, end of nautical twilight) */
export const starsOf=a=>sst(-3,-14,a);
const KEYS=[[20,'#1b4c8c','#5f92c8'],[6,'#22528f','#86a9cb'],[0,'#2b4a7e','#e08a55'],[-4,'#1a2a5c','#9a5a52'],[-8,'#0b1638','#3a3052'],[-12,'#050b22','#151b37'],[-18,'#02040f','#070b19']];
const hx=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function skyCols(alt){let z,h;if(alt>=KEYS[0][0]){z=hx(KEYS[0][1]);h=hx(KEYS[0][2])}else if(alt<=KEYS[KEYS.length-1][0]){const k=KEYS[KEYS.length-1];z=hx(k[1]);h=hx(k[2])}
 else for(let i=0;i<KEYS.length-1;i++){const a=KEYS[i],b=KEYS[i+1];if(alt<=a[0]&&alt>=b[0]){const t=sst(0,1,(a[0]-alt)/(a[0]-b[0]));z=mix(hx(a[1]),hx(b[1]),t);h=mix(hx(a[2]),hx(b[2]),t);break}}
 const g=mix(h,[0,0,0],.72);return{zen:z,hor:h,gnd:g}}
export const css=c=>'rgb('+c.map(v=>Math.round(v*255)).join(',')+')';
export function bodyGradient(c){return`linear-gradient(${css(c.zen)},${css(mix(c.zen,c.hor,.55))} 38%,${css(c.hor)} 55%,${css(c.gnd)} 56%,#000)`}

// ---- clock -------------------------------------------------------------------------------------------------
const ptMin=d=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(d);const g=k=>+p.find(x=>x.type===k).value;return g('hour')*60+g('minute')+g('second')/60};
export function makeClock(base){const C={mode:localStorage.eearTimeMode==='fast'?'fast':'real',ov:null,ovAbs:null,FAST:144};
 const tq=new URLSearchParams(location.search).get('t');if(tq){const m=/^(\d{1,2})(?::(\d\d))?$/.exec(tq);if(m)C.ov=(+m[1])*60+(+(m[2]||0));else{const t=Date.parse(tq);if(!isNaN(t))C.ovAbs=t}}
 let A=base().getTime(),P=performance.now();
 C.setMode=m=>{const d=C.date();C.mode=m;C.ov=null;C.ovAbs=null;localStorage.eearTimeMode=m;A=m==='fast'?d.getTime():base().getTime();P=performance.now()};
 C.preview=min=>{C.ov=min==null?null:+min;C.ovAbs=null};
 C.date=()=>{if(C.ovAbs!=null)return new Date(C.ovAbs);let d=C.mode==='fast'?new Date(A+(performance.now()-P)*C.FAST):base();if(C.ov!=null)d=new Date(d.getTime()+(C.ov-ptMin(d))*60000);return d};
 C.ptMin=()=>ptMin(C.date());C.label=()=>(C.ovAbs!=null||C.ov!=null?'Preview':C.mode==='fast'?'Fast cycle':'Real');return C}

// ---- stars: ~70 real bright stars (J2000 RA h, Dec °, mag) + seeded faint field -------------------------------
const BRIGHT=[[6.752,-16.72,-1.46],[14.261,19.18,-.05],[18.616,38.78,.03],[5.278,46.0,.08],[5.242,-8.2,.13],[7.655,5.22,.38],[5.919,7.41,.5],[19.846,8.87,.77],[4.599,16.51,.85],[13.42,-11.16,1.04],[16.49,-26.43,1.06],[7.755,28.03,1.14],[22.961,-29.62,1.16],[20.69,45.28,1.25],[10.139,11.97,1.35],[7.577,31.89,1.58],[5.418,6.35,1.64],[5.438,28.61,1.65],[5.603,-1.2,1.69],[5.679,-1.94,1.74],[5.533,-.3,2.23],[5.796,-9.67,2.06],
 [2.53,89.26,1.98],[11.062,61.75,1.79],[11.031,56.38,2.37],[11.897,53.69,2.44],[12.257,57.03,3.31],[12.9,55.96,1.77],[13.399,54.93,2.27],[13.792,49.31,1.86],
 [.675,56.54,2.24],[.153,59.15,2.28],[.945,60.72,2.47],[1.43,60.24,2.68],[1.907,63.67,3.38],
 [3.405,49.86,1.79],[2.065,42.33,2.1],[1.162,35.62,2.07],[.14,29.09,2.06],[23.079,15.21,2.49],[23.063,28.08,2.42],[.221,15.18,2.83],
 [17.582,12.56,2.07],[16.5,21.49,2.78],[15.578,26.71,2.23],[14.75,27.07,2.35],[13.792,49.31,1.86],[17.943,51.49,2.23],[19.512,27.96,3.05],[20.37,40.26,2.23],[19.77,10.61,2.72],
 [3.792,24.11,2.87],[4.33,15.63,3.65],[5.992,44.95,1.9],[6.629,16.4,1.93],[7.335,21.98,3.53],[8.159,-47.34,1.83],[9.46,-8.66,1.98],[10.333,19.84,2.08],[11.818,14.57,2.13],[11.235,20.52,2.56],
 [12.694,-1.45,2.74],[14.718,-60.84,-.27],[17.56,-37.1,1.62],[18.403,-34.38,1.85],[20.427,-56.74,1.94],[0.438,-17.99,2.04],[2.12,23.46,2.0],[3.038,4.09,2.53],[21.736,9.88,2.38],[22.137,-.32,2.95],[16.0,-22.62,2.29]];
function starField(T,radius){let s=7;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;const P=[],S=[],C=[];
 const add=(ra,de,mag,col)=>{const a=ra*15*D,d=de*D;P.push(Math.cos(d)*Math.cos(a)*radius,Math.cos(d)*Math.sin(a)*radius,Math.sin(d)*radius);S.push(Math.max(1.2,6.2-mag*1.15));C.push(...col)};
 for(const[ra,de,m]of BRIGHT)add(ra,de,m,[1,1,1]);
 for(let i=0;i<1600;i++){const z=rnd()*2-1,ra=rnd()*24,mag=3+Math.pow(rnd(),.6)*3.4,t=rnd();add(ra,Math.asin(z)/D,mag,t<.2?[1,.86,.72]:t<.4?[.78,.86,1]:[1,1,1])}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(P),3));g.setAttribute('sz',new T.BufferAttribute(new Float32Array(S),1));g.setAttribute('col',new T.BufferAttribute(new Float32Array(C),3));
 const m=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,uniforms:{op:{value:0},px:{value:Math.min(2,window.devicePixelRatio||1)},t:{value:0}},
  vertexShader:'attribute float sz;attribute vec3 col;uniform float px,t;varying vec3 vC;varying float vA;void main(){vec3 w=normalize((modelMatrix*vec4(position,0.)).xyz);vA=smoothstep(-.01,.06,w.y)*(.85+.15*sin(t*2.3+position.x*.37));vC=col;gl_PointSize=sz*px;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float op;varying vec3 vC;varying float vA;void main(){vec2 q=gl_PointCoord-.5;float r=length(q);if(r>.5)discard;float a=1.-smoothstep(0.,.5,r);a*=a;gl_FragColor=vec4(vC*a*op*vA,a*op*vA);}'});
 m.userData.pf=1;const p=new T.Points(g,m);p.frustumCulled=false;p.renderOrder=-50;p.name='stars';p.matrixAutoUpdate=false;return p}
const gmstDeg=d=>{const jd=d.getTime()/864e5+2440587.5;return((280.46061837+360.98564736629*(jd-2451545))%360+360)%360};
function starMatrix(T,date,lat,lon){const th=(gmstDeg(date)+lon)*D,ph=lat*D,ct=Math.cos(th),st=Math.sin(th),cp=Math.cos(ph),sp=Math.sin(ph);
 return new T.Matrix4().set(-st,ct,0,0, ct*cp,st*cp,sp,0, ct*sp,st*sp,-cp,0, 0,0,0,1)}/* rows: scene X=E, Y=U, Z=-N from equatorial (x,y,z) */

// ---- glow materials ------------------------------------------------------------------------------------------
const addMat=(T,m)=>{m.blending=T.CustomBlending;m.blendEquation=T.AddEquation;m.blendSrc=T.SrcAlphaFactor;m.blendDst=T.OneFactor;m.blendSrcAlpha=T.ZeroFactor;m.blendDstAlpha=T.OneFactor;m.transparent=true;m.depthWrite=false;m.depthTest=false;m.userData.pf=1;m.userData.add=true;return m};
function beamMat(T,col,U){return addMat(T,new T.ShaderMaterial({side:T.DoubleSide,uniforms:{c:{value:new T.Color(col)},op:U.op,t:U.t},
 vertexShader:'varying float vY,vN;void main(){vY=uv.y;vec3 o=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;vN=length((cameraPosition-o).xz)/max(1e-6,length(modelMatrix[0].xyz));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 c;uniform float op,t;varying float vY,vN;void main(){float f=pow(1.-vY,1.6);float w=.75+.25*sin(vY*40.-t*3.);float nf=smoothstep(10.,45.,vN);gl_FragColor=vec4(mix(c,vec3(1.),.35*f)*w*nf,op*(.25+.75*f)*nf);}'}))}
function ringMat(T,col,U,r0,r1){return addMat(T,new T.ShaderMaterial({side:T.DoubleSide,uniforms:{c:{value:new T.Color(col)},op:U.op,t:U.t},
 vertexShader:'varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform vec3 c;uniform float op,t;varying vec2 vP;void main(){float r=length(vP);float core=1.-smoothstep(1.2,2.6,abs(r-${((r0+r1)/2).toFixed(1)}));float soft=(1.-smoothstep(${r0.toFixed(1)},${r1.toFixed(1)},r))*.35;float wave=.5+.5*sin(r*.35-t*2.);gl_FragColor=vec4(c*(core+soft*wave),op*max(core,soft*wave));}`}))}
function trailMat(T,col,U){return addMat(T,new T.ShaderMaterial({side:T.DoubleSide,uniforms:{c:{value:new T.Color(col)},op:U.op,t:U.t},
 vertexShader:'attribute float s;varying float vS;varying vec2 vU;void main(){vS=s;vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 c;uniform float op,t;varying float vS;varying vec2 vU;void main(){float edge=1.-pow(abs(vU.y*2.-1.),3.);float p=pow(.5+.5*sin(vS*.06-t*1.4),8.);gl_FragColor=vec4(mix(c,vec3(1.),p*.55)*(.55+.9*p),op*edge*(.6+.4*p));}'}))}
function haloTex(T,col){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64),k=new T.Color(col);const rgb=`${Math.round(k.r*255)},${Math.round(k.g*255)},${Math.round(k.b*255)}`;
 gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.12,`rgba(${rgb},.95)`);gr.addColorStop(.4,`rgba(${rgb},.35)`);gr.addColorStop(1,`rgba(${rgb},0)`);g.fillStyle=gr;g.fillRect(0,0,128,128);const t=new T.CanvasTexture(c);return t}
function ribbon(T,pts,w,y){/* pts: [Vector3] ground points -> flat strip w metres wide, raised y; attribute s = metres along */
 const P=[],UV=[],S=[],I=[];let s=0;for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let dx=b.x-a.x,dz=b.z-a.z;const L=Math.hypot(dx,dz)||1;dx/=L;dz/=L;
  if(i>0)s+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z);const nx=-dz*w/2,nz=dx*w/2,p=pts[i];P.push(p.x+nx,p.y+y,p.z+nz,p.x-nx,p.y+y,p.z-nz);UV.push(s,0,s,1);S.push(s,s);if(i)I.push(2*i-2,2*i-1,2*i,2*i-1,2*i+1,2*i)}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(P),3));g.setAttribute('uv',new T.BufferAttribute(new Float32Array(UV),2));g.setAttribute('s',new T.BufferAttribute(new Float32Array(S),1));g.setIndex(I);return g}
const densify=(L,step=4)=>{const o=[];for(let i=0;i<L.length-1;i++){const[a,b]=[L[i],L[i+1]];const d=Math.hypot((b[0]-a[0])*111320,(b[1]-a[1])*74400),n=Math.max(1,Math.ceil(d/step));for(let k=0;k<n;k++)o.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n])}o.push(L[L.length-1]);return o};

export const SITES=[{key:'vxRA',name:'Ready Athletics',lat:48.11035,lon:-122.80591,col:'#ffc800',trail:'#ffe070',trails:'ra'},{key:'vxCappy',name:"Cappy's Trails",lat:48.13165,lon:-122.79921,col:'#30ff60',trail:'#6dffc0',trails:'cappy',outline:'cappy_outline'}];
export const GARDEN={lat:48.1316475,lon:-122.7992293,col:'#c080ff'};

export function initDayNight(T,o){/* o: {scene, skyGroup(), skyRadius, base:()=>Date, latlon:()=>[lat,lon], pass:()=>bool, applySky(cols,f), trailsUrl} */
 const U={op:{value:0},t:{value:0}},UT={op:{value:0},t:U.t},UTG={op:{value:0},t:U.t},UG={op:{value:0},t:U.t};const C=makeClock(o.base);
 const N={clock:C,f:0,phase:'day',sunAlt:90,U,built:null};
 const hemi=new T.HemisphereLight(0xbfd8ff,0x3a3020,.9),sun=new T.DirectionalLight(0xffffff,1),moon=new T.DirectionalLight(0x9ab0ff,0);hemi.name='dnHemi';o.scene.add(hemi,sun,moon,sun.target,moon.target);N.lights={hemi,sun,moon};
 const stars=starField(T,o.skyRadius*.95);N.stars=stars;let starParent=null;
 let trailsJ=null;const tp=fetch(o.trailsUrl||'trails.json?v=1792279505907').then(r=>r.json()).then(j=>trailsJ=j).catch(e=>console.warn('trails',e));
 N.build=async(parent,proj)=>{await tp;if(N.built)N.built.parent&&N.built.parent.remove(N.built);const G=new T.Group();G.name='nightGlow';N.built=G;N.mats=[];
  for(const S of SITES){const sg=new T.Group();sg.userData.layer=o.layerOf?o.layerOf(S.key):undefined;G.add(sg);const c=proj(S.lat,S.lon,0);
   const bm=beamMat(T,S.col,U);for(const[r,h]of[[3.5,1500],[1.2,1500]]){const b=new T.Mesh(new T.CylinderGeometry(r,r,h,20,1,true),bm);b.position.copy(c).y+=h/2;b.renderOrder=9;b.frustumCulled=false;sg.add(b)}
   const rg=new T.Mesh(new T.RingGeometry(1,46,96,1).rotateX(-Math.PI/2),ringMat(T,S.col,U,6,46));rg.position.copy(c).y+=.12;rg.renderOrder=9;rg.frustumCulled=false;sg.add(rg);
   const hm=new T.SpriteMaterial({map:haloTex(T,S.col),transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,sizeAttenuation:false,opacity:0});hm.userData.pf=1;
   for(const h of[40,700]){const hs=new T.Sprite(hm);hs.position.copy(c).y+=h;hs.scale.setScalar(h>100?.05:.11);hs.renderOrder=10;hs.frustumCulled=false;sg.add(hs)}N.mats.push(hm);
   const TJ=trailsJ||{};const tm=trailMat(T,S.trail,UT),tg=trailMat(T,S.trail,UTG),lm=new T.LineBasicMaterial({color:S.trail,transparent:true,opacity:0,depthTest:false,depthWrite:false,blending:T.AdditiveBlending});lm.userData.pf=1;N.mats.push(lm);
   const lines=(TJ[S.trails]||[]).map(w=>w.pts);N['n_'+S.trails]=lines.length;if(!lines.length&&S.outline&&TJ[S.outline])lines.push(TJ[S.outline]);
   for(const L of lines){const pts=densify(L).map(([a,l])=>proj(a,l,0));const rb=new T.Mesh(ribbon(T,pts,1,.25),tm);rb.renderOrder=9;rb.frustumCulled=false;sg.add(rb);const gw=new T.Mesh(ribbon(T,pts,6,.22),tg);gw.renderOrder=9;gw.frustumCulled=false;sg.add(gw);
    const ln=new T.Line(new T.BufferGeometry().setFromPoints(pts.map(p=>p.clone().setY(p.y+.3))),lm);ln.renderOrder=9;ln.frustumCulled=false;sg.add(ln)}
   if(S.outline&&TJ[S.outline]){const pts=densify(TJ[S.outline],3).map(([a,l])=>proj(a,l,0));const ol=new T.Mesh(ribbon(T,pts,.6,.2),trailMat(T,S.col,UT));ol.renderOrder=9;ol.frustumCulled=false;sg.add(ol)}}
  /* Matt's Meditation Garden glowing circle (fallback until circle.js provides EEAR_CIRCLE) */
  {const c=proj(GARDEN.lat,GARDEN.lon,0);const gc=new T.Mesh(new T.RingGeometry(1,9,64,1).rotateX(-Math.PI/2),ringMat(T,GARDEN.col,UG,3,9));gc.position.copy(c).y+=.15;gc.renderOrder=9;gc.frustumCulled=false;gc.name='gardenCircle';G.add(gc);N.gardenCircle=gc}
  parent.add(G);N.parent=parent;return G};
 let last=-1e9,lastF=-1,lastPh='';
 N.update=()=>{const d=C.date(),[la,lo]=o.latlon();const A=window.Astronomy;if(!A)return;const ob=new A.Observer(la,lo,0);
  const hz=b=>{const e=A.Equator(b,d,ob,true,true);return A.Horizon(d,ob,e.ra,e.dec,'normal')};const s=hz(A.Body.Sun),m=hz(A.Body.Moon);let illum=.5;try{illum=A.Illumination(A.Body.Moon,d).phase_fraction}catch(e){}
  const alt=s.altitude;N.sunAlt=alt;N.moonAlt=m.altitude;N.illum=illum;N.f=nightOf(alt);N.phase=phaseOf(alt);N.date=d;N.starOp=starsOf(alt);
  const dir=(az,al)=>new T.Vector3(Math.sin(az*D)*Math.cos(al*D),Math.sin(al*D),-Math.cos(az*D)*Math.cos(al*D));
  const day=1-N.f,warm=sst(12,0,alt);sun.position.copy(dir(s.azimuth,alt)).multiplyScalar(100);sun.intensity=Math.max(0,Math.sin(Math.max(alt,0)*D))*1.4*day+.1*day;sun.color.setRGB(1,1-.35*warm,1-.6*warm);
  moon.position.copy(dir(m.azimuth,m.altitude)).multiplyScalar(100);moon.intensity=m.altitude>0?.25*illum*N.f:0;
  const cols=skyCols(alt);N.cols=cols;hemi.color.setRGB(...mix([.75,.85,1],[.23,.29,.5],N.f));hemi.groundColor.setRGB(...mix([.25,.2,.12],[.03,.04,.08],N.f));hemi.intensity=.9-.75*N.f;
  if(o.scene.fog)o.scene.fog.color.setRGB(...cols.hor);
  {const k=1-.62*N.f,sat=o.sat&&o.sat();if(sat&&sat.tint)sat.tint.setRGB(k*(1-.12*N.f),k*(1-.05*N.f),k)}/* imagery dims + cools at night */
  stars.matrix.copy(starMatrix(T,d,la,lo));stars.matrixWorldNeedsUpdate=true;
  const sp=o.skyGroup&&o.skyGroup();if(sp&&starParent!==sp){sp.add(stars);starParent=sp}
  const pass=o.pass();stars.visible=!pass&&N.starOp>.01;stars.material.uniforms.op.value=N.starOp;o.applySky&&o.applySky(cols,N.f,pass);
  window.EEAR_NIGHT={f:N.f,phase:N.phase,sunAlt:alt,moonAlt:m.altitude,illum,date:d,mode:C.label()};
  if(Math.abs(N.f-lastF)>.004||N.phase!==lastPh){lastF=N.f;lastPh=N.phase;for(const k of['EEAR_CIRCLE','EEAR_REN','EEAR_PERFORMERS','EEAR_PILLARS'])try{window[k]&&typeof window[k].setNight==='function'&&window[k].setNight(N.f)}catch(e){console.warn(k,e)}
   window.dispatchEvent(new CustomEvent('eear:night',{detail:{f:N.f,phase:N.phase,sunAlt:alt}}))}};
 N.frame=t=>{U.t.value=t/1000;stars.material.uniforms.t.value=t/1000;if(t-last>(C.mode==='fast'||C.ov!=null?100:1000)){last=t;N.update()}
  const g=N.f,pulse=.82+.18*Math.sin(t/1000*1.6);U.op.value=g*pulse;UT.op.value=g*1.6*(.9+.1*Math.sin(t/1000*.9));UTG.op.value=g*.5;UG.op.value=window.EEAR_CIRCLE?0:g;
  if(N.mats)for(const m of N.mats)m.opacity=(m.isSpriteMaterial?.95:.9)*g*pulse;if(N.built)N.built.visible=g>.005;if(N.gardenCircle)N.gardenCircle.visible=!window.EEAR_CIRCLE};
 N.ui=el=>{el.innerHTML="<div style='margin:6px 0'><b>🌗 Time</b> <button data-m=real>Real</button> <button data-m=fast>Fast cycle</button> <small id=dnR></small></div><label style='display:block'>Preview <input id=dnS type=range min=0 max=1439 step=5 style='width:58%;vertical-align:middle'> <button id=dnX>×</button></label><small>Sun altitude drives the night: civil / nautical / astronomical twilight. Fast cycle = 1 day per 10 min. URL: ?t=22:30</small>";
  const r=el.querySelector('#dnR'),s=el.querySelector('#dnS');el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{C.setMode(b.dataset.m);last=-1e9});s.oninput=()=>{C.preview(+s.value);last=-1e9};el.querySelector('#dnX').onclick=()=>{C.preview(null);last=-1e9};
  const u=()=>{const d=C.date();el.querySelectorAll('[data-m]').forEach(b=>b.style.outline=C.mode===b.dataset.m&&C.ov==null&&C.ovAbs==null?'2px solid #ffc800':'');if(document.activeElement!==s)s.value=Math.round(C.ptMin());
   r.textContent=`${C.label()} · ${d.toLocaleTimeString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'})} PT · ${N.phase} · sun ${N.sunAlt.toFixed(1)}° · night ${Math.round(N.f*100)}%`};u();setInterval(u,500)};
 window.EEAR_DN=N;return N}
