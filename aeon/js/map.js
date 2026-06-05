// ============================================================
// AEON :: MAP GENERATION
// Tile-based map. Left half = Side A biome, right half = Side B,
// with a contested middle strip that blends both.
// ============================================================

const MAP_SIZES = {
  small:  { w: 60,  h: 40 },
  medium: { w: 90,  h: 60 },
  large:  { w: 120, h: 80 },
  huge:   { w: 150, h: 96 },
};

const TILE = {
  TERRAIN: 0,
  WATER: 1,
  HILL: 2,
  RESOURCE: 3,
};

// Feature ids (visual decoration index)
const FEAT = {
  NONE: 0,
  TREE: 1,
  DUNE: 2,
  ICE: 3,
  TUFT: 4,
  VINE: 5,   // jungle
  ROCK: 6,   // generic rocky scatter
};

function generateMap(width, height, biomeA, biomeB, rng) {
  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = {
        biome: null,        // 'A' or 'B' or 'neutral'
        biomeKey: null,     // the biome name
        type: TILE.TERRAIN,
        elevation: 0,
        owner: null,        // 'A', 'B', or null
        settlement: null,   // {tier, pop, owner, isCapital} or null
        feature: 0,         // visual decoration index
        river: false,       // drawn as a thin water vein
      };
    }
  }

  // Pass 1: biome assignment with a wavy border
  const borderWave = [];
  for (let y = 0; y < height; y++) {
    const wave = Math.floor(Math.sin(y * 0.3 + rng.next() * 6.28) * 3 + rng.range(-2, 2));
    borderWave.push(Math.floor(width / 2) + wave);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      const border = borderWave[y];
      if (x < border - 2) {
        t.biome = 'A';
        t.biomeKey = biomeA;
      } else if (x > border + 2) {
        t.biome = 'B';
        t.biomeKey = biomeB;
      } else {
        // contested middle: mix both biomes
        t.biome = 'neutral';
        t.biomeKey = rng.chance(0.5) ? biomeA : biomeB;
      }
    }
  }

  // Pass 2: features (hills, water bodies, resource tiles, decoration)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      const r = rng.next();

      switch (t.biomeKey) {
        case 'coastal':
          if (r < 0.20) t.type = TILE.WATER;
          else if (r < 0.26) t.feature = FEAT.ROCK;
          break;
        case 'mountain':
          if (r < 0.40) t.type = TILE.HILL;
          break;
        case 'volcanic':
          if (r < 0.22) t.type = TILE.HILL;
          else if (r < 0.30) t.feature = FEAT.ROCK;
          break;
        case 'forest':
          if (r < 0.38) t.feature = FEAT.TREE;
          break;
        case 'jungle':
          if (r < 0.48) t.feature = FEAT.TREE;
          else if (r < 0.60) t.feature = FEAT.VINE;
          else if (r < 0.66) t.type = TILE.WATER;
          break;
        case 'desert':
          if (r < 0.10) t.feature = FEAT.DUNE;
          break;
        case 'tundra':
          if (r < 0.16) t.feature = FEAT.ICE;
          else if (r < 0.24) t.type = TILE.HILL;
          break;
        case 'swamp':
          if (r < 0.24) t.type = TILE.WATER;
          else if (r < 0.36) t.feature = FEAT.TUFT;
          break;
        case 'plains':
          if (r < 0.14) t.feature = FEAT.TUFT;
          break;
        case 'savanna':
          if (r < 0.16) t.feature = FEAT.TUFT;
          else if (r < 0.20) t.feature = FEAT.TREE;
          break;
        case 'steppe':
          if (r < 0.18) t.feature = FEAT.TUFT;
          break;
      }

      // Small chance of a resource node on open ground
      if (r > 0.97 && t.type === TILE.TERRAIN && t.feature === FEAT.NONE) {
        t.type = TILE.RESOURCE;
      }

      t.elevation = rng.range(0, 1);
    }
  }

  // Pass 3: a couple of meandering rivers for visual interest
  carveRivers(tiles, width, height, rng);

  // Capital spawn points — find a good land tile in each half
  const capitalA = findSpawn(tiles, width, height, 'A', rng);
  const capitalB = findSpawn(tiles, width, height, 'B', rng);

  if (capitalA) {
    tiles[capitalA.y][capitalA.x].settlement = { tier: 1, pop: 5, owner: 'A', isCapital: true };
    tiles[capitalA.y][capitalA.x].owner = 'A';
    tiles[capitalA.y][capitalA.x].type = TILE.TERRAIN;
  }
  if (capitalB) {
    tiles[capitalB.y][capitalB.x].settlement = { tier: 1, pop: 5, owner: 'B', isCapital: true };
    tiles[capitalB.y][capitalB.x].owner = 'B';
    tiles[capitalB.y][capitalB.x].type = TILE.TERRAIN;
  }

  return {
    width, height, tiles,
    capitalA, capitalB,
    biomeA, biomeB,
    borderWave,
  };
}

