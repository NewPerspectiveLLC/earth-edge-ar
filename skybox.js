// d52 Skybox: Matt Ready Library / skybox / skyboxp_.jpg (9967x5814, 1.71:1 painted panorama) wrapped all the way round the world.
// Web copies: img/skybox-4096.jpg (desktop / iPhone / Quest) and img/skybox-2048.jpg (Quest Lite). Prep (box, PIL): top 24% of sky cropped so the
// painted sea horizon (62% down the source) sits on the equator = the true horizon, 3% crossfade on the wrap seam, resized to 2:1.
// Mapping: equirectangular on an inward sphere. The vertex shader keeps ONLY the rotation of the model + view matrices, so the sky sits at
// infinite distance (no parallax when walking / flying, any altitude) but turns exactly with yaw / pitch / roll and with any north rotation of
// its parent. North-aligned: the centre of the picture faces true north (-Z), heading increases left->right like a real panorama.
export function makeSkybox(T, { lite = false } = {}) {
  const url = 'img/skybox-' + (lite ? 2048 : 4096) + '.jpg';
  const g = new T.SphereGeometry(50, lite ? 32 : 48, lite ? 16 : 24);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // seen from inside: un-mirror
  g.rotateY(Math.PI / 2); // picture centre (u=.5) -> north (-Z)
  const tex = new T.Texture(); tex.wrapS = T.RepeatWrapping; if ('colorSpace' in tex) tex.colorSpace = T.NoColorSpace || '';
  const m = new T.ShaderMaterial({ side: T.BackSide, depthTest: false, depthWrite: false, fog: false, uniforms: { map: { value: tex }, ok: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;vec3 d=normalize(mat3(modelMatrix)*position);gl_Position=projectionMatrix*vec4(mat3(viewMatrix)*d*50.,1.);}',
    fragmentShader: 'uniform sampler2D map;uniform float ok;varying vec2 vUv;void main(){if(ok<.5)discard;gl_FragColor=vec4(texture2D(map,vUv).rgb,1.);}' });
  m.userData.pf = 1; m.userData.cpf = 1; // passthrough fixes leave it alone (it is hidden whenever the camera feed shows)
  const s = new T.Mesh(g, m); s.name = 'skybox'; s.renderOrder = -99; s.frustumCulled = false; s.matrixAutoUpdate = true;
  new T.ImageLoader().load(url, img => { tex.image = img; tex.needsUpdate = true; m.uniforms.ok.value = 1 }, undefined, e => console.warn('skybox', e));
  s.userData.url = url; return s;
}
