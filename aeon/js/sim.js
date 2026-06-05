// ============================================================
// AEON :: SIMULATION ENGINE
// Yearly tick. Population, resources, tech, events, disasters.
// All deterministic given the RNG.
// ============================================================

function createCiv(config, side, world, rng) {
  const race = RACES[config.race];
  const focus = FOCUSES[config.focus];
  const government = GOVERNMENTS[config.government];
  const biome = BIOMES[config.biome];

  const startKnowledge = world.startingTech === 'bronze' ? 110 : world.startingTech === 'iron' ? 290 : 0;
  const startAge = world.startingTech === 'bronze' ? 1 : world.startingTech === 'iron' ? 2 : 0;

  return {
    side,
    name: config.name,
    color: config.color,
    race: config.race,
    focus: config.focus,
    government: config.government,
    weapon: config.weapon,
    biome: config.biome,
    raceData: race,
    focusData: focus,
    govData: government,
    biomeData: biome,

    // Resources
    population: 50,
    food: 200,
    metal: 50,
    wood: 100,
    gold: 100,
    knowledge: startKnowledge,
    faith: 50,
    magic: 0,

    // Military
    army: 5,
    weaponTechLevel: 1.0,
    fortification: 1.0,

    // State
    techAge: startAge,
    morale: 100,
    stability: 100,
    weaponUnlocked: false,

    // Counters
    territory: 1,
    settlements: 1,
    yearsSinceContact: 0,
    inContact: false,

    // Effects from events (temporary multipliers)
    tempMods: {},
    activeEvents: [],

    rng: rng.fork(side === 'A' ? 0xAAA : 0xBBB),
  };
}

// Compute biome-race fit (penalty if mismatched)
function biomeFitness(civ) {
  const race = civ.raceData;
  if (race.biomePenalty && race.biomePenalty[civ.biome] !== undefined) {
    return race.biomePenalty[civ.biome];
  }
  if (race.biomePref && race.biomePref.includes(civ.biome)) {
    return 1.10;
  }
  return 1.0;
}

// Apply all stacking modifiers for a stat
function getMod(civ, key) {
  let m = 1.0;
  if (civ.raceData.mods && civ.raceData.mods[key] !== undefined) m *= civ.raceData.mods[key];
  if (civ.focusData.mods && civ.focusData.mods[key] !== undefined) m *= civ.focusData.mods[key];
  if (civ.govData.mods && civ.govData.mods[key] !== undefined) m *= civ.govData.mods[key];
  if (civ.biomeData.mods && civ.biomeData.mods[key] !== undefined) m *= civ.biomeData.mods[key];
  if (civ.tempMods[key] !== undefined) m *= civ.tempMods[key];
  return m;
}

