// ============================================================
// AEON :: MAIN ORCHESTRATOR
// Initialization, game loop, screen transitions.
// Supports 1v1 (two civs) and 1v1v1 (three civs).
// ============================================================

const Game = {
  config: null,
  rng: null,
  map: null,
  civA: null,
  civB: null,
  civC: null,
  civs: [],
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
  _battle3dActive: false,  // true while Battle3D owns the render loop
};

// ============================================================
// BABYLON LAZY LOADER
// ============================================================
let _babylonLoadState = 'idle'; // idle | loading | ready | failed
let _babylonQueue = [];

function loadBabylon3D(onSuccess, onFail) {
  if (_babylonLoadState === 'ready') { onSuccess(); return; }
  if (_babylonLoadState === 'failed') { onFail(); return; }

  _babylonQueue.push({ onSuccess, onFail });
  if (_babylonLoadState === 'loading') return;
  _babylonLoadState = 'loading';

  // If Babylon was already loaded eagerly (by render3d.js script tags),
  // skip the CDN fetch and just load battle3d.js.
  if (typeof BABYLON !== 'undefined') {
    function succeedFast() {
      _babylonLoadState = 'ready';
      const q = _babylonQueue.splice(0);
      for (const cb of q) cb.onSuccess();
    }
    function failFast() {
      _babylonLoadState = 'failed';
      const q = _babylonQueue.splice(0);
      for (const cb of q) cb.onFail();
    }
    function loadScriptFast(src, next, err) {
      const s = document.createElement('script');
      s.src = src; s.onerror = err; s.onload = next;
      document.head.appendChild(s);
    }
    loadScriptFast('js/battle3d.js', succeedFast, failFast);
    return;
  }

  function fail() {
    _babylonLoadState = 'failed';
    const q = _babylonQueue.splice(0);
    for (const cb of q) cb.onFail();
  }
  function succeed() {
    _babylonLoadState = 'ready';
    const q = _babylonQueue.splice(0);
    for (const cb of q) cb.onSuccess();
  }

  function loadScript(src, next, err) {
    const s = document.createElement('script');
    s.src = src; s.onerror = err; s.onload = next;
    document.head.appendChild(s);
  }

  loadScript(
    'https://cdn.jsdelivr.net/npm/babylonjs@6.49.0/babylon.js',
    () => loadScript(
      'https://cdn.jsdelivr.net/npm/babylonjs-loaders@6.49.0/babylonjs.loaders.min.js',
      () => loadScript('js/battle3d.js', succeed, fail),
      fail
    ),
    fail
  );
}