// Carve 1–2 winding rivers from top to bottom for visual texture.
function carveRivers(tiles, width, height, rng) {
  const count = 1 + (rng.chance(0.6) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    let x = rng.int(Math.floor(width * 0.2), Math.floor(width * 0.8));
    for (let y = 0; y < height; y++) {
      if (x < 1) x = 1; if (x > width - 2) x = width - 2;
      const t = tiles[y][x];
      if (!t.settlement) { t.river = true; t.feature = FEAT.NONE; }
      // wander
      x += rng.int(-1, 1);
    }
  }
}

function findSpawn(tiles, width, height, side, rng) {
  // Side A: spawn in left quarter. Side B: right quarter.
  const xMin = side === 'A' ? Math.floor(width * 0.10) : Math.floor(width * 0.75);
  const xMax = side === 'A' ? Math.floor(width * 0.25) : Math.floor(width * 0.90);
  const yMin = Math.floor(height * 0.30);
  const yMax = Math.floor(height * 0.70);

  for (let attempts = 0; attempts < 60; attempts++) {
    const x = rng.int(xMin, xMax);
    const y = rng.int(yMin, yMax);
    const t = tiles[y][x];
    if (t.type === TILE.TERRAIN && t.biome === side && !t.river) {
      return { x, y };
    }
  }
  return { x: Math.floor((xMin + xMax) / 2), y: Math.floor((yMin + yMax) / 2) };
}

// Lazily build (once) and then maintain the civ's owned-tile list so we
// never re-scan the whole map on every tick. Crucial for long simulations.
function ensureOwnedCache(map, civ) {
  if (civ._ownedTiles) return civ._ownedTiles;
  const list = [];
  const tiles = map.tiles;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tiles[y][x].owner === civ.side) list.push({ x, y });
    }
  }
  civ._ownedTiles = list;
  return list;
}

function ensureSettlementCache(map, civ) {
  if (civ._settlements) return civ._settlements;
  const list = [];
  const tiles = map.tiles;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const s = tiles[y][x].settlement;
      if (s && s.owner === civ.side) list.push({ x, y, s });
    }
  }
  civ._settlements = list;
  return list;
}

// Expand a civilization's owned tiles outward from its current territory.
function expandTerritory(map, civ, growthAmount, rng) {
  const tiles = map.tiles;
  const newOwned = [];

  // Cap growth so we don't blow up the loop
  growthAmount = Math.min(growthAmount, 40);

  const ownedTiles = ensureOwnedCache(map, civ);
  if (ownedTiles.length === 0) return [];

  for (let attempt = 0; attempt < growthAmount * 6; attempt++) {
    const src = rng.pick(ownedTiles);
    const nx = src.x + rng.int(-1, 1);
    const ny = src.y + rng.int(-1, 1);
    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
    const t = tiles[ny][nx];
    if (t.owner !== null) continue;
    if (t.type === TILE.WATER) continue;
    t.owner = civ.side;
    const tile = { x: nx, y: ny };
    newOwned.push(tile);
    ownedTiles.push(tile); // newly owned can spread next attempt / next call
    if (newOwned.length >= growthAmount) break;
  }
  return newOwned;
}

// Add or upgrade settlements based on population & territory.
function updateSettlements(map, civ, rng) {
  const tiles = map.tiles;
  const ownedTiles = ensureOwnedCache(map, civ);
  const settlements = ensureSettlementCache(map, civ);

  const targetSettlements = Math.min(60, Math.max(1, Math.floor(civ.population / 800)));
  const needed = targetSettlements - settlements.length;

  // Add new settlements, spaced away from existing ones
  for (let i = 0; i < needed && i < 3; i++) {
    let best = null;
    let bestDist = -1;
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = rng.pick(ownedTiles);
      if (!candidate) continue;
      const t = tiles[candidate.y][candidate.x];
      if (t.settlement || t.type === TILE.WATER) continue;
      let minDist = Infinity;
      for (const s of settlements) {
        const d = Math.abs(s.x - candidate.x) + Math.abs(s.y - candidate.y);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestDist) { bestDist = minDist; best = candidate; }
    }
    if (best && bestDist > 3) {
      const s = { tier: 0, pop: 50, owner: civ.side, isCapital: false };
      tiles[best.y][best.x].settlement = s;
      settlements.push({ x: best.x, y: best.y, s });
    }
  }

  // Upgrade settlements based on civ population & tech age
  const techAge = civ.techAge;
  for (const entry of settlements) {
    const settlement = entry.s;
    const popPerTier = settlement.isCapital ? [200, 800, 2500, 6000, 14000] : [400, 1500, 4000, 9000, 20000];
    let newTier = 0;
    for (let i = 0; i < popPerTier.length; i++) {
      if (civ.population >= popPerTier[i]) newTier = i;
    }
    newTier = Math.min(newTier, techAge);
    if (newTier > settlement.tier) settlement.tier = newTier;
    settlement.pop = Math.floor(civ.population / settlements.length);
  }

  return settlements;
}
