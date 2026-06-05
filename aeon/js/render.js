// ============================================================
// AEON :: RENDERER
// Canvas-based pixel rendering for the map and timeline.
// ============================================================

class Renderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.tileSize = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.resize();
    this.battleUnits = []; // for battle phase
    this.particles = [];
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.computeTileSize();
  }

  computeTileSize() {
    const tw = this.canvas.width / this.map.width;
    const th = this.canvas.height / this.map.height;
    this.tileSize = Math.floor(Math.min(tw, th));
    if (this.tileSize < 4) this.tileSize = 4;
    this.offsetX = Math.floor((this.canvas.width  - this.tileSize * this.map.width)  / 2);
    this.offsetY = Math.floor((this.canvas.height - this.tileSize * this.map.height) / 2);
  }

  render(civA, civB, year) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const ts = this.tileSize;
    const tiles = this.map.tiles;

    // Pass 1: terrain
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const t = tiles[y][x];
        this.drawTile(x, y, t, ts);
      }
    }

    // Pass 2: territory tinting (owner overlay)
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const t = tiles[y][x];
        if (t.owner === 'A') {
          ctx.fillStyle = this.alphaColor(civA.color, 0.18);
          ctx.fillRect(this.offsetX + x*ts, this.offsetY + y*ts, ts, ts);
        } else if (t.owner === 'B') {
          ctx.fillStyle = this.alphaColor(civB.color, 0.18);
          ctx.fillRect(this.offsetX + x*ts, this.offsetY + y*ts, ts, ts);
        }
      }
    }

    // Pass 3: settlements
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const t = tiles[y][x];
        if (t.settlement) {
          this.drawSettlement(x, y, t.settlement, t.settlement.owner === 'A' ? civA : civB, ts);
        }
      }
    }

    // Pass 4: battle units (if any)
    for (const u of this.battleUnits) {
      this.drawUnit(u, ts);
    }

    // Pass 5: particles
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(this.offsetX + p.x * ts - 1, this.offsetY + p.y * ts - 1, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  drawTile(x, y, t, ts) {
    const ctx = this.ctx;
    const px = this.offsetX + x*ts;
    const py = this.offsetY + y*ts;
    const biome = BIOMES[t.biomeKey];

    if (t.type === TILE.WATER) {
      ctx.fillStyle = '#2a4a6a';
      ctx.fillRect(px, py, ts, ts);
      // shimmer
      if ((x + y + Math.floor(Date.now()/600)) % 7 === 0) {
        ctx.fillStyle = '#3a6090';
        ctx.fillRect(px, py + Math.floor(ts/2), ts, 1);
      }
      return;
    }

    // Base biome color (slight variation)
    const useAlt = ((x * 7 + y * 11) % 4) < 2;
    ctx.fillStyle = useAlt ? biome.colorAlt : biome.color;
    ctx.fillRect(px, py, ts, ts);

    // Elevation darkening
    if (t.elevation > 0.7) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(px, py, ts, ts);
    } else if (t.elevation < 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(px, py, ts, ts);
    }

    if (t.type === TILE.HILL) {
      ctx.fillStyle = biome.feature;
      const s = Math.max(2, Math.floor(ts * 0.6));
      const offset = Math.floor((ts - s) / 2);
      // Simple triangle hill
      ctx.beginPath();
      ctx.moveTo(px + offset, py + ts - offset);
      ctx.lineTo(px + ts/2, py + offset);
      ctx.lineTo(px + ts - offset, py + ts - offset);
      ctx.closePath();
      ctx.fill();
    } else if (t.feature === 1 && ts >= 6) {
      // trees
      ctx.fillStyle = biome.feature;
      ctx.fillRect(px + Math.floor(ts*0.3), py + Math.floor(ts*0.2), Math.max(1,Math.floor(ts*0.4)), Math.max(1,Math.floor(ts*0.6)));
    } else if (t.feature === 3 && ts >= 4) {
      // ice
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + 1, py + 1, Math.max(1, ts-2), 1);
    } else if (t.feature === 4 && ts >= 4) {
      // grass tufts
      ctx.fillStyle = biome.feature;
      ctx.fillRect(px + Math.floor(ts/2), py + Math.floor(ts*0.6), 1, Math.max(1, Math.floor(ts*0.3)));
    } else if (t.type === TILE.RESOURCE) {
      ctx.fillStyle = '#f0c850';
      const s = Math.max(2, Math.floor(ts * 0.4));
      const offset = Math.floor((ts - s) / 2);
      ctx.fillRect(px + offset, py + offset, s, s);
    }
  }

  drawSettlement(x, y, settlement, civ, ts) {
    const ctx = this.ctx;
    const px = this.offsetX + x*ts;
    const py = this.offsetY + y*ts;
    const tier = settlement.tier;
    const color = civ.color;
    const dark = this.darken(color, 0.5);

    // Settlement tiers visualized with growing complexity
    const cx = px + ts/2;
    const cy = py + ts/2;

    if (ts < 6) {
      // Just a colored dot at small zoom
      ctx.fillStyle = color;
      ctx.fillRect(px + Math.floor(ts/4), py + Math.floor(ts/4), Math.max(2, Math.floor(ts/2)), Math.max(2, Math.floor(ts/2)));
      if (settlement.isCapital) {
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(px + Math.floor(ts/2)-1, py - 1, 2, 2);
      }
      return;
    }

    // Background pad
    ctx.fillStyle = dark;
    ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);

    // Tier 0: tent (small triangle)
    // Tier 1: hut (small square)
    // Tier 2: village (square + roof)
    // Tier 3: city (multiple squares)
    // Tier 4: metropolis (filled with structures)
    ctx.fillStyle = color;

    if (tier === 0) {
      ctx.beginPath();
      ctx.moveTo(cx, py + 2);
      ctx.lineTo(px + 2, py + ts - 2);
      ctx.lineTo(px + ts - 2, py + ts - 2);
      ctx.closePath();
      ctx.fill();
    } else if (tier === 1) {
      ctx.fillRect(px + Math.floor(ts*0.25), py + Math.floor(ts*0.35), Math.floor(ts*0.5), Math.floor(ts*0.5));
    } else if (tier === 2) {
      ctx.fillRect(px + 2, py + Math.floor(ts*0.4), ts - 4, Math.floor(ts*0.5));
      ctx.fillStyle = this.lighten(color, 0.3);
      ctx.fillRect(px + 3, py + Math.floor(ts*0.25), ts - 6, Math.floor(ts*0.2));
    } else if (tier === 3) {
      ctx.fillRect(px + 2, py + Math.floor(ts*0.4), Math.floor(ts*0.35), Math.floor(ts*0.5));
      ctx.fillRect(px + Math.floor(ts*0.55), py + Math.floor(ts*0.4), Math.floor(ts*0.35), Math.floor(ts*0.5));
      ctx.fillRect(px + Math.floor(ts*0.35), py + Math.floor(ts*0.25), Math.floor(ts*0.3), Math.floor(ts*0.7));
    } else {
      // Metropolis: glowing dense city
      ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
      ctx.fillStyle = this.lighten(color, 0.5);
      ctx.fillRect(px + Math.floor(ts*0.3), py + 1, Math.floor(ts*0.4), Math.floor(ts*0.4));
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(px + Math.floor(ts*0.45), py + Math.floor(ts*0.45), 2, 2);
    }

    // Capital marker
    if (settlement.isCapital) {
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(cx - 1, py - 2, 2, 2);
    }
  }

  drawUnit(unit, ts) {
    const ctx = this.ctx;
    const px = this.offsetX + unit.x * ts;
    const py = this.offsetY + unit.y * ts;
    if (unit.dead) return;

    ctx.fillStyle = unit.color;
    const size = Math.max(2, Math.floor(ts * 0.5));
    ctx.fillRect(px - size/2, py - size/2, size, size);

    // Highlight elite/champion units
    if (unit.elite) {
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(px - 1, py - size/2 - 2, 2, 2);
    }
  }

  // Animate particles forward; remove dead ones
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
      vx: (Math.random() - 0.5) * 0.1,
      vy: (Math.random() - 0.5) * 0.1,
      color,
      life, maxLife: life,
    });
  }

  alphaColor(hex, a) {
    const c = this.hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }

  hexToRgb(hex) {
    const h = hex.replace('#','');
    return {
      r: parseInt(h.substr(0,2), 16),
      g: parseInt(h.substr(2,2), 16),
      b: parseInt(h.substr(4,2), 16),
    };
  }

  darken(hex, amount) {
    const c = this.hexToRgb(hex);
    const r = Math.floor(c.r * (1 - amount));
    const g = Math.floor(c.g * (1 - amount));
    const b = Math.floor(c.b * (1 - amount));
    return `rgb(${r},${g},${b})`;
  }

  lighten(hex, amount) {
    const c = this.hexToRgb(hex);
    const r = Math.min(255, Math.floor(c.r + (255 - c.r) * amount));
    const g = Math.min(255, Math.floor(c.g + (255 - c.g) * amount));
    const b = Math.min(255, Math.floor(c.b + (255 - c.b) * amount));
    return `rgb(${r},${g},${b})`;
  }
}

