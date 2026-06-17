// ============================================================
// AEON :: THE CONVERGENCE  (Feature 5)
// A 300-year buildup (scaled to run length) culminating in a 3-phase final
// battle. Announcement at 70% of the run, warnings every 5% after, a
// readiness-vs-stability allocation choice every 2.5%, then Coalition Wars →
// Champion's Duel → Last Stand at the end.
//
// The phases adjust the PLAYER civ's existing state (army / morale) and then
// hand off to the unchanged battle resolution + visualizer, so the result is
// still explainable on the aftermath screen. A chronicle is recorded for the
// Legacy system.
//
// Disabled (or in a deterministic multiplayer replay) → the original final
// battle runs untouched.
// ============================================================

const ConvergenceSystem = {
  active: false,
  announced: false,
  announceYear: 700,
  warningYears: null,    // Set
  allocYears: null,      // Set
  firedWarnings: null,
  firedAllocs: null,
  readiness: 50,         // Military Readiness   (0..100)
  stability: 50,         // Civilian Stability   (0..100)
  _modalOpen: false,
  chronicle: null,       // accumulates phase notes for the Legacy system

  init() {
    const maxY = (typeof Game !== 'undefined' && Game.maxYear) ? Game.maxYear : 1000;
    this.active = !!gameConfig.convergenceEnabled && !aeonIsDeterministicRun() && !!aeonPlayerCiv();
    this.announced = false;
    this.announceYear = Math.round(maxY * 0.70);
    this.readiness = 50;
    this.stability = 50;
    this._modalOpen = false;
    this.chronicle = { phases: [], allocations: 0 };

    // Warnings at 75/80/85/90/95%; allocations every 2.5% from 70%.
    this.warningYears = new Set([0.75, 0.80, 0.85, 0.90, 0.95].map(f => Math.round(maxY * f)));
    this.allocYears = new Set();
    for (let f = 0.725; f < 1.0; f += 0.025) this.allocYears.add(Math.round(maxY * f));
    this.firedWarnings = new Set();
    this.firedAllocs = new Set();
  },

  _rng() { return (typeof Game !== 'undefined' && Game._aeonRng) ? Game._aeonRng : new RNG(0xC04E5); },

  // Called each simulated year. Returns true if a modal opened (pause).
  checkYear(year) {
    if (!this.active || this._modalOpen) return false;

    if (!this.announced && year >= this.announceYear) {
      this.announced = true;
      this._buildHud();
      this._announce(year);
      return true;
    }
    if (!this.announced) return false;

    this._updateHud(year);

    if (this.warningYears.has(year) && !this.firedWarnings.has(year)) {
      this.firedWarnings.add(year);
      this._warning(year);
      return true;
    }
    // Find an allocation year at/just past now that hasn't fired.
    for (const ay of this.allocYears) {
      if (year >= ay && !this.firedAllocs.has(ay)) {
        this.firedAllocs.add(ay);
        this._allocation(year);
        return true;
      }
    }
    return false;
  },

  // ── Buildup modals ──────────────────────────────────────────
  _announce(year) {
    const remaining = (typeof Game !== 'undefined' ? Game.maxYear : 1000) - year;
    this._modal({
      cls: 'convergence-announce',
      year, title: 'THE CONVERGENCE',
      flavor: `A dread certainty settles over every nation at once: the world is bending toward a final reckoning. In ${remaining} years the powers of this age will converge in one last war, and only one will remain. There is no avoiding it now — only preparing.`,
      choices: [{ label: 'So it begins', hint: 'The countdown starts', effect: {} }],
    }, () => aeonResumeSim());
  },

  _warning(year) {
    const rivals = aeonRivals();
    const rng = this._rng();
    const lines = rivals.slice(0, 2).map(r => {
      const stance = (typeof AiDoctrines !== 'undefined') ? AiDoctrines.describeStance(r, this._relScore(r.side)) : r.name;
      const act = (typeof AiDoctrines !== 'undefined') ? AiDoctrines.prepActivity(r, rng) : 'is mustering for war';
      return `${r.name} (${stance}) ${act}.`;
    });
    const remaining = (typeof Game !== 'undefined' ? Game.maxYear : 1000) - year;
    this._modal({
      cls: 'convergence-warn',
      year, title: 'Convergence Warning',
      flavor: `${remaining} years remain. Your spies report on the gathering storm:\n\n${lines.join('\n')}`,
      choices: [
        { label: 'Sabotage a rival', hint: 'Set a rival back — and harden their hatred', effect: { _conv: 'sabotage' } },
        { label: 'Court an ally', hint: 'Spend gold to win a friend for the end', effect: { _conv: 'ally' } },
        { label: 'Accelerate your own war machine', hint: 'Readiness up, stability down', effect: { _conv: 'arm' } },
      ],
    }, (idx, choice) => { this._applyWarningChoice(choice, year); aeonResumeSim(); });
  },

  _applyWarningChoice(choice, year) {
    const kind = choice.effect && choice.effect._conv;
    const rivals = aeonRivals();
    const rng = this._rng();
    if (kind === 'sabotage' && rivals.length && typeof Diplomacy !== 'undefined' && Diplomacy.active) {
      const target = rng.pick(rivals);
      Diplomacy.adjust(target.side, -12, 'a Convergence-eve sabotage', year);
      target.army = Math.max(0, Math.floor(target.army * 0.90));
    } else if (kind === 'ally' && rivals.length && typeof Diplomacy !== 'undefined' && Diplomacy.active) {
      const target = rng.pick(rivals);
      Diplomacy.adjust(target.side, 18, 'a last-minute alliance', year);
      const p = aeonPlayerCiv(); if (p) p.gold = Math.max(0, p.gold * 0.85);
    } else if (kind === 'arm') {
      this.readiness = Math.min(100, this.readiness + 12);
      this.stability = Math.max(0, this.stability - 8);
    }
    this._updateHud(year);
  },

  _allocation(year) {
    this.chronicle.allocations++;
    this._modal({
      cls: 'convergence-alloc',
      year, title: 'Where Goes the Surplus?',
      flavor: `Another year's surplus is gathered. The generals and the governors both have their hands out. Readiness ${Math.round(this.readiness)} · Stability ${Math.round(this.stability)}.`,
      choices: [
        { label: 'To the legions', hint: 'Military readiness ↑, civilian stability ↓', effect: { _alloc: 'mil' } },
        { label: 'To the people', hint: 'Civilian stability ↑, readiness ↓', effect: { _alloc: 'civ' } },
        { label: 'Split it evenly', hint: 'A little of both', effect: { _alloc: 'bal' } },
      ],
    }, (idx, choice) => { this._applyAllocation(choice, year); aeonResumeSim(); });
  },

  _applyAllocation(choice, year) {
    const a = choice.effect && choice.effect._alloc;
    const p = aeonPlayerCiv();
    if (a === 'mil') {
      this.readiness = Math.min(100, this.readiness + 10);
      this.stability = Math.max(0, this.stability - 7);
      if (p) p.morale = Math.min(200, p.morale + 4);
    } else if (a === 'civ') {
      this.stability = Math.min(100, this.stability + 10);
      this.readiness = Math.max(0, this.readiness - 7);
      if (p) p.stability = Math.min(200, p.stability + 4);
    } else {
      this.readiness = Math.min(100, this.readiness + 3);
      this.stability = Math.min(100, this.stability + 3);
    }
    this._updateHud(year);
  },

  _relScore(side) {
    if (typeof Diplomacy !== 'undefined' && Diplomacy.rec) {
      const r = Diplomacy.rec(side);
      if (r) return r.score;
    }
    return 0;
  },

  // ── HUD: countdown + tension meter ──────────────────────────
  _buildHud() {
    if (document.getElementById('convergence-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'convergence-hud';
    hud.className = 'convergence-hud';
    hud.innerHTML = `
      <div class="cv-count">CONVERGENCE IN <span id="cv-remaining">0</span></div>
      <div class="cv-meter" title="Military readiness vs civilian stability">
        <span class="cv-mil" id="cv-mil"></span><span class="cv-civ" id="cv-civ"></span>
      </div>
      <div class="cv-meter-labels"><span>⚔ Readiness</span><span>Stability ☗</span></div>`;
    const map = document.querySelector('.map-container');
    (map || document.body).appendChild(hud);
  },

  _updateHud(year) {
    const rem = document.getElementById('cv-remaining');
    if (rem) {
      const left = Math.max(0, (typeof Game !== 'undefined' ? Game.maxYear : 1000) - year);
      rem.textContent = left + ' yrs';
    }
    const total = Math.max(1, this.readiness + this.stability);
    const mil = document.getElementById('cv-mil');
    const civ = document.getElementById('cv-civ');
    if (mil) mil.style.width = (this.readiness / total * 100) + '%';
    if (civ) civ.style.width = (this.stability / total * 100) + '%';
  },

  _removeHud() {
    const hud = document.getElementById('convergence-hud');
    if (hud) hud.remove();
  },

  // ── The 3-phase final battle ────────────────────────────────
  // `proceed` is the (unchanged) battle resolution + visualization, invoked
  // once the phases have adjusted the player civ's state and morale.
  runFinalBattle(proceed) {
    this._removeHud();
    this._proceed = proceed;
    this._playerMod = { armyMult: 1.0, moraleBonus: 0, mercy: null, heroUsed: false };
    this._phaseCoalition();
  },

  _phaseCoalition() {
    const allies = (typeof Diplomacy !== 'undefined' && Diplomacy.active) ? Diplomacy.alliesOf() : [];
    const enemies = (typeof Diplomacy !== 'undefined' && Diplomacy.active) ? Diplomacy.enemiesOf() : [];
    const allyNames = allies.map(a => a.name).join(', ') || 'no one';
    const enemyNames = enemies.map(e => e.name).join(', ') || 'the lone antagonist';
    const readyNote = this.readiness >= 60 ? 'Your war machine is honed and ready.' :
                      this.readiness <= 35 ? 'Your legions are under-prepared.' : 'Your forces are adequately mustered.';

    this._modal({
      cls: 'convergence-final phase-1',
      year: (typeof Game !== 'undefined' ? Game.maxYear : 1000),
      title: 'Phase I · The Coalition Wars',
      flavor: `The world's powers fall into line. Standing with you: ${allyNames}. Arrayed against you: ${enemyNames}. ${readyNote} The opening campaigns will decide the strength you carry into the duel of champions.`,
      choices: [
        { label: 'Concentrate your forces', hint: 'Safe — hold your strength', effect: { _p1: 'concentrate' } },
        { label: 'Bold pincer offensive', hint: 'High risk, high reward', effect: { _p1: 'bold' } },
        { label: 'Fight a defensive war', hint: 'Trade ground to preserve the army', effect: { _p1: 'defensive' } },
      ],
    }, (idx, choice) => this._resolveCoalition(choice, allies, enemies));
  },

  _resolveCoalition(choice, allies, enemies) {
    const rng = this._rng();
    const p = choice.effect._p1;
    // Base coalition strength from readiness + allies − enemies.
    let strength = (this.readiness - 50) / 100;              // -0.5..+0.5
    strength += allies.length * 0.12 - enemies.length * 0.10;
    if (p === 'bold')        strength += rng.range(-0.18, 0.30);
    else if (p === 'defensive') strength += 0.05 - rng.range(0, 0.10);
    else                     strength += rng.range(-0.05, 0.10);

    let tier, mult;
    if (strength > 0.18)      { tier = 'full strength';     mult = 1.15; }
    else if (strength > -0.12) { tier = 'reduced strength';  mult = 0.95; }
    else                       { tier = 'critical strength'; mult = 0.78; }
    this._playerMod.armyMult *= mult;
    this.chronicle.phases.push(`Coalition Wars: entered Phase II at ${tier} (${p}).`);

    // Fold loyal allies into the player's host; throw enemies behind the antagonist.
    const player = aeonPlayerCiv();
    if (player) {
      for (const a of allies) player.army += Math.floor((a.civ.army || 0) * 0.5);
    }
    const antagSide = (typeof Game !== 'undefined') ? Game._antagonistSide : null;
    const antag = antagSide && typeof Game !== 'undefined' ? Game.civs.find(c => c.side === antagSide) : null;
    if (antag) for (const e of enemies) if (e.side !== antagSide) antag.army += Math.floor((e.civ.army || 0) * 0.4);

    this._phaseDuel(tier);
  },

  _phaseDuel(tier) {
    // A champion appears if the Legendary Hero chain matured into a champion.
    const hist = (typeof CrisisSystem !== 'undefined' && CrisisSystem.crisisHistory) ? CrisisSystem.crisisHistory : [];
    const hasHero = hist.some(h => h.flag === 'hero_champion' || h.flag === 'hero_warrior');
    this._playerMod.heroUsed = hasHero;
    const lead = hasHero
      ? 'Your legend — the hero your people raised — strides out to meet the enemy champion. The songs were not exaggerations.'
      : 'You have no champion of legend; a brave but mortal general answers the enemy\'s chosen.';

    this._modal({
      cls: 'convergence-final phase-2',
      year: (typeof Game !== 'undefined' ? Game.maxYear : 1000),
      title: 'Phase II · The Champion\'s Duel',
      flavor: `${lead} Two figures meet in the no-man's-land between the hosts, and every soldier holds their breath.`,
      choices: [
        { label: 'Duel with honour', hint: hasHero ? 'Your hero is favoured' : 'A fair, uncertain fight', effect: { _p2: 'honor' } },
        { label: 'Fight dirty', hint: 'Seize any advantage', effect: { _p2: 'dirty' } },
        { label: 'Rally the army instead', hint: 'Skip the duel; steady the line', effect: { _p2: 'rally' } },
      ],
    }, (idx, choice) => this._resolveDuel(choice, hasHero));
  },

  _resolveDuel(choice, hasHero) {
    const rng = this._rng();
    const p = choice.effect._p2;
    let winChance = hasHero ? 0.68 : 0.48;
    if (p === 'dirty') winChance += 0.15;
    if (p === 'rally')  winChance = 0.5;   // no duel; neutral morale
    const won = rng.next() < winChance;

    if (p === 'rally') {
      this._playerMod.moraleBonus += 6;
      this.chronicle.phases.push('Champion\'s Duel: declined — the line was steadied instead.');
    } else if (won) {
      this._playerMod.moraleBonus += hasHero ? 28 : 18;
      this.chronicle.phases.push(`Champion's Duel: WON${hasHero ? ' by the legendary hero' : ''} — a surge of morale.`);
    } else {
      this._playerMod.moraleBonus -= 16;
      this.chronicle.phases.push('Champion\'s Duel: LOST — the host\'s heart sank.');
    }
    this._phaseLastStand();
  },

  _phaseLastStand() {
    // Project whether the player is currently winning, to pick the choice set.
    const winning = this._projectWinning();
    if (winning) {
      this._modal({
        cls: 'convergence-final phase-3 winning',
        year: (typeof Game !== 'undefined' ? Game.maxYear : 1000),
        title: 'Phase III · The Last Stand',
        flavor: 'The enemy line buckles. Victory is within your grasp — and with it, a choice about what kind of victor history will remember you as.',
        choices: [
          { label: 'Show mercy', hint: 'Spare the defeated — a gentler legacy', effect: { _p3: 'mercy' } },
          { label: 'Total domination', hint: 'Crush them utterly — a fearful legacy', effect: { _p3: 'domination' } },
          { label: 'Magnanimous terms', hint: 'Victory with dignity for all', effect: { _p3: 'terms' } },
        ],
      }, (idx, choice) => this._resolveLastStand(choice, true));
    } else {
      this._modal({
        cls: 'convergence-final phase-3 losing',
        year: (typeof Game !== 'undefined' ? Game.maxYear : 1000),
        title: 'Phase III · The Last Stand',
        flavor: 'The line is breaking and the day is all but lost. What is left is the manner of the ending — and what survives it.',
        choices: [
          { label: 'Sacrifice your champion', hint: 'A desperate gambit for survival', effect: { _p3: 'sacrifice' } },
          { label: 'Broker a surrender', hint: 'Terms — survive, diminished', effect: { _p3: 'surrender' } },
          { label: 'Go down fighting', hint: 'No surrender — a legend in defeat', effect: { _p3: 'defiance' } },
        ],
      }, (idx, choice) => this._resolveLastStand(choice, false));
    }
  },

  _resolveLastStand(choice, winning) {
    const p = choice.effect._p3;
    const player = aeonPlayerCiv();
    this._playerMod.mercy = (p === 'mercy' || p === 'terms') ? 'merciful'
                           : (p === 'domination') ? 'brutal' : null;

    if (winning) {
      this._playerMod.armyMult *= 1.05;
      this.chronicle.phases.push(`Last Stand: victorious — chose ${p}.`);
    } else {
      if (p === 'sacrifice') { this._playerMod.armyMult *= 1.18; this._playerMod.moraleBonus += 20; this.chronicle.phases.push('Last Stand: sacrificed the champion for a fighting chance.'); }
      else if (p === 'surrender') { this._playerMod.armyMult *= 0.85; this._playerMod.mercy = 'pragmatic'; this.chronicle.phases.push('Last Stand: brokered a surrender on terms.'); }
      else { this._playerMod.moraleBonus += 12; this._playerMod.mercy = 'defiant'; this.chronicle.phases.push('Last Stand: went down fighting for legend.'); }
    }

    // Apply the accumulated phase results to the player's actual state, then
    // run the unchanged battle resolution + visualization.
    if (player) {
      player.army = Math.max(1, Math.floor(player.army * this._playerMod.armyMult));
      player.morale = Math.max(0, Math.min(200, player.morale + this._playerMod.moraleBonus));
    }
    if (typeof Game !== 'undefined') {
      Game._convergenceChronicle = this.chronicle;
      Game._convergenceMercy = this._playerMod.mercy;
    }
    if (typeof this._proceed === 'function') this._proceed();
  },

  // Rough projection of whether the player would win right now.
  _projectWinning() {
    const player = aeonPlayerCiv();
    if (!player || typeof computeBattlePower !== 'function') return true;
    let myPower = computeBattlePower(player, true) * this._playerMod.armyMult;
    let best = 0;
    for (const r of aeonRivals()) best = Math.max(best, computeBattlePower(r.civ || r, false));
    return myPower >= best * 0.95;
  },

  // ── Generic modal (reused by every Convergence step) ────────
  _modal(opts, onChoose) {
    this._modalOpen = true;
    let el = document.getElementById('crisis-overlay');
    if (typeof CrisisSystem !== 'undefined' && CrisisSystem._ensureModal) el = CrisisSystem._ensureModal();
    if (!el) { // ultra-fallback: auto-pick first choice
      this._modalOpen = false; if (onChoose) onChoose(0, opts.choices[0]); return;
    }
    const card = el.querySelector('.crisis-card');
    if (card) card.className = 'crisis-card ' + (opts.cls || '');
    el.querySelector('#crisis-year-num').textContent = opts.year;
    el.querySelector('#crisis-title').textContent = opts.title;
    el.querySelector('#crisis-flavor').textContent = opts.flavor || '';
    const choicesEl = el.querySelector('#crisis-choices');
    choicesEl.innerHTML = '';
    opts.choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crisis-choice';
      btn.innerHTML = `<span class="cc-label">${escapeHtml(choice.label)}</span>` +
                      `<span class="cc-hint">${escapeHtml(choice.hint || '')}</span>`;
      btn.addEventListener('click', () => {
        this._modalOpen = false;
        el.classList.remove('show');
        if (card) card.className = 'crisis-card';
        if (onChoose) onChoose(idx, choice);
      });
      choicesEl.appendChild(btn);
    });
    el.classList.add('show');
  },
};

if (typeof window !== 'undefined') {
  window.ConvergenceSystem = ConvergenceSystem;
}
