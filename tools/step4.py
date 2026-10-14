s=open('index.html').read()
def R(a,b,n=1):
    global s
    assert a in s,a[:60]
    s=s.replace(a,b,n)
R("const TARGETS=[","const TYPES={'Ready Athletics (997800502)':'field','Cappy\\'s Trails garden (998002802)':'park','Memory\\'s Vault, Fort Worden':'landmark','Port Townsend City Hall':'building','Jefferson County Sheriff\\'s Office':'building','Jefferson Healthcare Hospital':'hospital'};\nconst TARGETS=[")
R("pil.position.copy(p).y+=60;pil.renderOrder=7;local.add(pil);","pil.position.copy(p).y+=60;pil.renderOrder=7;pil.userData.layer='places';local.add(pil);addBeamShape(p,c,TYPES[n]||(/Masonic/.test(n)?'building':'landmark'));")
R("ln.renderOrder=7;ln.userData.t=p;local.add(ln);","ln.renderOrder=7;ln.userData.t=p;ln.userData.layer='lines';local.add(ln);")
R("Object.assign(lb.userData,{lb:[n,c],t:p});","Object.assign(lb.userData,{lb:[n,c],t:p,layer:'places'});")
beam=open('tools/beam.js').read()
R("let built=null;",beam+"let built=null;")
R("gm.renderOrder=6;gm.frustumCulled=false;local.add(gm);","gm.renderOrder=6;gm.frustumCulled=false;gm.userData.layer='grid';local.add(gm);buildStreets();")
R("dot.position.copy(p);dot.renderOrder=9;world.add(dot);","dot.position.copy(p);dot.renderOrder=9;dot.userData.layer='edges';world.add(dot);")
R("ln.renderOrder=8;world.add(ln);","ln.renderOrder=8;ln.userData.layer='edges';world.add(ln);")
R("lb.position.copy(p).add(new T.Vector3(0,500,0));world.add(lb);","lb.position.copy(p).add(new T.Vector3(0,500,0));lb.userData.layer='edges';world.add(lb);")
R("l2.position.copy(p).add(new T.Vector3(0,-500,0));world.add(l2)","l2.position.copy(p).add(new T.Vector3(0,-500,0));l2.userData.layer='edges';world.add(l2)")
R("const{p,q,up}=frameAt(a,l,la,lo),g=new T.Group();g.position.copy(p);","const{p,q,up}=frameAt(a,l,la,lo),g=new T.Group();g.userData.layer='far';g.position.copy(p);")
R("lb.position.copy(p).add(up.clone().multiplyScalar(800*S));world.add(lb)}}","lb.position.copy(p).add(up.clone().multiplyScalar(800*S));lb.userData.layer='far';world.add(lb)}applyLayers()}")
R("for(const s of LABELS){if(!s.parent){continue}","for(const s of LABELS){if(!s.parent){continue}if(!layerOn(s)){s.visible=false;s.userData.scr=null;continue}")
R("<div id=ui>","<button id=layB style='position:fixed;right:8px;bottom:calc(env(safe-area-inset-bottom) + 100px);z-index:22;font-size:15px;padding:12px'>Layers</button><div id=layP style='display:none;position:fixed;right:8px;bottom:calc(env(safe-area-inset-bottom) + 150px);z-index:30;background:#000d;padding:10px;border-radius:10px;font-size:17px;line-height:2'></div><div id=ui>")
R("ren.setAnimationLoop(t=>{gpsBlend(t);","""layP.innerHTML=Object.entries(LAYERS).map(([k,v])=>`<label><input type=checkbox data-l=${k} ${LAY[k]?'checked':''} style='width:22px;height:22px'> ${v}</label>`).join('<br>')+'<br><small>Streets are always on</small>';
layB.onclick=()=>layP.style.display=layP.style.display==='none'?'block':'none';layP.onchange=e=>{const k=e.target.dataset.l;LAY[k]=e.target.checked?1:0;if(k==='ghost'&&window.GHOST){GHOST.visible=!!LAY.ghost;localStorage.eearGhost=LAY.ghost?'on':'off'}applyLayers()};
ren.setAnimationLoop(t=>{gpsBlend(t);SHT.value=t/1000;for(const r of RINGS){const k=(t/1000*.8+r.id*.13)%1;r.scale.setScalar(.6+k*1.4);r.material.opacity=.8*(1-k)}""")
R("closest('button,#mpc,#mpb,#zoom,#hpP,#hpD,#card')","closest('button,#mpc,#mpb,#zoom,#hpP,#hpD,#card,#layP,#desk,#pairP,#lockP')")
open('index.html','w').write(s)
g=open('gm.html').read()
g=g.replace("fetch('sheridan.json')","fetch('streets.json').then(r=>r.json()).then(J=>J.lines.forEach(l=>L.polyline(l.points,{color:l.color,weight:4}).addTo(map).bindTooltip(l.name)));fetch('sheridan.json')",1)
open('gm.html','w').write(g)
print('applied')
