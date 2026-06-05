// ============================================================
// AEON :: MAIN ORCHESTRATOR
// Initialization, game loop, screen transitions.
// ============================================================

const Game = {
  config: null,
  rng: null,
  map: null,
  civA: null,
  civB: null,
  renderer: null,
  timeline: null,
  year: 0,
  maxYear: 1000,
  speed: 1,
  running: false,
  yearAccumulator: 0,
  lastFrameTime: 0,
  battle: null,
  battleOutcome: null,
  phase: 'setup',  // setup | sim | battle | done
};

function init() {
  populateSelects();

  document.getElementById('start-btn').addEventListener('click', startSim);
  document.getElementById('back-to-setup').addEventListener('click', backToSetup);
  document.getElementById('skip-to-battle').addEventListener('click', skipToBattle);
  document.getElementById('new-game-btn').addEventListener('click', () => {
    showScreen('setup-screen');
    Game.phase = 'setup';
    Game.running = false;
  });
  document.getElementById('randomize-seed').addEventListener('click', () => {
    document.getElementById('world-seed').value = Math.floor(Math.random() * 999999);
  });

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = parseInt(btn.dataset.speed);
      Game.speed = s;
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Game.running = s > 0;
    });
  });

  window.addEventListener('resize', () => {
    if (Game.renderer) Game.renderer.resize();
    if (Game.timeline) Game.timeline.resize();
  });
}

function startSim() {
  const config = readConfig();
  Game.config = config;

  if (!validateConfig(config.A) || !validateConfig(config.B)) return;

  Game.rng = new RNG(config.world.seed);
  const size = MAP_SIZES[config.world.mapSize];
  Game.maxYear = config.world.maxYear;

  const world = {
    disasterChance: config.world.disasterChance,
    startingTech: config.world.startingTech,
    interaction: config.world.interaction,
    maxYear: config.world.maxYear,
  };

  Game.map = generateMap(size.w, size.h, config.A.biome, config.B.biome, Game.rng);
  Game.map.endYear = Game.maxYear;

  Game.civA = createCiv(config.A, 'A', world, Game.rng);
  Game.civB = createCiv(config.B, 'B', world, Game.rng);
  Game.world = world;

  Game.year = 0;
  Game.speed = 1;
  Game.running = true;
  Game.phase = 'sim';
  Game.battle = null;
  Game.battleOutcome = null;
  Game.yearAccumulator = 0;

  document.getElementById('events-A').innerHTML = '';
  document.getElementById('events-B').innerHTML = '';
  document.getElementById('seed-display').textContent = config.world.seed;
  document.getElementById('max-year').textContent = Game.maxYear;
  document.getElementById('skip-to-battle').textContent = `⏭ Skip to Y${Game.maxYear}`;

  showScreen('sim-screen');

  requestAnimationFrame(() => {
    Game.renderer = new Renderer(document.getElementById('map-canvas'), Game.map);
    Game.timeline = new TimelineRenderer(document.getElementById('timeline-canvas'), Game.maxYear);

    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.speed-btn[data-speed="1"]').classList.add('active');

    updatePanel(Game.civA);
    updatePanel(Game.civB);
    renderLegend(Game.civA, Game.civB);

    Game.lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  });
}

function validateConfig(side) {
  const race = RACES[side.race];
  const focus = FOCUSES[side.focus];
  const weapon = WEAPONS[side.weapon];
  const gov = GOVERNMENTS[side.government];

  if (focus.requires && !focus.requires.includes(side.race)) {
    alert(`${focus.name} focus requires one of: ${focus.requires.map(r => RACES[r].name).join(', ')}`);
    return false;
  }
  if (gov.requires && gov.requires.race && !gov.requires.race.includes(side.race)) {
    alert(`${gov.name} government requires one of: ${gov.requires.race.map(r => RACES[r].name).join(', ')}`);
    return false;
  }
  if (weapon.requires) {
    if (weapon.requires.focus && !weapon.requires.focus.includes(side.focus)) {
      alert(`${weapon.name} requires focus: ${weapon.requires.focus.join(' or ')}`);
      return false;
    }
    if (weapon.requires.focusOr && !weapon.requires.focusOr.includes(side.focus)) {
      alert(`${weapon.name} requires focus: ${weapon.requires.focusOr.map(f => FOCUSES[f].name).join(' or ')}`);
      return false;
    }
    if (weapon.requires.race && !weapon.requires.race.includes(side.race)) {
      alert(`${weapon.name} requires race: ${weapon.requires.race.map(r => RACES[r].name).join(' or ')}`);
      return false;
    }
  }
  return true;
}

function backToSetup() {
  Game.running = false;
  Game.phase = 'setup';
  showScreen('setup-screen');
}

function skipToBattle() {
  if (Game.phase !== 'sim') return;

  const overlay = document.getElementById('map-overlay');
  overlay.textContent = 'SIMULATING…';
  overlay.classList.add('show');

  // Defer so the overlay paints before the (possibly long) synchronous run.
  setTimeout(() => {
    const log = (side, year, text, tag) => {
      logEvent(side, year, text, tag);
      Game.timeline.addEvent(year, tag, side);
    };
    while (Game.year < Game.maxYear) {
      Game.year++;
      tickYear(Game.civA, Game.year, Game.world, Game.map, Game.civB, log);
      tickYear(Game.civB, Game.year, Game.world, Game.map, Game.civA, log);
    }
    updatePanel(Game.civA);
    updatePanel(Game.civB);
    startBattle();
  }, 40);
}

