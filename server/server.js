// Earth Edge AR game server: static files + private multiplayer API. Usage: node server.js <webroot> <certdir> <port>
// Stores ONLY: display name, mode, entrance, and position fixes (lat, lon, accuracy, timestamp).
const https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const[root,certDir,port]=process.argv.slice(2);
const GM_KEY=(process.env.EEAR_GM_KEY||fs.readFileSync(path.join(__dirname,'gm-key.txt'),'utf8')).trim();
// SQLite (node:sqlite): players table + fixes table. In-memory mirror for fast reads.
const{DatabaseSync}=require('node:sqlite');const sq=new DatabaseSync(path.join(__dirname,'eear.sqlite'));
sq.exec("create table if not exists players(id text primary key,token text,name text,mode text,entrance text,joined int,live int,seen int);create table if not exists fixes(pid text,lat real,lon real,acc real,t int);create index if not exists fx on fixes(pid,t)");
let db={players:{}};for(const p of sq.prepare('select * from players').all()){p.live=!!p.live;p.track=sq.prepare('select lat,lon,acc,t from fixes where pid=? order by t desc limit 500').all(p.id).reverse();db.players[p.id]=p}
const upP=sq.prepare('insert or replace into players values(?,?,?,?,?,?,?,?)'),insF=sq.prepare('insert into fixes values(?,?,?,?,?)');
const save=p=>upP.run(p.id,p.token,p.name,p.mode,p.entrance,p.joined,p.live?1:0,p.seen||0);let dirty=false;
const LIVE_MS=60000,ok=(r,o,c=200)=>{r.writeHead(c,{'content-type':'application/json','cache-control':'no-store'});r.end(JSON.stringify(o))};
const byTok=t=>Object.values(db.players).find(p=>p.token&&p.token===t);
const pub=p=>({id:p.id,name:p.name,mode:p.mode,entrance:p.entrance,last:p.track[p.track.length-1]||null});
const isGM=k=>k&&k.length===GM_KEY.length&&crypto.timingSafeEqual(Buffer.from(k),Buffer.from(GM_KEY));
const types={'.html':'text/html','.js':'text/javascript','.png':'image/png','.json':'application/json','.css':'text/css'};
https.createServer({key:fs.readFileSync(path.join(certDir,'key.pem')),cert:fs.readFileSync(path.join(certDir,'cert.pem'))},(q,r)=>{
 const u=new URL(q.url,'https://x');
 if(!u.pathname.startsWith('/api/')){let f=path.normalize(path.join(root,decodeURIComponent(u.pathname)));if(!f.startsWith(path.normalize(root)))return r.end();
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  return fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('not found')}r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});r.end(d)})}
 let b='';q.on('data',c=>{b+=c;if(b.length>1e5)q.destroy()});q.on('end',()=>{let j={};try{j=b?JSON.parse(b):{}}catch(e){}
  const tok=(q.headers.authorization||'').replace('Bearer ',''),now=Date.now();
  switch(u.pathname){
  case'/api/join':{if(j.consent!==true)return ok(r,{error:'consent required'},400);
   const id=crypto.randomBytes(6).toString('hex'),token=crypto.randomBytes(24).toString('hex');
   db.players[id]={id,token,name:String(j.name||'Player').slice(0,24),mode:j.mode==='stealth'?'stealth':'regular',entrance:['walk','jump','dance','run'].includes(j.entrance)?j.entrance:'walk',joined:now,live:true,track:[]};save(db.players[id]);return ok(r,{id,token})}
  case'/api/pos':{const p=byTok(tok);if(!p||!p.live)return ok(r,{error:'not joined'},401);
   const lat=+j.lat,lon=+j.lon,acc=+j.acc||0;if(!isFinite(lat)||!isFinite(lon))return ok(r,{error:'bad'},400);
   p.track.push({lat,lon,acc,t:now});if(p.track.length>500)p.track.shift();p.seen=now;insF.run(p.id,lat,lon,acc,now);save(p);return ok(r,{ok:1})}
  case'/api/players':{const p=byTok(tok);if(!p||!p.live)return ok(r,{error:'not joined'},401);// joined players only; stealth hidden from players
   return ok(r,{players:Object.values(db.players).filter(o=>o.live&&o.id!==p.id&&o.mode!=='stealth'&&now-(o.seen||0)<LIVE_MS).map(pub)})}
  case'/api/leave':{const p=byTok(tok);if(p){p.live=false;save(p)}return ok(r,{ok:1})}
  case'/api/delete':{const p=byTok(tok)||(j.id&&j.deleteToken&&db.players[j.id]&&db.players[j.id].delTok===j.deleteToken?db.players[j.id]:null);
   if(p){delete db.players[p.id];sq.prepare('delete from fixes where pid=?').run(p.id);sq.prepare('delete from players where id=?').run(p.id)}return ok(r,{ok:1})}
  case'/api/gm':{if(!isGM(q.headers['x-gm-key']))return ok(r,{error:'bad key'},403);
   return ok(r,{players:Object.values(db.players).filter(o=>o.live&&now-(o.seen||o.joined)<LIVE_MS).map(o=>({...pub(o),track:u.searchParams.get('trails')?o.track.slice(-500):undefined}))})}
  default:ok(r,{error:'no'},404)}})}).listen(+port,'0.0.0.0',()=>console.log('listening',port));
