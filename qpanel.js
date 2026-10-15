// In-headset 3D panel: big buttons (12 x 8 cm), controller-ray hover, select fires once on selectend, haptic pulse.
// transparent:true + opacity 1 puts the panel in three's transparent queue so renderOrder 1e4 draws it AFTER depthTest:false lines/labels (opaque would be over-drawn); alpha stays 1 over passthrough
const BW=.12,BH=.08,GAP=.012,COLS=5;
function canvasTex(T,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace||t.colorSpace;return{c,g:c.getContext('2d'),t}}
function wrap(g,txt,max){const out=[];for(const para of String(txt).split('\n')){let line='';for(const w of para.split(' ')){const t=line?line+' '+w:w;if(g.measureText(t).width>max&&line){out.push(line);line=w}else line=t}out.push(line)}return out}
export function makePanel(T,{items,sections,title='Layers'}){
 const root=new T.Group();root.visible=false;root.name='qpanel';const btns=[];const P={root,btns,tab:0,items};
 const mkBtn=(kind,label,item,section)=>{const{c,g,t}=canvasTex(T,256,170);const m=new T.Mesh(new T.PlaneGeometry(BW,BH),new T.MeshBasicMaterial({map:t,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false}));m.renderOrder=10000;m.frustumCulled=false;
  const b={kind,label,item,section,key:item?item.key:'tab:'+label,mesh:m,hover:false,_s:''};m.userData.btn=b;
  b.draw=()=>{const sel=kind==='tab'&&sections[P.tab]===label,st=kind==='toggle'?!!item.get():null;const s=[st,b.hover,sel,label].join();if(s===b._s)return;b._s=s;
   const bg=kind==='tab'?(sel?'#ffd23f':'#2b3445'):kind==='action'?'#1f6fd1':(st?'#18a957':'#4a4f58');g.fillStyle=bg;g.fillRect(0,0,256,170);
   g.lineWidth=b.hover?16:4;g.strokeStyle=b.hover?'#ffffff':'#0b0e14';g.strokeRect(b.hover?8:2,b.hover?8:2,b.hover?240:252,b.hover?154:166);
   g.fillStyle=kind==='tab'&&sel?'#111':'#fff';g.textAlign='center';g.textBaseline='middle';g.font='bold 30px system-ui,sans-serif';
   const L=wrap(g,label,220).slice(0,3);const y0=kind==='toggle'?62:85;L.forEach((l,i)=>g.fillText(l,128,y0+(i-(L.length-1)/2)*34));
   if(kind==='toggle'){g.font='bold 34px system-ui,sans-serif';g.fillText(st?'● ON':'○ OFF',128,138)}t.needsUpdate=true};
  btns.push(b);return b};
 // backing board + title
 const W=COLS*BW+(COLS+1)*GAP;const maxRows=Math.max(...sections.map(s=>Math.ceil(items.filter(i=>i.section===s).length/COLS)));const H=GAP+BH*.6+GAP+BH+GAP+maxRows*(BH+GAP);
 const board=new T.Mesh(new T.PlaneGeometry(W,H),new T.MeshBasicMaterial({color:0x0b0e14,transparent:true,opacity:1,depthTest:false,depthWrite:false}));board.renderOrder=9999;board.position.z=-.002;board.frustumCulled=false;root.add(board);
 {const{c,g,t}=canvasTex(T,1024,64);g.fillStyle='#0b0e14';g.fillRect(0,0,1024,64);g.fillStyle='#9fd8ff';g.font='bold 40px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(title+'  ·  Y to close',512,34);t.needsUpdate=true;
  const tm=new T.Mesh(new T.PlaneGeometry(W-2*GAP,BH*.6),new T.MeshBasicMaterial({map:t,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false}));tm.renderOrder=10000;tm.position.set(0,H/2-GAP-BH*.3,0);root.add(tm)}
 const top=H/2-GAP-BH*.6-GAP;const tw=(W-(sections.length+1)*GAP)/sections.length;
 sections.forEach((s,i)=>{const b=mkBtn('tab',s,null,s);b.mesh.scale.x=tw/BW;b.mesh.position.set(-W/2+GAP+tw/2+i*(tw+GAP),top-BH/2,0);root.add(b.mesh)});
 const pages=sections.map((s)=>{const pg=new T.Group();root.add(pg);items.filter(i=>i.section===s).forEach((it,j)=>{const b=mkBtn(it.kind,it.label,it,s);const r=Math.floor(j/COLS),c=j%COLS;b.mesh.position.set(-W/2+GAP+BW/2+c*(BW+GAP),top-BH-GAP-BH/2-r*(BH+GAP),0);pg.add(b.mesh)});return pg});
 P.setTab=i=>{P.tab=i;pages.forEach((p,j)=>p.visible=j===i);P.refresh()};
 P.refresh=()=>{for(const b of btns)b.draw()};
 const rc=new T.Raycaster();
 P.hit=(o,d)=>{if(!root.visible)return null;rc.set(o,d);rc.far=5;const vis=btns.filter(b=>{let x=b.mesh;while(x){if(!x.visible)return false;x=x.parent}return true}).map(b=>b.mesh);const h=rc.intersectObjects(vis,false)[0];return h?Object.assign(h.object.userData.btn,{_d:h.distance}):null};
 P.press=b=>{if(!b)return;if(b.kind==='tab')P.setTab(sections.indexOf(b.label));else if(b.kind==='action')b.item.run();else b.item.set(!b.item.get());P.refresh()};
 P.findButton=k=>btns.find(b=>b.key===k);P.tabOf=k=>{const b=P.findButton(k);return b?sections.indexOf(b.section):-1};
 P.setHover=set=>{for(const b of btns)b.hover=set.has(b);P.refresh()};
 P.setTab(0);return P}