function gameLoop(timestamp) {
  const dt = timestamp - Game.lastFrameTime;
  Game.lastFrameTime = timestamp;

  if (Game.phase === 'sim') simStep(dt);
  else if (Game.phase === 'battle') battleStep();

  if (Game.renderer && (Game.phase === 'sim' || Game.phase === 'battle')) {
    Game.renderer.render(Game.civA, Game.civB, Game.year);
    document.getElementById('year').textContent = Game.year;
  }
  if (Game.timeline && Game.phase === 'sim') Game.timeline.render(Game.year);

  if (Game.phase !== 'done') requestAnimationFrame(gameLoop);
}

function simStep(dt) {
  if (!Game.running) return;
  if (Game.year >= Game.maxYear) { startBattle(); return; }

  Game.yearAccumulator += (dt / 1000) * Game.speed;

  let stepsThisFrame = 0;
  const maxSteps = Game.speed >= 1000 ? 60 : (Game.speed >= 100 ? 20 : 5);

  while (Game.yearAccumulator >= 1 && stepsThisFrame < maxSteps) {
    Game.yearAccumulator -= 1;
    Game.year++;
    stepsThisFrame++;

    const log = (side, year, text, tag) => {
      logEvent(side, year, text, tag);
      if (Game.timeline) Game.timeline.addEvent(year, tag, side);
    };

    tickYear(Game.civA, Game.year, Game.world, Game.map, Game.civB, log);
    tickYear(Game.civB, Game.year, Game.world, Game.map, Game.civA, log);

    if (Game.year >= Game.maxYear) { startBattle(); return; }
  }

  updatePanel(Game.civA);
  updatePanel(Game.civB);
}

// ============================================================
// BATTLE
// ============================================================
function startBattle() {
  if (Game.phase === 'battle') return;
  Game.phase = 'battle';
  Game.running = true;

  Game.battleOutcome = resolveBattle(Game.civA, Game.civB, Game.world, Game.rng);

  const overlay = document.getElementById('map-overlay');
  overlay.textContent = `FINAL BATTLE — Y${Game.maxYear}`;
  overlay.classList.add('show');

  Game.battle = new BattleVisualizer(Game.renderer, Game.map, Game.civA, Game.civB, Game.battleOutcome);
  Game.battle.start();
}

function battleStep() {
  Game.battle.step();
  if (Game.battle.isDone()) finishGame();
}

// ============================================================
// FINISH
// ============================================================
function finishGame() {
  Game.phase = 'done';
  Game.running = false;
  document.getElementById('map-overlay').classList.remove('show');

  const outcome = Game.battleOutcome;
  const winner = outcome.winner;
  const loser = outcome.loser;

  winner.army = Math.max(0, Math.floor(winner.army * (1 - outcome.winnerCasualtyPct)));
  loser.army = 0;

  setTimeout(() => {
    const titleEl = document.getElementById('winner-title');
    titleEl.textContent = `${winner.name.toUpperCase()} VICTORIOUS`;
    titleEl.style.color = winner.color;
    document.getElementById('winner-subtitle').textContent =
      `${RACES[winner.race].name} · ${FOCUSES[winner.focus].name} · Conquered the world in Year ${Game.maxYear}`;

    // Visual battle log
    const summaryEl = document.getElementById('battle-summary');
    summaryEl.innerHTML = '';
    for (const entry of Game.battle.battleLog) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="b-year">Y${entry.year}</span>${escapeHtml(entry.text)}`;
      summaryEl.appendChild(div);
    }

    // Detailed power breakdown
    renderAftermathPower(outcome);

    // Final stats side-by-side
    document.getElementById('final-stats').innerHTML = `
      ${finalStatCard(Game.civA)}
      ${finalStatCard(Game.civB)}
    `;

    showScreen('aftermath-screen');
  }, 1500);
}

function finalStatCard(civ) {
  return `<div>
    <h3 style="color:${escapeHtml(civ.color)}">${escapeHtml(civ.name)}</h3>
    <div class="stat"><span>Race / Gov</span><span>${escapeHtml(civ.raceData.name)} · ${escapeHtml(civ.govData.name)}</span></div>
    <div class="stat"><span>Population</span><span>${formatNum(civ.population)}</span></div>
    <div class="stat"><span>Army</span><span>${formatNum(civ.army)}</span></div>
    <div class="stat"><span>Tech Age</span><span>${TECH_AGES[civ.techAge].name}</span></div>
    <div class="stat"><span>Knowledge</span><span>${formatNum(civ.knowledge)}</span></div>
    <div class="stat"><span>Gold</span><span>${formatNum(civ.gold)}</span></div>
    <div class="stat"><span>Territory</span><span>${formatNum(civ.territory)}</span></div>
  </div>`;
}

document.addEventListener('DOMContentLoaded', init);
