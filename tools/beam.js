
// ---- light beams + ground shapes by type (shared per-place materials)
const SHT={value:0};window.SHT=SHT;const RINGS=[];
const beamMat=c=>new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,uniforms:{c:{value:new T.Color(c)}},
 vertexShader:'varying float vY;void main(){vY=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 c;varying float vY;void main(){gl_FragColor=vec4(c*pow(1.-vY,1.6)*.9,1.);}'});
function addBeamShape(p,c,type){const g=new T.Group();g.position.set(p.x,p.y,p.z);g.userData.layer='places';local.add(g);
 const bm=new T.Mesh(new T.CylinderGeometry(2.5,2.5,200,10,1,true),beamMat(c));bm.position.y=100;bm.renderOrder=7;g.add(bm);
 const ring=new T.Mesh(new T.RingGeometry(5,7,32).rotateX(-Math.PI/2),glowMat(c,.7));ring.position.y=.05;ring.renderOrder=7;g.add(ring);RINGS.push(ring);
 const fill=glowMat(c,.18),edge=new T.LineBasicMaterial({color:c,transparent:true,opacity:.9,depthTest:false});
 const add=(geo,y,ry=0)=>{const m=new T.Mesh(geo,fill);m.position.y=y;m.rotation.y=ry;m.renderOrder=7;g.add(m);const e=new T.LineSegments(new T.EdgesGeometry(geo),edge);e.position.y=y;e.rotation.y=ry;e.renderOrder=7;g.add(e)};
 if(type==='building'){add(new T.BoxGeometry(10,6,10),3);add(new T.ConeGeometry(7.5,4,4),8,Math.PI/4)}
 else if(type==='hospital'){add(new T.BoxGeometry(12,7,12),3.5);add(new T.BoxGeometry(8,2.4,.6),9);add(new T.BoxGeometry(2.4,8,.6),9)}
 else if(type==='landmark'){add(new T.CylinderGeometry(.9,2,14,4),7,Math.PI/4);add(new T.ConeGeometry(1.3,2.5,4),15.2,Math.PI/4)}
 else if(type==='tree'){add(new T.CylinderGeometry(.6,.8,4,6),2);add(new T.ConeGeometry(4,10,8),9)}
 else{add(new T.CircleGeometry(25,32).rotateX(-Math.PI/2),.06)}}
// ---- streets + route (always on; not in the layers menu)
function buildStreets(){fetch('streets.json').then(r=>r.json()).then(J=>{if(!L0||Math.hypot((L0[0]-48.117)*111,(L0[1]+122.78)*74)>15)return;const[my,mx]=mPer(L0[0]);
 for(const ln of J.lines){const P=[];for(const[a,l]of ln.points)P.push((l-L0[1])*mx,-1.55,-(a-L0[0])*my);const col=new T.Color(ln.color);
  for(const[w,op,cc]of[[7,.22,col],[3,.9,col],[1,1,new T.Color(1,1,1)]]){const g=new LineGeometry();g.setPositions(P);const m=new LineMaterial({color:cc,linewidth:w,transparent:true,opacity:op,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,resolution:new T.Vector2(innerWidth,innerHeight)});const l=new Line2(g,m);l.renderOrder=8;l.frustumCulled=false;local.add(l);window.FATLINES=(window.FATLINES||[]).concat(m)}
  const every=Math.max(10,Math.floor(ln.points.length/6));for(let i=Math.floor(every/2);i<ln.points.length;i+=every){const lb=label(ln.name,ln.color,{title:ln.name+(ln.streets?' via '+ln.streets.join(', '):''),color:ln.color});lb.position.set(P[i*3],1,P[i*3+2]);local.add(lb)}}})}
// ---- layers menu (persisted)
const LAYERS={places:'Places',lines:'Lines to places',edges:'Edge-of-Earth markers',far:'Poles & pyramids',grid:'Floor grid',ghost:'Ghost bot'};
const LAY=Object.assign({places:1,lines:1,edges:1,far:1,grid:1,ghost:1},JSON.parse(localStorage.eearLayers||'{}'));
function layerOn(o){while(o){if(o.userData&&o.userData.layer&&!LAY[o.userData.layer])return false;o=o.parent}return true}
function applyLayers(){scene.traverse(o=>{if(o.userData&&o.userData.layer&&!o.isSprite)o.visible=!!LAY[o.userData.layer]});localStorage.eearLayers=JSON.stringify(LAY)}
