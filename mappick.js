// Lightweight map picker: Leaflet is loaded only when opened. Street (OSM) / Satellite (Esri) toggle.
let LP=null;
function loadLeaflet(){if(window.L&&L.map)return Promise.resolve();if(LP)return LP;
 LP=new Promise((ok,err)=>{const c=document.createElement('link');c.rel='stylesheet';c.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(c);
  const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=ok;s.onerror=err;document.head.appendChild(s)});return LP}
const hex=c=>typeof c==='number'?'#'+c.toString(16).padStart(6,'0'):c;
export async function openMapPicker({center=[48.11035,-122.80591],places=[],onUse}){
 let ov=document.getElementById('mpkOv');if(ov)ov.remove();
 ov=document.createElement('div');ov.id='mpkOv';ov.style.cssText='position:fixed;inset:0;z-index:100;background:#000d;display:flex;flex-direction:column;align-items:center;justify-content:center;font:18px sans-serif;color:#fff';
 ov.innerHTML=`<style>#mpkMap .leaflet-control-zoom a{width:64px!important;height:64px!important;line-height:64px!important;font-size:40px!important}#mpkOv button{font-size:22px;padding:12px 20px;margin:4px;border-radius:10px;border:0}#mpkOv .lbl{background:#000a;color:#fff;border:0;font-weight:bold}</style>
 <div style="width:90vw;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap"><b style="font-size:22px">Tap the map to place the pin</b><span><button id=mpkSat>Satellite</button><button id=mpkLoc>Locate me</button></span></div>
 <div id=mpkMap style="width:90vw;height:60vh;border-radius:12px;background:#222"></div>
 <div style="width:90vw;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:6px"><span id=mpkC style="font-size:20px">Loading map...</span><span><button id=mpkUse disabled style="background:#ffc800;font-weight:bold">Use this spot</button><button id=mpkX>Cancel</button></span></div>`;
 document.body.appendChild(ov);const $=id=>ov.querySelector('#'+id);$('mpkX').onclick=()=>ov.remove();
 if(/OculusBrowser|Quest|Pico/i.test(navigator.userAgent)||!navigator.geolocation)$('mpkLoc').style.display='none';
 try{await loadLeaflet()}catch(e){$('mpkC').textContent='Could not load the map (offline?)';return}
 const map=L.map($('mpkMap'),{zoomControl:true,tap:true}).setView(center,16);
 const street=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
 const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri'});
 let isSat=false;$('mpkSat').onclick=()=>{isSat=!isSat;if(isSat){map.removeLayer(street);sat.addTo(map)}else{map.removeLayer(sat);street.addTo(map)}$('mpkSat').textContent=isSat?'Street map':'Satellite'};
 for(const[n,a,l,c]of places)L.circleMarker([a,l],{radius:9,color:'#000',weight:2,fillColor:hex(c),fillOpacity:.95}).addTo(map).bindTooltip(n,{permanent:true,direction:'top',className:'lbl',offset:[0,-8]});
 L.circleMarker(center,{radius:6,color:'#fff',fillColor:'#09f',fillOpacity:1}).addTo(map).bindTooltip('current',{direction:'bottom'});
 let pin=null,pick=null;const setPin=(a,l)=>{pick=[a,l];if(pin)pin.setLatLng(pick);else pin=L.marker(pick,{draggable:true}).addTo(map).on('dragend',e=>{const p=e.target.getLatLng();setPin(p.lat,p.lng)});$('mpkC').textContent='Pin: '+a.toFixed(6)+', '+l.toFixed(6);$('mpkUse').disabled=false};
 map.on('click',e=>setPin(e.latlng.lat,e.latlng.lng));$('mpkC').textContent='Current: '+center[0].toFixed(6)+', '+center[1].toFixed(6);
 $('mpkLoc').onclick=()=>navigator.geolocation.getCurrentPosition(p=>{setPin(p.coords.latitude,p.coords.longitude);map.setView(pick,18)},()=>$('mpkC').textContent='No location fix');
 $('mpkUse').onclick=()=>{if(!pick)return;ov.remove();onUse(pick[0],pick[1])};setTimeout(()=>map.invalidateSize(),50);window.MPK_MAP=map;return map}