// ============================================================
// TIMELINE RENDERER
// ============================================================
class TimelineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.events = []; // {year, tag, side}
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  addEvent(year, tag, side) {
    this.events.push({ year, tag, side });
  }

  render(currentYear) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#181a24';
    ctx.fillRect(0, 0, w, h);

    // Baseline
    ctx.fillStyle = '#2d3142';
    ctx.fillRect(20, h/2, w - 40, 2);

    // Year ticks
    ctx.fillStyle = '#8892a8';
    ctx.font = '10px Courier New';
    for (let y = 0; y <= 1000; y += 100) {
      const x = 20 + (y / 1000) * (w - 40);
      ctx.fillRect(x, h/2 - 4, 1, 8);
      ctx.fillText(y, x - 8, h - 4);
    }

    // Events
    const tagColors = {
      tech: '#6cc4f0',
      war: '#d9534f',
      disaster: '#ff9933',
      cultural: '#c97aff',
      major: '#ffeb3b',
    };

    for (const ev of this.events) {
      const x = 20 + (ev.year / 1000) * (w - 40);
      const yOffset = ev.side === 'A' ? -10 : 10;
      ctx.fillStyle = tagColors[ev.tag] || '#d8dde8';
      ctx.fillRect(x - 1, h/2 + yOffset - 2, 3, 4);
    }

    // Current year marker
    const curX = 20 + (currentYear / 1000) * (w - 40);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(curX - 1, 4, 2, h - 8);
  }
}
