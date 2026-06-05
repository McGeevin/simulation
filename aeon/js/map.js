// ============================================================
// AEON :: MAP GENERATION
// Tile-based map. Left half = Side A biome, right half = Side B,
// with a contested middle strip that blends both.
// ============================================================

const MAP_SIZES = {
  small:  { w: 60, h: 40 },
  medium: { w: 90, h: 60 },
  large:  { w: 120, h: 80 },
};

const TILE = {
  TERRAIN: 0,
  WATER: 1,
  HILL: 2,
  RESOURCE: 3,
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
        settlement: null,   // {tier: 0-4, pop: n} or null
        feature: 0,         // visual decoration index
      };
    }
  }

  const midZoneStart = Math.floor(width * 0.42);
  const midZoneEnd   = Math.floor(width * 0.58);

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
        // contested middle: alternate / mix
        t.biome = 'neutral';
        t.biomeKey = rng.chance(0.5) ? biomeA : biomeB;
      }
    }
  }

  // Pass 2: features (hills, water bodies, resource tiles)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      const biome = BIOMES[t.biomeKey];
      const r = rng.next();

      // Coastal biomes get more water
      if (t.biomeKey === 'coastal' && r < 0.20) {
        t.type = TILE.WATER;
      } else if (t.biomeKey === 'mountain' && r < 0.35) {
        t.type = TILE.HILL;
      } else if (t.biomeKey === 'volcanic' && r < 0.18) {
        t.type = TILE.HILL;
      } else if (t.biomeKey === 'forest' && r < 0.30) {
        t.feature = 1; // trees
      } else if (t.biomeKey === 'desert' && r < 0.05) {
        t.feature = 2; // dunes
      } else if (t.biomeKey === 'tundra' && r < 0.12) {
        t.feature = 3; // ice
      } else if (t.biomeKey === 'swamp' && r < 0.20) {
        t.type = TILE.WATER;
      } else if (t.biomeKey === 'plains' && r < 0.08) {
        t.feature = 4; // grass tufts
      }

      // Small chance of resource node
      if (r > 0.97 && t.type === TILE.TERRAIN) {
        t.type = TILE.RESOURCE;
      }

      t.elevation = rng.range(0, 1);
    }
  }

  // Capital spawn points — find a good land tile in each half
  const capitalA = findSpawn(tiles, width, height, 'A', rng);
  const capitalB = findSpawn(tiles, width, height, 'B', rng);

  if (capitalA) {
    tiles[capitalA.y][capitalA.x].settlement = { tier: 1, pop: 5, owner: 'A', isCapital: true };
    tiles[capitalA.y][capitalA.x].owner = 'A';
  }
  if (capitalB) {
    tiles[capitalB.y][capitalB.x].settlement = { tier: 1, pop: 5, owner: 'B', isCapital: true };
    tiles[capitalB.y][capitalB.x].owner = 'B';
  }

  return {
    width, height, tiles,
    capitalA, capitalB,
    biomeA, biomeB,
    borderWave,
  };
}

function findSpawn(tiles, width, height, side, rng) {
  // Side A: spawn in left quarter. Side B: right quarter.
  const xMin = side === 'A' ? Math.floor(width * 0.10) : Math.floor(width * 0.75);
  const xMax = side === 'A' ? Math.floor(width * 0.25) : Math.floor(width * 0.90);
  const yMin = Math.floor(height * 0.30);
  const yMax = Math.floor(height * 0.70);

  for (let attempts = 0; attempts < 50; attempts++) {
    const x = rng.int(xMin, xMax);
    const y = rng.int(yMin, yMax);
    const t = tiles[y][x];
    if (t.type === TILE.TERRAIN && t.biome === side) {
      return { x, y };
    }
  }
  // Fallback
  return { x: Math.floor((xMin+xMax)/2), y: Math.floor((yMin+yMax)/2) };
}

// Expand a civilization's owned tiles outward from settlements
function expandTerritory(map, civ, growthAmount, rng) {
  const tiles = map.tiles;
  const newOwned = [];

  // Cap growth so we don't blow up the loop
  growthAmount = Math.min(growthAmount, 40);

  // Build the owned-tile list ONCE (don't rebuild every iteration)
  const ownedTiles = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tiles[y][x].owner === civ.side) ownedTiles.push({x,y});
    }
  }
  if (ownedTiles.length === 0) return [];

  for (let attempt = 0; attempt < growthAmount * 6; attempt++) {
    const src = rng.pick(ownedTiles);
    const dx = rng.int(-1, 1);
    const dy = rng.int(-1, 1);
    const nx = src.x + dx;
    const ny = src.y + dy;
    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
    const t = tiles[ny][nx];
    if (t.owner !== null) continue;
    if (t.type === TILE.WATER) continue;
    t.owner = civ.side;
    newOwned.push({x:nx, y:ny});
    ownedTiles.push({x:nx, y:ny}); // newly owned can spread next
    if (newOwned.length >= growthAmount) break;
  }
  return newOwned;
}

// Add or upgrade settlements based on population & territory
function updateSettlements(map, civ, rng) {
  const tiles = map.tiles;
  const ownedTiles = [];
  let settlements = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tiles[y][x].owner === civ.side) ownedTiles.push({x,y});
      if (tiles[y][x].settlement && tiles[y][x].settlement.owner === civ.side) {
        settlements.push({x,y,s:tiles[y][x].settlement});
      }
    }
  }

  const targetSettlements = Math.min(60, Math.max(1, Math.floor(civ.population / 800)));
  const needed = targetSettlements - settlements.length;

  // Add new settlements
  for (let i = 0; i < needed && i < 3; i++) {
    // Pick a tile far from existing settlements
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
      if (minDist > bestDist) {
        bestDist = minDist;
        best = candidate;
      }
    }
    if (best && bestDist > 3) {
      tiles[best.y][best.x].settlement = { tier: 0, pop: 50, owner: civ.side, isCapital: false };
      settlements.push({x:best.x, y:best.y, s:tiles[best.y][best.x].settlement});
    }
  }

  // Upgrade settlements based on civ population & tech
  const techAge = civ.techAge;
  for (const s of settlements) {
    const settlement = s.s;
    // Capital scales faster
    const popPerTier = settlement.isCapital ? [200, 800, 2500, 6000, 14000] : [400, 1500, 4000, 9000, 20000];
    let newTier = 0;
    for (let i = 0; i < popPerTier.length; i++) {
      if (civ.population >= popPerTier[i]) newTier = i;
    }
    // Cap by tech age
    newTier = Math.min(newTier, techAge);
    if (newTier > settlement.tier) settlement.tier = newTier;
    settlement.pop = Math.floor(civ.population / settlements.length);
  }

  return settlements;
}
