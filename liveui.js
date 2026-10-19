import{CONSENT_REQUIRED}from'./config.js?v=1792443133403';
// Live-tracking UI shared by the main build and quest.html: top-level consent modal, one-tap rejoin with remembered
// consent, and a persistent "Live" pill (pause / stealth / leave / delete). Nothing is sent until the user agrees once.
export function liveUI({key='eearSession',device='phone',api='/api',start,stop}){
 let S=JSON.parse(localStorage[key]||'null');const C=()=>JSON.parse(localStorage.eearConsent||'null');
 const css=`#mpc{position:fixed;inset:0;z-index:2147483000;display:none;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#000;color:#fff;font:17px/1.4 sans-serif;
  padding:calc(env(safe-area-inset-top) + 16px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 24px) calc(env(safe-area-inset-left) + 16px)}
 #mpc .box{max-width:560px;margin:0 auto}#mpc input[type=text],#mpc select{font-size:18px;width:100%;box-sizing:border-box;padding:10px;border-radius:8px}
 #mpc .row{display:flex;gap:10px;margin-top:14px}#mpc .row button{flex:1;font-size:20px;padding:16px;border-radius:12px;border:0;font-weight:bold}
 #mpj{background:#ffc800}#mpj:disabled{opacity:.4}#mpc label.ag{display:flex;align-items:center;gap:10px;font-size:19px;padding:10px 0}#mpc label.ag input{width:28px;height:28px}
 body.mpOpen>*:not(#mpc):not(script):not(style){visibility:hidden!important}
 #trk{position:fixed;z-index:2147482000;top:calc(env(safe-area-inset-top) + 56px);left:50%;transform:translateX(-50%);display:none;border:0;border-radius:20px;padding:8px 14px;font:bold 16px sans-serif;color:#fff;background:#d00;box-shadow:0 0 12px #f008}
 #trk.paused{background:#666;box-shadow:none}#trk.stealth{background:#4a2a8a}
 #trkM{position:fixed;z-index:2147482001;top:calc(env(safe-area-inset-top) + 100px);left:50%;transform:translateX(-50%);display:none;background:#111e;border-radius:14px;padding:8px;min-width:240px}
 #trkM button{display:block;width:100%;font-size:18px;padding:12px;margin:4px 0;border-radius:10px;border:0}`;
 document.head.insertAdjacentHTML('beforeend','<style>'+css+'</style>');
 const host=document.getElementById('mpb')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'mpb'}));
 host.insertAdjacentHTML('beforeend',`<button id=joinB>Join live tracking</button><button id=joinX style=display:none title="change name / mode">⚙</button>`);
 document.body.insertAdjacentHTML('beforeend',`<button id=trk>● Live: on</button><div id=trkM><div id=tmI style="font-size:13px;color:#ccc;padding:4px 6px">Live: your location is shared with players in this game</div><button id=tmP>Pause</button><button id=tmN>Change name</button><button id=tmS>Go stealth</button><button id=tmL>Leave and stop tracking</button><button id=tmD>Delete my recorded data</button><button id=tmC>Close</button></div>
 <div id=mpc role=dialog aria-modal=true><div class=box><h2 style="margin-top:0">Join live tracking</h2><p><b>This is a GPS game. While you're in, your position is recorded continuously and shown to other players in the game. It is not shown to the public.</b></p><p style=font-size:14px>We store only your display name, mode, entrance, and position fixes (lat, lon, accuracy, heading, time). The game organizer (GM) can see all joined players, including stealth players. Anyone with the link can join. You can pause, leave, or delete your recorded data any time from the red Live pill. Your choice is remembered on this device so next time it's one tap.</p>
 <p>Display name<br><input type=text id=mpn maxlength=24 autocomplete=nickname></p><p>Mode<br><select id=mpm><option value=regular>Regular (visible to players)</option><option value=stealth>Stealth (hidden from players, visible to GM)</option></select></p><p>Entrance<br><select id=mpe><option>walk</option><option>jump</option><option>dance</option><option>run</option></select></p>
 <label class=ag><input type=checkbox id=mpa> I agree</label><div class=row><button id=mpj disabled>Join</button><button id=mpx>Cancel</button></div></div></div>`);
 const $=id=>document.getElementById(id),mpc=$('mpc');document.body.appendChild(mpc);// last child of body = on top
 const save=()=>{if(S)localStorage[key]=JSON.stringify(S);else localStorage.removeItem(key)};
 const call=(p,b)=>fetch(api+p,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+(S?.token||'')},body:JSON.stringify(b||{})}).then(r=>r.json());
 const open=()=>{const c=C();$('mpn').value=c?.name||$('mpn').value;if(c){$('mpm').value=c.mode;$('mpe').value=c.entrance}$('mpa').checked=false;$('mpj').disabled=true;document.body.classList.add('mpOpen');mpc.style.display='block';mpc.scrollTop=0;window.dispatchEvent(new Event('mpmodal'))};
 const close=()=>{mpc.style.display='none';document.body.classList.remove('mpOpen')};
 $('mpa').onchange=$('mpn').oninput=()=>$('mpj').disabled=!$('mpa').checked||!$('mpn').value.trim();$('mpx').onclick=close;
 async function join(c){const r=await call('/join',{consent:true,name:c.name,mode:c.mode,entrance:c.entrance,device}).catch(()=>({}));
  if(!r.token){alert('Join failed: '+(r.error||'server unreachable'));return false}S={...r,live:true,paused:false,mode:r.mode||c.mode};save();ui();start&&start();if(r.stealthDenied)warn(r.warning);if(r.policy)polUI(r.policy);return true}
 const warn=t=>{t=t||"Stealth isn't available on this device. Use the iPhone app to go stealth.";(window.eearToast?eearToast('⚠ '+t,6000):alert(t))};
 const CLS=device==='iphone'?'iphone':device==='quest'?'quest':'desktop';
 function polUI(P){window.EEAR_POLICY=P;const ok=!!(P.canGoStealth||{})[CLS],o=$('mpm').querySelector('option[value=stealth]');o.textContent=ok?'Stealth (hidden from players, visible to GM)':'Stealth (not available on this device; iPhone only)';o.disabled=!ok;if(!ok&&$('mpm').value==='stealth')$('mpm').value='regular';$('tmS').dataset.na=ok?'':'1';ui()}
 fetch(api+'/policy').then(r=>r.json()).then(j=>j.policy&&polUI(j.policy)).catch(()=>{});
 $('mpj').onclick=async()=>{if(!$('mpa').checked)return;const c={name:$('mpn').value.trim(),mode:$('mpm').value,entrance:$('mpe').value,t:Date.now()};localStorage.eearConsent=JSON.stringify(c);if(await join(c))close()};
 const autoC=()=>{let c=C();if(!c){c={name:'Player-'+Math.random().toString(36).slice(2,6),mode:'regular',entrance:'walk',t:Date.now(),auto:1};localStorage.eearConsent=JSON.stringify(c)}return c};
 $('joinB').onclick=()=>{const c=C();if(c)join(c);else if(!CONSENT_REQUIRED)join(autoC());else open()};
 $('tmN').onclick=async()=>{const c=C()||autoC();const n=(prompt('Display name',c.name)||'').trim().slice(0,24);if(!n||n===c.name)return menu(0);c.name=n;localStorage.eearConsent=JSON.stringify(c);await call('/leave').catch(()=>{});S=null;save();menu(0);await join(c)};$('joinX').onclick=open;
 const menu=v=>$('trkM').style.display=v?'block':'none';$('trk').onclick=()=>menu($('trkM').style.display!=='block');$('tmC').onclick=()=>menu(0);
 $('tmP').onclick=()=>{S.paused=!S.paused;save();ui();menu(0);S.paused?stop&&stop(true):start&&start()};
 $('tmS').onclick=async()=>{const m=S.mode==='stealth'?'regular':'stealth';const r=await call('/mode',{mode:m,device}).catch(()=>({}));if(r.stealthDenied){S.mode='regular';save();warn(r.warning);ui();menu(0);return}if(r.ok){S.mode=m;save();const c=C();if(c){c.mode=m;localStorage.eearConsent=JSON.stringify(c)}}else alert('Could not change mode');ui();menu(0)};
 $('tmL').onclick=async()=>{await call('/leave').catch(()=>{});S.live=false;save();menu(0);stop&&stop();ui()};
 $('tmD').onclick=async()=>{if(!confirm('Delete all your recorded positions? This also forgets your consent on this device.'))return;await call('/delete').catch(()=>{});S=null;save();localStorage.removeItem('eearConsent');menu(0);stop&&stop();ui()};
 function ui(){const live=S&&S.live,c=C();$('joinB').style.display=live?'none':'';$('joinB').textContent=c?'Join live as '+c.name:'Join live tracking';$('joinX').style.display=!live&&c&&CONSENT_REQUIRED?'':'none';$('tmI').style.display=CONSENT_REQUIRED?'none':'';
  const t=$('trk');t.style.display=live?'block':'none';t.className=live&&S.paused?'paused':(live&&S.mode==='stealth'?'stealth':'');t.textContent=live?(S.paused?'❚❚ Live: paused':'● Live: on'+(S.mode==='stealth'?' (stealth)':''))+' ▾':'';
  $('tmP').textContent=S?.paused?'Resume':'Pause';$('tmS').textContent=S?.mode==='stealth'?'Go visible (regular)':($('tmS').dataset.na?'Go stealth (iPhone only)':'Go stealth')}
 // server dropped the session (restart/cleanup): silently rejoin if the user consented and never left
 let rj=0;async function lost(){S&&(S.live=false);const c=C();if(c&&Date.now()-rj>30000){rj=Date.now();if(await join(c))return true}stop&&stop();ui();return false}
 ui();if(S?.live&&!S.paused)setTimeout(()=>start&&start(),0);
 return{get S(){return S},call,lost,ui,open,polUI,get active(){return!!(S&&S.live&&!S.paused)}}}
