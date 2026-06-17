// ============================================================
// AEON :: CRISIS EVENT SYSTEM  (Feature 2 engine)
// Self-contained. Hooks into year advancement via CrisisSystem.checkYear(),
// which the main loop calls after each tick. When an event fires it pauses
// the sim and shows a full-screen modal; the sim resumes only once a choice
// is made (aeonResumeSim()).
//
// Determinism: on a multiplayer replay (or with no player civ) events
// auto-resolve via the shared seeded RNG instead of opening a modal, so both
// players see an identical run. With crises disabled, this module does nothing.
// ============================================================

const CrisisSystem = {
  active: false,
  interval: 75,
  lastFireYear: -9999,
  firedEvents: null,      // Set of event ids
  crisisHistory: null,    // [{ eventId, choiceIndex, year, flag }]
  armed: null,            // { eventId: armYear } for triggeredBy chains
  injected: null,         // [{ event, eligibleYear, expireYear }] from Diplomacy
  _modalOpen: false,
  _pending: null,         // { event, year } currently shown

  // Chain aliases: any of these flags arms the keyed follow-up event.
  _chainAlias: {
    hero_returns: ['hero_warrior', 'hero_sage', 'hero_freed'],
  },

  init() {
    this.interval = gameConfig.crisisInterval || 75;
    this.lastFireYear = 0;
    this.firedEvents = new Set();
    this.crisisHistory = [];
    this.armed = {};
    this.injected = [];
    this._modalOpen = false;
    this._pending = null;
    // Active only when enabled, a library is present, and this is not a
    // deterministic multiplayer replay (choices aren't encoded in the shared
    // seed, so interactive crises would desync the two players).
    this.active = !!gameConfig.crisisEnabled && typeof CRISIS_EVENTS !== 'undefined'
                  && !aeonIsDeterministicRun();
  },

  // Called after each simulated year. Returns true if a modal opened (the
  // caller must then pause the sim until aeonResumeSim() fires).
  checkYear(year) {
    if (!this.active || this._modalOpen) return false;

    const scale = aeonYearScale();
    const eff = Math.max(10, Math.round(this.interval * scale));
    if (year - this.lastFireYear < eff) return false;

    const eligible = this._eligibleEvents(year, scale);
    if (!eligible.length) return false;

    // Time-sensitive narrative (armed chains + diplomacy-injected) jumps the
    // queue so follow-ups reliably land instead of being crowded out.
    const priority = eligible.filter(e => e.triggeredBy || e._injected);
    const pool = priority.length ? priority : eligible;
    const ev = this._rng().pick(pool);
    return this.fire(ev, year);
  },

  _eligibleEvents(year, scale) {
    const out = [];
    for (const ev of CRISIS_EVENTS) {
      if (this.firedEvents.has(ev.id)) continue;
      if (year < ev.minYear * scale || year > ev.maxYear * scale) continue;
      if (ev.triggeredBy) {
        const armY = this.armed[ev.id];
        if (armY === undefined || year < armY) continue;
      }
      out.push(ev);
    }
    // Diplomacy-injected dynamic crises (grudge wars, betrayals, renegotiations).
    for (const inj of this.injected) {
      if (this.firedEvents.has(inj.event.id)) continue;
      if (year < inj.eligibleYear) continue;
      if (inj.expireYear && year > inj.expireYear) continue;
      out.push(inj.event);
    }
    return out;
  },

  // Fire an event. Returns true if it opened a modal (pause), false otherwise.
  fire(ev, year) {
    this.firedEvents.add(ev.id);
    this.lastFireYear = year;

    const player = aeonPlayerCiv();
    if (!player || aeonIsDeterministicRun()) {
      const idx = this._autoChoiceIndex(ev);
      this.resolve(ev, idx, year, true);
      return false;
    }
    this._openModal(ev, year);
    return true;
  },

  _autoChoiceIndex(ev) {
    // Deterministic auto-pick (multiplayer / spectator). Uses the shared RNG.
    return this._rng().int(0, ev.choices.length - 1);
  },

  // Apply a chosen outcome to the player civ + record history + arm chains.
  resolve(ev, idx, year, auto) {
    const choice = ev.choices[idx] || ev.choices[0];
    const player = aeonPlayerCiv();
    if (player) applyCrisisEffect(player, choice.effect);

    if (choice.effect && choice.effect.relationship !== undefined &&
        typeof Diplomacy !== 'undefined' && Diplomacy.active) {
      Diplomacy.applyCrisisRelationship(choice.effect.relationship, ev, year);
    }

    const flag = (choice.effect && choice.effect.flag) || null;
    this.crisisHistory.push({ eventId: ev.id, choiceIndex: idx, year, flag });
    if (flag) this._armChains(flag, year);
    if (choice.downstream) this._injectDownstream(choice.downstream, year);

    // Let other systems react to the resolved choice (e.g. Diplomacy grudges).
    if (typeof Diplomacy !== 'undefined' && Diplomacy.active && Diplomacy.onCrisisResolved) {
      Diplomacy.onCrisisResolved(ev, choice, year);
    }

    if (player && typeof logEvent === 'function') {
      logEvent(player.side, year, `${ev.title} — ${choice.label}`, 'major');
      if (typeof Game !== 'undefined' && Game.timeline) Game.timeline.addEvent(year, 'major', player.side);
    }
    if (typeof updateAllPanels === 'function') updateAllPanels();
  },

  _armChains(flag, year) {
    const scale = aeonYearScale();
    for (const ev of CRISIS_EVENTS) {
      if (!ev.triggeredBy || this.firedEvents.has(ev.id) || this.armed[ev.id] !== undefined) continue;
      const alias = this._chainAlias[ev.id];
      const match = ev.triggeredBy === flag || (alias && alias.includes(flag));
      if (!match) continue;
      const delay = this._rng().int(100, 200);
      this.armed[ev.id] = year + Math.round(delay * scale);
    }
  },

  // Public: Diplomacy (and downstream text) push dynamic crises here.
  inject(event, eligibleYear, expireYear) {
    if (!this.active || !event || !event.id) return;
    if (this.firedEvents.has(event.id)) return;
    if (this.injected.some(i => i.event.id === event.id)) return;
    event._injected = true;
    this.injected.push({ event, eligibleYear: eligibleYear || 0, expireYear: expireYear || 0 });
  },

  _injectDownstream(text, year) {
    const scale = aeonYearScale();
    const id = 'downstream_' + year + '_' + Math.floor(this._rng().next() * 1e6);
    this.inject({
      id, title: 'Echoes of a Past Decision',
      flavor: text,
      choices: [{ label: 'So it goes', hint: 'Acknowledge the consequence', effect: {} }],
    }, year + Math.round(this._rng().int(40, 90) * scale));
  },

  _rng() {
    if (typeof Game !== 'undefined' && Game._aeonRng) return Game._aeonRng;
    // Fallback (should not happen in a real run): a fresh deterministic RNG.
    if (!this._fallbackRng) this._fallbackRng = new RNG(0xC2151);
    return this._fallbackRng;
  },

  // ── Modal UI ────────────────────────────────────────────────
  _ensureModal() {
    let el = document.getElementById('crisis-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'crisis-overlay';
    el.className = 'crisis-overlay';
    el.innerHTML = `
      <div class="crisis-card" role="dialog" aria-modal="true">
        <div class="crisis-year">YEAR <span id="crisis-year-num">0</span></div>
        <h2 class="crisis-title" id="crisis-title"></h2>
        <p class="crisis-flavor" id="crisis-flavor"></p>
        <div class="crisis-choices" id="crisis-choices"></div>
      </div>`;
    document.body.appendChild(el);
    return el;
  },

  _openModal(ev, year) {
    this._modalOpen = true;
    this._pending = { event: ev, year };
    const el = this._ensureModal();
    el.querySelector('#crisis-year-num').textContent = year;
    el.querySelector('#crisis-title').textContent = ev.title;
    el.querySelector('#crisis-flavor').textContent = ev.flavor || '';
    const choicesEl = el.querySelector('#crisis-choices');
    choicesEl.innerHTML = '';
    ev.choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crisis-choice';
      btn.innerHTML = `<span class="cc-label">${escapeHtml(choice.label)}</span>` +
                      `<span class="cc-hint">${escapeHtml(choice.hint || '')}</span>`;
      btn.addEventListener('click', () => this._choose(idx));
      choicesEl.appendChild(btn);
    });
    el.classList.add('show');
    if (typeof Sfx !== 'undefined' && Sfx.ageUp) { try { Sfx.ageUp(); } catch (_) {} }
  },

  _choose(idx) {
    if (!this._pending) return;
    const { event, year } = this._pending;
    this.resolve(event, idx, year, false);
    this._closeModal();
    if (typeof aeonResumeSim === 'function') aeonResumeSim();
  },

  _closeModal() {
    const el = document.getElementById('crisis-overlay');
    if (el) el.classList.remove('show');
    this._modalOpen = false;
    this._pending = null;
  },
};