function init() {
  populateSelects();
  initOptionTooltips();
  initStatsSheet();
  initMultiplayer();

  document.getElementById('start-btn').addEventListener('click', startSim);
  document.getElementById('back-to-setup').addEventListener('click', backToSetup);
  document.getElementById('skip-to-battle').addEventListener('click', skipToBattle);
  document.getElementById('new-game-btn').addEventListener('click', () => {
    if (Game.battle && typeof Game.battle.disposeEngine === 'function') Game.battle.disposeEngine();
    Game._battle3dActive = false;
    // === AEON ADDITION - MAIN MENU - START ===
    // Route back through the menu (not straight to setup) so Continue/World
    // History/Legacy World reflect the run that just ended. Falls back to the
    // original direct-to-setup behaviour if the menu module never loaded.
    if (typeof AeonMenu !== 'undefined' && document.getElementById('menu-screen')) {
      AeonMenu._refreshMenuState();
      showScreen('menu-screen');
    } else {
      showScreen('setup-screen');
    }
    // === AEON ADDITION - MAIN MENU - END ===
    Game.phase = 'setup';
    Game.running = false;
  });
  document.getElementById('randomize-seed').addEventListener('click', () => {
    document.getElementById('world-seed').value = Math.floor(Math.random() * 999999);
  });
  const rndBtn = document.getElementById('randomize-btn');
  if (rndBtn) rndBtn.addEventListener('click', randomizeTeams);
  document.querySelectorAll('.side-randomize-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      randomizeSide(btn.dataset.side);
    });
  });

  // Aerial / angled camera view toggle (3D renderer only).
  const viewBtn = document.getElementById('view-toggle');
  if (viewBtn) {
    viewBtn.addEventListener('click', () => {
      if (!Game.renderer || typeof Game.renderer.cycleViewMode !== 'function') return;
      const mode = Game.renderer.cycleViewMode();
      viewBtn.textContent = mode === 'aerial' ? '🎥 Angled' : '🛰 Aerial';
    });
  }

  // Sound toggle (reflects persisted mute state).
  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn) {
    if (typeof Sfx !== 'undefined' && Sfx.isMuted()) soundBtn.textContent = '🔇';
    soundBtn.addEventListener('click', () => {
      if (typeof Sfx === 'undefined') return;
      Sfx.unlock();
      soundBtn.textContent = Sfx.toggle() ? '🔇' : '🔊';
    });
  }

  // Copy a plain-text run summary to the clipboard.
  const copyBtn = document.getElementById('copy-summary-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const txt = buildRunSummary();
      if (txt) copyToClipboard(txt).then(() => showToast('📋 Run summary copied to clipboard'));
    });
  }

  initMobile();

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

  // === AEON ADDITION - MAIN MENU INIT - START ===
  // Build the main menu (Feature 1) over the setup screen. If the module is
  // absent the setup screen stays active and AEON behaves exactly as before.
  if (typeof AeonMenu !== 'undefined') AeonMenu.init();
  // === AEON ADDITION - MAIN MENU INIT - END ===
}

