// ============================================================
// AEON :: RENDERER
// Canvas rendering for the map + timeline.
// Static terrain is baked once into an offscreen cache; only the
// dynamic layers (territory, settlements, units, particles) are
// redrawn each frame. This keeps long, fast simulations smooth
// while allowing far richer per-tile detail.
// ============================================================

class Renderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.tileSize = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.battleUnits = [];
    this.particles = [];
    this.waterTiles = [];
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

  // ---- STATIC TERRAIN (baked once) ----
  renderTerrainCache() {
    const ts = this.tileSize;
    const cw = ts * this.map.width;
    const ch = ts * this.map.height;
    this.terrainCanvas.width = cw;
    this.terrainCanvas.height = ch;
    const ctx = this.terrainCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, cw, ch);

    this.waterTiles = [];
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

    if (t.type === TILE.WATER || t.river) {
      this.paintWater(ctx, px, py, ts, t.river);
      this.waterTiles.push({ x, y, river: t.river });
      return;
    }

    // Base biome colour with a deterministic chequer + elevation shade.
    const useAlt = ((x * 7 + y * 11) % 4) < 2;
    let base = useAlt ? biome.colorAlt : biome.color;
    // Elevation tint baked in
    if (t.elevation > 0.72)       base = shade(base, -0.16);
    else if (t.elevation > 0.5)   base = shade(base, -0.07);
    else if (t.elevation < 0.25)  base = shade(base, 0.07);
    ctx.fillStyle = base;
    ctx.fillRect(px, py, ts, ts);

    // Subtle bottom/right edge for a tiled, embossed feel.
    if (ts >= 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(px, py + ts - 1, ts, 1);
      ctx.fillRect(px + ts - 1, py, 1, ts);
    }

    // Features
    if (t.type === TILE.HILL) {
      this.paintHill(ctx, px, py, ts, biome);
    } else if (t.feature === FEAT.TREE && ts >= 5) {
      this.paintTree(ctx, px, py, ts, biome);
    } else if (t.feature === FEAT.VINE && ts >= 4) {
      ctx.fillStyle = shade(biome.feature, -0.15);
      ctx.fillRect(px + 1, py + Math.floor(ts * 0.5), Math.max(1, ts - 2), 1);
      ctx.fillRect(px + Math.floor(ts * 0.3), py + 1, 1, Math.max(1, ts - 2));
    } else if (t.feature === FEAT.ICE && ts >= 4) {
      ctx.fillStyle = '#eef4fb';
      ctx.fillRect(px + 1, py + 1, Math.max(1, ts - 2), 1);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(px + 1, py + 2, Math.max(1, Math.floor(ts / 2)), 1);
    } else if (t.feature === FEAT.DUNE && ts >= 4) {
      ctx.fillStyle = shade(biome.feature, 0.1);
      ctx.fillRect(px + 1, py + Math.floor(ts * 0.55), Math.max(1, ts - 2), 1);
    } else if (t.feature === FEAT.TUFT && ts >= 4) {
      ctx.fillStyle = biome.feature;
      const gx = px + Math.floor(ts / 2);
      ctx.fillRect(gx, py + Math.floor(ts * 0.55), 1, Math.max(1, Math.floor(ts * 0.35)));
      ctx.fillRect(gx - 2, py + Math.floor(ts * 0.65), 1, Math.max(1, Math.floor(ts * 0.25)));
      ctx.fillRect(gx + 2, py + Math.floor(ts * 0.65), 1, Math.max(1, Math.floor(ts * 0.25)));
    } else if (t.feature === FEAT.ROCK && ts >= 4) {
      ctx.fillStyle = shade(biome.feature, -0.1);
      ctx.fillRect(px + Math.floor(ts * 0.4), py + Math.floor(ts * 0.5), Math.max(1, Math.floor(ts * 0.3)), Math.max(1, Math.floor(ts * 0.25)));
    } else if (t.type === TILE.RESOURCE) {
      this.paintResource(ctx, px, py, ts);
    }
  }

  paintWater(ctx, px, py, ts, river) {
    ctx.fillStyle = river ? '#33597f' : '#27496b';
    ctx.fillRect(px, py, ts, ts);
    ctx.fillStyle = 'rgba(120,170,210,0.18)';
    ctx.fillRect(px, py + Math.floor(ts * 0.3), ts, Math.max(1, Math.floor(ts * 0.12)));
  }

  paintHill(ctx, px, py, ts, biome) {
    const offset = Math.max(1, Math.floor(ts * 0.18));
    ctx.fillStyle = biome.feature;
    ctx.beginPath();
    ctx.moveTo(px + offset, py + ts - offset);
    ctx.lineTo(px + ts / 2, py + offset);
    ctx.lineTo(px + ts - offset, py + ts - offset);
    ctx.closePath();
    ctx.fill();
    // sunlit left face
    ctx.fillStyle = lighten(biome.feature, 0.25);
    ctx.beginPath();
    ctx.moveTo(px + offset, py + ts - offset);
    ctx.lineTo(px + ts / 2, py + offset);
    ctx.lineTo(px + ts / 2, py + ts - offset);
    ctx.closePath();
    ctx.fill();
  }

  paintTree(ctx, px, py, ts, biome) {
    const trunkW = Math.max(1, Math.floor(ts * 0.14));
    const cx = px + Math.floor(ts / 2);
    // trunk
    ctx.fillStyle = '#5a3d28';
    ctx.fillRect(cx - Math.floor(trunkW / 2), py + Math.floor(ts * 0.55), trunkW, Math.floor(ts * 0.35));
    // canopy
    ctx.fillStyle = biome.feature;
    const r = Math.max(2, Math.floor(ts * 0.34));
    ctx.beginPath();
    ctx.moveTo(cx, py + Math.floor(ts * 0.1));
    ctx.lineTo(cx - r, py + Math.floor(ts * 0.62));
    ctx.lineTo(cx + r, py + Math.floor(ts * 0.62));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = lighten(biome.feature, 0.2);
    ctx.fillRect(cx - 1, py + Math.floor(ts * 0.25), 1, Math.floor(ts * 0.25));
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
  render(civA, civB, year) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Blit baked terrain
    ctx.drawImage(this.terrainCanvas, this.offsetX, this.offsetY);

    const ts = this.tileSize;

    // Animated water shimmer (cheap — only over known water tiles)
    const shimmer = Math.floor(Date.now() / 500);
    ctx.fillStyle = 'rgba(150,200,235,0.35)';
    for (const w of this.waterTiles) {
      if ((w.x + w.y + shimmer) % 6 === 0) {
        ctx.fillRect(this.offsetX + w.x * ts, this.offsetY + w.y * ts + Math.floor(ts / 2), ts, 1);
      }
    }

    this.renderTerritory(civA, civB, ts);

    // Settlements
    const tiles = this.map.tiles;
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const t = tiles[y][x];
        if (t.settlement) {
          this.drawSettlement(x, y, t.settlement, t.settlement.owner === 'A' ? civA : civB, ts);
        }
      }
    }

    // Battle units
    for (const u of this.battleUnits) this.drawUnit(u, ts);

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      const s = p.size || 3;
      ctx.fillRect(this.offsetX + p.x * ts - s / 2, this.offsetY + p.y * ts - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // Territory fill + crisp owner borders.
  renderTerritory(civA, civB, ts) {
    const ctx = this.ctx;
    const tiles = this.map.tiles;
    const aFill = alphaColor(civA.color, 0.20);
    const bFill = alphaColor(civB.color, 0.20);
    const aLine = alphaColor(lighten(civA.color, 0.25), 0.9);
    const bLine = alphaColor(lighten(civB.color, 0.25), 0.9);

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const owner = tiles[y][x].owner;
        if (!owner) continue;
        const px = this.offsetX + x * ts, py = this.offsetY + y * ts;
        ctx.fillStyle = owner === 'A' ? aFill : bFill;
        ctx.fillRect(px, py, ts, ts);

        // Border where the neighbour to the right / bottom differs.
        ctx.fillStyle = owner === 'A' ? aLine : bLine;
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

  drawSettlement(x, y, settlement, civ, ts) {
    const ctx = this.ctx;
    const px = this.offsetX + x * ts;
    const py = this.offsetY + y * ts;
    const tier = settlement.tier;
    const color = civ.color;
    const dark = shade(color, -0.5);
    const light = lighten(color, 0.35);
    const cx = px + ts / 2;

    // Capital influence glow
    if (settlement.isCapital) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, py + ts / 2, ts * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (ts < 6) {
      ctx.fillStyle = color;
      const d = Math.max(2, Math.floor(ts / 2));
      ctx.fillRect(px + Math.floor(ts / 4), py + Math.floor(ts / 4), d, d);
      if (settlement.isCapital) {
        ctx.fillStyle = '#ffe14d';
        ctx.fillRect(cx - 1, py - 1, 2, 2);
      }
      return;
    }

    // Plot base
    ctx.fillStyle = dark;
    ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
    ctx.fillStyle = color;

    if (tier === 0) {
      // tent
      ctx.beginPath();
      ctx.moveTo(cx, py + 2);
      ctx.lineTo(px + 2, py + ts - 2);
      ctx.lineTo(px + ts - 2, py + ts - 2);
      ctx.closePath();
      ctx.fill();
    } else if (tier === 1) {
      // hut + roof
      ctx.fillRect(px + Math.floor(ts * 0.28), py + Math.floor(ts * 0.45), Math.floor(ts * 0.44), Math.floor(ts * 0.45));
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(cx, py + Math.floor(ts * 0.2));
      ctx.lineTo(px + Math.floor(ts * 0.22), py + Math.floor(ts * 0.48));
      ctx.lineTo(px + Math.floor(ts * 0.78), py + Math.floor(ts * 0.48));
      ctx.closePath();
      ctx.fill();
    } else if (tier === 2) {
      // village: building + roof
      ctx.fillRect(px + 2, py + Math.floor(ts * 0.42), ts - 4, Math.floor(ts * 0.48));
      ctx.fillStyle = light;
      ctx.fillRect(px + 3, py + Math.floor(ts * 0.26), ts - 6, Math.floor(ts * 0.2));
      ctx.fillStyle = dark;
      ctx.fillRect(cx - 1, py + Math.floor(ts * 0.6), 2, Math.floor(ts * 0.3)); // door
    } else if (tier === 3) {
      // city: towers
      ctx.fillRect(px + 2, py + Math.floor(ts * 0.42), Math.floor(ts * 0.32), Math.floor(ts * 0.5));
      ctx.fillRect(px + Math.floor(ts * 0.58), py + Math.floor(ts * 0.42), Math.floor(ts * 0.32), Math.floor(ts * 0.5));
      ctx.fillStyle = light;
      ctx.fillRect(px + Math.floor(ts * 0.36), py + Math.floor(ts * 0.24), Math.floor(ts * 0.28), Math.floor(ts * 0.66));
    } else {
      // metropolis: dense block, windows, glow
      ctx.fillRect(px + 1, py + 2, ts - 2, ts - 3);
      ctx.fillStyle = light;
      ctx.fillRect(px + Math.floor(ts * 0.28), py, Math.floor(ts * 0.44), Math.floor(ts * 0.4));
      ctx.fillStyle = '#ffe14d';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(px + 3 + i * Math.floor(ts * 0.3), py + Math.floor(ts * 0.5), 1, 1);
        ctx.fillRect(px + 3 + i * Math.floor(ts * 0.3), py + Math.floor(ts * 0.7), 1, 1);
      }
    }

    // Capital banner + star
    if (settlement.isCapital) {
      ctx.fillStyle = '#caa84a';
      ctx.fillRect(cx, py - Math.floor(ts * 0.5), 1, Math.floor(ts * 0.5)); // pole
      ctx.fillStyle = light;
      ctx.fillRect(cx + 1, py - Math.floor(ts * 0.5), Math.max(2, Math.floor(ts * 0.3)), Math.max(2, Math.floor(ts * 0.22))); // flag
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(cx - 1, py - Math.floor(ts * 0.5) - 1, 2, 2); // finial
    }
  }

  drawUnit(unit, ts) {
    if (unit.dead) return;
    const ctx = this.ctx;
    const px = this.offsetX + unit.x * ts;
    const py = this.offsetY + unit.y * ts;
    const size = Math.max(2, Math.floor(ts * 0.55));

    // dark outline for contrast
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px - size / 2 - 1, py - size / 2 - 1, size + 2, size + 2);
    ctx.fillStyle = unit.color;
    ctx.fillRect(px - size / 2, py - size / 2, size, size);

    if (unit.elite) {
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(px - 1, py - size / 2 - 3, 2, 2);
    }
  }

  updateParticles() {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  addParticle(x, y, color, life = 20) {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
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
  // amount > 0 lightens, < 0 darkens
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
      const yOffset = ev.side === 'A' ? -10 : 10;
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
