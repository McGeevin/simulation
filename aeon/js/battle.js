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

// Government command doctrine — each government fights differently. `atk`
// applies when attacking, `def` when defending, the mean in a three-way
// melee. Designed values (not in data.js) to give each a battle identity.
const GOV_DOCTRINE = {
  monarchy:    { atk: 1.05, def: 1.05, note: 'unified royal command' },
  republic:    { atk: 0.95, def: 1.10, note: 'deliberate, defensive institutions' },
  theocracy:   { atk: 1.08, def: 1.08, note: 'zealous, obedient ranks' },
  tribal:      { atk: 1.15, def: 0.95, note: 'ferocious raiders, weak at holding ground' },
  hive:        { atk: 1.06, def: 1.16, note: 'fearless and perfectly coordinated' },
  democracy:   { atk: 0.90, def: 1.12, note: 'reluctant to attack, stubborn in defense' },
  empire:      { atk: 1.18, def: 1.04, note: 'a state machine built for conquest' },
  autocracy:   { atk: 1.20, def: 0.98, note: 'vast conscript armies driven hard' },
  technocracy: { atk: 1.07, def: 1.09, note: 'superior command and control' },
  federation:  { atk: 0.95, def: 1.13, note: 'pooled reserves, very hard to topple' },
  horde:       { atk: 1.22, def: 0.90, note: 'all attack, no defense' },
};

// Numerical edge with a super-linear (Lanchester-style) kicker on top of
// the linear troop count already in the base — being able to flank and
// envelop. Clamped so it informs the result without dominating it.
function numbersFactor(myArmy, enemyArmy) {
  if (!enemyArmy || enemyArmy <= 0) return 1;
  return clamp(Math.pow(myArmy / enemyArmy, 0.35), 0.72, 1.45);
}

// Over-mobilization: an army that swallows too much of its own populace is
// a brittle mass of conscripts; a lean professional force fights better.
function mobilizationFactor(civ) {
  const mob = civ.army / Math.max(1, civ.population);
  if (mob <= 0.12) return 1.06;
  if (mob <= 0.25) return 1.00;
  if (mob <= 0.45) return 0.92;
  return 0.82;
}

