/* ============================================================
 * AEON :: BATTLE3D
 * Babylon.js 3D battle visualiser — integrated version.
 * Loaded lazily by main.js; exposes window.Battle3D.
 * ============================================================ */
(function () {
'use strict';
if (typeof BABYLON === 'undefined') { console.error('[battle3d] BABYLON not loaded'); return; }
const B = BABYLON;

// ---- utils (avoid re-declaring globals already in bundle) ----
const hexC3 = hex => B.Color3.FromHexString((hex && hex.length === 7) ? hex : '#888888');
const col4  = (hex, a) => { const c = hexC3(hex); return new B.Color4(c.r, c.g, c.b, a == null ? 1 : a); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix3  = (a, b, t) => new B.Color3(a.r+(b.r-a.r)*t, a.g+(b.g-a.g)*t, a.b+(b.b-a.b)*t);
const desat = c => { const l=(c.r+c.g+c.b)/3; return new B.Color3(l*.6+c.r*.4, l*.6+c.g*.4, l*.6+c.b*.4); };
const clampC = c => new B.Color3(clamp(c.r,0,1), clamp(c.g,0,1), clamp(c.b,0,1));

// Reads live BIOMES global from data.js; falls back to constants.
function getBiomePal(key) {
  if (typeof BIOMES !== 'undefined' && BIOMES[key])
    return { base: BIOMES[key].color, alt: BIOMES[key].colorAlt, feature: BIOMES[key].feature };
  const FB = {
    forest:{base:'#2d5a3a',alt:'#3a6b47',feature:'#4a7a55'},
    plains:{base:'#7a9a5a',alt:'#8aaa6a',feature:'#a0c073'},
  };
  return FB[key] || FB.forest;
}

const FOCUS_UNIT_POOLS = {
  military:   ['infantry','infantry','infantry','cavalry'],
  science:    ['archer','archer','mage','infantry'],
  faith:      ['infantry','infantry','mage','mage'],
  magic:      ['mage','mage','mage','archer'],
  industry:   ['infantry','infantry','cavalry','infantry'],
  trade:      ['archer','infantry','infantry'],
  naturalism: ['archer','cavalry','infantry'],
  exploration:['cavalry','cavalry','archer','infantry'],
  diplomacy:  ['infantry','archer'],
};

// ---- module-level scene globals (only one Battle3D at a time) ----
let engine, scene, camera, hemi, dirLight, shadowGen, glow, particleTex, mageOrbSrc;
let terrain = null;
const TERRAIN_DECO_CAP = 200;

// ---- materials ----
function stdMat(name, color, opts) {
  const m = new B.StandardMaterial(name, scene);
  m.diffuseColor = clampC(color);
  m.specularColor = new B.Color3(0.08, 0.08, 0.08);
  m.maxSimultaneousLights = 8;
  if (opts) {
    if (opts.emissive)        m.emissiveColor = clampC(opts.emissive);
    if (opts.disableLighting) m.disableLighting = true;
    if (opts.metallic) { m.specularColor = new B.Color3(0.55,0.55,0.6); m.specularPower = 64; }
  }
  return m;
}

function makeSoftParticleTexture() {
  const dt = new B.DynamicTexture('soft', { width:64, height:64 }, scene, false);
  const ctx = dt.getContext();
  const g = ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  dt.hasAlpha = true; dt.update();
  return dt;
}

// ======================================================================
//  TERRAIN
// ======================================================================
function biomeHeight(biome, x, z) {
  const n = Math.sin(x*1.3+z*0.7) * Math.cos(z*1.1-x*0.5);
  switch (biome) {
    case 'mountain': return n*0.8;
    case 'volcanic': return n*1.0;
    case 'desert':   return Math.sin(x*0.6)*0.15 + Math.sin(z*0.55)*0.15;
    case 'plains':   return n*0.1;
    case 'tundra':   return n*0.06;
    case 'swamp': case 'coastal': return 0;
    case 'forest': case 'jungle': case 'taiga': return n*0.2;
    case 'savanna':  return n*0.12;
    default:         return n*0.15;
  }
}

function buildTerrain(biomeA, biomeB) {
  disposeTerrain();
  terrain = { grounds:[], decoSrc:[], decoSrcCache:{}, deco:[], mats:[], ps:[], anims:[], decoCount:0, texN:0, t:0 };
  const palA = getBiomePal(biomeA), palB = getBiomePal(biomeB);
  buildHalf(biomeA, palA, palB, -1);
  buildHalf(biomeB, palB, palA, +1);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogColor = mix3(hexC3(palA.base), hexC3(palB.base), 0.5);
  scene.fogDensity = 0.011;
}

function buildHalf(biome, pal, otherPal, side) {
  const g = B.MeshBuilder.CreateGround('half'+side, { width:20, height:20, subdivisions:28 }, scene);
  g.position.x = side * 10;
  g.receiveShadows = true;
  const positions = g.getVerticesData(B.VertexBuffer.PositionKind);
  const indices = g.getIndices();
  const normals = [];
  const colors = new Array((positions.length/3)*4);
  const baseC = hexC3(pal.base), otherC = hexC3(otherPal.base);
  for (let i=0,c=0; i<positions.length; i+=3,c+=4) {
    const lx=positions[i], lz=positions[i+2], wx=lx+side*10;
    positions[i+1] = biomeHeight(biome,wx,lz) * clamp(Math.abs(wx)/3,0,1);
    const d = Math.abs(wx);
    const col = d<2.5 ? mix3(baseC,otherC,(1-d/2.5)*0.5) : baseC;
    colors[c]=col.r; colors[c+1]=col.g; colors[c+2]=col.b; colors[c+3]=1;
  }
  B.VertexData.ComputeNormals(positions, indices, normals);
  g.setVerticesData(B.VertexBuffer.PositionKind, positions);
  g.setVerticesData(B.VertexBuffer.NormalKind, normals);
  g.setVerticesData(B.VertexBuffer.ColorKind, colors);
  g.useVertexColors = true;
  g.refreshBoundingInfo();
  const mat = stdMat('halfMat'+side, new B.Color3(1,1,1));
  mat.specularColor = new B.Color3(0.03,0.03,0.04);
  const detail = makeDetailTexture(); detail.uScale=5; detail.vScale=5;
  mat.diffuseTexture = detail;
  g.material = mat;
  terrain.grounds.push(g); terrain.mats.push(mat);
  if (biome==='desert') terrain.anims.push({ type:'shimmer', tex:detail });
  scatterBiome(biome, side, pal);
}

function makeDetailTexture() {
  const S=256;
  const dt = new B.DynamicTexture('detail'+(terrain.texN++), {width:S,height:S}, scene, true);
  const ctx = dt.getContext();
  ctx.fillStyle='#bcbcbc'; ctx.fillRect(0,0,S,S);
  for (let i=0;i<1300;i++) {
    const v=150+Math.floor(Math.random()*90);
    ctx.fillStyle=`rgb(${v},${v},${v})`;
    const s=1+Math.random()*4;
    ctx.fillRect(Math.random()*S, Math.random()*S, s, s);
  }
  dt.update(); dt.wrapU=dt.wrapV=B.Texture.WRAP_ADDRESSMODE;
  return dt;
}

function getDecoSrc(key, build, castShadow) {
  if (!terrain.decoSrcCache[key]) {
    const m = build();
    m.isVisible=false; m.isPickable=false; m.position.y=-50;
    if (castShadow) shadowGen.addShadowCaster(m);
    if (m.material) terrain.mats.push(m.material);
    terrain.decoSrc.push(m); terrain.decoSrcCache[key]=m;
  }
  return terrain.decoSrcCache[key];
}
function placeDeco(key, build, x, y, z, opts) {
  if (terrain.decoCount >= TERRAIN_DECO_CAP) return null;
  const src = getDecoSrc(key, build, opts&&opts.shadow);
  const inst = src.createInstance('deco'+(terrain.decoCount++));
  inst.position.set(x,y,z);
  if (opts&&opts.scale) inst.scaling.copyFrom(opts.scale);
  if (opts&&opts.rot)   inst.rotation.copyFrom(opts.rot);
  terrain.deco.push(inst);
  return inst;
}
function makeWater(pos, size, hex) {
  const w = B.MeshBuilder.CreateGround('water', {width:size,height:size}, scene);
  const m = stdMat('waterM', hexC3(hex));
  m.alpha=0.72; m.specularColor=new B.Color3(0.6,0.7,0.8); m.specularPower=64;
  w.material=m; w.position.copyFrom(pos);
  terrain.deco.push(w); terrain.mats.push(m);
  terrain.anims.push({ type:'water', mesh:w, baseY:pos.y, ph:Math.random()*6 });
}
function makeFlame(pos) {
  const ps = new B.ParticleSystem('flame',40,scene);
  ps.particleTexture=particleTex; ps.emitter=pos.clone();
  ps.minEmitBox=new B.Vector3(-0.15,0,-0.15); ps.maxEmitBox=new B.Vector3(0.15,0.1,0.15);
  ps.color1=col4('#ffb03a',0.9); ps.color2=col4('#ff4a1a',0.9); ps.colorDead=col4('#5a1a0a',0);
  ps.minSize=0.2; ps.maxSize=0.6; ps.minLifeTime=0.3; ps.maxLifeTime=0.7;
  ps.emitRate=40; ps.minEmitPower=0.6; ps.maxEmitPower=1.6; ps.gravity=new B.Vector3(0,2,0);
  ps.blendMode=B.ParticleSystem.BLENDMODE_ADD; ps.start();
  return ps;
}

function scatterBiome(biome, side, pal) {
  const xc=side*10, featC=hexC3(pal.feature);
  const rndX=()=>xc+(Math.random()*2-1)*9;
  const rndZ=()=>(Math.random()*2-1)*9;
  const yAt=(x,z)=>biomeHeight(biome,x,z)*clamp(Math.abs(x)/3,0,1);
  const jit=()=>new B.Vector3(0.9+Math.random()*0.4, 0.9+Math.random()*0.5, 0.9+Math.random()*0.4);
  const trunkB=()=>{ const m=B.MeshBuilder.CreateCylinder('trunkS',{height:0.8,diameter:0.28,tessellation:6},scene); m.material=stdMat('trunkM',hexC3('#5a3f29')); return m; };
  const rockB=(h)=>()=>{ const m=B.MeshBuilder.CreateBox('rockS',{size:0.5},scene); m.material=stdMat('rockM',hexC3(h)); return m; };
  const grassB=(h)=>()=>{ const m=B.MeshBuilder.CreateCylinder('grassS',{height:0.3,diameter:0.08,tessellation:4},scene); m.material=stdMat('grassM',hexC3(h)); return m; };
  const tree=(key,canopyB,n)=>{ for(let i=0;i<n;i++){ const x=rndX(),z=rndZ(),ty=yAt(x,z);
    placeDeco('trunk',trunkB,x,ty+0.4,z,{shadow:true});
    placeDeco(key,canopyB,x,ty+0.95,z,{scale:jit()}); } };
  switch(biome) {
    case 'forest': tree('canopy',()=>{ const m=B.MeshBuilder.CreateSphere('canS',{diameter:0.6,segments:6},scene); m.material=stdMat('canM',featC); return m; },15);
      for(let i=0;i<6;i++){ const x=rndX(),z=rndZ(); placeDeco('stump',()=>{ const m=B.MeshBuilder.CreateCylinder('stumpS',{height:0.4,diameter:0.3,tessellation:6},scene); m.material=stdMat('stumpM',hexC3('#5a3f29')); return m; },x,yAt(x,z)+0.2,z); } break;
    case 'jungle': tree('jcan',()=>{ const m=B.MeshBuilder.CreateSphere('jcanS',{diameter:0.72,segments:6},scene); m.material=stdMat('jcanM',featC); return m; },25);
      for(let i=0;i<8;i++){ const x=rndX(),z=rndZ(); placeDeco('vine',()=>{ const m=B.MeshBuilder.CreateCylinder('vineS',{height:1.4,diameter:0.06,tessellation:5},scene); m.material=stdMat('vineM',hexC3('#2f5a30')); return m; },x,yAt(x,z)+0.9,z); } break;
    case 'mountain': for(let i=0;i<14;i++){ const x=rndX(),z=rndZ(); placeDeco('rock',rockB('#6b6b6b'),x,yAt(x,z)+0.2,z,{shadow:true,rot:new B.Vector3(Math.random(),Math.random(),Math.random()),scale:jit()}); } break;
    case 'desert':   for(let i=0;i<3;i++){ const x=rndX(),z=rndZ(); placeDeco('rock',rockB('#a8893f'),x,yAt(x,z)+0.2,z,{rot:new B.Vector3(Math.random(),Math.random(),0)}); } break;
    case 'tundra':
      for(let i=0;i<10;i++){ const x=rndX(),z=rndZ(); placeDeco('spike',()=>{ const m=B.MeshBuilder.CreateCylinder('spikeS',{height:0.5,diameterTop:0,diameterBottom:0.2,tessellation:6},scene); m.material=stdMat('spikeM',hexC3('#cfe2ee')); return m; },x,yAt(x,z)+0.25,z); }
      for(let i=0;i<6;i++){ const x=rndX(),z=rndZ(); placeDeco('crack',()=>{ const m=B.MeshBuilder.CreateBox('crackS',{width:1.2,height:0.02,depth:0.08},scene); m.material=stdMat('crackM',hexC3('#5a6b78')); return m; },x,yAt(x,z)+0.02,z,{rot:new B.Vector3(0,Math.random()*3,0)}); } break;
    case 'plains':   for(let i=0;i<16;i++){ const x=rndX(),z=rndZ(); placeDeco('grass',grassB(pal.feature),x,yAt(x,z)+0.15,z); } break;
    case 'savanna':
      for(let i=0;i<8;i++){ const x=rndX(),z=rndZ(),ty=yAt(x,z);
        placeDeco('atrunk',()=>{ const m=B.MeshBuilder.CreateCylinder('atrunkS',{height:1.0,diameter:0.16,tessellation:6},scene); m.material=stdMat('atrunkM',hexC3('#7a5a32')); return m; },x,ty+0.5,z,{shadow:true});
        placeDeco('adisc', ()=>{ const m=B.MeshBuilder.CreateCylinder('adiscS',{height:0.1,diameter:1.3,tessellation:10},scene); m.material=stdMat('adiscM',hexC3('#7a8a4a')); return m; },x,ty+1.05,z); }
      for(let i=0;i<8;i++){ const x=rndX(),z=rndZ(); placeDeco('grass',grassB('#b0a060'),x,yAt(x,z)+0.15,z); } break;
    case 'volcanic':
      for(let i=0;i<8;i++){ const x=rndX(),z=rndZ(); placeDeco('lava',()=>{ const m=B.MeshBuilder.CreateBox('lavaS',{width:1.4,height:0.03,depth:0.12},scene); m.material=stdMat('lavaM',hexC3('#ff5a1a'),{emissive:hexC3('#ff5a1a'),disableLighting:true}); return m; },x,yAt(x,z)+0.03,z,{rot:new B.Vector3(0,Math.random()*3,0)}); }
      for(let i=0;i<3;i++){ const x=xc+(Math.random()*2-1)*7,z=(Math.random()*2-1)*7; terrain.ps.push(makeFlame(new B.Vector3(x,0.2,z))); } break;
    case 'swamp':
      for(let i=0;i<5;i++){ const x=rndX(),z=rndZ(); makeWater(new B.Vector3(x,0.04,z),2.4,'#3a6a5a'); }
      for(let i=0;i<8;i++){ const x=rndX(),z=rndZ(); placeDeco('svine',()=>{ const m=B.MeshBuilder.CreateCylinder('svineS',{height:1.6,diameter:0.05,tessellation:5},scene); m.material=stdMat('svineM',hexC3('#3a5030')); return m; },x,1.2,z); } break;
    case 'coastal':
      makeWater(new B.Vector3(xc+side*7,0.02,0),6,'#2a6a9a');
      for(let i=0;i<10;i++){ const x=xc-side*Math.random()*6,z=rndZ(); placeDeco('grass',grassB('#9aa86a'),x,yAt(x,z)+0.15,z); } break;
    default:
      for(let i=0;i<5;i++){ const x=rndX(),z=rndZ(); placeDeco('rock',rockB(pal.feature),x,yAt(x,z)+0.2,z,{rot:new B.Vector3(Math.random(),Math.random(),0)}); }
  }
}

function updateTerrainAnim(dt) {
  if (!terrain) return;
  terrain.t += dt;
  for (const a of terrain.anims) {
    if      (a.type==='shimmer') { a.tex.uOffset+=dt*0.03; a.tex.vOffset+=dt*0.012; }
    else if (a.type==='water')   { a.mesh.position.y=a.baseY+Math.sin(terrain.t*1.6+a.ph)*0.03; }
  }
}
function disposeTerrain() {
  if (!terrain) return;
  for (const ps of terrain.ps)    try { ps.dispose(); } catch(e){}
  for (const d  of terrain.deco)  try { d.dispose();  } catch(e){}
  for (const s  of terrain.decoSrc) try { s.dispose(); } catch(e){}
  for (const g  of terrain.grounds) {
    if (g.material&&g.material.diffuseTexture) try { g.material.diffuseTexture.dispose(); } catch(e){}
    try { g.dispose(); } catch(e){}
  }
  for (const m of terrain.mats) try { m.dispose(); } catch(e){}
  terrain = null;
}

// ======================================================================
//  RACE TEMPLATES
// ======================================================================
const RACE_DEFAULTS = {
  overallScale:1, bodyShape:'cylinder', headShape:'sphere',
  bodyScaleX:1, bodyScaleY:1, headScale:1, bodyTilt:0, hoverY:0, bob:'normal',
  emissive:0, metallic:false, bodyTint:null, headTint:null, limbTint:null,
  extras:{}, pointLight:false, sparkle:false,
};
const RACE_OVERRIDES = {
  humans:{},
  orcs:{ bodyScaleX:1.4, bodyScaleY:0.85, headScale:1.2,
    bodyTint:()=>hexC3('#3a5a3a'), headTint:()=>hexC3('#3a5a3a'), limbTint:()=>hexC3('#2f4a2f'),
    extras:{ shoulderPads:true, thickArms:true } },
  elves:{ bodyScaleX:0.75, bodyScaleY:1.25, headScale:0.8, emissive:0.22, extras:{ robe:true } },
  dwarves:{ bodyScaleX:1.5, bodyScaleY:0.65, limbTint:c=>c.scale(0.55), extras:{ armor:true, helmet:true } },
  frostborn:{ bodyScaleX:1.2, bodyScaleY:0.9, bodyTint:c=>mix3(c,hexC3('#dfeefc'),0.45), extras:{ furCollar:true } },
  giants:{ overallScale:2, headScale:1.3, bodyTint:()=>hexC3('#6b6b6b'), headTint:()=>hexC3('#6b6b6b'), limbTint:()=>hexC3('#565656'), extras:{ belt:true } },
  goblins:{ overallScale:0.6, bodyTilt:0.26, headScale:1.4, bob:'erratic', limbTint:()=>hexC3('#23252b') },
  undead:{ bodyScaleX:0.8, bodyTilt:0.12, headShape:'flatsphere', bodyTint:c=>desat(c), headTint:()=>hexC3('#cfcabb'), limbTint:()=>hexC3('#9a958a'), extras:{ eyes:true } },
  infernals:{ bodyScaleX:1.1, bodyScaleY:1.2, emissive:0.5, bodyTint:c=>mix3(hexC3('#1a0e0e'),c,0.4), extras:{ horns:true }, pointLight:true },
  lizardfolk:{ headScale:1.05, bodyTint:c=>mix3(c,hexC3('#2f6a3a'),0.4), extras:{ tail:true } },
  avians:{ bodyScaleX:0.85, bodyScaleY:1.1, headScale:0.85, bodyTint:c=>mix3(c,hexC3('#dfe6ee'),0.2), extras:{ wings:true } },
  fae:{ overallScale:0.9, bodyScaleX:0.65, hoverY:0.3, headScale:0.8, emissive:0.6, sparkle:true },
  merfolk:{ bodyTint:c=>mix3(c,hexC3('#3a7ad0'),0.4), bob:'slither', extras:{ fin:true } },
  constructs:{ bodyShape:'box', headShape:'box', metallic:true, bob:'none', bodyTint:()=>hexC3('#6a6e76'), headTint:()=>hexC3('#5a5e66'), extras:{ leds:true } },
  beastfolk:{ bodyTilt:0.35, bob:'prowl', bodyTint:c=>mix3(hexC3('#6b4a2f'),c,0.35), extras:{ longArms:true } },
  insectoids:{ bodyScaleX:0.8, headShape:'icosphere', bob:'skitter', bodyTint:c=>mix3(hexC3('#1a1a22'),c,0.4), extras:{ fourArms:true } },
};
function getRaceProfile(race) {
  const o = RACE_OVERRIDES[race] || {};
  return Object.assign({}, RACE_DEFAULTS, o, { extras: Object.assign({}, o.extras||{}) });
}

function buildRaceTemplate(civ) {
  const p = getRaceProfile(civ.race);
  const civC = hexC3(civ.color);
  const S = civ.side;
  const bodyCol = p.bodyTint ? p.bodyTint(civC) : civC.clone();
  const headCol = p.headTint ? p.headTint(civC) : civC.scale(1.15);
  const limbCol = p.limbTint ? p.limbTint(civC) : civC.scale(0.7);
  const matBody = stdMat('body_'+S, bodyCol, { emissive:p.emissive?bodyCol.scale(p.emissive):null, metallic:p.metallic });
  const matHead = stdMat('head_'+S, headCol, { emissive:p.emissive?headCol.scale(p.emissive*0.6):null, metallic:p.metallic });
  const matLimb = stdMat('limb_'+S, limbCol, { metallic:p.metallic });
  const owned=[], ownedMats=[];
  function src(mesh, mat, castShadow) {
    mesh.material=mat; mesh.isVisible=false; mesh.isPickable=false; mesh.position.y=-50;
    owned.push(mesh);
    if (mat && ownedMats.indexOf(mat)<0) ownedMats.push(mat);
    if (castShadow) shadowGen.addShadowCaster(mesh);
    return mesh;
  }
  const bodySrc = src(p.bodyShape==='box'
    ? B.MeshBuilder.CreateBox('b_'+S,{width:0.5,height:0.9,depth:0.36},scene)
    : B.MeshBuilder.CreateCylinder('b_'+S,{height:0.9,diameterTop:0.42,diameterBottom:0.5,tessellation:10},scene),
    matBody, true);
  let headSrc;
  if      (p.headShape==='box')      headSrc=B.MeshBuilder.CreateBox('h_'+S,{size:0.42},scene);
  else if (p.headShape==='icosphere') headSrc=B.MeshBuilder.CreateIcoSphere('h_'+S,{radius:0.25,subdivisions:1},scene);
  else                                headSrc=B.MeshBuilder.CreateSphere('h_'+S,{diameter:0.5,segments:10},scene);
  src(headSrc, matHead, true);
  const limbSrc = src(B.MeshBuilder.CreateCylinder('l_'+S,{height:0.5,diameter:0.16,tessellation:6},scene), matLimb, true);
  const legH=0.5, bsx=p.bodyScaleX, bsy=p.bodyScaleY;
  const bodyH=0.9*bsy, bodyY=legH+bodyH/2, bodyR=0.25*bsx;
  const headR=0.25*p.headScale, headY=legH+bodyH+headR*0.9;
  const shoulderY=legH+bodyH*0.78;
  const armX=bodyR+0.05, armThick=p.extras.thickArms?1.6:1, armLen=p.extras.longArms?0.62:0.46;
  const topY=headY+headR;
  const defs=[];
  const def=(s,pos,scl,rot)=>defs.push({src:s,pos,scale:scl||[1,1,1],rot:rot||[0,0,0]});
  def(bodySrc,[0,bodyY,0],[bsx,bsy,bsx]);
  def(headSrc,[0,headY,0],[p.headScale,p.headScale*(p.headShape==='flatsphere'?0.8:1),p.headScale]);
  def(limbSrc,[armX,shoulderY,0],[armThick,armLen/0.5,armThick],[0,0,-0.32]);
  def(limbSrc,[-armX,shoulderY,0],[armThick,armLen/0.5,armThick],[0,0,0.32]);
  if (!p.extras.fin) { def(limbSrc,[0.12,0.25,0]); def(limbSrc,[-0.12,0.25,0]); }
  const ex=p.extras;
  if (ex.shoulderPads) { const m=src(B.MeshBuilder.CreateBox('pad_'+S,{size:0.2},scene),stdMat('pad_'+S,civC),false); def(m,[armX+0.02,shoulderY+0.06,0],[1,0.7,1.2]); def(m,[-armX-0.02,shoulderY+0.06,0],[1,0.7,1.2]); }
  if (ex.robe) { const m=src(B.MeshBuilder.CreateCylinder('robe_'+S,{height:bodyH*1.15,diameterTop:0.5*bsx,diameterBottom:0.78*bsx,tessellation:10},scene),stdMat('robe_'+S,civC,{emissive:civC.scale(0.18)}),true); def(m,[0,bodyY-0.04,0]); }
  if (ex.armor) { const m=src(B.MeshBuilder.CreateCylinder('arm_'+S,{height:bodyH*0.96,diameterTop:0.5,diameterBottom:0.56,tessellation:10},scene),stdMat('armor_'+S,hexC3('#8a8d94'),{metallic:true}),true); def(m,[0,bodyY,0],[bsx*1.05,1,bsx*1.05]); }
  if (ex.helmet) { const m=src(B.MeshBuilder.CreateBox('helm_'+S,{width:0.46,height:0.28,depth:0.46},scene),stdMat('helm_'+S,hexC3('#9a9da4'),{metallic:true}),false); def(m,[0,headY+headR*0.55,0],[p.headScale,p.headScale,p.headScale]); }
  if (ex.furCollar) { const m=src(B.MeshBuilder.CreateTorus('fur_'+S,{diameter:0.55,thickness:0.14,tessellation:10},scene),stdMat('fur_'+S,hexC3('#eef3f8')),false); def(m,[0,legH+bodyH-0.02,0],[bsx,1,bsx]); }
  if (ex.belt) { const m=src(B.MeshBuilder.CreateTorus('belt_'+S,{diameter:bodyR*2.3,thickness:0.1,tessellation:10},scene),stdMat('belt_'+S,civC,{emissive:civC.scale(0.2)}),false); def(m,[0,bodyY-bodyH*0.15,0]); }
  if (ex.horns) { const m=src(B.MeshBuilder.CreateCylinder('horn_'+S,{height:0.3,diameterTop:0,diameterBottom:0.12,tessellation:6},scene),stdMat('horn_'+S,hexC3('#2a1414')),false); def(m,[0.13*p.headScale,headY+headR*0.7,0],[1,1,1],[0,0,-0.3]); def(m,[-0.13*p.headScale,headY+headR*0.7,0],[1,1,1],[0,0,0.3]); }
  if (ex.eyes) { const m=src(B.MeshBuilder.CreateSphere('eye_'+S,{diameter:0.07,segments:4},scene),stdMat('eye_'+S,hexC3('#ff2a1a'),{emissive:hexC3('#ff2a1a'),disableLighting:true}),false); def(m,[0.08,headY+0.02,headR*0.85]); def(m,[-0.08,headY+0.02,headR*0.85]); }
  if (ex.tail) { const m=src(B.MeshBuilder.CreateCylinder('tail_'+S,{height:0.5,diameterTop:0.04,diameterBottom:0.16,tessellation:6},scene),stdMat('tail_'+S,bodyCol),false); def(m,[0,legH+0.12,-bodyR-0.14],[1,1,1],[-0.9,0,0]); }
  if (ex.wings) { const m=src(B.MeshBuilder.CreateBox('wing_'+S,{width:0.55,height:0.32,depth:0.04},scene),stdMat('wing_'+S,mix3(civC,hexC3('#ffffff'),0.3),{emissive:civC.scale(0.1)}),false); def(m,[bodyR+0.05,shoulderY,-0.08],[1,1,1],[0,-0.5,0.2]); def(m,[-bodyR-0.05,shoulderY,-0.08],[1,1,1],[0,0.5,0.2]); }
  if (ex.fourArms) { const sY2=legH+bodyH*0.45; def(limbSrc,[armX,sY2,0],[0.85,armLen/0.55,0.85],[0,0,-0.5]); def(limbSrc,[-armX,sY2,0],[0.85,armLen/0.55,0.85],[0,0,0.5]); }
  if (ex.fin) {
    const m1=src(B.MeshBuilder.CreateCylinder('fin_'+S,{height:0.5,diameterTop:0.42,diameterBottom:0.06,tessellation:8},scene),stdMat('fin_'+S,bodyCol),true); def(m1,[0,0.25,0]);
    const m2=src(B.MeshBuilder.CreateBox('fluke_'+S,{width:0.5,height:0.05,depth:0.18},scene),stdMat('fluke_'+S,mix3(bodyCol,hexC3('#3a7ad0'),0.4)),false); def(m2,[0,0.03,0]);
  }
  if (ex.leds) { const m=src(B.MeshBuilder.CreateBox('led_'+S,{size:0.07},scene),stdMat('led_'+S,civC,{emissive:civC,disableLighting:true}),false); def(m,[0,bodyY+0.12,bodyR*0.9]); def(m,[0.12,bodyY-0.05,bodyR*0.9]); def(m,[-0.12,bodyY-0.05,bodyR*0.9]); }

  // ---- Tech-age weapon, carried in the right hand (Stone → Stellar) ----
  const wAge=civ.techAge|0, wx=armX+0.08, wy=bodyY-0.02, wz=bodyR+0.12;
  const steel=hexC3('#9a9da4'), woodC=hexC3('#6b4a2f'), gunMetal=hexC3('#2c2f36');
  if (wAge<=0) {
    const m=src(B.MeshBuilder.CreateCylinder('wp_'+S,{height:0.5,diameterTop:0.17,diameterBottom:0.07,tessellation:6},scene),stdMat('wpm_'+S,hexC3('#7a5a3a')),false);
    def(m,[wx,wy+0.12,wz],[1,1,1],[0.45,0,0]);
  } else if (wAge===1) {
    const sh=src(B.MeshBuilder.CreateCylinder('wp_'+S,{height:1.15,diameter:0.05,tessellation:6},scene),stdMat('wpm_'+S,woodC),false); def(sh,[wx,wy+0.28,wz],[1,1,1],[0.18,0,0]);
    const tp=src(B.MeshBuilder.CreateCylinder('wt_'+S,{height:0.22,diameterTop:0,diameterBottom:0.1,tessellation:6},scene),stdMat('wtm_'+S,hexC3('#c08a3a'),{metallic:true}),false); def(tp,[wx,wy+0.92,wz+0.04],[1,1,1],[0.18,0,0]);
  } else if (wAge<=3) {
    const bl=src(B.MeshBuilder.CreateBox('wp_'+S,{width:0.07,height:0.64,depth:0.03},scene),stdMat('wpm_'+S,steel,{metallic:true}),false); def(bl,[wx,wy+0.34,wz],[1,1,1],[0.22,0,0]);
    const gd=src(B.MeshBuilder.CreateBox('wg_'+S,{width:0.24,height:0.05,depth:0.07},scene),stdMat('wgm_'+S,hexC3('#6b5a2f')),false); def(gd,[wx,wy+0.04,wz],[1,1,1],[0.22,0,0]);
  } else if (wAge<=5) {
    const br=src(B.MeshBuilder.CreateCylinder('wp_'+S,{height:1.05,diameter:0.05,tessellation:6},scene),stdMat('wpm_'+S,gunMetal,{metallic:true}),false); def(br,[wx,wy+0.2,wz+0.06],[1,1,1],[1.35,0,0]);
    const st=src(B.MeshBuilder.CreateBox('ws_'+S,{width:0.06,height:0.3,depth:0.08},scene),stdMat('wsm_'+S,woodC),false); def(st,[wx,wy+0.02,wz-0.2],[1,1,1],[1.35,0,0]);
  } else if (wAge<=7) {
    const rb=src(B.MeshBuilder.CreateBox('wp_'+S,{width:0.06,height:0.72,depth:0.12},scene),stdMat('wpm_'+S,gunMetal,{metallic:true}),false); def(rb,[wx,wy+0.16,wz+0.04],[1,1,1],[1.4,0,0]);
  } else {
    const rb=src(B.MeshBuilder.CreateBox('wp_'+S,{width:0.07,height:0.62,depth:0.1},scene),stdMat('wpm_'+S,gunMetal,{metallic:true}),false); def(rb,[wx,wy+0.16,wz+0.04],[1,1,1],[1.4,0,0]);
    const cl=src(B.MeshBuilder.CreateCylinder('wc_'+S,{height:0.3,diameter:0.11,tessellation:8},scene),stdMat('wcm_'+S,civC,{emissive:civC,disableLighting:true}),false); def(cl,[wx,wy+0.42,wz+0.1],[1,1,1],[1.4,0,0]);
  }

  return { type:'procedural', profile:p, partDefs:defs, owned, mats:ownedMats, topY };
}

function pickType(focus, i) { const pool=FOCUS_UNIT_POOLS[focus]||['infantry']; return pool[i%pool.length]; }
function applyTypeScale(type) { return type==='cavalry'?1.12:type==='archer'?0.92:1.0; }
function armyToUnits(army) { return clamp(Math.round(army/220), 14, 64); }
function makeSparkle(node, hex) {
  const ps=new B.ParticleSystem('sparkle',60,scene);
  ps.particleTexture=particleTex; ps.emitter=node;
  ps.minEmitBox=new B.Vector3(-0.2,0.4,-0.2); ps.maxEmitBox=new B.Vector3(0.2,1.4,0.2);
  ps.blendMode=B.ParticleSystem.BLENDMODE_ADD;
  ps.color1=col4(hex,0.9); ps.color2=col4('#ffffff',0.8); ps.colorDead=col4(hex,0);
  ps.minSize=0.04; ps.maxSize=0.12; ps.minLifeTime=0.4; ps.maxLifeTime=0.9;
  ps.emitRate=16; ps.minEmitPower=0.1; ps.maxEmitPower=0.4; ps.gravity=new B.Vector3(0,0.6,0);
  ps.start(); return ps;
}

// ======================================================================
//  SETTLEMENTS
// ======================================================================
function buildSettlement(techAge, civHex, sc, industry) {
  const node = new B.TransformNode('settlement', scene);
  node.metadata = { anim:[], meshes:[], mats:[], ps:[], t:0 };
  const civC = hexC3(civHex);
  const add = (mesh, mat, x, y, z) => {
    mesh.material=mat; mesh.parent=node;
    if (x!=null) mesh.position.set(x,y,z);
    mesh.receiveShadows=true; shadowGen.addShadowCaster(mesh);
    node.metadata.meshes.push(mesh);
    if (mat && node.metadata.mats.indexOf(mat)<0) node.metadata.mats.push(mat);
    return mesh;
  };
  const M=(name,color,opts)=>stdMat(name,color,opts);
  if (techAge<=1) {
    add(B.MeshBuilder.CreateCylinder('hb',{height:0.8,diameter:2,tessellation:12},scene),M('mud',hexC3('#6b4f33')),0,0.4,0);
    add(B.MeshBuilder.CreateCylinder('hr',{height:0.6,diameterTop:0,diameterBottom:2.2,tessellation:12},scene),M('thatch',hexC3('#9a7b48')),0,1.1,0);
  } else if (techAge===2) {
    add(B.MeshBuilder.CreateBox('lh',{width:3,height:0.8,depth:1.5},scene),M('wood',hexC3('#6b4a2f')),0,0.4,0);
    const rM=M('roof',hexC3('#5a3d28'));
    const r1=add(B.MeshBuilder.CreateBox('r1',{width:3,height:0.1,depth:1.05},scene),rM,0,0.98,0.42); r1.rotation.x=0.62;
    const r2=add(B.MeshBuilder.CreateBox('r2',{width:3,height:0.1,depth:1.05},scene),rM,0,0.98,-0.42); r2.rotation.x=-0.62;
  } else if (techAge===3) {
    add(B.MeshBuilder.CreateBox('keep',{width:1.5,height:2,depth:1.5},scene),M('stone',hexC3('#7d7f86')),0,1,0);
    const bm=M('batt',hexC3('#6b6d74'));
    [[-0.6,-0.6],[0.6,-0.6],[-0.6,0.6],[0.6,0.6]].forEach((c,i)=>add(B.MeshBuilder.CreateBox('bt'+i,{size:0.35},scene),bm,c[0],2.1,c[1]));
    add(B.MeshBuilder.CreateCylinder('twr',{height:2.6,diameter:0.7,tessellation:10},scene),M('twr',hexC3('#73757c')),1.0,1.3,0);
  } else if (techAge===4) {
    add(B.MeshBuilder.CreateBox('th',{width:3,height:1.5,depth:2},scene),M('plaster',hexC3('#b9ab8f')),0,0.75,0);
    const win=M('win',hexC3('#23252b'));
    for(let i=-1;i<=1;i++) add(B.MeshBuilder.CreateBox('w'+i,{width:0.3,height:0.7,depth:0.06},scene),win,i*0.9,0.8,1.01);
    add(B.MeshBuilder.CreateSphere('dome',{diameter:1.2,segments:12,slice:0.5},scene),M('dome',civC,{emissive:civC.scale(0.1)}),0,1.5,0);
  } else if (techAge===5) {
    add(B.MeshBuilder.CreateBox('fac',{width:3.2,height:1.2,depth:2},scene),M('brick',hexC3('#4a3a34')),0,0.6,0);
    const stM=M('stack',hexC3('#3a2f2b')), glM=M('sglow',hexC3('#ff7a2a'),{emissive:hexC3('#ff7a2a'),disableLighting:true});
    const stacks=industry?3:2;
    for(let i=0;i<stacks;i++) {
      add(B.MeshBuilder.CreateCylinder('st'+i,{height:2,diameter:0.4,tessellation:8},scene),stM,-0.8+i*0.8,1.6,-0.4);
      add(B.MeshBuilder.CreateCylinder('sg'+i,{height:0.18,diameter:0.44,tessellation:8},scene),glM,-0.8+i*0.8,2.6,-0.4);
    }
    const gear=add(B.MeshBuilder.CreateCylinder('gear',{height:0.12,diameter:1,tessellation:12},scene),M('gear',hexC3('#6b5a45')),1.2,1.0,1.05);
    gear.rotation.x=Math.PI/2;
    node.metadata.anim.push({type:'spin',mesh:gear,speed:1.2});
  } else if (techAge===6) {
    const gl=M('glass',hexC3('#3a5d7a'));
    gl.specularColor=new B.Color3(0.8,0.85,0.95); gl.specularPower=128; gl.alpha=0.96;
    add(B.MeshBuilder.CreateBox('off',{width:2,height:3,depth:1},scene),gl,0,1.5,0);
    const li=M('mull',hexC3('#1a2230'));
    for(let y=0;y<5;y++) add(B.MeshBuilder.CreateBox('gl'+y,{width:2.02,height:0.05,depth:1.02},scene),li,0,0.5+y*0.55,0);
  } else {
    const tM=M('mega',hexC3('#2a3550')), pM=M('panel',civC,{emissive:civC.scale(industry?1.0:0.7),disableLighting:true});
    add(B.MeshBuilder.CreateBox('mt1',{width:0.9,height:3.4,depth:0.9},scene),tM,-0.9,1.7,0);
    add(B.MeshBuilder.CreateBox('mt2',{width:0.9,height:2.6,depth:0.9},scene),tM,0.9,1.3,0);
    add(B.MeshBuilder.CreateBox('p1',{width:0.95,height:0.5,depth:0.95},scene),pM,-0.9,2.6,0);
    add(B.MeshBuilder.CreateBox('p2',{width:0.95,height:0.5,depth:0.95},scene),pM,0.9,2.0,0);
    const beamM=M('beam',civC,{emissive:civC,disableLighting:true});
    const beam=add(B.MeshBuilder.CreateCylinder('beam',{height:1.8,diameter:0.12,tessellation:6},scene),beamM,0,2.3,0);
    beam.rotation.z=Math.PI/2;
    node.metadata.anim.push({type:'pulse',mat:beamM,base:civC});
    const orb=add(B.MeshBuilder.CreateIcoSphere('mfloat',{radius:0.4,subdivisions:1},scene),pM,0,3.4,0);
    node.metadata.anim.push({type:'float',mesh:orb,baseY:3.4});
  }
  if (industry&&techAge>=5) {
    for (const m of node.metadata.mats) if (m.emissiveColor) m.emissiveColor=clampC(m.emissiveColor.scale(1.6));
  }
  return node;
}
function disposeSettlement(rec) {
  const node=rec&&rec.node; if(!node) return;
  const md=node.metadata||{};
  if(md.ps)     for(const ps of md.ps) try{ps.dispose()}catch(e){}
  if(md.meshes) for(const m  of md.meshes) try{m.dispose()}catch(e){}
  if(md.mats)   for(const m  of md.mats)   try{m.dispose()}catch(e){}
  try{node.dispose()}catch(e){}
}
function updateSettlementAnim(node, dt) {
  const md=node.metadata; if(!md||!md.anim||!md.anim.length) return;
  md.t+=dt;
  for(const a of md.anim) {
    if      (a.type==='spin')  a.mesh.rotate(B.Axis.Y, a.speed*dt, B.Space.LOCAL);
    else if (a.type==='float') a.mesh.position.y=a.baseY+Math.sin(md.t*1.5)*0.2;
    else if (a.type==='pulse') a.mat.emissiveColor=a.base.scale(0.5+0.5*Math.abs(Math.sin(md.t*2)));
  }
}

// ======================================================================
//  FLASH EFFECT
// ======================================================================
function flashScreen(toAlpha) {
  const f = document.getElementById('battle3d-flash');
  if (!f) return;
  f.style.transition='none'; f.style.opacity=String(toAlpha);
  requestAnimationFrame(()=>{ f.style.transition='opacity 0.5s ease'; f.style.opacity='0'; });
}

// ======================================================================
//  BATTLE3D CLASS
// ======================================================================
class Battle3D {
  constructor({ canvas, civs, outcome, onDone, endYear }) {
    this._canvas   = canvas;
    this._civs     = civs.filter(Boolean);
    this._outcome  = outcome;
    this._onDone   = onDone || function(){};
    this._endYear  = endYear || 1000;
    this.battleLog = [];

    if (outcome.threeWay) {
      this._threeWay = true;
      this._entries  = outcome.entries;
      // entries sorted descending by roll: [0]=winner, [1]=runner-up, [2]=third
      const sorted = [...this._entries].sort((a,b)=>a.rank-b.rank);
      this.winner  = outcome.winner;
      this.loser   = sorted[1].civ;     // runner-up (last to fall)
      this._loser1 = sorted[2] ? sorted[2].civ : null;   // first to fall
      this.invader = sorted[0].civ;
      this.defender= sorted[1].civ;
      this.winnerCasualtyPct = sorted[0].casualtyPct;
    } else {
      this._threeWay = false;
      this.invader   = outcome.invader;
      this.defender  = outcome.defender;
      this.winner    = outcome.winner;
      this.loser     = outcome.loser;
      this._loser1   = null;
      this.winnerCasualtyPct = outcome.winnerCasualtyPct;
    }

    this.civsBySide = {};
    this._civs.forEach(c => this.civsBySide[c.side] = c);

    this.units        = [];
    this.settlements  = [];
    this.startCount   = {};
    this.specialFired = {};
    this.phase        = 'spawn';
    this.phaseTime    = 0;
    this.t            = 0;
    this.killAcc      = 0;
    this._id          = 0;
    this._done        = false;
    this._doneFired   = false;
    this._activeParticles = [];
    this._loser1Cleared   = false;
    this._pointLights = 0;
    this._sparkles    = 0;
    this.MAX_POINT_LIGHTS = 2;
    this.MAX_SPARKLES     = 4;
    this.templates = {};
    this._resizeHandler = null;
  }

  start() {
    // Create engine + scene
    engine = new B.Engine(this._canvas, true, { stencil:true, preserveDrawingBuffer:true });
    engine.resize();
    scene  = new B.Scene(engine);
    scene.clearColor = col4('#0a0c12', 1);

    camera = new B.ArcRotateCamera('cam', -Math.PI/2, 1.02, 28, new B.Vector3(0,1.2,0), scene);
    camera.attachControl(this._canvas, true);
    camera.lowerRadiusLimit=12; camera.upperRadiusLimit=64;
    camera.lowerBetaLimit=0.20; camera.upperBetaLimit=1.46;
    camera.wheelDeltaPercentage=0.01; camera.panningSensibility=0;

    hemi = new B.HemisphericLight('hemi', new B.Vector3(0,1,0), scene);
    hemi.intensity=0.55; hemi.groundColor=hexC3('#10141d');

    dirLight = new B.DirectionalLight('sun', new B.Vector3(-0.6,-1,0.45), scene);
    dirLight.position=new B.Vector3(22,42,-18); dirLight.intensity=0.95;

    shadowGen = new B.ShadowGenerator(1024, dirLight);
    shadowGen.useBlurExponentialShadowMap=true; shadowGen.blurKernel=16; shadowGen.darkness=0.55;

    glow = new B.GlowLayer('glow', scene); glow.intensity=0.7;

    particleTex = makeSoftParticleTexture();

    mageOrbSrc = B.MeshBuilder.CreateSphere('mageOrbSrc',{diameter:0.34,segments:6},scene);
    const om = new B.StandardMaterial('mageOrbMat',scene);
    om.emissiveColor=hexC3('#bfe6ff'); om.diffuseColor=hexC3('#bfe6ff'); om.disableLighting=true;
    mageOrbSrc.material=om; mageOrbSrc.isVisible=false; mageOrbSrc.isPickable=false;

    // Terrain from civs' biomes
    const biomeA = this._civs[0]&&this._civs[0].biome || 'forest';
    const biomeB = this._civs[1]&&this._civs[1].biome || 'plains';
    buildTerrain(biomeA, biomeB);

    // Race templates
    for (const civ of this._civs) this.templates[civ.side] = buildRaceTemplate(civ);
    this.groundY = 0;

    // Spawn armies (3-way: winner=left, runner-up=right, third=front)
    if (this._threeWay) {
      const sorted = [...this._entries].sort((a,b)=>a.rank-b.rank);
      this.spawnSide(sorted[0].civ, -1);
      this.spawnSide(sorted[1].civ, +1);
      if (sorted[2]) this.spawnSide(sorted[2].civ, 0);
      this.spawnSettlements(sorted[0].civ, -1);
      this.spawnSettlements(sorted[1].civ, +1);
      if (sorted[2]) this.spawnSettlements(sorted[2].civ, 0);
    } else {
      this.spawnSide(this.invader,  -1);
      this.spawnSide(this.defender, +1);
      this.spawnSettlements(this.invader,  -1);
      this.spawnSettlements(this.defender, +1);
    }

    // Attrition targets
    const sW = this.startCount[this.winner.side]  || 1;
    const sL = this.startCount[this.loser.side]   || 1;
    this.winnerSurvivors  = Math.max(1, Math.round(sW*(1-this.winnerCasualtyPct)));
    this.loserFloor       = Math.max(1, Math.round(sL*0.12));
    this.winnerKillChance = clamp(this.winnerCasualtyPct*0.85, 0.05, 0.85);
    if (this._loser1) {
      const sL1 = this.startCount[this._loser1.side] || 1;
      this.loser1Floor = Math.max(1, Math.round(sL1*0.12));
    }

    // Log
    for (const civ of this._civs) this.log(`${civ.name} fields ${typeof formatNum!=='undefined' ? formatNum(civ.army) : civ.army} soldiers.`);
    if (this._threeWay) this.log('Three powers converge for the final war.');
    else this.log(`${this.invader.name} marches to attack.`);
    this.updateUI();

    // Own render loop
    const self = this;
    let last = performance.now();
    engine.runRenderLoop(() => {
      const now = performance.now();
      const dt = Math.min((now-last)/1000, 0.1); last = now;
      self.step(dt);
      updateTerrainAnim(dt);
      scene.render();
    });

    this._resizeHandler = () => engine && engine.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  spawnSide(civ, dir) {
    const n = armyToUnits(civ.army);
    this.startCount[civ.side] = n;
    const cols=6, spacing=1.05, rows=Math.ceil(n/cols);
    let k=0;
    for (let r=0; r<rows&&k<n; r++) {
      for (let c=0; c<cols&&k<n; c++) {
        let x, z, marchX, marchZ;
        if (dir===0) {
          x=(c-(cols-1)/2)*spacing*1.15; z=7-r*spacing;
          marchX=x+(Math.random()-0.5)*0.3; marchZ=0.8+r*0.10;
        } else {
          z=(c-(cols-1)/2)*spacing*1.15; x=dir*(7-r*spacing);
          marchX=dir*(0.8+r*0.10); marchZ=z+(Math.random()-0.5)*0.3;
        }
        const type=pickType(civ.focus, k);
        const u=this.spawnOne(civ, new B.Vector3(x, this.groundY, z), type);
        u.home=u.mesh.position.clone();
        u.marchTarget=new B.Vector3(marchX, u.baseY, marchZ);
        this.units.push(u); k++;
      }
    }
  }

  spawnOne(civ, pos, type) {
    const tmpl = this.templates[civ.side];
    const node = new B.TransformNode('sol'+(this._id++), scene);
    node.position.copyFrom(pos);
    let profile, parts=[], orb=null, light=null, sparkle=null, topY=1.4;
    if (tmpl.type==='glb') {
      profile = getRaceProfile(civ.race);
    } else {
      profile=tmpl.profile; topY=tmpl.topY;
      for (const d of tmpl.partDefs) {
        const inst=d.src.createInstance('p'+this._id+'_'+parts.length);
        inst.parent=node;
        inst.position.set(d.pos[0],d.pos[1],d.pos[2]);
        inst.scaling.set(d.scale[0],d.scale[1],d.scale[2]);
        inst.rotation.set(d.rot[0],d.rot[1],d.rot[2]);
        parts.push(inst);
      }
    }
    const sc=profile.overallScale*applyTypeScale(type);
    node.scaling.setAll(sc);
    if (profile.bodyTilt) node.rotation.x=profile.bodyTilt;
    const baseY=pos.y+(profile.hoverY||0);
    node.position.y=baseY;
    if (type==='mage') { orb=mageOrbSrc.createInstance('orb'+this._id); orb.parent=node; orb.position.y=topY+0.2; }
    if (profile.pointLight&&this._pointLights<this.MAX_POINT_LIGHTS) {
      light=new B.PointLight('ifl'+this._id, new B.Vector3(0,topY*0.6,0), scene);
      light.parent=node; light.diffuse=hexC3(civ.color); light.specular=hexC3(civ.color);
      light.intensity=0.45; light.range=4.5; this._pointLights++;
    }
    if (profile.sparkle&&this._sparkles<this.MAX_SPARKLES) { sparkle=makeSparkle(node,civ.color); this._sparkles++; }
    return { mesh:node, parts, orb, light, sparkle,
      baseScale:new B.Vector3(sc,sc,sc), baseY, side:civ.side, civ, type,
      alive:true, dying:false, dead:false, deathT:0,
      bob:Math.random()*6.28, bobStyle:profile.bob, scatter:null };
  }

  spawnSettlements(civ, dir) {
    const N=4, industry=civ.focus==='industry';
    for (let i=0; i<N; i++) {
      let pos;
      if (dir===0) pos=new B.Vector3((i-(N-1)/2)*2.7, 0, 9+(i%2)*1.6);
      else         pos=new B.Vector3(dir*(9+(i%2)*1.6), 0, (i-(N-1)/2)*2.7);
      const age=civ.techAge|0;
      const node=buildSettlement(age, civ.color, scene, industry);
      node.position.copyFrom(pos);
      this.settlements.push({ civ, node, lastAge:age, pos, industry });
    }
  }

  stepSettlements(dt) {
    for (const rec of this.settlements) {
      const age=rec.civ.techAge|0;
      if (age!==rec.lastAge) {
        const at=rec.node.position.clone(); at.y+=1;
        disposeSettlement(rec);
        rec.node=buildSettlement(age, rec.civ.color, scene, rec.industry);
        rec.node.position.copyFrom(rec.pos);
        rec.lastAge=age;
        this.constructionBurst(at, rec.civ.color);
      }
      updateSettlementAnim(rec.node, dt);
    }
  }

  constructionBurst(at, hex) {
    const ps=new B.ParticleSystem('build',160,scene);
    ps.particleTexture=particleTex; ps.emitter=at;
    ps.minEmitBox=new B.Vector3(-0.8,0,-0.8); ps.maxEmitBox=new B.Vector3(0.8,0.4,0.8);
    ps.color1=col4('#b9a07a',0.9); ps.color2=col4(hex,0.8); ps.colorDead=col4('#b9a07a',0);
    ps.minSize=0.15; ps.maxSize=0.5; ps.minLifeTime=0.4; ps.maxLifeTime=1.0;
    ps.minEmitPower=1.5; ps.maxEmitPower=4; ps.gravity=new B.Vector3(0,-2,0);
    ps.emitRate=0; ps.manualEmitCount=160; ps.disposeOnStop=true;
    ps.start(); setTimeout(()=>ps.stop(),60);
    this._activeParticles.push(ps);
  }

  step(dt) {
    if (this._done) return;
    dt=Math.min(dt,0.05);
    this.t+=dt; this.phaseTime+=dt;
    if      (this.phase==='spawn')   this.stepSpawn();
    else if (this.phase==='march')   this.stepMarch(dt);
    else if (this.phase==='clash')   this.stepClash(dt);
    else if (this.phase==='resolve') this.stepResolve(dt);
    this.processDying(dt);
    this.stepSettlements(dt);
    this.updateUI();
  }

  bobUnit(u, ampMul, jitter) {
    if (u.bobStyle==='none') { u.mesh.position.y=u.baseY; return; }
    let amp=0.06*ampMul, fr=6;
    switch(u.bobStyle) {
      case 'erratic': amp*=1.7; fr=9;  break;
      case 'skitter': amp*=0.6; fr=16; break;
      case 'prowl':   amp*=0.8; fr=4;  break;
      case 'slither': amp*=0.5; fr=7;  break;
    }
    u.mesh.position.y=u.baseY+Math.sin(this.t*fr+u.bob)*amp;
    if (jitter) { u.mesh.position.x+=(Math.random()-0.5)*jitter; u.mesh.position.z+=(Math.random()-0.5)*jitter; }
  }

  stepSpawn() { if (this.phaseTime>0.8) { this.phase='march'; this.phaseTime=0; } }

  stepMarch(dt) {
    for (const civ of this._civs) {
      if (civ.weaponUnlocked&&!this.specialFired[civ.side]&&this.phaseTime>1.0) {
        this.specialFired[civ.side]=true; this.fireSpecial(civ);
      }
    }
    let arrived=0, alive=0;
    for (const u of this.units) {
      if (!u.alive||u.dying) continue; alive++;
      B.Vector3.LerpToRef(u.mesh.position, u.marchTarget, clamp(dt*1.8,0,1), u.mesh.position);
      this.bobUnit(u, 1.3, 0);
      if (B.Vector3.Distance(u.mesh.position, u.marchTarget)<0.45) arrived++;
    }
    if (this.phaseTime>5||(alive>0&&arrived/alive>0.7)) {
      this.phase='clash'; this.phaseTime=0; this.log('The armies clash!');
      if (typeof Sfx!=='undefined') Sfx.clash();
    }
  }

  stepClash(dt) {
    for (const u of this.units) {
      if (!u.alive||u.dying) continue;
      const push=(u.side===this.invader.side)?1:-1;
      u.mesh.position.x+=Math.sin(this.t*10+u.bob)*0.004*push;
      this.bobUnit(u, 0.8, 0.012);
    }
    this.killAcc+=dt;
    const TICK=0.05;
    while (this.killAcc>=TICK) {
      this.killAcc-=TICK;
      if (this._threeWay) {
        if (this._loser1&&!this._loser1Cleared) {
          if (this.aliveOf(this._loser1)>this.loser1Floor) this.killRandom(this._loser1);
          else {
            this._loser1Cleared=true;
            for(const u of this.units) if(u.civ===this._loser1&&u.alive) this.kill(u);
            this.log(`${this._loser1.name} falls from the field!`);
          }
        }
        if (this.aliveOf(this.loser)>this.loserFloor) this.killRandom(this.loser);
        if (this.aliveOf(this.winner)>this.winnerSurvivors&&Math.random()<this.winnerKillChance)
          this.killRandom(this.winner);
      } else {
        if (this.aliveOf(this.loser)>this.loserFloor) this.killRandom(this.loser);
        if (this.aliveOf(this.winner)>this.winnerSurvivors&&Math.random()<this.winnerKillChance)
          this.killRandom(this.winner);
      }
    }
    const losersDown = this._threeWay
      ? (this._loser1Cleared && this.aliveOf(this.loser)<=this.loserFloor)
      : this.aliveOf(this.loser)<=this.loserFloor;
    if (losersDown||this.phaseTime>7) {
      this.phase='resolve'; this.phaseTime=0;
      this.log(`${this.winner.name} ${this._threeWay?'stands triumphant':'routs the enemy'}!`);
      for(const u of this.units) if(u.civ!==this.winner&&u.alive) this.kill(u);
    }
  }

  stepResolve(dt) {
    camera.alpha+=0.002;
    for (const u of this.units) {
      if (u.civ!==this.winner||!u.alive||u.dying) continue;
      if (!u.scatter) u.scatter=new B.Vector3((Math.random()*2-1)*16, u.baseY, (Math.random()*2-1)*9);
      B.Vector3.LerpToRef(u.mesh.position, u.scatter, clamp(dt*0.8,0,1), u.mesh.position);
      this.bobUnit(u, 0.9, 0);
    }
    if (this.phaseTime>3.2&&!this._doneFired) {
      this._doneFired=true; this.phase='done'; this._done=true;
      if (engine) engine.stopRenderLoop();
      this._onDone();
    }
  }

  aliveOf(civ) { let n=0; for(const u of this.units) if(u.civ===civ&&u.alive) n++; return n; }
  killRandom(civ) { const pool=this.units.filter(u=>u.civ===civ&&u.alive&&!u.dying); if(pool.length) this.kill(pool[(Math.random()*pool.length)|0]); }
  kill(u) { if(u.alive){u.alive=false;u.dying=true;u.deathT=0;} }

  processDying(dt) {
    for (const u of this.units) {
      if (!u.dying||u.dead) continue;
      u.deathT+=dt;
      const k=Math.max(0,1-u.deathT/0.45);
      u.mesh.scaling.set(u.baseScale.x*k, u.baseScale.y*k, u.baseScale.z*k);
      u.mesh.position.y=u.baseY-(1-k)*0.5;
      if (k<=0) {
        u.dead=true; u.mesh.setEnabled(false);
        if(u.orb) u.orb.setEnabled(false);
        if(u.light) u.light.setEnabled(false);
        if(u.sparkle) u.sparkle.stop();
      }
    }
  }

  fireSpecial(civ) {
    this.log(`${civ.name} unleashes ${civ.weapon||'their special weapon'}!`);
    if (typeof Sfx!=='undefined') Sfx.special();
    flashScreen(0.7);
    const at=new B.Vector3(0,0.9,0);
    const ps=new B.ParticleSystem('special_'+civ.side,800,scene);
    ps.particleTexture=particleTex; ps.emitter=at.clone();
    ps.minEmitBox=B.Vector3.Zero(); ps.maxEmitBox=B.Vector3.Zero();
    ps.blendMode=B.ParticleSystem.BLENDMODE_ADD;
    ps.startDirectionFunction=(wm,dir)=>{ const a=Math.random()*Math.PI*2; dir.x=Math.cos(a); dir.y=Math.random()*0.5; dir.z=Math.sin(a); };
    ps.minLifeTime=0.5; ps.maxLifeTime=1.1; ps.minSize=0.25; ps.maxSize=0.95;
    ps.minEmitPower=6; ps.maxEmitPower=15; ps.updateSpeed=0.02; ps.gravity=new B.Vector3(0,-3,0);
    ps.addColorGradient(0.00, col4('#ffffff',1));
    ps.addColorGradient(0.33, col4(civ.color,1));
    ps.addColorGradient(0.66, col4('#ffe14d',1));
    ps.addColorGradient(0.90, col4('#c04040',1));
    ps.addColorGradient(1.00, col4('#c04040',0));
    ps.emitRate=0; ps.manualEmitCount=800; ps.disposeOnStop=true;
    ps.start(); setTimeout(()=>ps.stop(),60);
    this._activeParticles.push(ps);
    const enemies=this.units.filter(u=>u.side!==civ.side&&u.alive&&!u.dying);
    const killCount=Math.floor(enemies.length*0.16);
    for(let i=0;i<killCount;i++){ const v=enemies[(Math.random()*enemies.length)|0]; if(v&&v.alive) this.kill(v); }
  }

  updateUI() {
    for (const civ of this._civs) {
      const s=civ.side, start=this.startCount[s]||1;
      const alive=Math.round(civ.army*this.aliveOf(civ)/start);
      const armyEl=document.getElementById(s+'-army'); if(armyEl) armyEl.textContent=(typeof formatNum!=='undefined'?formatNum(alive):alive);
      const nameEl=document.getElementById('name-'+s); if(nameEl){nameEl.textContent=civ.name;nameEl.style.color=civ.color;}
      const weapEl=document.getElementById(s+'-weapon'); if(weapEl) weapEl.textContent=civ.weaponUnlocked?('⚡ '+(civ.weapon||'Special')):'';
    }
    this._renderLog();
  }

  log(text) { this.battleLog.push({ year:this._endYear, text }); this._renderLog(); }

  _renderLog() {
    const el=document.getElementById('battle3d-log'); if(!el) return;
    el.innerHTML=this.battleLog.slice(-6).map(e=>
      `<div><b>Y${e.year}</b> · ${(typeof escapeHtml!=='undefined'?escapeHtml(e.text):e.text)}</div>`).join('');
  }

  resize() { if(engine) engine.resize(); }

  disposeEngine() {
    if (this._resizeHandler) { window.removeEventListener('resize', this._resizeHandler); this._resizeHandler=null; }
    try { if(engine){engine.stopRenderLoop();engine.dispose();} } catch(e){}
    engine=null; scene=null; camera=null; hemi=null; dirLight=null;
    shadowGen=null; glow=null; particleTex=null; mageOrbSrc=null;
    disposeTerrain();
    const c=this._canvas; if(c) c.style.display='none';
    const l=document.getElementById('battle3d-log'); if(l) l.style.display='none';
  }

  dispose() {
    for (const u of this.units) {
      for (const p of u.parts) try{p.dispose()}catch(e){}
      try{if(u.orb)u.orb.dispose()}catch(e){}
      try{if(u.light)u.light.dispose()}catch(e){}
      try{if(u.sparkle)u.sparkle.dispose()}catch(e){}
      try{u.mesh.dispose()}catch(e){}
    }
    for (const t of Object.values(this.templates||{})) {
      if(t.owned) for(const m of t.owned) try{m.dispose()}catch(e){}
      if(t.mats)  for(const m of t.mats)  try{m.dispose()}catch(e){}
    }
    for (const rec of this.settlements) try{disposeSettlement(rec)}catch(e){}
    for (const ps of this._activeParticles) try{ps.dispose()}catch(e){}
    this.units.length=0; this.settlements.length=0;
    this.disposeEngine();
  }

  isDone() { return this.phase==='done'; }
}

window.Battle3D = Battle3D;

})();
