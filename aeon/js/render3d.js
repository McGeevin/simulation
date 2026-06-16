// ============================================================
// AEON :: RENDERER3D
// Drop-in Babylon.js aerial replacement for the 2D Renderer.
// External interface matches Renderer exactly so main.js
// needs only one line changed: new Renderer → new Renderer3D.
// ============================================================

class Renderer3D {
  constructor(canvas, map) {
    // ── Public interface matching Renderer ──────────────────
    this.battleUnits = [];
    this.particles   = [];
    this.citizens    = [];
    this.waterTiles  = [];
    this.lavaTiles   = [];
    this.flashEffect = 0;

    this.canvas = canvas;
    this.map    = map;

    // ── Internal state ──────────────────────────────────────
    this._frameCount = 0;
    this._mode       = 'sim';
    this._civs       = [];
    this._year       = 0;

    // Settlement diff cache: key "x,y" → { tier, owner, isCapital, node, mats[] }
    this._settlementCache = {};

    // Citizen 3D instances
    this._citizenTemplate  = null;
    this._citizenInstances = [];

    // Battle-unit 3D instances
    this._unitTemplate  = null;
    this._unitInstances = [];

    // Particle pool
    this._psPool = [];

    // Flash overlay (reuse the div already in index.html)
    this._flashEl = document.getElementById('battle3d-flash');

    this._initScene();
  }

  // ──────────────────────────────────────────────────────────
  // Coordinate helpers
  // ──────────────────────────────────────────────────────────
  _tx(col)  { return  (col          / this.map.width)  * 44 - 22; }
  _tz(row)  { return  (row          / this.map.height) * 18 -  9; }
  _tcx(col) { return ((col + 0.5)   / this.map.width)  * 44 - 22; }
  _tcz(row) { return ((row + 0.5)   / this.map.height) * 18 -  9; }

  // ──────────────────────────────────────────────────────────
  // Scene initialisation
  // ──────────────────────────────────────────────────────────
  _initScene() {
    const B = BABYLON;

    const engine = new B.Engine(this.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      antialias: true,
    });
    this._engine = engine;

    const scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(0.04, 0.05, 0.08, 1);
    scene.ambientColor = new B.Color3(0.06, 0.07, 0.09);
    this._scene = scene;

    // Fixed aerial camera — no user input
    const cam = new B.ArcRotateCamera('cam', -Math.PI / 2, 0.72, 38,
      B.Vector3.Zero(), scene);
    cam.inputs.clear();
    cam.minZ = 0.5;
    cam.maxZ = 120;
    this._camera = cam;

    // Hemispheric fill light
    const hemi = new B.HemisphericLight('hemi', new B.Vector3(0, 1, 0), scene);
    hemi.intensity   = 0.60;
    hemi.diffuse     = new B.Color3(0.88, 0.86, 0.80);
    hemi.groundColor = new B.Color3(0.12, 0.14, 0.18);
    hemi.specular    = new B.Color3(0, 0, 0);

    // Directional sun — casts shadows
    const sun = new B.DirectionalLight('sun', new B.Vector3(-0.55, -1, 0.38), scene);
    sun.intensity = 0.80;
    sun.position  = new B.Vector3(14, 24, -8);

    const shadow = new B.ShadowGenerator(1024, sun);
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurKernel = 12;
    this._shadow = shadow;

    // Build scene layers in order
    this._buildTerrain();
    this._buildDecorations();
    this._buildCitizenTemplate();
    this._buildBattleUnitTemplate();
    this._buildParticlePool();

    // Per-civ material cache (created lazily in _civMaterial)
    this._civMatCache = {};

    // Camera drift registered inside Babylon's loop (not in render())
    scene.registerBeforeRender(() => {
      if (this._mode === 'battle') {
        if (this._camera.radius < 52) this._camera.radius += 0.07;
        this._camera.alpha += 0.0008;
      } else {
        if (this._camera.radius > 38) {
          this._camera.radius = Math.max(38, this._camera.radius - 0.05);
        }
      }
    });

    engine.runRenderLoop(() => scene.render());

