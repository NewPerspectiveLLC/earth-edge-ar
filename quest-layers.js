// quest.html: one registry for every layer toggle -> 3D in-headset Layers panel (Y button) + 2D HUD + localStorage (QL).
import{makePanel,xrRays,summon}from'./qpanel.js?v=1792453397229';
const T=AFRAME.THREE;
const wait=()=>new Promise(r=>{const iv=setInterval(()=>{if(window.QVXG&&window.QGEO&&window.QGHOST&&window.QGAP&&window.QAPV){clearInterval(iv);r()}},200)});
await wait();
const sc=document.querySelector('a-scene'),QLs=()=>QL;const on=k=>QL[k]!==0;
const tagged=cat=>{const a=[];sc.object3D.traverse(o=>{if(o.userData&&o.userData.qcat===cat)a.push(o)});return a};
const domCat=cat=>[...document.querySelectorAll(`[data-qcat="${cat}"]`)];
const CATS=['parcelRA','colsRA','parcelCappy','colsCappy','raTrail','vxLocal','vxWorld','vxAnti','ocean','coast','roads','saucers','ghost','places','poles','pyramids','edges','moon','sun','sat'];
const isLabel=el=>el.tagName==='A-TEXT'&&!['msg','bm'].includes(el.id);
function apply(){QGAP();QAPV();
 for(const c of CATS){const v=on(c);for(const o of tagged(c))o.visible=v;for(const el of domCat(c))el.setAttribute('visible',v&&(on('labels')||!isLabel(el)))}
 if(window.QANTI)for(const k in QANTI)QANTI[k].setAttribute('visible',on(k)&&on('vxAnti')&&on('labels'));
 const gr=document.getElementById('grid');gr&&gr.setAttribute('visible',on('grid'));
 /* labels hidden by the master / per-label switches are marked so they come back exactly (not left hidden) */
 for(const el of qLabels()){const off=!on('labels')||QLOFF.has(qlk(el));if(off){if(el.getAttribute('visible')!==false||el.dataset.qlh){el.dataset.qlh=1;el.setAttribute('visible',false)}}else if(el.dataset.qlh){delete el.dataset.qlh;if(!(el.dataset.qcat&&!on(el.dataset.qcat)))el.setAttribute('visible',true)}}
 localStorage[window.QLKEY||'eearQLayers']=JSON.stringify(QL);hud();P&&P.refresh()}