function startSim() {
  if (typeof Sfx !== 'undefined') Sfx.unlock(); // first user gesture → enable audio

  const config = readConfig();
  Game.config = config;

  const players = config.world.players || 2;
  if (!validateConfig(config.A) || !validateConfig(config.B)) return;
  if (players === 3 && !validateConfig(config.C)) return;

  // Async multiplayer: derive a shared seed from the combined config so both
  // players, holding the identical config, produce a bit-for-bit identical run.
  if (typeof MP !== 'undefined' && MP.active) {
    config.world.seed = hashConfigToSeed(config);
    if (MP.role === 'accepter') {
      // Rewrite the URL to encode BOTH sides and hand it back to the challenger.
      const fullUrl = encodeMatchURL(config, true);
      history.replaceState(null, '', fullUrl);
      copyToClipboard(fullUrl).then(() =>
        showToast('🔗 Match link copied — send it back so your challenger sees the same battle.', 4200));
    }
  }

  Game.rng = new RNG(config.world.seed);
  const size = MAP_SIZES[config.world.mapSize];
  Game.maxYear = config.world.maxYear;

  const world = {
    disasterChance: config.world.disasterChance,
    startingTech: config.world.startingTech,
    interaction: config.world.interaction,
    maxYear: config.world.maxYear,
    players,
  };

  Game.map = generateMap(size.w, size.h, config.A.biome, config.B.biome, Game.rng,
                         players === 3 ? config.C.biome : undefined);
  Game.map.endYear = Game.maxYear;

  Game.civA = createCiv(config.A, 'A', world, Game.rng);
  Game.civB = createCiv(config.B, 'B', world, Game.rng);
  Game.civC = players === 3 ? createCiv(config.C, 'C', world, Game.rng) : null;
  Game.civs = [Game.civA, Game.civB].concat(Game.civC ? [Game.civC] : []);
  Game.world = world;

  // === AEON ADDITION - FEATURE PER-RUN INIT - START ===
  aeonInitRun();
  // === AEON ADDITION - FEATURE PER-RUN INIT - END ===

  Game.year = 0;
  Game.speed = 1;
  Game.running = true;
  Game.phase = 'sim';
  Game.battle = null;
  Game.battleOutcome = null;
  Game.yearAccumulator = 0;

  // Reset and show the right number of side panels.
  for (const side of ['A', 'B', 'C']) {
    const log = document.getElementById(`events-${side}`);
    if (log) log.innerHTML = '';
  }
  const panelC = document.getElementById('panel-C');
  if (panelC) panelC.style.display = Game.civC ? '' : 'none';
  document.querySelector('.sim-body').classList.toggle('three', !!Game.civC);

  document.getElementById('seed-display').textContent = config.world.seed;
  document.getElementById('max-year').textContent = Game.maxYear;
  document.getElementById('skip-to-battle').textContent = `⏭ Skip to Y${Game.maxYear}`;

  showScreen('sim-screen');
  resetMobileNav(!!Game.civC);

  requestAnimationFrame(() => {
    const canvas = document.getElementById('map-canvas');
    // Tear down a previous renderer so WebGL contexts don't stack across runs.
    if (Game.renderer && typeof Game.renderer.dispose === 'function') {
      try { Game.renderer.dispose(); } catch (_) {}
    }
    // Prefer the 3D aerial renderer; fall back to the 2D one if WebGL/Babylon
    // is unavailable or the 3D scene fails to build, so the map always shows.
    try {
      if (typeof Renderer3D === 'undefined' || typeof BABYLON === 'undefined') throw new Error('Babylon unavailable');
      Game.renderer = new Renderer3D(canvas, Game.map);
    } catch (e) {
      console.warn('3D renderer unavailable, using 2D map:', e);
      Game.renderer = new Renderer(canvas, Game.map);
    }
    Game.timeline = new TimelineRenderer(document.getElementById('timeline-canvas'), Game.maxYear);

    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.speed-btn[data-speed="1"]').classList.add('active');

    // The aerial toggle only applies to the 3D renderer; hide it on 2D fallback.
    const viewBtn = document.getElementById('view-toggle');
    if (viewBtn) {
      const has3D = Game.renderer && typeof Game.renderer.cycleViewMode === 'function';
      viewBtn.style.display = has3D ? '' : 'none';
      viewBtn.textContent = '🛰 Aerial';
    }

    for (const c of Game.civs) updatePanel(c);
    renderLegend(Game.civs);

    Game.lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  });
}

// Tick every civ for one year, each seeing all the others as opponents.
function tickAll(year, log) {
  for (const civ of Game.civs) {
    const others = Game.civs.filter(c => c !== civ);
    tickYear(civ, year, Game.world, Game.map, others, log);
  }
}

function updateAllPanels() {
  for (const c of Game.civs) updatePanel(c);
}

// === AEON ADDITION - FEATURE WIRING - START ===
// Initialise every feature module for a new run. Each is guarded so a missing
// or disabled module is simply skipped, leaving the base sim untouched.
function aeonInitRun() {
  if (typeof gameConfig === 'undefined') return;

  // Which side the human plays (from the injected "Play As" selector).
  const playAs = document.getElementById('play-as');
  gameConfig.playerSide = (playAs && playAs.value) ? playAs.value : 'A';
  if (!Game.civs.some(c => c.side === gameConfig.playerSide)) gameConfig.playerSide = 'A';

  // Dedicated deterministic RNG for the feature systems (keeps civ RNGs intact).
  Game._aeonRng = Game.rng.fork(0xAE0F);
  Game._antagonistSide = null;
  Game._convergenceChronicle = null;
  Game._convergenceMercy = null;
  Game._chronicle = null;
  Game._skipping = false;

  if (typeof LegacySystem !== 'undefined') LegacySystem.init();
  if (typeof AiDoctrines !== 'undefined') { AiDoctrines.init(); AiDoctrines.assign(Game.civs, Game._aeonRng); }
  if (typeof CrisisSystem !== 'undefined') CrisisSystem.init();
  if (typeof Diplomacy !== 'undefined') {
    Diplomacy.init(Game.civs);
    // Cultural memory from past runs nudges rivals' opening stance.
    if (typeof LegacySystem !== 'undefined' && Diplomacy.records && Diplomacy.active) {
      const bias = LegacySystem.culturalOpeningBias ? LegacySystem.culturalOpeningBias() : 0;
      if (bias) for (const side in Diplomacy.records) Diplomacy.records[side].score += bias;
      Diplomacy.renderPanel();
    }
  }
  if (typeof ConvergenceSystem !== 'undefined') ConvergenceSystem.init();
  if (typeof LegacySystem !== 'undefined') {
    LegacySystem.applyToNewGame(Game.map, Game.civs);
    LegacySystem.enforceRunStart();
  }
}

