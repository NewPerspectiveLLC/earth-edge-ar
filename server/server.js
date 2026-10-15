// Earth Edge AR server v2: static + API. node server.js <webroot> <certdir> <port>
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
try{sq.exec('alter table gfixes add column hdg real')}catch(e){}// heading (deg true, from client camera) - optional
// default public game so the plain link still works
if(!sq.prepare("select 1 from games where id='public'").get())sq.prepare("insert into games values('public','Open game','gm','OPEN','{}',?)").run(Date.now());
const H=s=>crypto.createHash('sha256').update(String(s)).digest('hex'),rid=n=>crypto.randomBytes(n).toString('hex');
const one=(s,...a)=>sq.prepare(s).get(...a),all=(s,...a)=>sq.prepare(s).all(...a),run=(s,...a)=>sq.prepare(s).run(...a);
const LIVE_MS=60000;
const send=(r,o,c=200,h={})=>{r.writeHead(c,{'content-type':'application/json','cache-control':'no-store',...h});r.end(JSON.stringify(o))};
// --- rate limit: sliding window per key
const RL={};function limited(k,max,ms=900000){const n=Date.now();RL[k]=(RL[k]||[]).filter(t=>n-t<ms);if(RL[k].length>=max)return true;RL[k].push(n);return false}
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
const pubP=p=>({id:p.id,name:p.name,mode:p.mode,entrance:p.entrance,team:teamOf(p.team_id),last:lastFix(p.id),game_id:p.game_id,...(isGhost(p.id)?{dummy:true}:{})});
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
 const body=JSON.stringify({id:instId,name:cfg('INSTANCE_NAME')||'Earth Edge AR',url:cfg('BASE_URL'),owner:cfg('INSTANCE_OWNER')||'',area:cfg('INSTANCE_AREA')||'',lat:+cfg('INSTANCE_LAT')||null,lon:+cfg('INSTANCE_LON')||null,pubkey:ID.pub,stats:stats(),ts:Date.now(),nonce:rid(12)});
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
   stealth:p.mode==='stealth',live:!!p.live,dummy:isGhost(p.id),entrance:p.entrance,team:t?{id:t.id,name:t.name,color:t.color}:null,game:{id:p.game_id,name:g.name||null,code:g.code||null}}})}}
// ---- ghosts: two always-live dummy players in the public game; wander (random walk, ~0.8-3 m/s, <=150 m) around a target; fix + seen every 2 s
const GHF=path.join(__dirname,'ghosts.json'),GS={},MLAT=111320;try{Object.assign(GS,JSON.parse(fs.readFileSync(GHF,'utf8')))}catch(e){}
const ghSave=()=>{try{fs.writeFileSync(GHF,JSON.stringify(Object.fromEntries(Object.entries(GS).map(([n,s])=>[n,{tlat:s.tlat,tlon:s.tlon,place:s.place,wander:s.wander,updated:s.updated}]))),{mode:0o600})}catch(e){console.error('ghosts save',e.message)}};
for(const[n,d]of Object.entries(GHOSTS)){const s=GS[n]=Object.assign({tlat:d.lat,tlon:d.lon,place:d.place,wander:true,updated:Date.now()},GS[n]||{});s.lat=s.tlat;s.lon=s.tlon;s.hdg=Math.random()*360;s.spd=1.5;
 if(!one('select 1 from gplayers where id=?',d.pid))run('insert into gplayers values(?,?,?,?,?,?,?,?,?,1,?)',d.pid,'public',null,rid(24),n,'regular','walk',null,Date.now(),Date.now());
 else run("update gplayers set name=?,game_id='public',live=1,mode='regular' where id=?",n,d.pid)}