// Produce the full, ordered list of factors that build a civ's battle
// power. Returns { base, baseDetail, factors:[{label,mult,detail}], final }.
// ctx carries the realism qualifiers that depend on the matchup:
//   { role:'invader'|'defender'|'ffa', enemyArmy, enemyBiome }
function battlePowerBreakdown(civ, defender = false, ctx = {}) {
  const role = ctx.role || (defender ? 'defender' : 'invader');
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

  // Racial martial tradition — soldier-for-soldier combat skill. (Previously
  // computed for the sim but never applied to the battle itself.)
  add('Martial prowess', getMod(civ, 'military'), `${civ.raceData.name} warrior tradition`);

  // Focus
  if (civ.focus === 'military') add('Military doctrine', 1.30, 'Standing army & drilled ranks');
  if (civ.focus === 'magic')   add('Battle-magic', 1 + Math.min(0.5, civ.magic / 500), `Magic reserve ${formatNum(civ.magic)}`);
  if (civ.focus === 'faith')   add('Holy fervor', 1 + civ.morale / 300, `Morale ${Math.round(civ.morale)}`);

  // Government war doctrine (offense vs defense lean)
  const doc = GOV_DOCTRINE[civ.government];
  if (doc) {
    const gm = role === 'invader' ? doc.atk : role === 'defender' ? doc.def : (doc.atk + doc.def) / 2;
    add('War doctrine', gm, `${civ.govData.name} — ${doc.note}`);
  }

  // Government synergy
  if (civ.government === 'theocracy' && civ.focus === 'faith') add('Theocratic zeal', 1.15, 'Theocracy + Faith synergy');

  // Morale & stability (always present)
  add('Morale', 0.5 + civ.morale / 200, `Morale ${Math.round(civ.morale)} / 100`);
  add('Stability', 0.7 + civ.stability / 333, `Stability ${Math.round(civ.stability)} / 100`);

  // Numerical balance vs the enemy (super-linear kicker)
  if (ctx.enemyArmy) {
    const nf = numbersFactor(civ.army, ctx.enemyArmy);
    add(nf >= 1 ? 'Numerical superiority' : 'Outnumbered', nf,
        `${formatNum(civ.army)} vs ~${formatNum(Math.round(ctx.enemyArmy))} enemy troops`);
  }

  // Mobilization sustainability
  const mob = mobilizationFactor(civ);
  add(mob >= 1 ? 'Professional army' : 'Over-mobilized', mob,
      `${(civ.army / Math.max(1, civ.population) * 100).toFixed(0)}% of the populace under arms`);

  // Defender advantages
  if (defender) {
    add('Home defense', 1.2, 'Fighting on home soil');
    if (civ.biome === 'mountain') add('Mountain fastness', 1.25, 'Mountain terrain');
    if (civ.biome === 'tundra' || civ.biome === 'swamp') add('Harsh terrain', 1.15, `${BIOMES[civ.biome].name} terrain`);
    add('Acclimatization', biomeFitness(civ), `${civ.raceData.name} suited to ${BIOMES[civ.biome].name}`);
    const def = getMod(civ, 'defense');
    add('Fortification', def, 'Race / focus / biome defense');
  }

  // Invader fighting in a climate hostile to their race
  if (role === 'invader' && ctx.enemyBiome) {
    const pen = civ.raceData.biomePenalty && civ.raceData.biomePenalty[ctx.enemyBiome];
    if (pen) add('Hostile climate', pen, `${civ.raceData.name} ill-suited to ${BIOMES[ctx.enemyBiome].name}`);
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

  const invBreakdown = battlePowerBreakdown(invader, false,
    { role: 'invader', enemyArmy: defender.army, enemyBiome: defender.biome });
  const defBreakdown = battlePowerBreakdown(defender, true,
    { role: 'defender', enemyArmy: invader.army });
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
    // Each faces the other two, so "the enemy" is their combined average.
    const others = civs.filter(c => c !== civ);
    const enemyArmy = others.reduce((s, c) => s + c.army, 0) / Math.max(1, others.length);
    const breakdown = battlePowerBreakdown(civ, true, { role: 'ffa', enemyArmy });
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
    // Unit type reflects the civ's focus / doctrine.
    const focusPools = {
      military:    ['infantry','infantry','infantry','cavalry'],
      science:     ['archer','archer','mage','infantry'],
      faith:       ['infantry','infantry','mage','mage'],
      magic:       ['mage','mage','mage','archer'],
      industry:    ['infantry','infantry','cavalry','infantry'],
      trade:       ['archer','infantry','infantry'],
      naturalism:  ['archer','cavalry','infantry'],
      exploration: ['cavalry','cavalry','archer','infantry'],
      diplomacy:   ['infantry','archer'],
    };
    const pool = focusPools[civ.focus] || ['infantry'];
    const type = pool[Math.floor(Math.random() * pool.length)];

    // Formation offset: units keep a loose relative position within their side's band.
    const formX = (Math.random() - 0.5) * 6;
    const formY = (Math.random() - 0.5) * 6;

    return {
      side, type, formX, formY,
      x: near.x + formX,
      y: near.y + formY,
      color: civ.color,
      dead: false,
      elite: civ.weaponUnlocked && Math.random() < 0.06,
      speed: 0.09 + Math.random() * 0.07,
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
    let t = 12;
    for (const civ of this.civs) {
      if (this.phaseTime === t && civ.weaponUnlocked && !this.specialFired[civ.side]) {
        this.fireSpecial(civ); this.specialFired[civ.side] = true;
      }
      t += 8;
    }

    // Dust clouds trailing behind advancing troops every few frames.
    if (this.phaseTime % 3 === 0) {
      for (const u of this.units) {
        if (!u.dead && Math.random() < 0.10) {
          this.renderer.addParticle(u.x, u.y + 0.3, 'rgba(155,138,110,0.35)', 16, 0.006);
        }
      }
    }

    // Formation converge: units target the center offset by a shrinking spread.
    const spread = Math.max(0.4, 2.8 - this.phaseTime / 55);
    let movingCount = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      const targetX = midX + u.formX * spread;
      const targetY = midY + u.formY * spread;
      const dx = targetX - u.x;
      const dy = targetY - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) {
        u.x += (dx / d) * u.speed;
        u.y += (dy / d) * u.speed;
        movingCount++;
      }
    }

    if (this.phaseTime > 55 || movingCount < this.units.length * 0.3) {
      this.phase = 'clash';
      this.phaseTime = 0;
      this.battleLog.push({ year: this.map.endYear || 1000, text: 'The armies clash!' });
    }
  }

  // Per-side per-frame attrition rate, derived from the resolved outcome.
  // Scaled up from the original pacing so the clash reads clearly in a
  // shortened battle sequence instead of grinding on for many seconds.
  lossRateForSide(side) {
    const o = this.outcome;
    if (o.threeWay) {
      const e = o.entries.find(en => en.civ.side === side);
      return [0.013, 0.029, 0.044][e ? e.rank : 1] || 0.029;
    }
    if (side === o.winner.side) return 0.011 + o.winnerCasualtyPct * 0.00044;
    return 0.026 + o.loserCasualtyPct * 0.00066;
  }

  stepClash() {
    const outcome = this.outcome;
    const winnerSide = outcome.winner.side;
    const midX = this.map.width / 2;
    const midY = this.map.height / 2;

    const alive = this.units.filter(u => !u.dead);
    const bySide = {};
    for (const u of alive) (bySide[u.side] || (bySide[u.side] = [])).push(u);

    // Apply casualties with multi-particle death burst.
    for (const side in bySide) {
      const list = bySide[side];
      const kills = Math.ceil(list.length * this.lossRateForSide(side));
      for (let i = 0; i < kills; i++) {
        const u = list[Math.floor(Math.random() * list.length)];
        if (u && !u.dead) {
          u.dead = true;
          const dc = side === winnerSide ? '#c04040' : '#e04040';
          for (let p = 0; p < 4; p++) {
            this.renderer.addParticle(
              u.x + (Math.random() - 0.5) * 1.2,
              u.y + (Math.random() - 0.5) * 1.2,
              dc, 16 + Math.floor(Math.random() * 14)
            );
          }
        }
      }
    }

    // Battle-line push: winner units press toward center, losers pushed back.
    const pushStr = outcome.threeWay ? 0.018 : 0.028;
    for (const u of this.units) {
      if (u.dead) continue;
      const dx = midX - u.x, dy = midY - u.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      if (u.side === winnerSide) {
        // advance
        u.x += (dx / d) * pushStr + (Math.random() - 0.5) * 0.16;
        u.y += (dy / d) * pushStr + (Math.random() - 0.5) * 0.16;
      } else {
        // retreat a little
        u.x -= (dx / d) * pushStr * 0.5 + (Math.random() - 0.5) * 0.18;
        u.y -= (dy / d) * pushStr * 0.5 + (Math.random() - 0.5) * 0.18;
      }
    }

    // Golden clash sparks at the battle front.
    if (this.phaseTime % 3 === 0) {
      for (let i = 0; i < 3; i++) {
        this.renderer.addParticle(
          midX + (Math.random() - 0.5) * 10,
          midY + (Math.random() - 0.5) * 10,
          Math.random() < 0.6 ? '#ffe14d' : '#ffffff',
          8 + Math.floor(Math.random() * 8)
        );
      }
    }

    const winnerAlive = (bySide[winnerSide] || []).length;
    const otherAlive = alive.length - winnerAlive;
    if (otherAlive < this.units.length * 0.12 || this.phaseTime > 110) {
      this.phase = 'resolve';
      this.phaseTime = 0;
      this.battleLog.push({ year: this.map.endYear || 1000, text: `${outcome.winner.name} ${outcome.threeWay ? 'stands triumphant' : 'routs the enemy'}!` });
      // Victory burst: golden + civ-colored particles
      const winCiv = this.civs.find(c => c.side === winnerSide);
      for (let i = 0; i < 60; i++) {
        this.renderer.addParticle(
          midX + (Math.random() - 0.5) * 14,
          midY + (Math.random() - 0.5) * 14,
          i < 30 ? (winCiv ? winCiv.color : '#4a90e2') : '#ffe14d',
          45 + Math.floor(Math.random() * 25)
        );
      }
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
      u.x += (Math.random() - 0.5) * 0.35 + 0.06;
      u.y += (Math.random() - 0.5) * 0.22;
      const tx = Math.floor(u.x);
      const ty = Math.floor(u.y);
      if (tx >= 0 && tx < this.map.width && ty >= 0 && ty < this.map.height) {
        this.map.tiles[ty][tx].owner = winnerSide;
      }
      // Occasional celebration sparkle as troops march outward
      if (Math.random() < 0.004) {
        this.renderer.addParticle(u.x, u.y - 0.4, '#ffe14d', 28, -0.025);
      }
    }

    if (this.phaseTime > 70) {
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
    if (enemies.length === 0) return;
    const target = enemies[Math.floor(Math.random() * enemies.length)];

    // Screen flash
    this.renderer.flashEffect = 0.65;

    // Four expanding rings of particles: white core → civ color → gold → red
    const ringColors = ['#ffffff', civ.color, '#ffe14d', '#c04040'];
    for (let wave = 0; wave < ringColors.length; wave++) {
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const dist = (wave + 1) * 2.6 * (0.65 + Math.random() * 0.7);
        this.renderer.addParticle(
          target.x + Math.cos(angle) * dist,
          target.y + Math.sin(angle) * dist,
          ringColors[wave],
          22 + wave * 10 + Math.floor(Math.random() * 10)
        );
      }
    }

    // Kill enemies near the blast
    const killCount = Math.floor(enemies.length * 0.16);
    for (let i = 0; i < killCount; i++) {
      const victim = enemies[Math.floor(Math.random() * enemies.length)];
      if (victim && !victim.dead) {
        victim.dead = true;
        this.renderer.addParticle(victim.x, victim.y, '#ff6644', 22);
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
