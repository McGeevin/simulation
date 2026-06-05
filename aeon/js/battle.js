// ============================================================
// AEON :: BATTLE SYSTEM
// Stat-based resolution + real-time visualization that plays
// out the predetermined outcome. The power breakdown produced
// here is reused verbatim by the aftermath screen so the result
// is fully explainable.
// ============================================================

// Single source of truth for a weapon's battlefield multiplier.
// Takes a weapon definition (not a civ) so the setup UI can estimate
// it before anything is unlocked.
function weaponPowerFactor(w) {
  if (!w || !w.battleMod) return 1.0;
  const bm = w.battleMod;
  let m = 1.0;
  if (bm.ranged)      m *= bm.ranged;
  if (bm.shock)       m *= bm.shock;
  if (bm.attack)      m *= bm.attack;
  if (bm.elite)       m *= bm.elite;
  if (bm.antiDefense) m *= bm.antiDefense * 0.6;
  if (bm.preBattle)   m *= (1 + (1 - bm.preBattle));
  if (bm.raise)       m *= 1.3;
  return Math.max(1.2, m * 0.6 + 0.4); // dampened
}

// Produce the full, ordered list of factors that build a civ's
// battle power. Returns { base, baseDetail, factors:[{label,mult,detail}], final }.
function battlePowerBreakdown(civ, defender = false) {
  const factors = [];
  const ageMult = civ.weaponTechLevel;
  let power = civ.army * ageMult;
  const base = power;
  const baseDetail = `${formatNum(civ.army)} troops × ${ageMult.toFixed(1)} (${TECH_AGES[civ.techAge].name}-age arms)`;

  const add = (label, mult, detail) => {
    if (mult === 1 || !isFinite(mult)) return;
    power *= mult;
    factors.push({ label, mult, detail });
  };

  // Focus
  if (civ.focus === 'military') add('Military doctrine', 1.30, 'Standing army & drilled ranks');
  if (civ.focus === 'magic')   add('Battle-magic', 1 + Math.min(0.5, civ.magic / 500), `Magic reserve ${formatNum(civ.magic)}`);
  if (civ.focus === 'faith')   add('Holy fervor', 1 + civ.morale / 300, `Morale ${Math.round(civ.morale)}`);

  // Government synergy
  if (civ.government === 'theocracy' && civ.focus === 'faith') add('Theocratic zeal', 1.15, 'Theocracy + Faith synergy');

  // Morale & stability (always present)
  add('Morale', 0.5 + civ.morale / 200, `Morale ${Math.round(civ.morale)} / 100`);
  add('Stability', 0.7 + civ.stability / 333, `Stability ${Math.round(civ.stability)} / 100`);

  // Defender advantages
  if (defender) {
    add('Home defense', 1.2, 'Fighting on home soil');
    if (civ.biome === 'mountain') add('Mountain fastness', 1.25, 'Mountain terrain');
    if (civ.biome === 'tundra' || civ.biome === 'swamp') add('Harsh terrain', 1.15, `${BIOMES[civ.biome].name} terrain`);
    const def = getMod(civ, 'defense');
    add('Fortification', def, 'Race / focus / biome defense');
  }

  // Special weapon
  if (civ.weaponUnlocked && civ.weapon) {
    const w = WEAPONS[civ.weapon];
    add(w.name, weaponPowerFactor(w), 'Special weapon mastered');
  }

  return { base, baseDetail, factors, final: power };
}

function computeBattlePower(civ, defender = false) {
  return Math.floor(battlePowerBreakdown(civ, defender).final);
}

// Why is one side the invader? Exposed so the UI can explain it.
function aggressionFor(civ) {
  const aggressionScore = {
    military: 3, magic: 1, faith: 2, industry: 1, exploration: 1,
    naturalism: -1, trade: -2, diplomacy: -3, science: 0,
  };
  let s = aggressionScore[civ.focus] || 0;
  if (civ.government === 'tribal') s += 2;
  if (civ.government === 'empire' || civ.government === 'autocracy') s += 2;
  return s;
}

// Resolve the final battle. Returns full, explainable outcome.
function resolveBattle(civA, civB, world, rng) {
  const aAgg = aggressionFor(civA);
  const bAgg = aggressionFor(civB);

  let invader, defender;
  if (aAgg > bAgg) { invader = civA; defender = civB; }
  else if (bAgg > aAgg) { invader = civB; defender = civA; }
  else { invader = rng.chance(0.5) ? civA : civB; defender = (invader === civA) ? civB : civA; }

  const invBreakdown = battlePowerBreakdown(invader, false);
  const defBreakdown = battlePowerBreakdown(defender, true);
  const invPower = Math.floor(invBreakdown.final);
  const defPower = Math.floor(defBreakdown.final);

  // RNG band ±10% — the fog of war.
  const invLuck = rng.range(0.90, 1.10);
  const defLuck = rng.range(0.90, 1.10);
  const invRoll = invPower * invLuck;
  const defRoll = defPower * defLuck;

  const winner = invRoll > defRoll ? invader : defender;
  const loser  = (winner === civA) ? civB : civA;

  // Casualties scale with how close the fight was.
  const ratio = Math.min(invRoll, defRoll) / Math.max(invRoll, defRoll);
  const winnerCasualtyPct = 0.20 + ratio * 0.40;
  const loserCasualtyPct  = 0.60 + (1 - ratio) * 0.35;

  return {
    invader, defender, winner, loser,
    invPower, defPower, invRoll, defRoll,
    invLuck, defLuck,
    invBreakdown, defBreakdown,
    winnerCasualtyPct, loserCasualtyPct,
    ratio,
    aAgg, bAgg,
  };
}

