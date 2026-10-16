// Satellite imagery layer (Esri World Imagery, same source as gm.html; credit "Imagery © Esri" must stay visible while it is on).
// Local: an N x N grid of web-mercator tiles around the viewer, zoom chosen from altitude (LOD), every vertex placed from lat/lon via the
// caller's proj(lat,lon,h) so the tiles follow Earth's curvature. High up: one low-res global texture (z2, 16 tiles stitched) on a globe mesh.
// Cache is capped (LRU, textures/geometry disposed).
export const ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
const PI=Math.PI,D=PI/180;
export const lon2x=(lo,z)=>(lo+180)/360*2**z, lat2y=(la,z)=>(1-Math.log(Math.tan(la*D)+1/Math.cos(la*D))/PI)/2*2**z;
export const x2lon=(x,z)=>x/2**z*360-180, y2lat=(y,z)=>Math.atan(Math.sinh(PI*(1-2*y/2**z)))/D;
export function zFor(alt,lat){const C=40075016*Math.cos(lat*D);return Math.max(3,Math.min(18,Math.round(Math.log2(C/(Math.max(alt,110)*2.4)))))}
export function makeSat(T,{proj,projGlobe,unit=1,maxTiles=110,renderOrder=-10,pf=()=>{},globeAbove=2e5,localBelow=1.5e6}){
 const g=new T.Group();g.name='sat';const loc=new T.Group(),glob=new T.Group();g.add(loc);
 const L=new T.TextureLoader();L.setCrossOrigin('anonymous');const cache=new Map();let key='',opacity=.6,loads=0,fails=0;
 const mat=tex=>{const m=new T.MeshBasicMaterial({map:tex,transparent:true,opacity,depthWrite:false,depthTest:true,side:T.FrontSide});pf(m);return m};
 const surf=(la0,la1,lo0,lo1,nx,ny,merc,pj=proj)=>{/* grid of lat/lon -> proj; rows spaced linearly in mercator y so the texture is not distorted */
  const P=[],U=[],I=[],y0=lat2y(la0,0),y1=lat2y(la1,0);let c=null;
  for(let j=0;j<=ny;j++){const v=j/ny,la=merc?y2lat(y0+(y1-y0)*v,0):la0+(la1-la0)*v;for(let i=0;i<=nx;i++){const u=i/nx,lo=lo0+(lo1-lo0)*u,p=pj(la,lo,0);if(!c)c=p.clone();P.push(p.x-c.x,p.y-c.y,p.z-c.z);U.push(u,1-v)}}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,d=a+nx+1,e=d+1;I.push(a,d,b,b,d,e)}
  const G=new T.BufferGeometry();G.setAttribute('position',new T.Float32BufferAttribute(P,3));G.setAttribute('uv',new T.Float32BufferAttribute(U,2));G.setIndex(I);G.computeBoundingSphere();return{G,c}};
 function tile(z,x,y){const k=z+'/'+x+'/'+y;let t=cache.get(k);if(t){t.t=performance.now();return t}
  const n=z<8?16:z<12?8:4,{G,c}=surf(y2lat(y,z),y2lat(y+1,z),x2lon(x,z),x2lon(x+1,z),n,n,true);
  const tex=L.load(ESRI+`${z}/${y}/${x}`,()=>{loads++},undefined,()=>{fails++});tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
  const m=new T.Mesh(G,mat(tex));m.position.copy(c);m.renderOrder=renderOrder+1;m.frustumCulled=true;t={k,m,tex,t:performance.now()};cache.set(k,t);
  if(cache.size>maxTiles){const old=[...cache.values()].filter(o=>!o.m.parent||o.k!==k).sort((a,b)=>a.t-b.t);for(const o of old){if(cache.size<=maxTiles)break;if(o.m.parent&&S.cur.has(o.k))continue;o.m.parent&&o.m.parent.remove(o.m);o.m.geometry.dispose();o.tex.dispose();o.m.material.dispose();cache.delete(o.k)}}
  return t}
 const S={g,loc,glob,cache,cur:new Set(),get stats(){return{tiles:cache.size,shown:loc.children.length,loads,fails,z:S.z,key}}};
 S.setOpacity=o=>{opacity=o;g.traverse(m=>{if(m.material){m.material.opacity=o;m.material.transparent=o<1;m.material.depthWrite=o>=1;m.material.needsUpdate=true}})};
 S.reset=()=>{for(const o of cache.values()){o.m.parent&&o.m.parent.remove(o.m);o.m.geometry.dispose();o.tex.dispose();o.m.material.dispose()}cache.clear();key='';S.cur.clear();
  for(const m of[...glob.children]){glob.remove(m);m.geometry.dispose();m.material.map&&m.material.map.dispose();m.material.dispose()}S.globe=null};
 function globe(){if(S.globe)return;const cv=document.createElement('canvas');cv.width=cv.height=1024;const x=cv.getContext('2d');x.fillStyle='#08131f';x.fillRect(0,0,1024,1024);
  const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;
  for(let ty=0;ty<4;ty++)for(let tx=0;tx<4;tx++){const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{x.drawImage(im,tx*256,ty*256);tex.needsUpdate=true;loads++};im.onerror=()=>fails++;im.src=ESRI+`2/${ty}/${tx}`}
  const parts=[];for(const[lo0,lo1]of[[-180,-90],[-90,0],[0,90],[90,180]]){/* 4 longitude strips keep float precision + per-strip centre */
   const{G,c}=surf(85.05,-85.05,lo0,lo1,24,96,true,projGlobe||proj);/* north->south rows = outward-facing triangles */const uv=G.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,((lo0+180)/360)+uv.getX(i)*(lo1-lo0)/360);
   const m=new T.Mesh(G,mat(tex));m.position.copy(c);m.renderOrder=renderOrder;m.frustumCulled=false;glob.add(m)}S.globe=tex}
 S.update=(lat,lon,alt)=>{glob.visible=alt>globeAbove;if(glob.visible)globe();loc.visible=alt<localBelow;if(!loc.visible)return;
  const z=zFor(alt,lat),N=z>=15?7:5,h=N>>1,cx=Math.floor(lon2x(lon,z)),cy=Math.floor(lat2y(Math.max(-85,Math.min(85,lat)),z)),k2=z+':'+cx+':'+cy;S.z=z;if(k2===key)return;key=k2;
  const want=new Set(),n=2**z;for(let dy=-h;dy<=h;dy++)for(let dx=-h;dx<=h;dx++){const y=cy+dy;if(y<0||y>=n)continue;const x=((cx+dx)%n+n)%n;want.add(z+'/'+x+'/'+y)}
  S.cur=want;for(const m of[...loc.children])if(!want.has(m.userData.k))loc.remove(m);
  for(const k of want){const[zz,x,y]=k.split('/').map(Number);const t=tile(zz,x,y);t.m.userData.k=k;if(!t.m.parent)loc.add(t.m)}};
 return S}
