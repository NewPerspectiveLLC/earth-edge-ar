// Earth Edge AR extras: ocean, coastline, road paths, saucers + pads, GhostBot rig, vortex layers.
// Shared by index.html (three 0.160) and quest.html (A-Frame's THREE). Everything takes THREE as T.
const D=Math.PI/180;
const mPer=la=>[111320,111320*Math.cos(la*D)];
// origin=[lat,lon] of the local frame; x=east m, z=-north m
const toL=(o,a,l)=>{const[my,mx]=mPer(o[0]);return[(l-o[1])*mx,-(a-o[0])*my]};
// blending that never writes framebuffer alpha (keeps Quest passthrough visible)
export function passMat(T,m,add=true){m.blending=T.CustomBlending;m.blendEquation=T.AddEquation;m.blendSrc=T.SrcAlphaFactor;m.blendDst=add?T.OneFactor:T.OneMinusSrcAlphaFactor;m.blendSrcAlpha=T.ZeroFactor;m.blendDstAlpha=T.OneFactor;m.transparent=true;m.depthWrite=false;m.userData.pf=1;m.userData.add=add;return m}
export const U={t:{value:0}};
// ---------- OCEAN: masked water from OSM coastline, cheap animated shader, fades out past 8 km from viewer
export async function makeOcean(T,origin,groundY){const J=await (await fetch('coast.json')).json();const[S,W,N,E]=J.bbox;
 const[x0,z0]=toL(origin,N,W),[x1,z1]=toL(origin,S,E);const tex=await new T.TextureLoader().loadAsync('ocean-mask.png');tex.flipY=false;tex.minFilter=T.LinearFilter;tex.magFilter=T.LinearFilter;
 const m=new T.ShaderMaterial({depthTest:false,extensions:{derivatives:true},uniforms:{t:U.t,mask:{value:tex},b0:{value:new T.Vector2(x0,z0)},b1:{value:new T.Vector2(x1,z1)},me:{value:new T.Vector2()}},
  vertexShader:'varying vec2 vP;void main(){vec4 w=modelMatrix*vec4(position,1.);vP=position.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`uniform float t;uniform sampler2D mask;uniform vec2 b0,b1,me;varying vec2 vP;
  float h(vec2 p){return sin(p.x*.11+t*1.1)*.5+sin(p.y*.13-t*.9)*.5+sin((p.x+p.y)*.05+t*.6)*.6;}
  void main(){vec2 uv=(vP-b0)/(b1-b0);float w=texture2D(mask,uv).r;if(w<.5||uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)discard;
   float d=length(vP-me);float fade=1.-smoothstep(6000.,8000.,d);if(fade<=0.)discard;
   float e=smoothstep(.5,.75,w);// soften coast edge
   float g=h(vP)+h(vP*2.7)*.35;float crest=smoothstep(.9,1.4,g);float grid=1.-smoothstep(0.,1.5,abs(fract(vP.x/50.)-.5)*50./max(fwidth(vP.x),.01));
   vec3 c=vec3(.02,.4,.7)*.7+vec3(.5,.95,1.)*crest*.7+vec3(.2,.6,.9)*grid*.3;gl_FragColor=vec4(c*fade*e,.85*fade*e);}`});
 passMat(T,m,true);const g=new T.Mesh(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),m);g.scale.set(x1-x0,1,z1-z0);g.position.set((x0+x1)/2,groundY-.02,(z0+z1)/2);g.frustumCulled=false;g.renderOrder=2;g.userData.layer='ocean';g.userData.oceanMat=m;return{mesh:g,coast:J}}
// ---------- COASTLINE: glowing shoreline lines (plain THREE.Line so it works in both builds)
export function makeCoast(T,origin,groundY,J){const g=new T.Group();g.userData.layer='coast';const mat=passMat(T,new T.LineBasicMaterial({color:0x5ff0ff,transparent:true,opacity:.85,depthTest:false}));
 for(const L of J.lines){const P=[];for(const[a,l]of L){const[x,z]=toL(origin,a,l);P.push(new T.Vector3(x,groundY+.05,z))}const ln=new T.Line(new T.BufferGeometry().setFromPoints(P),mat);ln.frustumCulled=false;ln.renderOrder=3;g.add(ln)}return g}
// ---------- ROAD PATHS: flat ribbons with edge lines + dashed centre line, following streets.json / sheridan.json
export function makeRoad(T,origin,groundY,pts,col,width=7){const P=pts.map(([a,l])=>toL(origin,a,l));const pos=[],uv=[],idx=[];let s=0;
 for(let i=0;i<P.length;i++){const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)];let dx=b[0]-a[0],dz=b[1]-a[1];const m=Math.hypot(dx,dz)||1;const nx=-dz/m*width/2,nz=dx/m*width/2;
  if(i)s+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);pos.push(P[i][0]+nx,groundY+.03,P[i][1]+nz,P[i][0]-nx,groundY+.03,P[i][1]-nz);uv.push(0,s,1,s);if(i){const k=i*2;idx.push(k-2,k-1,k,k-1,k+1,k)}}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);
 const m=new T.ShaderMaterial({depthTest:false,side:T.DoubleSide,uniforms:{c:{value:new T.Color(col)},t:U.t},vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 c;uniform float t;varying vec2 vU;void main(){float x=vU.x;float edge=step(x,.06)+step(.94,x);float centre=step(abs(x-.5),.025)*step(.5,fract(vU.y/6.-t*.15));float body=.35;vec3 col=c*body+vec3(1.)*edge*.8+vec3(1.,.85,.2)*centre;gl_FragColor=vec4(col,.75);}'});
 passMat(T,m,true);const mesh=new T.Mesh(geo,m);mesh.renderOrder=5;mesh.frustumCulled=false;mesh.userData.layer='roads';return mesh}
// ---------- SAUCERS + LANDING PADS (hero = bigger, tractor beam, orbiting lights)
const SAUCERS=[];
export function makeSaucer(T,col,hero){const g=new T.Group();g.userData.layer='saucers';const S=hero?2.2:1;const c=new T.Color(col);
 const mat=(cc,op)=>passMat(T,new T.MeshBasicMaterial({color:cc,transparent:true,opacity:op,depthTest:false,side:T.DoubleSide}));
 // landing pad: ring + H + corner lights
 const pad=new T.Group();pad.add(new T.Mesh(new T.RingGeometry(9*S,10*S,48).rotateX(-Math.PI/2),mat(c,.8)));pad.add(new T.Mesh(new T.CircleGeometry(9*S,48).rotateX(-Math.PI/2),mat(c,.10)));
 for(const[x,z,w,d]of[[-2.5,0,1,8],[2.5,0,1,8],[0,0,5,1]]){const b=new T.Mesh(new T.PlaneGeometry(w*S,d*S).rotateX(-Math.PI/2),mat(0xffffff,.8));b.position.set(x*S,.02,z*S);pad.add(b)}
 const lights=[];for(let i=0;i<8;i++){const L=new T.Mesh(new T.SphereGeometry(.45*S,8,6),mat(0xffffff,1));const a=i/8*Math.PI*2;L.position.set(Math.cos(a)*10.8*S,.4,Math.sin(a)*10.8*S);pad.add(L);lights.push(L)}g.add(pad);
 // saucer hovering above the pad
 const sc=new T.Group();const body=new T.Mesh(new T.SphereGeometry(6*S,32,12).scale(1,.22,1),mat(0xc8d8ff,.55));const dome=new T.Mesh(new T.SphereGeometry(2.4*S,24,12,0,Math.PI*2,0,Math.PI/2),mat(c,.6));dome.position.y=.9*S;
 const rim=new T.Mesh(new T.TorusGeometry(6*S,.25*S,6,48).rotateX(Math.PI/2),mat(c,.95));sc.add(body,dome,rim);const port=[];for(let i=0;i<(hero?16:8);i++){const p=new T.Mesh(new T.SphereGeometry(.35*S,6,4),mat(0xffffff,1));const a=i/(hero?16:8)*Math.PI*2;p.position.set(Math.cos(a)*5.3*S,-.3*S,Math.sin(a)*5.3*S);sc.add(p);port.push(p)}
 sc.position.y=(hero?34:22);g.add(sc);let beam=null;if(hero){beam=new T.Mesh(new T.CylinderGeometry(2.5*S,9*S,sc.position.y,24,1,true),mat(c,.12));beam.position.y=sc.position.y/2;g.add(beam)}
 g.traverse(o=>{o.renderOrder=7;o.frustumCulled=false});SAUCERS.push({g,sc,lights,port,beam,hero,ph:Math.random()*6});return g}
// ---------- VORTEX (local): spiral funnel; (world): great circles from the vortex to its antipode
export function makeVortexLocal(T,col,h=80){const N=6,seg=120,P=[];const g=new T.Group();g.userData.layer='vortexL';
 const m=passMat(T,new T.ShaderMaterial({depthTest:false,uniforms:{t:U.t,c:{value:new T.Color(col)}},vertexShader:'attribute float f;varying float vF;void main(){vF=f;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float t;uniform vec3 c;varying float vF;void main(){float p=fract(vF*6.-t*.6);float a=.25+.75*smoothstep(.8,1.,p);gl_FragColor=vec4(c*a,a);}'}));
 for(let k=0;k<N;k++){const pos=[],f=[];for(let i=0;i<=seg;i++){const u=i/seg,y=u*h,r=2+u*u*28,a=k/N*Math.PI*2+u*Math.PI*6;pos.push(Math.cos(a)*r,y,Math.sin(a)*r);f.push(u)}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('f',new T.Float32BufferAttribute(f,1));const l=new T.Line(geo,m);l.frustumCulled=false;l.renderOrder=7;g.add(l)}
 g.userData.spin=1;return g}
export function gcPoint(la,lo,b,d){la*=D;lo*=D;b*=D;d*=D;const a2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(b));const l2=lo+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(a2));return[a2/D,((l2/D+540)%360)-180]}
// world-scale great circles: proj(lat,lon)->THREE.Vector3 in the caller's world frame
// Geometric Power: 6 great circles at bearings 0..150 (12 half-lines from the vortex, meeting at its antipode).
// Returns arrays of positions (one full 360-degree circle each) so the caller can draw thick lines.
const GC_ANG=(()=>{const A=[0];for(let d=.00002;d<2;d*=1.15)A.push(d);for(let d=2;d<358;d+=1)A.push(d);const B=A.filter(x=>x<2).reverse().map(x=>360-x);return A.concat(B,[360])})();// dense near the vortex so the circle hugs the ground there
export function vortexWorldCircles(la,lo,proj,n=6){const out=[];for(let k=0;k<n;k++){const pos=[];for(const i of GC_ANG){const[a,l]=gcPoint(la,lo,k*180/n,i);const v=proj(a,l);pos.push(v.x,v.y,v.z)}out.push(pos)}return out}
export const WEDGE_COLS=[0xff3b30,0xff9500,0xffcc00,0x9be22d,0x34c759,0x00c7be,0x30b0ff,0x007aff,0x5856d6,0xaf52de,0xff2d92,0xff6482];
// Local: 12 translucent 30-degree wedge sectors on the ground, fading with radius, with 12 dividing ground ribbons.
export function makeVortexWedges(T,R=300,RL=1500){const g=new T.Group();g.userData.layer='vortexL';
 for(let k=0;k<12;k++){const b0=k*30;const geo=new T.CircleGeometry(R,24,(90-b0-30)*D,30*D).rotateX(-Math.PI/2);
  const m=passMat(T,new T.ShaderMaterial({depthTest:false,side:T.DoubleSide,uniforms:{c:{value:new T.Color(WEDGE_COLS[k])},R:{value:R},t:U.t},vertexShader:'varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'uniform vec3 c;uniform float R,t;varying vec2 vP;void main(){float r=length(vP)/R;float a=(1.-smoothstep(.15,1.,r))*.2*smoothstep(.01,.05,r);float ring=smoothstep(.97,1.,fract(r*8.-t*.1))*.15*(1.-r);gl_FragColor=vec4(c,min(1.,(a+ring)*1.6));}'}));
  const w=new T.Mesh(geo,m);w.renderOrder=4;w.frustumCulled=false;w.position.y=.01;g.add(w);
  const rb=new T.Mesh(new T.PlaneGeometry(2,RL).rotateX(-Math.PI/2).translate(0,.04,-RL/2),passMat(T,new T.ShaderMaterial({depthTest:false,side:T.DoubleSide,uniforms:{R:{value:RL}},vertexShader:'varying float vZ;void main(){vZ=-position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float R;varying float vZ;void main(){float a=.55*(1.-smoothstep(.2*R,R,vZ))*smoothstep(20.,80.,vZ);gl_FragColor=vec4(vec3(1.,.95,.8),a);}'})));
  rb.rotation.y=-b0*D;rb.renderOrder=5;rb.frustumCulled=false;if(RL>0)g.add(rb)}
 return g}
export const antipode=(la,lo)=>[-la,((lo+360)%360)-180];
// ---------- GHOSTBOT: Mixamo-named bone rig (three sanitises "mixamorig:Hips" to "mixamorigHips"), purple Victorian tux
export const GHOST_LOOK={height:1.9,tux:'#8a3cff',shirt:'#f4f0ff',hat:'#3a1470',hatBand:'#c9a0ff',hair:'#7a4a24',skin:'#ffd9c0',glasses:'#e8e8ff',tails:true,topHat:true,facialHair:false,glow:.55,
 bubbles:['Evening! Welcome to Port Townsend.','The edge of the Earth is 10,000 km that way.','Care for a dance?','Mind the saucers.','Lovely night for a vortex.','Tap a label to learn more.'],clips:[]};
const BN=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'];
export function makeGhostBot(T,look={}){const L=Object.assign({},GHOST_LOOK,look),k=L.height/1.9;const B={};const root=new T.Group();root.name='GhostBot';
 const bone=(n,p,x,y,z)=>{const b=new T.Bone();b.name='mixamorig'+n;b.position.set(x*k,y*k,z*k);(p?B[p]:root).add(b);B[n]=b;return b};
 bone('Hips',null,0,1.0,0);bone('Spine','Hips',0,.1,0);bone('Spine1','Spine',0,.13,0);bone('Spine2','Spine1',0,.13,0);bone('Neck','Spine2',0,.15,0);bone('Head','Neck',0,.1,0);
 for(const[s,sx]of[['Left',1],['Right',-1]]){bone(s+'Shoulder','Spine2',.07*sx,.12,0);bone(s+'Arm',s+'Shoulder',.13*sx,0,0);bone(s+'ForeArm',s+'Arm',.28*sx,0,0);bone(s+'Hand',s+'ForeArm',.25*sx,0,0);
  bone(s+'UpLeg','Hips',.1*sx,-.05,0);bone(s+'Leg',s+'UpLeg',0,-.44,0);bone(s+'Foot',s+'Leg',0,-.44,0);bone(s+'ToeBase',s+'Foot',0,-.06,.12)}
 const mat=(c,op=L.glow)=>passMat(T,new T.MeshBasicMaterial({color:c,transparent:true,opacity:op,depthTest:false}),false);
 const put=(b,geo,c,x=0,y=0,z=0,op)=>{const m=new T.Mesh(geo,mat(c,op));m.position.set(x*k,y*k,z*k);m.scale.setScalar(k);m.renderOrder=20;B[b].add(m);return m};
 const tux=L.tux;put('Hips',new T.BoxGeometry(.34,.16,.2),tux,0,.02);put('Spine',new T.BoxGeometry(.34,.14,.2),tux,0,.07);put('Spine1',new T.BoxGeometry(.38,.15,.22),tux,0,.07);put('Spine2',new T.BoxGeometry(.42,.16,.23),tux,0,.07);
 put('Spine1',new T.BoxGeometry(.12,.3,.01),L.shirt,0,.1,.116,.85);put('Spine2',new T.ConeGeometry(.05,.06,3).rotateZ(Math.PI/2),L.shirt,.035,.13,.12,.9);put('Spine2',new T.ConeGeometry(.05,.06,3).rotateZ(-Math.PI/2),L.shirt,-.035,.13,.12,.9);// bow tie
 if(L.tails){for(const sx of[1,-1]){const t=put('Hips',new T.BoxGeometry(.15,.5,.02),tux,.08*sx,-.25,-.11);t.rotation.x=.12}}
 put('Neck',new T.CylinderGeometry(.05,.06,.1,10),L.skin,0,.05);put('Head',new T.SphereGeometry(.11,16,12).scale(1,1.15,1),L.skin,0,.11);
 put('Head',new T.SphereGeometry(.118,16,8,0,Math.PI*2,0,Math.PI/2.1),L.hair,0,.13,-.01,.8);
 for(const sx of[1,-1]){put('Head',new T.TorusGeometry(.03,.006,6,16),L.glasses,.045*sx,.12,.105,.95)}put('Head',new T.BoxGeometry(.03,.006,.006),L.glasses,0,.12,.107,.95);
 if(L.topHat){put('Head',new T.CylinderGeometry(.17,.17,.012,24),L.hat,0,.235,0,.85);put('Head',new T.CylinderGeometry(.11,.115,.2,24),L.hat,0,.34,0,.8);put('Head',new T.CylinderGeometry(.116,.116,.035,24),L.hatBand,0,.26,0,.9)}
 for(const s of['Left','Right']){const sx=s==='Left'?1:-1;put(s+'Arm',new T.CylinderGeometry(.05,.045,.28,8).rotateZ(Math.PI/2),tux,.14*sx);put(s+'ForeArm',new T.CylinderGeometry(.045,.04,.25,8).rotateZ(Math.PI/2),tux,.125*sx);put(s+'Hand',new T.SphereGeometry(.045,8,6),'#ffffff',.04*sx,0,0,.9);
  put(s+'UpLeg',new T.CylinderGeometry(.075,.06,.44,8),tux,0,-.22);put(s+'Leg',new T.CylinderGeometry(.06,.045,.44,8),tux,0,-.22);put(s+'Foot',new T.BoxGeometry(.1,.06,.24),'#20102e',0,-.03,.06,.9)}
 // arms down at rest (Mixamo T-pose -> A-pose)
 B.LeftArm.rotation.z=-1.25;B.RightArm.rotation.z=1.25;
 const bub=makeBubble(T);bub.position.y=2.35*k;root.add(bub);
 const st={B,L,bub,mode:'idle',t0:0,target:null,next:0,bubT:0,dance:0,mixer:null};root.userData.ghost=st;root.userData.ex=1;
 if(L.clips&&L.clips.length)loadClips(T,root,L.clips);return root}
function makeBubble(T){const cv=document.createElement('canvas');cv.width=512;cv.height=160;const tex=new T.CanvasTexture(cv);const s=new T.Sprite(passMat(T,new T.SpriteMaterial({map:tex,transparent:true,depthTest:false,sizeAttenuation:true}),false));s.scale.set(2.6,.8,1);s.renderOrder=30;s.visible=false;
 s.userData.say=txt=>{const g=cv.getContext('2d');g.clearRect(0,0,512,160);g.fillStyle='rgba(255,255,255,.92)';g.beginPath();g.roundRect(6,6,500,118,28);g.fill();g.beginPath();g.moveTo(230,122);g.lineTo(256,156);g.lineTo(282,122);g.fill();
  g.fillStyle='#3a1470';g.font='bold 30px sans-serif';g.textAlign='center';const w=txt.split(' ');let a='',lines=[];for(const x of w){if(g.measureText(a+' '+x).width>460){lines.push(a);a=x}else a=a?a+' '+x:x}lines.push(a);lines.slice(0,3).forEach((l,i,arr)=>g.fillText(l,256,65-(arr.length-1)*17+i*34));tex.needsUpdate=true;s.visible=true};return s}
async function loadClips(T,root,urls){try{const{GLTFLoader}=await import('https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js?module');const st=root.userData.ghost;st.mixer=new T.AnimationMixer(root);st.clips=[];
 for(const u of urls){const g=await new GLTFLoader().loadAsync(u);for(const c of g.animations){c.tracks=c.tracks.filter(tr=>!/\.(position|scale)$/.test(tr.name));st.clips.push(c)}}}catch(e){console.warn('ghost clips',e)}}
const DANCES=[(B,t)=>{// charleston
 const s=Math.sin(t*6);B.LeftUpLeg.rotation.x=s*.5;B.RightUpLeg.rotation.x=-s*.5;B.LeftLeg.rotation.x=Math.max(0,-s)*.8;B.RightLeg.rotation.x=Math.max(0,s)*.8;B.LeftArm.rotation.set(s*.6,0,-.9);B.RightArm.rotation.set(-s*.6,0,.9);B.Spine1.rotation.z=s*.08},
 (B,t)=>{// robot
 const s=Math.round(Math.sin(t*3)*2)/2;B.LeftArm.rotation.set(0,0,-.2+s*.4);B.LeftForeArm.rotation.set(0,1.5,0);B.RightArm.rotation.set(0,0,.2+s*.4);B.RightForeArm.rotation.set(0,-1.5,0);B.Head.rotation.y=s*.5;B.Spine.rotation.y=-s*.2},
 (B,t)=>{// twist + hat tip
 const s=Math.sin(t*5);B.Hips.rotation.y=s*.4;B.Spine2.rotation.y=-s*.6;B.LeftArm.rotation.set(-.6,0,-.7);B.RightArm.rotation.set(-.6,0,.7);B.LeftForeArm.rotation.y=.8;B.RightForeArm.rotation.y=-.8;B.LeftLeg.rotation.x=.25+.15*s;B.RightLeg.rotation.x=.25-.15*s}];
const resetPose=B=>{for(const n in B)B[n].rotation.set(0,0,0);B.LeftArm.rotation.z=-1.25;B.RightArm.rotation.z=1.25};
// me = viewer position in the ghost's parent frame; ground = floor y in that frame
export function ghostFrame(T,g,t,me,ground,dt=.016){const st=g.userData.ghost,B=st.B,L=st.L,s=t/1000;if(!st.next)st.next=s+2;
 if(st.mixer&&st.clips&&st.clips.length&&st.mode==='dance'){st.mixer.update(dt)}
 const p=g.position;p.y=ground;
 if(s>st.next){const r=Math.random();if(r<.45){st.mode='walk';const a=Math.random()*Math.PI*2,d=4+Math.random()*7;st.target=new T.Vector3(me.x+Math.cos(a)*d,ground,me.z+Math.sin(a)*d);st.next=s+12}
  else if(r<.8){st.mode='dance';st.dance=(st.dance+1)%DANCES.length;st.next=s+7;resetPose(B);if(st.mixer&&st.clips&&st.clips.length){st.mixer.stopAllAction();st.mixer.clipAction(st.clips[st.dance%st.clips.length]).play()}}
  else{st.mode='idle';st.next=s+4}
  if(Math.random()<.6){st.bub.userData.say(L.bubbles[Math.floor(Math.random()*L.bubbles.length)]);st.bubT=s+4}}
 if(st.bubT&&s>st.bubT){st.bub.visible=false;st.bubT=0}
 // keep within 25 m of viewer
 if(Math.hypot(p.x-me.x,p.z-me.z)>25&&st.mode!=='walk'){st.mode='walk';st.target=new T.Vector3(me.x+3,ground,me.z+3);st.next=s+15}
 if(st.mode==='walk'&&st.target){const dx=st.target.x-p.x,dz=st.target.z-p.z,d=Math.hypot(dx,dz);if(d<.3){st.mode='idle';st.next=s+1.5;resetPose(B)}else{const v=Math.min(d,.9*dt);p.x+=dx/d*v;p.z+=dz/d*v;g.rotation.y=Math.atan2(dx,dz);
   const w=Math.sin(s*7);resetPose(B);B.LeftUpLeg.rotation.x=w*.45;B.RightUpLeg.rotation.x=-w*.45;B.LeftLeg.rotation.x=Math.max(0,w)*.6;B.RightLeg.rotation.x=Math.max(0,-w)*.6;B.LeftArm.rotation.x=-w*.35;B.RightArm.rotation.x=w*.35;B.Hips.position.y=1.0*(L.height/1.9)+Math.abs(w)*.03}}
 else{g.rotation.y+=(Math.atan2(me.x-p.x,me.z-p.z)-g.rotation.y)*.05;if(st.mode==='dance'&&!(st.mixer&&st.clips&&st.clips.length))DANCES[st.dance](B,s);if(st.mode==='idle'){resetPose(B);B.Spine1.rotation.z=Math.sin(s*1.3)*.03;B.Head.rotation.x=Math.sin(s*.7)*.05}}}
// ---------- per-frame
export function frame(t,dt=.016){U.t.value=t/1000;const s=t/1000;for(const S of SAUCERS){S.sc.position.y+=Math.sin(s*1.2+S.ph)*.01;S.sc.rotation.y+=S.hero?.02:.01;S.port.forEach((p,i)=>p.material.opacity=.4+.6*(Math.sin(s*4+i)>.3?1:0));S.lights.forEach((l,i)=>l.material.opacity=((Math.floor(s*8)%8)===i)?1:.25);if(S.beam)S.beam.material.opacity=.08+.06*Math.sin(s*3)}}
export function spin(g,t){g.traverse(o=>{if(o.userData.spin)o.rotation.y=t/1000*.4})}
// ENU projection from a home point, metres (x=E, y=U, z=-N), full-Earth (through the planet).
export function enuProj(T,la0,lo0){const R=6371e3,e=(a,l)=>{a*=D;l*=D;return[R*Math.cos(a)*Math.cos(l),R*Math.cos(a)*Math.sin(l),R*Math.sin(a)]},o=e(la0,lo0),sl=Math.sin(lo0*D),cl=Math.cos(lo0*D),sp=Math.sin(la0*D),cp=Math.cos(la0*D);
 return(a,l)=>{const p=e(a,l),d=[p[0]-o[0],p[1]-o[1],p[2]-o[2]];const E=-sl*d[0]+cl*d[1],N=-sp*cl*d[0]-sp*sl*d[1]+cp*d[2],U=cp*cl*d[0]+cp*sl*d[1]+sp*d[2];return new T.Vector3(E,U,-N)}}
// XR-safe world great circles: every point is pushed onto a sphere of radius `shell` around the viewer origin
// (same on-screen direction as the true through-Earth position, but always inside the camera far plane).
// Drawn as tubes so they are thick on Quest (WebGL lines are 1 px there).
export function makeVortexWorldTubes(T,la,lo,col,proj,shell=3000,rad=7){const g=new T.Group();g.userData.layer='vortexW';
 const m=passMat(T,new T.MeshBasicMaterial({color:col,transparent:true,opacity:.9,depthTest:false,side:T.DoubleSide}));const core=passMat(T,new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,depthTest:false}));
 for(const C of vortexWorldCircles(la,lo,proj)){let run=[];const flush=()=>{if(run.length>3){const cv=new T.CatmullRomCurve3(run);for(const[mm,r]of[[m,rad],[core,rad*.35]]){const t=new T.Mesh(new T.TubeGeometry(cv,run.length*2,r,5,false),mm);t.frustumCulled=false;t.renderOrder=9;g.add(t)}}run=[]};
  for(let i=0;i<C.length;i+=3){const v=new T.Vector3(C[i],C[i+1],C[i+2]);if(v.length()<8000){flush();continue}run.push(v.setLength(shell))}flush()}
 return g}

// tall centre pillar so the vortex reads as 'over there'
export function makeVortexPillar(T,col,h=420){const g=new T.Group();g.userData.layer='vortexL';const m=passMat(T,new T.ShaderMaterial({depthTest:false,side:T.DoubleSide,uniforms:{c:{value:new T.Color(col)},t:U.t},vertexShader:'varying float vY;void main(){vY=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 c;uniform float t;varying float vY;void main(){float a=(.55+.45*smoothstep(.6,1.,fract(vY*4.-t*.5)))*(1.-vY*.6);gl_FragColor=vec4(mix(c,vec3(1.),.35),a);}'}));
 for(const r of[16,6]){const b=new T.Mesh(new T.CylinderGeometry(r,r*.6,h,16,1,true),m);b.position.y=h/2;b.renderOrder=8;b.frustumCulled=false;g.add(b)}const ring=new T.Mesh(new T.RingGeometry(10,14,48).rotateX(-Math.PI/2),passMat(T,new T.MeshBasicMaterial({color:col,transparent:true,opacity:.9,depthTest:false})));ring.position.y=.06;g.add(ring);return g}

// 12 half-lines of the 6 great circles, sampled densely near the vortex (true ENU incl. Earth curvature) so they run
// crisply along the ground to the horizon; the world-mode circles continue them around/through the globe.
export function vortexGroundLines(la,lo,proj,maxKm=80){const out=[],ds=[0];for(let d=2;d<maxKm*1000;d*=1.08)ds.push(d);ds.push(maxKm*1000);
 for(let k=0;k<12;k++){const pos=[];for(const d of ds){const[a,l]=gcPoint(la,lo,k*30,d/111195);const v=proj(a,l);pos.push(v.x,v.y,v.z)}out.push(pos)}return out}
