// Ground map layer: Satellite (Esri World Imagery) + Street (OpenStreetMap, same source as gm.html).
// Local: an N x N grid of web-mercator tiles around the viewer, zoom from altitude (LOD), every vertex placed from lat/lon via the
// caller's proj(lat,lon,h) so the tiles follow Earth's curvature. High up: one low-res global texture (z2, 16 tiles stitched) on a globe mesh.
// Cache is capped (LRU, textures/geometry disposed). Style switches wipe the cache. Credit must stay visible while the map is on.
export const ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
export const OSM='https://tile.openstreetmap.org/';
export const SAT_CREDIT='Imagery © Esri, Vantor/Maxar, Earthstar Geographics · Port Townsend 2024 7.6 cm ortho © City of Port Townsend';
export const STREET_CREDIT='© OpenStreetMap contributors';
export const STYLES={sat:{id:'sat',credit:SAT_CREDIT,blank:1,maxZ:(la,lo)=>inOrtho(la,lo)?21:19,url:(z,x,y)=>ESRI+`${z}/${y}/${x}`},
 street:{id:'street',credit:STREET_CREDIT,blank:0,maxZ:()=>19,url:(z,x,y)=>OSM+`${z}/${x}/${y}.png`}};
const PI=Math.PI,D=PI/180;
export const lon2x=(lo,z)=>(lo+180)/360*2**z, lat2y=(la,z)=>(1-Math.log(Math.tan(la*D)+1/Math.cos(la*D))/PI)/2*2**z;
export const x2lon=(x,z)=>x/2**z*360-180, y2lat=(y,z)=>Math.atan(Math.sinh(PI*(1-2*y/2**z)))/D;
/* City of Port Townsend 2024 ortho (7.6 cm, Esri Community Maps 'Port_Townsend-WA-USA-7-CMP-20240610') is served in World Imagery up to z21 inside the city; elsewhere cap at z19 (30-50 cm) */
export const PT_ORTHO=[48.075,-122.835,48.150,-122.735];
export const inOrtho=(la,lo)=>la>PT_ORTHO[0]&&la<PT_ORTHO[2]&&lo>PT_ORTHO[1]&&lo<PT_ORTHO[3];
export function zFor(alt,lat,lon,style='sat'){const C=40075016*Math.cos(lat*D),st=STYLES[style]||STYLES.sat,mx=st.maxZ(lat,lon);return Math.max(3,Math.min(mx,Math.round(Math.log2(C*3/Math.max(alt,6)))))}
export function makeSat(T,{proj,projGlobe,unit=1,maxTiles=190,renderOrder=-10,pf=()=>{},globeAbove=2e5,localBelow=1.5e6,style='sat'}){
 const g=new T.Group();g.name='sat';const loc=new T.Group(),glob=new T.Group();g.add(loc);
 const L=new T.TextureLoader();L.setCrossOrigin('anonymous');const cache=new Map();let key='',opacity=.6,loads=0,fails=0,styleId=STYLES[style]?style:'sat';
 const st=()=>STYLES[styleId];
 const TINT=new T.Color(1,1,1);/* day-night: shared colour multiplier (daynight.js?v=1792443133403 dims imagery at night) */
 const mat=tex=>{const m=new T.MeshBasicMaterial({map:tex,transparent:true,opacity,depthWrite:false,depthTest:true,side:T.FrontSide});m.color=TINT;pf(m);return m};
 const surf=(la0,la1,lo0,lo1,nx,ny,merc,pj=proj)=>{/* grid of lat/lon -> proj; rows spaced linearly in mercator y so the texture is not distorted */
  const P=[],U=[],I=[],y0=lat2y(la0,0),y1=lat2y(la1,0);let c=null;
  for(let j=0;j<=ny;j++){const v=j/ny,la=merc?y2lat(y0+(y1-y0)*v,0):la0+(la1-la0)*v;for(let i=0;i<=nx;i++){const u=i/nx,lo=lo0+(lo1-lo0)*u,p=pj(la,lo,0);if(!c)c=p.clone();P.push(p.x-c.x,p.y-c.y,p.z-c.z);U.push(u,1-v)}}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,d=a+nx+1,e=d+1;I.push(a,d,b,b,d,e)}
  const G=new T.BufferGeometry();G.setAttribute('position',new T.Float32BufferAttribute(P,3));G.setAttribute('uv',new T.Float32BufferAttribute(U,2));G.setIndex(I);G.computeBoundingSphere();return{G,c}};
 function tile(z,x,y){const k=z+'/'+x+'/'+y;let t=cache.get(k);if(t){t.t=performance.now();return t}
  const n=z<8?16:z<12?8:4,{G,c}=surf(y2lat(y,z),y2lat(y+1,z),x2lon(x,z),x2lon(x+1,z),n,n,true);
  const tex=L.load(st().url(z,x,y),tx=>{loads++;if(st().blank&&z>=19&&blank(tx.image)&&t){t.m.visible=false;t.blank=1;S.blanks=(S.blanks||0)+1}},undefined,()=>{fails++;if(t)t.m.visible=false});tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
  const mm=mat(tex);/* nested LOD: finer levels draw first and mark the stencil; coarser tiles only draw where nothing finer was drawn (no double tint) */
  mm.stencilWrite=true;mm.stencilRef=0;mm.stencilFunc=T.EqualStencilFunc;mm.stencilZPass=T.IncrementStencilOp;mm.stencilFail=T.KeepStencilOp;mm.stencilZFail=T.KeepStencilOp;
  const m=new T.Mesh(G,mm);m.position.copy(c);m.renderOrder=renderOrder+1;m.frustumCulled=true;t={k,m,tex,t:performance.now()};cache.set(k,t);
  if(cache.size>maxTiles){const old=[...cache.values()].filter(o=>!o.m.parent||o.k!==k).sort((a,b)=>a.t-b.t);for(const o of old){if(cache.size<=maxTiles)break;if(o.m.parent&&S.cur.has(o.k))continue;o.m.parent&&o.m.parent.remove(o.m);o.m.geometry.dispose();o.tex.dispose();o.m.material.dispose();cache.delete(o.k)}}
  return t}
 /* Esri 'Map data not yet available' placeholder = flat #cccccc tile: hide it so the coarser level shows through (satellite only) */
 const bc=document.createElement('canvas');bc.width=bc.height=8;const bx=bc.getContext('2d',{willReadFrequently:true});
 function blank(im){try{bx.drawImage(im,0,0,8,8);const d=bx.getImageData(0,0,8,8).data;let n=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-204)<6&&Math.abs(d[i+1]-204)<6&&Math.abs(d[i+2]-204)<6)n++;return n>=56}catch(e){return false}}
 const S={g,loc,glob,cache,tint:TINT,cur:new Set(),get stats(){return{tiles:cache.size,shown:loc.children.length,loads,fails,z:S.z,key,style:styleId}}};
 S.setOpacity=o=>{opacity=o;g.traverse(m=>{if(m.material){m.material.opacity=o;m.material.transparent=o<1;m.material.depthWrite=o>=1;m.material.needsUpdate=true}})};
 S.reset=()=>{for(const o of cache.values()){o.m.parent&&o.m.parent.remove(o.m);o.m.geometry.dispose();o.tex.dispose();o.m.material.dispose()}cache.clear();key='';S.cur.clear();
  for(const m of[...glob.children]){glob.remove(m);m.geometry.dispose();m.material.map&&m.material.map.dispose();m.material.dispose()}S.globe=null};
 S.setStyle=s=>{if(!STYLES[s]||s===styleId)return;styleId=s;S.reset()};
 S.getStyle=()=>styleId;S.credit=()=>st().credit;
 function globe(){if(S.globe)return;const cv=document.createElement('canvas');cv.width=cv.height=1024;const x=cv.getContext('2d');x.fillStyle='#08131f';x.fillRect(0,0,1024,1024);
  const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;
  for(let ty=0;ty<4;ty++)for(let tx=0;tx<4;tx++){const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{x.drawImage(im,tx*256,ty*256);tex.needsUpdate=true;loads++};im.onerror=()=>fails++;im.src=st().url(2,tx,ty)}
  const parts=[];for(const[lo0,lo1]of[[-180,-90],[-90,0],[0,90],[90,180]]){/* 4 longitude strips keep float precision + per-strip centre */
   const{G,c}=surf(85.05,-85.05,lo0,lo1,24,96,true,projGlobe||proj);/* north->south rows = outward-facing triangles */const uv=G.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,((lo0+180)/360)+uv.getX(i)*(lo1-lo0)/360);
   const m=new T.Mesh(G,mat(tex));m.position.copy(c);m.renderOrder=renderOrder;m.frustumCulled=false;glob.add(m)}S.globe=tex}
 S.update=(lat,lon,alt)=>{glob.visible=alt>globeAbove;if(glob.visible)globe();loc.visible=alt<localBelow;if(!loc.visible)return;
  /* nested rings: top zoom z (from altitude; z21 inside the PT 2024 ortho on satellite), then z-2 and z-4 around it, each centred on the viewer */
  const la=Math.max(-85,Math.min(85,lat)),z=zFor(alt,lat,lon,styleId),LV=(z>=16?[z,z-2,z-4]:z>=12?[z,z-2]:[z]),want=new Map();
  const k2=styleId+'|'+LV.map(zz=>zz+':'+Math.floor(lon2x(lon,zz))+':'+Math.floor(lat2y(la,zz))).join('|');S.z=z;S.levels=LV;if(k2===key)return;key=k2;
  LV.forEach((zz,li)=>{const N=li===0?(zz>=20?8:7):6,h=N/2,fx=lon2x(lon,zz),fy=lat2y(la,zz),n=2**zz;
   for(let j=0;j<N;j++)for(let i=0;i<N;i++){const y=Math.floor(fy-h+.5)+j;if(y<0||y>=n)continue;const x=((Math.floor(fx-h+.5)+i)%n+n)%n;want.set(zz+'/'+x+'/'+y,li)}});
  S.cur=new Set(want.keys());for(const m of[...loc.children])if(!want.has(m.userData.k))loc.remove(m);
  for(const[k,li]of want){const[zz,x,y]=k.split('/').map(Number);const t=tile(zz,x,y);t.m.userData.k=k;t.m.renderOrder=renderOrder+1+li;if(!t.m.parent)loc.add(t.m)}};
 return S}