const panelEl=el=>false;
/* universal labels: per-label off set (first line of the a-text = key), persisted */
const QLOFF=window.QLOFF=new Set(JSON.parse(localStorage.eearQLabelsOff||'[]'));const qlk=el=>String(el.getAttribute('value')||'').split('\n')[0].trim();
const qLabels=()=>[...document.querySelectorAll('a-text')].filter(el=>isLabel(el)&&el.id!=='flyT'&&!el.closest('#others'));
window.qLabelSet=(k,on)=>{if(on)QLOFF.delete(k);else QLOFF.add(k);localStorage.eearQLabelsOff=JSON.stringify([...QLOFF]);apply()};
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
add('Earth','sat','Ground map (on/off)',()=>window.QSAT?[QSAT.g]:[]);
R.push({section:'Earth',key:'mapSat',label:'Map style: Satellite',kind:'toggle',get:()=>(window.qMapStyle?qMapStyle():'sat')==='sat',set:()=>{window.qSetMapStyle&&qSetMapStyle('sat');P&&P.refresh()},objs:()=>[]});
R.push({section:'Earth',key:'mapStreet',label:'Map style: Street',kind:'toggle',get:()=>(window.qMapStyle?qMapStyle():'sat')==='street',set:()=>{window.qSetMapStyle&&qSetMapStyle('street');P&&P.refresh()},objs:()=>[]});
R.push({section:'Earth',key:'satOpaque',label:'Map opaque (else 60%)',kind:'toggle',get:()=>QL.satOpaque===1,set:v=>{QL.satOpaque=v?1:0;window.qSatOpacity&&qSatOpacity();apply()},objs:()=>[]});
add('Earth','continents','Continents (all)',()=>[G().continents]);for(const[k,l]of[['africa','Africa'],['north_america','North America'],['south_america','South America'],['asia','Asia'],['europe','Europe'],['antarctica','Antarctica'],['australia','Australia']])add('Earth',k,l,()=>[G()[k]]);
add('Earth','rainier','Mount Rainier',()=>[G().rainier]);add('Earth','baker','Mount Baker',()=>[G().baker]);
add('Local','shore','PT shoreline',()=>[G().shore]);add('Local','coast','Coastline (old)',()=>tagged('coast'));add('Local','ocean','Ocean',()=>tagged('ocean'));add('Local','grid','Grid',()=>[obj3(document.getElementById('grid'))]);add('Local','roads','Roads & streets',()=>tagged('roads'));
add('Places','places','Local places',()=>domCat('places').map(obj3));add('Places','poles','Poles',()=>domCat('poles').map(obj3));add('Places','pyramids','Pyramids',()=>domCat('pyramids').map(obj3));add('Places','icecube','IceCube',()=>[G().icecube]);add('Places','edges','Earth edges N/E/S/W',()=>domCat('edges').map(obj3));
add('Places','saucers','Saucers & pads',()=>tagged('saucers'));add('Places','ghost','GhostBot',()=>tagged('ghost'));add('Places','beams','Player beams (purple)',()=>Object.values(window.QBEAMS||{}).map(obj3));
/* d51: no drive-in screen in the Quest main world (theater portal instead) */
R.push({section:'Portals',key:'ptTheater',label:'🎬 Go to: Movie theater (sound)',kind:'action',run:()=>{window.QPORTALS&&QPORTALS.enterTheater();P.root.visible=false}},{section:'Portals',key:'ptRA',label:'🌀 Go to: Ready Athletics spot',kind:'action',run:()=>{window.QPORTALS&&QPORTALS.goRA();P.root.visible=false}},{section:'Portals',key:'ptBack',label:'↩ Back (after RA) / Exit theater',kind:'action',run:()=>{if(!window.QPORTALS)return;if(QPORTALS.mode==='theater')QPORTALS.exitTheater();else QPORTALS.back();P.root.visible=false}});
add('Sky','skybox','Skybox (off = flat black)',()=>window.QSKYBOX?[QSKYBOX]:[]);add('Sky','moon','Moon (real-time)',()=>window.QSKYB?[QSKYB.moon]:[]);add('Sky','sun','Sun (real-time)',()=>window.QSKYB?[QSKYB.sun]:[]);
add('Labels','labels','Labels (master)',()=>[...document.querySelectorAll('a-text')].filter(isLabel).filter(e=>e.getAttribute('visible')!==false||true).slice(0,0).concat([...document.querySelectorAll('a-text[data-qcat="places"]')].map(obj3)));
R.push({section:'Labels',key:'labelsAllOn',label:'All labels ON',kind:'action',run:()=>{QL.labels=1;QLOFF.clear();localStorage.eearQLabelsOff='[]';apply()}});R.push({section:'Labels',key:'labelsAllOff',label:'All labels OFF',kind:'action',run:()=>{QL.labels=0;apply()}});
const camOnQ=()=>localStorage.eearCam!=='off';
R.push({section:'View',key:'camera',label:'Camera passthrough',kind:'toggle',get:camOnQ,set:v=>{if(v!==camOnQ())window.camToggleQ()},objs:()=>[window.QSKY]});
R.push({section:'View',key:'smoothTurn',label:'Smooth turn (else snap 30°)',kind:'toggle',get:()=>!!(window.QFLY&&QFLY.smooth),set:v=>{QFLY.smooth=!!v;localStorage.eearSmoothTurn=v?'1':'0'},objs:()=>[]});
R.push({section:'View',key:'ground',label:'Return to ground',kind:'action',run:()=>window.qGround&&qGround()});
R.push({section:'View',key:'floorUp',label:'Floor +10 cm',kind:'action',run:()=>qFloor(.1)},{section:'View',key:'floorDn',label:'Floor -10 cm',kind:'action',run:()=>qFloor(-.1)});
/* Live tracking state in the headset (TEST config auto-joins); off = pause (keeps the session), on = join / resume */
const LVo=()=>window.EEAR_LIVE;R.push({section:'View',key:'live',label:'Live tracking',kind:'toggle',get:()=>!!(LVo()&&LVo().active),set:v=>{const L=LVo();if(!L)return;const S=L.S;if(v){if(S&&S.live&&S.paused)document.getElementById('tmP').click();else{const b=document.getElementById('joinB');b&&b.click()}}else if(S&&S.live&&!S.paused)document.getElementById('tmP').click();setTimeout(()=>P.refresh(),1500);setTimeout(()=>P.refresh(),4000)},objs:()=>[]});
R.push({section:'View',key:'board',label:'Board spaceship',kind:'action',run:()=>qBoard()},{section:'View',key:'exitShip',label:'Exit ship (to ground)',kind:'action',run:()=>qExit()});
R.push({section:'View',key:'vignette',label:'Comfort vignette (ship)',kind:'toggle',get:()=>!!QSHIP.vignette,set:v=>{QSHIP.vignette=!!v;localStorage.eearVignette=v?'1':'0'},objs:()=>[]});
const QPW=()=>window.QPOW;R.push({section:'Powers',key:'powOn',label:'Powers (A = fire)',kind:'toggle',get:()=>!!(QPW()&&QPW().enabled),set:v=>QPW()&&QPW().setEnabled(v)},
 {section:'Powers',key:'powW0',label:'Weapon: Freeze (water)',kind:'toggle',get:()=>!!(QPW()&&QPW().weapon===0),set:()=>QPW()&&QPW().setWeapon(0)},
 {section:'Powers',key:'powW1',label:'Weapon: Web lock',kind:'toggle',get:()=>!!(QPW()&&QPW().weapon===1),set:()=>QPW()&&QPW().setWeapon(1)},
 {section:'Powers',key:'powW2',label:'Weapon: Tow line',kind:'toggle',get:()=>!!(QPW()&&QPW().weapon===2),set:()=>QPW()&&QPW().setWeapon(2)},
 {section:'Powers',key:'thawAll',label:'Thaw all',kind:'action',run:()=>QPW()&&QPW().thawAll()},{section:'Powers',key:'clearWebs',label:'Clear all webs',kind:'action',run:()=>QPW()&&QPW().clearWebs()},
 {section:'Powers',key:'relTow',label:'Release tow',kind:'action',run:()=>QPW()&&QPW().release()},
 {section:'Powers',key:'nSet',label:"Set north = where I'm facing",kind:'action',run:()=>window.qNorthSet&&qNorthSet()},{section:'Powers',key:'nP5',label:'Nudge north +5°',kind:'action',run:()=>window.qNorthNudge&&qNorthNudge(5)},
 {section:'Powers',key:'nM5',label:'Nudge north −5°',kind:'action',run:()=>window.qNorthNudge&&qNorthNudge(-5)},{section:'Powers',key:'nReset',label:'Reset north',kind:'action',run:()=>window.qNorthReset&&qNorthReset()});
