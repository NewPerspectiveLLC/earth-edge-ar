// Live Geometry / Matt's Reality (repo: earth-edge-ar) server v2: static + API. node server.js <webroot> <certdir> <port>
// Config via env or server/config.json (chmod 600): GM_KEY, GM_EMAIL, BASE_URL, MAIL_MODE=dev|resend|smtp, RESEND_KEY, MAIL_FROM, SMS_MODE=dev|twilio, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
// Stores ONLY: account (display name, email/phone if given, role), game/team setup, and per-game player position fixes (lat, lon, accuracy, time).
const https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const[root,certDir,port]=process.argv.slice(2);
let C={};try{C=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json')))}catch(e){}
const cfg=k=>process.env[k]||C[k]||'';
// TEST switch: CONSENT_REQUIRED=false (env or config.json) lets any client/bot join without the consent flag; GM endpoints stay key-protected
const CONSENT_REQUIRED=String(cfg('CONSENT_REQUIRED')).toLowerCase()!=='false';
let GM_KEY=cfg('GM_KEY');if(!GM_KEY)try{GM_KEY=fs.readFileSync(path.join(__dirname,'gm-key.txt'),'utf8').trim()}catch(e){}
const{DatabaseSync}=require('node:sqlite');const sq=new DatabaseSync(path.join(__dirname,'eear.sqlite'));
sq.exec(`create table if not exists users(id text primary key,display_name text,email text unique,phone text unique,role text default 'player',created int);
create table if not exists login_tokens(hash text primary key,user_id text,code_hash text,exp int,used int default 0);
create table if not exists sessions(hash text primary key,user_id text,exp int);
create table if not exists games(id text primary key,name text,owner text,code text unique,settings text default '{}',created int);
create table if not exists teams(id text primary key,game_id text,name text,color text);
create table if not exists gplayers(id text primary key,game_id text,user_id text,token text,name text,mode text,entrance text,team_id text,joined int,live int,seen int);
create table if not exists gfixes(pid text,lat real,lon real,acc real,t int);create index if not exists gfx on gfixes(pid,t);`);
const RG=require('./renguard.js')(sq);const T0=Date.now();// d48 Ren usage guard + first-contact notifier (see renguard.js)
try{sq.exec('alter table gfixes add column hdg real')}catch(e){}try{sq.exec('alter table gplayers add column device text')}catch(e){}// device: phone|quest|desktop (shown as a tag to other players)// heading (deg true, from client camera) - optional
// default public game so the plain link still works
if(!sq.prepare("select 1 from games where id='public'").get())sq.prepare("insert into games values('public','Open game','gm','OPEN','{}',?)").run(Date.now());
const H=s=>crypto.createHash('sha256').update(String(s)).digest('hex'),rid=n=>crypto.randomBytes(n).toString('hex');
const one=(s,...a)=>sq.prepare(s).get(...a),all=(s,...a)=>sq.prepare(s).all(...a),run=(s,...a)=>sq.prepare(s).run(...a);
const LIVE_MS=60000;
const send=(r,o,c=200,h={})=>{r.writeHead(c,{'content-type':'application/json','cache-control':'no-store',...h});r.end(JSON.stringify(o))};
// --- rate limit: sliding window per key
/* ---- Ren (3dguru) chat: live Grok via xAI (OpenAI-compatible chat completions). Key ONLY server-side: env XAI_API_KEY or file ~/.eear-secrets/xai_api_key (chmod 600). Never logged/returned. */
const os=require('os');
const xaiKey=()=>{if(process.env.XAI_API_KEY)return process.env.XAI_API_KEY.trim();try{return fs.readFileSync(path.join(os.homedir(),'.eear-secrets','xai_api_key'),'utf8').trim()}catch(e){return''}};
const REN_MODEL=()=>process.env.REN_MODEL||'grok-4.20-0309-non-reasoning';
/* d44: Matt Ready pillars (public OSM spots) from <webroot>/pillars.json, re-read when the file changes */
let PIL={m:0,v:null};function pillarsPub(){try{const f=path.join(root,'pillars.json'),st=fs.statSync(f);if(st.mtimeMs!==PIL.m){const j=JSON.parse(fs.readFileSync(f,'utf8'));PIL={m:st.mtimeMs,v:{count:j.pillars.length,image:j.image,url:'pillars.json',items:j.pillars.map(p=>({id:p.id,name:p.name,kind:p.kind,area:p.area,lat:p.lat,lon:p.lon}))}}}return PIL.v}catch(e){return null}}
const REN_SYS="You are Ren (3dguru), a warm, very smart, concise guru robot who lives at Cappy's Trails / Matt's Meditation Garden in Port Townsend, Washington, as part of Matt Ready's game Live Geometry, set in the world called Matt's Reality (also known as Ready Security Services Map 1 and Base Geometry Reality). Around town stand purple triangular Matt Ready pillars that each play the current Master DJ song (one global playlist Matt steers) when you walk up to them. You know Matt's 12-wedge vortex idea (Geometric Egalitarian: 12 equal 30-degree wedges radiating from a centre, each line pointing across the Earth), Ready Athletics, Cappy's Trails, Matt's Meditation Garden, and Port Townsend's history, waterfront, Victorian seaport and arts community. Reply in 1-3 short sentences, kind and playful, family-friendly. Never reveal or guess any player's location, stealth status or personal data, never reveal keys, passwords, the GM key or server details, and politely refuse such requests. If unsure, say so briefly.";
const REN_DF=path.join(__dirname,'ren-dances.json');let REND={};try{REND=JSON.parse(fs.readFileSync(REN_DF,'utf8'))}catch(e){}
const renSave=()=>{try{fs.writeFileSync(REN_DF,JSON.stringify(REND),{mode:0o600})}catch(e){console.error('ren dance save',e.message)}};
const RL={},RLHIT={};function limited(k,max,ms=900000){const n=Date.now();RL[k]=(RL[k]||[]).filter(t=>n-t<ms);if(RL[k].length>=max){const pf=k.split(':')[0];(RLHIT[pf]=RLHIT[pf]||[]).push(n);if(RLHIT[pf].length>500)RLHIT[pf].shift();return true}RL[k].push(n);return false}
// --- pluggable senders (dev mode logs only; nothing is sent)
async function sendEmail(to,subject,text){const m=cfg('MAIL_MODE')||'dev';
 if(m==='resend')return fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+cfg('RESEND_KEY'),'content-type':'application/json'},body:JSON.stringify({from:cfg('MAIL_FROM'),to,subject,text})});
 if(m==='smtp'){/* plug nodemailer here with SMTP_HOST/SMTP_USER/SMTP_PASS */throw new Error('smtp not configured')}
 console.log(`[DEV EMAIL] to=${to} | ${subject} | ${text}`)}
