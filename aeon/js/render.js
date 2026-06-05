// ============================================================
// AEON :: RENDERER
// Static terrain is baked once into an offscreen cache. Each frame
// we blit it and draw the live layers on top: territory, animated
// water/lava, ambient citizens wandering between settlements,
// settlements (with rising "under construction" animations),
// battle units, and particles.
// ============================================================

class Renderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.tileSize = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.mode = 'sim';
    this.battleUnits = [];
    this.particles = [];
    this.citizens = [];
    this.waterTiles = [];
    this.lavaTiles = [];
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCtx = this.terrainCanvas.getContext('2d');
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.computeTileSize();
    this.renderTerrainCache();
  }

  computeTileSize() {
    const tw = this.canvas.width / this.map.width;
    const th = this.canvas.height / this.map.height;
    this.tileSize = Math.max(4, Math.floor(Math.min(tw, th)));
    this.offsetX = Math.floor((this.canvas.width  - this.tileSize * this.map.width)  / 2);
    this.offsetY = Math.floor((this.canvas.height - this.tileSize * this.map.height) / 2);
  }

  isWater(x, y) {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
    const t = this.map.tiles[y][x];
    return t.type === TILE.WATER || t.river;
  }

  // ---- STATIC TERRAIN (baked once) ----
  renderTerrainCache() {
    const ts = this.tileSize;
    this.terrainCanvas.width = ts * this.map.width;
    this.terrainCanvas.height = ts * this.map.height;
    const ctx = this.terrainCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, this.terrainCanvas.width, this.terrainCanvas.height);

    this.waterTiles = [];
    this.lavaTiles = [];
    const tiles = this.map.tiles;
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        this.drawTerrainTile(ctx, x, y, tiles[y][x], ts);
      }
    }
  }

  drawTerrainTile(ctx, x, y, t, ts) {
    const px = x * ts, py = y * ts;
    const biome = BIOMES[t.biomeKey];
    const arch = biome.terrain || 'plains';

    if (t.type === TILE.WATER || t.river) {
      this.paintWater(ctx, x, y, px, py, ts, t.river);
      this.waterTiles.push({ x, y });
      return;
    }

    // Base biome colour with a deterministic chequer + elevation shade.
    const useAlt = ((x * 7 + y * 11) % 4) < 2;
    let base = useAlt ? biome.colorAlt : biome.color;
    if (t.elevation > 0.72)       base = shade(base, -0.16);
    else if (t.elevation > 0.5)   base = shade(base, -0.07);
    else if (t.elevation < 0.25)  base = shade(base, 0.07);
    ctx.fillStyle = base;
    ctx.fillRect(px, py, ts, ts);

    // Subtle embossed edge.
    if (ts >= 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(px, py + ts - 1, ts, 1);
      ctx.fillRect(px + ts - 1, py, 1, ts);
    }

    // Beach sand
    if (t.feature === FEAT.BEACH) {
      ctx.fillStyle = '#d8c98f';
      ctx.fillRect(px, py, ts, ts);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px, py, ts, Math.max(1, Math.floor(ts * 0.3)));
      return;
    }

    // Features
    if (t.type === TILE.HILL) {
      const snow = (arch === 'tundra' || arch === 'taiga') ||
                   (arch === 'mountain' && t.elevation > 0.62) ||
                   (arch === 'highlands' && t.elevation > 0.85);
      this.paintHill(ctx, px, py, ts, biome, snow);
    } else if (t.feature === FEAT.LAVA) {
      this.paintLava(ctx, px, py, ts);
      this.lavaTiles.push({ x, y });
    } else if (t.feature === FEAT.TREE && ts >= 5) {
      this.paintTree(ctx, px, py, ts, this.canopyColor(arch, biome), arch === 'taiga');
    } else if (t.feature === FEAT.VINE && ts >= 4) {
      ctx.fillStyle = shade(biome.feature, -0.15);
      ctx.fillRect(px + 1, py + Math.floor(ts * 0.5), Math.max(1, ts - 2), 1);
      ctx.fillRect(px + Math.floor(ts * 0.3), py + 1, 1, Math.max(1, ts - 2));
      ctx.fillRect(px + Math.floor(ts * 0.7), py + 1, 1, Math.max(1, ts - 2));
    } else if (t.feature === FEAT.ICE && ts >= 4) {
      ctx.fillStyle = '#eef4fb';
      ctx.fillRect(px + 1, py + 1, Math.max(1, ts - 2), 1);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(px + 1, py + 2, Math.max(1, Math.floor(ts / 2)), 1);
    } else if (t.feature === FEAT.DUNE && ts >= 4) {
      ctx.fillStyle = shade(biome.feature, 0.12);
      ctx.fillRect(px + 1, py + Math.floor(ts * 0.55), Math.max(1, ts - 2), 1);
      ctx.fillStyle = shade(biome.feature, -0.08);
      ctx.fillRect(px + 1, py + Math.floor(ts * 0.55) + 1, Math.max(1, Math.floor(ts * 0.6)), 1);
    } else if (t.feature === FEAT.TUFT && ts >= 4) {
      ctx.fillStyle = biome.feature;
      const gx = px + Math.floor(ts / 2);
      ctx.fillRect(gx, py + Math.floor(ts * 0.55), 1, Math.max(1, Math.floor(ts * 0.35)));
      ctx.fillRect(gx - 2, py + Math.floor(ts * 0.65), 1, Math.max(1, Math.floor(ts * 0.25)));
      ctx.fillRect(gx + 2, py + Math.floor(ts * 0.65), 1, Math.max(1, Math.floor(ts * 0.25)));
    } else if (t.feature === FEAT.ROCK && ts >= 4) {
      ctx.fillStyle = shade(biome.feature, -0.12);
      ctx.fillRect(px + Math.floor(ts * 0.38), py + Math.floor(ts * 0.5), Math.max(1, Math.floor(ts * 0.32)), Math.max(1, Math.floor(ts * 0.28)));
      ctx.fillStyle = shade(biome.feature, 0.1);
      ctx.fillRect(px + Math.floor(ts * 0.38), py + Math.floor(ts * 0.5), Math.max(1, Math.floor(ts * 0.16)), 1);
    } else if (t.type === TILE.RESOURCE) {
      this.paintResource(ctx, px, py, ts);
    }
  }

  canopyColor(arch, biome) {
    if (arch === 'taiga') return '#2f5a42';
    if (arch === 'savanna') return '#6f8a45';
    if (arch === 'archipelago') return '#3f8a4a';
    if (arch === 'jungle') return biome.feature;
    return biome.feature;
  }

  paintWater(ctx, x, y, px, py, ts, river) {
    ctx.fillStyle = river ? '#33597f' : '#27496b';
    ctx.fillRect(px, py, ts, ts);
    ctx.fillStyle = 'rgba(120,170,210,0.16)';
    ctx.fillRect(px, py + Math.floor(ts * 0.3), ts, Math.max(1, Math.floor(ts * 0.12)));

    // Foam where water meets land — gives coasts a crisp shoreline.
    if (ts >= 5) {
      ctx.fillStyle = 'rgba(210,235,250,0.7)';
      if (!this.isWater(x + 1, y)) ctx.fillRect(px + ts - 1, py, 1, ts);
      if (!this.isWater(x - 1, y)) ctx.fillRect(px, py, 1, ts);
      if (!this.isWater(x, y + 1)) ctx.fillRect(px, py + ts - 1, ts, 1);
      if (!this.isWater(x, y - 1)) ctx.fillRect(px, py, ts, 1);
    }
  }

  paintLava(ctx, px, py, ts) {
    ctx.fillStyle = '#2a1818';
    ctx.fillRect(px, py, ts, ts);
    ctx.fillStyle = '#c43a1a';
    ctx.fillRect(px + 1, py + Math.floor(ts * 0.4), Math.max(1, ts - 2), Math.max(1, Math.floor(ts * 0.18)));
    ctx.fillStyle = '#f0902a';
    ctx.fillRect(px + Math.floor(ts * 0.3), py + Math.floor(ts * 0.45), Math.max(1, Math.floor(ts * 0.4)), 1);
  }

  paintHill(ctx, px, py, ts, biome, snow) {
    const offset = Math.max(1, Math.floor(ts * 0.16));
    const baseY = py + ts - offset;
    const peakX = px + ts / 2, peakY = py + offset;
    ctx.fillStyle = biome.feature;
    ctx.beginPath();
    ctx.moveTo(px + offset, baseY);
    ctx.lineTo(peakX, peakY);
    ctx.lineTo(px + ts - offset, baseY);
    ctx.closePath();
    ctx.fill();
    // sunlit left face
    ctx.fillStyle = lighten(biome.feature, 0.22);
    ctx.beginPath();
    ctx.moveTo(px + offset, baseY);
    ctx.lineTo(peakX, peakY);
    ctx.lineTo(peakX, baseY);
    ctx.closePath();
    ctx.fill();
    if (snow && ts >= 6) {
      ctx.fillStyle = '#f2f6fb';
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.lineTo(peakX - Math.floor(ts * 0.16), peakY + Math.floor(ts * 0.22));
      ctx.lineTo(peakX + Math.floor(ts * 0.16), peakY + Math.floor(ts * 0.22));
      ctx.closePath();
      ctx.fill();
    }
  }

  paintTree(ctx, px, py, ts, canopy, conifer) {
    const cx = px + Math.floor(ts / 2);
    const trunkW = Math.max(1, Math.floor(ts * 0.14));
    ctx.fillStyle = '#5a3d28';
    ctx.fillRect(cx - Math.floor(trunkW / 2), py + Math.floor(ts * 0.58), trunkW, Math.floor(ts * 0.34));
    const r = Math.max(2, Math.floor(ts * 0.36));
    if (conifer) {
      // layered pine
      ctx.fillStyle = canopy;
      for (let i = 0; i < 2; i++) {
        const ty = py + Math.floor(ts * (0.12 + i * 0.22));
        ctx.beginPath();
        ctx.moveTo(cx, ty);
        ctx.lineTo(cx - r, ty + Math.floor(ts * 0.3));
        ctx.lineTo(cx + r, ty + Math.floor(ts * 0.3));
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.arc(cx, py + Math.floor(ts * 0.36), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lighten(canopy, 0.18);
      ctx.beginPath();
      ctx.arc(cx - Math.floor(ts * 0.1), py + Math.floor(ts * 0.3), Math.max(1, Math.floor(r * 0.45)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  paintResource(ctx, px, py, ts) {
    const cx = px + ts / 2, cy = py + ts / 2;
    const s = Math.max(2, Math.floor(ts * 0.28));
    ctx.save();
    ctx.fillStyle = '#f4cf57';
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // ---- DYNAMIC LAYERS (every frame) ----
  // civs is an array: [civA, civB] for 1v1, [civA, civB, civC] for 1v1v1.
  render(civs, year, mode = 'sim') {
    this.mode = mode;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.terrainCanvas, this.offsetX, this.offsetY);

    const ts = this.tileSize;
    const now = Date.now();

    // Animated water shimmer
    const shimmer = Math.floor(now / 500);
    ctx.fillStyle = 'rgba(150,200,235,0.35)';
    for (const w of this.waterTiles) {
      if ((w.x + w.y + shimmer) % 6 === 0) {
        ctx.fillRect(this.offsetX + w.x * ts, this.offsetY + w.y * ts + Math.floor(ts / 2), ts, 1);
      }
    }
    // Animated lava glow flicker
    const flick = Math.floor(now / 220);
    for (const l of this.lavaTiles) {
      const on = (l.x * 3 + l.y * 7 + flick) % 4 === 0;
      ctx.fillStyle = on ? 'rgba(255,180,60,0.85)' : 'rgba(200,70,20,0.5)';
      ctx.fillRect(this.offsetX + l.x * ts + Math.floor(ts * 0.3), this.offsetY + l.y * ts + Math.floor(ts * 0.45), Math.max(1, Math.floor(ts * 0.4)), 1);
    }

    this.renderTerritory(civs, ts);

    const settlements = this.collectSettlements(civs);

    if (mode === 'sim') {
      this.updateCitizens(civs, settlements);
      this.drawCitizens(ts);
    }

    for (const e of settlements) {
      this.drawSettlement(e.x, e.y, e.s, e.civ, ts);
    }

    for (const u of this.battleUnits) this.drawUnit(u, ts);

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const s = p.size || 3;
      ctx.fillRect(this.offsetX + p.x * ts - s / 2, this.offsetY + p.y * ts - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  collectSettlements(civs) {
    const out = [];
    const byOwner = {};
    for (const civ of civs) {
      byOwner[civ.side] = civ;
      if (civ._settlements) for (const e of civ._settlements) out.push({ x: e.x, y: e.y, s: e.s, civ });
    }
    if (out.length === 0) {
      // Early-game fallback before the sim builds its caches.
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

  renderTerritory(civs, ts) {
    const ctx = this.ctx;
    const tiles = this.map.tiles;
    const fill = {}, line = {};
    for (const civ of civs) {
      fill[civ.side] = alphaColor(civ.color, 0.20);
      line[civ.side] = alphaColor(lighten(civ.color, 0.25), 0.9);
    }

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const owner = tiles[y][x].owner;
        if (!owner || !fill[owner]) continue;
        const px = this.offsetX + x * ts, py = this.offsetY + y * ts;
        ctx.fillStyle = fill[owner];
        ctx.fillRect(px, py, ts, ts);
        ctx.fillStyle = line[owner];
        const right = x + 1 < this.map.width ? tiles[y][x + 1].owner : null;
        const down  = y + 1 < this.map.height ? tiles[y + 1][x].owner : null;
        const left  = x > 0 ? tiles[y][x - 1].owner : null;
        const up    = y > 0 ? tiles[y - 1][x].owner : null;
        if (right !== owner) ctx.fillRect(px + ts - 1, py, 1, ts);
        if (down  !== owner) ctx.fillRect(px, py + ts - 1, ts, 1);
        if (left  !== owner) ctx.fillRect(px, py, 1, ts);
        if (up    !== owner) ctx.fillRect(px, py, ts, 1);
      }
    }
  }

  // ---- AMBIENT CITIZENS ----
  // Cosmetic-only: small figures of each race wandering between their
  // settlements. Decoupled from the deterministic sim entirely.
  updateCitizens(civs, settlements) {
    const bySide = {};
    for (const civ of civs) bySide[civ.side] = [];
    for (const e of settlements) if (bySide[e.s.owner]) bySide[e.s.owner].push(e);

    for (const civ of civs) {
      const homes = bySide[civ.side];
      const target = homes.length === 0 ? 0
        : Math.min(45, homes.length * 2 + Math.min(18, Math.floor(Math.log10(civ.population + 1) * 3)));

      let mine = this.citizens.filter(c => c.side === civ.side);
      // Spawn up to target
      while (mine.length < target) {
        const h = homes[(Math.random() * homes.length) | 0];
        const c = {
          side: civ.side, color: civ.color,
          x: h.x + (Math.random() - 0.5) * 2,
          y: h.y + (Math.random() - 0.5) * 2,
          tx: h.x, ty: h.y,
          speed: 0.05 + Math.random() * 0.07,
          bob: Math.random() * Math.PI * 2,
        };
        this.citizens.push(c);
        mine.push(c);
      }
      // Cull extras (e.g. lost settlements)
      if (mine.length > target) {
        let toRemove = mine.length - target;
        this.citizens = this.citizens.filter(c => {
          if (c.side === civ.side && toRemove > 0) { toRemove--; return false; }
          return true;
        });
      }

      // Move
      for (const c of this.citizens) {
        if (c.side !== civ.side) continue;
        const dx = c.tx - c.x, dy = c.ty - c.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.6 || !isFinite(d)) {
          // pick a new destination
          if (homes.length && Math.random() < 0.7) {
            const h = homes[(Math.random() * homes.length) | 0];
            c.tx = h.x + (Math.random() - 0.5) * 3;
            c.ty = h.y + (Math.random() - 0.5) * 3;
          } else {
            c.tx = c.x + (Math.random() - 0.5) * 8;
            c.ty = c.y + (Math.random() - 0.5) * 8;
          }
        } else {
          c.x += (dx / d) * c.speed;
          c.y += (dy / d) * c.speed;
          c.bob += 0.3;
        }
      }
    }
  }

  drawCitizens(ts) {
    const ctx = this.ctx;
    // Draw each citizen as a small bright figure with a dark outline so the
    // race is clearly visible moving across its own (same-coloured) land.
    const w = ts >= 10 ? 2 : 1;
    const hgt = ts >= 10 ? 4 : (ts >= 6 ? 3 : 2);
    for (const c of this.citizens) {
      const px = this.offsetX + c.x * ts;
      const py = this.offsetY + c.y * ts + Math.sin(c.bob) * 0.7;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px - w / 2 - 1, py - hgt / 2 - 1, w + 2, hgt + 2);
      ctx.fillStyle = lighten(c.color, 0.5);
      ctx.fillRect(px - w / 2, py - hgt / 2, w, hgt);
    }
  }

  // ---- SETTLEMENTS (with construction animation) ----
  drawSettlement(x, y, settlement, civ, ts) {
    const ctx = this.ctx;
    const px = this.offsetX + x * ts;
    const py = this.offsetY + y * ts;
    const color = civ.color;
    const dark = shade(color, -0.5);
    const light = lighten(color, 0.35);
    const cx = px + ts / 2;

    // ---- construction state (renderer-owned) ----
    if (settlement._tierShown === undefined) {
      settlement._tierShown = settlement.tier;
      settlement._build = 0;            // newly seen: animate it rising
      settlement._constructing = true;
    } else if (settlement.tier > settlement._tierShown) {
      settlement._tierShown = settlement.tier;
      settlement._build = 0;            // upgraded: rebuild animation
      settlement._constructing = true;
    }
    if (settlement._constructing) {
      settlement._build = Math.min(1, settlement._build + 0.025);
      if (settlement._build >= 1) settlement._constructing = false;
      if (ts >= 6 && Math.random() < 0.35) {
        this.addParticle(x + 0.5 + (Math.random() - 0.5) * 0.6, y + 0.2, '#caa86a', 18);
      }
    }
    const tier = settlement._tierShown;
    const build = settlement._build;

    // Capital influence glow
    if (settlement.isCapital) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, py + ts / 2, ts * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (ts < 6) {
      ctx.fillStyle = color;
      const d = Math.max(2, Math.floor(ts / 2));
      ctx.fillRect(px + Math.floor(ts / 4), py + Math.floor(ts / 4), d, d);
      if (settlement.isCapital) { ctx.fillStyle = '#ffe14d'; ctx.fillRect(cx - 1, py - 1, 2, 2); }
      return;
    }

    // Plot base (always visible — the cleared ground)
    ctx.fillStyle = dark;
    ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);

    // Clip the building to a height that grows with `build` so it rises.
    ctx.save();
    ctx.beginPath();
    const bh = Math.max(1, Math.round((ts - 2) * build));
    ctx.rect(px, py + (ts - 1) - bh, ts, bh + 1);
    ctx.clip();
    this.drawBuilding(ctx, px, py, ts, tier, color, light, dark);
    ctx.restore();

    // Scaffolding while under construction
    if (settlement._constructing && ts >= 7) {
      ctx.strokeStyle = 'rgba(214,196,120,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 2, py + ts - 2); ctx.lineTo(px + 2, py + 2);
      ctx.moveTo(px + ts - 2, py + ts - 2); ctx.lineTo(px + ts - 2, py + 2);
      ctx.moveTo(px + 2, py + Math.floor(ts * 0.45)); ctx.lineTo(px + ts - 2, py + Math.floor(ts * 0.45));
      ctx.stroke();
    }

    // Capital banner + star (only once mostly built)
    if (settlement.isCapital && build > 0.6) {
      ctx.fillStyle = '#caa84a';
      ctx.fillRect(cx, py - Math.floor(ts * 0.5), 1, Math.floor(ts * 0.5));
      ctx.fillStyle = light;
      ctx.fillRect(cx + 1, py - Math.floor(ts * 0.5), Math.max(2, Math.floor(ts * 0.3)), Math.max(2, Math.floor(ts * 0.22)));
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(cx - 1, py - Math.floor(ts * 0.5) - 1, 2, 2);
    }

    // Chimney smoke from established towns
    if (this.mode === 'sim' && tier >= 2 && !settlement._constructing && Math.random() < 0.01) {
      this.addParticle(x + 0.5, y, 'rgba(180,180,190,0.7)', 40, -0.04);
    }
  }

  drawBuilding(ctx, px, py, ts, tier, color, light, dark) {
    const cx = px + ts / 2;
    ctx.fillStyle = color;
    if (tier === 0) {
      ctx.beginPath();
      ctx.moveTo(cx, py + 2);
      ctx.lineTo(px + 2, py + ts - 2);
      ctx.lineTo(px + ts - 2, py + ts - 2);
      ctx.closePath();
      ctx.fill();
    } else if (tier === 1) {
      ctx.fillRect(px + Math.floor(ts * 0.28), py + Math.floor(ts * 0.45), Math.floor(ts * 0.44), Math.floor(ts * 0.45));
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(cx, py + Math.floor(ts * 0.2));
      ctx.lineTo(px + Math.floor(ts * 0.22), py + Math.floor(ts * 0.48));
      ctx.lineTo(px + Math.floor(ts * 0.78), py + Math.floor(ts * 0.48));
      ctx.closePath();
      ctx.fill();
    } else if (tier === 2) {
      ctx.fillRect(px + 2, py + Math.floor(ts * 0.42), ts - 4, Math.floor(ts * 0.48));
      ctx.fillStyle = light;
      ctx.fillRect(px + 3, py + Math.floor(ts * 0.26), ts - 6, Math.floor(ts * 0.2));
      ctx.fillStyle = dark;
      ctx.fillRect(cx - 1, py + Math.floor(ts * 0.6), 2, Math.floor(ts * 0.3));
    } else if (tier === 3) {
      ctx.fillRect(px + 2, py + Math.floor(ts * 0.42), Math.floor(ts * 0.32), Math.floor(ts * 0.5));
      ctx.fillRect(px + Math.floor(ts * 0.58), py + Math.floor(ts * 0.42), Math.floor(ts * 0.32), Math.floor(ts * 0.5));
      ctx.fillStyle = light;
      ctx.fillRect(px + Math.floor(ts * 0.36), py + Math.floor(ts * 0.24), Math.floor(ts * 0.28), Math.floor(ts * 0.66));
    } else {
      ctx.fillRect(px + 1, py + 2, ts - 2, ts - 3);
      ctx.fillStyle = light;
      ctx.fillRect(px + Math.floor(ts * 0.28), py, Math.floor(ts * 0.44), Math.floor(ts * 0.4));
      ctx.fillStyle = '#ffe14d';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(px + 3 + i * Math.floor(ts * 0.3), py + Math.floor(ts * 0.5), 1, 1);
        ctx.fillRect(px + 3 + i * Math.floor(ts * 0.3), py + Math.floor(ts * 0.7), 1, 1);
      }
    }
  }

  drawUnit(unit, ts) {
    if (unit.dead) return;
    const ctx = this.ctx;
    const px = this.offsetX + unit.x * ts;
    const py = this.offsetY + unit.y * ts;
    const size = Math.max(2, Math.floor(ts * 0.55));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px - size / 2 - 1, py - size / 2 - 1, size + 2, size + 2);
    ctx.fillStyle = unit.color;
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
    if (unit.elite) { ctx.fillStyle = '#ffe14d'; ctx.fillRect(px - 1, py - size / 2 - 3, 2, 2); }
  }

  updateParticles() {
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.life--; }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  addParticle(x, y, color, life = 20, vy) {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.12,
      vy: vy !== undefined ? vy : (Math.random() - 0.5) * 0.12,
      color, life, maxLife: life,
      size: 2 + Math.random() * 2,
    });
  }
}

