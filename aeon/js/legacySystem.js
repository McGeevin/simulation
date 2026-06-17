// ============================================================
// AEON :: LEGACY / IRONMAN  (Feature 6)
// • Ironman: no reload, run ends on the player's destruction, and every run
//   end writes a Chronicle to localStorage (aeon_chronicles).
// • Legacy World: a new game carries forward the marks of past runs — ruins
//   data on the map, extinct/Remnant races, and a cultural-memory bias that
//   nudges new rivals' opening stance toward the player (mercy → goodwill,
//   brutality → fear).
//
// All carry-forward effects are applied via the NEW systems / post-create
// hooks only — the base race, map and sim code is never modified.
// ============================================================

const LegacySystem = {
  CHRON_KEY: 'aeon_chronicles',
  legacyWorld: null,    // derived view of the past (extinct races, memory, ruins)

  init() {
    this.legacyWorld = this.deriveLegacyWorld();
  },

  isIronman() { return !!gameConfig.ironman; },

  // ── Chronicle storage ───────────────────────────────────────
  getChronicles() {
    try {
      const raw = localStorage.getItem(this.CHRON_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  },

  _saveChronicles(arr) {
    try { localStorage.setItem(this.CHRON_KEY, JSON.stringify(arr.slice(-50))); } catch (_) {}
  },

  // Build + persist a Chronicle when a run ends. `outcome` is Game.battleOutcome.
  finalize(outcome) {
    if (!outcome) return null;
    const player = aeonPlayerCiv();
    const won = player && outcome.winner === player;
    const years = (typeof Game !== 'undefined') ? Game.maxYear : 1000;

    // Key crisis choices made.
    const hist = (typeof CrisisSystem !== 'undefined' && CrisisSystem.crisisHistory) ? CrisisSystem.crisisHistory : [];
    const keyChoices = hist.slice(-8).map(h => {
      const ev = (typeof CRISIS_EVENTS !== 'undefined') ? CRISIS_EVENTS.find(e => e.id === h.eventId) : null;
      const label = ev && ev.choices[h.choiceIndex] ? ev.choices[h.choiceIndex].label : (h.flag || 'a fateful choice');
      return { year: h.year, event: ev ? ev.title : h.eventId, choice: label };
    });

    // Rival fates.
    const rivals = aeonRivals().map(r => {
      const rec = (typeof Diplomacy !== 'undefined' && Diplomacy.rec) ? Diplomacy.rec(r.side) : null;
      let fate = 'survived';
      if (won) fate = 'defeated';
      else if (player && outcome.winner === r) fate = 'conqueror';
      else if (rec && rec.alliance) fate = 'allied';
      return { name: r.name, race: r.race, fate };
    });

    const mercy = (typeof Game !== 'undefined' && Game._convergenceMercy) ? Game._convergenceMercy : null;
    const convergence = (typeof Game !== 'undefined' && Game._convergenceChronicle) ? Game._convergenceChronicle.phases : [];

    const chronicle = {
      date: new Date().toISOString(),
      seed: (typeof Game !== 'undefined' && Game.config) ? Game.config.world.seed : 0,
      years,
      playerSide: gameConfig.playerSide,
      playerName: player ? player.name : '—',
      race: player ? player.race : null,
      raceName: player ? player.raceData.name : '—',
      focus: player ? player.focusData.name : '—',
      outcome: won ? 'victory' : 'defeat',
      mercy,
      ironman: this.isIronman(),
      keyChoices, rivals, convergence,
      epitaph: this._epitaph(player, won, mercy, years),
    };

    const all = this.getChronicles();
    all.push(chronicle);
    this._saveChronicles(all);
    this.legacyWorld = this.deriveLegacyWorld();
    return chronicle;
  },

  _epitaph(player, won, mercy, years) {
    const name = player ? player.name : 'A forgotten people';
    if (won && mercy === 'merciful')  return `${name} conquered the world, and was remembered for sparing it.`;
    if (won && mercy === 'brutal')    return `${name} ground every rival to dust, and ruled a world that feared the name.`;
    if (won)                          return `${name} stood alone at the end of the age, victorious over all.`;
    if (mercy === 'defiant')          return `${name} fell at the Convergence, but went down fighting — and is sung of still.`;
    if (mercy === 'pragmatic')        return `${name} bent the knee to survive, its golden age behind it.`;
    return `${name} rose, strove, and was swept away by the tide of history.`;
  },

  // ── Legacy world derivation ─────────────────────────────────
  deriveLegacyWorld() {
    const chron = this.getChronicles();
    if (!chron.length) return null;

    // Races that ended on the losing side become Remnant.
    const remnant = new Set();
    for (const c of chron) {
      for (const r of c.rivals) if (r.fate === 'defeated' && r.race) remnant.add(r.race);
      if (c.outcome === 'defeat' && c.race) remnant.add(c.race);
    }

    // Cultural memory: the tone of the most recent run, intensified by streaks.
    const last = chron[chron.length - 1];
    let tone = 'neutral', magnitude = 0;
    if (last.mercy === 'merciful' || last.mercy === 'pragmatic') { tone = 'merciful'; }
    else if (last.mercy === 'brutal') { tone = 'brutal'; }
    if (tone !== 'neutral') {
      magnitude = chron.filter(c =>
        (tone === 'merciful' && (c.mercy === 'merciful' || c.mercy === 'pragmatic')) ||
        (tone === 'brutal' && c.mercy === 'brutal')).length;
    }

    // Ruins: one marker per past run, placed in that run's player region.
    const ruins = chron.slice(-6).map((c, i) => ({ race: c.race, raceName: c.raceName, name: c.playerName, side: c.playerSide }));

    return { remnant, culturalMemory: { tone, magnitude }, ruins, runCount: chron.length };
  },

  isRemnantRace(raceKey) {
    return !!(this.legacyWorld && this.legacyWorld.remnant && this.legacyWorld.remnant.has(raceKey));
  },

  // ── Carry-forward into a new game (called from startSim hook) ─
  applyToNewGame(map, civs) {
    if (!this.legacyWorld) return;

    // 1. Ruins — data only (drop markers near each former capital region).
    //    On-map *rendering* would require a renderer hook, deliberately left
    //    out to honour the read-only-rendering constraint; the data is here
    //    and surfaced in World History.
    if (map && map.tiles) {
      map._legacyRuins = [];
      const W = map.width, H = map.height;
      for (const ruin of this.legacyWorld.ruins) {
        const band = ruin.side === 'A' ? 0.18 : ruin.side === 'C' ? 0.82 : 0.5;
        const rx = Math.max(0, Math.min(W - 1, Math.round(W * band)));
        const ry = Math.max(0, Math.min(H - 1, Math.round(H * 0.5)));
        const t = map.tiles[ry] && map.tiles[ry][rx];
        if (t) t.ruin = true;
        map._legacyRuins.push({ x: rx, y: ry, race: ruin.race, name: ruin.name });
      }
    }

    // 2. Remnant races — lightly reduced starting strength (a temp effect on
    //    the civ object, never a change to the base RACES data).
    for (const c of civs) {
      if (this.isRemnantRace(c.race)) {
        c.isRemnant = true;
        c.population = Math.max(20, Math.floor(c.population * 0.85));
        c.army = Math.max(1, Math.floor(c.army * 0.85));
        c.morale = Math.max(0, c.morale - 8);
      }
    }
  },

  // Cultural-memory bias on a rival's opening relationship (read by Diplomacy).
  culturalOpeningBias() {
    if (!this.legacyWorld) return 0;
    const m = this.legacyWorld.culturalMemory;
    if (!m || m.tone === 'neutral') return 0;
    const mag = Math.min(4, m.magnitude);
    // Mercy → goodwill (positive); brutality → fear (negative opening, but
    // rivals are also warier of provoking you — handled in Diplomacy stance).
    return m.tone === 'merciful' ? 6 * mag : -6 * mag;
  },

  // ── Ironman enforcement during a run ────────────────────────
  enforceRunStart() {
    const back = document.getElementById('back-to-setup');
    const existing = document.getElementById('ironman-indicator');
    if (!this.isIronman()) {
      // Not ironman → make sure any prior run's restrictions are lifted.
      if (back) back.style.display = '';
      if (existing) existing.remove();
      return;
    }
    // No bailing to setup mid-run.
    if (back) back.style.display = 'none';
    if (!existing) {
      const badge = document.createElement('div');
      badge.id = 'ironman-indicator';
      badge.className = 'ironman-indicator';
      badge.textContent = '🛡 IRONMAN';
      const hc = document.querySelector('.header-center');
      if (hc) hc.appendChild(badge);
    }
  },

  // ── World History screen (chronological list of chronicles) ─
  renderWorldHistory(targetEl) {
    if (!targetEl) return;
    const chron = this.getChronicles();
    if (!chron.length) {
      targetEl.innerHTML = '<p class="wh-empty">No chronicles yet. Complete a run to begin your world\'s history.</p>';
      return;
    }
    let html = '';
    chron.slice().reverse().forEach((c, i) => {
      const n = chron.length - i;
      const choices = (c.keyChoices || []).map(k => `<li><span class="wh-y">Y${k.year}</span> ${escapeHtml(k.event)} — <em>${escapeHtml(k.choice)}</em></li>`).join('');
      const rivals = (c.rivals || []).map(r => `${escapeHtml(r.name)} <span class="wh-fate ${r.fate}">${r.fate}</span>`).join(' · ');
      html += `<div class="wh-entry ${c.outcome}">
        <div class="wh-head"><span class="wh-num">Chronicle ${n}</span>
          <span class="wh-outcome ${c.outcome}">${c.outcome.toUpperCase()}</span></div>
        <div class="wh-title">${escapeHtml(c.playerName)} — ${escapeHtml(c.raceName)} · ${escapeHtml(c.focus)} · ${c.years} years</div>
        <div class="wh-epitaph">“${escapeHtml(c.epitaph)}”</div>
        ${rivals ? `<div class="wh-rivals">${rivals}</div>` : ''}
        ${choices ? `<details class="wh-choices"><summary>Key decisions</summary><ul>${choices}</ul></details>` : ''}
      </div>`;
    });
    targetEl.innerHTML = html;
  },

  clearHistory() {
    try { localStorage.removeItem(this.CHRON_KEY); } catch (_) {}
    this.legacyWorld = null;
  },
};

if (typeof window !== 'undefined') {
  window.LegacySystem = LegacySystem;
}
