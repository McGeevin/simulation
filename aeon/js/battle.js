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

// ============================================================
// BATTLE VISUALIZATION
// Spawns unit sprites that march toward the contested middle,
// then animates a clash that reflects the resolved outcome.
// ============================================================
class BattleVisualizer {
  constructor(renderer, map, civA, civB, outcome) {
    this.renderer = renderer;
    this.map = map;
    this.civA = civA;
    this.civB = civB;
    this.outcome = outcome;
    this.units = [];
    this.phase = 'spawn';     // spawn -> march -> clash -> resolve -> done
    this.phaseTime = 0;
    this.maxUnitsPerSide = 220;
    this.frames = 0;
    this.battleLog = [];
    this.specialFired = { A: false, B: false };
  }

  start() {
    const spawnA = this.map.capitalA;
    const spawnB = this.map.capitalB;

    const aCount = Math.min(this.maxUnitsPerSide, Math.max(20, Math.floor(this.civA.army / 100)));
    const bCount = Math.min(this.maxUnitsPerSide, Math.max(20, Math.floor(this.civB.army / 100)));

    for (let i = 0; i < aCount; i++) this.units.push(this.createUnit('A', spawnA));
    for (let i = 0; i < bCount; i++) this.units.push(this.createUnit('B', spawnB));

    this.renderer.battleUnits = this.units;
    this.phase = 'march';
    this.battleLog.push({ year: this.map.endYear || 1000, text: `${this.civA.name} fields ${formatNum(this.civA.army)} soldiers.` });
    this.battleLog.push({ year: this.map.endYear || 1000, text: `${this.civB.name} fields ${formatNum(this.civB.army)} soldiers.` });
    this.battleLog.push({ year: this.map.endYear || 1000, text: `${this.outcome.invader.name} marches to attack.` });
  }

  createUnit(side, near) {
    const civ = side === 'A' ? this.civA : this.civB;
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

    if (this.phaseTime === 30 && this.civA.weaponUnlocked && !this.specialFired.A) {
      this.fireSpecial(this.civA); this.specialFired.A = true;
    }
    if (this.phaseTime === 45 && this.civB.weaponUnlocked && !this.specialFired.B) {
      this.fireSpecial(this.civB); this.specialFired.B = true;
    }

    let movingCount = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      const targetX = midX + (u.side === 'A' ? 1 : -1) * (-2);
      const targetY = midY + (Math.sin((u.x + u.y) * 0.3) * 6);
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

  stepClash() {
    const outcome = this.outcome;
    const winnerSide = outcome.winner.side;
    const loserSide = outcome.loser.side;

    const alive = this.units.filter(u => !u.dead);
    const aliveA = alive.filter(u => u.side === 'A');
    const aliveB = alive.filter(u => u.side === 'B');

    const winnerLossRate = 0.005 + outcome.winnerCasualtyPct * 0.0002;
    const loserLossRate  = 0.012 + outcome.loserCasualtyPct  * 0.0003;

    const winnerAlive = winnerSide === 'A' ? aliveA : aliveB;
    const loserAlive  = loserSide  === 'A' ? aliveA : aliveB;

    const winnerKills = Math.ceil(winnerAlive.length * winnerLossRate);
    const loserKills  = Math.ceil(loserAlive.length  * loserLossRate);

    for (let i = 0; i < winnerKills; i++) {
      const u = winnerAlive[Math.floor(Math.random() * winnerAlive.length)];
      if (u && !u.dead) { u.dead = true; this.renderer.addParticle(u.x, u.y, '#c23b22', 25); }
    }
    for (let i = 0; i < loserKills; i++) {
      const u = loserAlive[Math.floor(Math.random() * loserAlive.length)];
      if (u && !u.dead) { u.dead = true; this.renderer.addParticle(u.x, u.y, '#c23b22', 25); }
    }

    for (const u of this.units) {
      if (u.dead) continue;
      u.x += (Math.random() - 0.5) * 0.15;
      u.y += (Math.random() - 0.5) * 0.15;
    }

    const loserCountInitial = (loserSide === 'A' ? this.units.filter(u => u.side === 'A').length : this.units.filter(u => u.side === 'B').length);
    if (loserAlive.length < loserCountInitial * 0.15 || this.phaseTime > 240) {
      this.phase = 'resolve';
      this.phaseTime = 0;
      this.battleLog.push({ year: this.map.endYear || 1000, text: `${outcome.winner.name} routs the enemy!` });
    }
  }

  stepResolve() {
    const outcome = this.outcome;
    const loserSide = outcome.loser.side;

    for (const u of this.units) {
      if (u.dead) continue;
      if (u.side === loserSide && Math.random() < 0.05) {
        u.dead = true;
        this.renderer.addParticle(u.x, u.y, '#c23b22', 20);
      }
    }

    const winnerSide = outcome.winner.side;
    for (const u of this.units) {
      if (u.dead || u.side !== winnerSide) continue;
      const dirX = winnerSide === 'A' ? 1 : -1;
      u.x += dirX * 0.25;
      u.y += (Math.random() - 0.5) * 0.1;
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

    const enemySide = civ.side === 'A' ? 'B' : 'A';
    const enemies = this.units.filter(u => u.side === enemySide && !u.dead);
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