// Apply a crisis effect object to a civ, using the existing state fields only.
function applyCrisisEffect(civ, effect) {
  if (!civ || !effect) return;
  const clampStat = (v) => Math.max(0, Math.min(200, v));

  if (effect.population) civ.population = Math.max(10, Math.floor(civ.population * (1 + effect.population)));
  if (effect.military)   civ.army       = Math.max(0, Math.floor(civ.army * (1 + effect.military)));
  if (effect.knowledge)  civ.knowledge  = Math.max(0, civ.knowledge * (1 + effect.knowledge));

  if (effect.resources) {
    const m = 1 + effect.resources;
    civ.gold  = Math.max(0, civ.gold  * m);
    civ.food  = Math.max(0, civ.food  * m);
    civ.metal = Math.max(0, civ.metal * m);
    civ.wood  = Math.max(0, civ.wood  * m);
    if (effect.resources > 0) civ.wealth = (civ.wealth || 0) + civ.gold * effect.resources;
  }

  if (effect.loyalty) {
    if (typeof effect.loyalty.civilian === 'number') civ.stability = clampStat(civ.stability + effect.loyalty.civilian);
    if (typeof effect.loyalty.military === 'number') civ.morale    = clampStat(civ.morale + effect.loyalty.military);
  }
  if (typeof effect.morale === 'number')    civ.morale    = clampStat(civ.morale + effect.morale);
  if (typeof effect.stability === 'number') civ.stability = clampStat(civ.stability + effect.stability);
}

if (typeof window !== 'undefined') {
  window.CrisisSystem = CrisisSystem;
  window.applyCrisisEffect = applyCrisisEffect;
}
