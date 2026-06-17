// ============================================================
// AEON :: DIPLOMACY WITH MEMORY  (Feature 4)
// Rivals remember what the player does. Tracks, per rival (relative to the
// player civ): relationshipScore, grievances, debts, an alliance + loyalty
// meter, and a trade deal. Grudge wars, alliance betrayals and trade-deal
// renegotiations are surfaced as Crisis events via CrisisSystem.inject().
//
// `simple` depth = relationship tracking + panel only.
// `full`   depth = the above plus grudge wars / betrayals / renegotiations.
// Disabled / absent → no effect on the base sim.
// ============================================================

const Diplomacy = {
  active: false,
  full: false,
  records: null,     // { side: { side, name, score, grievances[], debts[], alliance, loyaltyMeter, tradeDeal, grudgeWarred } }
  _lastTick: 0,

  init(civs) {
    this.records = {};
    this.full = gameConfig.diplomacyDepth === 'full';
    this.active = !!civs && civs.length > 0 && gameConfig.diplomacyDepth !== 'off';
    if (!this.active) return;
    for (const c of aeonRivals()) {
      this.records[c.side] = {
        side: c.side, name: c.name, civ: c,
        score: 0,
        grievances: [],
        debts: [],
        alliance: null,            // { type, terms, expiresYear }
        loyaltyMeter: 50,          // only meaningful while allied
        tradeDeal: null,           // { startYear, lifespan, expiresYear }
        grudgeWarred: false,
        _betrayalWarned: false,
      };
    }
    this._lastTick = 0;
    this.renderPanel();
  },

  rec(side) { return this.records ? this.records[side] : null; },
  _rng() { return (typeof Game !== 'undefined' && Game._aeonRng) ? Game._aeonRng : new RNG(0xD1717); },

  // ── Relationship / memory mutation ──────────────────────────
  adjust(side, delta, reason, year) {
    const r = this.rec(side);
    if (!r) return;
    r.score = Math.max(-100, Math.min(100, r.score + delta));
    if (delta <= -8) {
      r.grievances.push({ event: reason || 'an offense', year: year || 0, severity: Math.min(3, Math.ceil(-delta / 10)), resolved: false });
    } else if (delta >= 8) {
      r.debts.push({ event: reason || 'a kindness', year: year || 0, magnitude: Math.min(3, Math.ceil(delta / 10)) });
    }
  },

  // Relationship spec from a crisis choice: a number (→ primary antagonist)
  // or an object keyed by side.
  applyCrisisRelationship(spec, ev, year) {
    if (typeof spec === 'number') {
      const side = (typeof Game !== 'undefined' && Game._antagonistSide) || (aeonRivals()[0] || {}).side;
      if (side) this.adjust(side, spec, ev ? ev.title : 'a decision', year);
    } else if (spec && typeof spec === 'object') {
      for (const side of Object.keys(spec)) this.adjust(side, spec[side], ev ? ev.title : 'a decision', year);
    }
    this.renderPanel();
  },

  // React to specific resolved crises (flags from the library + injected events).
  onCrisisResolved(ev, choice, year) {
    const flag = choice.effect && choice.effect.flag;
    if (!flag) { this.renderPanel(); return; }

    // Dynamic (injected) diplomacy events carry their own target + resolution.
    if (ev._diplo) {
      const r = this.rec(ev._diplo.side);
      if (r) {
        if (flag === 'grudge_settled') {
          for (const g of r.grievances) g.resolved = true;
          r.grudgeWarred = false;
        } else if (flag === 'grudge_fought') {
          r.grudgeWarred = true;          // pure military "win" — next grudge comes faster
          r._grudgeFollowupFast = true;
        } else if (flag === 'alliance_saved') {
          r.loyaltyMeter = Math.min(100, r.loyaltyMeter + 35);
        } else if (flag === 'alliance_broken') {
          r.alliance = null; r.loyaltyMeter = 0;
        } else if (flag === 'deal_renewed') {
          this._formTradeDeal(r, year);
        } else if (flag === 'deal_ended') {
          r.tradeDeal = null;
        }
      }
    }
    this.renderPanel();
  },

  // ── Yearly maintenance: form ties, age grudges, fire diplomacy crises ──
  tickYear(year) {
    if (!this.active) return;
    if (year - this._lastTick < 5) return;   // light cadence
    this._lastTick = year;
    const scale = aeonYearScale();

    for (const r of Object.values(this.records)) {
      // Auto-form alliances / trade deals as the relationship warms.
      if (this.full) {
        if (!r.alliance && r.score >= 35) {
          r.alliance = { type: 'Mutual Defense', terms: 'aid in war', expiresYear: 0 };
          r.loyaltyMeter = 55;
        }
        if (!r.tradeDeal && r.score >= 15) this._formTradeDeal(r, year);
      }

      // Alliance loyalty drift from grievances, power gap and a mercantile world.
      if (r.alliance) {
        const unresolved = r.grievances.filter(g => !g.resolved).length;
        let drift = -unresolved * 0.6;
        drift += (r.score - 30) * 0.05;
        if (this._playerOutpowers(r.civ)) drift -= 0.8;     // you've become a threat
        if (this._mercantileRivalExists(r.side)) drift -= 0.4; // a better offer looms
        r.loyaltyMeter = Math.max(0, Math.min(100, r.loyaltyMeter + drift));
      }

      if (!this.full) continue;

      // Grudge war: a severe, unresolved grievance left to fester for 150+ yrs.
      const severe = r.grievances.find(g => !g.resolved && g.severity >= 2);
      const grudgeAge = severe ? (year - severe.year) : 0;
      const grudgeThreshold = (r._grudgeFollowupFast ? 75 : 150) * scale;
      if (severe && grudgeAge >= grudgeThreshold && !r.grudgeWarred && this._canInject()) {
        CrisisSystem.inject(this._buildGrudgeWar(r, severe, year), year);
        r.grudgeWarred = true;
      }

      // Alliance betrayal: loyalty collapse → warning, then betrayal.
      if (r.alliance && r.loyaltyMeter < 25 && !r._betrayalWarned && this._canInject()) {
        CrisisSystem.inject(this._buildBetrayalWarning(r, year), year);
        r._betrayalWarned = true;
      } else if (r.alliance && r.loyaltyMeter <= 0 && r._betrayalWarned && this._canInject()) {
        CrisisSystem.inject(this._buildBetrayal(r, year), year);
      }

      // Trade-deal expiration → renegotiation.
      if (r.tradeDeal && r.tradeDeal.expiresYear && year >= r.tradeDeal.expiresYear && this._canInject()) {
        CrisisSystem.inject(this._buildRenegotiation(r, year), year);
        r.tradeDeal.expiresYear = 0;   // avoid re-firing until renewed
      }
    }
    this.renderPanel();
  },

  _formTradeDeal(r, year) {
    const lifespan = this._rng().chance(0.5) ? 50 : 100;
    r.tradeDeal = { startYear: year, lifespan, expiresYear: year + Math.round(lifespan * aeonYearScale()) };
  },

  _canInject() {
    return typeof CrisisSystem !== 'undefined' && CrisisSystem.active && !aeonIsDeterministicRun();
  },

  _playerOutpowers(rivalCiv) {
    const p = aeonPlayerCiv();
    if (!p || !rivalCiv) return false;
    return (p.army * (p.weaponTechLevel || 1)) > (rivalCiv.army * (rivalCiv.weaponTechLevel || 1)) * 1.6;
  },

  _mercantileRivalExists(excludeSide) {
    return aeonRivals().some(c => c.side !== excludeSide && c.doctrine === 'mercantile');
  },

  // ── Injected diplomacy crises ───────────────────────────────
  _buildGrudgeWar(r, grievance, year) {
    return {
      id: 'grudge_' + r.side + '_' + year,
      title: 'A Grudge Comes Due',
      _diplo: { side: r.side, kind: 'grudge' },
      flavor: `${r.name} has never forgotten ${grievance.event} (Year ${grievance.year}). A generation raised on that wound now marches for vengeance. Their envoy offers one path to peace — or none at all.`,
      choices: [
        { label: 'Make amends', hint: 'Costly reparations end the grudge', effect: { resources: -0.20, flag: 'grudge_settled' } },
        { label: 'Send a peace envoy', hint: 'Swallow pride; mend the wound', effect: { loyalty: { civilian: -4 }, flag: 'grudge_settled' } },
        { label: 'Meet them in the field', hint: 'Win now — the hatred only deepens', effect: { military: -0.08, loyalty: { military: 8 }, flag: 'grudge_fought' } },
      ],
    };
  },

  _buildBetrayalWarning(r, year) {
    return {
      id: 'betraywarn_' + r.side + '_' + year,
      title: 'A Cooling Friendship',
      _diplo: { side: r.side, kind: 'warning' },
      flavor: `${r.name}'s ambassador has been unusually cold of late, and the gifts have stopped. Your spymaster suspects the alliance is fraying. There may still be time to shore it up.`,
      choices: [
        { label: 'Reaffirm the alliance', hint: 'Lavish gifts restore their trust', effect: { resources: -0.15, flag: 'alliance_saved' } },
        { label: 'Demand a show of loyalty', hint: 'Risky — pride cuts both ways', effect: { loyalty: { military: 6 } } },
        { label: 'Do nothing', hint: 'Hope it passes', effect: {} },
      ],
    };
  },

  _buildBetrayal(r, year) {
    return {
      id: 'betray_' + r.side + '_' + year,
      title: 'The Betrayal',
      _diplo: { side: r.side, kind: 'betrayal' },
      flavor: `It is done. ${r.name} has torn up the old alliance and thrown in with your enemies. The borders you left undefended are suddenly a liability.`,
      choices: [
        { label: 'Fortify the border', hint: 'Brace for the inevitable', effect: { military: 0.10, resources: -0.10, flag: 'alliance_broken' } },
        { label: 'Buy back loyalty', hint: 'One last, desperate bribe', effect: { resources: -0.25, flag: 'alliance_broken' } },
        { label: 'Strike first', hint: 'Pre-empt the new coalition', effect: { military: -0.06, loyalty: { military: 8 }, flag: 'alliance_broken' } },
      ],
    };
  },

  _buildRenegotiation(r, year) {
    const strong = this._playerOutpowers(r.civ);
    return {
      id: 'renego_' + r.side + '_' + year,
      title: 'The Trade Pact Expires',
      _diplo: { side: r.side, kind: 'trade' },
      flavor: `Your long-standing trade pact with ${r.name} has run its term. ${strong ? 'You now bargain from a position of strength.' : 'They sense your need and drive a harder bargain.'} The terms are open again — and either side may walk away.`,
      choices: [
        { label: strong ? 'Dictate new terms' : 'Accept their terms', hint: 'Keep the gold flowing', effect: { resources: strong ? 0.10 : -0.05, flag: 'deal_renewed' } },
        { label: 'Hold firm', hint: 'Gamble for a better deal', effect: { resources: strong ? 0.04 : -0.10, flag: 'deal_renewed' } },
        { label: 'Walk away', hint: 'End the pact; cool relations', effect: { flag: 'deal_ended' } },
      ],
    };
  },

  // ── Read helpers for the Convergence warnings ───────────────
  stanceLine(side) {
    const r = this.rec(side);
    if (!r) return '';
    const stance = (typeof AiDoctrines !== 'undefined') ? AiDoctrines.describeStance(r.civ, r.score) : '';
    return `${r.name} (${stance})`;
  },
  alliesOf() { return Object.values(this.records || {}).filter(r => r.alliance && r.loyaltyMeter > 25); },
  enemiesOf() { return Object.values(this.records || {}).filter(r => r.score <= -20); },

  // ── Diplomacy panel (injected, toggled during the sim) ──────
  renderPanel() {
    const panel = document.getElementById('diplo-panel');
    if (!panel) return;
    if (!this.active || !this.records) { panel.innerHTML = ''; return; }
    let html = '<h3>Diplomacy</h3>';
    const recs = Object.values(this.records);
    if (!recs.length) { panel.innerHTML = html + '<p class="diplo-empty">No rivals.</p>'; return; }
    for (const r of recs) {
      const stance = (typeof AiDoctrines !== 'undefined') ? AiDoctrines.describeStance(r.civ, r.score) : '';
      const pct = Math.round((r.score + 100) / 2);
      const grv = r.grievances.filter(g => !g.resolved);
      html += `<div class="diplo-row">
        <div class="diplo-name" style="color:${escapeHtml(r.civ.color)}">${escapeHtml(r.name)}</div>
        <div class="diplo-stance">${escapeHtml(stance)}</div>
        <div class="diplo-bar"><span style="width:${pct}%"></span></div>
        <div class="diplo-detail">
          ${r.alliance ? `<span class="diplo-tag ally">Allied · loyalty ${Math.round(r.loyaltyMeter)}</span>` : ''}
          ${r.tradeDeal ? `<span class="diplo-tag trade">Trade pact</span>` : ''}
          ${grv.length ? `<span class="diplo-tag grv">${grv.length} grievance${grv.length > 1 ? 's' : ''}</span>` : ''}
          ${r.debts.length ? `<span class="diplo-tag debt">${r.debts.length} debt${r.debts.length > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>`;
    }
    panel.innerHTML = html;
  },
};

if (typeof window !== 'undefined') {
  window.Diplomacy = Diplomacy;
}