R.push({section:'View',key:'lite',label:'Lite mode (reloads)',kind:'toggle',get:()=>!!window.EEAR_LITE,set:v=>{localStorage.eearLite=v?'1':'0';location.reload()}});
R.push({section:'View',key:'close',label:'Close panel',kind:'action',run:()=>{P.root.visible=false}});
/* d49: official parcels + stone corner columns + RA trail (parcels.js?v=1792453397229) */
add('Places','parcelRA','RA parcel 997800502',()=>tagged('parcelRA'));add('Places','colsRA','RA corner columns',()=>tagged('colsRA'));add('Places','parcelCappy',"Cappy's parcel 998002802",()=>tagged('parcelCappy'));add('Places','colsCappy',"Cappy's corner columns",()=>tagged('colsCappy'));add('Places','raTrail','RA trail',()=>tagged('raTrail'));
/* d49: ROOM (same as the title-card picker on iPhone/desktop). Each room keeps its own Layers state; switching is live (no reload, music/DJ + presence keep going). */
const ROOMN={'matts-reality':"Matt's Reality",'ra-master-map':'Ready Athletics Master Map'};let RM=null;import('./rooms.js?v=1792453397229').then(M=>RM=M).catch(()=>{});
function setRoom(r){if(r===window.QROOM)return;localStorage[window.QLKEY]=JSON.stringify(QL);window.QROOM=localStorage.eearRoom=r;window.QLKEY=r==='ra-master-map'?'eearQLayers_ra':'eearQLayers';let st={};try{st=JSON.parse(localStorage[window.QLKEY]||'{}')}catch(e){}
 const pre=r==='ra-master-map'?(RM?RM.QRA_PRESET:{}):(RM?RM.QMR_DEFAULTS:{raTrail:0});for(const k of Object.keys(QL))QL[k]=1;Object.assign(QL,{satOpaque:0},pre,st);apply();nL=-1;build();try{history.replaceState(null,'','?room='+r)}catch(e){}window.qSay&&qSay(ROOMN[r])}