// Resolve a three-way free-for-all. All three powers converge in a grand
// melee; the highest roll conquers the world. Fully explainable: every
// combatant carries its own power breakdown and luck roll.
function resolveBattle3(civA, civB, civC, world, rng) {
  const civs = [civA, civB, civC];
  const entries = civs.map(civ => {
    // Everyone defends their own realm on three fronts, so all get the
    // defender treatment — terrain & fortification still differentiate them.
    const breakdown = battlePowerBreakdown(civ, true);
    const power = Math.floor(breakdown.final);
    const luck = rng.range(0.90, 1.10);
    return { civ, breakdown, power, luck, roll: power * luck, agg: aggressionFor(civ) };
  });

  // Rank by roll, highest wins.
  entries.sort((a, b) => b.roll - a.roll);
  const [first, second, third] = entries;
  for (let i = 0; i < entries.length; i++) entries[i].rank = i;

  // Casualties: the winner bleeds more the closer second place ran;
  // the also-rans lose progressively more.
  const closeWR = second.roll / Math.max(1, first.roll);
  first.casualtyPct  = clamp(0.20 + closeWR * 0.40, 0.20, 0.65);
  second.casualtyPct = clamp(0.62 + (1 - closeWR) * 0.25, 0.50, 0.95);
  third.casualtyPct  = clamp(0.80 + (1 - third.roll / Math.max(1, first.roll)) * 0.18, 0.60, 0.98);

  return {
    threeWay: true,
    entries,
    winner: first.civ,
    runnerUp: second.civ,
    third: third.civ,
    loser: second.civ,                      // nearest rival, for 2-way-shaped consumers
    winnerCasualtyPct: first.casualtyPct,
    loserCasualtyPct: second.casualtyPct,
  };
}

// ============================================================
// BATTLE VISUALIZATION
// Spawns unit sprites that march toward the contested middle,
// then animates a clash that reflects the resolved outcome.
// Works for two or three sides.
// ============================================================
class BattleVisualizer {
  constructor(renderer, map, civs, outcome) {
    this.renderer = renderer;
    this.map = map;
    this.civs = civs.filter(Boolean);   // [civA, civB] or [civA, civB, civC]
    this.outcome = outcome;
    this.units = [];
    this.phase = 'spawn';     // spawn -> march -> clash -> resolve -> done
    this.phaseTime = 0;
    this.maxUnitsPerSide = 220;
    this.frames = 0;
    this.battleLog = [];
    this.specialFired = {};
  }

  capitalFor(side) {
    if (side === 'A') return this.map.capitalA;
    if (side === 'B') return this.map.capitalB;
    return this.map.capitalC;
  }

  start() {
    const endY = this.map.endYear || 1000;
    for (const civ of this.civs) {
      const spawn = this.capitalFor(civ.side) || { x: this.map.width / 2, y: this.map.height / 2 };
      const count = Math.min(this.maxUnitsPerSide, Math.max(20, Math.floor(civ.army / 100)));
      for (let i = 0; i < count; i++) this.units.push(this.createUnit(civ.side, spawn, civ));
      this.battleLog.push({ year: endY, text: `${civ.name} fields ${formatNum(civ.army)} soldiers.` });
    }

    this.renderer.battleUnits = this.units;
    this.phase = 'march';
    if (this.outcome.threeWay) {
      this.battleLog.push({ year: endY, text: `Three powers converge for the final war.` });
    } else {
      this.battleLog.push({ year: endY, text: `${this.outcome.invader.name} marches to attack.` });
    }
  }

  createUnit(side, near, civ) {
    return {
      side,
      x: near.x + (Math.random() - 0.5) * 8,
      y: near.y + (Math.random() - 0.5) * 8,
      color: civ.color,
      dead: false,
      elite: civ.weapon === 'champions' && Math.random() < 0.05,
      speed: 0.12 + Math.random() * 0.08,
    };
  }

  step() {
    this.frames++;
    this.phaseTime++;

    if (this.phase === 'march') this.stepMarch();
    else if (this.phase === 'clash') this.stepClash();
    else if (this.phase === 'resolve') this.stepResolve();

    this.renderer.updateParticles();
  }