// ============================================================
// YEARLY TICK
// ============================================================
function tickYear(civ, year, world, map, otherCiv, log) {
  const fitness = biomeFitness(civ);

  // --- POPULATION ---
  let growthRate = 0.025 * getMod(civ, 'growth') * fitness;

  // Food-limited
  const foodPerCapita = civ.food / Math.max(1, civ.population);
  if (foodPerCapita < 0.5) growthRate *= 0.3;
  else if (foodPerCapita < 1.0) growthRate *= 0.7;

  // Stability/morale impact
  if (civ.stability < 30) growthRate *= 0.4;
  else if (civ.stability < 60) growthRate *= 0.8;

  // Constructs: no biological growth, must be built from metal+knowledge
  if (civ.raceData.special === 'constructed') {
    const buildable = Math.min(civ.metal / 20, civ.knowledge / 50);
    growthRate = 0;
    const built = Math.floor(buildable * 0.05);
    if (built > 0) {
      civ.population += built;
      civ.metal -= built * 20;
    }
  } else {
    const popCap = (5000 + civ.territory * 800) * (civ.raceData.popCapMod || 1.0);
    let newPop;
    if (civ.population < popCap) {
      newPop = civ.population * (1 + growthRate);
    } else {
      newPop = civ.population * (1 + growthRate * 0.1);
    }
    // Use rounding + accumulator so low populations can grow.
    civ._popFrac = (civ._popFrac || 0) + (newPop - Math.floor(newPop));
    civ.population = Math.floor(newPop) + Math.floor(civ._popFrac);
    civ._popFrac -= Math.floor(civ._popFrac);
  }

  // --- RESOURCES ---
  // Food: linear+sqrt mix so small populations have a healthy surplus
  // and the per-capita food drops gradually as population grows.
  const popFactor = Math.sqrt(civ.population);
  const linearPop = civ.population;
  const foodProduction = (popFactor * 3 + linearPop * 0.55) * getMod(civ,'food') * fitness;
  const foodConsumption = civ.population * 0.5;
  // Cap food storage at ~3 years of consumption (granaries spoil, surplus rots)
  const foodCap = Math.max(1000, civ.population * 1.5);
  civ.food = Math.min(foodCap, Math.max(0, civ.food + foodProduction - foodConsumption));

  civ.metal  = civ.metal + popFactor * 1.5 * getMod(civ,'metal') * fitness;
  civ.wood   = civ.wood + popFactor * 2.0 * getMod(civ,'wood') * fitness;
  civ.gold   = civ.gold + popFactor * 1.2 * getMod(civ,'gold') * getMod(civ,'economy');

  // --- KNOWLEDGE / TECH ---
  const researchGain = popFactor * 0.25 * getMod(civ, 'research');
  civ.knowledge += researchGain;

  // Advance age?
  while (civ.techAge < TECH_AGES.length - 1 && civ.knowledge >= TECH_AGES[civ.techAge + 1].knowledgeRequired) {
    civ.techAge++;
    civ.weaponTechLevel = TECH_AGES[civ.techAge].armyTechMult;
    log(civ.side, year, `Entered the ${TECH_AGES[civ.techAge].name} Age.`, 'tech');
  }

  // --- FAITH & MAGIC ---
  civ.faith += popFactor * 0.10 * getMod(civ, 'faithGen');
  if (civ.focus === 'magic' || civ.raceData.mods.magic) {
    civ.magic += popFactor * 0.08 * getMod(civ, 'magicGen');
  }

  // --- MILITARY ---
  const armyTarget = Math.floor(civ.population * 0.08 * getMod(civ, 'armyGrowth'));
  if (civ.army < armyTarget) {
    civ.army = Math.floor(civ.army + (armyTarget - civ.army) * 0.15);
  }
  // Cost upkeep
  civ.gold = Math.max(0, civ.gold - civ.army * 0.05);
  civ.food = Math.max(0, civ.food - civ.army * 0.1);

  // --- MORALE & STABILITY (regression toward mean) ---
  civ.morale = clamp(civ.morale + (100 * getMod(civ,'morale') - civ.morale) * 0.05, 0, 200);
  civ.stability = clamp(civ.stability + (100 * getMod(civ,'stability') - civ.stability) * 0.05, 0, 200);

  // --- WEAPON UNLOCK ---
  if (!civ.weaponUnlocked && civ.weapon) {
    const w = WEAPONS[civ.weapon];
    if (w && civ.techAge >= w.unlockAge) {
      civ.weaponUnlocked = true;
      log(civ.side, year, `Mastered ${w.name}.`, 'major');
    }
  }

  // --- EVENTS ---
  const eventChance = 0.06 * (civ.govData.mods.eventVariance || 1.0);
  if (civ.rng.chance(eventChance)) {
    applyRandomEvent(civ, year, world, log);
  }

  // --- DISASTERS ---
  const disasterChance = world.disasterChance;
  if (disasterChance > 0 && civ.rng.chance(disasterChance)) {
    applyDisaster(civ, year, log);
  }

  // --- TEMP MOD DECAY ---
  for (const k in civ.tempMods) {
    civ.tempMods[k] += (1.0 - civ.tempMods[k]) * 0.10;
    if (Math.abs(civ.tempMods[k] - 1.0) < 0.01) delete civ.tempMods[k];
  }

  // --- TERRITORIAL EXPANSION ---
  if (year % 3 === 0) {
    const expansionRate = Math.max(1, Math.floor(civ.population / 500));
    const newTiles = expandTerritory(map, civ, expansionRate, civ.rng);
    civ.territory += newTiles.length;

    // Check for contact
    if (!civ.inContact && world.interaction !== 'isolated' && otherCiv) {
      if (territoriesAdjacent(map, civ, otherCiv)) {
        civ.inContact = true;
        otherCiv.inContact = true;
        log(civ.side, year, `First contact with ${otherCiv.name}.`, 'major');
      }
    }
    if (!civ.inContact && world.interaction === 'isolated' && year >= 700 && otherCiv && !otherCiv.inContact) {
      // Force contact at year 700
      civ.inContact = true;
      otherCiv.inContact = true;
      log(civ.side, year, `Scouts report a foreign civilization.`, 'major');
    }
  }

  if (year % 10 === 0) {
    updateSettlements(map, civ, civ.rng);
  }

  // --- BORDER SKIRMISHES ---
  if (civ.inContact && world.interaction !== 'isolated' && otherCiv && civ.rng.chance(0.015)) {
    const losses = Math.floor(civ.army * civ.rng.range(0.01, 0.05));
    civ.army = Math.max(0, civ.army - losses);
    if (civ.rng.chance(0.3)) {
      log(civ.side, year, `Border skirmish: lost ${losses} soldiers.`, 'war');
    }
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function applyRandomEvent(civ, year, world, log) {
  const candidates = [];
  for (const [key, ev] of Object.entries(EVENTS)) {
    if (ev.biome && ev.biome !== civ.biome) continue;
    if (ev.biome) continue; // biome events handled by disaster
    candidates.push({ key, ev, weight: ev.weight });
  }
  if (candidates.length === 0) return;
  const picked = civ.rng.pickWeighted(candidates);
  const ev = picked.ev;
  applyEventEffect(civ, ev, year);
  log(civ.side, year, `${ev.name}: ${ev.desc}`, ev.tag || 'cultural');
}

function applyDisaster(civ, year, log) {
  // Biome-specific disasters
  const biomeDisasters = { volcanic: 'eruption', tundra: 'blizzard', desert: 'drought', swamp: 'flood' };
  const key = biomeDisasters[civ.biome] || 'plague';
  const ev = EVENTS[key];
  if (!ev) return;
  applyEventEffect(civ, ev, year);
  log(civ.side, year, `${ev.name}: ${ev.desc}`, 'disaster');
}

function applyEventEffect(civ, ev, year) {
  const e = ev.effect || {};
  if (e.populationPct) civ.population = Math.max(10, Math.floor(civ.population * (1 + e.populationPct)));
  if (e.armyPct) civ.army = Math.max(0, Math.floor(civ.army * (1 + e.armyPct)));
  if (e.morale) civ.morale = clamp(civ.morale + e.morale, 0, 200);
  if (e.stability) civ.stability = clamp(civ.stability + e.stability, 0, 200);

  // Multipliers persist as tempMods
  if (e.knowledge) civ.tempMods.research = (civ.tempMods.research || 1) * e.knowledge;
  if (e.faith)     civ.tempMods.faithGen = (civ.tempMods.faithGen || 1) * Math.abs(e.faith);
  if (e.gold)      civ.tempMods.gold     = (civ.tempMods.gold || 1) * e.gold;
  if (e.food && e.food < 0) civ.food *= (1 + e.food);
  if (e.armyGrowth) civ.tempMods.armyGrowth = (civ.tempMods.armyGrowth || 1) * e.armyGrowth;

  // Settlement damage simulated as population loss already applied
}

function territoriesAdjacent(map, civA, civB) {
  // Quick check: any A-owned tile adjacent to a B-owned tile?
  const tiles = map.tiles;
  for (let y = 0; y < map.height; y += 2) {
    for (let x = 0; x < map.width; x += 2) {
      if (tiles[y][x].owner !== civA.side) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
          if (tiles[ny][nx].owner === civB.side) return true;
        }
      }
    }
  }
  return false;
}