export function xrRays(T,{renderer,scene,panel,xrToWorld,onToggle}){
 const S={srcs:new Map(),last:null,presses:0,ses:null};const M=new T.Matrix4(),o=new T.Vector3(),d=new T.Vector3();
 const line=()=>{const g=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(0,0,-1)]);const l=new T.Line(g,new T.LineBasicMaterial({color:0x9fd8ff,depthTest:false,transparent:true,opacity:1}));l.renderOrder=10001;l.frustumCulled=false;l.material.userData.pf=1;l.visible=false;scene.add(l);return l};
 const st=src=>{let s=S.srcs.get(src);if(!s){s={line:line(),hover:null,down:null,t:0};S.srcs.set(src,s)}return s};
 const pulse=src=>{try{const h=src.gamepad&&src.gamepad.hapticActuators&&src.gamepad.hapticActuators[0];if(h&&h.pulse)h.pulse(.6,40);else if(h&&h.playEffect)h.playEffect('dual-rumble',{duration:40,strongMagnitude:.6})}catch(e){}};
 const attach=ses=>{S.ses=ses;
  ses.addEventListener('selectstart',e=>{const s=st(e.inputSource);s.down=panel.root.visible?s.hover:null});
  ses.addEventListener('selectend',e=>{const s=st(e.inputSource),b=s.down;s.down=null;if(!b||b!==s.hover)return;const now=performance.now();if(now-s.t<180)return;s.t=now;
   panel.press(b);S.presses++;S.last={key:b.key,label:b.label,hand:e.inputSource.handedness,state:b.item&&b.item.get?b.item.get():null,t:now};pulse(e.inputSource);onToggle&&onToggle(b)});
  ses.addEventListener('end',()=>{for(const s of S.srcs.values())scene.remove(s.line);S.srcs.clear();S.ses=null})};
 S.tick=()=>{const ses=renderer.xr.getSession();if(!ses)return;if(ses!==S.ses)attach(ses);const fr=renderer.xr.getFrame(),ref=renderer.xr.getReferenceSpace();if(!fr||!ref)return;const hov=new Set();
  for(const src of ses.inputSources){if(!src.targetRaySpace||src.targetRayMode==='gaze')continue;const s=st(src);const p=fr.getPose(src.targetRaySpace,ref);if(!p){s.line.visible=false;continue}
   M.fromArray(p.transform.matrix).premultiply(xrToWorld());o.setFromMatrixPosition(M);d.set(0,0,-1).transformDirection(M);
   const b=panel.hit(o,d);s.hover=b;if(b)hov.add(b);s.line.visible=panel.root.visible;const L=b?b._d:2;s.line.position.copy(o);s.line.quaternion.setFromUnitVectors(new T.Vector3(0,0,-1),d);s.line.scale.set(1,1,L);s.line.material.color.set(b?0xffffff:0x9fd8ff)}
  for(const s of S.srcs.values())if(![...ses.inputSources].some(x=>S.srcs.get(x)===s))s.line.visible=false;
  panel.setHover(hov)};
 return S}
export function summon(T,panel,cam){const p=new T.Vector3(),q=new T.Quaternion();cam.getWorldPosition(p);cam.getWorldQuaternion(q);const e=new T.Euler().setFromQuaternion(q,'YXZ');const f=new T.Vector3(-Math.sin(e.y),0,-Math.cos(e.y));
 const r=panel.root;if(r.parent){r.parent.updateMatrixWorld(true)}const w=p.clone().addScaledVector(f,.7);w.y-=.18;const lw=r.parent?r.parent.worldToLocal(w.clone()):w;r.position.copy(lw);r.visible=true;r.updateMatrixWorld(true);
 const look=p.clone();look.y=w.y+.12;r.lookAt(look);panel.refresh()}
