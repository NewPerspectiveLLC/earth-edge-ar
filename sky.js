// Real-time Moon + Sun: astronomy-engine (vendored astronomy.min.js -> window.Astronomy) gives topocentric apparent az/alt (refracted) + distance
// for the viewer's lat/lon, recomputed every second from Date.now() (or ?skyt=ISO for tests); Earth rotation is implicit in the horizon transform.
// Bodies are drawn at a reduced distance along the TRUE direction with TRUE angular size (radius = show * R_body / distance). Moon phase from a sun-direction shader.
export const R_MOON=1737.4,R_SUN=695700,AU=149597870.7;
export function skyNow(date,lat,lon,h=0){const A=window.Astronomy,o=new A.Observer(lat,lon,h),out={};
 for(const[k,b]of[['moon',A.Body.Moon],['sun',A.Body.Sun]]){const eq=A.Equator(b,date,o,true,true),h0=A.Horizon(date,o,eq.ra,eq.dec),hor=h0.altitude>-1?A.Horizon(date,o,eq.ra,eq.dec,'normal'):h0/* refraction only near/above the horizon (as JPL Horizons) */,km=eq.dist*AU,R=k==='moon'?R_MOON:R_SUN;
  out[k]={az:hor.azimuth,alt:hor.altitude,km,angDiamDeg:2*Math.asin(R/km)*180/Math.PI}}
 try{out.moon.phaseDeg=A.MoonPhase(date);out.moon.illum=A.Illumination(A.Body.Moon,date).phase_fraction}catch(e){}return out}
export const enuDir=(T,az,alt)=>{const a=az*Math.PI/180,e=alt*Math.PI/180;return new T.Vector3(Math.cos(e)*Math.sin(a),Math.sin(e),-Math.cos(e)*Math.cos(a))};/* x=E, y=U, z=-N */
export function makeSkyBodies(T,{show,pf=()=>{}}){const g=new T.Group();g.name='sky';
 const moonMat=new T.ShaderMaterial({uniforms:{sun:{value:new T.Vector3(1,0,0)}},transparent:true,depthTest:false,depthWrite:false,
  vertexShader:'varying vec3 vN;void main(){vN=normalize((modelMatrix*vec4(normal,0.)).xyz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 sun;varying vec3 vN;void main(){float l=max(dot(normalize(vN),normalize(sun)),0.);vec3 c=vec3(.93,.92,.88)*(l*1.05+.06);gl_FragColor=vec4(c,1.);}'});
 const moon=new T.Mesh(new T.SphereGeometry(1,48,32),moonMat);moon.renderOrder=980;moon.frustumCulled=false;moon.userData.layer='moon';moon.userData.solid=1;pf(moonMat,true);
 const sunMat=new T.MeshBasicMaterial({color:0xfff2c0,transparent:true,depthTest:false,depthWrite:false});const sun=new T.Mesh(new T.SphereGeometry(1,32,16),sunMat);sun.renderOrder=979;sun.frustumCulled=false;sun.userData.layer='sun';pf(sunMat,true);
 const cv=document.createElement('canvas');cv.width=cv.height=128;const x=cv.getContext('2d'),gr=x.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,240,180,1)');gr.addColorStop(.25,'rgba(255,200,80,.55)');gr.addColorStop(1,'rgba(255,160,40,0)');x.fillStyle=gr;x.fillRect(0,0,128,128);
 const halo=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(cv),transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending}));halo.renderOrder=978;{const m=halo.material;m.blending=T.CustomBlending;m.blendSrc=T.SrcAlphaFactor;m.blendDst=T.OneFactor;m.blendSrcAlpha=T.ZeroFactor;m.blendDstAlpha=T.OneFactor}/* additive glow that leaves canvas alpha alone (camera feed shows through) */pf(halo.material,false);sun.add(halo);halo.scale.setScalar(6);
 g.add(moon,sun);const S={g,moon,sun,info:null,show};
 S.update=(date,lat,lon,h)=>{const I=S.info=skyNow(date,lat,lon,h);for(const k of['moon','sun']){const b=I[k],m=S[k],d=enuDir(T,b.az,b.alt),dist=k==='moon'?show*.97:show;m.position.copy(d).multiplyScalar(dist);m.scale.setScalar(dist*Math.tan(b.angDiamDeg*Math.PI/360));b.dir=d}
  moonMat.uniforms.sun.value.copy(I.sun.dir).multiplyScalar(I.sun.km).sub(I.moon.dir.clone().multiplyScalar(I.moon.km)).normalize();return I};
 return S}
export const skyText=(k,b)=>`${k==='moon'?'Moon':'Sun'}\n${Math.round(b.km).toLocaleString()} km · az ${b.az.toFixed(1)}° · alt ${b.alt.toFixed(1)}°${k==='moon'&&b.illum!=null?' · '+Math.round(b.illum*100)+'% lit':''}`;
export const skyClock=()=>{const m=/[?&]skyt=([^&]+)/.exec(location.search);const t=m?Date.parse(decodeURIComponent(m[1])):NaN;const off=isNaN(t)?0:t-Date.now(),fz=/[?&]skyfreeze=1/.test(location.search)&&!isNaN(t);return()=>new Date(fz?t:Date.now()+off)};/* skyfreeze=1: tests only */