// ---- standalone colour helpers (shared) ----
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
}
function alphaColor(hex, a) { const c = hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; }
function shade(hex, amount) {
  const c = hexToRgb(hex);
  const f = (v) => amount >= 0 ? Math.round(v + (255 - v) * amount) : Math.round(v * (1 + amount));
  return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
}
function lighten(hex, amount) { return shade(hex, Math.abs(amount)); }

// ============================================================
// TIMELINE RENDERER — scales to any run length.
// ============================================================
class TimelineRenderer {
  constructor(canvas, maxYear = 1000) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.events = [];
    this.maxYear = maxYear;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  addEvent(year, tag, side) { this.events.push({ year, tag, side }); }

  render(currentYear) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const my = this.maxYear;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#161a26');
    grad.addColorStop(1, '#10131c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#2d3142';
    ctx.fillRect(24, h / 2, w - 48, 2);

    ctx.fillStyle = '#8892a8';
    ctx.font = '10px "Share Tech Mono", monospace';
    const step = my / 10;
    for (let yr = 0; yr <= my; yr += step) {
      const x = 24 + (yr / my) * (w - 48);
      ctx.fillRect(x, h / 2 - 4, 1, 8);
      ctx.fillText(Math.round(yr), x - 8, h - 4);
    }

    const tagColors = {
      tech: '#6cc4f0', war: '#e0584f', disaster: '#ff9933',
      cultural: '#c97aff', major: '#ffe14d',
    };
    for (const ev of this.events) {
      const x = 24 + (ev.year / my) * (w - 48);
      // A above the line, B below, C on the line (for the third player).
      const yOffset = ev.side === 'A' ? -12 : ev.side === 'B' ? 12 : 0;
      ctx.fillStyle = tagColors[ev.tag] || '#d8dde8';
      ctx.fillRect(x - 1, h / 2 + yOffset - 2, 3, 4);
    }

    const curX = 24 + (currentYear / my) * (w - 48);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(curX - 1, 4, 2, h - 8);
    ctx.fillStyle = 'rgba(212,175,55,0.25)';
    ctx.fillRect(24, 4, curX - 24, h - 8);
  }
}
