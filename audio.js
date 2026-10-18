// Directional music at Matt's Meditation Garden (48.1316475,-122.7992293): Web Audio PannerNode (HRTF) for direction only (rolloff 0, source placed
// 10 m away along the true great-circle bearing, so it works anywhere on Earth); loudness = DGAIN(distance): 1.0 within 50 m, sqrt(50/d) beyond,
// floor 0.15 so it is audible anywhere in the world (200 m 0.50, 500 m 0.32, 1 km 0.22, 1.7 km 0.17, >=2.2 km 0.15). Listener = app ENU position + true heading + pitch, updated every frame.
// Song: built-in ORIGINAL procedural loop "Happy's Trails Vortex" (12-step arpeggio motif = 12 wedges, kick, bass, hats; generated live, no samples),
// or the user's own file (saved in IndexedDB) / URL. Audio starts only from a tap (iOS unlock). navigator.audioSession='playback' where supported.
import * as ORBIT from './orbit.js?v=1792352854476';
import './djvoice.js?v=1792352854476';/* d47: Master DJ live voice + broadcasts (listener side runs for everyone) */
import * as DJM from './dj.js?v=1792352854476';
/* d45: track 'dj' = the Master DJ queue (dj.js, server /api/dj): the current DJ track, synced to server time, auto-advancing; paused/empty = silence. Default track; one-time migration moves saved built-in/Disco Jam choices to it. */
export const SRC={lat:48.1316475,lon:-122.7992293,name:"Matt's Meditation Garden"};
export const SONG="Happy's Trails Vortex";
/* tracks: built-in procedural loop, shipped loop files (AudioBufferSourceNode loop=true = sample-exact, no seam), the user's own saved file */
/* disco: original instrumental, 120 BPM, 32 bars = exactly 64.000 s (3,072,000 samples @48k), mastered -14 LUFS; loopEnd 64.0 skips MP3/AAC padding; trim matches the built-in loop */
const MATT={id:'mattready',name:'Matt Ready'};
export const TRACKS=[{id:'dj',title:'Master DJ (live queue)',name:'🎧 Master DJ (live queue)',singers:[],dj:true},{id:'happys-trails-vortex',title:SONG,name:SONG,singers:[MATT],builtin:true,tempo:124},{id:'disco-jam',title:'Disco Jam (instrumental)',name:'Disco Jam (instrumental)',singers:[],urls:['audio/disco-jam-loop.m4a','audio/disco-jam-loop.mp3'],loopEnd:64.0,tempo:120,trim:.7}];
const slug=n=>String(n).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'singer';
export const parseSingers=t=>String(t||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean).slice(0,8).map(n=>({id:/^matt\s*ready$/i.test(n)?'mattready':slug(n),name:n.slice(0,60)}));
/* event for performers.js: window 'eear:track' {trackId,title,singers,playing,tempo} on play / stop / switch */
function trackEvent(d){window.EEAR_TRACK=d;try{dispatchEvent(new CustomEvent('eear:track',{detail:d}))}catch(e){}}
const renTempo=bpm=>{try{const R=window.EEAR_REN||window.REN;R&&R.setTempo&&R.setTempo(bpm)}catch(e){}window.EEAR_TEMPO=bpm;dispatchEvent(new CustomEvent('eear-tempo',{detail:{bpm}}))};
const D=Math.PI/180,CMP=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const $=id=>document.getElementById(id);
const dist=(a,b,c,d)=>{const R=6371000,x=Math.sin((c-a)*D/2)**2+Math.cos(a*D)*Math.cos(c*D)*Math.sin((d-b)*D/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const brg=(a,b,c,d)=>{const y=Math.sin((d-b)*D)*Math.cos(c*D),x=Math.cos(a*D)*Math.sin(c*D)-Math.sin(a*D)*Math.cos(c*D)*Math.cos((d-b)*D);return(Math.atan2(y,x)/D+360)%360};
export const DGAIN=d=>Math.max(.15,Math.min(1,Math.sqrt(50/Math.max(d,50))));
const fmt=m=>m<1000?Math.round(m)+' m':(m/1000).toFixed(m<1e4?1:0)+' km';
// ---- IndexedDB (one record: the chosen song file)
const idb=()=>new Promise((ok,err)=>{const r=indexedDB.open('eearAudio',1);r.onupgradeneeded=()=>r.result.createObjectStore('s');r.onsuccess=()=>ok(r.result);r.onerror=()=>err(r.error)});
const idbPut=async(k,v)=>{const db=await idb();return new Promise((ok,err)=>{const t=db.transaction('s','readwrite');t.objectStore('s').put(v,k);t.oncomplete=ok;t.onerror=()=>err(t.error)})};
const idbGet=async k=>{const db=await idb();return new Promise((ok,err)=>{const q=db.transaction('s').objectStore('s').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>err(q.error)})};
const idbDel=async k=>{const db=await idb();return new Promise(ok=>{const t=db.transaction('s','readwrite');t.objectStore('s').delete(k);t.oncomplete=ok})};

export function initAudio({getListener,toast=(t)=>console.log(t)}){
 const st=document.createElement('style');st.textContent=`#musW{position:fixed;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 308px);z-index:22;display:flex;align-items:center;gap:5px;flex-direction:row-reverse}
#musB{font-size:15px;padding:12px;border-radius:10px}#musR{font:11px sans-serif;color:#fff;background:#000a;border-radius:8px;padding:3px 6px;max-width:150px;text-align:right;line-height:1.25}
#musS{font-size:15px;padding:12px 10px;border-radius:10px}#musP{position:fixed;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 360px);z-index:40;width:min(330px,calc(100vw - 16px));background:#0b0b0ff2;color:#fff;font:13px sans-serif;border:1px solid #fff3;border-radius:12px;padding:10px;display:none}
#musP input[type=range]{width:100%}#musP button{font-size:13px;padding:6px 9px;margin:3px 2px;border-radius:8px;border:0}#musP input[type=url]{width:100%;box-sizing:border-box;font-size:13px;padding:5px;margin:3px 0}#musP small{color:#bbb}`;
 document.head.appendChild(st);
 document.body.insertAdjacentHTML('beforeend',`<div id=musW><button id=musB>🎵 Music: off</button><button id=musS aria-label="music settings">⋯</button><div id=musR>${SONG}</div></div>
<div id=musP><b>🎵 ${SONG}</b><br><small>Plays from ${SRC.name} (${SRC.lat}, ${SRC.lon}), directional: turn toward it and it gets centred. Louder as you get closer (full within 50 m), never below 15% so you hear it anywhere.</small>
<label style="display:block;margin-top:6px">Volume <span id=musVv></span><input id=musV type=range min=0 max=100 step=1></label>
<label style="display:block;margin:5px 0">Track <select id=musT style="font-size:14px;max-width:100%"></select></label><div style="margin:5px 0"><button id=musFly type=button style="background:#b026ff;color:#fff;font-weight:bold">🌀 Flying sound: on</button> <small>Master DJ orbits around you as a glowing orb (lingers loud, swoops far). Off = plain playback.</small></div><div style="margin:5px 0"><button id=musPick type=button style="background:#ffc800;color:#000;font-weight:bold">🎧 Pick song for everyone</button> <button id=musLive type=button style="background:#ff2050;color:#fff;font-weight:bold">🎙 Talk live</button> <small>GM key; plays to all listeners</small></div><div id=musN style="margin:4px 0;font-size:12px">Playing: <b id=musNm>${SONG} (built-in)</b></div>
<label style="display:block">Who sings? <input id=musWho placeholder="Matt Ready" style="width:60%;font-size:13px"> <small>(comma-separated, for your own file)</small></label><label><button id=musF type=button>Choose song file…</button><input id=musFi type=file accept="audio/*" style="display:none"></label><button id=musBi>Use built-in</button>
<input id=musU type=url placeholder="or paste an audio URL (must allow CORS)"><button id=musUg>Load URL</button>
<div><small>iPhone: the ringer/silent switch may mute web audio. If you hear nothing, flip the switch to ring and turn the volume up. Audio starts only after a tap.</small></div>
<div id=musE style="color:#ff9a9a;font-size:12px"></div><button id=musX style="background:#ffc800;font-weight:bold">Close</button></div>`);
 let dg=null,curD=null,ctx=null,pan=null,bus=null,vol=null,on=false,user=null,userSrc=null,seqT=null,step=0,nextT=0,lastR=0;
 const V=()=>(+(localStorage.eearMusV??80))/100;$('musV').value=Math.round(V()*100);$('musVv').textContent=$('musV').value+'%';
 function graph(){if(ctx)return;const AC=window.AudioContext||window.webkitAudioContext;ctx=new AC();
  try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}
  pan=ctx.createPanner();Object.assign(pan,{panningModel:'HRTF',distanceModel:'inverse',refDistance:10,rolloffFactor:0,maxDistance:1e6,coneInnerAngle:360,coneOuterAngle:360});dg=ctx.createGain();dg.gain.value=.15;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;vol=ctx.createGain();vol.gain.value=V();
  bus=ctx.createGain();bus.gain.value=1.4;bus.connect(comp);djG=ctx.createGain();djG.gain.value=0;{const n=DJM.attach(ctx);n&&n.connect(djG)}/* d46 flying sound: djG -> djB -> bus (plain, the Garden beacon chain) | djG -> djO -> oBus -> oComp -> oPan (HRTF, moved by orbit.js) -> oG -> vol; crossfaded, never both */djB=ctx.createGain();djO=ctx.createGain();djB.gain.value=fly?0:1;djO.gain.value=fly?1:0;djG.connect(djB);djB.connect(bus);djG.connect(djO);const oBus=ctx.createGain();oBus.gain.value=1.4;const oComp=ctx.createDynamicsCompressor();oComp.threshold.value=-14;oComp.ratio.value=4;oPan=ctx.createPanner();Object.assign(oPan,{panningModel:'HRTF',distanceModel:'inverse',refDistance:1,rolloffFactor:0,maxDistance:1e6,coneInnerAngle:360,coneOuterAngle:360});oG=ctx.createGain();oG.gain.value=0;djO.connect(oBus);oBus.connect(oComp);oComp.connect(oPan);oPan.connect(oG);oG.connect(vol);vIn=ctx.createGain();vPl=ctx.createGain();vOr=ctx.createGain();vPl.gain.value=fly?0:1;vOr.gain.value=fly?1:0;vIn.connect(vPl);vPl.connect(vol);vIn.connect(vOr);vOr.connect(oPan);/* d47 DJ voice: plain or from the orb */tap=ctx.createGain();pan.connect(tap);oPan.connect(tap);comp.connect(pan);pan.connect(dg);dg.connect(vol);vol.connect(ctx.destination);
  const b=ctx.createBuffer(1,1,22050),s=ctx.createBufferSource();s.buffer=b;s.connect(ctx.destination);s.start(0)/* iOS unlock */}
 // ---- built-in original loop: 124 bpm, 16ths; 12-step motif over a 4-chord cycle (I-V-vi-IV in D major), kick on beats, offbeat bass, hats
 const BPM=124,S16=60/BPM/4,ROOT=62,CH=[[0,4,7],[7,11,14],[9,12,16],[5,9,12]],MOT=[0,1,2,1,2,3,2,3,4,3,4,5];
 const mtof=m=>440*2**((m-69)/12);
 function note(t,f,len,type,g,cut){const o=ctx.createOscillator(),a=ctx.createGain(),fl=ctx.createBiquadFilter();o.type=type;o.frequency.setValueAtTime(f,t);fl.type='lowpass';fl.frequency.setValueAtTime(cut,t);fl.Q.value=6;
  a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(g,t+.005);a.gain.exponentialRampToValueAtTime(.0008,t+len);o.connect(fl);fl.connect(a);a.connect(bus);o.start(t);o.stop(t+len+.02)}
 function kick(t){const o=ctx.createOscillator(),a=ctx.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);a.gain.setValueAtTime(1,t);a.gain.exponentialRampToValueAtTime(.001,t+.35);o.connect(a);a.connect(bus);o.start(t);o.stop(t+.4)}
 let nb=null;function hat(t,g){if(!nb){nb=ctx.createBuffer(1,ctx.sampleRate*.1,ctx.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
  const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),a=ctx.createGain();s.buffer=nb;f.type='highpass';f.frequency.value=7000;a.gain.setValueAtTime(g,t);a.gain.exponentialRampToValueAtTime(.001,t+.05);s.connect(f);f.connect(a);a.connect(bus);s.start(t);s.stop(t+.06)}
 function play16(t,i){const bar=Math.floor(i/16)%4,c=CH[bar],k=i%16;
  const m=MOT[i%12],deg=c[m%3]+12*Math.floor(m/3);/* 12-step motif rolls against the 16-step bar: the wedge pattern shifts every bar */
  const sweep=900+1800*(.5+.5*Math.sin(i/64*Math.PI*2));note(t,mtof(ROOT+deg),S16*1.6,'sawtooth',.16,sweep);note(t,mtof(ROOT+deg+12),S16*.9,'square',.05,sweep*1.5);
  if(k%4===0)kick(t);if(k%4===2){note(t,mtof(ROOT-24+c[0]),S16*1.8,'sawtooth',.32,420)}hat(t,k%2?.10:.05);
  if(k===0&&bar===0)note(t,mtof(ROOT+24+c[2]),S16*12,'triangle',.07,3000)/* bell every 4 bars */}
 function seq(){const now=ctx.currentTime;if(nextT<now)nextT=now+.05;while(nextT<now+.25){play16(nextT,step++);nextT+=S16}}
 function startBuiltIn(){stopUser();if(!seqT){nextT=ctx.currentTime+.06;stAt=nextT-step*S16;seqT=setInterval(seq,50);seq()}}
 function stopBuiltIn(){clearInterval(seqT);seqT=null}
 function stopUser(){if(userSrc){try{userSrc.stop()}catch(e){}userSrc.disconnect();userSrc=null}}
 let stAt=null;const bufs={};let track=({vortex:'happys-trails-vortex',disco:'disco-jam'})[localStorage.eearMusT]||localStorage.eearMusT||'dj';if(!localStorage.eearDJm){localStorage.eearDJm='1';if(track!=='user'){track='dj';localStorage.eearMusT='dj'}}
 const DJ_TRIM=.7;let djG=null,djB=null,djO=null,oPan=null,oG=null,tap=null,vIn=null,vPl=null,vOr=null,fly=localStorage.eearFly!=='0';const ORB_LVL=.6;
 async function fileBuf(T){if(bufs[T.id])return bufs[T.id];let last;for(const u of T.urls){try{const r=await fetch(window.EEAR_V?u+'?v='+EEAR_V:u);if(!r.ok)throw new Error('HTTP '+r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());/* trim decoder priming/padding: loop the exact decoded buffer */return bufs[T.id]=b}catch(e){last=e}}throw last}
 function trackUI(){const sel=$('musT');const L=TRACKS.map(t=>[t.id,t.name+(t.builtin?' (built-in)':'')]).concat(user?[['user',(user.name||'My song')+' (my file)']]:[]);sel.innerHTML=L.map(([i,n])=>`<option value="${i}">${n.replace(/</g,'&lt;')}</option>`).join('');if(!L.some(x=>x[0]===track))track='dj';sel.value=track}
 function curMeta(){const T=TRACKS.find(t=>t.id===track);if(track==='dj'){const it=DJM.DJ.current,pl=DJM.DJ.at().playing;return{trackId:'dj-'+(it?it.id:'none'),title:it?it.title+' — '+it.artist:'Master DJ',singers:[],tempo:pl&&it?it.bpm||null:null}}if(track==='user'&&user)return{trackId:'user-'+slug(user.name||'song'),title:user.name,singers:(user.singers||[MATT]).map(x=>x.id==='matt-ready'?{...x,id:'mattready'}:x),tempo:null};const t=T||TRACKS[0];return{trackId:t.id,title:t.title,singers:t.singers,tempo:t.tempo}}
 function emit(playing){trackEvent({...curMeta(),playing:!!playing})}
 function curName(){if(track==='dj'){const c=DJM.DJ.at();return c.item?(c.playing?'🎧 ':'🎧 (paused) ')+c.item.title+' — '+c.item.artist:'🎧 Master DJ (queue empty)'}return track==='user'&&user?user.name:(TRACKS.find(t=>t.id===track)||TRACKS[0]).name}
 async function startTrack(){$('musE').textContent='';setTimeout(()=>emit(true),0);const T=TRACKS.find(t=>t.id===track);$('musNm').textContent=curName();lastR=0;
  if(track==='dj'){stopBuiltIn();stopUser();stAt=null;const it=DJM.DJ.current;renTempo(it&&it.bpm||120);return}
  if(track==='user'&&user){if(user.pending)await setOn.pend();if(user&&user.buf)return startUser()}
  if(!T||T.builtin){stopUser();renTempo(124);return startBuiltIn()}
  try{$('musNm').textContent=T.name+' (loading…)';const b=await fileBuf(T);if(track!==T.id||!on)return;stopBuiltIn();stopUser();userSrc=ctx.createBufferSource();userSrc.buffer=b;userSrc.loop=true;userSrc.loopStart=0;userSrc.loopEnd=Math.min(T.loopEnd||b.duration,b.duration);const tg=ctx.createGain();tg.gain.value=T.trim||1;userSrc.connect(tg);tg.connect(bus);const t0=ctx.currentTime+.05;userSrc.start(t0,0);stAt=t0;renTempo(T.tempo||120);$('musNm').textContent=T.name}
  catch(e){$('musE').textContent=T.name+' is not available yet ('+(e.message||e)+'). Playing the built-in loop.';stopUser();startBuiltIn()}}
 function startUser(){stopBuiltIn();stopUser();userSrc=ctx.createBufferSource();userSrc.buffer=user.buf;userSrc.loop=true;userSrc.connect(bus);const t0=ctx.currentTime+.05;userSrc.start(t0);stAt=t0}
 async function loadUser(blob,name,singers){$('musE').textContent='';try{graph();const buf=await ctx.decodeAudioData(await blob.arrayBuffer());user={buf,name,singers:singers||parseSingers($('musWho').value||'Matt Ready')};$('musWho').value=user.singers.map(x=>x.name).join(', ');track='user';localStorage.eearMusT=track;trackUI();$('musNm').textContent=name;lastR=0;if(on)startUser();return true}catch(e){$('musE').textContent='Could not decode that audio: '+(e.message||e);return false}}
 async function setOn(v){on=v;$('musB').textContent='🎵 Music: '+(on?'on':'off');localStorage.eearMus=on?'1':'0';
  if(on){graph();await ctx.resume().catch(()=>{});setTimeout(()=>emit(true),0);if(ctx.state!=='running')$('musE').textContent='Audio is blocked until you tap. Tap Music again.';startTrack();
   if(!setOn.n){setOn.n=1;toast("🎵 "+curName()+" from "+SRC.name+". No sound? The ringer/silent switch may mute web audio.",5000)}}
  else{stopBuiltIn();stopUser();ctx&&ctx.suspend().catch(()=>{});emit(false)}}
 function flyUI(){const b=$('musFly');if(b){b.textContent='🌀 Flying sound: '+(fly?'on':'off');b.style.background=fly?'#b026ff':'#555'}}flyUI();{const op=()=>import('./djpanel.js?v=1792352854476').then(M=>M.open());$('musPick').onclick=op;$('musLive').onclick=op}$('musFly').onclick=()=>{fly=!fly;localStorage.eearFly=fly?'1':'0';flyUI();toast(fly?'🌀 Flying sound on: the Master DJ orbits around you.':'Flying sound off: plain playback.',2500)};
 $('musB').onclick=()=>setOn(!on);$('musS').onclick=()=>{$('musP').style.display=$('musP').style.display==='block'?'none':'block'};$('musX').onclick=()=>$('musP').style.display='none';
 $('musV').oninput=()=>{localStorage.eearMusV=$('musV').value;$('musVv').textContent=$('musV').value+'%';if(vol)vol.gain.value=V()};
 $('musF').onclick=()=>$('musFi').click();
 $('musFi').onchange=async()=>{const f=$('musFi').files[0];if(!f)return;graph();if(await loadUser(f,f.name)){await idbPut('song',{blob:f,name:f.name,singers:user.singers}).catch(e=>$('musE').textContent='Saved for this session only ('+e.message+')');toast('🎵 Song saved on this device: '+f.name);if(!on)setOn(true)}};
 $('musBi').onclick=async()=>{user=null;await idbDel('song').catch(()=>{});localStorage.removeItem('eearMusUrl');track='happys-trails-vortex';localStorage.eearMusT=track;trackUI();$('musNm').textContent=SONG+' (built-in)';lastR=0;if(on){stopUser();startBuiltIn()}emit(on)};
 $('musT').onchange=()=>{track=$('musT').value;localStorage.eearMusT=track;if(on)startTrack();else $('musNm').textContent=curName();emit(on)};
 $('musWho').value=(user&&user.singers||[MATT]).map(x=>x.name).join(', ');
 $('musWho').onchange=async()=>{const sg=parseSingers($('musWho').value);if(user){user.singers=sg.length?sg:[];const r=await idbGet('song').catch(()=>null);if(r){r.singers=user.singers;await idbPut('song',r).catch(()=>{})}if(track==='user')emit(on)}};
 $('musU').value=localStorage.eearMusUrl||'';
 $('musUg').onclick=async()=>{const u=$('musU').value.trim();if(!u)return;$('musE').textContent='Loading…';try{graph();const r=await fetch(u,{mode:'cors'});if(!r.ok)throw new Error('HTTP '+r.status);const b=await r.blob();if(await loadUser(b,decodeURIComponent(u.split('/').pop().split('?')[0])||'URL song')){localStorage.eearMusUrl=u;await idbPut('song',{blob:b,name:$('musNm').textContent,singers:user.singers}).catch(()=>{});$('musE').textContent='';if(!on)setOn(true)}}catch(e){$('musE').textContent='Could not load URL (the site must allow CORS): '+e.message}};
 idbGet('song').then(r=>{if(r&&r.blob){user={pending:r,name:r.name,singers:r.singers||[MATT]};$('musWho').value=user.singers.map(x=>x.name).join(', ')}trackUI();$('musNm').textContent=curName()}).catch(()=>trackUI());trackUI();
 // decode the saved song lazily on first tap (needs an AudioContext)
 setOn.pend=async()=>{if(user&&user.pending){const r=user.pending,keep=track;user=null;await loadUser(r.blob,r.name,r.singers||[MATT]);track=keep;localStorage.eearMusT=track;trackUI()}};
 $('musB').onclick=async()=>{if(!on){graph();DJM.unlock();await ctx.resume().catch(()=>{});if(track==='user')await setOn.pend()}setOn(!on)};
 const fw=[0,0,0],up=[0,0,0];let lastL=null,duck=1;
 function frame(){{const dw=on&&track==='dj';DJM.want('beacon',dw);if(djG)djG.gain.value=dw?DJ_TRIM:0;const O=ORBIT.frame();if(ctx&&oPan){const t=ctx.currentTime,fo=fly&&dw;if(vPl){vPl.gain.setTargetAtTime(fo?0:1,t,.12);vOr.gain.setTargetAtTime(fo?1/Math.max(.05,ORB_LVL*O.gain):0,t,.12)}djB.gain.setTargetAtTime(fo?0:1,t,.12);djO.gain.setTargetAtTime(fo?1:0,t,.12);oG.gain.setTargetAtTime(fo?ORB_LVL*O.gain*duck:0,t,.08);/* ENU listener frame: x=E, y=U, z=-N (listener at origin, oriented by heading/pitch below) */if(oPan.positionX){oPan.positionX.setTargetAtTime(O.e,t,.03);oPan.positionY.setTargetAtTime(O.u,t,.03);oPan.positionZ.setTargetAtTime(-O.n,t,.03)}else oPan.setPosition(O.e,O.u,-O.n)}}const L=getListener&&getListener();lastL=L||null;if(!L)return;const d=Math.hypot(dist(L.lat,L.lon,SRC.lat,SRC.lon),L.alt||0),b=brg(L.lat,L.lon,SRC.lat,SRC.lon),el=Math.atan2(-(L.alt||0),dist(L.lat,L.lon,SRC.lat,SRC.lon));curD=d;
  const dE=10*Math.cos(el)*Math.sin(b*D),dN=10*Math.cos(el)*Math.cos(b*D),dU=10*Math.sin(el);
  const now=performance.now();if(now-lastR>500){lastR=now;$('musR').textContent=(track==='dj'&&fly)?curName()+' · 🌀 '+fmt(ORBIT.state.dist||0)+(ORBIT.state.linger>.5?' · lingering':ORBIT.state.mode==='hold'||ORBIT.state.mode==='out'?' · swooping out':ORBIT.state.mode.startsWith('tour')?' · touring '+ORBIT.state.tourSite:'')+' · vol '+Math.round(ORB_LVL*ORBIT.state.gain*duck*100)+'%':(curName()+' · '+fmt(d)+' · '+CMP[Math.round(b/22.5)%16]+' · vol '+Math.round(DGAIN(d)*duck*100)+'%'+(window.EEAR_PILLARS&&EEAR_PILLARS.near?' · 🔺 '+EEAR_PILLARS.near:''))}
  if(!ctx||!on)return;const h=L.hdg*D,p=(L.pitch||0)*D,t=ctx.currentTime;dg.gain.setTargetAtTime(DGAIN(d)*duck,t,.3);
  fw[0]=Math.sin(h)*Math.cos(p);fw[1]=Math.sin(p);fw[2]=-Math.cos(h)*Math.cos(p);up[0]=-Math.sin(h)*Math.sin(p);up[1]=Math.cos(p);up[2]=Math.cos(h)*Math.sin(p);
  const l=ctx.listener;if(l.forwardX){l.positionX.setTargetAtTime(0,t,.05);l.positionY.setTargetAtTime(0,t,.05);l.positionZ.setTargetAtTime(0,t,.05);
   l.forwardX.setTargetAtTime(fw[0],t,.05);l.forwardY.setTargetAtTime(fw[1],t,.05);l.forwardZ.setTargetAtTime(fw[2],t,.05);l.upX.setTargetAtTime(up[0],t,.05);l.upY.setTargetAtTime(up[1],t,.05);l.upZ.setTargetAtTime(up[2],t,.05)}
  else{l.setPosition(0,0,0);l.setOrientation(fw[0],fw[1],fw[2],up[0],up[1],up[2])}
  if(pan.positionX){pan.positionX.setTargetAtTime(dE,t,.05);pan.positionY.setTargetAtTime(dU,t,.05);pan.positionZ.setTargetAtTime(-dN,t,.05)}else pan.setPosition(dE,dU,-dN)}
 addEventListener('eear:dj',e=>{if(track!=='dj')return;$('musNm').textContent=curName();lastR=0;const it=e.detail&&e.detail.item;renTempo(it&&it.bpm||120);emit(on)});
 window.EEAR_AUDIO={get ctx(){return ctx},voiceIn(){return vIn},TRACKS,DJ:DJM.DJ,get startedAt(){if(track==='dj'){const a=DJM.DJ.el;return a&&ctx&&!a.paused?ctx.currentTime-a.currentTime:null}return stAt},get bpm(){const m=curMeta();return m.tempo||null},get loop(){return userSrc?{dur:userSrc.buffer.duration,loopEnd:userSrc.loopEnd,loop:userSrc.loop,sr:userSrc.buffer.sampleRate}:null},get meta(){return{...curMeta(),playing:on}},get track(){return track},setTrack(t){track=t;localStorage.eearMusT=t;trackUI();if(on)startTrack()},DGAIN,get dist(){return curD},get dgain(){return dg&&dg.gain.value},get ctx(){return ctx},get on(){return on},get pan(){return tap||pan},get flying(){return fly},get flyOn(){return fly&&track==='dj'},get orbit(){return ORBIT.state},get orbPan(){return oPan&&{x:oPan.positionX?oPan.positionX.value:null,y:oPan.positionY?oPan.positionY.value:null,z:oPan.positionZ?oPan.positionZ.value:null,gain:oG.gain.value}},setFlying(v){fly=!!v;localStorage.eearFly=fly?'1':'0';flyUI()},SRC,frame,
 /* d44 pillar proximity music (pillars.js?v=1792352854476): listener fix, master volume node, shared decoded buffers, beacon ducking 0..1 */
 get listener(){return lastL},get out(){return vol},async buffer(id){graph();const T=TRACKS.find(t=>t.id===id);return T&&T.urls?fileBuf(T):null},setDuck(v){duck=Math.max(0,Math.min(1,+v||0))},get duck(){return duck}};
 return{frame,SRC}}
