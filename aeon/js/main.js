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
  speed: 1,
  running: false,
  yearAccumulator: 0,
  lastFrameTime: 0,
  battle: null,
  battleOutcome: null,
  phase: 'setup',  // setup | sim | battle | done
};

// ============================================================
// INIT
// ============================================================
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

// ============================================================
// START SIMULATION
// ============================================================
function startSim() {
  const config = readConfig();
  Game.config = config;

  // Validate weapon requirements
  if (!validateConfig(config.A) || !validateConfig(config.B)) return;

  Game.rng = new RNG(config.world.seed);
  const size = MAP_SIZES[config.world.mapSize];

  // Build world settings
  const world = {
    disasterChance: config.world.disasterChance,
    startingTech: config.world.startingTech,
    interaction: config.world.interaction,
  };

  Game.map = generateMap(size.w, size.h, config.A.biome, config.B.biome, Game.rng);

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

  // Clear event logs
  document.getElementById('events-A').innerHTML = '';
  document.getElementById('events-B').innerHTML = '';

  document.getElementById('seed-display').textContent = config.world.seed;

  showScreen('sim-screen');

  // Wait a tick for layout, then init canvases
  requestAnimationFrame(() => {
    const mapCanvas = document.getElementById('map-canvas');
    Game.renderer = new Renderer(mapCanvas, Game.map);

    const timelineCanvas = document.getElementById('timeline-canvas');
    Game.timeline = new TimelineRenderer(timelineCanvas);

    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.speed-btn[data-speed="1"]').classList.add('active');

    updatePanel(Game.civA);
    updatePanel(Game.civB);

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
    alert(`${focus.name} focus requires one of: ${focus.requires.join(', ')}`);
    return false;
  }
  if (gov.requires && gov.requires.race && !gov.requires.race.includes(side.race)) {
    alert(`${gov.name} government requires one of: ${gov.requires.race.join(', ')}`);
    return false;
  }
  if (weapon.requires) {
    if (weapon.requires.focus && !weapon.requires.focus.includes(side.focus)) {
      alert(`${weapon.name} requires focus: ${weapon.requires.focus.join(' or ')}`);
      return false;
    }
    if (weapon.requires.race && !weapon.requires.race.includes(side.race)) {
      alert(`${weapon.name} requires race: ${weapon.requires.race.join(' or ')}`);
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
  // Fast-forward to year 1000
  const log = (side, year, text, tag) => {
    logEvent(side, year, text, tag);
    Game.timeline.addEvent(year, tag, side);
  };
  while (Game.year < 1000) {
    Game.year++;
    tickYear(Game.civA, Game.year, Game.world, Game.map, Game.civB, log);
    tickYear(Game.civB, Game.year, Game.world, Game.map, Game.civA, log);
  }
  updatePanel(Game.civA);
  updatePanel(Game.civB);
  startBattle();
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop(timestamp) {
  const dt = timestamp - Game.lastFrameTime;
  Game.lastFrameTime = timestamp;

  if (Game.phase === 'sim') {
    simStep(dt);
  } else if (Game.phase === 'battle') {
    battleStep();
  }

  // Render
  if (Game.renderer && (Game.phase === 'sim' || Game.phase === 'battle')) {
    Game.renderer.render(Game.civA, Game.civB, Game.year);
    document.getElementById('year').textContent = Game.year;
  }
  if (Game.timeline && Game.phase === 'sim') {
    Game.timeline.render(Game.year);
  }

  if (Game.phase !== 'done') {
    requestAnimationFrame(gameLoop);
  }
}

function simStep(dt) {
  if (!Game.running) return;
  if (Game.year >= 1000) {
    startBattle();
    return;
  }

  // years per second based on speed
  // speed 1 = 1 year/sec, 10 = 10/sec, etc.
  Game.yearAccumulator += (dt / 1000) * Game.speed;

  let stepsThisFrame = 0;
  const maxSteps = Game.speed >= 1000 ? 50 : (Game.speed >= 100 ? 20 : 5);

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

    if (Game.year >= 1000) {
      startBattle();
      return;
    }
  }

  // Update panels every frame (cheap)
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

  // Resolve outcome
  Game.battleOutcome = resolveBattle(Game.civA, Game.civB, Game.world, Game.rng);

  // Show overlay
  const overlay = document.getElementById('map-overlay');
  overlay.textContent = `FINAL BATTLE — Y1000`;
  overlay.classList.add('show');

  // Init visualizer
  Game.battle = new BattleVisualizer(Game.renderer, Game.map, Game.civA, Game.civB, Game.battleOutcome);
  Game.battle.start();
}

function battleStep() {
  Game.battle.step();
  if (Game.battle.isDone()) {
    finishGame();
  }
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

  // Apply casualties to civs
  winner.army = Math.max(0, Math.floor(winner.army * (1 - outcome.winnerCasualtyPct)));
  loser.army  = 0;

  // Show aftermath screen
  setTimeout(() => {
    document.getElementById('winner-title').textContent = `${winner.name.toUpperCase()} VICTORIOUS`;
    document.getElementById('winner-title').style.color = winner.color;
    document.getElementById('winner-subtitle').textContent =
      `${RACES[winner.race].name} · ${FOCUSES[winner.focus].name} · Conquered the world in Y1000`;

    // Battle summary
    const summaryEl = document.getElementById('battle-summary');
    summaryEl.innerHTML = '';
    for (const entry of Game.battle.battleLog) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="b-year">Y${entry.year}</span>${entry.text}`;
      summaryEl.appendChild(div);
    }
    const result = document.createElement('div');
    result.innerHTML = `<br><strong>Invader (${outcome.invader.name}):</strong> Power ${formatNum(outcome.invPower)} (rolled ${formatNum(Math.floor(outcome.invRoll))})`;
    summaryEl.appendChild(result);
    const result2 = document.createElement('div');
    result2.innerHTML = `<strong>Defender (${outcome.defender.name}):</strong> Power ${formatNum(outcome.defPower)} (rolled ${formatNum(Math.floor(outcome.defRoll))})`;
    summaryEl.appendChild(result2);

    // Final stats
    const statsEl = document.getElementById('final-stats');
    statsEl.innerHTML = `
      <div>
        <h3 style="color:${Game.civA.color}">${Game.civA.name}</h3>
        <div class="stat"><span>Population</span><span>${formatNum(Game.civA.population)}</span></div>
        <div class="stat"><span>Army</span><span>${formatNum(Game.civA.army)}</span></div>
        <div class="stat"><span>Tech Age</span><span>${TECH_AGES[Game.civA.techAge].name}</span></div>
        <div class="stat"><span>Knowledge</span><span>${formatNum(Game.civA.knowledge)}</span></div>
        <div class="stat"><span>Gold</span><span>${formatNum(Game.civA.gold)}</span></div>
      </div>
      <div>
        <h3 style="color:${Game.civB.color}">${Game.civB.name}</h3>
        <div class="stat"><span>Population</span><span>${formatNum(Game.civB.population)}</span></div>
        <div class="stat"><span>Army</span><span>${formatNum(Game.civB.army)}</span></div>
        <div class="stat"><span>Tech Age</span><span>${TECH_AGES[Game.civB.techAge].name}</span></div>
        <div class="stat"><span>Knowledge</span><span>${formatNum(Game.civB.knowledge)}</span></div>
        <div class="stat"><span>Gold</span><span>${formatNum(Game.civB.gold)}</span></div>
      </div>
    `;

    showScreen('aftermath-screen');
  }, 1500);
}

// Boot
document.addEventListener('DOMContentLoaded', init);
