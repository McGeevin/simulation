// ============================================================
// AEON :: IMPERIAL CAMPAIGN  ("Ascendant Conqueror")
// A 10-round ladder. The player picks ONE civilization and keeps it for the
// whole campaign, fighting a fixed roster of progressively stronger REAL builds
// (from the full balance sweep — see campaignLibrary.js). Win a round → climb;
// lose any round → the ascent ends and you begin again from the first.
//
// Built entirely on top of the existing flow: each round configures the setup
// screen (player = Side A, scripted rival = Side B) and calls the unchanged
// startSim(). The only core hook is a single outcome callback in finishGame().
// With this file (or campaignLibrary.js) absent, the Campaign button stays
// disabled and nothing else changes.
// ============================================================

const CampaignSystem = {
  KEY: 'aeon_campaign',
  state: null,            // { horizon, player, round, playerPower, inProgress }
  _setupMode: false,
  _pending: null,         // { round, won } awaiting the interstitial
  _wired: false,

  init() {
    this.load();
    this._ensureScreen();
    this._wireStartIntercept();
  },

  available() {
    return typeof CAMPAIGN_ARC !== 'undefined' && typeof CAMPAIGN_LADDERS !== 'undefined';
  },
  inProgress() { return !!(this.state && this.state.inProgress); },
  isActive() { return !!(typeof gameConfig !== 'undefined' && gameConfig.mode === 'campaign' && this.inProgress()); },

  // ── persistence ─────────────────────────────────────────────
  load() {
    try { const raw = localStorage.getItem(this.KEY); this.state = raw ? JSON.parse(raw) : null; }
    catch (_) { this.state = null; }
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (_) {} },
  clearProgress() { this.state = null; try { localStorage.removeItem(this.KEY); } catch (_) {} },

  // ── data helpers ────────────────────────────────────────────
  ladder() { return CAMPAIGN_LADDERS[this.state.horizon] || CAMPAIGN_LADDERS[1000]; },
  enemy(round) { return this.ladder()[round - 1]; },
  beat(round) { return CAMPAIGN_ARC[round - 1]; },
  totalRounds() { return CAMPAIGN_ARC.length; },

  _fill(str, enemy, beat) {
    const r = RACES[enemy.race], b = BIOMES[enemy.biome], f = FOCUSES[enemy.focus], g = GOVERNMENTS[enemy.gov];
    const d = (typeof DOCTRINES !== 'undefined' && beat && DOCTRINES[beat.doctrine]) ? DOCTRINES[beat.doctrine] : null;
    return String(str)
      .replace(/\{people\}/g, r ? r.name : enemy.race)
      .replace(/\{land\}/g, b ? b.name : enemy.biome)
      .replace(/\{focus\}/g, f ? f.name : enemy.focus)
      .replace(/\{gov\}/g, g ? g.name : enemy.gov)
      .replace(/\{doctrine\}/g, d ? d.name : 'inscrutable');
  },

  rivalName(round) {
    const e = this.enemy(round), b = this.beat(round);
    const r = RACES[e.race], biome = BIOMES[e.biome];
    return `${b.title} — ${r ? r.name : e.race} of the ${biome ? biome.name : e.biome}`;
  },

  // ── outlook (forecast) ──────────────────────────────────────
  _ratio(round) {
    const p = this.state && this.state.playerPower;
    const e = this.enemy(round).power;
    if (!p || !e) return null;
    return p / e;
  },
  _outlook(ratio) {
    if (ratio == null) return { label: 'Unknown', cls: 'ok' };
    if (ratio >= 1.5) return { label: 'Favored', cls: 'good' };
    if (ratio >= 1.0) return { label: 'Even', cls: 'good' };
    if (ratio >= 0.6) return { label: 'Grim', cls: 'warn' };
    if (ratio >= 0.3) return { label: 'Dire', cls: 'bad' };
    return { label: 'All but hopeless', cls: 'bad' };
  },

  // ── live build-power measurement (matches the balance-sweep method) ─
  _weaponAllowed(race, focusKey, w) {
    if (w.requires) {
      if (w.requires.race && !w.requires.race.includes(race)) return false;
      if (w.requires.focus && !w.requires.focus.includes(focusKey)) return false;
      if (w.requires.focusOr && !w.requires.focusOr.includes(focusKey)) return false;
    }
    return true;
  },
  _bestWeaponAt(civ) {
    let best = null, bestF = 0;
    for (const wk of Object.keys(WEAPONS)) {
      const w = WEAPONS[wk];
      if (!this._weaponAllowed(civ.race, civ.focus, w)) continue;
      if (!weaponUnlockMet(civ, w)) continue;
      const f = weaponPowerFactor(w);
      if (f > bestF) { bestF = f; best = wk; }
    }
    return best;
  },
  // Run the player's build solo to the horizon under the same conditions as the
  // sweep (analytic territory, settlements stubbed) and return intrinsic power.
  measurePower(config, horizon) {
    const saveU = (typeof window !== 'undefined') ? window.updateSettlements : null;
    const saveE = (typeof window !== 'undefined') ? window.expandTerritory : null;
    try {
      window.updateSettlements = function () {};
      window.expandTerritory = function (map, civ, amt) {
        amt = Math.min(amt, 40);
        const room = Math.max(0, 4000 - civ.territory);
        return new Array(Math.min(amt, room));
      };
      const world = { disasterChance: 0.015, startingTech: 'stone', interaction: 'isolated', maxYear: horizon, players: 1 };
      const rng = new RNG(987654321);
      const map = { width: 90, height: 60, tiles: [] };
      const civ = createCiv({ name: config.name || 'You', color: config.color || '#4a90e2', race: config.race, focus: config.focus, government: config.government, weapon: null, biome: config.biome }, 'A', world, rng);
      civ.weapon = null;
      const noop = () => {};
      for (let y = 1; y <= horizon; y++) tickYear(civ, y, world, map, [], noop);
      const bw = this._bestWeaponAt(civ);
      civ.weapon = bw; civ.weaponUnlocked = !!bw;
      const atk = battlePowerBreakdown(civ, false, {}).final;
      return Math.round(atk);
    } catch (e) {
      console.warn('Campaign forecast failed:', e);
      return 0;
    } finally {
      if (saveU) window.updateSettlements = saveU;
      if (saveE) window.expandTerritory = saveE;
    }
  },

  // ── screen plumbing ─────────────────────────────────────────
  _ensureScreen() {
    if (document.getElementById('campaign-screen')) return;
    const s = document.createElement('div');
    s.id = 'campaign-screen';
    s.className = 'screen aeon-campaign';
    s.innerHTML = `<div class="campaign-inner" id="campaign-inner"></div>`;
    document.body.appendChild(s);
    s.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cact]');
      if (!btn) return;
      const act = btn.dataset.cact;
      if (act === 'pick-horizon') { this._selHorizon = parseInt(btn.dataset.h); this._renderIntro(); }
      else if (act === 'to-setup') this._toSetup(this._selHorizon || 1000);
      else if (act === 'resume') this._renderOverview();
      else if (act === 'new-campaign') { this.clearProgress(); this._selHorizon = null; this._renderIntro(); }
      else if (act === 'begin-round') this._renderBriefing(this.state.round);
      else if (act === 'march') this._launchRound(this.state.round);
      else if (act === 'overview') this._renderOverview();
      else if (act === 'advance') { this._applyPending(); this._renderOverview(); }
      else if (act === 'retry') { this._restartCampaign(); }
      else if (act === 'abandon') { this._abandon(); }
      else if (act === 'menu') { this._toMenu(); }
    });
  },

  _show() { showScreen('campaign-screen'); },
  _render(html) { const el = document.getElementById('campaign-inner'); if (el) el.innerHTML = html; this._show(); },

  // ── entry from the main menu ────────────────────────────────
  open() {
    if (!this.available()) return;
    this.load();
    this._selHorizon = this.state ? this.state.horizon : null;
    if (this.inProgress()) this._renderResumeOrNew();
    else this._renderIntro();
  },

  _renderResumeOrNew() {
    const st = this.state;
    const noteSet = (typeof CAMPAIGN_HORIZON_NOTES !== 'undefined') ? CAMPAIGN_HORIZON_NOTES[st.horizon] : null;
    this._render(`
      <h1 class="campaign-title">${escapeHtml(CAMPAIGN_PREMISE.title)}</h1>
      <div class="campaign-resume">
        <p>A campaign is in progress — <strong>${noteSet ? escapeHtml(noteSet.label) : st.horizon + ' years'}</strong>,
        on <strong>Round ${st.round}</strong> of ${this.totalRounds()} as the
        <strong>${escapeHtml(RACES[st.player.race] ? RACES[st.player.race].name : st.player.race)}</strong>.</p>
        <div class="campaign-actions">
          <button class="menu-btn" data-cact="resume">▶ Resume Campaign</button>
          <button class="menu-btn" data-cact="new-campaign">＋ New Campaign</button>
          <button class="menu-back" data-cact="menu">‹ Menu</button>
        </div>
      </div>`);
  },

  _renderIntro() {
    const notes = (typeof CAMPAIGN_HORIZON_NOTES !== 'undefined') ? CAMPAIGN_HORIZON_NOTES : {};
    const sel = this._selHorizon;
    const cards = Object.keys(notes).map(h => {
      const n = notes[h];
      const active = String(sel) === String(h) ? ' active' : '';
      return `<button class="campaign-hcard${active} tone-${n.tone}" data-cact="pick-horizon" data-h="${h}">
        <span class="hc-label">${escapeHtml(n.label)}</span>
        <span class="hc-note">${escapeHtml(n.note)}</span>
      </button>`;
    }).join('');
    const canProceed = sel != null;
    this._render(`
      <h1 class="campaign-title">${escapeHtml(CAMPAIGN_PREMISE.title)}</h1>
      <p class="campaign-premise">${escapeHtml(CAMPAIGN_PREMISE.body).replace(/\n\n/g, '</p><p class="campaign-premise">')}</p>
      <h3 class="campaign-h3">Choose the Age of your campaign</h3>
      <p class="campaign-sub">The length is fixed for the whole campaign. Your ten foes are the strongest builds measured at that depth — so the deeper the age, the more monstrous the climb.</p>
      <div class="campaign-horizons">${cards}</div>
      <div class="campaign-actions">
        <button class="menu-btn ${canProceed ? '' : 'disabled'}" data-cact="${canProceed ? 'to-setup' : ''}" ${canProceed ? '' : 'disabled'}>Choose Your Civilization ▶</button>
        <button class="menu-back" data-cact="menu">‹ Menu</button>
      </div>`);
  },

  // ── setup-screen campaign mode ──────────────────────────────
  _toSetup(horizon) {
    this._pendingHorizon = horizon;
    this._enterSetupMode(horizon);
    const menu = document.getElementById('menu-screen');
    if (menu) menu.classList.remove('active');
    showScreen('setup-screen');
  },

  _enterSetupMode(horizon) {
    this._setupMode = true;
    document.body.classList.add('campaign-setup');
    // Force 2 players.
    const pc = document.getElementById('player-count');
    if (pc) {
      pc.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.players === '2'));
      const grid = document.querySelector('.setup-grid'); if (grid) grid.classList.remove('three-player');
      const panelC = document.querySelector('.civ-config[data-side="C"]'); if (panelC) panelC.style.display = 'none';
    }
    // Lock world length to the chosen horizon.
    const len = document.getElementById('world-length');
    if (len) { len.value = String(horizon); len.disabled = true; }
    // Force Play As = A, and hide the Players + Play-As labels (single side).
    const playAs = document.getElementById('play-as');
    if (playAs) playAs.value = 'A';
    this._pcLabel = pc ? pc.closest('label') : null;
    if (this._pcLabel) this._pcLabel.style.display = 'none';
    this._paLabel = playAs ? playAs.closest('label') : null;
    if (this._paLabel) this._paLabel.style.display = 'none';
    // Relabel start.
    const start = document.getElementById('start-btn');
    if (start) { this._startLabel = start.textContent; start.textContent = 'BEGIN ASCENT ▶'; }
    // Banner.
    if (!document.getElementById('campaign-setup-banner')) {
      const setup = document.getElementById('setup-screen');
      const grid = setup ? setup.querySelector('.setup-grid') : null;
      if (grid) {
        const banner = document.createElement('div');
        banner.id = 'campaign-setup-banner';
        banner.className = 'campaign-setup-banner';
        const note = (typeof CAMPAIGN_HORIZON_NOTES !== 'undefined') ? CAMPAIGN_HORIZON_NOTES[horizon] : null;
        banner.innerHTML = `⚔ <strong>Imperial Campaign</strong> — ${note ? escapeHtml(note.label) : horizon + ' years'}. Forge the civilization you will lead through all ten rounds. <button type="button" data-cact-back="1" class="campaign-cancel">Cancel</button>`;
        grid.parentNode.insertBefore(banner, grid);
        banner.querySelector('[data-cact-back]').addEventListener('click', () => this._cancelSetup());
      }
    }
  },

  _exitSetupMode() {
    this._setupMode = false;
    document.body.classList.remove('campaign-setup');
    const len = document.getElementById('world-length'); if (len) len.disabled = false;
    const start = document.getElementById('start-btn'); if (start && this._startLabel) start.textContent = this._startLabel;
    const banner = document.getElementById('campaign-setup-banner'); if (banner) banner.remove();
    if (this._pcLabel) { this._pcLabel.style.display = ''; this._pcLabel = null; }
    if (this._paLabel) { this._paLabel.style.display = ''; this._paLabel = null; }
  },

  _cancelSetup() {
    this._exitSetupMode();
    const menu = document.getElementById('menu-screen');
    if (typeof AeonMenu !== 'undefined' && menu) { AeonMenu._refreshMenuState && AeonMenu._refreshMenuState(); showScreen('menu-screen'); }
  },

  // Capture-phase intercept so BEGIN ASCENT runs the campaign, not a normal sim.
  _wireStartIntercept() {
    if (this._wired) return;
    const start = document.getElementById('start-btn');
    if (!start) return;
    start.addEventListener('click', (e) => {
      if (this._setupMode) { e.stopImmediatePropagation(); e.preventDefault(); this.begin(); }
    }, true);
    this._wired = true;
  },

  // ── begin a fresh campaign from the configured Side A ───────
  begin() {
    const cfg = (typeof readConfig === 'function') ? readConfig() : null;
    if (!cfg || !cfg.A) return;
    // Reuse the base validation (alerts on invalid race/focus/weapon combos).
    if (typeof validateConfig === 'function' && !validateConfig(cfg.A)) return;

    const horizon = this._pendingHorizon || 1000;
    const power = this.measurePower(cfg.A, horizon);
    this.state = {
      horizon,
      player: { name: cfg.A.name, color: cfg.A.color, race: cfg.A.race, focus: cfg.A.focus, government: cfg.A.government, weapon: cfg.A.weapon, biome: cfg.A.biome },
      round: 1,
      playerPower: power,
      wins: 0,
      inProgress: true,
    };
    this.save();
    this._exitSetupMode();
    this._renderOverview();
  },

  _restartCampaign() {
    if (!this.state) return;
    this.state.round = 1;
    this.state.wins = 0;
    this.state.inProgress = true;
    this.save();
    this._pending = null;
    this._renderOverview();
  },

  _abandon() {
    this.clearProgress();
    this._toMenu();
  },

  _toMenu() {
    this._exitSetupMode();
    // Campaign forces some options off in memory for its rounds; restore the
    // player's saved Options when leaving so Sandbox/Ironman are unaffected.
    if (typeof loadGameConfig === 'function') loadGameConfig();
    if (typeof gameConfig !== 'undefined') gameConfig.mode = 'sandbox';
    const menu = document.getElementById('menu-screen');
    if (typeof AeonMenu !== 'undefined' && AeonMenu._refreshMenuState) AeonMenu._refreshMenuState();
    if (menu) showScreen('menu-screen'); else showScreen('setup-screen');
  },

  // ── the campaign overview / ladder ──────────────────────────
  _renderOverview() {
    if (!this.inProgress()) { this._renderIntro(); return; }
    const st = this.state;
    const pr = RACES[st.player.race] ? RACES[st.player.race].name : st.player.race;
    const pf = FOCUSES[st.player.focus] ? FOCUSES[st.player.focus].name : st.player.focus;
    const pg = GOVERNMENTS[st.player.government] ? GOVERNMENTS[st.player.government].name : st.player.government;

    let rows = '';
    for (let n = 1; n <= this.totalRounds(); n++) {
      const e = this.enemy(n), b = this.beat(n);
      const done = n < st.round;
      const current = n === st.round;
      const ratio = this._ratio(n);
      const ol = this._outlook(ratio);
      const stateCls = done ? 'done' : current ? 'current' : 'locked';
      rows += `<div class="campaign-rung ${stateCls}">
        <div class="cr-num">${done ? '✔' : n}</div>
        <div class="cr-main">
          <div class="cr-title">${escapeHtml(b.title)} <span class="cr-people">${escapeHtml(RACES[e.race] ? RACES[e.race].name : e.race)} · ${escapeHtml(FOCUSES[e.focus] ? FOCUSES[e.focus].name : e.focus)}</span></div>
          <div class="cr-act">${escapeHtml(b.act)}</div>
        </div>
        <div class="cr-outlook ${ol.cls}">${done ? 'Conquered' : ol.label}</div>
      </div>`;
    }

    const note = (typeof CAMPAIGN_HORIZON_NOTES !== 'undefined') ? CAMPAIGN_HORIZON_NOTES[st.horizon] : null;
    this._render(`
      <h1 class="campaign-title">The Ascent</h1>
      <div class="campaign-playercard">
        <span class="pc-swatch" style="background:${escapeHtml(st.player.color || '#4a90e2')}"></span>
        <div>
          <div class="pc-name">${escapeHtml(st.player.name || 'Your Empire')}</div>
          <div class="pc-sub">${escapeHtml(pr)} · ${escapeHtml(pf)} · ${escapeHtml(pg)} &nbsp;|&nbsp; ${note ? escapeHtml(note.label) : st.horizon + ' yrs'}</div>
          <div class="pc-power">Measured power at this age: <strong>${formatNum(st.playerPower)}</strong></div>
        </div>
      </div>
      <div class="campaign-ladder">${rows}</div>
      <div class="campaign-actions">
        <button class="menu-btn" data-cact="begin-round">⚔ Begin Round ${st.round}: ${escapeHtml(this.beat(st.round).title)}</button>
        <button class="menu-back" data-cact="abandon">✖ Abandon Campaign</button>
      </div>`);
  },

  // ── per-round briefing ──────────────────────────────────────
  _renderBriefing(round) {
    const e = this.enemy(round), b = this.beat(round);
    const ratio = this._ratio(round), ol = this._outlook(ratio);
    const doc = (typeof DOCTRINES !== 'undefined' && DOCTRINES[b.doctrine]) ? DOCTRINES[b.doctrine] : null;
    this._render(`
      <div class="campaign-briefing">
        <div class="cb-round">ROUND ${round} OF ${this.totalRounds()} · ${escapeHtml(b.act)}</div>
        <h1 class="campaign-title">${escapeHtml(b.title)}</h1>
        <div class="cb-people">${escapeHtml(RACES[e.race] ? RACES[e.race].name : e.race)} of the ${escapeHtml(BIOMES[e.biome] ? BIOMES[e.biome].name : e.biome)}
          · ${escapeHtml(FOCUSES[e.focus] ? FOCUSES[e.focus].name : e.focus)} · ${escapeHtml(GOVERNMENTS[e.gov] ? GOVERNMENTS[e.gov].name : e.gov)}${doc ? ' · ' + escapeHtml(doc.name) : ''}</div>
        <p class="cb-bio">${escapeHtml(this._fill(b.bio, e, b))}</p>
        <p class="cb-taunt">${escapeHtml(b.taunt)}</p>
        <div class="cb-forecast ${ol.cls}">
          <span>War council forecast</span>
          <strong>${ol.label}</strong>
          <small>Your power ${formatNum(this.state.playerPower)} vs their measured ${formatNum(e.power)}</small>
        </div>
        <div class="campaign-actions">
          <button class="menu-btn" data-cact="march">⚔ March to War ▶</button>
          <button class="menu-back" data-cact="overview">‹ The Ascent</button>
        </div>
      </div>`);
  },

  // ── launch a round: configure setup DOM + start the sim ─────
  _launchRound(round) {
    const st = this.state;
    const e = this.enemy(round), b = this.beat(round);

    // Player = Side A (re-apply stored build each round for consistency).
    this._applySide('A', st.player);
    // Rival = Side B.
    this._applySide('B', { name: this.beat(round).title, color: '#c0432f', race: e.race, focus: e.focus, government: e.gov, weapon: e.weapon, biome: e.biome });

    // 2 players, fixed length, deterministic per-round seed.
    const pc = document.getElementById('player-count');
    if (pc) pc.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.players === '2'));
    const panelC = document.querySelector('.civ-config[data-side="C"]'); if (panelC) panelC.style.display = 'none';
    const len = document.getElementById('world-length'); if (len) { len.disabled = false; len.value = String(st.horizon); }
    const seedEl = document.getElementById('world-seed'); if (seedEl) seedEl.value = String(1000 + round * 37 + st.horizon);
    const interEl = document.getElementById('world-interaction'); if (interEl) interEl.value = 'contested';
    const playAs = document.getElementById('play-as'); if (playAs) playAs.value = 'A';

    // Campaign rules: the scripted rival IS the climax — no Convergence; no
    // Ironman (the campaign owns restart); no crisis interruptions; the rival
    // takes this round's doctrine personality.
    if (typeof gameConfig !== 'undefined') {
      gameConfig.mode = 'campaign';
      gameConfig.playerSide = 'A';
      gameConfig.convergenceEnabled = false;
      gameConfig.ironman = false;
      gameConfig.crisisEnabled = false;
      gameConfig.antagonistDoctrine = b.doctrine;
    }

    this._exitSetupMode();
    // Hand off to the unchanged start path.
    if (typeof startSim === 'function') startSim();
  },

  _applySide(side, cfg) {
    const panel = document.querySelector(`.civ-config[data-side="${side}"]`);
    if (!panel) return;
    const set = (field, val) => { const el = panel.querySelector(`[data-field="${field}"]`); if (el != null && val != null) el.value = val; };
    set('name', cfg.name); set('color', cfg.color); set('race', cfg.race);
    set('focus', cfg.focus); set('government', cfg.government); set('weapon', cfg.weapon); set('biome', cfg.biome);
  },

  // ── round outcome (called from finishGame) ──────────────────
  onRoundEnd(outcome) {
    if (!this.isActive() || !outcome) return;
    const playerCiv = (typeof Game !== 'undefined') ? Game.civA : null;
    const won = !!(playerCiv && outcome.winner === playerCiv);
    this._pending = { round: this.state.round, won };
    // Swap the aftermath's "NEW SIMULATION" for a campaign continue button.
    this._installAftermathButton(won);
  },

  _installAftermathButton(won) {
    const orig = document.getElementById('new-game-btn');
    if (!orig) return;
    orig.style.display = 'none';
    let btn = document.getElementById('campaign-continue-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'campaign-continue-btn';
      orig.parentNode.insertBefore(btn, orig.nextSibling);
      btn.addEventListener('click', () => this._afterAftermath());
    }
    btn.style.display = '';
    const last = this.state.round >= this.totalRounds();
    btn.textContent = won ? (last ? '👑 Claim the World ▶' : '▶ Continue the Ascent') : '↺ The Ascent Ends — Continue';
  },

  _restoreAftermathButton() {
    const orig = document.getElementById('new-game-btn'); if (orig) orig.style.display = '';
    const btn = document.getElementById('campaign-continue-btn'); if (btn) btn.style.display = 'none';
  },

  _afterAftermath() {
    this._restoreAftermathButton();
    const won = this._pending ? this._pending.won : false;
    this._renderInterstitial(won);
  },

  _applyPending() {
    if (!this._pending) return;
    if (this._pending.won) { this.state.wins++; this.state.round++; }
    if (this.state.round > this.totalRounds()) this.state.inProgress = false;
    this.save();
    this._pending = null;
  },

  _renderInterstitial(won) {
    const round = this._pending ? this._pending.round : this.state.round;
    const e = this.enemy(round), b = this.beat(round);
    const last = round >= this.totalRounds();
    if (won && last) { this._applyPending(); this._renderTriumph(); return; }

    if (won) {
      this.state._previewNext = round + 1;
      this._render(`
        <div class="campaign-interstitial win">
          <div class="ci-tag">ROUND ${round} WON</div>
          <h1 class="campaign-title">${escapeHtml(b.title)} Falls</h1>
          <p class="ci-line">${escapeHtml(this._fill(b.defeat, e, b))}</p>
          <div class="campaign-actions">
            <button class="menu-btn" data-cact="advance">▶ Advance to Round ${round + 1}</button>
            <button class="menu-back" data-cact="abandon">✖ Abandon</button>
          </div>
        </div>`);
    } else {
      this._render(`
        <div class="campaign-interstitial lose">
          <div class="ci-tag bad">DEFEAT · ROUND ${round}</div>
          <h1 class="campaign-title">The Ascent Ends</h1>
          <p class="ci-line">${escapeHtml(this._fill(b.victory, e, b))}</p>
          <p class="ci-sub">You reached <strong>Round ${round}</strong> of ${this.totalRounds()}. The throne of the world remains unclaimed — begin the ascent anew.</p>
          <div class="campaign-actions">
            <button class="menu-btn" data-cact="retry">↺ Begin the Ascent Again</button>
            <button class="menu-back" data-cact="abandon">✖ Abandon to Menu</button>
          </div>
        </div>`);
    }
  },

  _renderTriumph() {
    const st = this.state;
    const note = (typeof CAMPAIGN_HORIZON_NOTES !== 'undefined') ? CAMPAIGN_HORIZON_NOTES[st.horizon] : null;
    const pr = RACES[st.player.race] ? RACES[st.player.race].name : st.player.race;
    // Mark complete; keep a trophy flag for the menu.
    this.state.inProgress = false;
    this.state.completed = true;
    this.save();
    this._render(`
      <div class="campaign-triumph">
        <div class="ct-crown">👑</div>
        <h1 class="campaign-title gold">The World Is Yours</h1>
        <p class="ct-line">The Eternal Hegemon has fallen. After ten ruined empires, the ${escapeHtml(pr)} stand alone atop a world that answers to one throne — yours.</p>
        <p class="ct-sub">Imperial Campaign complete · ${note ? escapeHtml(note.label) : st.horizon + ' years'} · all ${this.totalRounds()} powers subjugated.</p>
        <div class="campaign-actions">
          <button class="menu-btn" data-cact="new-campaign">⚔ A New Ascent</button>
          <button class="menu-back" data-cact="menu">‹ Menu</button>
        </div>
      </div>`);
  },
};

if (typeof window !== 'undefined') {
  window.CampaignSystem = CampaignSystem;
}