// Called after each simulated year (from simStep and the skip loop). Returns
// true if a feature opened a modal and the sim must pause until a choice.
function aeonYearHook(year) {
  if (typeof Diplomacy !== 'undefined' && Diplomacy.active) Diplomacy.tickYear(year);
  if (typeof ConvergenceSystem !== 'undefined' && ConvergenceSystem.active && ConvergenceSystem.checkYear(year)) return true;
  if (typeof CrisisSystem !== 'undefined' && CrisisSystem.active && CrisisSystem.checkYear(year)) return true;
  return false;
}

// Resume the sim after a crisis/convergence choice — continuing either the
// real-time loop or the interruptible "Skip to End" run.
function aeonResumeSim() {
  const overlay = document.getElementById('crisis-overlay');
  if (overlay) overlay.classList.remove('show');
  if (Game._skipping) advanceSkip();
  else Game.running = true;
}
// === AEON ADDITION - FEATURE WIRING - END ===

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
  if (Game._battle3dActive && Game.battle && Game.battle.dispose) {
    Game.battle.dispose();
    Game._battle3dActive = false;
  }
  Game.running = false;
  Game.phase = 'setup';
  showScreen('setup-screen');
}

function skipToBattle() {
  if (Game.phase !== 'sim') return;

  const overlay = document.getElementById('map-overlay');
  overlay.textContent = 'SIMULATING…';
  overlay.classList.add('show');

  // === AEON ADDITION - INTERRUPTIBLE SKIP - START ===
  // The skip now pauses for each crisis / convergence choice and resumes via
  // aeonResumeSim(). Stop the real-time loop so it can't advance years in
  // parallel with the skip loop while a modal is open.
  Game._skipping = true;
  Game.running = false;
  setTimeout(advanceSkip, 40);
  // === AEON ADDITION - INTERRUPTIBLE SKIP - END ===
}

// === AEON ADDITION - INTERRUPTIBLE SKIP HELPER - START ===
// Fast-forwards the sim, breaking out whenever a feature modal opens; the
// modal's choice handler calls aeonResumeSim() → advanceSkip() to continue.
function advanceSkip() {
  if (Game.phase !== 'sim') { Game._skipping = false; return; }
  const log = (side, year, text, tag) => {
    logEvent(side, year, text, tag);
    if (Game.timeline) Game.timeline.addEvent(year, tag, side);
  };
  while (Game.year < Game.maxYear) {
    Game.year++;
    tickAll(Game.year, log);
    if (typeof aeonYearHook === 'function' && aeonYearHook(Game.year)) {
      updateAllPanels();
      return;   // modal open; resumes via aeonResumeSim()
    }
  }
  Game._skipping = false;
  updateAllPanels();
  startBattle();
}
// === AEON ADDITION - INTERRUPTIBLE SKIP HELPER - END ===

