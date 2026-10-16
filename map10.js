// 10-mile overhead Map overlay (index.html, iPhone + desktop). Leaflet lazy-loaded. Shows me, every player the server sent THIS device
// (stealth players arrive only if the policy lets this device see them; drawn grey + STEALTH), BOTs (style colours / plaid), TEST ghosts,
// vortex centres + landmarks, and a 10-mile (16.09 km) ring around me. Imagery: Esri World Imagery (PT 2024 7.6 cm city ortho to z21).
const MI10=16093.4;const myPos=()=>window.MYPOS_GET?window.MYPOS_GET():window.MYPOS;let LP=null,ov=null,map=null,lay=null,ring=null,meM=null,timer=null,fitDone=false;
function loadLeaflet(){if(window.L&&L.map)return Promise.resolve();if(LP)return LP;
 LP=new Promise((ok,err)=>{const c=document.createElement('link');c.rel='stylesheet';c.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(c);
  const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=ok;s.onerror=err;document.head.appendChild(s)});return LP}
const hex=c=>typeof c==='number'?'#'+c.toString(16).padStart(6,'0'):c;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hcol=id=>'hsl('+(parseInt(String(id).slice(0,4),16)%360)+',100%,60%)';
function dist(a,b,c,d){const R=6371000,r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
const fmt=m=>m<1000?Math.round(m)+' m':m<16093?(m/1609.34).toFixed(2)+' mi':(m/1609.34).toFixed(0)+' mi';
function icon(o,nolab){const st=o.mode==='stealth',BS=window.EEAR_BOTSTYLE,plaid=!st&&o.bot&&o.style==='plaid';const c=st?'#9a9a9a':(o.bot&&BS&&BS.COL[o.style])||hcol(o.id);
 const tag=(o.bot?' <b style="background:#3fd2ff;color:#000;border-radius:3px;padding:0 3px">BOT</b>':o.dummy?' <b style="background:#ffd23f;color:#000;border-radius:3px;padding:0 3px">TEST</b>':'')+(st?' <b style="background:#666;color:#fff;border-radius:3px;padding:0 3px">STEALTH</b>':'');
 return L.divIcon({className:'',iconSize:[0,0],html:`<div style="transform:translate(-9px,-9px);white-space:nowrap;${st?'opacity:.7':''}"><svg width=18 height=18 style="vertical-align:middle"><circle cx=9 cy=9 r=7 fill="${plaid?'url(#eearPlaid)':c}" stroke="${st?'#ddd':'#000'}" stroke-width=2 ${st?'stroke-dasharray="3 2"':''}/></svg><span style="${nolab?'display:none;':''}font:bold 12px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;margin-left:3px">${esc(o.name)}${tag}</span></div>`})}
function refresh(){if(!map)return;const me=myPos(),O=window.MP_OTHERS||{};lay.clearLayers();
 if(me){const ll=[me.lat,me.lon];if(!meM){meM=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#09f',fillOpacity:1}).addTo(map).bindTooltip('You',{permanent:true,direction:'bottom'});ring=L.circle(ll,{radius:MI10,color:'#ffc800',weight:2,fill:false,dashArray:'8 6',interactive:false}).addTo(map)}else{meM.setLatLng(ll);ring.setLatLng(ll)}
  if(!fitDone){fitDone=true;map.fitBounds(ring.getBounds(),{padding:[6,6]})}}
 let n=0,ns=0;for(const k in O){const o=O[k].o;if(!o||!o.last)continue;n++;if(o.mode==='stealth')ns++;const d=me?dist(me.lat,me.lon,o.last.lat,o.last.lon):null;
  const nl=o.group==='edge'&&map.getZoom()<17&&o.name!=='Edge-0°';L.marker([o.last.lat,o.last.lon],{icon:icon(nl?o:o.group==='edge'&&map.getZoom()<17?{...o,name:'City-edge bots ×12'}:o,nl),zIndexOffset:o.bot?0:500}).addTo(lay).bindPopup(`<b>${esc(o.name)}</b><br>${o.last.lat.toFixed(6)}, ${o.last.lon.toFixed(6)}${d!=null?'<br>'+fmt(d)+' away':''}`)}
 const LV=window.EEAR_LIVE;ov.querySelector('#m10S').textContent=(LV&&LV.active?n+' players/bots'+(ns?' ('+ns+' stealth, visible to this device)':''):'Not live: join live tracking to see players')+' · ring = 10 miles'}
export async function openMap10({places=[]}={}){if(ov){ov.remove();ov=null;map=null;meM=null;clearInterval(timer);return}
 ov=document.createElement('div');ov.id='m10Ov';ov.style.cssText='position:fixed;inset:0;z-index:120;background:#000c;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top) + 6px) 6px calc(env(safe-area-inset-bottom) + 6px);font:14px sans-serif;color:#fff';
 ov.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:17px">Map · 10 miles</b><span><button id=m10Me style="font-size:15px;padding:8px 12px;border-radius:9px;border:0">Me</button> <button id=m10Fit style="font-size:15px;padding:8px 12px;border-radius:9px;border:0">10 mi</button> <button id=m10X style="font-size:15px;padding:8px 14px;border-radius:9px;border:0;background:#ffc800;font-weight:bold">Close</button></span></div>
 <div id=m10Map style="flex:1;margin-top:6px;border-radius:10px;background:#222"></div><div id=m10S style="font-size:12px;margin-top:4px;color:#ddd">Loading map…</div>`;
 document.body.appendChild(ov);ov.querySelector('#m10X').onclick=()=>openMap10();
 try{await loadLeaflet()}catch(e){ov.querySelector('#m10S').textContent='Could not load the map (offline?)';return}
 window.EEAR_BOTSTYLE&&EEAR_BOTSTYLE.svgDefs();const me=myPos(),c=me?[me.lat,me.lon]:[48.11035,-122.80591];
 map=L.map(ov.querySelector('#m10Map'),{zoomControl:true}).setView(c,11);window.MAP10=map;
 L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:22,maxNativeZoom:21,attribution:'Imagery © Esri, Vantor/Maxar · PT 2024 ortho © City of Port Townsend'}).addTo(map);
 L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:22,maxNativeZoom:19,opacity:.9}).addTo(map);
 for(const[n,a,l,cl]of places)L.circleMarker([a,l],{radius:6,color:'#000',weight:1.5,fillColor:hex(cl),fillOpacity:.95}).addTo(map).bindTooltip(n,{direction:'top'});
 lay=L.layerGroup().addTo(map);map.on('zoomend',refresh);fitDone=false;refresh();timer=setInterval(()=>{if(!ov)return clearInterval(timer);refresh()},2000);
 ov.querySelector('#m10Fit').onclick=()=>ring&&map.fitBounds(ring.getBounds(),{padding:[6,6]});ov.querySelector('#m10Me').onclick=()=>{const m=myPos();m&&map.setView([m.lat,m.lon],17)};
 setTimeout(()=>map.invalidateSize(),60);return map}