function ghStep(n){const d=GHOSTS[n],s=GS[n],now=Date.now();
 if(s.wander){const k=Math.cos(s.tlat*D2)*MLAT;let dy=(s.lat-s.tlat)*MLAT,dx=(s.lon-s.tlon)*k;s.hdg=(s.hdg+(Math.random()-.5)*60+360)%360;
  if(Math.hypot(dx,dy)>110){const back=(Math.atan2(-dx,-dy)/D2+360)%360,df=((back-s.hdg+540)%360)-180;s.hdg=(s.hdg+df*.5+360)%360}
  s.spd=Math.max(.8,Math.min(3,s.spd+(Math.random()-.5)*.6));dy+=Math.cos(s.hdg*D2)*s.spd*2;dx+=Math.sin(s.hdg*D2)*s.spd*2;
  const rr=Math.hypot(dx,dy);if(rr>150){dx*=150/rr;dy*=150/rr}s.lat=s.tlat+dy/MLAT;s.lon=s.tlon+dx/k}else{s.lat=s.tlat;s.lon=s.tlon}
 run('insert into gfixes(pid,lat,lon,acc,t,hdg) values(?,?,?,?,?,?)',d.pid,s.lat,s.lon,5,now,s.wander?s.hdg:null);run("update gplayers set seen=?,live=1,mode='regular' where id=?",now,d.pid)}
let ghPrune=0;setInterval(()=>{try{for(const n in GHOSTS)ghStep(n);const now=Date.now();if(now-ghPrune>600000){ghPrune=now;for(const d of Object.values(GHOSTS))run('delete from gfixes where pid=? and t<?',d.pid,now-3600000)}}catch(e){console.error('ghosts',e.message)}},2000);
const GH_LOCAL=[['ready athletics',48.11035,-122.80591],["cappy",48.13165,-122.79921],['meditation garden',48.1316475,-122.7992293],["memory's vault",48.1384642,-122.7647029],['memorys vault',48.1384642,-122.7647029],['city hall',48.1161771,-122.753612],['sheriff',48.0241638,-122.764488],['jefferson healthcare',48.1060007,-122.7889962],['masonic',48.1139683,-122.7628233]];
async function ghGeo(qs){const l=qs.toLowerCase(),hit=GH_LOCAL.find(x=>l.includes(x[0]));if(hit)return{lat:hit[1],lon:hit[2],name:qs+' (app landmark)'};
 const f=b=>fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&viewbox=-122.95,48.20,-122.60,47.95'+(b?'&bounded=1':'')+'&q='+encodeURIComponent(qs),{headers:{'user-agent':'EarthEdgeAR/1 (GM ghost test fixtures)','accept-language':'en'},signal:AbortSignal.timeout(10000)}).then(x=>x.json()).then(a=>a&&a[0]);
 const h=await f(1)||await f(0);return h?{lat:+h.lat,lon:+h.lon,name:h.display_name}:null}