    // Track engine for resize
    this._resizeObs = new ResizeObserver(() => {
      if (this._engine) this._engine.resize();
    });
    this._resizeObs.observe(this.canvas.parentElement || this.canvas);
  }

  // ──────────────────────────────────────────────────────────
  // Per-civ shared materials (avoid creating one per mesh)
  // ──────────────────────────────────────────────────────────
  _civMaterial(side, color, variant) {
    const key = `${side}_${variant}`;
    if (this._civMatCache[key]) return this._civMatCache[key];
    const B = BABYLON;
    const mat = new B.StandardMaterial(`cm_${key}`, this._scene);
    const base = B.Color3.FromHexString(color.length === 7 ? color : '#888888');
    if (variant === 'body') {
      mat.diffuseColor  = base;
      mat.specularColor = new B.Color3(0.15, 0.15, 0.15);
    } else if (variant === 'roof') {
      mat.diffuseColor  = base.scale(0.65);
      mat.specularColor = new B.Color3(0.08, 0.08, 0.08);
    } else { // 'wall' / neutral
      mat.diffuseColor  = new B.Color3(0.54, 0.51, 0.47);
      mat.specularColor = new B.Color3(0.05, 0.05, 0.05);
    }
    this._civMatCache[key] = mat;
    return mat;
  }

  // ──────────────────────────────────────────────────────────
  // TERRAIN  (ground + biome texture + territory overlay)
  // ──────────────────────────────────────────────────────────
  _buildTerrain() {
    const B    = BABYLON;
    const scene = this._scene;
    const mw = this.map.width, mh = this.map.height;
    const TW = 256, TH = 128;
    this._terrainW = TW; this._terrainH = TH;

    // ── Base biome texture (baked once) ──────────────────────
    const baseTex = new B.DynamicTexture('biomeBase', { width: TW, height: TH }, scene, false);
    baseTex.wrapU = baseTex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    const bctx = baseTex.getContext();
    const pw = TW / mw, ph = TH / mh;

    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const tile  = this.map.tiles[y][x];
        const bkey  = tile.biomeKey || tile.biome || 'plains';
        const biome = (typeof BIOMES !== 'undefined' && BIOMES[bkey]) || null;
        let col;
        if (tile.type === 1 /* WATER */ || tile.river) {
          col = tile.river ? '#2d5070' : '#1e3858';
        } else if (biome) {
          const useAlt = ((x * 7 + y * 11) % 4) < 2;
          col = useAlt ? biome.colorAlt : biome.color;
          // Elevation shading
          const e = tile.elevation || 0;
          if      (e > 0.72) col = _shade3d(col, -0.16);
          else if (e > 0.50) col = _shade3d(col, -0.07);
          else if (e < 0.25) col = _shade3d(col,  0.06);
        } else {
          col = '#2a3a2a';
        }
        bctx.fillStyle = col;
        bctx.fillRect(Math.round(x * pw), Math.round(y * ph),
                      Math.ceil(pw) + 1, Math.ceil(ph) + 1);
      }
    }
    baseTex.update(false);

    // ── Territory overlay texture (updated every 3 frames) ───
    const terrTex = new B.DynamicTexture('territory', { width: TW, height: TH }, scene, false);
    terrTex.hasAlpha = true;
    terrTex.wrapU = terrTex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    this._terrTex = terrTex;

    // ── Ground mesh, subdivided + displaced by tile elevation ─
    const subX = Math.min(mw, 72), subY = Math.min(mh, 36);
    const ground = B.MeshBuilder.CreateGround('ground',
      { width: 44, height: 18, subdivisionsX: subX, subdivisionsY: subY, updatable: true }, scene);
    const matGnd = new B.StandardMaterial('matGnd', scene);
    matGnd.diffuseTexture  = baseTex;
    matGnd.specularColor   = new B.Color3(0.04, 0.04, 0.04);
    matGnd.backFaceCulling = false;
    ground.material = matGnd;
    ground.receiveShadows = true;
    this._displaceMesh(ground, 0);

    // ── Territory overlay mesh — displaced to hug the terrain ─
    const overlay = B.MeshBuilder.CreateGround('overlay',
      { width: 44, height: 18, subdivisionsX: subX, subdivisionsY: subY, updatable: true }, scene);
    const matOvr = new B.StandardMaterial('matOvr', scene);
    matOvr.diffuseTexture = terrTex;
    matOvr.useAlphaFromDiffuseTexture = true;
    matOvr.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    matOvr.backFaceCulling  = false;
    matOvr.specularColor    = new B.Color3(0, 0, 0);
    matOvr.zOffset          = -1;
    overlay.material = matOvr;
    this._displaceMesh(overlay, 0.03);
    this._overlayMesh = overlay;
  }

  // Map a tile elevation (0..1) to a world height. Low ground and water
  // stay flat; only hills and mountains rise. Shared by the terrain mesh
  // and every object placed on it so nothing floats or sinks.
  _elevToY(e) { return e <= 0.30 ? 0 : (e - 0.30) * 1.5; }

  _groundY(wx, wz) {
    const mw = this.map.width, mh = this.map.height;
    let tx = Math.floor((wx + 22) / 44 * mw);
    let ty = Math.floor((wz + 9) / 18 * mh);
    tx = Math.max(0, Math.min(mw - 1, tx));
    ty = Math.max(0, Math.min(mh - 1, ty));
    const t = this.map.tiles[ty][tx];
    if (t.type === 1 || t.river) return 0; // water sits low + flat
    return this._elevToY(t.elevation || 0);
  }

  // Push each vertex of a flat ground up to its terrain height, then
  // recompute normals so lighting follows the new slopes.
  _displaceMesh(mesh, yOffset) {
    const B = BABYLON;
    const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
    if (!pos) return;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] = this._groundY(pos[i], pos[i + 2]) + yOffset;
    }
    mesh.updateVerticesData(B.VertexBuffer.PositionKind, pos);
    const normals = [];
    B.VertexData.ComputeNormals(pos, mesh.getIndices(), normals);
    mesh.updateVerticesData(B.VertexBuffer.NormalKind, normals);
    mesh.refreshBoundingInfo();
  }

  _updateTerritoryTexture() {
    if (!this._terrTex || !this._civs || !this._civs.length) return;
    const TW = this._terrainW, TH = this._terrainH;
    const mw = this.map.width, mh = this.map.height;
    const pw = TW / mw, ph = TH / mh;
    const ctx = this._terrTex.getContext();
    ctx.clearRect(0, 0, TW, TH);

    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const owner = this.map.tiles[y][x].owner;
        if (!owner) continue;
        const civ = this._civs.find(c => c.side === owner);
        if (!civ) continue;
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = civ.color;
        ctx.fillRect(Math.round(x * pw), Math.round(y * ph),
                     Math.ceil(pw) + 1, Math.ceil(ph) + 1);
      }
    }
    ctx.globalAlpha = 1;
    this._terrTex.update(false);
  }

  // ──────────────────────────────────────────────────────────
  // DECORATIONS  (biome-specific instanced flora & rock — capped)
  // ──────────────────────────────────────────────────────────
  _buildDecorations() {
    const B     = BABYLON;
    const scene = this._scene;
    const { width: mw, height: mh, tiles } = this.map;

    // One shared white material; per-instance colour rides the reserved
    // "color" instanced buffer, which StandardMaterial applies for free.
    const decMat = new B.StandardMaterial('decMat', scene);
    decMat.diffuseColor  = new B.Color3(1, 1, 1);
    decMat.specularColor = new B.Color3(0, 0, 0);

    // Build a hidden, instanceable source mesh once.
    const mkSrc = (name, builder) => {
      const m = builder();
      m.name = name;
      m.material = decMat;
      m.registerInstancedBuffer('color', 4);
      m.instancedBuffers.color = new B.Color4(1, 1, 1, 1);
      m.isVisible = false; m.isPickable = false; m.position.y = -50;
      return m;
    };
    const T = {
      trunk:  mkSrc('trunkT',  () => B.MeshBuilder.CreateCylinder('t', { height: 0.34, diameterTop: 0.07, diameterBottom: 0.11, tessellation: 5 }, scene)),
      canopy: mkSrc('canopyT', () => B.MeshBuilder.CreateSphere('t',   { diameter: 0.5, segments: 6 }, scene)),
      pine:   mkSrc('pineT',   () => B.MeshBuilder.CreateCylinder('t', { height: 0.6, diameterTop: 0, diameterBottom: 0.42, tessellation: 6 }, scene)),
      cactus: mkSrc('cactusT', () => B.MeshBuilder.CreateCylinder('t', { height: 0.5, diameter: 0.13, tessellation: 6 }, scene)),
      rock:   mkSrc('rockT',   () => B.MeshBuilder.CreateBox('t', { width: 0.26, height: 0.18, depth: 0.22 }, scene)),
      grass:  mkSrc('grassT',  () => B.MeshBuilder.CreateCylinder('t', { height: 0.22, diameterTop: 0, diameterBottom: 0.16, tessellation: 4 }, scene)),
    };

    const FEAT = (typeof window.FEAT !== 'undefined') ? window.FEAT
      : { NONE:0, TREE:1, DUNE:2, ICE:3, TUFT:4, VINE:5, ROCK:6, LAVA:7, BEACH:8 };
    const jit = () => (Math.random() - 0.5) * (44 / mw) * 0.6;
    const C   = (hex) => B.Color3.FromHexString((hex && hex.length === 7) ? hex : '#4a7a55');

    let count = 0;
    const CAP = 460;
    const place = (src, wx, wy, wz, col, scl, rotMesh) => {
      const inst = src.createInstance(`dec${count++}`);
      inst.position.set(wx, wy, wz);
      inst.rotation.y = Math.random() * Math.PI * 2;
      if (scl) inst.scaling.setAll(scl);
      inst.instancedBuffers.color = new B.Color4(col.r, col.g, col.b, 1);
      return inst;
    };

    for (let y = 0; y < mh && count < CAP; y++) {
      for (let x = 0; x < mw && count < CAP; x++) {
        const tile = tiles[y][x];
        if (tile.type === 1) continue; // water
        const feat = tile.feature;
        if (!feat || feat === FEAT.NONE || feat === FEAT.LAVA || feat === FEAT.BEACH) continue;

        const wx = this._tcx(x) + jit();
        const wz = this._tcz(y) + jit();
        const gy = this._groundY(wx, wz);
        const bkey  = tile.biomeKey || tile.biome || 'plains';
        const biome = (typeof BIOMES !== 'undefined' && BIOMES[bkey]) || null;
        const arch  = (biome && biome.terrain) || 'plains';
        const leafC = C(biome ? biome.feature : '#4a7a55');
        const trunkC = C('#5a3f29');
        const s = 0.85 + Math.random() * 0.5;

        // Tree-like features → biome-appropriate flora.
        if (feat === FEAT.TREE || feat === FEAT.VINE) {
          if (arch === 'taiga' || arch === 'tundra' || arch === 'mountain') {
            place(T.pine, wx, gy + 0.3 * s, wz, leafC.scale(0.9), s);                 // conifer
          } else if (arch === 'desert' || arch === 'badlands' || arch === 'volcanic') {
            place(T.cactus, wx, gy + 0.25 * s, wz, C('#5a7a45'), s);                  // cactus / spire
          } else {
            place(T.trunk,  wx, gy + 0.17 * s, wz, trunkC, s);                        // broadleaf
            if (count < CAP) place(T.canopy, wx, gy + 0.42 * s, wz, leafC, s * 1.05);
          }
        } else if (feat === FEAT.TUFT) {
          place(T.grass, wx, gy + 0.11 * s, wz, leafC.scale(1.05), s);               // tuft / reed
        } else if (feat === FEAT.ROCK || feat === FEAT.DUNE) {
          place(T.rock, wx, gy + 0.1 * s, wz, C(biome ? biome.feature : '#8a8a8a').scale(0.8), s);
        } else if (feat === FEAT.ICE) {
          place(T.rock, wx, gy + 0.1 * s, wz, C('#dfeaf4'), s);                       // ice shard
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // SETTLEMENTS  (diff + rebuild every 10 frames)
  // ──────────────────────────────────────────────────────────
  _diffSettlements() {
    const { width: mw, height: mh, tiles } = this.map;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const key  = `${x},${y}`;
        const s    = tiles[y][x].settlement;
        const prev = this._settlementCache[key];

        if (!s) {
          if (prev) this._destroySettlement(key);
          continue;
        }

        const tier      = s.tier || 0;
        const owner     = s.owner;
        const isCapital = !!s.isCapital;
        const civ       = this._civs ? this._civs.find(c => c.side === owner) : null;
        const color     = civ ? civ.color : '#888888';

        if (prev && prev.tier === tier && prev.owner === owner) continue;

        if (prev) this._destroySettlement(key);

        const node = this._buildSettlement3D(x, y, tier, isCapital, color, owner);
        this._settlementCache[key] = { tier, owner, isCapital, node };
      }
    }
    // Remove cached settlements whose tiles no longer have one
    for (const key of Object.keys(this._settlementCache)) {
      const [kx, ky] = key.split(',').map(Number);
      if (!this.map.tiles[ky][kx].settlement) this._destroySettlement(key);
    }
  }

  _destroySettlement(key) {
    const entry = this._settlementCache[key];
    if (!entry) return;
    const node = entry.node;
    if (node) {
      // Materials are all shared/cached — dispose only the geometry, and
      // detach each piece from the shadow generator first.
      for (const m of node.getChildMeshes(false)) {
        if (this._shadow) this._shadow.removeShadowCaster(m);
        m.dispose();
      }
      node.dispose();
    }
    delete this._settlementCache[key];
  }

  // Cached non-civ material (walls, windows, thatch…).
  _sharedMat(key, hex, opts = {}) {
    if (!this._sharedMats) this._sharedMats = {};
    if (this._sharedMats[key]) return this._sharedMats[key];
    const B = BABYLON;
    const m = new B.StandardMaterial('sm_' + key, this._scene);
    m.diffuseColor  = B.Color3.FromHexString(hex);
    m.specularColor = new B.Color3(0.05, 0.05, 0.05);
    if (opts.emissive) m.emissiveColor = B.Color3.FromHexString(opts.emissive);
    this._sharedMats[key] = m;
    return m;
  }

  // Construction material evolves with the owner's tech age.
  _wallMatForAge(age) {
    if (age <= 1) return this._sharedMat('wall_mud',      '#6f5238');
    if (age <= 3) return this._sharedMat('wall_stone',    '#7f8088');
    if (age <= 5) return this._sharedMat('wall_brick',    '#7a4a3a');
    return                this._sharedMat('wall_concrete','#9a9aa4');
  }

  _buildSettlement3D(tx, ty, tier, isCapital, color, side) {
    const B     = BABYLON;
    const scene = this._scene;
    const wx = this._tcx(tx), wz = this._tcz(ty);

    const civ  = this._civs ? this._civs.find(c => c.side === side) : null;
    const age  = civ ? (civ.techAge | 0) : 2;

    const sizes = [0.20, 0.30, 0.42, 0.56, 0.70, 0.86];
    const sz    = sizes[Math.min(tier, 5)];

    const wallMat = this._wallMatForAge(age);
    const roofMat = this._civMaterial(side, color, 'roof');   // civ-tinted → ownership at a glance
    const bodyMat = this._civMaterial(side, color, 'body');   // bright civ colour (flag)
    const winMat  = age >= 6 ? this._sharedMat('win_blue', '#cfe6ff', { emissive: '#5f9fd0' })
                             : this._sharedMat('win_warm', '#ffd98a', { emissive: '#d8a040' });

    // Collect geometry grouped by material so we can merge each group into a
    // single mesh — a detailed settlement still costs only a few draw calls.
    const groups = new Map();
    const add = (mesh, mat) => {
      mesh.material = mat;
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push(mesh);
    };

    // One little building: body + hip roof + a glowing window (from Bronze on).
    const addHouse = (cx, cz, w, hh, d) => {
      const body = B.MeshBuilder.CreateBox('hb', { width: w, height: hh, depth: d }, scene);
      body.position.set(cx, hh / 2, cz);
      add(body, wallMat);
      const roof = B.MeshBuilder.CreateCylinder('hr',
        { height: hh * 0.6, diameterTop: 0, diameterBottom: Math.max(w, d) * 1.5, tessellation: 4 }, scene);
      roof.position.set(cx, hh + hh * 0.30, cz);
      roof.rotation.y = Math.PI / 4;
      add(roof, roofMat);
      if (age >= 2) {
        const win = B.MeshBuilder.CreateBox('hw', { width: w * 0.5, height: hh * 0.35, depth: 0.012 }, scene);
        win.position.set(cx, hh * 0.46, cz + d / 2 + 0.006);
        add(win, winMat);
      }
    };

    // A cluster that grows with tier.
    const n = [1, 1, 2, 3, 4, 5][Math.min(tier, 5)];
    const layout = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    const spread = sz * 0.55;
    for (let i = 0; i < n; i++) {
      const [ox, oz] = layout[i];
      const main = i === 0;
      const w  = 0.15 + (main ? sz * 0.20 : 0.02) + Math.random() * 0.03;
      const hh = 0.13 + (main ? sz * 0.24 : 0.02) + (isCapital && main ? 0.10 : 0);
      const d  = w * (0.85 + Math.random() * 0.3);
      addHouse(wx + ox * spread, wz + oz * spread, w, hh, d);
    }

    // Defensive wall ring from tier 3.
    if (tier >= 3) {
      const wallH = 0.13, wallThick = 0.045, wallLen = sz * 1.3 + wallThick * 2;
      [[sz * 0.66, 0, 0], [-sz * 0.66, 0, 0], [0, sz * 0.66, Math.PI / 2], [0, -sz * 0.66, Math.PI / 2]]
        .forEach(([ox, oz, ry]) => {
          const wl = B.MeshBuilder.CreateBox('wl', { width: wallThick, height: wallH, depth: wallLen }, scene);
          wl.position.set(wx + ox, wallH / 2, wz + oz);
          wl.rotation.y = ry;
          add(wl, wallMat);
        });
    }

    // Corner watchtower for high tiers / capitals.
    if (tier >= 5 || (isCapital && tier >= 4)) {
      const tw = B.MeshBuilder.CreateCylinder('tw',
        { height: sz * 1.1, diameter: sz * 0.26, tessellation: 6 }, scene);
      tw.position.set(wx + sz * 0.5, sz * 0.55, wz + sz * 0.5);
      add(tw, wallMat);
      const cap = B.MeshBuilder.CreateCylinder('tc',
        { height: sz * 0.3, diameterTop: 0, diameterBottom: sz * 0.34, tessellation: 6 }, scene);
      cap.position.set(wx + sz * 0.5, sz * 1.1 + sz * 0.15, wz + sz * 0.5);
      add(cap, roofMat);
    }

    // Capital banner.
    if (isCapital) {
      const top = 0.13 + sz * 0.24 + 0.10;
      const pole = B.MeshBuilder.CreateCylinder('fp', { height: 0.5, diameter: 0.03, tessellation: 5 }, scene);
      pole.position.set(wx, top + 0.25, wz);
      add(pole, wallMat);
      const flag = B.MeshBuilder.CreateBox('ff', { width: 0.18, height: 0.11, depth: 0.014 }, scene);
      flag.position.set(wx + 0.09, top + 0.42, wz);
      add(flag, bodyMat);
    }

    // Merge each material group; parent the merged meshes to the settlement
    // root and lift the whole thing onto the terrain.
    const root = new B.TransformNode(`sett_${tx}_${ty}`, scene);
    for (const [mat, arr] of groups) {
      let m;
      if (arr.length === 1) { m = arr[0]; }
      else { m = B.Mesh.MergeMeshes(arr, true, true, undefined, false, false); if (m) m.material = mat; }
      if (!m) continue;
      m.parent = root;
      m.isPickable = false;
      if ((mat === wallMat || mat === roofMat) && this._shadow) this._shadow.addShadowCaster(m);
    }
    root.position.y = this._groundY(wx, wz);
    return root;
  }

  // ──────────────────────────────────────────────────────────
  // CITIZENS  (InstancedMesh capsules, max 60)
  // ──────────────────────────────────────────────────────────
  _buildCitizenTemplate() {
    const B = BABYLON;
    const tmpl = B.MeshBuilder.CreateCapsule('citTmpl', {
      height: 0.13, radius: 0.038, tessellation: 4, subdivisions: 1,
    }, this._scene);
    const mat = new B.StandardMaterial('citMat', this._scene);
    mat.diffuseColor  = new B.Color3(1, 1, 1);
    mat.specularColor = new B.Color3(0, 0, 0);
    tmpl.material = mat;
    tmpl.registerInstancedBuffer('color', 4);
    tmpl.instancedBuffers.color = new B.Color4(1, 1, 1, 1);
    tmpl.isVisible = false;
    tmpl.position.y = -50;
    this._citizenTemplate = tmpl;
  }

  _syncCitizens() {
    const cits = this.citizens.slice(0, 60);
    const B    = BABYLON;

    // Grow instance pool as needed
    while (this._citizenInstances.length < cits.length) {
      const idx  = this._citizenInstances.length;
      const inst = this._citizenTemplate.createInstance(`cit${idx}`);
      this._citizenInstances.push(inst);
    }

    for (let i = 0; i < this._citizenInstances.length; i++) {
      const inst = this._citizenInstances[i];
      if (i < cits.length) {
        const c = cits[i];
        const cwx = this._tx(c.x), cwz = this._tz(c.y);
        inst.position.x = cwx;
        inst.position.z = cwz;
        inst.position.y = this._groundY(cwx, cwz) + 0.065 + Math.sin(c.bob || 0) * 0.012;
        const col = B.Color3.FromHexString(
          c.color && c.color.length === 7 ? c.color : '#ffffff');
        inst.instancedBuffers.color = new B.Color4(col.r, col.g, col.b, 1);
        inst.isVisible = true;
      } else {
        inst.isVisible = false;
      }
    }
  }

  // Ported citizen wander logic from Renderer.updateCitizens()
  _updateCitizens(civs, settlements) {
    const bySide = {};
    for (const civ of civs) bySide[civ.side] = [];
    for (const e of settlements) {
      if (bySide[e.s.owner]) bySide[e.s.owner].push(e);
    }

    for (const civ of civs) {
      const homes  = bySide[civ.side];
      const target = homes.length === 0 ? 0
        : Math.min(45, homes.length * 2 + Math.min(18, Math.floor(Math.log10(civ.population + 1) * 3)));

      let mine = this.citizens.filter(c => c.side === civ.side);

      // Spawn
      while (mine.length < target) {
        const h = homes[(Math.random() * homes.length) | 0];
        const c = {
          side: civ.side, color: civ.color,
          x: h.x + (Math.random() - 0.5) * 2, y: h.y + (Math.random() - 0.5) * 2,
          tx: h.x, ty: h.y,
          speed: 0.05 + Math.random() * 0.07,
          bob: Math.random() * Math.PI * 2,
        };
        this.citizens.push(c);
        mine.push(c);
      }

      // Cull
      if (mine.length > target) {
        let rem = mine.length - target;
        this.citizens = this.citizens.filter(c => {
          if (c.side === civ.side && rem > 0) { rem--; return false; }
          return true;
        });
      }

      // Move
      for (const c of this.citizens) {
        if (c.side !== civ.side) continue;
        const dx = c.tx - c.x, dy = c.ty - c.y;
        const d  = Math.hypot(dx, dy);
        if (d < 0.6 || !isFinite(d)) {
          if (homes.length && Math.random() < 0.7) {
            const h = homes[(Math.random() * homes.length) | 0];
            c.tx = h.x + (Math.random() - 0.5) * 3;
            c.ty = h.y + (Math.random() - 0.5) * 3;
          } else {
            c.tx = c.x + (Math.random() - 0.5) * 8;
            c.ty = c.y + (Math.random() - 0.5) * 8;
          }
        } else {
          c.x  += (dx / d) * c.speed;
          c.y  += (dy / d) * c.speed;
          c.bob += 0.3;
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // BATTLE UNITS  (InstancedMesh, driven by battleUnits array)
  // ──────────────────────────────────────────────────────────
  _buildBattleUnitTemplate() {
    const B    = BABYLON;
    const tmpl = B.MeshBuilder.CreateBox('unitTmpl',
      { width: 0.17, height: 0.20, depth: 0.17 }, this._scene);
    const mat = new B.StandardMaterial('unitMat', this._scene);
    mat.diffuseColor  = new B.Color3(1, 1, 1);
    mat.specularColor = new B.Color3(0.25, 0.25, 0.25);
    tmpl.material = mat;
    tmpl.registerInstancedBuffer('color', 4);
    tmpl.instancedBuffers.color = new B.Color4(1, 1, 1, 1);
    tmpl.isVisible = false;
    tmpl.position.y = -50;
    this._unitTemplate = tmpl;
  }

  _syncBattleUnits() {
    const units = this.battleUnits;
    const B     = BABYLON;

    while (this._unitInstances.length < units.length) {
      const idx  = this._unitInstances.length;
      const inst = this._unitTemplate.createInstance(`unit${idx}`);
      this._unitInstances.push(inst);
    }

    for (let i = 0; i < this._unitInstances.length; i++) {
      const inst = this._unitInstances[i];
      if (i < units.length) {
        const u = units[i];
        const uwx = this._tx(u.x), uwz = this._tz(u.y);
        inst.position.x = uwx;
        inst.position.z = uwz;
        inst.position.y = this._groundY(uwx, uwz) + 0.10;
        const col = B.Color3.FromHexString(
          u.color && u.color.length === 7 ? u.color : '#aaaaaa');
        inst.instancedBuffers.color = new B.Color4(col.r, col.g, col.b, 1);
        inst.isVisible = true;
      } else {
        inst.isVisible = false;
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // PARTICLE POOL  (10 reusable ParticleSystems)
  // ──────────────────────────────────────────────────────────
  _buildParticlePool() {
    const B     = BABYLON;
    const scene = this._scene;

    // Procedural radial-glow flare so no network texture is fetched.
    const flareTex = new B.DynamicTexture('flareTex', 64, scene, false);
    const fctx = flareTex.getContext();
    const grd  = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0,   'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1,   'rgba(255,255,255,0)');
    fctx.fillStyle = grd;
    fctx.fillRect(0, 0, 64, 64);
    flareTex.hasAlpha = true;
    flareTex.update();
    this._flareTex = flareTex;

    for (let i = 0; i < 10; i++) {
      const ps = new B.ParticleSystem(`ps${i}`, 30, scene);
      ps.particleTexture = flareTex;
      ps.blendMode     = B.ParticleSystem.BLENDMODE_ADD;
      ps.emitter       = new B.Vector3(0, 0.5, 0);
      ps.minSize       = 0.06; ps.maxSize = 0.20;
      ps.minLifeTime   = 0.35; ps.maxLifeTime = 0.85;
      ps.emitRate      = 0;
      ps.manualEmitCount = 0;
      ps.direction1    = new B.Vector3(-1.2, 2, -1.2);
      ps.direction2    = new B.Vector3(1.2, 4.5, 1.2);
      ps.gravity       = new B.Vector3(0, -4.5, 0);
      ps.minEmitPower  = 1; ps.maxEmitPower = 3.5;
      ps.updateSpeed   = 0.02;
      ps.isLocal       = false;
      ps._r3dInUse     = false;
      this._psPool.push(ps);
    }
  }

  _getIdlePS() {
    for (const ps of this._psPool) {
      if (!ps._r3dInUse) { ps._r3dInUse = true; return ps; }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────
  // Collect settlements  (mirrors Renderer.collectSettlements)
  // ──────────────────────────────────────────────────────────
  _collectSettlements(civs) {
    const out     = [];
    const byOwner = {};
    for (const civ of civs) {
      byOwner[civ.side] = civ;
      if (civ._settlements) {
        for (const e of civ._settlements) out.push({ x: e.x, y: e.y, s: e.s, civ });
      }
    }
    if (out.length === 0) {
      const tiles = this.map.tiles;
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          const s = tiles[y][x].settlement;
          if (s && byOwner[s.owner]) out.push({ x, y, s, civ: byOwner[s.owner] });
        }
      }
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC API  (matching Renderer interface exactly)
  // ──────────────────────────────────────────────────────────

  resize() {
    if (this._engine) this._engine.resize();
  }

  render(civs, year, mode = 'sim') {
    this._frameCount++;
    this._mode = mode;
    this._civs = civs;
    this._year = year;

    // Skip heavy updates at high sim speeds
    const fast = typeof Game !== 'undefined' && Game.speed >= 100;

    if (!fast) {
      if (this._frameCount % 3  === 0) this._updateTerritoryTexture();
      if (this._frameCount % 10 === 0) this._diffSettlements();

      if (mode === 'sim') {
        const settlements = this._collectSettlements(civs);
        this._updateCitizens(civs, settlements);
        this._syncCitizens();
      }
    }

    this._syncBattleUnits();
  }

  addParticle(x, y, color, life = 20, vy) {
    // 2D-compat particle record (consumed by updateParticles)
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.28,
      vy: vy !== undefined ? vy : -0.14,
      color,
      life,
      maxLife: life,
      size: 3,
    });

    // 3D burst
    const ps = this._getIdlePS();
    if (!ps) return;
    ps.emitter = new BABYLON.Vector3(this._tx(x), 0.5, this._tz(y));
    const hex  = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
    const c    = BABYLON.Color3.FromHexString(hex);
    ps.color1      = new BABYLON.Color4(c.r, c.g, c.b, 1.0);
    ps.color2      = new BABYLON.Color4(c.r * 0.6, c.g * 0.6, c.b * 0.6, 0.5);
    ps.colorDead   = new BABYLON.Color4(0, 0, 0, 0);
    ps.manualEmitCount = Math.min(Math.ceil(life / 2), 20);
    ps.start();
    setTimeout(() => {
      try { ps.stop(); ps._r3dInUse = false; } catch (_) {}
    }, 1600);
  }

  updateParticles() {
    // Advance 2D-compat particle array (battle.js calls this each step)
    for (const p of this.particles) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.life--;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // Decay flash
    if (this.flashEffect > 0) {
      this.flashEffect = Math.max(0, this.flashEffect - 0.07);
      if (this._flashEl) this._flashEl.style.opacity = this.flashEffect;
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Utility: shade a hex colour up/down (mirrors shade() in render.js)
// ──────────────────────────────────────────────────────────────
function _shade3d(hex, amt) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.max(0, Math.min(255, Math.round(r + r * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + g * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + b * amt)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

window.Renderer3D = Renderer3D;