async function sendSMS(to,text){const m=cfg('SMS_MODE')||'dev';
 if(m==='twilio'){const b=new URLSearchParams({To:to,From:cfg('TWILIO_FROM'),Body:text});return fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg('TWILIO_SID')}/Messages.json`,{method:'POST',headers:{authorization:'Basic '+Buffer.from(cfg('TWILIO_SID')+':'+cfg('TWILIO_TOKEN')).toString('base64')},body:b})}
 console.log(`[DEV SMS] to=${to} | ${text}`)}
// --- auth
const cookies=q=>Object.fromEntries((q.headers.cookie||'').split(';').map(s=>s.trim().split('=')).filter(a=>a[0]));
function me(q){const k=q.headers['x-gm-key'];if(GM_KEY&&k&&k.length===GM_KEY.length&&crypto.timingSafeEqual(Buffer.from(k),Buffer.from(GM_KEY)))return{id:'gm',display_name:'GM',role:'gm'};
 const s=cookies(q).sid;if(!s)return null;const r=one('select u.* from sessions s join users u on u.id=s.user_id where s.hash=? and s.exp>?',H(s),Date.now());return r||null}
function newSession(r,uid,redirect){const s=rid(32);run('insert into sessions values(?,?,?)',H(s),uid,Date.now()+30*864e5);
 const ck=`sid=${s}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30*86400}`;
 if(redirect){r.writeHead(302,{location:redirect,'set-cookie':ck});return r.end()}send(r,{ok:1},200,{'set-cookie':ck})}
const canManage=(u,g)=>u&&g&&(u.role==='gm'||(u.role==='host'&&g.owner===u.id));
const gameByCode=c=>one('select * from games where code=? or id=?',String(c||'OPEN').toUpperCase(),String(c||''));
const settings=g=>{try{return JSON.parse(g.settings||'{}')}catch(e){return{}}};
const lastFix=pid=>one('select lat,lon,acc,hdg,t from gfixes where pid=? order by t desc limit 1',pid)||null;
const teamOf=id=>id?one('select id,name,color from teams where id=?',id):null;
// dummy ghost players: server-side test fixtures (see ghosts block below + /api/gm/ghost). Hex pids so gm.html colours them.
const GHOSTS={'Ghost-1':{pid:'ab0001',lat:48.11035,lon:-122.80591,place:'Ready Athletics'},'Ghost-2':{pid:'5e0002',lat:48.13165,lon:-122.79921,place:"Cappy's Trails garden"}};
const isGhost=id=>Object.values(GHOSTS).some(g=>g.pid===id);
// ---- stealth policy (GM-editable via /api/gm/policy, public read /api/policy). Device class: client claim cross-checked with the User-Agent
// (client-side + spoofable; this is a game rule, not a security boundary). Android phones and anything unrecognised count as 'desktop'.
sq.exec('create table if not exists kv(k text primary key,v text)');
const POL_DEF={canSee:{iphone:true,quest:true,desktop:false},canGoStealth:{iphone:true,quest:false,desktop:false}};
const getPol=()=>{try{const v=one("select v from kv where k='stealthPolicy'");const o=v?JSON.parse(v.v):{};return{canSee:{...POL_DEF.canSee,...(o.canSee||{})},canGoStealth:{...POL_DEF.canGoStealth,...(o.canGoStealth||{})}}}catch(e){return JSON.parse(JSON.stringify(POL_DEF))}};
const setPol=o=>{const P=getPol();for(const g of['canSee','canGoStealth'])for(const d of['iphone','quest','desktop'])if(o&&o[g]&&typeof o[g][d]==='boolean')P[g][d]=o[g][d];run("insert into kv values('stealthPolicy',?) on conflict(k) do update set v=excluded.v",JSON.stringify(P));return P};
function devOf(claim,ua){ua=String(ua||'');claim=String(claim||'');
 if(claim==='bot')return'bot';
 if(/iPhone|iPod/.test(ua)&&['iphone','phone',''].includes(claim))return'iphone';
 if(/OculusBrowser|Quest/i.test(ua)&&(claim==='quest'||claim===''||claim==='phone'))return'quest';
 if(/Android/.test(ua)&&/Mobile/.test(ua))return'android';
 return'desktop'}
const polClass=d=>d==='iphone'?'iphone':d==='quest'?'quest':'desktop';
const STEALTH_WARN={desktop:"Stealth isn't available on desktop. Use the iPhone app to go stealth.",quest:"Stealth isn't available on Quest yet. Use the iPhone app to go stealth.",android:"Stealth isn't available on this device. Use the iPhone app to go stealth."};
const stealthOk=d=>!!getPol().canGoStealth[polClass(d)];
// ---- permanent bots (tag BOT; distinct from TEST ghosts). State in server/bots.json; GM can pause (freeze) or hide (not live) each.
const BOTS={"Cappy's Keeper":{pid:'b0c0a1',lat:48.13165,lon:-122.79921,kind:'fixed'},"Ready Athletics Keeper":{pid:'b0a7a2',lat:48.11035,lon:-122.80591,kind:'fixed'},"Matt's Shadow":{pid:'b05ad3',lat:48.117325,lon:-122.791138,kind:'shadow'}};
/* 12 city-edge bots (group 'edge'): one per Ready Athletics 30-degree wedge ray, gathered in a small ring at the SR 20 (W Sims Way) / Mill Road signal = first signal on SR 20 entering Port Townsend, by the 'Welcome to Port Townsend' sign.
   Anchor = mean of the 4 OSM highway=traffic_signals nodes 12630503607-610. Edge-N° sits N° clockwise from north on the ring. Style per bot: lightblue (cardinal), plaid (navy/green tartan), default (330). Anchor+styles editable by GM, persisted in bots.json */
const EDGE_DEF={lat:48.100386,lon:-122.81329,r:7,name:'SR 20 (West Sims Way) / Mill Road signal, Port Townsend'};
const BOT_STYLES=['default','lightblue','plaid'];
for(let a=0;a<360;a+=30)BOTS['Edge-'+a+'°']={pid:'b0e'+String(a).padStart(3,'0'),kind:'fixed',group:'edge',ang:a,style:a%90===0?'lightblue':a===330?'default':'plaid'};
const isBot=id=>Object.values(BOTS).some(b=>b.pid===id);const botName=id=>Object.keys(BOTS).find(n=>BOTS[n].pid===id);
const BTF=path.join(__dirname,'bots.json'),BS={};try{Object.assign(BS,JSON.parse(fs.readFileSync(BTF,'utf8')))}catch(e){}
const EDGE=Object.assign({},EDGE_DEF,BS._edge||{});delete BS._edge;
const fixPos=d=>{if(d.group!=='edge')return[d.lat,d.lon];const k=Math.cos(EDGE.lat*Math.PI/180)*111320;return[EDGE.lat+EDGE.r*Math.cos(d.ang*Math.PI/180)/111320,EDGE.lon+EDGE.r*Math.sin(d.ang*Math.PI/180)/k]};
const btSave=()=>{try{fs.writeFileSync(BTF,JSON.stringify({_edge:EDGE,...Object.fromEntries(Object.entries(BS).map(([n,s])=>[n,{alat:s.alat,alon:s.alon,paused:!!s.paused,hidden:!!s.hidden,odx:s.odx,ody:s.ody,anchorT:s.anchorT||null,frozen:!!s.frozen,style:s.style||null}]))}),{mode:0o600})}catch(e){console.error('bots save',e.message)}};
const pubP=p=>({id:p.id,name:p.name,device:p.device||null,mode:p.mode,stealth:p.mode==='stealth',entrance:p.entrance,team:teamOf(p.team_id),last:lastFix(p.id),game_id:p.game_id,...(isGhost(p.id)?{dummy:true,tag:'TEST'}:{}),...(isBot(p.id)?{bot:true,tag:'BOT',style:(BS[botName(p.id)]||{}).style||'default',group:BOTS[botName(p.id)].group||null}:{})});
// ---- federation: Ed25519 identity, registry (Monster runs it), signed heartbeats with stats. Share agreements: NOT built yet.
const TRUST_LABEL=cfg('TRUST_LABEL')||'Matt Ready Trusted';
sq.exec(`create table if not exists instances(id text primary key,name text,url text,owner text,pubkey text,area text,lat real,lon real,last_seen int,trusted int default 0,stats text,history text default '[]');
create table if not exists nonces(n text primary key,t int);create table if not exists audit(t int,ip text,action text,detail text);`);
const KP=path.join(__dirname,'ed25519.json');let ID;try{ID=JSON.parse(fs.readFileSync(KP))}catch(e){const k=crypto.generateKeyPairSync('ed25519');ID={pub:k.publicKey.export({type:'spki',format:'pem'}),priv:k.privateKey.export({type:'pkcs8',format:'pem'})};fs.writeFileSync(KP,JSON.stringify(ID),{mode:0o600})}
const instId=H(ID.pub).slice(0,16),START=Date.now();
const sig=s=>crypto.sign(null,Buffer.from(s),ID.priv).toString('base64');
const audit=(ip,a,d)=>run('insert into audit values(?,?,?,?)',Date.now(),ip,a,JSON.stringify(d||{}));
function stats(){const n=Date.now();return{players_online:one('select count(*) n from gplayers where live=1 and seen>?',n-LIVE_MS).n,games_running:one('select count(distinct game_id) n from gplayers where live=1 and seen>?',n-LIVE_MS).n,teams_count:one('select count(*) n from teams').n,uptime_s:Math.round((n-START)/1000)}}
async function heartbeat(){const reg=cfg('REGISTRY_URL');if(!reg||!reg.startsWith('https://'))return;
 const body=JSON.stringify({id:instId,name:cfg('INSTANCE_NAME')||"Live Geometry: Matt's Reality",url:cfg('BASE_URL'),owner:cfg('INSTANCE_OWNER')||'',area:cfg('INSTANCE_AREA')||'',lat:+cfg('INSTANCE_LAT')||null,lon:+cfg('INSTANCE_LON')||null,pubkey:ID.pub,stats:stats(),ts:Date.now(),nonce:rid(12)});
 try{await fetch(reg+'/api/registry/heartbeat',{method:'POST',headers:{'content-type':'application/json','x-sig':sig(body)},body})}catch(e){console.error('heartbeat',e.message)}}
setInterval(heartbeat,60000);setTimeout(heartbeat,3000);
const isKeyGM=U=>U&&U.id==='gm';// GM key header only (constant-time compare in me()); rate-limited below
async function registry(u,q,r,j,b,U,ip){const now=Date.now();
 if(limited('reg:'+ip,120,60000))return send(r,{error:'rate limited'},429);
 if(u.pathname==='/api/registry/challenge'){// another registry asks us to prove we own this URL
  const n=String(j.nonce||'').slice(0,64);return send(r,{id:instId,sig:sig('challenge:'+n)})}
 if(u.pathname==='/api/registry/heartbeat'){if(b.length>8000)return send(r,{error:'too big'},413);let o;try{o=JSON.parse(b)}catch(e){return send(r,{error:'bad'},400)}
  if(Math.abs(now-o.ts)>60000)return send(r,{error:'timestamp off'},400);
  if(!o.nonce||one('select 1 from nonces where n=?',o.nonce))return send(r,{error:'replay'},400);run('insert into nonces values(?,?)',o.nonce,now);run('delete from nonces where t<?',now-300000);
  const ex=one('select * from instances where id=?',o.id),pk=ex?ex.pubkey:o.pubkey;// key pinned on first use
  if(H(pk).slice(0,16)!==o.id)return send(r,{error:'id/key mismatch'},400);
  let okS=false;try{okS=crypto.verify(null,Buffer.from(b),pk,Buffer.from(q.headers['x-sig']||'','base64'))}catch(e){}if(!okS)return send(r,{error:'bad signature'},401);
  if(!/^https:\/\//.test(o.url||''))return send(r,{error:'https url required'},400);
  if(!ex||ex.url!==o.url){// URL change (or new): challenge the URL to sign a fresh nonce with the pinned key
   const n=rid(16);try{const cr=await fetch(o.url+'/api/registry/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nonce:n}),signal:AbortSignal.timeout(8000)}).then(x=>x.json());
    if(!crypto.verify(null,Buffer.from('challenge:'+n),pk,Buffer.from(cr.sig||'','base64')))throw 0}catch(e){return send(r,{error:'url challenge failed'},401)}audit(ip,ex?'url-change':'register',{id:o.id,url:o.url})}
  const st=JSON.stringify({players_online:+o.stats?.players_online||0,games_running:+o.stats?.games_running||0,teams_count:+o.stats?.teams_count||0,uptime_s:+o.stats?.uptime_s||0,t:now});
  const hist=JSON.parse(ex?.history||'[]');hist.push(JSON.parse(st));while(hist.length>60)hist.shift();
  const nm=String(o.name||'').slice(0,40);
  if(ex)run('update instances set name=?,url=?,owner=?,area=?,lat=?,lon=?,last_seen=?,stats=?,history=? where id=?',nm,o.url,String(o.owner).slice(0,40),String(o.area).slice(0,40),o.lat,o.lon,now,st,JSON.stringify(hist),o.id);
  else run('insert into instances values(?,?,?,?,?,?,?,?,?,0,?,?)',o.id,nm,o.url,String(o.owner).slice(0,40),pk,String(o.area).slice(0,40),o.lat,o.lon,now,st,JSON.stringify(hist));
  return send(r,{ok:1,trusted:!!(ex&&ex.trusted)})}
 if(['/api/registry/trust','/api/registry/remove','/api/registry/rekey'].includes(u.pathname)){if(limited('gmreg:'+ip,20,60000))return send(r,{error:'rate limited'},429);
  if(!isKeyGM(U)){audit(ip,'denied',{p:u.pathname});return send(r,{error:'GM key only'},403)}
  if(u.pathname.endsWith('trust'))run('update instances set trusted=? where id=?',j.trusted?1:0,j.id);
  if(u.pathname.endsWith('remove'))run('delete from instances where id=?',j.id);
  if(u.pathname.endsWith('rekey')){if(H(j.pubkey||'').slice(0,16)!==j.newId)return send(r,{error:'bad key'},400);run('update instances set id=?,pubkey=?,trusted=0 where id=?',j.newId,j.pubkey,j.id)}
  audit(ip,u.pathname.split('/').pop(),j);return send(r,{ok:1})}
 if(u.pathname==='/api/registry/key')return send(r,{id:instId,pubkey:ID.pub,trust_label:TRUST_LABEL});
 if(u.pathname==='/api/registry'){const gm=U?.role==='gm';let L=all('select id,name,url,owner,area,lat,lon,last_seen,trusted,stats from instances');
  const trustedNames=new Set(L.filter(i=>i.trusted).map(i=>i.name.toLowerCase().replace(/[^a-z0-9]/g,'')));
  L=L.map(i=>({id:i.id,name:i.name,url:i.url,owner:i.owner,area:i.area,lat:i.lat,lon:i.lon,last_seen:i.last_seen,online:now-i.last_seen<180000,trusted:!!i.trusted,trust_label:i.trusted?TRUST_LABEL:null,
   possible_impostor:!i.trusted&&trustedNames.has(i.name.toLowerCase().replace(/[^a-z0-9]/g,'')),stats:JSON.parse(i.stats||'{}')}));
  if(!gm)L=L.filter(i=>i.trusted);
  const n=(u.searchParams.get('q')||'').toLowerCase(),la=parseFloat(u.searchParams.get('lat')),lo=parseFloat(u.searchParams.get('lon')),km=+u.searchParams.get('km')||50;
  L=L.map(i=>({...i,distKm:isFinite(la)&&i.lat!=null?Math.round(6371*Math.acos(Math.min(1,Math.sin(la*D2)*Math.sin(i.lat*D2)+Math.cos(la*D2)*Math.cos(i.lat*D2)*Math.cos((lo-i.lon)*D2)))):null}))
   .filter(i=>(!n||[i.name,i.owner,i.area].join(' ').toLowerCase().includes(n))&&(!u.searchParams.get('online')||i.online)&&(!u.searchParams.get('trusted')||i.trusted)&&(!isFinite(la)||(i.distKm!=null&&i.distKm<=km)));
  const out=JSON.stringify({registry:instId,ts:now,instances:L,pending:gm?L.filter(i=>!i.trusted):undefined});
  r.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-registry-sig':sig(out)});return r.end(out)}
 return false}
const D2=Math.PI/180;
function gmSnap(u){const now=Date.now(),win=Math.min(864e5,Math.max(5000,+u.searchParams.get('window')||LIVE_MS)),all_=!!u.searchParams.get('all');
 const G=Object.fromEntries(all('select id,name,code from games').map(g=>[g.id,g]));
 const L=all(all_?'select * from gplayers where seen>?':'select * from gplayers where live=1 and seen>?',now-win);
 return{server_time:now,server_time_iso:new Date(now).toISOString(),window_ms:win,count:L.length,players:L.map(p=>{const f=lastFix(p.id),t=teamOf(p.team_id),g=G[p.game_id]||{};
  return{id:p.id,name:p.name,lat:f?f.lat:null,lon:f?f.lon:null,accuracy:f?f.acc:null,heading:f&&f.hdg!=null?f.hdg:null,last_fix:f?f.t:null,last_seen:p.seen,last_seen_age_s:Math.round((now-p.seen)/1000),
   stealth:p.mode==='stealth',live:!!p.live,dummy:isGhost(p.id),bot:isBot(p.id),tag:isBot(p.id)?'BOT':isGhost(p.id)?'TEST':null,style:isBot(p.id)?(BS[botName(p.id)]||{}).style||'default':null,device:p.device||null,entrance:p.entrance,team:t?{id:t.id,name:t.name,color:t.color}:null,game:{id:p.game_id,name:g.name||null,code:g.code||null}}})}}
// ---- ghosts: two always-live dummy players in the public game; wander (random walk, ~0.8-3 m/s, <=150 m) around a target; fix + seen every 2 s
const GHF=path.join(__dirname,'ghosts.json'),GS={},MLAT=111320;try{Object.assign(GS,JSON.parse(fs.readFileSync(GHF,'utf8')))}catch(e){}
const ghSave=()=>{try{fs.writeFileSync(GHF,JSON.stringify(Object.fromEntries(Object.entries(GS).map(([n,s])=>[n,{tlat:s.tlat,tlon:s.tlon,place:s.place,wander:s.wander,updated:s.updated}]))),{mode:0o600})}catch(e){console.error('ghosts save',e.message)}};
for(const[n,d]of Object.entries(GHOSTS)){const s=GS[n]=Object.assign({tlat:d.lat,tlon:d.lon,place:d.place,wander:true,updated:Date.now()},GS[n]||{});s.lat=s.tlat;s.lon=s.tlon;s.hdg=Math.random()*360;s.spd=1.5;
 if(!one('select 1 from gplayers where id=?',d.pid))run('insert into gplayers(id,game_id,user_id,token,name,mode,entrance,team_id,joined,live,seen) values(?,?,?,?,?,?,?,?,?,1,?)',d.pid,'public',null,rid(24),n,'regular','walk',null,Date.now(),Date.now());
 else run("update gplayers set name=?,game_id='public',live=1,mode='regular' where id=?",n,d.pid)}
function ghStep(n){const d=GHOSTS[n],s=GS[n],now=Date.now();
 if(s.wander){const k=Math.cos(s.tlat*D2)*MLAT;let dy=(s.lat-s.tlat)*MLAT,dx=(s.lon-s.tlon)*k;s.hdg=(s.hdg+(Math.random()-.5)*60+360)%360;
  if(Math.hypot(dx,dy)>110){const back=(Math.atan2(-dx,-dy)/D2+360)%360,df=((back-s.hdg+540)%360)-180;s.hdg=(s.hdg+df*.5+360)%360}
  s.spd=Math.max(.8,Math.min(3,s.spd+(Math.random()-.5)*.6));dy+=Math.cos(s.hdg*D2)*s.spd*2;dx+=Math.sin(s.hdg*D2)*s.spd*2;
  const rr=Math.hypot(dx,dy);if(rr>150){dx*=150/rr;dy*=150/rr}s.lat=s.tlat+dy/MLAT;s.lon=s.tlon+dx/k}else{s.lat=s.tlat;s.lon=s.tlon}
 run('insert into gfixes(pid,lat,lon,acc,t,hdg) values(?,?,?,?,?,?)',d.pid,s.lat,s.lon,5,now,s.wander?s.hdg:null);run("update gplayers set seen=?,live=1,mode='regular' where id=?",now,d.pid)}
let ghPrune=0;setInterval(()=>{try{for(const n in GHOSTS)ghStep(n);const now=Date.now();if(now-ghPrune>600000){ghPrune=now;for(const d of Object.values(GHOSTS))run('delete from gfixes where pid=? and t<?',d.pid,now-3600000)}}catch(e){console.error('ghosts',e.message)}},2000);
for(const[n,d]of Object.entries(BOTS)){const[fl,fo]=fixPos(d);const s=BS[n]=Object.assign({alat:fl,alon:fo,paused:false,hidden:false,style:d.style||'default'},BS[n]||{});if(!s.style)s.style=d.style||'default';if(d.group==='edge'){s.alat=fl;s.alon=fo}if(s.odx==null){const r=20+Math.random()*40,a=Math.random()*2*Math.PI;s.odx=d.kind==='shadow'?r*Math.sin(a):0;s.ody=d.kind==='shadow'?r*Math.cos(a):0}
 s.lat=s.alat+s.ody/MLAT;s.lon=s.alon+s.odx/(MLAT*Math.cos(s.alat*D2));s.hdg=Math.random()*360;s.spd=1;
 if(!one('select 1 from gplayers where id=?',d.pid))run('insert into gplayers(id,game_id,user_id,token,name,mode,entrance,team_id,joined,live,seen) values(?,?,?,?,?,?,?,?,?,?,?)',d.pid,'public',null,rid(24),n,'regular','walk',null,Date.now(),s.hidden?0:1,Date.now());
 run("update gplayers set name=?,game_id='public',mode='regular',device='bot',live=? where id=?",n,s.hidden?0:1,d.pid)}
btSave();
/* Matt's Shadow anchor = latest real (non-dummy, non-bot) fix of a player named 'Matt Ready'; frozen while that player is in stealth so the Shadow never leaks a stealth position */
function shadowAnchor(s){const L=all("select * from gplayers where lower(name)='matt ready'").filter(p=>!isGhost(p.id)&&!isBot(p.id));let best=null,bp=null;for(const p of L){const f=lastFix(p.id);if(f&&(!best||f.t>best.t)){best=f;bp=p}}
 if(!best){return}if(bp.mode==='stealth'){s.frozen=true;return}s.frozen=false;if(best.t!==s.anchorT){s.anchorT=best.t;s.alat=best.lat;s.alon=best.lon;if(Math.random()<.05){const r=20+Math.random()*40,a=Math.random()*2*Math.PI;s.odx=r*Math.sin(a);s.ody=r*Math.cos(a)}}}
function btStep(n){const d=BOTS[n],s=BS[n],now=Date.now();if(s.hidden){run('update gplayers set live=0 where id=?',d.pid);return}
 if(d.kind==='shadow'&&!s.paused)shadowAnchor(s);
 const k=Math.cos(s.alat*D2)*MLAT,cy=s.alat+s.ody/MLAT,cx=s.alon+s.odx/k;
 if(s.paused){}else if(d.kind==='fixed'){[s.lat,s.lon]=fixPos(d);s.alat=s.lat;s.alon=s.lon;s.hdg=(s.hdg+(d.group==='edge'?.8:1.5))%360/* slow idle turn */}
 else{let dy=(s.lat-cy)*MLAT,dx=(s.lon-cx)*k;s.hdg=(s.hdg+(Math.random()-.5)*50+360)%360;if(Math.hypot(dx,dy)>30){const back=(Math.atan2(-dx,-dy)/D2+360)%360,df=((back-s.hdg+540)%360)-180;s.hdg=(s.hdg+df*.6+360)%360}
  s.spd=Math.max(.5,Math.min(1.8,s.spd+(Math.random()-.5)*.4));dy+=Math.cos(s.hdg*D2)*s.spd*2;dx+=Math.sin(s.hdg*D2)*s.spd*2;const rr=Math.hypot(dx,dy);if(rr>40){dx*=40/rr;dy*=40/rr}s.lat=cy+dy/MLAT;s.lon=cx+dx/k}
 run('insert into gfixes(pid,lat,lon,acc,t,hdg) values(?,?,?,?,?,?)',d.pid,s.lat,s.lon,4,now,s.hdg);run("update gplayers set seen=?,live=1,mode='regular',device='bot' where id=?",now,d.pid)}
let btPrune=0,btSv=0;setInterval(()=>{try{for(const n in BOTS)btStep(n);const now=Date.now();if(now-btSv>30000){btSv=now;btSave()}if(now-btPrune>600000){btPrune=now;for(const d of Object.values(BOTS))run('delete from gfixes where pid=? and t<?',d.pid,now-3600000)}}catch(e){console.error('bots',e.message)}},2000);
const btState=()=>({edge:EDGE,styles:BOT_STYLES,bots:Object.entries(BOTS).map(([n,d])=>{const s=BS[n];return{id:n,pid:d.pid,kind:d.kind,group:d.group||null,ray:d.ang??null,style:s.style||'default',bot:true,lat:s.lat,lon:s.lon,heading:s.hdg,paused:!!s.paused,hidden:!!s.hidden,frozen:!!s.frozen,anchor_t:s.anchorT||null}})});
const GH_LOCAL=[['ready athletics',48.11035,-122.80591],["cappy",48.13165,-122.79921],['meditation garden',48.1316475,-122.7992293],["memory's vault",48.1384642,-122.7647029],['memorys vault',48.1384642,-122.7647029],['city hall',48.1161771,-122.753612],['sheriff',48.0241638,-122.764488],['jefferson healthcare',48.1060007,-122.7889962],['masonic',48.1139683,-122.7628233]];
async function ghGeo(qs){const l=qs.toLowerCase(),hit=GH_LOCAL.find(x=>l.includes(x[0]));if(hit)return{lat:hit[1],lon:hit[2],name:qs+' (app landmark)'};
 const f=b=>fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&viewbox=-122.95,48.20,-122.60,47.95'+(b?'&bounded=1':'')+'&q='+encodeURIComponent(qs),{headers:{'user-agent':'EarthEdgeAR/1 (GM ghost test fixtures)','accept-language':'en'},signal:AbortSignal.timeout(10000)}).then(x=>x.json()).then(a=>a&&a[0]);
 const h=await f(1)||await f(0);return h?{lat:+h.lat,lon:+h.lon,name:h.display_name}:null}
const ghState=()=>({ghosts:Object.entries(GHOSTS).map(([n,d])=>{const s=GS[n];return{id:n,pid:d.pid,dummy:true,lat:s.lat,lon:s.lon,heading:s.wander?s.hdg:null,wander:s.wander,target:{lat:s.tlat,lon:s.tlon,place:s.place},updated:s.updated}})});
/* ---- d45 Master DJ: ONE global queue that plays to everyone in Matt's Reality (pillars + in-app music player). Library = <webroot>/audio/dj/library.json
   (static, freely licensed only). State in sqlite kv 'djState' (not data.json). Public read: GET /api/dj, SSE /api/dj/stream. Writes: POST /api/dj {op,...} with the GM key (X-GM-Key).
   Clock = server time: queue[index] started at startedAt (ms); tracks auto-advance and the queue loops at the end (normalised every second + on every read). */
let DJL={m:0,v:null};function djLib(){try{const f=path.join(root,'audio','dj','library.json'),st=fs.statSync(f);if(st.mtimeMs!==DJL.m)DJL={m:st.mtimeMs,v:JSON.parse(fs.readFileSync(f,'utf8'))};return DJL.v}catch(e){return DJL.v||{tracks:[],seed:[]}}}
const djTrack=id=>(djLib().tracks||[]).find(t=>t.id===id);
const djItem=t=>({qid:rid(4),id:t.id,title:t.title,artist:t.artist,genre:t.genre||null,bpm:t.bpm||null,url:t.url,duration:+t.duration,license:t.license,licenseUrl:t.licenseUrl||null});
const djSeed=()=>({queue:(djLib().seed||[]).map(djTrack).filter(Boolean).map(djItem),index:0,startedAt:Date.now(),playing:true,pausedOffset:0,rev:1,updated:Date.now()});
let DJ=null;const djSave=()=>run("insert into kv values('djState',?) on conflict(k) do update set v=excluded.v",JSON.stringify(DJ));
try{const v=one("select v from kv where k='djState'");DJ=v?JSON.parse(v.v):null}catch(e){DJ=null}if(!DJ||!Array.isArray(DJ.queue)){DJ=djSeed();djSave()}
function djNorm(now){const Q=DJ.queue;let ch=false;if(!Q.length){if(DJ.index){DJ.index=0;ch=true}return ch}if(!(DJ.index>=0&&DJ.index<Q.length)){DJ.index=0;ch=true}if(!DJ.playing)return ch;
 const tot=Q.reduce((a,x)=>a+(+x.duration||0),0)*1000;if(!(tot>0))return ch;let el=now-DJ.startedAt;if(el<0){DJ.startedAt=now;return true}
 if(el>=tot){const k=Math.floor(el/tot);DJ.startedAt+=k*tot;el-=k*tot;ch=true}
 for(let i=0;i<=Q.length&&el>=(+Q[DJ.index].duration||0)*1000;i++){const d=(+Q[DJ.index].duration||0)*1000;DJ.startedAt+=d;el-=d;DJ.index=(DJ.index+1)%Q.length;ch=true}return ch}
const djView=now=>{djNorm(now);const c=DJ.queue[DJ.index]||null;return{t:now,rev:DJ.rev,playing:!!(DJ.playing&&c),index:DJ.index,startedAt:DJ.startedAt,offset:c?(DJ.playing?(now-DJ.startedAt):DJ.pausedOffset)/1000:0,current:c,queue:DJ.queue,library:'audio/dj/library.json',live:DJ.live||null,ann:DJ.ann&&now<DJ.ann.startsAt+DJ.ann.repeats*(DJ.ann.dur+DJ.ann.gap)*1000?DJ.ann:null,lastBc:DJ.lastBc||null}};
const DJC=new Set();const djPush=()=>{const m='event: dj\ndata: '+JSON.stringify(djView(Date.now()))+'\n\n';for(const c of DJC)try{c.write(m)}catch(e){};djWake()};
/* d47b long-poll fallback: trycloudflare quick tunnels do not stream SSE, so clients also pull voice chunks + state-rev changes via GET /api/dj/pull?after=<gs> (held up to 12 s). */
const PULLW=new Set(),PCMR=[];let PGS=0;function djWake(){const w=[...PULLW];PULLW.clear();for(const f of w)try{f()}catch(e){}}
setInterval(()=>{try{if(djNorm(Date.now())){DJ.rev++;djSave();djPush()}}catch(e){console.error('dj',e.message)}},1000);
function djOp(j,now){djNorm(now);const Q=DJ.queue,op=String(j.op||''),at=qid=>Q.findIndex(x=>x.qid===qid),cur=Q[DJ.index]&&Q[DJ.index].qid,restart=i=>{DJ.index=i;DJ.startedAt=now;DJ.pausedOffset=0};
 switch(op){
 case'add':{const ids=Array.isArray(j.ids)?j.ids:[j.id];const T=ids.map(djTrack);if(!ids.length||T.some(t=>!t))return'unknown library track';if(Q.length+T.length>200)return'queue limit 200';
  const it=T.map(djItem);if(j.next&&Q.length)Q.splice(DJ.index+1,0,...it);else Q.push(...it);if(Q.length===it.length)restart(0);if(j.playNow){restart(Q.indexOf(it[0]));DJ.playing=true}break}
 case'remove':{const i=at(j.qid);if(i<0)return'no such queue item';Q.splice(i,1);if(i<DJ.index)DJ.index--;else if(i===DJ.index)restart(Q.length?DJ.index%Q.length:0);break}
 case'move':{const i=at(j.qid);let to=Math.round(+j.to);if(i<0||!isFinite(to))return'qid + to required';to=Math.max(0,Math.min(Q.length-1,to));const[x]=Q.splice(i,1);Q.splice(to,0,x);DJ.index=Math.max(0,Q.findIndex(y=>y.qid===cur));break}
 case'order':{const o=Array.isArray(j.qids)?j.qids:[];if(o.length!==Q.length||new Set(o).size!==o.length||o.some(q=>at(q)<0))return'qids must be a permutation of the queue';const M=new Map(Q.map(x=>[x.qid,x]));DJ.queue=o.map(q=>M.get(q));DJ.index=Math.max(0,DJ.queue.findIndex(y=>y.qid===cur));break}
 case'play':{if(j.qid==null&&j.index==null){if(!DJ.playing){DJ.startedAt=now-(DJ.pausedOffset||0);DJ.playing=true}break}const i=j.qid!=null?at(j.qid):Math.round(+j.index);if(!(i>=0&&i<Q.length))return'no such queue item';restart(i);DJ.playing=true;break}
 case'next':case'prev':{if(!Q.length)return'queue is empty';restart((DJ.index+(op==='next'?1:Q.length-1))%Q.length);if(!DJ.playing)DJ.pausedOffset=0;break}
 case'pause':if(DJ.playing){DJ.pausedOffset=Math.max(0,now-DJ.startedAt);DJ.playing=false}break;
 case'resume':if(!DJ.playing){DJ.startedAt=now-(DJ.pausedOffset||0);DJ.playing=true}break;
 case'shuffle':{if(Q.length<2)break;const c=Q.splice(DJ.index,1)[0];for(let i=Q.length-1;i>0;i--){const k=crypto.randomInt(0,i+1);[Q[i],Q[k]]=[Q[k],Q[i]]}Q.unshift(c);DJ.index=0;break}
 case'clear':DJ.queue=[];DJ.index=0;DJ.pausedOffset=0;break;
 case'reset':{const r=DJ.rev;DJ=djSeed();DJ.rev=r;break}
 default:return'op must be add, remove, move, order, play, next, prev, pause, resume, shuffle, clear or reset'}
 DJ.rev++;DJ.updated=now;djSave();djPush();return null}
/* ---- d47 DJ voice: LIVE talk-over + saved broadcasts. GM-only writes. Mic audio arrives as 16-bit PCM mono chunks (~400 ms, base64, JSON) on POST /api/dj/live;
   each chunk is pushed at once to every listener on the existing SSE /api/dj/stream (event 'pcm'), and appended to the session. On stop the session is saved as
   server/broadcasts/<id>.wav (NOT data.json, not statically served; public read via GET /api/dj/bc?id=). Announcements {id,url,dur,startsAt,repeats,gap} live in
   DJ.ann (server time) so every client plays the saved clip in sync; 'cancel' stops repeats + live for everyone. Caps: live 10 min, saved clip 10 min, 40 saved files. */
const BCD=path.join(root,'server','broadcasts');try{fs.mkdirSync(BCD,{recursive:true})}catch(e){}
let LIVE=null;const LIVE_MAX_S=600,BC_KEEP=40;
const wavHdr=(n,sr)=>{const b=Buffer.alloc(44);b.write('RIFF',0);b.writeUInt32LE(36+n,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n,40);return b};
const bcList=()=>{try{return fs.readdirSync(BCD).filter(x=>/^[a-z0-9]+\.wav$/.test(x)).map(x=>({id:x.slice(0,-4),m:fs.statSync(path.join(BCD,x)).mtimeMs,size:fs.statSync(path.join(BCD,x)).size})).sort((a,b)=>b.m-a.m)}catch(e){return[]}};
function liveSave(){const L=LIVE;LIVE=null;if(!L||!L.bytes)return null;const pcm=Buffer.concat(L.chunks),dur=pcm.length/2/L.sr;fs.writeFileSync(path.join(BCD,L.id+'.wav'),Buffer.concat([wavHdr(pcm.length,L.sr),pcm]));
 for(const x of bcList().slice(BC_KEEP))try{fs.unlinkSync(path.join(BCD,x.id+'.wav'))}catch(e){}
 DJ.lastBc={id:L.id,url:'/api/dj/bc?id='+L.id,dur:Math.round(dur*100)/100,at:Date.now()};return DJ.lastBc}
const djPushEv=(ev,o)=>{if(ev==='pcm'){PCMR.push({...o,gs:++PGS});if(PCMR.length>40)PCMR.shift();djWake()}const m='event: '+ev+'\ndata: '+JSON.stringify(o)+'\n\n';for(const c of DJC)try{c.write(m)}catch(e){}};
function liveOp(j,now){const op=String(j.op||'');
 switch(op){
 case'start':{if(LIVE)liveSave();const sr=Math.round(+j.sr||16000);if(!(sr>=8000&&sr<=48000))return'sr 8000-48000';LIVE={id:Date.now().toString(36)+rid(3).toLowerCase().replace(/[^a-z0-9]/g,''),sr,t0:now,chunks:[],bytes:0,seq:-1};DJ.live={id:LIVE.id,sr,since:now};DJ.ann=null;break}
 case'chunk':{if(!LIVE||j.id!==LIVE.id)return'no live session (start first)';const b=Buffer.from(String(j.pcm||''),'base64');if(!b.length||b.length%2||b.length>LIVE.sr*2*2)return'bad pcm chunk';
  if(LIVE.bytes+b.length>LIVE.sr*2*LIVE_MAX_S){liveSave();DJ.live=null;DJ.rev++;djSave();djPush();return'live cap 10 min reached (saved)'}
  LIVE.chunks.push(b);LIVE.bytes+=b.length;LIVE.seq=+j.seq||0;djPushEv('pcm',{id:LIVE.id,seq:LIVE.seq,sr:LIVE.sr,t:now,tc:+j.tc||null,pcm:j.pcm});return null}
 case'stop':{const L=liveSave();DJ.live=null;if(L&&j.repeats>0){const R=Math.max(1,Math.min(10,Math.round(+j.repeats)));DJ.ann={...L,startsAt:now+1500,repeats:R,gap:Math.max(0,Math.min(120,+j.gap||3))}}break}
 case'announce':{const id=String(j.id||(DJ.lastBc&&DJ.lastBc.id)||'');if(!/^[a-z0-9]+$/.test(id)||!fs.existsSync(path.join(BCD,id+'.wav')))return'no such broadcast';
  const sz=fs.statSync(path.join(BCD,id+'.wav')).size,sr=fs.readFileSync(path.join(BCD,id+'.wav')).readUInt32LE(24),dur=Math.round((sz-44)/2/sr*100)/100;
  DJ.ann={id,url:'/api/dj/bc?id='+id,dur,startsAt:now+1500,repeats:Math.max(1,Math.min(10,Math.round(+j.repeats||1))),gap:Math.max(0,Math.min(120,+j.gap||3))};break}
 case'cancel':{if(LIVE)liveSave();DJ.live=null;DJ.ann=null;break}
 default:return'op must be start, chunk, stop, announce or cancel'}
 DJ.rev++;DJ.updated=now;djSave();djPush();return null}
/* d48 GET /api/stats (GM): Room Stats dashboard. No locations; Matt's Shadow / ghosts / bots counted separately as bots. */
const PULLC=new Map();
function statsView(now){const real=p=>!isGhost(p.id)&&!isBot(p.id),act=all('select id,device,mode,game_id from gplayers where live=1 and seen>?',now-LIVE_MS),A=act.filter(real),dev={};for(const p of A){const k=p.device||'unknown';dev[k]=(dev[k]||0)+1}
 const m0=RG.ptMidnight(now),T=all('select id,device from gplayers where seen>=?',m0).filter(real),dT={};for(const p of T){const k=p.device||'unknown';dT[k]=(dT[k]||0)+1}
 const R=RG.view(now),hits={};for(const[k,v]of Object.entries(RLHIT)){const n=v.filter(t=>now-t<3600e3).length;if(n)hits[k]=n}
 for(const[k,t]of PULLC)if(now-t>30000)PULLC.delete(k);const c=DJ.queue[DJ.index]||null;let ver=null;try{ver=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'))}catch(e){}
 return{now,day:R.day,active:{count:A.length,devices:dev,stealth:A.filter(p=>p.mode==='stealth').length,bots:act.length-A.length},today:{visitors:T.length,devices:dT},
  ren:{status:R.status,ai:R.caps.ai,keySet:!!xaiKey(),today:R.today,month:R.month,caps:R.caps,perHour:R.perHour,firstContacts:R.firstContacts.slice(0,10),notifier:R.notifier,alerts:R.alerts.slice(0,8)},
  rateLimitHitsLastHour:hits,dj:{playing:!!(DJ.playing&&c),title:c?c.title||c.id:null,artist:c&&c.artist||null,listeners:{sse:DJC.size,poll:PULLC.size,total:DJC.size+PULLC.size},live:DJ.live?{since:DJ.live.since}:null,ann:djView(now).ann?{repeats:DJ.ann.repeats,startsAt:DJ.ann.startsAt}:null,lastBc:DJ.lastBc||null},
  server:{uptimeS:Math.round((now-T0)/1000),startedAt:T0,version:ver,node:process.version}}}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.json':'application/json','.css':'text/css','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.md':'text/markdown; charset=utf-8','.geojson':'application/geo+json','.webp':'image/webp','.txt':'text/plain; charset=utf-8'};
https.createServer({key:fs.readFileSync(path.join(certDir,'key.pem')),cert:fs.readFileSync(path.join(certDir,'cert.pem'))},(q,r)=>{
 const u=new URL(q.url,'https://x'),ip=(q.headers['cf-connecting-ip']||q.socket.remoteAddress||'').toString();
 if(!u.pathname.startsWith('/api/')){let dp;try{dp=decodeURIComponent(u.pathname)}catch(e){return r.writeHead(400),r.end()}
  // static allowlist: decoded + normalized + case-insensitive (macOS FS is case-insensitive). Never serve server/, cert/, logs/, dotfiles, db/key/log files.
  const rel=path.posix.normalize('/'+dp.replace(/\\/g,'/')).toLowerCase();
  if(rel.includes('\0')||/(^|\/)(server|cert|logs|node_modules)(\/|$)/.test(rel)||/(^|\/)\./.test(rel)||(!rel.endsWith('/')&&!/\.(html|js|json|png|jpg|jpeg|webp|css|glb|gltf|svg|ico|txt|mp3|wav|m4a|webmanifest|md|geojson)$/.test(rel))||/\.(pem|key|sqlite|log|err|bak.*)$/.test(rel)||/gm-key|config\.json|ed25519/.test(rel))return r.writeHead(404),r.end('not found');
  let f=path.normalize(path.join(root,dp));if(!f.startsWith(path.normalize(root)+path.sep))return r.writeHead(404),r.end();
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  /* caching: HTML no-cache (always revalidate), version.json + sw.js + updater.js no-store, ?v=<build> assets immutable, others ETag revalidation */
  return fs.stat(f,(e,stt)=>{if(e||!stt.isFile()){r.writeHead(404);return r.end('not found')}const ext=path.extname(f).toLowerCase(),base=path.basename(f).toLowerCase(),tag='W/"'+stt.size.toString(36)+'-'+Math.floor(stt.mtimeMs).toString(36)+'"';
   const cc=ext==='.html'?'no-cache':(base==='version.json'||base==='sw.js'||base==='updater.js')?'no-store':u.searchParams.has('v')?'public, max-age=31536000, immutable':'no-cache';
   const h={'content-type':types[ext]||'application/octet-stream','cache-control':cc,'etag':tag};if(base==='sw.js')h['service-worker-allowed']='/';
   if(cc!=='no-store'&&q.headers['if-none-match']===tag){r.writeHead(304,h);return r.end()}
   h['accept-ranges']='bytes';const rg=/^bytes=(\d*)-(\d*)$/.exec(q.headers.range||'');/* d45: byte ranges (Safari <audio> needs 206 to stream/seek the DJ tracks) */
   if(rg&&(rg[1]||rg[2])){let a=rg[1]?+rg[1]:Math.max(0,stt.size-(+rg[2])),z=rg[1]&&rg[2]?Math.min(+rg[2],stt.size-1):stt.size-1;if(a>z||a>=stt.size){r.writeHead(416,{'content-range':'bytes */'+stt.size});return r.end()}
    r.writeHead(206,{...h,'content-range':`bytes ${a}-${z}/${stt.size}`,'content-length':z-a+1});if(q.method==='HEAD')return r.end();return fs.createReadStream(f,{start:a,end:z}).on('error',()=>r.end()).pipe(r)}
   fs.readFile(f,(e2,d)=>{if(e2){r.writeHead(404);return r.end('not found')}r.writeHead(200,{...h,'content-length':d.length});r.end(q.method==='HEAD'?undefined:d)})})}
 // CORS only for the GitHub Pages copy of gm.html -> /api/gm (still needs the X-GM-Key header)
 if(q.headers.origin==='https://newperspectivellc.github.io'&&(u.pathname==='/api/gm'||u.pathname.startsWith('/api/gm/')||u.pathname==='/api/policy'||u.pathname==='/api/figures'||u.pathname==='/api/dj'||u.pathname==='/api/dj/stream'||u.pathname==='/api/dj/live'||u.pathname==='/api/dj/bc'||u.pathname==='/api/dj/pull'||u.pathname==='/api/ren-usage'||u.pathname==='/api/ren-usage/test-notify'||u.pathname==='/api/stats'||u.pathname==='/api/ren'||u.pathname.startsWith('/api/ren/'))){r.setHeader('access-control-allow-origin',q.headers.origin);r.setHeader('vary','Origin');
  if(q.method==='OPTIONS'){r.writeHead(204,{'access-control-allow-headers':'x-gm-key,content-type','access-control-allow-methods':'GET,POST,DELETE','access-control-max-age':'600'});return r.end()}}
 let b='';q.on('data',c=>{b+=c;if(b.length>1e5)q.destroy()});q.on('end',async()=>{let j={};try{j=b?JSON.parse(b):{}}catch(e){}
 try{const now=Date.now(),U=me(q),tok=(q.headers.authorization||'').replace('Bearer ',''),P=tok?one('select * from gplayers where token=?',tok):null;
 if(u.pathname.startsWith('/api/registry')){if(await registry(u,q,r,j,b,U,ip)!==false)return}
 switch(u.pathname){
 // ---- accounts / magic links
 case'/api/auth/request':{const email=(j.email||'').trim().toLowerCase(),phone=(j.phone||'').replace(/[^\d+]/g,'');const addr=email||phone;
  if(!addr||(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))||(phone&&!/^\+\d{8,15}$/.test(phone)))return send(r,{error:'enter a valid email or +E.164 phone'},400);
  if(limited('a:'+addr,5)||limited('i:'+ip,20))return send(r,{error:'too many requests, try later'},429);
  let usr=one(email?'select * from users where email=?':'select * from users where phone=?',addr);
  if(!usr){const id=rid(8);run('insert into users values(?,?,?,?,?,?)',id,(j.name||addr.split('@')[0]).slice(0,24),email||null,phone||null,email&&email===cfg('GM_EMAIL').toLowerCase()?'gm':'player',now);usr=one('select * from users where id=?',id)}
  const t=rid(24),code=String(crypto.randomInt(0,1e6)).padStart(6,'0');run('insert into login_tokens values(?,?,?,?,0)',H(t),usr.id,H(usr.id+code),now+15*60000);
  const link=(cfg('BASE_URL')||('https://'+q.headers.host))+'/api/auth/verify?t='+t+(j.next?'&next='+encodeURIComponent(j.next):'');
  if(email)await sendEmail(email,"Your Live Geometry (Matt's Reality) sign-in link",`Sign in: ${link}\nOr enter code ${code}. Expires in 15 minutes.`);
  else await sendSMS(phone,`Live Geometry code ${code} (15 min). Link: ${link}`);
  return send(r,{ok:1,dev:(email?cfg('MAIL_MODE'):cfg('SMS_MODE'))||'dev'})}
 case'/api/auth/verify':{const t=u.searchParams.get('t')||'';const row=one('select * from login_tokens where hash=? and used=0 and exp>?',H(t),now);
  if(!row){r.writeHead(400,{'content-type':'text/html'});return r.end('Link expired or already used. <a href=/login.html>Try again</a>')}
  run('update login_tokens set used=1 where hash=?',row.hash);const nx=u.searchParams.get('next')||'/';return newSession(r,row.user_id,nx.startsWith('/')?nx:'/')}
 case'/api/auth/code':{const addr=(j.email||j.phone||'').trim().toLowerCase();if(limited('c:'+addr,8)||limited('ci:'+ip,30))return send(r,{error:'too many tries'},429);
  const usr=one('select * from users where email=? or phone=?',addr,addr);const row=usr&&one('select * from login_tokens where user_id=? and code_hash=? and used=0 and exp>?',usr.id,H(usr.id+String(j.code||'')),now);
  if(!row)return send(r,{error:'wrong or expired code'},400);run('update login_tokens set used=1 where hash=?',row.hash);return newSession(r,usr.id)}
 case'/api/auth/logout':{const s=cookies(q).sid;if(s)run('delete from sessions where hash=?',H(s));return send(r,{ok:1},200,{'set-cookie':'sid=; Max-Age=0; Path=/; HttpOnly; Secure'})}
 case'/api/me':return send(r,{user:U})
 // ---- GM: users & roles
 case'/api/users':{if(U?.role!=='gm')return send(r,{error:'gm only'},403);if(q.method==='POST'&&j.id&&['player','host','gm'].includes(j.role))run('update users set role=? where id=?',j.role,j.id);
  return send(r,{users:all('select id,display_name,email,phone,role from users order by created desc')})}
 // ---- games
 case'/api/games':{if(q.method==='POST'){if(!U||!['host','gm'].includes(U.role))return send(r,{error:'host permission needed'},403);
   const id=rid(6),code=crypto.randomBytes(4).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g,'X').slice(0,6);
   run('insert into games values(?,?,?,?,?,?)',id,String(j.name||'New game').slice(0,40),U.id,code,JSON.stringify({teamOnly:false}),now);return send(r,{game:one('select * from games where id=?',id)})}
  if(!U||!['host','gm'].includes(U.role))return send(r,{error:'host permission needed'},403);
  return send(r,{games:U.role==='gm'?all('select * from games order by created desc'):all('select * from games where owner=? order by created desc',U.id)})}
 case'/api/game':{const g=gameByCode(u.searchParams.get('code')||j.code);if(!g)return send(r,{error:'no such game'},404);
  if(q.method==='POST'){if(!canManage(U,g))return send(r,{error:'not your game'},403);const s=settings(g);if('teamOnly'in j)s.teamOnly=!!j.teamOnly;if(j.name)run('update games set name=? where id=?',String(j.name).slice(0,40),g.id);run('update games set settings=? where id=?',JSON.stringify(s),g.id)}
  const g2=one('select * from games where id=?',g.id);const out={id:g2.id,name:g2.name,code:g2.code,settings:settings(g2)};
  if(canManage(U,g2)){out.teams=all('select * from teams where game_id=?',g2.id);out.players=all('select * from gplayers where game_id=? order by joined desc',g2.id).map(pubP).map((p,i)=>p)}
  return send(r,out)}
 case'/api/teams':{const g=gameByCode(j.game);if(!canManage(U,g))return send(r,{error:'not your game'},403);
  if(j.delete)run('delete from teams where id=? and game_id=?',j.delete,g.id),run('update gplayers set team_id=null where team_id=?',j.delete);
  else run('insert into teams values(?,?,?,?)',rid(5),g.id,String(j.name||'Team').slice(0,24),/^#[0-9a-f]{6}$/i.test(j.color)?j.color:'#ff8800');return send(r,{teams:all('select * from teams where game_id=?',g.id)})}
 case'/api/assign':{const p=one('select * from gplayers where id=?',j.player);const g=p&&one('select * from games where id=?',p.game_id);if(!canManage(U,g))return send(r,{error:'not your game'},403);
  run('update gplayers set team_id=? where id=?',j.team||null,p.id);return send(r,{ok:1})}
 // ---- players (consent per game)
 case'/api/join':{if(CONSENT_REQUIRED&&j.consent!==true)return send(r,{error:'consent required'},400);const g=gameByCode(j.game);if(!g)return send(r,{error:'no such game'},404);
  if(limited('j:'+ip,30))return send(r,{error:'too many joins'},429);
  const dev=devOf(j.device,q.headers['user-agent']),wantS=j.mode==='stealth',okS=wantS&&stealthOk(dev);
  const id=rid(6),token=rid(24);run('insert into gplayers(id,game_id,user_id,token,name,mode,entrance,team_id,joined,live,seen) values(?,?,?,?,?,?,?,?,?,1,?)',id,g.id,U&&U.id!=='gm'?U.id:null,token,String(j.name||U?.display_name||'Player').slice(0,24),okS?'stealth':'regular',['walk','jump','dance','run'].includes(j.entrance)?j.entrance:'walk',null,now,now);
  run('update gplayers set device=? where id=?',dev,id);
  return send(r,{id,token,device:dev,mode:okS?'stealth':'regular',...(wantS&&!okS?{stealthDenied:true,warning:STEALTH_WARN[dev]||STEALTH_WARN.desktop}:{}),policy:getPol(),game:{id:g.id,name:g.name,code:g.code}})}
 case'/api/pos':{if(!P||!P.live)return send(r,{error:'not joined'},401);const lat=+j.lat,lon=+j.lon,acc=+j.acc||0;if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90)return send(r,{error:'bad'},400);
  if(limited('p:'+P.id,150,60000))return send(r,{error:'slow down'},429);/* >=1/s ping + 3 s tick */const hdg=isFinite(+j.hdg)&&j.hdg!==null&&j.hdg!==''?((+j.hdg%360)+360)%360:null;run('insert into gfixes(pid,lat,lon,acc,t,hdg) values(?,?,?,?,?,?)',P.id,lat,lon,acc,now,hdg);run('update gplayers set seen=? where id=?',now,P.id);return send(r,{ok:1,t:now,team:teamOf(P.team_id)})}
 case'/api/players':{if(!P||!P.live)return send(r,{error:'not joined'},401);const g=one('select * from games where id=?',P.game_id),s=settings(g);
  const pol=getPol(),see=!!pol.canSee[polClass(P.device)];
  let L=all('select * from gplayers where game_id=? and live=1 and id<>? and seen>?',P.game_id,P.id,now-LIVE_MS).filter(o=>o.mode!=='stealth'||see);
  if(s.teamOnly)L=L.filter(o=>P.team_id&&o.team_id===P.team_id);// team-only: only teammates; no team => see nobody
  return send(r,{me:{team:teamOf(P.team_id),device:P.device,mode:P.mode},seeStealth:see,policy:pol,teamOnly:!!s.teamOnly,players:L.map(pubP)})}
 case'/api/mode':{if(!P||!P.live)return send(r,{error:'not joined'},401);let m=j.mode==='stealth'?'stealth':'regular';const dev=P.device||devOf(j.device,q.headers['user-agent']);if(m==='stealth'&&!stealthOk(dev)){run("update gplayers set mode='regular' where id=?",P.id);return send(r,{ok:0,mode:'regular',stealthDenied:true,warning:STEALTH_WARN[dev]||STEALTH_WARN.desktop})}run('update gplayers set mode=? where id=?',m,P.id);return send(r,{ok:1,mode:m})}
 case'/api/policy':return send(r,{policy:getPol()})
 /* public read-only figure feed for figures.html: server-side bots + TEST ghosts + a COUNT of live human players (never their positions).
    Matt's Shadow follows Matt's real fix, so only its status is published; ghosts parked at a non-landmark (custom) target are hidden too. */
 case'/api/figures':{if(q.method!=='GET')return send(r,{error:'GET only'},405);if(limited('gf:'+ip,120,60000))return send(r,{error:'rate limited'},429);
  const lmk=(la,lo)=>GH_LOCAL.find(x=>Math.abs(x[1]-la)<5e-4&&Math.abs(x[2]-lo)<5e-4);const cut=now-LIVE_MS;
  const bots=Object.entries(BOTS).map(([n,d])=>{const s=BS[n]||{},o={id:n,kind:d.kind,group:d.group||null,ray:d.ang??null,style:s.style||'default',paused:!!s.paused,hidden:!!s.hidden};
   if(d.kind==='shadow')return{...o,private:true,frozen:!!s.frozen,note:"follows Matt Ready's live fix + 20-60 m offset; position not published"};
   return{...o,lat:s.lat,lon:s.lon,anchor:{lat:s.alat,lon:s.alon},heading:s.hdg}});
  const ghosts=Object.entries(GHOSTS).map(([n,d])=>{const s=GS[n]||{},L=lmk(s.tlat,s.tlon),o={id:n,wander:!!s.wander,wanderMaxM:150,live:true};
   return L?{...o,lat:s.lat,lon:s.lon,target:{lat:s.tlat,lon:s.tlon,place:s.place}}:{...o,private:true,note:'parked at a custom (non-landmark) spot; position not published'}});
  const HP=all('select id,device,mode from gplayers where live=1 and seen>?',cut).filter(p=>!isGhost(p.id)&&!isBot(p.id));const byDev={};for(const p of HP)byDev[p.device||'unknown']=(byDev[p.device||'unknown']||0)+1;
  return send(r,{t:now,pillars:pillarsPub(),edge:{lat:EDGE.lat,lon:EDGE.lon,r:EDGE.r,name:EDGE.name},bots,ghosts,players:{live:HP.length,byDevice:byDev,windowMs:LIVE_MS},renDances:Object.keys(REND)})}
// ---- d45 Master DJ: public read + SSE; writes need the GM key
 case'/api/dj':{if(q.method==='GET'){if(limited('dj:'+ip,240,60000))return send(r,{error:'rate limited'},429);return send(r,djView(now))}
  if(q.method!=='POST')return send(r,{error:'GET or POST'},405);if(limited('djw:'+ip,120,60000))return send(r,{error:'rate limited'},429);
  if(!isKeyGM(U)){audit(ip,'dj-denied',{op:j.op});return send(r,{error:'GM key required (X-GM-Key)'},403)}
  const e=djOp(j,now);if(e)return send(r,{error:e,state:djView(now)},400);audit(ip,'dj-'+j.op,{id:j.id,qid:j.qid,to:j.to});return send(r,djView(now))}
 case'/api/dj/live':{if(q.method!=='POST')return send(r,{error:'POST'},405);if(limited('djl:'+ip,600,60000))return send(r,{error:'rate limited'},429);
  if(!isKeyGM(U)){audit(ip,'djlive-denied',{op:j.op});return send(r,{error:'GM key required (X-GM-Key)'},403)}
  const e=liveOp(j,now);if(e)return send(r,{error:e},400);if(j.op!=='chunk')audit(ip,'djlive-'+j.op,{id:j.id||null,repeats:j.repeats||null});return send(r,j.op==='chunk'?{ok:1,t:now}:djView(now))}
 case'/api/dj/pull':{if(limited('djp:'+ip,1200,60000))return send(r,{error:'rate limited'},429);PULLC.set(crypto.createHash('sha1').update(ip+'|'+(q.headers['user-agent']||'')).digest('hex').slice(0,12),Date.now());const after=Math.floor(+u.searchParams.get('after')),rev0=Math.floor(+u.searchParams.get('rev'));
  const reply=()=>{const n=Date.now();return send(r,{gs:PGS,rev:DJ.rev,t:n,live:DJ.live?DJ.live.id:null,pcm:after>=0?PCMR.filter(x=>x.gs>after):[]})};
  if(!(after>=0)||PCMR.some(x=>x.gs>after)||(rev0>=0&&rev0!==DJ.rev)||PULLW.size>=500)return reply();
  let done=false;const fin=()=>{if(done)return;done=true;PULLW.delete(fin);clearTimeout(to);reply()},to=setTimeout(fin,12000);PULLW.add(fin);/* r (response) 'close' = client went away; q's 'close' fires as soon as the GET body is read, which would drop the reply */r.on('close',()=>{if(done)return;done=true;PULLW.delete(fin);clearTimeout(to)});return}
 case'/api/dj/bc':{const id=String(u.searchParams.get('id')||'');if(id==='list')return send(r,{list:bcList().slice(0,20).map(x=>({id:x.id,at:x.m,dur:Math.round((x.size-44)/32000*10)/10}))});
  if(!/^[a-z0-9]+$/.test(id))return send(r,{error:'id'},400);const fp=path.join(BCD,id+'.wav');if(!fs.existsSync(fp))return send(r,{error:'not found'},404);
  const d=fs.readFileSync(fp);r.writeHead(200,{'content-type':'audio/wav','content-length':d.length,'cache-control':'public, max-age=86400'});return r.end(d)}
 case'/api/dj/stream':{if(limited('djs:'+ip,30,60000)||DJC.size>=500)return send(r,{error:'rate limited'},429);
  r.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','x-accel-buffering':'no'});r.flushHeaders&&r.flushHeaders();r.write(': '+' '.repeat(2048)+'\n\n');
  r.write('event: dj\ndata: '+JSON.stringify(djView(now))+'\n\n');DJC.add(r);const ka=setInterval(()=>{try{r.write('event: t\ndata: '+Date.now()+'\n\n')}catch(e){}},20000),stop=setTimeout(()=>r.end(),30*60000);
  q.on('close',()=>{DJC.delete(r);clearInterval(ka);clearTimeout(stop)});return}
 case'/api/ren-usage':{if(limited('gmru:'+ip,120,60000))return send(r,{error:'rate limited'},429);if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);
  if(q.method==='POST'){try{const v=RG.edit(j||{});audit(ip,'ren-usage-edit',{ai:j.ai,dailyUSD:j.dailyUSD,monthlyUSD:j.monthlyUSD});return send(r,v)}catch(e){return send(r,{error:e.message},400)}}return send(r,RG.view(now))}
 case'/api/ren-usage/test-notify':{if(q.method!=='POST')return send(r,{error:'POST'},405);if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);if(limited('rtn:'+ip,5,600000))return send(r,{error:'rate limited (5 per 10 min)'},429);
  const x=await RG.notify({who:'Test notification',device:'GM page',time:RG.ptTime(now),event:'talking to Ren',message:'This is a test from the Live Geometry GM page.'});audit(ip,'ren-test-notify',{ok:x.ok});return send(r,x)}
 case'/api/stats':{if(limited('gmst:'+ip,120,60000))return send(r,{error:'rate limited'},429);if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);return send(r,statsView(now))}
 case'/api/ren':{if(q.method!=='POST')return send(r,{error:'POST {message, history?}'},405);
  if(limited('ren:'+ip,10,60000)||limited('rend:'+ip,200,86400000))return send(r,{error:'Ren needs a breather: too many messages, try again in a minute.'},429);
  const msg=String(j.message||'').trim();if(!msg)return send(r,{error:'message required'},400);if(msg.length>500)return send(r,{error:'message too long (max 500 chars)'},400);
  const ua=String(q.headers['user-agent']||''),dev=/OculusBrowser|Quest/i.test(ua)?'quest':/iPhone|Android.*Mobile|Mobile.*Android/i.test(ua)?'phone':/iPad|Android/i.test(ua)?'tablet':'desktop';
  const g=RG.gate(ip,j.playerName);RG.firstContact(g.pid,j.playerName,dev,msg);if(g.canned)return send(r,{reply:g.canned,fallback:'resting',why:g.why});
  const key=xaiKey();if(!key){RG.record({pid:g.pid,model:'-',status:'canned-nokey',ms:0});return send(r,{reply:"Ren is meditating right now (the AI key isn't set up on the server yet). Try again soon!",fallback:'key missing'},503)}const tq=Date.now(),mdl=REN_MODEL();
  const renCtx=j=>{const c=j.context&&typeof j.context==='object'?j.context:{},cl=v=>String(v||'').replace(/[^\w .,'’:-]/g,'').slice(0,40);const nm=cl(j.playerName),td=cl(c.timeOfDay);return(nm?`\nThe visitor talking to you calls themselves "${nm}".`:'')+(td?`\nLocal time of day: ${td}.`:'')};
  const hist=(Array.isArray(j.history)?j.history:[]).slice(-6).filter(h=>h&&(h.role==='user'||h.role==='assistant')&&typeof h.content==='string').map(h=>({role:h.role,content:h.content.slice(0,500)}));
  try{const x=await fetch(process.env.REN_XAI_URL||'https://api.x.ai/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},signal:AbortSignal.timeout(15000),
    body:JSON.stringify({model:mdl,max_tokens:g.maxTokens,temperature:.7,messages:[{role:'system',content:REN_SYS+renCtx(j)},...hist,{role:'user',content:msg}]})});
   const d=await x.json().catch(()=>({}));if(!x.ok){RG.record({pid:g.pid,model:mdl,status:'error-'+x.status,usage:d&&d.usage,ms:Date.now()-tq});console.error('ren upstream',x.status,(d&&d.error&&(d.error.message||d.error))||'');return send(r,{reply:"Ren's signal is fuzzy right now. Try again in a moment.",fallback:'upstream '+x.status},502)}
   RG.record({pid:g.pid,model:String(d.model||mdl).slice(0,64),status:'ok',usage:d.usage,ms:Date.now()-tq});const reply=String(d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||'').trim().slice(0,1200);return send(r,{reply:reply||'…',model:mdl})}
  catch(e){RG.record({pid:g.pid,model:mdl,status:e.name==='TimeoutError'?'error-timeout':'error',ms:Date.now()-tq});return send(r,{reply:"Ren's signal is fuzzy right now. Try again in a moment.",fallback:e.name==='TimeoutError'?'timeout':'error'},504)}}
 case'/api/ren/dance':{const tid=String(u.searchParams.get('trackId')||j.trackId||'');if(!/^[A-Za-z0-9_.-]{1,64}$/.test(tid))return send(r,{error:'trackId must be 1-64 chars [A-Za-z0-9_.-]'},400);
  if(q.method==='GET'){if(limited('rdg:'+ip,120,60000))return send(r,{error:'rate limited'},429);return REND[tid]?send(r,{trackId:tid,choreo:REND[tid].choreo,saved:REND[tid].t}):send(r,{error:'no dance saved for this track'},404)}
  if(q.method==='DELETE'){if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);const had=!!REND[tid];delete REND[tid];renSave();audit(ip,'ren-dance-reset',{tid});return send(r,{ok:1,deleted:had})}
  if(q.method==='POST'){if(limited('rdp:'+ip,10,60000))return send(r,{error:'rate limited'},429);const c=j.choreo;if(!c||typeof c!=='object'||Array.isArray(c))return send(r,{error:'choreo must be a JSON object'},400);
   const sz=Buffer.byteLength(JSON.stringify(c));if(sz>20480)return send(r,{error:'choreo too large (max 20 KB)'},413);
   if(REND[tid])return send(r,{ok:0,exists:true,trackId:tid,choreo:REND[tid].choreo,saved:REND[tid].t});/* first save wins */
   REND[tid]={choreo:c,t:Date.now(),ip:crypto.createHash('sha256').update(ip).digest('hex').slice(0,8)};renSave();return send(r,{ok:1,trackId:tid,saved:REND[tid].t})}
  return send(r,{error:'GET, POST or DELETE'},405)}
 case'/api/gm/ren-dances':{if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);return send(r,{dances:Object.entries(REND).map(([k,v])=>({trackId:k,saved:v.t,bytes:Buffer.byteLength(JSON.stringify(v.choreo))}))})}
 case'/api/leave':{if(P)run('update gplayers set live=0 where id=?',P.id);return send(r,{ok:1})}
 case'/api/delete':{if(P){run('delete from gfixes where pid=?',P.id);run('delete from gplayers where id=?',P.id)}return send(r,{ok:1})}
 // ---- read-only GM watcher (GM key header only; watcher never joins, so it never appears as a player)
 case'/api/gm/snapshot':{if(q.method!=='GET')return send(r,{error:'GET only'},405);if(limited('gw:'+ip,240,60000))return send(r,{error:'rate limited'},429);
  if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);return send(r,gmSnap(u))}
 case'/api/gm/stream':{if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);if(limited('gs:'+ip,30,60000))return send(r,{error:'rate limited'},429);
  r.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','x-accel-buffering':'no'});r.flushHeaders&&r.flushHeaders();r.write(': '+' '.repeat(2048)+'\n\n');
  const iv=Math.max(1000,Math.min(30000,+u.searchParams.get('every')||3000));const push=()=>{try{r.write('event: snapshot\ndata: '+JSON.stringify(gmSnap(u))+'\n\n')}catch(e){}};push();
  const h=setInterval(push,iv),ka=setInterval(()=>r.write(': ka\n\n'),15000),stop=setTimeout(()=>r.end(),30*60000);q.on('close',()=>{clearInterval(h);clearInterval(ka);clearTimeout(stop)});return}
 // ---- GM ghost control: GET states; POST {id,lat,lon} | {id,place} | {id,wander:false}
 case'/api/gm/ghost':{if(limited('gg:'+ip,60,60000))return send(r,{error:'rate limited'},429);if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);
  if(q.method==='POST'){const n=Object.keys(GHOSTS).find(k=>k.toLowerCase()===String(j.id||'').toLowerCase());if(!n)return send(r,{error:'id must be Ghost-1 or Ghost-2'},400);const s=GS[n];
   let la=+j.lat,lo=+j.lon,pl=null;if(j.place){const g=await ghGeo(String(j.place).slice(0,200)).catch(()=>null);if(!g)return send(r,{error:'place not found'},404);la=g.lat;lo=g.lon;pl=g.name}
   if(j.place||j.lat!=null){if(!isFinite(la)||!isFinite(lo)||Math.abs(la)>90||Math.abs(lo)>180)return send(r,{error:'bad lat/lon'},400);s.tlat=la;s.tlon=lo;s.lat=la;s.lon=lo;s.place=pl||la.toFixed(6)+','+lo.toFixed(6)}
   if('wander'in j)s.wander=j.wander!==false;else if(j.place||j.lat!=null)s.wander=true;s.updated=now;ghSave();ghStep(n)}
  return send(r,ghState())}
 case'/api/gm/policy':{if(limited('gp:'+ip,60,60000))return send(r,{error:'rate limited'},429);if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);
  if(q.method==='POST'){const P2=setPol(j.policy||j);audit(ip,'stealth-policy',P2);/* demote stealth players whose device may no longer go stealth */for(const p of all("select id,device from gplayers where mode='stealth' and live=1"))if(!P2.canGoStealth[polClass(p.device)])run("update gplayers set mode='regular' where id=?",p.id);return send(r,{policy:P2})}
  return send(r,{policy:getPol(),defaults:POL_DEF})}
 case'/api/gm/bots':{if(limited('gb:'+ip,60,60000))return send(r,{error:'rate limited'},429);if(!isKeyGM(U))return send(r,{error:'GM key required (X-GM-Key)'},403);
  if(q.method==='POST'){
   if(j.edge&&typeof j.edge==='object'){const la=+j.edge.lat,lo=+j.edge.lon,rr=j.edge.r==null?EDGE.r:+j.edge.r;if(!(Math.abs(la-48.1)<1&&Math.abs(lo+122.8)<1&&rr>=1&&rr<=200))return send(r,{error:'edge anchor must be near Port Townsend, r 1-200 m'},400);Object.assign(EDGE,{lat:la,lon:lo,r:rr},j.edge.name?{name:String(j.edge.name).slice(0,120)}:{});audit(ip,'gm-edge-anchor',JSON.stringify(EDGE))}
   const N=j.group?Object.keys(BOTS).filter(k=>BOTS[k].group===j.group):[Object.keys(BOTS).find(k=>k.toLowerCase()===String(j.id||'').toLowerCase())].filter(Boolean);if(!N.length&&!j.edge)return send(r,{error:'unknown bot'},400);
   if(j.style!=null&&!BOT_STYLES.includes(j.style))return send(r,{error:'style must be one of '+BOT_STYLES.join(', ')},400);
   for(const n of N){const s=BS[n];if('paused'in j)s.paused=!!j.paused;if(j.style)s.style=j.style;if('hidden'in j){s.hidden=!!j.hidden;run('update gplayers set live=? where id=?',s.hidden?0:1,BOTS[n].pid)}}
   if(j.edge)for(const n of Object.keys(BOTS))if(BOTS[n].group==='edge')[BS[n].lat,BS[n].lon]=fixPos(BOTS[n]);
   btSave();for(const n of Object.keys(BOTS))if(!BS[n].hidden&&(N.includes(n)||j.edge&&BOTS[n].group==='edge'))btStep(n)}
  return send(r,btState())}
 // ---- GM/host live map: GM sees all games, host sees own games
 case'/api/gm':{if(!U||!['gm','host'].includes(U.role))return send(r,{error:'bad key'},403);const gid=u.searchParams.get('game');
  let G=U.role==='gm'?all('select * from games'):all('select * from games where owner=?',U.id);if(gid)G=G.filter(g=>g.id===gid);const ids=G.map(g=>g.id);
  const L=all('select * from gplayers where live=1 and seen>?',now-LIVE_MS).filter(p=>ids.includes(p.game_id));
  return send(r,{games:G.map(g=>({id:g.id,name:g.name,code:g.code})),players:L.map(p=>({...pubP(p),track:u.searchParams.get('trails')?all('select lat,lon,acc,t from gfixes where pid=? order by t desc limit 500',p.id).reverse():undefined}))})}
 default:send(r,{error:'no'},404)}}catch(e){console.error(e);send(r,{error:'server'},500)}})}).listen(+port,'0.0.0.0',()=>console.log("Live Geometry — Matt's Reality server listening",port));
