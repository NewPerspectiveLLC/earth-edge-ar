// quest.html: one registry for every layer toggle -> 3D in-headset Layers panel (Y button) + 2D HUD + localStorage (QL).
import{makePanel,xrRays,summon}from'./qpanel.js';
const T=AFRAME.THREE;
const wait=()=>new Promise(r=>{const iv=setInterval(()=>{if(window.QVXG&&window.QGEO&&window.QGHOST&&window.QGAP&&window.QAPV){clearInterval(iv);r()}},200)});
await wait();
const sc=document.querySelector('a-scene'),QLs=()=>QL;const on=k=>QL[k]!==0;
const tagged=cat=>{const a=[];sc.object3D.traverse(o=>{if(o.userData&&o.userData.qcat===cat)a.push(o)});return a};
const domCat=cat=>[...document.querySelectorAll(`[data-qcat="${cat}"]`)];
const CATS=['vxLocal','vxWorld','vxAnti','ocean','coast','roads','saucers','ghost','places','poles','pyramids','edges'];
const isLabel=el=>el.tagName==='A-TEXT'&&!['msg','bm'].includes(el.id);
function apply(){QGAP();QAPV();
 for(const c of CATS){const v=on(c);for(const o of tagged(c))o.visible=v;for(const el of domCat(c))el.setAttribute('visible',v&&(on('labels')||!isLabel(el)))}
 if(window.QANTI)for(const k in QANTI)QANTI[k].setAttribute('visible',on(k)&&on('vxAnti')&&on('labels'));
 const gr=document.getElementById('grid');gr&&gr.setAttribute('visible',on('grid'));
 if(!on('labels'))document.querySelectorAll('a-text').forEach(el=>{if(isLabel(el)&&!panelEl(el))el.setAttribute('visible',false)});
 localStorage.eearQLayers=JSON.stringify(QL);hud();P&&P.refresh()}
