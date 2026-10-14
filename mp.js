// Opt-in multiplayer + glowing x-ray stick figures. Nothing leaves the device until the user consents and joins.
import*as T from'three';
export function initMP({scene,cam,getPos,toLocal}){
const API=(window.EEAR_API||'')+'/api';let S=JSON.parse(localStorage.eearSession||'null'),timer=null,others={};
const css=`#mpb{position:fixed;right:8px;bottom:40px;z-index:7}#mpc{position:fixed;inset:0;z-index:9;background:#000e;display:none;padding:24px;font-size:17px}#mpc input[type=text]{font-size:18px;width:90%;padding:8px}#trk{position:fixed;top:60px;right:8px;z-index:7;background:#c00;color:#fff;padding:4px 8px;border-radius:6px;font-weight:bold;display:none}#radar{position:fixed;left:8px;bottom:40px;z-index:7;width:120px;height:120px;border-radius:60px;background:#0008;display:none}`;
document.head.insertAdjacentHTML('beforeend','<style>'+css+'</style>');
document.body.insertAdjacentHTML('beforeend',`<div id=mpb><button id=joinB>Join live tracking</button><button id=leaveB style=display:none>Leave and stop tracking</button><button id=delB style=display:none>Delete my recorded data</button></div><div id=trk>● Tracking ON</div><canvas id=radar width=240 height=240></canvas>
<div id=mpc><h2>Join live tracking</h2><p><b>This is a GPS game. While you're in, your position is recorded continuously and shown to other players in the game. It is not shown to the public.</b></p><p style=font-size:14px>We store only your display name, mode, entrance, and position fixes (lat, lon, accuracy, time). The game organizer (GM) can see all joined players, including stealth players. Anyone with the link can join. You can leave any time and delete your recorded data.</p>
<p>Display name<br><input type=text id=mpn maxlength=24></p><p>Mode <select id=mpm><option value=regular>Regular (visible to players)</option><option value=stealth>Stealth (hidden from players, visible to GM)</option></select></p><p>Entrance <select id=mpe><option>walk</option><option>jump</option><option>dance</option><option>run</option></select></p>
<p><label><input type=checkbox id=mpa> I agree</label></p><button id=mpj disabled>Join</button> <button id=mpx>Cancel</button></div>`);
const $=id=>document.getElementById(id);
$('mpa').onchange=()=>$('mpj').disabled=!$('mpa').checked||!$('mpn').value.trim();$('mpn').oninput=$('mpa').onchange;
$('joinB').onclick=()=>{$('mpa').checked=false;$('mpj').disabled=true;$('mpc').style.display='block'};$('mpx').onclick=()=>$('mpc').style.display='none';
const call=(p,b)=>fetch(API+p,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+(S?.token||'')},body:JSON.stringify(b||{})}).then(r=>r.json());
$('mpj').onclick=async()=>{if(!$('mpa').checked)return;const r=await call('/join',{consent:true,name:$('mpn').value.trim(),mode:$('mpm').value,entrance:$('mpe').value,device:'phone'});
if(!r.token)return alert('Join failed: '+(r.error||'server unreachable'));S={...r,live:true};localStorage.eearSession=JSON.stringify(S);$('mpc').style.display='none';on()};
$('leaveB').onclick=async()=>{await call('/leave');S.live=false;localStorage.eearSession=JSON.stringify(S);off()};
$('delB').onclick=async()=>{if(!confirm('Delete all your recorded positions?'))return;await call('/delete');S=null;localStorage.removeItem('eearSession');off()};
function ui(){const live=S&&S.live;$('joinB').style.display=live?'none':'';$('leaveB').style.display=live?'':'none';$('delB').style.display=S?'':'none';$('trk').style.display=live?'block':'none';$('radar').style.display=live?'block':'none'}
function on(){ui();clearInterval(timer);timer=setInterval(tick,3000);tick()}
function off(){clearInterval(timer);timer=null;for(const k in others){scene.remove(others[k].g)}others={};ui()}
async function tick(){if(!S?.live)return;const p=getPos();if(p)call('/pos',{lat:p.lat,lon:p.lon,acc:p.acc}).catch(()=>{});
try{const r=await fetch(API+'/players',{headers:{authorization:'Bearer '+S.token}}).then(r=>r.json());if(r.error==='not joined'){S.live=false;off();return}
const seen={};for(const o of r.players||[]){if(!o.last)continue;seen[o.id]=1;if(!others[o.id]){others[o.id]={g:stick(o.name+(o.device==='quest'?' (Quest)':''),colorOf(o.id),false),o,born:performance.now()};scene.add(others[o.id].g)}others[o.id].o=o}
for(const k in others)if(!seen[k]){scene.remove(others[k].g);delete others[k]}}catch(e){}}
if(S?.live)on();else ui();
const tmp=new T.Vector3();
function frame(t){const me=getPos();const rc=$('radar').getContext('2d');rc.clearRect(0,0,240,240);rc.strokeStyle='#fff6';rc.beginPath();rc.arc(120,120,118,0,7);rc.stroke();rc.fillStyle='#fff';rc.fillRect(117,117,6,6);
for(const k in others){const{g,o,born}=others[k];const target=toLocal(o.last.lat,o.last.lon);g.userData.pos=g.userData.pos?g.userData.pos.lerp(target,.1):target.clone();
anim(g,o.entrance,(t-born)/1000,t);g.position.add(g.userData.pos);
tmp.copy(cam.position).sub(g.position);g.rotation.y=Math.atan2(tmp.x,tmp.z);// billboard around vertical
const d=Math.max(1,tmp.length()),s=Math.max(1,d/60);g.scale.setScalar(s);// min on-screen size
if(g.userData.label)g.userData.label.userData.meta.distM=Math.hypot(g.position.x,g.position.z);const pulse=.75+.25*Math.sin(t/1000*Math.PI*2*1.5);g.traverse(m=>{if(m.material&&m.userData.base)m.material.opacity=m.userData.base*pulse});
const rr=Math.min(110,Math.hypot(target.x,target.z)/10);const a=Math.atan2(target.x,-target.z);rc.fillStyle=g.userData.col;rc.beginPath();rc.arc(120+rr*Math.sin(a),120-rr*Math.cos(a),5,0,7);rc.fill()}}
return{frame}}
export const colorOf=id=>'hsl('+(parseInt(id.slice(0,4),16)%360)+',100%,60%)';
// stick figure: head circle, spine waist->neck, two arms, hip bar; core + wide glow pass, additive x-ray
export function stick(name,col,stealth){const g=new T.Group(),c=new T.Color(col);g.userData.col=col;
const pts={hipL:[-.18,0],hipR:[.18,0],waist:[0,0],neck:[0,.55],sh:[0,.5]};
function tube(a,b,r,op,dash){const v1=new T.Vector3(a[0],a[1],0),v2=new T.Vector3(b[0],b[1],0);const len=v1.distanceTo(v2);const m=new T.Mesh(new T.CylinderGeometry(r,r,len,6),new T.MeshBasicMaterial({color:c,transparent:true,opacity:op,blending:T.AdditiveBlending,depthTest:false,depthWrite:false}));
m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v2.clone().sub(v1).normalize());m.renderOrder=999;m.userData.base=op*(stealth?.4:1);return m}
const body=new T.Group();g.add(body);g.userData.body=body;
const seg=(a,b,parent=body)=>{const s=new T.Group();s.add(tube(a,b,.025,.35),tube(a,b,.07,.15));parent.add(s);return s};
seg(pts.waist,pts.neck);seg(pts.hipL,pts.hipR);
const mkArm=side=>{const p=new T.Group();p.position.set(0,.5,0);body.add(p);seg([0,0],[side*.12,-.42],p);return p};g.userData.armL=mkArm(-1);g.userData.armR=mkArm(1);
const ring=new T.Mesh(new T.TorusGeometry(.12,.025,6,20),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.35,blending:T.AdditiveBlending,depthTest:false,depthWrite:false}));ring.position.y=.7;ring.renderOrder=999;ring.userData.base=.35*(stealth?.4:1);body.add(ring);
const halo=new T.Mesh(new T.CircleGeometry(.2,20),ring.material.clone());halo.material.opacity=.15;halo.userData.base=.15*(stealth?.4:1);halo.position.y=.7;halo.renderOrder=998;body.add(halo);
if(stealth)body.traverse(m=>{if(m.isMesh&&m.geometry.type==='CylinderGeometry')m.scale.y=.5});// dashed look: shortened segments
const cv=document.createElement('canvas');cv.width=256;cv.height=64;const x=cv.getContext('2d');x.font='bold 36px sans-serif';x.fillStyle=col;x.textAlign='center';x.fillText(name+(stealth?' (stealth)':''),128,44);
const sp=window.mkLabel?window.mkLabel(name+(stealth?' (stealth)':''),col,{title:'Player '+name,color:col}):new T.Sprite();sp.position.y=1.05;g.add(sp);g.userData.label=sp;return g}
// entrances; figure floats at waist height ~1.0 m
export function anim(g,e,s,t){const b=g.userData.body,L=g.userData.armL,R=g.userData.armR;g.position.set(0,1,0);b.rotation.set(0,0,0);let sw=Math.sin(t/300)*.15;
if(e==='walk'&&s<3){g.position.z=-(3-s)*1.2;sw=Math.sin(s*7)*.6}
else if(e==='run'&&s<1.6){g.position.z=-(1.6-s)*5;b.rotation.x=-.35;sw=Math.sin(s*14)*.9}
else if(e==='jump'&&s<1.6){if(s<1){g.position.y=1+3*(1-s*s)}else g.position.y=1+Math.abs(Math.sin((s-1)*Math.PI*1.7))*.25*(1.6-s)/.6;L.rotation.z=-2.6;R.rotation.z=2.6;return}
else if(e==='dance'&&s<4){b.rotation.z=Math.sin(s*6)*.25;L.rotation.z=-1.6-Math.sin(s*8)*.8;R.rotation.z=1.6+Math.sin(s*8+1)*.8;return}
L.rotation.z=0;R.rotation.z=0;L.rotation.x=sw;R.rotation.x=-sw}
