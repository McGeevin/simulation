// ============================================================
// AEON :: MAIN MENU  (Feature 1)
// Renders a menu BEFORE the sim. "New Game → Sandbox" reveals the existing
// setup screen and the sim runs exactly as before. Options write to
// gameConfig; every other module reads from there.
//
// Built entirely in JS and layered on top — if this file is absent the setup
// screen stays active (its HTML default) and AEON behaves as it always has.
// ============================================================

const AeonMenu = {
  init() {
    if (typeof gameConfig === 'undefined') return;       // foundation missing → no menu
    loadGameConfig();
    if (typeof LegacySystem !== 'undefined') LegacySystem.init();

    this._injectPlayAs();
    this._injectDiplomacyPanel();
    this._buildMenu();
    this._buildHistoryScreen();

    // In a multiplayer match the challenge link should go straight to the
    // locked setup — don't interpose the menu.
    if (typeof MP !== 'undefined' && MP.active) return;

    const setup = document.getElementById('setup-screen');
    if (setup) setup.classList.remove('active');
    const menu = document.getElementById('menu-screen');
    if (menu) menu.classList.add('active');
  },

  // ── The menu screen ─────────────────────────────────────────
  _buildMenu() {
    if (document.getElementById('menu-screen')) return;
    const screen = document.createElement('div');
    screen.id = 'menu-screen';
    screen.className = 'screen aeon-menu';
    screen.innerHTML = `
      <div class="menu-inner">
        <h1 class="menu-title">AEON</h1>
        <p class="menu-tag">Forge a civilization. Outlast the Convergence. Leave a legend.</p>
        <div class="menu-buttons">
          <button class="menu-btn" data-act="newgame">New Game</button>
          <button class="menu-btn" data-act="options">Options</button>
          <button class="menu-btn" id="menu-history-btn" data-act="history">World History</button>
          <button class="menu-btn" id="menu-continue-btn" data-act="continue" disabled>Continue</button>
        </div>

        <div class="menu-panel" id="menu-newgame" hidden>
          <h2>New Game</h2>
          <div class="opt-grp">
            <button class="submenu-btn" data-mode="sandbox">Sandbox<small>The classic open simulation</small></button>
            <p class="opt-help">No objective and no permadeath — build, clash, and explore at your own pace. Every Option you've set (Crisis Events, the Convergence, AI Doctrine, Diplomacy Depth) applies in full, and you can back out to Setup at any time.</p>
          </div>
          <div class="opt-grp">
            <button class="submenu-btn disabled" disabled>Campaign<small>Coming Soon</small></button>
            <p class="opt-help">A hand-authored chain of linked scenarios with its own arc and stakes. Not yet built — Sandbox and Ironman Run already cover the full simulation in the meantime.</p>
          </div>
          <div class="opt-grp">
            <button class="submenu-btn" data-mode="ironman">Ironman Run<small>One life. No reloads. A Chronicle at the end.</small></button>
            <p class="opt-help">The same simulation as Sandbox, but the exits are sealed: no bailing back to Setup mid-run, and a fallen civilization stays fallen. Win or lose, the age is recorded as a Chronicle in your World History.</p>
          </div>
          <div class="opt-grp">
            <button class="submenu-btn disabled" id="menu-legacy-btn" data-mode="legacy" disabled>Legacy World<small>Coming Soon</small></button>
            <p class="opt-help">Begins a new world shaped by the last one: civilizations you broke return as a humbled Remnant, ruins rise near former capitals, and rivals open warier or friendlier depending on how your past selves treated them. Unlocks once your first run is chronicled.</p>
          </div>
          <button class="menu-back" data-act="back">‹ Back</button>
        </div>

        <div class="menu-panel" id="menu-legacy-briefing" hidden>
          <h2>Legacy World</h2>
          <div id="legacy-briefing-body"></div>
          <button class="submenu-btn" data-act="legacy-begin" style="margin-top:14px;">Begin<small>Carry this history into a new world</small></button>
          <button class="menu-back" data-act="back">‹ Back</button>
        </div>

        <div class="menu-panel" id="menu-options" hidden>
          <h2>Options</h2>
          <div class="opt-grp">
            <label class="opt-toggle"><span>Crisis Events</span>
              <input type="checkbox" id="opt-crisis"></label>
            <p class="opt-help">Pause the simulation at pivotal moments — plagues, prophets, invasions, succession disputes — to make a choice that reshapes your civilization. Off = an uninterrupted, hands-off run with no behaviour change.</p>
            <label class="opt-sub">Frequency
              <select id="opt-crisis-freq">
                <option value="50">Every 50 years</option>
                <option value="75">Every 75 years</option>
                <option value="100">Every 100 years</option>
              </select></label>
            <p class="opt-help opt-help-sub">How often a crisis can strike. Shorter intervals mean a busier, more interactive age.</p>
          </div>
          <div class="opt-grp">
            <label class="opt-sub">AI Doctrine <small>(primary antagonist)</small>
              <select id="opt-doctrine">
                <option value="expansionist">Expansionist</option>
                <option value="theocratic">Theocratic</option>
                <option value="isolationist">Isolationist</option>
                <option value="mercantile">Mercantile</option>
                <option value="warmonger">Warmonger</option>
                <option value="survivalist">Survivalist</option>
              </select></label>
            <p class="opt-help">The guiding strategy of your chief rival — how they expand, fight, and treat with you. Other rivals are assigned doctrines by their race.</p>
            <div class="opt-doctrine-desc" id="opt-doctrine-desc"></div>
          </div>
          <div class="opt-grp">
            <label class="opt-sub">Diplomacy Depth
              <select id="opt-diplo">
                <option value="simple">Simple</option>
                <option value="full">Full</option>
              </select></label>
            <p class="opt-help" id="opt-diplo-desc"></p>
          </div>
          <div class="opt-grp">
            <label class="opt-toggle"><span>Final Convergence</span>
              <input type="checkbox" id="opt-convergence"></label>
            <p class="opt-help">A world-ending threat announced at the three-quarter mark, building through warnings to a climactic last battle at the end of the age. Off = the simulation runs to its natural close.</p>
            <label class="opt-toggle"><span>Ironman Mode</span>
              <input type="checkbox" id="opt-ironman"></label>
            <p class="opt-help">One life — no reloads, no bailing to setup mid-run. The age ends for good if your civilization falls, and every outcome is recorded in your World History.</p>
          </div>
          <button class="menu-back" data-act="back">‹ Back</button>
        </div>
      </div>`;
    document.body.appendChild(screen);

    screen.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act],[data-mode]');
      if (!btn) return;
      const act = btn.dataset.act;
      const mode = btn.dataset.mode;
      if (mode === 'sandbox') { this._startSandbox(); return; }
      if (mode === 'ironman') { this._startIronman(); return; }
      if (mode === 'legacy') { this._openLegacyBriefing(); return; }
      if (act === 'newgame') this._showPanel('menu-newgame');
      else if (act === 'options') { this._syncOptionsUI(); this._showPanel('menu-options'); }
      else if (act === 'history') this._openHistory();
      else if (act === 'legacy-begin') this._startLegacy();
      else if (act === 'back') this._showPanel(null);
    });

    this._wireOptions();
    this._refreshMenuState();
  },

  _showPanel(id) {
    ['menu-newgame', 'menu-options', 'menu-legacy-briefing'].forEach(p => {
      const el = document.getElementById(p);
      if (el) el.hidden = (p !== id);
    });
    const buttons = document.querySelector('#menu-screen .menu-buttons');
    if (buttons) buttons.style.display = id ? 'none' : '';
  },

  _refreshMenuState() {
    const has = aeonHasChronicles();
    const hist = document.getElementById('menu-history-btn');
    if (hist) {
      hist.disabled = !has;
      hist.classList.toggle('disabled', !has);
      if (!has) hist.innerHTML = 'World History<small>Coming Soon</small>';
      else hist.textContent = 'World History';
    }
    const legacy = document.getElementById('menu-legacy-btn');
    if (legacy) {
      legacy.disabled = !has;
      legacy.classList.toggle('disabled', !has);
      legacy.innerHTML = has
        ? 'Legacy World<small>Carry forward the marks of past runs</small>'
        : 'Legacy World<small>Coming Soon — complete a run first</small>';
    }
    // Continue stays disabled — AEON has no mid-run save to resume.
    const cont = document.getElementById('menu-continue-btn');
    if (cont) cont.classList.add('disabled');
  },

  _startSandbox() {
    gameConfig.mode = 'sandbox';
    const menu = document.getElementById('menu-screen');
    if (menu) menu.classList.remove('active');
    showScreen('setup-screen');
    this._showPanel(null);
  },

  _startIronman() {
    gameConfig.mode = 'ironman';
    gameConfig.ironman = true;
    saveGameConfig();
    const menu = document.getElementById('menu-screen');
    if (menu) menu.classList.remove('active');
    showScreen('setup-screen');
    this._showPanel(null);
  },

  // ── Legacy World: preview what past runs carry forward, then launch ─
  _openLegacyBriefing() {
    const body = document.getElementById('legacy-briefing-body');
    const lw = (typeof LegacySystem !== 'undefined') ? LegacySystem.legacyWorld : null;
    if (body) {
      if (!lw || !lw.runCount) {
        body.innerHTML = '<p class="wh-empty">No history yet — this will play like a fresh Sandbox run.</p>';
      } else {
        const remnant = Array.from(lw.remnant || []);
        const { tone, magnitude } = lw.culturalMemory;
        const toneLabel = tone === 'merciful'
          ? `Rivals remember mercy — new civs open with a goodwill bonus (×${magnitude}).`
          : tone === 'brutal'
          ? `Rivals remember brutality — new civs open warier and more fearful (×${magnitude}).`
          : 'No strong cultural memory yet.';
        body.innerHTML = `
          <div class="legacy-brief-row"><strong>${lw.runCount}</strong> chronicled run${lw.runCount === 1 ? '' : 's'} precede this world.</div>
          <div class="legacy-brief-row">${remnant.length
            ? `Remnant peoples: ${remnant.map(r => `<span class="diplo-tag debt">${escapeHtml(r)}</span>`).join(' ')}`
            : 'No race has been broken to Remnant status yet.'}</div>
          <div class="legacy-brief-row">${escapeHtml(toneLabel)}</div>
          <div class="legacy-brief-row">${lw.ruins.length} ruin marker${lw.ruins.length === 1 ? '' : 's'} will be placed near former capitals.</div>`;
      }
    }
    this._showPanel('menu-legacy-briefing');
  },

  _startLegacy() {
    gameConfig.mode = 'legacy';
    const menu = document.getElementById('menu-screen');
    if (menu) menu.classList.remove('active');
    showScreen('setup-screen');
    this._showPanel(null);
  },

  // ── Options ⇄ gameConfig ────────────────────────────────────
  _wireOptions() {
    const crisis = document.getElementById('opt-crisis');
    const freq = document.getElementById('opt-crisis-freq');
    const doctrine = document.getElementById('opt-doctrine');
    const diplo = document.getElementById('opt-diplo');
    const conv = document.getElementById('opt-convergence');
    const iron = document.getElementById('opt-ironman');

    const save = () => {
      gameConfig.crisisEnabled = crisis.checked;
      gameConfig.crisisInterval = parseInt(freq.value) || 75;
      gameConfig.antagonistDoctrine = doctrine.value;
      gameConfig.diplomacyDepth = diplo.value;
      gameConfig.convergenceEnabled = conv.checked;
      gameConfig.ironman = iron.checked;
      saveGameConfig();
      this._renderDoctrineDesc();
      this._renderDiploDesc();
    };
    [crisis, freq, doctrine, diplo, conv, iron].forEach(el => {
      if (el) el.addEventListener('change', save);
    });
  },

  // Live behaviour/weakness blurb for the selected antagonist doctrine.
  _renderDoctrineDesc() {
    const box = document.getElementById('opt-doctrine-desc');
    const sel = document.getElementById('opt-doctrine');
    if (!box || !sel) return;
    const d = (typeof DOCTRINES !== 'undefined') ? DOCTRINES[sel.value] : null;
    if (!d) { box.innerHTML = ''; return; }
    box.innerHTML = `<span class="dd-behaviour">${escapeHtml(d.desc)}</span>
      <span class="dd-weak"><b>Weakness:</b> ${escapeHtml(d.weakness)}</span>`;
  },

  _renderDiploDesc() {
    const box = document.getElementById('opt-diplo-desc');
    const sel = document.getElementById('opt-diplo');
    if (!box || !sel) return;
    box.textContent = sel.value === 'full'
      ? 'Rivals remember across the ages — grievances, debts, broken alliances and honoured pacts all accumulate and drive their behaviour, and can erupt into grudge wars and betrayals.'
      : 'Rivals track only a single friend-or-foe standing. No long memory of past slights or favours.';
  },

  _syncOptionsUI() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; } };
    set('opt-crisis', gameConfig.crisisEnabled);
    set('opt-crisis-freq', String(gameConfig.crisisInterval));
    set('opt-doctrine', gameConfig.antagonistDoctrine);
    set('opt-diplo', gameConfig.diplomacyDepth);
    set('opt-convergence', gameConfig.convergenceEnabled);
    set('opt-ironman', gameConfig.ironman);
    this._renderDoctrineDesc();
    this._renderDiploDesc();
  },

  // ── "Play As" selector on the setup screen ──────────────────
  _injectPlayAs() {
    const world = document.querySelector('.world-config');
    if (!world || document.getElementById('play-as')) return;
    const label = document.createElement('label');
    label.innerHTML = `Play As <select id="play-as"><option value="A">Side A</option><option value="B">Side B</option></select>`;
    // Place it near the top of the world column.
    const firstLabel = world.querySelector('label');
    if (firstLabel) world.insertBefore(label, firstLabel.nextSibling);
    else world.appendChild(label);

    const rebuild = () => {
      const sel = document.getElementById('play-as');
      if (!sel) return;
      const three = (typeof playerCount === 'function') ? playerCount() === 3 : false;
      const cur = sel.value;
      sel.innerHTML = '<option value="A">Side A</option><option value="B">Side B</option>' + (three ? '<option value="C">Side C</option>' : '');
      sel.value = (cur === 'C' && !three) ? 'A' : cur;
    };
    const pc = document.getElementById('player-count');
    if (pc) pc.addEventListener('click', () => setTimeout(rebuild, 0));
  },

  // ── Diplomacy panel + toggle (shown during the sim) ─────────
  _injectDiplomacyPanel() {
    if (document.getElementById('diplo-panel')) return;
    const map = document.querySelector('.map-container');
    if (map) {
      const panel = document.createElement('div');
      panel.id = 'diplo-panel';
      panel.className = 'diplo-panel';
      map.appendChild(panel);
    }
    const headerRight = document.querySelector('.header-right');
    if (headerRight && !document.getElementById('diplo-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'diplo-toggle';
      btn.title = 'Toggle diplomacy panel';
      btn.textContent = '🕊';
      btn.style.cssText = 'background:none;border:1px solid rgba(255,255,255,.18);border-radius:6px;color:inherit;cursor:pointer;font-size:15px;padding:3px 8px;margin-right:8px;';
      btn.addEventListener('click', () => {
        const panel = document.getElementById('diplo-panel');
        if (panel) panel.classList.toggle('show');
      });
      headerRight.insertBefore(btn, headerRight.firstChild);
    }
  },

  // ── World History screen ────────────────────────────────────
  _buildHistoryScreen() {
    if (document.getElementById('history-screen')) return;
    const screen = document.createElement('div');
    screen.id = 'history-screen';
    screen.className = 'screen aeon-history';
    screen.innerHTML = `
      <div class="history-inner">
        <div class="history-head">
          <h1>World History</h1>
          <div>
            <button id="history-clear" class="secondary-btn" type="button">Clear</button>
            <button id="history-back" class="secondary-btn" type="button">‹ Menu</button>
          </div>
        </div>
        <div class="history-list" id="history-list"></div>
      </div>`;
    document.body.appendChild(screen);
    screen.querySelector('#history-back').addEventListener('click', () => {
      showScreen('menu-screen');
    });
    screen.querySelector('#history-clear').addEventListener('click', () => {
      if (typeof LegacySystem !== 'undefined') LegacySystem.clearHistory();
      this._openHistory();
      this._refreshMenuState();
    });
  },

  _openHistory() {
    if (typeof LegacySystem === 'undefined') return;
    LegacySystem.renderWorldHistory(document.getElementById('history-list'));
    showScreen('history-screen');
  },
};

if (typeof window !== 'undefined') {
  window.AeonMenu = AeonMenu;
}
