// Opt-in multiplayer + glowing x-ray stick figures. Nothing leaves the device until the user consents and joins.
import*as T from'three';import{liveUI}from'./liveui.js?v=1792186882745';
export function initMP({scene,cam,getPos,toLocal}){
const API=(window.EEAR_API||'')+'/api';let timer=null,others={};window.MP_OTHERS=others;
const css=`#mpb{position:fixed;right:8px;bottom:40px;z-index:7}#radar{position:fixed;left:8px;top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 134px);z-index:7;width:120px;height:120px;border-radius:60px;background:#0008;display:none}`;
document.head.insertAdjacentHTML('beforeend','<style>'+css+'</style>');
document.body.insertAdjacentHTML('beforeend',`<div id=mpb></div><canvas id=radar width=240 height=240></canvas>`);
const $=id=>document.getElementById(id);
const UA=navigator.userAgent,DEV=/iPhone|iPod/.test(UA)?'iphone':/Android/.test(UA)&&/Mobile/.test(UA)?'android':'desktop';window.EEAR_DEV=DEV;
const LV=liveUI({key:'eearSession',device:DEV,api:API,start:on,stop:off});window.EEAR_LIVE=LV;
// ---- ping: 'Ping now' (fresh high-accuracy fix, maximumAge 0) + interval (1/3/5/10/30 s, saved) + last-ping readout + screen wake lock
document.head.insertAdjacentHTML('beforeend',`<style>#pingW{position:fixed;left:max(8px,env(safe-area-inset-left));bottom:calc(env(safe-area-inset-bottom,0px) + 6px);z-index:22;display:flex;gap:6px;align-items:stretch;max-width:196px}
#pingB{font:bold 17px sans-serif;padding:0 12px;min-height:54px;border-radius:14px;border:0;background:#2fd06b;color:#000;box-shadow:0 0 0 2px #0006}#pingC{display:flex;flex-direction:column;justify-content:space-between;font:11px sans-serif;color:#fff;background:#000a;border-radius:10px;padding:3px 5px}
#pingC select{font-size:12px;padding:1px}#pingC button{font-size:11px;padding:2px 4px;margin:0}#pingT{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 110px);z-index:60;background:#111e;color:#fff;font:bold 15px sans-serif;padding:10px 14px;border-radius:12px;display:none;max-width:86vw;text-align:center}
@media (pointer:coarse){#ui2{display:none}}</style>`);
document.body.insertAdjacentHTML('beforeend',`<div id=pingW title="Keep the app open and the screen on: iOS pauses GPS and pings when the screen locks or Safari is in the background"><button id=pingB>📍 Ping<br>now</button><div id=pingC><select id=pingI aria-label="ping interval">${[1,3,5,10,30].map(v=>`<option value=${v}>every ${v}s</option>`).join('')}</select><span id=pingL>not live</span><button id=wakeB>🔆 Screen on: off</button></div></div><div id=pingT></div>`);
const toast=(t,ms=3500)=>{const e=$('pingT');e.innerHTML=t;e.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>e.style.display='none',ms)};window.eearToast=toast;
let PING_S=+localStorage.eearPingS||3,lastPing=0,posTimer=null;$('pingI').value=PING_S;
$('pingI').onchange=()=>{PING_S=+$('pingI').value;localStorage.eearPingS=PING_S;if(timer)on();toast('Ping interval: every '+PING_S+' s'+(PING_S===1?' (high frequency, more battery)':''))};
const sendPos=async(p,fresh)=>{const r=await LV.call('/pos',p);if(r&&r.ok){lastPing=Date.now();return r}throw new Error(r&&r.error||'no response')};
setInterval(()=>{$('pingL').textContent=!LV.active?'not live':lastPing?'last ping '+Math.round((Date.now()-lastPing)/1000)+'s ago':'no ping yet'},500);
$('pingB').onclick=async()=>{const b=$('pingB');b.disabled=true;try{
  if(!LV.active){$('joinB').click();for(let i=0;i<40&&!LV.active;i++)await new Promise(r=>setTimeout(r,250));if(!LV.active)throw new Error('could not join live tracking')}
  const f=await new Promise((res,rej)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,maximumAge:0,timeout:15000}):rej(new Error('no GPS')));
  const p=getPos()||{};const r=await sendPos({lat:f.coords.latitude,lon:f.coords.longitude,acc:f.coords.accuracy,hdg:p.hdg},true);
  toast('Ping sent · ±'+Math.round(f.coords.accuracy)+' m · '+new Date(r.t||Date.now()).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'}))}
 catch(e){toast('Ping failed: '+(e.code===1?'location permission denied':e.code===3?'GPS timeout':e.message),5000)}b.disabled=false};
