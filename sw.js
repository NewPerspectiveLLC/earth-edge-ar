/* Live Geometry / Matt's Reality service worker: always-fresh HTML + version.json (network, no-store), versioned (?v=) same-origin assets cached per build.
   Works under / (tunnel) and /earth-edge-ar/ (Pages): scope = the folder sw.js is served from. */
const C='eear-assets';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==C)await caches.delete(k);await self.clients.claim()})()));
let lastV=null;
self.addEventListener('fetch',e=>{const q=e.request,u=new URL(q.url);if(q.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;
 if(q.mode==='navigate'||/(\.html|\/|version\.json|sw\.js|updater\.js)$/.test(u.pathname)){e.respondWith(fetch(q,{cache:'no-store'}).catch(()=>caches.match(q)));return}
 const v=u.searchParams.get('v');if(!v)return;/* unversioned: browser default (server ETag revalidation) */
 e.respondWith((async()=>{const c=await caches.open(C);const h=await c.match(q);if(h)return h;const r=await fetch(q);if(r.ok)c.put(q,r.clone());
  if(v!==lastV){lastV=v;c.keys().then(K=>K.forEach(k=>{const kv=new URL(k.url).searchParams.get('v');if(kv&&kv!==v)c.delete(k)}))}return r})())});