function gameLoop(timestamp) {
  const dt = timestamp - Game.lastFrameTime;
  Game.lastFrameTime = timestamp;

  if (Game.phase === 'sim') simStep(dt);
  else if (Game.phase === 'battle' && !Game._battle3dActive) battleStep();

  if (Game.renderer && (Game.phase === 'sim' || (Game.phase === 'battle' && !Game._battle3dActive))) {
    Game.renderer.render(Game.civs, Game.year, Game.phase === 'battle' ? 'battle' : 'sim');
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
      if (tag === 'tech' && typeof Sfx !== 'undefined') Sfx.ageUp();
    };

    tickAll(Game.year, log);

    // === AEON ADDITION - CRISIS / CONVERGENCE PAUSE - START ===
    if (typeof aeonYearHook === 'function' && aeonYearHook(Game.year)) {
      Game.running = false;          // a modal opened — pause until a choice is made
      updateAllPanels();
      return;
    }
    // === AEON ADDITION - CRISIS / CONVERGENCE PAUSE - END ===

    if (Game.year >= Game.maxYear) { startBattle(); return; }
  }

  updateAllPanels();
}

// ============================================================
// BATTLE
// ============================================================
function startBattle() {
  if (Game.phase === 'battle') return;
  Game.phase = 'battle';
  Game.running = true;
  if (typeof Sfx !== 'undefined') Sfx.battleStart();

  // === AEON ADDITION - CONVERGENCE FINAL BATTLE - START ===
  Game._skipping = false;
  if (typeof ConvergenceSystem !== 'undefined' && ConvergenceSystem.active) {
    // Play the 3-phase Convergence; it adjusts the player civ's state and
    // then calls proceedWithBattle() to run the unchanged resolution below.
    ConvergenceSystem.runFinalBattle(proceedWithBattle);
    return;
  }
  // === AEON ADDITION - CONVERGENCE FINAL BATTLE - END ===

  proceedWithBattle();
}

// === AEON ADDITION - BATTLE RESOLUTION SPLIT - START ===
// Original startBattle body, extracted verbatim so the Convergence system can
// run its phases first and then trigger the identical resolution + visuals.
function proceedWithBattle() {
  Game.battleOutcome = Game.civC
    ? resolveBattle3(Game.civA, Game.civB, Game.civC, Game.world, Game.rng)
    : resolveBattle(Game.civA, Game.civB, Game.world, Game.rng);

  const overlay = document.getElementById('map-overlay');
  const label = `FINAL ${Game.civC ? 'THREE-WAY ' : ''}BATTLE — Y${Game.maxYear}`;
  overlay.textContent = label;
  overlay.classList.add('show');

  // The battle plays out on the SAME aerial map: armies march from their
  // capitals and clash in the centre, stepped from the game loop and drawn
  // by the live renderer (animated characters when loaded, boxes otherwise).
  Game._battle3dActive = false;
  setTimeout(() => {
    overlay.classList.remove('show');
    Game.battle = new BattleVisualizer(Game.renderer, Game.map, Game.civs, Game.battleOutcome);
    Game.battle.start();
  }, 900);
}
// === AEON ADDITION - BATTLE RESOLUTION SPLIT - END ===

function battleStep() {
  if (!Game.battle) return; // brief dramatic pause before the armies form up
  Game.battle.step();
  if (Game.battle.isDone()) finishGame();
}

