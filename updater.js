/* Fast forced refresh for every open player (index / quest / gm).
   1) service worker sw.js: skipWaiting + clients.claim, network-first (no-store) for HTML + version.json, ?v=<build> assets cached.
   2) poll version.json (no-store, ?t=) every 20 s + on focus/visibility; reg.update() every 30 s; mismatch or controllerchange -> reload.
   3) painless reload: pages register save/restore hooks (EEAR_STATE), 3 s "Updating to vX..." toast, once-per-version loop guard,
      single "Tap to resume" button when camera/compass/audio need a fresh tap (iOS), immersive XR session -> defer until it ends (Quest: press A to exit + update). */
(function(){
const CUR=(document.querySelector('meta[name=eear-v]')||{}).content||'dev';window.EEAR_V=CUR;
const ST=window.EEAR_STATE=window.EEAR_STATE||{save:[],restore:[],resumeTap:[]};
let pending=null,busy=false;
function toast(t,ms){let e=document.getElementById('eearUpd');if(!e){e=document.createElement('div');e.id='eearUpd';e.style.cssText='position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translateX(-50%);z-index:100000;background:#111e;color:#fff;font:bold 15px sans-serif;padding:10px 16px;border-radius:12px;border:1px solid #ffc800;max-width:90vw;text-align:center';document.body.appendChild(e)}e.textContent=t;e.style.display='block';clearTimeout(toast.h);if(ms)toast.h=setTimeout(()=>e.style.display='none',ms)}
window.EEAR_UPD_TOAST=toast;
function xrActive(){try{const sc=document.querySelector('a-scene');if(sc&&sc.is&&sc.is('vr-mode'))return true;const r=window.EEAR&&EEAR.ren;return!!(r&&r.xr&&r.xr.isPresenting)}catch(e){return false}}
function saveState(){const s={v:CUR,t:Date.now(),path:location.pathname,scrollY:scrollY,hooks:{}};for(const[k,f]of ST.save)try{s.hooks[k]=f()}catch(e){}sessionStorage.eearResume=JSON.stringify(s)}
function questPrompt(v){const sc=document.querySelector('a-scene');if(!sc||document.getElementById('eearUpdXR'))return;const cam=sc.camera&&sc.camera.el;if(!cam)return;
 const t=document.createElement('a-text');t.id='eearUpdXR';t.setAttribute('value','Update ready ('+v+'). Press A to update now, or it updates when you exit.');t.setAttribute('align','center');t.setAttribute('color','#ffc800');t.setAttribute('width',1.2);t.setAttribute('position','0 0.18 -0.9');cam.appendChild(t);
 const go=()=>{try{sc.exitVR()}catch(e){}};document.addEventListener('abuttondown',go);sc.addEventListener('abuttondown',go);for(const c of document.querySelectorAll('[oculus-touch-controls],[meta-touch-controls],[hand-controls],[laser-controls]'))c.addEventListener('abuttondown',go)}
function reloadTo(v){if(busy)return;if(sessionStorage.eearReloadFor===v){console.warn('update guard: already reloaded once for',v);return}
 if(xrActive()){if(pending!==v){pending=v;questPrompt(v);toast('Update ready ('+v+'): it applies when you exit VR')}return}
 busy=true;sessionStorage.eearReloadFor=v;saveState();toast('Updating to v'+v+'…');setTimeout(()=>location.reload(),3000)}
async function poll(){if(busy||document.hidden&&!pending)return;try{const r=await fetch(new URL('version.json?t='+Date.now(),location.href),{cache:'no-store'});if(!r.ok)return;const j=await r.json();
 if(j.v&&j.v!==CUR&&CUR!=='dev')reloadTo(j.v);else if(j.v===CUR)delete sessionStorage.eearReloadFor}catch(e){}}
setInterval(poll,20000);setInterval(()=>{if(pending&&!xrActive())reloadTo(pending)},1000);
addEventListener('focus',poll);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
// service worker
if('serviceWorker'in navigator&&isSecureContext){const had=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.register(new URL('sw.js',location.href).pathname,{scope:new URL('./',location.href).pathname,updateViaCache:'none'}).then(reg=>{
  const up=()=>reg.update().catch(()=>{});setInterval(up,30000);addEventListener('focus',up);document.addEventListener('visibilitychange',()=>{if(!document.hidden)up()})}).catch(e=>console.warn('sw',e));
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had)poll()/* new SW took over: check the version and reload once */})}
// restore after an update reload
addEventListener('load',()=>{let s=null;try{s=JSON.parse(sessionStorage.eearResume||'null')}catch(e){}if(!s)return;delete sessionStorage.eearResume;if(Date.now()-s.t>120000)return;
 setTimeout(()=>{for(const[k,f]of ST.restore)try{f(s.hooks[k])}catch(e){console.warn('restore',k,e)}toast('Updated to v'+CUR,2500);
  if(ST.resumeTap.length){const b=document.createElement('button');b.id='eearResume';b.textContent='Tap to resume';b.style.cssText='position:fixed;left:50%;top:45%;transform:translate(-50%,-50%);z-index:100001;font:bold 26px sans-serif;padding:22px 34px;border-radius:16px;border:0;background:#ffc800;color:#000;box-shadow:0 0 0 4px #000a';
   b.onclick=()=>{b.remove();for(const[k,f]of ST.resumeTap)try{f(s.hooks[k])}catch(e){console.warn('resume',k,e)}};document.body.appendChild(b)}},400)});
window.EEAR_UPDATE_CHECK=poll;
})();
