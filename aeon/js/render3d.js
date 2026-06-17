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

    // Battle-unit 3D instances (box fallback)
    this._unitTemplate  = null;
    this._unitInstances = [];

    // Animated Mixamo characters (loaded async; battle uses them when ready)
    this._isMobile        = !!(document.body && document.body.classList.contains('mobile'));
    this._charReady      = false;
    this._charContainers = {};   // key → AssetContainer
    this._charPools      = {};   // key → [ { holder, ag, mats, inUse } ]
    this._charScale      = 0.28; // ~1.81m model → ~0.5 world units tall (tweakable)
    // Skinned characters are GPU-heavy (own skeleton + draw call each); keep
    // the simultaneous count modest — units beyond this budget still render
    // as cheap instanced boxes, so battles never look sparse or GPU-starved.
    this._charBudget     = this._isMobile ? 16 : 40;

    // ── Civic development (roads, traffic, cities) ──────────────
    // As a civ industrialises its settlements grow road networks, then
    // road traffic, then its towns rise into proper cities. Tech-age gates:
    this._roadAge    = 4;  // Renaissance — paved highways link the towns
    this._vehicleAge = 5;  // Industrial  — wheeled traffic on the roads
    this._cityAge    = 6;  // Modern      — towns rise into tall cities
    this._roadNode   = null;   // single merged mesh for ALL roads (1 draw call)
    this._roadSig    = '';     // signature → only rebuild when the network changes
    this._roadSegments = [];   // [{ax,az,bx,bz,traffic}] world-space, for vehicles
    this._vehicleTemplate  = null;
    this._vehicleInstances = [];
    this._vehicles   = [];     // logical { seg, t, dir, speed, color }
    this._vehicleBudget = this._isMobile ? 6 : 18;

    // ── Camera view modes (angled god-view ⇄ top-down aerial) ───
    this._viewMode  = 'angled';

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
      antialias: !this._isMobile,
    });
    this._engine = engine;

    // WebGL contexts can be lost under GPU memory pressure (common on phones
    // with a heavy scene). Babylon retries the lost context automatically;
    // we just log so a recurring loss is visible instead of a silent
    // white screen, and make sure our own render loop keeps running.
    engine.onContextLostObservable.add(() => {
      console.warn('AEON 3D: WebGL context lost — attempting automatic recovery.');
    });
    engine.onContextRestoredObservable.add(() => {
      console.warn('AEON 3D: WebGL context restored.');
      if (this._scene) this._updateTerritoryTexture();
    });

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
    this._buildVehicleTemplate();
    this._buildParticlePool();

    // Per-civ material cache (created lazily in _civMaterial)
    this._civMatCache = {};

    // Camera animation. Two view modes the player can toggle:
    //   • 'angled' — the cinematic god-view (default), with a gentle zoom
    //     toward the contested centre during battle.
    //   • 'aerial' — a near top-down map view for reading territory & cities.
    // Both the orbit angle (beta) and distance (radius) ease toward their
    // targets so toggling glides rather than snaps.
    scene.registerBeforeRender(() => {
      const aerial  = this._viewMode === 'aerial';
      const rTarget = aerial ? 41 : (this._mode === 'battle' ? 32 : 38);
      const bTarget = aerial ? 0.16 : 0.72;
      const c = this._camera;
      c.radius += (rTarget - c.radius) * 0.06;
      c.beta   += (bTarget - c.beta)   * 0.06;
    });

    engine.runRenderLoop(() => scene.render());

    // Track engine for resize
    this._resizeObs = new ResizeObserver(() => {
      if (this._engine) this._engine.resize();
    });
    this._resizeObs.observe(this.canvas.parentElement || this.canvas);

    // Preload the animated characters during the sim so they're ready by the
    // time the final battle starts. Fire-and-forget; boxes are used until then.
    this._loadBattleCharacters();
  }

  // ──────────────────────────────────────────────────────────
  // ANIMATED CHARACTERS  (Mixamo glb, instanced per battle unit)
  // ──────────────────────────────────────────────────────────
  _loadBattleCharacters() {
    const B = BABYLON;
    if (!B.SceneLoader) return; // loaders plugin missing → stay on boxes
    const files = { walk: 'walk.glb', arrow: 'arrow.glb', gunplay: 'gunplay.glb', flying: 'flying.glb', squat: 'squat.glb' };
    const keys = Object.keys(files);
    for (const key of keys) {
      B.SceneLoader.LoadAssetContainerAsync('assets/characters/', files[key], this._scene)
        .then(container => {
          // Stop the container's own animation groups from auto-playing; each
          // instantiated copy gets its own group to drive.
          for (const ag of container.animationGroups) ag.stop();
          this._charContainers[key] = container;
          this._charPools[key] = [];
          // Flip on as soon as any role is usable — a single flaky asset
          // (e.g. a dropped request on mobile) should only knock out that
          // role's units (they fall back to boxes via the overflow path),
          // not the whole animated-character system.
          this._charReady = true;
        })
        .catch(err => {
          console.warn('Character load failed (' + key + '), using box units for that role:', err);
        });
    }
  }

  // Which animation a unit plays, from its race / tech age / unit type.
  _charKeyForUnit(u) {
    const civ = this._civs ? this._civs.find(c => c.side === u.side) : null;
    if (civ && civ.race === 'avians') return 'flying';
    const age = civ ? (civ.techAge | 0) : 2;
    if (age >= 5) return 'gunplay';              // Industrial+ : firearms
    if (u.type === 'archer') return 'arrow';
    if (u.type === 'mage')   return 'squat';     // placeholder "cast" pose
    return 'walk';
  }

  // Borrow a pooled character (or instantiate a new one) for a key.
  // Instantiation is rate-limited by the caller via allowCreate so a fresh
  // army ramps in over a few frames instead of hitching all at once.
  _acquireChar(key, allowCreate) {
    const pool = this._charPools[key];
    const container = this._charContainers[key];
    if (!pool || !container) return null;
    for (const e of pool) if (!e.inUse) { e.inUse = true; return e; }
    if (!allowCreate) return null;

    // None free → instantiate a fresh copy (shares geometry, own skeleton).
    const B = BABYLON;
    let entry = null;
    try {
      const inst = container.instantiateModelsToScene(n => key + '_' + pool.length, false);
      const holder = new B.TransformNode('char_' + key + '_' + pool.length, this._scene);
      const root = inst.rootNodes[0];
      root.parent = holder;
      holder.scaling.setAll(this._charScale);

      // Per-copy materials so each soldier can wear its civ colour.
      const mats = [];
      for (const m of root.getChildMeshes(false)) {
        m.isPickable = false;
        if (m.material) { m.material = m.material.clone(m.name + '_m'); mats.push(m.material); }
      }
      const ag = inst.animationGroups[0] || null;
      if (ag) { ag.start(true); ag.goToFrame(ag.from + Math.random() * (ag.to - ag.from)); }
      entry = { holder, root, ag, mats, inUse: true };
      pool.push(entry);
    } catch (err) {
      console.warn('instantiate char failed:', err);
      return null;
    }
    return entry;
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
    // Higher-resolution bake on desktop so biome borders read as soft
    // gradients rather than hard pixel blocks. (One-time CPU bake; the
    // GPU only ever sees a single uploaded texture, so this is cheap.)
    const TW = this._isMobile ? 256 : 512;
    const TH = this._isMobile ? 128 : 256;
    this._terrainW = TW; this._terrainH = TH;

    // ── Base biome texture (baked once, smoothly) ────────────
    const baseTex = new B.DynamicTexture('biomeBase', { width: TW, height: TH }, scene, false);
    baseTex.wrapU = baseTex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    const bctx = baseTex.getContext();

    // Per-tile base colour grid (biome colour ↔ colorAlt mixed by a smooth
    // per-tile hash + elevation shading), computed once.
    const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const hash01 = (x, y) => { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };
    const grid = new Array(mh);
    for (let y = 0; y < mh; y++) {
      grid[y] = new Array(mw);
      for (let x = 0; x < mw; x++) {
        const tile  = this.map.tiles[y][x];
        if (tile.type === 1 /* WATER */ || tile.river) { grid[y][x] = hexRGB(tile.river ? '#2d5070' : '#1e3858'); continue; }
        const bkey  = tile.biomeKey || tile.biome || 'plains';
        const biome = (typeof BIOMES !== 'undefined' && BIOMES[bkey]) || null;
        if (!biome) { grid[y][x] = hexRGB('#2a3a2a'); continue; }
        const a = hexRGB(biome.color), b2 = hexRGB(biome.colorAlt || biome.color);
        const m = hash01(x, y);
        let r = a[0] + (b2[0] - a[0]) * m, g = a[1] + (b2[1] - a[1]) * m, bl = a[2] + (b2[2] - a[2]) * m;
        const e = tile.elevation || 0;
        const amt = e > 0.72 ? -0.16 : e > 0.50 ? -0.07 : e < 0.25 ? 0.06 : 0;
        grid[y][x] = [r * (1 + amt), g * (1 + amt), bl * (1 + amt)];
      }
    }

    // Bilinearly resample the tile grid into the texture (soft borders) and
    // sprinkle a little per-pixel value noise so flat biomes look organic.
    const img = bctx.createImageData(TW, TH);
    const data = img.data;
    const clampi = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
    for (let py = 0; py < TH; py++) {
      const gy = (py + 0.5) / TH * mh - 0.5;
      const y0 = Math.floor(gy), fy = gy - y0;
      const ya = clampi(y0, 0, mh - 1), yb = clampi(y0 + 1, 0, mh - 1);
      for (let px = 0; px < TW; px++) {
        const gx = (px + 0.5) / TW * mw - 0.5;
        const x0 = Math.floor(gx), fx = gx - x0;
        const xa = clampi(x0, 0, mw - 1), xb = clampi(x0 + 1, 0, mw - 1);
        const c00 = grid[ya][xa], c10 = grid[ya][xb], c01 = grid[yb][xa], c11 = grid[yb][xb];
        const n = (hash01(px * 1.7, py * 1.3) - 0.5) * 13;
        const idx = (py * TW + px) * 4;
        for (let k = 0; k < 3; k++) {
          const top = c00[k] + (c10[k] - c00[k]) * fx;
          const bot = c01[k] + (c11[k] - c01[k]) * fx;
          data[idx + k] = clampi(Math.round(top + (bot - top) * fy + n), 0, 255);
        }
        data[idx + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    baseTex.update(false);
    baseTex.updateSamplingMode(B.Texture.TRILINEAR_SAMPLINGMODE);
    baseTex.anisotropicFilteringLevel = 4;

    // ── Territory overlay texture (updated every 3 frames) ───
    const terrTex = new B.DynamicTexture('territory', { width: TW, height: TH }, scene, false);
    terrTex.hasAlpha = true;
    terrTex.wrapU = terrTex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    this._terrTex = terrTex;

    // ── Ground mesh, subdivided + displaced by tile elevation ─
    // More subdivisions on desktop → smoother hill silhouettes (less faceting).
    const subX = Math.min(mw, this._isMobile ? 72 : 112);
    const subY = Math.min(mh, this._isMobile ? 36 : 64);
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

    // Once a civ modernises (cityAge) its towns rise into proper cities:
    // denser blocks and flat-roofed towers with stacked, lit windows.
    const isCity = age >= this._cityAge;

    // One building. Pre-modern → hip-roofed house with a glowing window;
    // a city `tall` building → a flat-roofed tower with rows of windows.
    const addHouse = (cx, cz, w, hh, d, tall) => {
      const body = B.MeshBuilder.CreateBox('hb', { width: w, height: hh, depth: d }, scene);
      body.position.set(cx, hh / 2, cz);
      add(body, wallMat);
      if (tall) {
        const rows = Math.max(2, Math.floor(hh / 0.12));
        for (let r = 0; r < rows; r++) {
          const win = B.MeshBuilder.CreateBox('hw', { width: w * 0.72, height: 0.032, depth: 0.012 }, scene);
          win.position.set(cx, (r + 0.7) * (hh / rows), cz + d / 2 + 0.006);
          add(win, winMat);
        }
      } else {
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
      }
    };

    // A cluster that grows with tier — denser, with towers, once a city.
    const n      = (isCity ? [1, 2, 4, 6, 8, 9] : [1, 1, 2, 3, 4, 5])[Math.min(tier, 5)];
    const layout = isCity
      ? [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
      : [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    const spread = sz * (isCity ? 0.5 : 0.55);
    const towerCount = tier >= 4 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const [ox, oz] = layout[i % layout.length];
      const main = i === 0;
      const tall = isCity && i < towerCount;
      const w  = 0.15 + (main ? sz * 0.20 : 0.04) + Math.random() * 0.03;
      let   hh = 0.13 + (main ? sz * 0.24 : 0.04) + (isCapital && main ? 0.10 : 0);
      if (tall) hh += sz * (0.5 + Math.random() * 0.7) + (age - this._cityAge) * 0.06; // skyscrapers, taller in later ages
      const d  = w * (0.85 + Math.random() * 0.3);
      addHouse(wx + ox * spread, wz + oz * spread, w, hh, d, tall);
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
  // ROADS  (one merged mesh for every civ's network — 1 draw call)
  // ──────────────────────────────────────────────────────────

  // Greedy nearest-neighbour spanning tree over a civ's settlements, grown
  // outward from its first/capital town — a believable trunk-road network.
  _civRoadSegments(civ) {
    const setts = (civ._settlements || []).filter(e => e && e.s);
    if (setts.length < 2) return [];
    const nodes = setts.map(e => ({ x: e.x, y: e.y }));
    const connected = [0];
    const remaining = new Set(nodes.map((_, i) => i).slice(1));
    const segs = [];
    while (remaining.size) {
      let best = null, bd = Infinity, bFrom = 0;
      for (const ci of connected) {
        for (const ri of remaining) {
          const dx = nodes[ci].x - nodes[ri].x, dy = nodes[ci].y - nodes[ri].y;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = ri; bFrom = ci; }
        }
      }
      if (best === null) break;
      segs.push([nodes[bFrom], nodes[best]]);
      connected.push(best);
      remaining.delete(best);
    }
    return segs;
  }

  // Rebuild the road network only when it actually changes (a town founded,
  // or a civ crossing the traffic age) — cheap to call every diff tick.
  _updateRoads(civs) {
    if (!civs) return;
    let sig = '';
    for (const civ of civs) {
      if ((civ.techAge | 0) < this._roadAge) continue;
      sig += civ.side + ':' + civ.techAge + ':';
      for (const e of (civ._settlements || [])) sig += e.x + ',' + e.y + ';';
      sig += '|';
    }
    if (sig === this._roadSig) return;
    this._roadSig = sig;

    if (this._roadNode) { this._roadNode.dispose(); this._roadNode = null; }
    this._roadSegments = [];

    const B = BABYLON;
    const pieces = [];
    const MAX_PIECES = 700;

    for (const civ of civs) {
      if ((civ.techAge | 0) < this._roadAge) continue;
      const traffic = (civ.techAge | 0) >= this._vehicleAge;
      for (const [a, b] of this._civRoadSegments(civ)) {
        const ax = this._tcx(a.x), az = this._tcz(a.y);
        const bx = this._tcx(b.x), bz = this._tcz(b.y);
        this._roadSegments.push({ ax, az, bx, bz, traffic, color: civ.color });
        // Subdivide so the ribbon hugs the terrain over hills.
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const steps = Math.max(1, Math.round(len / 0.6));
        const ang = Math.atan2(dx, dz);
        for (let s = 0; s < steps && pieces.length < MAX_PIECES; s++) {
          const tm = (s + 0.5) / steps;
          const mx = ax + dx * tm, mz = az + dz * tm;
          const box = B.MeshBuilder.CreateBox('road',
            { width: 0.13, height: 0.03, depth: (len / steps) * 1.05 }, this._scene);
          box.position.set(mx, this._groundY(mx, mz) + 0.04, mz);
          box.rotation.y = ang;
          pieces.push(box);
        }
        if (pieces.length >= MAX_PIECES) break;
      }
    }

    if (!pieces.length) return;
    const merged = B.Mesh.MergeMeshes(pieces, true, true, undefined, false, false);
    if (merged) {
      merged.material   = this._sharedMat('road', '#34363e');
      merged.isPickable = false;
      merged.receiveShadows = true;
      this._roadNode = merged;
    }
  }

  // ──────────────────────────────────────────────────────────
  // VEHICLES  (instanced boxes driving the trafficked roads)
  // ──────────────────────────────────────────────────────────
  _buildVehicleTemplate() {
    const B = BABYLON;
    const tmpl = B.MeshBuilder.CreateBox('vehTmpl', { width: 0.07, height: 0.05, depth: 0.13 }, this._scene);
    const mat = new B.StandardMaterial('vehMat', this._scene);
    mat.diffuseColor  = new B.Color3(1, 1, 1);
    mat.specularColor = new B.Color3(0.4, 0.4, 0.4);
    mat.emissiveColor = new B.Color3(0.05, 0.05, 0.06);
    tmpl.material = mat;
    tmpl.registerInstancedBuffer('color', 4);
    tmpl.instancedBuffers.color = new B.Color4(1, 1, 1, 1);
    tmpl.isVisible  = false;
    tmpl.position.y = -50;
    this._vehicleTemplate = tmpl;
  }

  _updateVehicles(active) {
    const B = BABYLON;
    const trafficSegs = this._roadSegments.filter(s => s.traffic);
    const target = (active && trafficSegs.length) ? this._vehicleBudget : 0;

    while (this._vehicles.length < target) {
      const seg = trafficSegs[(Math.random() * trafficSegs.length) | 0];
      this._vehicles.push({ seg, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, speed: 0.004 + Math.random() * 0.006 });
    }
    if (this._vehicles.length > target) this._vehicles.length = target;

    for (const v of this._vehicles) {
      v.t += v.speed * v.dir;
      if (v.t > 1 || v.t < 0) {
        if (trafficSegs.length) v.seg = trafficSegs[(Math.random() * trafficSegs.length) | 0];
        v.t = v.dir > 0 ? 0 : 1;
        if (Math.random() < 0.5) v.dir *= -1;
      }
    }

    while (this._vehicleInstances.length < this._vehicles.length) {
      const idx = this._vehicleInstances.length;
      this._vehicleInstances.push(this._vehicleTemplate.createInstance('veh' + idx));
    }
    for (let i = 0; i < this._vehicleInstances.length; i++) {
      const inst = this._vehicleInstances[i];
      if (i < this._vehicles.length) {
        const v = this._vehicles[i], s = v.seg;
        const x = s.ax + (s.bx - s.ax) * v.t;
        const z = s.az + (s.bz - s.az) * v.t;
        inst.position.set(x, this._groundY(x, z) + 0.06, z);
        inst.rotation.y = Math.atan2((s.bx - s.ax) * v.dir, (s.bz - s.az) * v.dir);
        const col = B.Color3.FromHexString(s.color && s.color.length === 7 ? s.color : '#dddddd');
        // Lighten toward white so cars stay legible over the civ-tinted town.
        inst.instancedBuffers.color = new B.Color4((col.r + 1) / 2, (col.g + 1) / 2, (col.b + 1) / 2, 1);
        inst.isVisible = true;
      } else {
        inst.isVisible = false;
      }
    }
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

  // Interleave a list of { side, ... } items round-robin by side, so a
  // shared render cap (citizens, animated battle characters, …) can never
  // be monopolised by whichever side happens to be first in the array —
  // that ordering bug is what made player 2 intermittently fail to render.
  _interleaveBySide(items, sideOf) {
    const bySide = {};
    const order = [];
    for (const it of items) {
      const s = sideOf(it);
      if (!bySide[s]) { bySide[s] = []; order.push(s); }
      bySide[s].push(it);
    }
    const out = [];
    for (let i = 0; ; i++) {
      let added = false;
      for (const s of order) {
        const arr = bySide[s];
        if (i < arr.length) { out.push(arr[i]); added = true; }
      }
      if (!added) break;
    }
    return out;
  }

  _syncCitizens() {
    const cits = this._interleaveBySide(this.citizens, c => c.side).slice(0, 60);
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
    if (this._charReady) this._syncBattleUnitsChars();
    else                 this._syncBattleUnitsBoxes(this.battleUnits);
  }

  // Animated Mixamo soldiers driven by the (tile-space) battle units. Only
  // up to _charBudget are ever instantiated at once (GPU cost); the rest of
  // the army still appears as cheap instanced boxes via the overflow array
  // below, so no side ever silently vanishes and battles stay dense.
  _syncBattleUnitsChars() {
    const B = BABYLON;
    // Free every pooled character; we re-bind the visible ones below.
    for (const key in this._charPools) for (const e of this._charPools[key]) e.inUse = false;

    // Side A is always first in this.battleUnits (it's built civ-by-civ in
    // BattleVisualizer.start()), so a straight in-order walk could let a
    // large army on one side exhaust the whole character budget before the
    // loop ever reached another side's units — that's the bug behind
    // "player 2 doesn't show". Interleaving evenly fixes it.
    const alive = this.battleUnits.filter(u => !u.dead);
    const queue = this._interleaveBySide(alive, u => u.side);

    let budget = this._charBudget;
    let newThisFrame = 0;
    const NEW_CAP = 6;
    const overflow = [];
    for (const u of queue) {
      if (budget <= 0) { overflow.push(u); continue; }
      const key = this._charKeyForUnit(u);
      const pool = this._charPools[key];
      if (!pool) { overflow.push(u); continue; }
      const before = pool.length;
      const e = this._acquireChar(key, newThisFrame < NEW_CAP);
      if (!e) { overflow.push(u); continue; }
      if (pool.length > before) newThisFrame++;
      budget--;

      const wx = this._tx(u.x), wz = this._tz(u.y);
      const gy = this._groundY(wx, wz) + (key === 'flying' ? 0.6 : 0.0);
      e.holder.position.set(wx, gy, wz);

      // Face the direction of travel (smoothed); keep last heading when still.
      const dx = wx - (u._pwx !== undefined ? u._pwx : wx);
      const dz = wz - (u._pwz !== undefined ? u._pwz : wz);
      if (dx * dx + dz * dz > 1e-5) u._heading = Math.atan2(dx, dz);
      u._pwx = wx; u._pwz = wz;
      e.holder.rotation.y = (u._heading || 0);

      // Wear the civ colour.
      const col = B.Color3.FromHexString(u.color && u.color.length === 7 ? u.color : '#aaaaaa');
      for (const m of e.mats) {
        if (m.albedoColor) m.albedoColor = col;
        if (m.diffuseColor) m.diffuseColor = col;
      }
      e.holder.setEnabled(true);
    }

    // Park unused characters out of sight.
    for (const key in this._charPools) {
      for (const e of this._charPools[key]) {
        if (!e.inUse) e.holder.setEnabled(false);
      }
    }

    // Everyone who didn't get an animated character this frame still shows
    // up as a coloured box rather than disappearing.
    this._syncBattleUnitsBoxes(overflow);
  }

  // Cheap instanced boxes — fallback before characters load (or if they
  // fail), and also used for the overflow beyond the character budget.
  _syncBattleUnitsBoxes(units) {
    const B = BABYLON;

    while (this._unitInstances.length < units.length) {
      const idx  = this._unitInstances.length;
      const inst = this._unitTemplate.createInstance(`unit${idx}`);
      this._unitInstances.push(inst);
    }

    for (let i = 0; i < this._unitInstances.length; i++) {
      const inst = this._unitInstances[i];
      if (i < units.length && !units[i].dead) {
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

  // Free the WebGL context (called when a new simulation replaces this one)
  // so engines don't stack up across games.
  dispose() {
    try { if (this._resizeObs) this._resizeObs.disconnect(); } catch (_) {}
    try { if (this._engine) { this._engine.stopRenderLoop(); this._engine.dispose(); } } catch (_) {}
    this._engine = null;
    this._scene = null;
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
      if (this._frameCount % 10 === 0) { this._diffSettlements(); this._updateRoads(civs); }

      if (mode === 'sim') {
        const settlements = this._collectSettlements(civs);
        this._updateCitizens(civs, settlements);
        this._syncCitizens();
      }
      // Traffic flows during the sim; parked once the final battle begins.
      this._updateVehicles(mode === 'sim');
    }

    this._syncBattleUnits();
  }

  // Toggle / set the camera view mode. 'angled' = cinematic god-view,
  // 'aerial' = near top-down map view. The render loop eases to the new
  // angle. Returns the active mode so the UI can update its label.
  setViewMode(mode) {
    this._viewMode = mode === 'aerial' ? 'aerial' : 'angled';
    return this._viewMode;
  }
  cycleViewMode() {
    return this.setViewMode(this._viewMode === 'aerial' ? 'angled' : 'aerial');
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