let WL=null;const wakeUI=()=>$('wakeB').textContent='🔆 Screen on: '+(WL?'on':'off');
async function wake(on){try{if(on){if(!('wakeLock'in navigator))return toast('Screen wake lock not supported here: set Auto-Lock to Never while playing');WL=await navigator.wakeLock.request('screen');WL.addEventListener('release',()=>{WL=null;wakeUI()})}else{await WL?.release();WL=null}}catch(e){toast('Wake lock: '+e.message)}localStorage.eearWake=on?'1':'0';wakeUI()}
$('wakeB').onclick=()=>wake(!WL);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&localStorage.eearWake==='1'&&!WL)wake(true)});

function on(){clearInterval(timer);clearInterval(posTimer);timer=setInterval(tick,3000);posTimer=setInterval(posTick,PING_S*1000);$('radar').style.display='block';tick();posTick();if(!on.hint){on.hint=1;toast('Live. Keep the app open and the screen on: iOS pauses GPS when the screen locks.',5000)}}
function posTick(){if(!LV.active)return;const p=getPos();if(p)sendPos({lat:p.lat,lon:p.lon,acc:p.acc,hdg:p.hdg}).catch(()=>{})}
function off(){clearInterval(timer);clearInterval(posTimer);timer=null;for(const k in others){scene.remove(others[k].g)}others={};window.MP_OTHERS=others;$('radar').style.display='none'}
async function tick(){if(!LV.active)return;const S=LV.S;
try{const r=await fetch(API+'/players',{headers:{authorization:'Bearer '+S.token}}).then(r=>r.json());if(r.error==='not joined'){LV.lost();return}
if(r.policy)window.EEAR_POLICY=r.policy;
const seen={};for(const o of r.players||[]){if(!o.last)continue;seen[o.id]=1;const st=o.mode==='stealth',sg=st+'|'+o.name+'|'+(o.style||'');if(others[o.id]&&others[o.id].sg!==sg){scene.remove(others[o.id].g);delete others[o.id]}
 if(!others[o.id]){const nm=o.name+(o.device==='quest'?' (Quest)':'')+(o.bot?' · BOT':o.dummy?' · TEST':'')+(st?' · STEALTH':'');const BSY=window.EEAR_BOTSTYLE;others[o.id]={g:stick(nm,st?'#9a9a9a':BSY?BSY.col(o,colorOf(o.id)):colorOf(o.id),st,o.bot&&o.style),o,sg,born:performance.now()};scene.add(others[o.id].g)}others[o.id].o=o}
for(const k in others)if(!seen[k]){scene.remove(others[k].g);delete others[k]}}catch(e){}}
const tmp=new T.Vector3();
function frame(t){const me=getPos();const rc=$('radar').getContext('2d');rc.clearRect(0,0,240,240);rc.strokeStyle='#fff6';rc.beginPath();rc.arc(120,120,118,0,7);rc.stroke();rc.fillStyle='#fff';rc.fillRect(117,117,6,6);
for(const k in others){const{g,o,born}=others[k];const target=toLocal(o.last.lat,o.last.lon);g.userData.pos=g.userData.pos?g.userData.pos.lerp(target,.1):target.clone();
anim(g,o.entrance,(t-born)/1000,t);g.position.add(g.userData.pos);
tmp.copy(cam.position).sub(g.position);g.rotation.y=Math.atan2(tmp.x,tmp.z);// billboard around vertical
const d=Math.max(1,tmp.length()),s=Math.max(1,d/60);g.scale.setScalar(s);// min on-screen size
if(g.userData.label)g.userData.label.userData.meta.distM=Math.hypot(g.position.x,g.position.z);const pulse=.75+.25*Math.sin(t/1000*Math.PI*2*1.5);g.traverse(m=>{if(m.material&&m.userData.base)m.material.opacity=m.userData.base*pulse});
const rr=Math.min(110,Math.hypot(target.x,target.z)/10);const a=Math.atan2(target.x,-target.z);rc.fillStyle=g.userData.style==='plaid'&&window.EEAR_BOTSTYLE?rc.createPattern(window.EEAR_BOTSTYLE.plaidSmall(),'repeat'):g.userData.col;rc.beginPath();rc.arc(120+rr*Math.sin(a),120-rr*Math.cos(a),g.userData.style?6:5,0,7);rc.fill();if(g.userData.style==='plaid'){rc.strokeStyle='#9be89b';rc.lineWidth=1.5;rc.stroke()}}}
return{frame}}
export const colorOf=id=>'hsl('+(parseInt(id.slice(0,4),16)%360)+',100%,60%)';
// stick figure: head circle, spine waist->neck, two arms, hip bar; core + wide glow pass, additive x-ray
export function stick(name,col,stealth,style){const g=new T.Group(),c=new T.Color(col);g.userData.col=col;g.userData.style=style||null;
const pts={hipL:[-.18,0],hipR:[.18,0],waist:[0,0],neck:[0,.55],sh:[0,.5]};
function tube(a,b,r,op,dash){const v1=new T.Vector3(a[0],a[1],0),v2=new T.Vector3(b[0],b[1],0);const len=v1.distanceTo(v2);const m=new T.Mesh(new T.CylinderGeometry(r,r,len,6),new T.MeshBasicMaterial({color:c,transparent:true,opacity:op,blending:T.AdditiveBlending,depthTest:false,depthWrite:false}));
m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v2.clone().sub(v1).normalize());m.renderOrder=999;m.userData.base=op*(stealth?.4:1);return m}
const body=new T.Group();g.add(body);g.userData.body=body;
const seg=(a,b,parent=body)=>{const s=new T.Group();s.add(tube(a,b,.025,.35),tube(a,b,.07,.15));parent.add(s);return s};
seg(pts.waist,pts.neck);seg(pts.hipL,pts.hipR);
const mkArm=side=>{const p=new T.Group();p.position.set(0,.5,0);body.add(p);seg([0,0],[side*.12,-.42],p);return p};g.userData.armL=mkArm(-1);g.userData.armR=mkArm(1);
const ring=new T.Mesh(new T.TorusGeometry(.12,.025,6,20),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.35,blending:T.AdditiveBlending,depthTest:false,depthWrite:false}));ring.position.y=.7;ring.renderOrder=999;ring.userData.base=.35*(stealth?.4:1);body.add(ring);
const halo=new T.Mesh(new T.CircleGeometry(.2,20),ring.material.clone());halo.material.opacity=.15;halo.userData.base=.15*(stealth?.4:1);halo.position.y=.7;halo.renderOrder=998;body.add(halo);
if(stealth)body.traverse(m=>{if(m.isMesh&&m.geometry.type==='CylinderGeometry')m.scale.y=.5});
/* plaid BOT style: tartan texture on body + head ring + marker disc, normal-blended so the navy reads over camera too */
if(style==='plaid'&&!stealth&&window.EEAR_BOTSTYLE){const tx=window.EEAR_BOTSTYLE.tex(T,1,2);body.traverse(m=>{if(m.isMesh){m.material.map=tx;m.material.color.set('#ffffff');m.material.blending=T.NormalBlending;m.userData.base=Math.max(m.userData.base||0,m.material.opacity>.3?.95:.5);m.material.needsUpdate=true}});halo.scale.setScalar(1.3)}// dashed look: shortened segments
const cv=document.createElement('canvas');cv.width=256;cv.height=64;const x=cv.getContext('2d');x.font='bold 36px sans-serif';x.fillStyle=col;x.textAlign='center';x.fillText(name,128,44);
const sp=window.mkLabel?window.mkLabel(name,col,{title:'Player '+name,color:col}):new T.Sprite();sp.position.y=1.05;g.add(sp);g.userData.label=sp;return g}
// entrances; figure floats at waist height ~1.0 m
export function anim(g,e,s,t){const b=g.userData.body,L=g.userData.armL,R=g.userData.armR;g.position.set(0,1,0);b.rotation.set(0,0,0);let sw=Math.sin(t/300)*.15;
if(e==='walk'&&s<3){g.position.z=-(3-s)*1.2;sw=Math.sin(s*7)*.6}
else if(e==='run'&&s<1.6){g.position.z=-(1.6-s)*5;b.rotation.x=-.35;sw=Math.sin(s*14)*.9}
else if(e==='jump'&&s<1.6){if(s<1){g.position.y=1+3*(1-s*s)}else g.position.y=1+Math.abs(Math.sin((s-1)*Math.PI*1.7))*.25*(1.6-s)/.6;L.rotation.z=-2.6;R.rotation.z=2.6;return}
else if(e==='dance'&&s<4){b.rotation.z=Math.sin(s*6)*.25;L.rotation.z=-1.6-Math.sin(s*8)*.8;R.rotation.z=1.6+Math.sin(s*8+1)*.8;return}
L.rotation.z=0;R.rotation.z=0;L.rotation.x=sw;R.rotation.x=-sw}
