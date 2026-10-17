// index.html WebXR (Quest browser AR): the same 3D Layers panel as quest.html, driven by LAY/applyLayers so it stays in sync with the 2D Layers sheet + localStorage.eearLayers.
import*as T from'three';import{makePanel,xrRays,summon}from'./qpanel.js?v=1792279505907';
const wait=()=>new Promise(r=>{const iv=setInterval(()=>{if(window.EEAR&&window.applyLayers&&window.layRefresh){clearInterval(iv);r()}},200)});
await wait();
const{ren,scene,LAY}=EEAR;const L=window.LAYERS;
const byLayer=k=>{const a=[];scene.traverse(o=>{if(o.userData&&o.userData.layer===k&&!o.isSprite)a.push(o)});return a};
const set=(k,v)=>{LAY[k]=v?1:0;if(k==='sat')localStorage.eearSatUser='1';if(k==='ghost'&&window.GHOST){GHOST.visible=!!LAY.ghost;localStorage.eearGhost=LAY.ghost?'on':'off'}applyLayers();layRefresh()};
const SEC={Vortex:['vxRA','vxCappy','vxGarden','vortexL','vortexW'],Earth:['sat','continents','africa','north_america','south_america','asia','europe','antarctica','australia','rainier','baker'],Local:['shore','coast','ocean','roads','grid'],Places:['places','lines','edges','far','icecube','saucers','ghost','beams'],Sky:['moon','sun'],Labels:['labels']};
const SHORT={vxRA:'Ready Athletics',vxCappy:"Cappy's",vxGarden:'Meditation Garden',vortexL:'Local style (wedges, pillar)',vortexW:'World great circles',far:'Poles & pyramids',coast:'Coastline (old)',shore:'PT shoreline',antarctica:'Antarctica',australia:'Australia',rainier:'Mount Rainier',baker:'Mount Baker',icecube:'IceCube',saucers:'Saucers & pads',continents:'Continents (all)',moon:'Moon (real-time)',sun:'Sun (real-time)',sat:'Satellite map (© Esri)'};
const R=[];for(const s in SEC)for(const k of SEC[s])if(L[k])R.push({section:s,key:k,label:SHORT[k]||L[k],kind:'toggle',get:()=>!!LAY[k],set:v=>set(k,v),objs:()=>k==='sat'?[window.SAT&&SAT.g].filter(Boolean):k==='moon'||k==='sun'?[window.SKY&&SKY[k]].filter(Boolean):k==='labels'?(window.LABELS||[]).slice(0,8):k==='ghost'&&window.GHOST?[GHOST]:byLayer(k)});
for(const[o,l]of[[.3,'Satellite 30%'],[.6,'Satellite 60%'],[1,'Satellite opaque']])R.push({section:'Earth',key:'satOp'+Math.round(o*100),label:l,kind:'action',run:()=>{satOpacity(o);window.satSync&&satSync()}});
R.push({section:'Labels',key:'labelsAllOn',label:'All labels ON',kind:'action',run:()=>{LOFF.clear();localStorage.eearLabelsOff='[]';set('labels',1)}},{section:'Labels',key:'labelsAllOff',label:'All labels OFF',kind:'action',run:()=>set('labels',0)});
R.push({section:'View',key:'camera',label:'Camera passthrough',kind:'toggle',get:()=>camOnM(),set:v=>{if(v!==camOnM())camToggle()},objs:()=>[window.DSKY]});
R.push({section:'View',key:'smoothTurn',label:'Smooth turn (else snap 30°)',kind:'toggle',get:()=>!!FLY.smooth,set:v=>{FLY.smooth=!!v;localStorage.eearSmoothTurn=v?'1':'0'},objs:()=>[]});
R.push({section:'View',key:'ground',label:'Return to ground',kind:'action',run:()=>flyGround()},{section:'View',key:'floorUp',label:'Floor +10 cm',kind:'action',run:()=>floorStep(.1)},{section:'View',key:'floorDn',label:'Floor -10 cm',kind:'action',run:()=>floorStep(-.1)});
R.push({section:'View',key:'close',label:'Close panel',kind:'action',run:()=>{P.root.visible=false}});
const base=R.slice();let P=null,nL=-1;
const lk=x=>x.userData.meta&&x.userData.meta.title||'';
function build(){const T0=[...new Set((window.LABELS||[]).filter(x=>x.parent).map(lk).filter(Boolean))].sort((a,b)=>a.localeCompare(b)).slice(0,25);if(P&&T0.length===nL)return;nL=T0.length;
 const items=base.slice();const at=items.findIndex(x=>x.key==='labelsAllOff')+1;
 items.splice(at,0,...T0.map(t=>({section:'Labels',key:'lab:'+t,label:t,kind:'toggle',get:()=>!LOFF.has(t),set:v=>labelSet(t,v),objs:()=>LABELS.filter(x=>lk(x)===t)})));
 const vis=P&&P.root.visible,pos=P&&P.root.position.clone(),q=P&&P.root.quaternion.clone();if(P)scene.remove(P.root);
 P=makePanel(T,{items,sections:['Vortex','Earth','Local','Places','Sky','Labels','View'],title:"Matt's Reality Layers"});scene.add(P.root);P.root.traverse(o=>{if(o.material)o.material.userData.pf=1});
 if(vis){P.root.position.copy(pos);P.root.quaternion.copy(q);P.root.visible=true}window.MPANEL=P;window.MREG=items}
build();
const I=new T.Matrix4();const X=xrRays(T,{renderer:ren,scene,panel:()=>P,xrToWorld:()=>I});
ren.xr.addEventListener('sessionend',()=>{P.root.visible=false});
const tick=()=>{if(ren.xr.isPresenting)X.tick()};
window.MPANEL_TICK=tick;
window.MPANEL_TOGGLE=()=>{if(P.root.visible)P.root.visible=false;else{build();summon(T,P,ren.xr.isPresenting?ren.xr.getCamera():EEAR.cam)}};
window.MXR=X;window.MPANEL_BUILD=build;