const ghState=()=>({ghosts:Object.entries(GHOSTS).map(([n,d])=>{const s=GS[n];return{id:n,pid:d.pid,dummy:true,lat:s.lat,lon:s.lon,heading:s.wander?s.hdg:null,wander:s.wander,target:{lat:s.tlat,lon:s.tlon,place:s.place},updated:s.updated}})});
const types={'.html':'text/html','.js':'text/javascript','.png':'image/png','.json':'application/json','.css':'text/css'};
https.createServer({key:fs.readFileSync(path.join(certDir,'key.pem')),cert:fs.readFileSync(path.join(certDir,'cert.pem'))},(q,r)=>{
 const u=new URL(q.url,'https://x'),ip=(q.headers['cf-connecting-ip']||q.socket.remoteAddress||'').toString();
 if(!u.pathname.startsWith('/api/')){let dp;try{dp=decodeURIComponent(u.pathname)}catch(e){return r.writeHead(400),r.end()}
  // static allowlist: decoded + normalized + case-insensitive (macOS FS is case-insensitive). Never serve server/, cert/, logs/, dotfiles, db/key/log files.
  const rel=path.posix.normalize('/'+dp.replace(/\\/g,'/')).toLowerCase();
  if(rel.includes('\0')||/(^|\/)(server|cert|logs|node_modules)(\/|$)/.test(rel)||/(^|\/)\./.test(rel)||(!rel.endsWith('/')&&!/\.(html|js|json|png|jpg|jpeg|webp|css|glb|gltf|svg|ico|txt|mp3|wav)$/.test(rel))||/\.(pem|key|sqlite|log|err|bak.*)$/.test(rel)||/gm-key|config\.json|ed25519/.test(rel))return r.writeHead(404),r.end('not found');
  let f=path.normalize(path.join(root,dp));if(!f.startsWith(path.normalize(root)+path.sep))return r.writeHead(404),r.end();
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  return fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('not found')}r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});r.end(d)})}
 // CORS only for the GitHub Pages copy of gm.html -> /api/gm (still needs the X-GM-Key header)
 if(q.headers.origin==='https://newperspectivellc.github.io'&&u.pathname==='/api/gm'){r.setHeader('access-control-allow-origin',q.headers.origin);r.setHeader('vary','Origin');
  if(q.method==='OPTIONS'){r.writeHead(204,{'access-control-allow-headers':'x-gm-key','access-control-allow-methods':'GET','access-control-max-age':'600'});return r.end()}}
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
  if(email)await sendEmail(email,'Your Earth Edge AR sign-in link',`Sign in: ${link}\nOr enter code ${code}. Expires in 15 minutes.`);
  else await sendSMS(phone,`Earth Edge AR code ${code} (15 min). Link: ${link}`);
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
  const id=rid(6),token=rid(24);run('insert into gplayers values(?,?,?,?,?,?,?,?,?,1,?)',id,g.id,U&&U.id!=='gm'?U.id:null,token,String(j.name||U?.display_name||'Player').slice(0,24),j.mode==='stealth'?'stealth':'regular',['walk','jump','dance','run'].includes(j.entrance)?j.entrance:'walk',null,now,now);
  return send(r,{id,token,game:{id:g.id,name:g.name,code:g.code}})}
 case'/api/pos':{if(!P||!P.live)return send(r,{error:'not joined'},401);const lat=+j.lat,lon=+j.lon,acc=+j.acc||0;if(!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90)return send(r,{error:'bad'},400);
  if(limited('p:'+P.id,40,60000))return send(r,{error:'slow down'},429);const hdg=isFinite(+j.hdg)&&j.hdg!==null&&j.hdg!==''?((+j.hdg%360)+360)%360:null;run('insert into gfixes(pid,lat,lon,acc,t,hdg) values(?,?,?,?,?,?)',P.id,lat,lon,acc,now,hdg);run('update gplayers set seen=? where id=?',now,P.id);return send(r,{ok:1,team:teamOf(P.team_id)})}
 case'/api/players':{if(!P||!P.live)return send(r,{error:'not joined'},401);const g=one('select * from games where id=?',P.game_id),s=settings(g);
  let L=all('select * from gplayers where game_id=? and live=1 and id<>? and mode<>? and seen>?',P.game_id,P.id,'stealth',now-LIVE_MS);
  if(s.teamOnly)L=L.filter(o=>P.team_id&&o.team_id===P.team_id);// team-only: only teammates; no team => see nobody
  return send(r,{me:{team:teamOf(P.team_id)},teamOnly:!!s.teamOnly,players:L.map(pubP)})}
 case'/api/mode':{if(!P||!P.live)return send(r,{error:'not joined'},401);const m=j.mode==='stealth'?'stealth':'regular';run('update gplayers set mode=? where id=?',m,P.id);return send(r,{ok:1,mode:m})}
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
 // ---- GM/host live map: GM sees all games, host sees own games
 case'/api/gm':{if(!U||!['gm','host'].includes(U.role))return send(r,{error:'bad key'},403);const gid=u.searchParams.get('game');
  let G=U.role==='gm'?all('select * from games'):all('select * from games where owner=?',U.id);if(gid)G=G.filter(g=>g.id===gid);const ids=G.map(g=>g.id);
  const L=all('select * from gplayers where live=1 and seen>?',now-LIVE_MS).filter(p=>ids.includes(p.game_id));
  return send(r,{games:G.map(g=>({id:g.id,name:g.name,code:g.code})),players:L.map(p=>({...pubP(p),track:u.searchParams.get('trails')?all('select lat,lon,acc,t from gfixes where pid=? order by t desc limit 500',p.id).reverse():undefined}))})}
 default:send(r,{error:'no'},404)}}catch(e){console.error(e);send(r,{error:'server'},500)}})}).listen(+port,'0.0.0.0',()=>console.log('listening',port));