const panelEl=el=>false;
function hud(){const b=(id,t)=>{const e=document.getElementById(id);if(e)e.textContent=t};b('ocB','Ocean: '+(on('ocean')?'on':'off'));b('sxB','Saucers/roads/ghost: '+(on('saucers')&&on('roads')&&on('ghost')?'on':'off'))}
// HUD buttons that used to flip coarse groups now go through the registry
const ocB=document.getElementById('ocB'),sxB=document.getElementById('sxB');
if(ocB)ocB.onclick=()=>{set('ocean',!on('ocean'))};if(sxB)sxB.onclick=()=>{const v=!(on('saucers')&&on('roads')&&on('ghost'));for(const k of['saucers','roads','ghost'])QL[k]=v?1:0;apply()};
function set(k,v){QL[k]=v?1:0;apply()}
const G=()=>window.QGEO||{};
const obj3=x=>x&&(x.object3D||x);
const R=[];const add=(section,key,label,objs,extra={})=>R.push(Object.assign({section,key,label,kind:'toggle',get:()=>on(key),set:v=>set(key,v),objs},extra));
add('Vortex','vxRA','Ready Athletics',()=>[QVXG.vxRA]);add('Vortex','vxCappy',"Cappy's",()=>[QVXG.vxCappy]);add('Vortex','vxGarden','Meditation Garden',()=>[QVXG.vxGarden]);
add('Vortex','vxLocal','Local style (wedges, pillar)',()=>tagged('vxLocal'));add('Vortex','vxWorld','World great circles',()=>tagged('vxWorld'));add('Vortex','vxAnti','Antipodes',()=>tagged('vxAnti'));
add('Earth','continents','Continents (all)',()=>[G().continents]);for(const[k,l]of[['africa','Africa'],['north_america','North America'],['south_america','South America'],['asia','Asia'],['europe','Europe'],['antarctica','Antarctica'],['australia','Australia']])add('Earth',k,l,()=>[G()[k]]);
add('Earth','rainier','Mount Rainier',()=>[G().rainier]);add('Earth','baker','Mount Baker',()=>[G().baker]);
add('Local','shore','PT shoreline',()=>[G().shore]);add('Local','coast','Coastline (old)',()=>tagged('coast'));add('Local','ocean','Ocean',()=>tagged('ocean'));add('Local','grid','Grid',()=>[obj3(document.getElementById('grid'))]);add('Local','roads','Roads & streets',()=>tagged('roads'));
add('Places','places','Local places',()=>domCat('places').map(obj3));add('Places','poles','Poles',()=>domCat('poles').map(obj3));add('Places','pyramids','Pyramids',()=>domCat('pyramids').map(obj3));add('Places','icecube','IceCube',()=>[G().icecube]);add('Places','edges','Earth edges N/E/S/W',()=>domCat('edges').map(obj3));
add('Places','saucers','Saucers & pads',()=>tagged('saucers'));add('Places','ghost','GhostBot',()=>tagged('ghost'));
add('Labels','labels','Labels (master)',()=>[...document.querySelectorAll('a-text')].filter(isLabel).filter(e=>e.getAttribute('visible')!==false||true).slice(0,0).concat([...document.querySelectorAll('a-text[data-qcat="places"]')].map(obj3)));
R.push({section:'Labels',key:'labelsAllOn',label:'All labels ON',kind:'action',run:()=>{QL.labels=1;apply()}});R.push({section:'Labels',key:'labelsAllOff',label:'All labels OFF',kind:'action',run:()=>{QL.labels=0;apply()}});
const camOnQ=()=>localStorage.eearCam!=='off';
R.push({section:'View',key:'camera',label:'Camera passthrough',kind:'toggle',get:camOnQ,set:v=>{if(v!==camOnQ())window.camToggleQ()},objs:()=>[window.QSKY]});
R.push({section:'View',key:'smoothTurn',label:'Smooth turn (else snap 30°)',kind:'toggle',get:()=>!!(window.QFLY&&QFLY.smooth),set:v=>{QFLY.smooth=!!v;localStorage.eearSmoothTurn=v?'1':'0'},objs:()=>[]});
R.push({section:'View',key:'ground',label:'Return to ground',kind:'action',run:()=>window.qGround&&qGround()});
R.push({section:'View',key:'floorUp',label:'Floor +10 cm',kind:'action',run:()=>qFloor(.1)},{section:'View',key:'floorDn',label:'Floor -10 cm',kind:'action',run:()=>qFloor(-.1)});
/* Live tracking state in the headset (TEST config auto-joins); off = pause (keeps the session), on = join / resume */
const LVo=()=>window.EEAR_LIVE;R.push({section:'View',key:'live',label:'Live tracking',kind:'toggle',get:()=>!!(LVo()&&LVo().active),set:v=>{const L=LVo();if(!L)return;const S=L.S;if(v){if(S&&S.live&&S.paused)document.getElementById('tmP').click();else{const b=document.getElementById('joinB');b&&b.click()}}else if(S&&S.live&&!S.paused)document.getElementById('tmP').click();setTimeout(()=>P.refresh(),1500);setTimeout(()=>P.refresh(),4000)},objs:()=>[]});
R.push({section:'View',key:'close',label:'Close panel',kind:'action',run:()=>{P.root.visible=false}});
const SECTIONS=['Vortex','Earth','Local','Places','Labels','View'];
for(const it of R)if(it.kind==='toggle'&&QL[it.key]===undefined&&it.key!=='camera')QL[it.key]=1;
const P=makePanel(T,{items:R,sections:SECTIONS,title:'Earth Edge AR Layers'});sc.object3D.add(P.root);
P.root.traverse(o=>{if(o.material)o.material.userData.pf=1});
const rig=document.getElementById('rig').object3D;
const X=xrRays(T,{renderer:sc.renderer,scene:sc.object3D,panel:P,xrToWorld:()=>{rig.updateMatrixWorld(true);return rig.matrixWorld}});
AFRAME.registerComponent('qlayers-tick',{tick(){if(sc.renderer.xr.isPresenting)X.tick()}});sc.setAttribute('qlayers-tick','');
window.QPANEL_TOGGLE=()=>{if(P.root.visible){P.root.visible=false}else{P.refresh();summon(T,P,sc.camera)}};
window.QPANEL=P;window.QREG=R;window.QXR=X;window.QAPPLY=apply;
apply();