for(const r in ROOMN)R.push({section:'Room',key:'room:'+r,label:ROOMN[r],kind:'toggle',get:()=>window.QROOM===r,set:()=>setRoom(r)});
R.push({section:'Room',key:'roomRA',label:'Go to RA parcel (Master Map)',kind:'action',run:()=>{setRoom('ra-master-map')}});
/* d49: Ghost (ghostctl.js?v=1792453397229 settings, same as the 2D 'Ghost & Orb controls' screen, localStorage.eearGhostCfg) */
const GC=()=>window.EEAR_GHOSTCTL,GMODES=['classic','orbit','follow','wander','mirror'],GMN={classic:'Classic',orbit:'Orbit me',follow:'Follow me',wander:'Wander',mirror:'Mirror'};
const gv=k=>GC()?GC().get()[k]:0,gs=p=>GC()&&GC().set(p),fx=v=>(Math.round(v*100)/100).toString();
R.push({section:'Ghost',key:'gMode',label:'Mode',lbl:()=>'Mode: '+(GMN[gv('mode')]||'…'),kind:'action',run:()=>{const i=GMODES.indexOf(gv('mode'));gs({mode:GMODES[(i+1)%GMODES.length]})}});
R.push({section:'Ghost',key:'gPreset',label:'Preset',lbl:()=>'Preset: '+(window._gp||'tap to cycle'),kind:'action',run:()=>{const P=['Calm','Playful','Shadowing','Wild'];const i=(P.indexOf(window._gp)+1)%P.length;window._gp=P[i];GC()&&GC().preset(P[i])}});
const gstep=(k,lab,d,mn,mx,pair)=>{for(const sg of[-1,1])R.push({section:'Ghost',key:'g'+k+sg,label:lab,lbl:()=>`${lab} ${sg>0?'+':'−'}  (${fx(gv(k))}${pair?'–'+fx(gv(pair)):''})`,kind:'action',run:()=>{const p={};p[k]=Math.min(mx,Math.max(mn,gv(k)+sg*d));if(pair)p[pair]=Math.min(mx,Math.max(mn,gv(pair)+sg*d));gs(p)}})};
gstep('speedMin','Speed',.2,.05,15,'speedMax');gstep('distMin','Distance',1,.5,200,'distMax');gstep('height','Height',.5,-1,20);gstep('jitter','Random',.1,0,1);gstep('pauseEvery','Linger every',5,0,120);gstep('approach','Shy↔Bold',.25,-1,1);
R.push({section:'Ghost',key:'gShow',label:'Show ghost',kind:'toggle',get:()=>on('ghost'),set:v=>set('ghost',v)},{section:'Ghost',key:'gReset',label:'Reset ghost',kind:'action',run:()=>GC()&&GC().reset()});
/* d49: Orb (orbit.js?v=1792453397229 settings, same as the 2D screen; Matt's GM 'Apply to everyone' settings are followed unless 'Follow Matt' is off) */
const OA=()=>window.EEAR_ORBAPI,oc=()=>OA()?OA().orbCfg():{},ol=p=>OA()&&OA().setOrbCfg(p);let OC=null;import('./orbctl.js?v=1792453397229').then(M=>OC=M).catch(()=>{});
const TOURS=['ra','cappy','alt','off'],TN={ra:'Ready Athletics',cappy:"Cappy's trails",alt:'Alternate',off:'Off'},MN={auto:'Auto',manual:'Manual (steer)',goto:'Go-to',tour:'Tour'};
const steer=v=>{window.QORBSTEER=!!v;window.EEAR_ORBSTEER={x:0,y:0,h:0};ol({mode:v?'manual':'auto'})};
R.push({section:'Orb',key:'oMode',label:'Orb',lbl:()=>'Orb: '+(MN[oc().mode]||'…')+(window.EEAR_AUDIO&&!EEAR_AUDIO.flyOn?' (Flying sound off)':''),kind:'action',run:()=>{steer(false);ol({mode:'auto',goto:null})}});
R.push({section:'Orb',key:'oSteer',label:'Steer orb (left stick; R-stick Y = height)',kind:'toggle',get:()=>!!window.QORBSTEER,set:v=>steer(v)});
R.push({section:'Orb',key:'oAhead',label:'Send orb 40 m ahead',kind:'action',run:()=>{const c=sc.camera,f=window.QF;if(!f||!OC)return;const p=new T.Vector3(),d=new T.Vector3();c.getWorldPosition(p);c.getWorldDirection(d);d.y=0;d.normalize();p.addScaledVector(d,40);f.worldToLocal(p);steer(false);OC.sendGoto(HOME[0]-p.z/111320,HOME[1]+p.x/window.QMPQ)}});
R.push({section:'Orb',key:'oTour',label:'Tour now',kind:'action',run:()=>{steer(false);OC&&OC.tourNow()}});
R.push({section:'Orb',key:'oTours',label:'Tours',lbl:()=>'Tours: '+(TN[oc().tour]||'…'),kind:'action',run:()=>{const i=TOURS.indexOf(oc().tour);ol({tour:TOURS[(i+1)%TOURS.length]})}});
const ostep=(k,lab,d,u)=>{for(const sg of[-1,1])R.push({section:'Orb',key:'o'+k+sg,label:lab,lbl:()=>`${lab} ${sg>0?'+':'−'}  (${fx(oc()[k]||0)}${u})`,kind:'action',run:()=>ol({[k]:(oc()[k]||0)+sg*d})})};
ostep('radius','Radius',5,' m, min 25');ostep('speed','Speed',.2,'×');ostep('lingerF','Linger',.25,'×');
R.push({section:'Orb',key:'oHold',label:'Hold at go-to spot',kind:'toggle',get:()=>!!oc().hold,set:v=>ol({hold:!!v})});
R.push({section:'Orb',key:'oFollow',label:"Follow Matt's orb settings",kind:'toggle',get:()=>OA()?OA().orbCfgLocal().follow!==false:true,set:v=>ol({follow:!!v})});
const SECTIONS=['Room','Portals','Vortex','Earth','Local','Places','Sky','Labels','View','Powers','Ghost','Orb'];
for(const it of R)if(it.kind==='toggle'&&!it.key.includes(':')&&!['gShow','oSteer','oHold','oFollow'].includes(it.key)&&QL[it.key]===undefined&&it.key!=='camera'&&it.key!=='satOpaque'&&it.key!=='mapSat'&&it.key!=='mapStreet')QL[it.key]=1;
let P=null,nL=-1;const base=R.slice();
function build(){const T0=[...new Set(qLabels().map(qlk).filter(Boolean))].sort((a,b)=>a.localeCompare(b)).slice(0,25);if(P&&T0.length===nL)return;nL=T0.length;
 const items=base.slice();const at=items.findIndex(x=>x.key==='labelsAllOff')+1;
 items.splice(at,0,...T0.map(t=>({section:'Labels',key:'lab:'+t,label:t,kind:'toggle',get:()=>!QLOFF.has(t),set:v=>qLabelSet(t,v),objs:()=>qLabels().filter(el=>qlk(el)===t).map(obj3)})));
 const vis=P&&P.root.visible,pos=P&&P.root.position.clone(),q=P&&P.root.quaternion.clone(),par=P&&P.root.parent||sc.object3D;if(P&&P.root.parent)P.root.parent.remove(P.root);
 P=makePanel(T,{items,sections:SECTIONS,title:(window.QROOM==='ra-master-map'?'RA Master Map':"Matt's Reality")+' · Layers'});par.add(P.root);P.root.traverse(o=>{if(o.material)o.material.userData.pf=1});
 if(vis){P.root.position.copy(pos);P.root.quaternion.copy(q);P.root.visible=true}window.QPANEL=P;window.QREG=items}
build();
const rig=document.getElementById('rig').object3D;
const X=xrRays(T,{renderer:sc.renderer,scene:sc.object3D,panel:()=>P,xrToWorld:()=>{rig.updateMatrixWorld(true);return rig.matrixWorld}});
AFRAME.registerComponent('qlayers-tick',{tick(){if(sc.renderer.xr.isPresenting)X.tick()}});sc.setAttribute('qlayers-tick','');
window.QPANEL_TOGGLE=()=>{if(P.root.visible){P.root.visible=false}else{build();P.refresh();summon(T,P,sc.camera)}};
window.QXR=X;window.QPANEL_BUILD=build;
/* in the ship the same panel is the dashboard: docked on the console, tilted toward the pilot, always on */
window.QPANEL_DOCK=cp=>{build();if(P.root.parent)P.root.parent.remove(P.root);cp.add(P.root);P.root.position.set(0,1.2,-.66);P.root.rotation.set(-.55,0,0);P.root.scale.setScalar(.9);P.root.visible=true;P.refresh()};
window.QPANEL_UNDOCK=()=>{if(P.root.parent)P.root.parent.remove(P.root);sc.object3D.add(P.root);P.root.scale.setScalar(1);P.root.visible=false};window.QAPPLY=apply;
apply();