// ============================================================
// FINISH
// ============================================================
function finishGame() {
  Game.phase = 'done';
  Game.running = false;
  Game._battle3dActive = false;
  document.getElementById('map-overlay').classList.remove('show');

  const outcome = Game.battleOutcome;
  const winner = outcome.winner;

  // === AEON ADDITION - LEGACY CHRONICLE - START ===
  if (typeof ConvergenceSystem !== 'undefined' && ConvergenceSystem._removeHud) ConvergenceSystem._removeHud();
  // A Chronicle is a Legacy/Ironman/Convergence artifact — only written when
  // one of those systems is active, so a fully-off run leaves no new trace.
  if (typeof LegacySystem !== 'undefined' && typeof gameConfig !== 'undefined' &&
      (gameConfig.ironman || gameConfig.convergenceEnabled)) {
    try { Game._chronicle = LegacySystem.finalize(outcome); } catch (e) { console.warn('Chronicle failed:', e); }
  }
  // === AEON ADDITION - LEGACY CHRONICLE - END ===

  // Apply final casualties: the victor is bloodied, the conquered wiped out.
  if (outcome.threeWay) {
    for (const e of outcome.entries) {
      e.civ.army = e.civ === winner
        ? Math.max(0, Math.floor(e.civ.army * (1 - e.casualtyPct)))
        : 0;
    }
  } else {
    winner.army = Math.max(0, Math.floor(winner.army * (1 - outcome.winnerCasualtyPct)));
    outcome.loser.army = 0;
  }

  // Capture battle log before async delay (Battle3D stays alive until after this)
  const battleLogSnapshot = (Game.battle && Game.battle.battleLog) ? Game.battle.battleLog.slice() : [];
  Game._battleLog = battleLogSnapshot; // also used by the clipboard summary

  if (typeof Sfx !== 'undefined') Sfx.victory();

  setTimeout(() => {
    const titleEl = document.getElementById('winner-title');
    titleEl.textContent = `${winner.name.toUpperCase()} VICTORIOUS`;
    titleEl.style.color = winner.color;
    document.getElementById('winner-subtitle').textContent =
      `${RACES[winner.race].name} · ${FOCUSES[winner.focus].name} · Conquered the world in Year ${Game.maxYear}`;

    // === AEON ADDITION - EPITAPH - START ===
    if (Game._chronicle && Game._chronicle.epitaph) {
      const sub = document.getElementById('winner-subtitle');
      if (sub) sub.innerHTML += `<div class="aftermath-epitaph" style="margin-top:8px;font-style:italic;color:#c2b58a;">“${escapeHtml(Game._chronicle.epitaph)}”</div>`;
    }
    // === AEON ADDITION - EPITAPH - END ===

    // Visual battle log
    const summaryEl = document.getElementById('battle-summary');
    summaryEl.innerHTML = '';
    for (const entry of battleLogSnapshot) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="b-year">Y${entry.year}</span>${escapeHtml(entry.text)}`;
      summaryEl.appendChild(div);
    }

    // Detailed power breakdown
    renderAftermathPower(outcome);

    // Final stats side-by-side (or three-up)
    const fs = document.getElementById('final-stats');
    fs.classList.toggle('cols-3', !!Game.civC);
    fs.innerHTML = Game.civs.map(finalStatCard).join('');

    showScreen('aftermath-screen');

    // Free Babylon GPU resources now that the aftermath is shown
    if (Game.battle && typeof Game.battle.disposeEngine === 'function') {
      Game.battle.disposeEngine();
    }
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

// Build a shareable plain-text recap of the finished run.
function buildRunSummary() {
  const o = Game.battleOutcome;
  if (!o || !o.winner) return '';
  const w = o.winner;
  const L = [];
  L.push('AEON — World Simulation Result');
  L.push(`Seed ${Game.config.world.seed} · ${Game.maxYear} years · ${Game.civs.length}-way`);
  L.push('');
  L.push(`🏆 ${w.name} (${RACES[w.race].name}) conquered the world in Year ${Game.maxYear}.`);
  L.push('');
  L.push('Final standings:');
  for (const c of Game.civs) {
    L.push(`  ${c === w ? '★' : '·'} ${c.name} — ${RACES[c.race].name} · ${FOCUSES[c.focus].name} · ` +
           `${TECH_AGES[c.techAge].name} Age · Pop ${formatNum(c.population)} · Army ${formatNum(c.army)}`);
  }
  if (Game._battleLog && Game._battleLog.length) {
    L.push('');
    L.push('Final battle:');
    for (const e of Game._battleLog) L.push(`  Y${e.year} ${e.text}`);
  }
  L.push('');
  L.push(`Replay: ${location.href}`);
  return L.join('\n');
}

document.addEventListener('DOMContentLoaded', init);