  stepMarch() {
    const midX = this.map.width / 2;
    const midY = this.map.height / 2;

    // Fire each side's special weapon, staggered as the armies approach.
    let t = 30;
    for (const civ of this.civs) {
      if (this.phaseTime === t && civ.weaponUnlocked && !this.specialFired[civ.side]) {
        this.fireSpecial(civ); this.specialFired[civ.side] = true;
      }
      t += 15;
    }

    let movingCount = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      const targetX = midX + (Math.sin((u.x + u.y) * 0.3) * 4);
      const targetY = midY + (Math.sin((u.x - u.y) * 0.3) * 4);
      const dx = targetX - u.x;
      const dy = targetY - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) {
        u.x += (dx / d) * u.speed;
        u.y += (dy / d) * u.speed;
        movingCount++;
      }
    }

    if (this.phaseTime > 120 || movingCount < this.units.length * 0.3) {
      this.phase = 'clash';
      this.phaseTime = 0;
      this.battleLog.push({ year: this.map.endYear || 1000, text: 'The armies clash!' });
    }
  }

  // Per-side per-frame attrition rate, derived from the resolved outcome.
  lossRateForSide(side) {
    const o = this.outcome;
    if (o.threeWay) {
      const e = o.entries.find(en => en.civ.side === side);
      return [0.006, 0.013, 0.020][e ? e.rank : 1] || 0.013;
    }
    if (side === o.winner.side) return 0.005 + o.winnerCasualtyPct * 0.0002;
    return 0.012 + o.loserCasualtyPct * 0.0003;
  }

  stepClash() {
    const outcome = this.outcome;
    const winnerSide = outcome.winner.side;

    const alive = this.units.filter(u => !u.dead);
    const bySide = {};
    for (const u of alive) (bySide[u.side] || (bySide[u.side] = [])).push(u);

    for (const side in bySide) {
      const list = bySide[side];
      const kills = Math.ceil(list.length * this.lossRateForSide(side));
      for (let i = 0; i < kills; i++) {
        const u = list[Math.floor(Math.random() * list.length)];
        if (u && !u.dead) { u.dead = true; this.renderer.addParticle(u.x, u.y, '#c23b22', 25); }
      }
    }

    for (const u of this.units) {
      if (u.dead) continue;
      u.x += (Math.random() - 0.5) * 0.15;
      u.y += (Math.random() - 0.5) * 0.15;
    }

    const winnerAlive = (bySide[winnerSide] || []).length;
    const otherAlive = alive.length - winnerAlive;
    if (otherAlive < this.units.length * 0.12 || this.phaseTime > 260) {
      this.phase = 'resolve';
      this.phaseTime = 0;
      this.battleLog.push({ year: this.map.endYear || 1000, text: `${outcome.winner.name} ${outcome.threeWay ? 'stands triumphant' : 'routs the enemy'}!` });
    }
  }

  stepResolve() {
    const outcome = this.outcome;
    const winnerSide = outcome.winner.side;

    // Survivors of the defeated nations are cut down.
    for (const u of this.units) {
      if (u.dead || u.side === winnerSide) continue;
      if (Math.random() < 0.05) {
        u.dead = true;
        this.renderer.addParticle(u.x, u.y, '#c23b22', 20);
      }
    }

    // The victors fan out and recolor the land.
    for (const u of this.units) {
      if (u.dead || u.side !== winnerSide) continue;
      u.x += (Math.random() - 0.5) * 0.3 + 0.05;
      u.y += (Math.random() - 0.5) * 0.2;
      const tx = Math.floor(u.x);
      const ty = Math.floor(u.y);
      if (tx >= 0 && tx < this.map.width && ty >= 0 && ty < this.map.height) {
        this.map.tiles[ty][tx].owner = winnerSide;
      }
    }

    if (this.phaseTime > 200) {
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          this.map.tiles[y][x].owner = winnerSide;
        }
      }
      this.phase = 'done';
    }
  }

  fireSpecial(civ) {
    const w = WEAPONS[civ.weapon];
    if (!w) return;
    this.battleLog.push({ year: this.map.endYear || 1000, text: `${civ.name} unleashes ${w.name}!` });

    const enemies = this.units.filter(u => u.side !== civ.side && !u.dead);
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    if (target) {
      for (let i = 0; i < 50; i++) {
        this.renderer.addParticle(
          target.x + (Math.random() - 0.5) * 7,
          target.y + (Math.random() - 0.5) * 7,
          civ.color, 45
        );
      }
      const killCount = Math.floor(enemies.length * 0.08);
      for (let i = 0; i < killCount; i++) {
        const victim = enemies[Math.floor(Math.random() * enemies.length)];
        if (victim && !victim.dead) victim.dead = true;
      }
    }
  }

  isDone() { return this.phase === 'done'; }
}

function formatNum(n) {
  if (!isFinite(n)) return '∞';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}
