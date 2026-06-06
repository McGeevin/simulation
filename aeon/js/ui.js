// ============================================================
// AEON :: UI
// Setup screen population, option stat-cards, stat panels,
// event logs, and the end-of-game power breakdown.
// ============================================================

const SIDE_DEFAULTS = {
  A: { race: 'humans', focus: 'science',  government: 'monarchy', weapon: 'siege', biome: 'forest' },
  B: { race: 'orcs',   focus: 'military', government: 'monarchy', weapon: 'siege', biome: 'mountain' },
  C: { race: 'dwarves', focus: 'industry', government: 'monarchy', weapon: 'siege', biome: 'highlands' },
};

function populateSelects() {
  document.querySelectorAll('.civ-config').forEach(panel => {
    const side = panel.dataset.side;
    const d = SIDE_DEFAULTS[side] || SIDE_DEFAULTS.A;
    populateSelect(panel.querySelector('[data-field="race"]'), RACES, d.race);
    populateSelect(panel.querySelector('[data-field="focus"]'), FOCUSES, d.focus);
    populateSelect(panel.querySelector('[data-field="government"]'), GOVERNMENTS, d.government);
    populateSelect(panel.querySelector('[data-field="weapon"]'), WEAPONS, d.weapon);
    populateSelect(panel.querySelector('[data-field="biome"]'), BIOMES, d.biome);

    panel.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => updateHints(panel));
    });
    updateHints(panel);
  });
  initPlayerCount();
}

// ---- 2-player / 3-player toggle ----
function initPlayerCount() {
  const seg = document.getElementById('player-count');
  if (!seg) return;
  seg.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const three = btn.dataset.players === '3';
      document.querySelector('.setup-grid').classList.toggle('three-player', three);
      const panelC = document.querySelector('.civ-config[data-side="C"]');
      if (panelC) panelC.style.display = three ? '' : 'none';
    });
  });
}

function playerCount() {
  const active = document.querySelector('#player-count button.active');
  return active && active.dataset.players === '3' ? 3 : 2;
}

function populateSelect(selectEl, source, defaultKey) {
  for (const [key, item] of Object.entries(source)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = item.name;
    opt.title = item.desc || '';   // native per-option hover hint
    if (key === defaultKey) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- stat-line construction ----
function statLineHTML(label, value) {
  const pct = Math.round((value - 1) * 100);
  if (pct === 0) return '';
  const sign = pct > 0 ? '+' : '';
  return `<span class="sl ${pct > 0 ? 'sl-good' : 'sl-bad'}">${escapeHtml(label)} <b>${sign}${pct}%</b></span>`;
}
function neutralLineHTML(label, value) {
  const pct = Math.round((value - 1) * 100);
  const sign = pct > 0 ? '+' : '';
  return `<span class="sl sl-neutral">${escapeHtml(label)} <b>${sign}${pct}%</b></span>`;
}

function modsToStatLines(mods) {
  let html = '';
  for (const [key, value] of Object.entries(mods || {})) {
    const meta = STAT_META[key];
    const label = meta ? meta.label : key;
    if (meta && meta.dir === 0) html += neutralLineHTML(label, value);
    else html += statLineHTML(label, value);
  }
  return html;
}

function biomeNames(keys) { return keys.map(k => BIOMES[k] ? BIOMES[k].name : k).join(', '); }
function raceNames(keys) { return keys.map(k => RACES[k] ? RACES[k].name : k).join(', '); }
function focusNames(keys) { return keys.map(k => FOCUSES[k] ? FOCUSES[k].name : k).join(', '); }

function combatStars(factor) {
  let n = 2;
  if (factor >= 3.2) n = 5; else if (factor >= 2.2) n = 4; else if (factor >= 1.6) n = 3;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// Build the rich card shown beneath a select.
function describeOption(field, item) {
  let stats = '';
  let extra = '';

  if (field === 'weapon') {
    const factor = weaponPowerFactor(item);
    const age = TECH_AGES[item.unlockAge] ? TECH_AGES[item.unlockAge].name : `Age ${item.unlockAge}`;
    stats += `<span class="sl sl-info">Unlocks <b>${escapeHtml(age)} Age</b></span>`;
    stats += `<span class="sl sl-power">Combat <b>×${factor.toFixed(1)}</b> <span class="stars">${combatStars(factor)}</span></span>`;
    const tags = Object.keys(item.battleMod || {})
      .map(k => BATTLE_EFFECT_LABELS[k]).filter(Boolean);
    if (tags.length) extra += `<div class="opt-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
  } else {
    stats += modsToStatLines(item.mods);
    if (field === 'race') {
      if (item.popCapMod) stats += statLineHTML('Pop. Cap', item.popCapMod);
      if (item.special === 'constructed') extra += `<div class="opt-note">⚙ Built from metal + knowledge — no food needed.</div>`;
      if (item.biomePref) extra += `<div class="opt-note">Thrives in: ${escapeHtml(biomeNames(item.biomePref))}.</div>`;
      if (item.biomePenalty) extra += `<div class="opt-note opt-warn">Suffers in: ${escapeHtml(biomeNames(Object.keys(item.biomePenalty)))}.</div>`;
    }
  }

  // Requirements
  const req = item.requires;
  if (req) {
    if (Array.isArray(req)) extra += `<div class="opt-note opt-req">Requires race: ${escapeHtml(raceNames(req))}.</div>`;
    else {
      const parts = [];
      if (req.race) parts.push('race: ' + raceNames(req.race));
      if (req.focus) parts.push('focus: ' + focusNames(req.focus));
      if (req.focusOr) parts.push('focus: ' + focusNames(req.focusOr));
      if (parts.length) extra += `<div class="opt-note opt-req">Requires ${escapeHtml(parts.join(' · '))}.</div>`;
    }
  }

  return `<div class="opt-flavor">${escapeHtml(item.flavor || item.desc || '')}</div>
          <div class="opt-stats">${stats || '<span class="sl sl-neutral">Balanced</span>'}</div>${extra}`;
}

function updateHints(panel) {
  const fields = ['race', 'focus', 'government', 'weapon', 'biome'];
  const sources = { race: RACES, focus: FOCUSES, government: GOVERNMENTS, weapon: WEAPONS, biome: BIOMES };
  for (const f of fields) {
    const select = panel.querySelector(`[data-field="${f}"]`);
    const hint = panel.querySelector(`[data-hint="${f}"]`);
    if (select && hint) {
      const item = sources[f][select.value];
      if (item) hint.innerHTML = describeOption(f, item);
    }
  }
}

function readConfig() {
  const players = playerCount();
  const config = { A: {}, B: {}, world: {} };
  if (players === 3) config.C = {};
  document.querySelectorAll('.civ-config').forEach(panel => {
    const side = panel.dataset.side;
    if (!config[side]) return;            // skip Side C when in 2-player mode
    panel.querySelectorAll('[data-field]').forEach(el => {
      config[side][el.dataset.field] = el.value;
    });
  });
  config.world.players = players;
  config.world.mapSize = document.getElementById('world-mapsize').value;
  config.world.disasters = document.getElementById('world-disasters').value;
  config.world.startingTech = document.getElementById('world-tech').value;
  config.world.interaction = document.getElementById('world-interaction').value;
  config.world.maxYear = parseInt(document.getElementById('world-length').value) || 1000;
  config.world.seed = parseInt(document.getElementById('world-seed').value) || 12345;

  const disasterMap = { none: 0, low: 0.005, normal: 0.015, high: 0.035, apocalyptic: 0.07 };
  config.world.disasterChance = disasterMap[config.world.disasters];

  return config;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function updatePanel(civ) {
  const s = civ.side;
  const nameEl = document.getElementById(`name-${s}`);
  nameEl.textContent = civ.name;
  nameEl.style.color = civ.color;
  document.getElementById(`subtitle-${s}`).textContent =
    `${civ.raceData.name} · ${civ.focusData.name} · ${civ.govData.name}`;

  setText(`${s}-pop`, formatNum(civ.population));
  setText(`${s}-army`, formatNum(civ.army));
  setText(`${s}-age`, TECH_AGES[civ.techAge].name);
  setText(`${s}-food`, formatNum(civ.food));
  setText(`${s}-metal`, formatNum(civ.metal));
  setText(`${s}-wood`, formatNum(civ.wood));
  setText(`${s}-gold`, formatNum(civ.gold));
  setText(`${s}-knowledge`, formatNum(civ.knowledge));
  setText(`${s}-faith`, formatNum(civ.faith));
  setText(`${s}-magic`, formatNum(civ.magic));
  setText(`${s}-territory`, formatNum(civ.territory));
  setText(`${s}-morale`, Math.round(civ.morale));
  setText(`${s}-stability`, Math.round(civ.stability));

  const wEl = document.getElementById(`${s}-weapon`);
  if (wEl) {
    if (civ.weapon && WEAPONS[civ.weapon]) {
      wEl.textContent = WEAPONS[civ.weapon].name + (civ.weaponUnlocked ? ' ✓' : ' (locked)');
      wEl.className = 'wstat ' + (civ.weaponUnlocked ? 'ready' : 'locked');
    } else {
      wEl.textContent = '—';
    }
  }

  // Morale / stability bars
  setBar(`${s}-morale-bar`, civ.morale);
  setBar(`${s}-stability-bar`, civ.stability);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setBar(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = Math.max(0, Math.min(100, val / 2)); // 0..200 → 0..100
  el.style.width = pct + '%';
  el.style.background = val >= 100 ? 'var(--good)' : val >= 50 ? 'var(--accent)' : 'var(--bad)';
}

function renderLegend(civs) {
  const el = document.getElementById('map-legend');
  if (!el) return;
  let rows = '';
  for (const c of civs) {
    rows += `<div class="lg-row"><span class="lg-swatch" style="background:${escapeHtml(c.color)}"></span>${escapeHtml(c.name)} <small>${escapeHtml(c.biomeData.name)}</small></div>`;
  }
  rows += `<div class="lg-row lg-cap"><span class="lg-star">★</span>Capital</div>`;
  el.innerHTML = rows;
}

function logEvent(side, year, text, tag = 'cultural') {
  const log = document.getElementById(`events-${side}`);
  const item = document.createElement('div');
  item.className = `event-item event-${tag}`;
  item.innerHTML = `<span class="event-year">Y${year}</span>${escapeHtml(text)}`;
  log.insertBefore(item, log.firstChild);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

// ============================================================
// POWER BREAKDOWN (aftermath)
// ============================================================
function renderPowerColumn(civ, breakdown, roll, luck, isWinner) {
  let rows = `<div class="pb-row pb-base"><span>Base · ${escapeHtml(breakdown.baseDetail)}</span><span>${formatNum(breakdown.base)}</span></div>`;
  for (const f of breakdown.factors) {
    const cls = f.mult >= 1 ? 'up' : 'down';
    rows += `<div class="pb-row"><span><span class="pb-mult ${cls}">×${f.mult.toFixed(2)}</span> ${escapeHtml(f.label)}<small>${escapeHtml(f.detail || '')}</small></span></div>`;
  }
  const luckPct = Math.round((luck - 1) * 100);
  const luckCls = luckPct >= 0 ? 'up' : 'down';
  rows += `<div class="pb-row pb-final"><span>Final power</span><span>${formatNum(breakdown.final)}</span></div>`;
  rows += `<div class="pb-row"><span><span class="pb-mult ${luckCls}">×${luck.toFixed(2)}</span> Fog of war (luck)</span></div>`;
  rows += `<div class="pb-row pb-roll"><span>Battle roll</span><span>${formatNum(roll)}</span></div>`;

  return `<div class="pb-col ${isWinner ? 'pb-winner' : ''}">
            <h4 style="color:${escapeHtml(civ.color)}">${escapeHtml(civ.name)} ${isWinner ? '<span class="pb-crown">WINNER</span>' : ''}</h4>
            ${rows}
          </div>`;
}

function buildPowerNarrative(o) {
  const favored = o.invPower >= o.defPower ? o.invader : o.defender;
  const upset = o.winner !== favored;
  const margin = Math.abs(o.invRoll - o.defRoll) / Math.max(o.invRoll, o.defRoll) * 100;

  const wb = o.winner === o.invader ? o.invBreakdown : o.defBreakdown;
  const lb = o.loser  === o.invader ? o.invBreakdown : o.defBreakdown;
  let top = null, loserBottom = null;
  for (const f of wb.factors) { if (!top || f.mult > top.mult) top = f; }
  for (const f of lb.factors) { if (f.mult < 1 && (!loserBottom || f.mult < loserBottom.mult)) loserBottom = f; }

  const lines = [];

  // 1. Army & tech comparison
  const invAge = TECH_AGES[o.invader.techAge];
  const defAge = TECH_AGES[o.defender.techAge];
  const techGap = Math.abs(o.invader.techAge - o.defender.techAge);
  let armyLine = `<strong>${escapeHtml(o.invader.name)}</strong> marched with ${formatNum(o.invader.army)} soldiers at the <em>${escapeHtml(invAge.name)} Age</em> (×${o.invader.weaponTechLevel.toFixed(1)} per soldier). `;
  armyLine += `<strong>${escapeHtml(o.defender.name)}</strong> fielded ${formatNum(o.defender.army)} at the <em>${escapeHtml(defAge.name)} Age</em> (×${o.defender.weaponTechLevel.toFixed(1)}).`;
  if (techGap >= 2) {
    const ahead = o.invader.techAge > o.defender.techAge ? o.invader : o.defender;
    armyLine += ` That ${techGap}-age technology gap gave <strong>${escapeHtml(ahead.name)}</strong> a decisive equipment advantage before a single blow was struck.`;
  } else if (techGap === 1) {
    const ahead = o.invader.techAge > o.defender.techAge ? o.invader : o.defender;
    armyLine += ` <strong>${escapeHtml(ahead.name)}</strong> held a one-age lead in military technology.`;
  }
  lines.push(armyLine);

  // 2. Morale & stability
  function moraleDesc(civ) {
    if (civ.morale >= 135) return `extraordinary morale (${Math.round(civ.morale)})`;
    if (civ.morale >= 100) return `solid morale (${Math.round(civ.morale)})`;
    if (civ.morale >= 70)  return `wavering morale (${Math.round(civ.morale)})`;
    return `badly shaken morale (${Math.round(civ.morale)})`;
  }
  function stabDesc(civ) {
    if (civ.stability >= 115) return `iron-fist stability (${Math.round(civ.stability)})`;
    if (civ.stability >= 85)  return `steady governance (${Math.round(civ.stability)})`;
    if (civ.stability >= 55)  return `shaky political order (${Math.round(civ.stability)})`;
    return `a state on the edge of internal collapse (${Math.round(civ.stability)})`;
  }
  lines.push(`Going into battle, <strong>${escapeHtml(o.invader.name)}</strong> had ${moraleDesc(o.invader)} and ${stabDesc(o.invader)}. <strong>${escapeHtml(o.defender.name)}</strong> had ${moraleDesc(o.defender)} and ${stabDesc(o.defender)}.`);

  // 3. Aggressor + terrain
  let contextLine = `<strong>${escapeHtml(o.invader.name)}</strong> was the aggressor (belligerence ${o.aAgg >= o.bAgg ? o.aAgg : o.bAgg} vs ${o.aAgg >= o.bAgg ? o.bAgg : o.aAgg}), pressing into <strong>${escapeHtml(o.defender.name)}</strong>'s ${escapeHtml(BIOMES[o.defender.biome].name)} homeland.`;
  if (o.defender.biome === 'mountain')  contextLine += ` The mountain peaks channeled the invaders into killing grounds.`;
  else if (o.defender.biome === 'tundra') contextLine += ` The frozen wastes sapped the attacker's momentum.`;
  else if (o.defender.biome === 'swamp') contextLine += ` Swamp chokepoints blunted the advance.`;
  else contextLine += ` Home-ground morale and supply lines favored the defenders.`;
  lines.push(contextLine);

  // 4. Special weapons
  const wLines = [];
  if (o.invader.weapon && WEAPONS[o.invader.weapon]) {
    const wn = escapeHtml(WEAPONS[o.invader.weapon].name);
    wLines.push(o.invader.weaponUnlocked
      ? `<strong>${escapeHtml(o.invader.name)}</strong> deployed the <em>${wn}</em>`
      : `<strong>${escapeHtml(o.invader.name)}</strong>'s <em>${wn}</em> was still locked when battle began`);
  }
  if (o.defender.weapon && WEAPONS[o.defender.weapon]) {
    const wn = escapeHtml(WEAPONS[o.defender.weapon].name);
    wLines.push(o.defender.weaponUnlocked
      ? `<strong>${escapeHtml(o.defender.name)}</strong> countered with the <em>${wn}</em>`
      : `<strong>${escapeHtml(o.defender.name)}</strong>'s weapon remained locked`);
  }
  if (wLines.length) lines.push(wLines.join('; ') + '.');

  // 5. Outcome
  if (upset) {
    lines.push(`On paper <strong>${escapeHtml(favored.name)}</strong> held the power edge (${formatNum(o.invPower)} vs ${formatNum(o.defPower)}), but a ${margin.toFixed(0)}% fog-of-war swing handed the day to <strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> — a genuine upset.`);
  } else if (margin < 8) {
    lines.push(`It was razor-close: <strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> edged ahead by just ${margin.toFixed(0)}% once the fog of war settled.`);
  } else {
    lines.push(`<strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> won decisively — ${margin.toFixed(0)}% clear once the fog of war resolved.`);
  }

  // 6. Key factors
  if (top && top.mult >= 1.10) {
    lines.push(`The winner's greatest battlefield edge was <strong>${escapeHtml(top.label)}</strong> (×${top.mult.toFixed(2)})${top.detail ? ' — ' + escapeHtml(top.detail) : ''}.`);
  }
  if (loserBottom && loserBottom.mult < 0.90) {
    lines.push(`The loser was most hurt by <strong>${escapeHtml(loserBottom.label)}</strong> (×${loserBottom.mult.toFixed(2)})${loserBottom.detail ? ' — ' + escapeHtml(loserBottom.detail) : ''}.`);
  }

  // 7. Casualties
  lines.push(`The victors lost roughly <strong>${(o.winnerCasualtyPct * 100).toFixed(0)}%</strong> of their army in the campaign; the defeated lost <strong>${(o.loserCasualtyPct * 100).toFixed(0)}%</strong> and their entire civilization.`);

  return lines.map(l => `<p>${l}</p>`).join('');
}

function buildPowerNarrative3(o) {
  const w = o.entries[0], second = o.entries[1], third = o.entries[2];
  const byPower = [...o.entries].sort((a, b) => b.power - a.power);
  const upset = byPower[0].civ !== o.winner;
  const margin = (w.roll - second.roll) / Math.max(1, w.roll) * 100;

  let top = null;
  for (const f of w.breakdown.factors) { if (!top || f.mult > top.mult) top = f; }

  const lines = [];

  // 1. Armies & tech for all three
  const techSummary = o.entries.map(e => {
    const age = TECH_AGES[e.civ.techAge];
    return `<strong style="color:${escapeHtml(e.civ.color)}">${escapeHtml(e.civ.name)}</strong>: ${formatNum(e.civ.army)} troops at <em>${escapeHtml(age.name)} Age</em> (×${e.civ.weaponTechLevel.toFixed(1)})`;
  }).join(' · ');
  lines.push(`Armies on the field — ${techSummary}.`);

  // 2. Tech lead if significant
  const techOrder = [...o.entries].sort((a, b) => b.civ.techAge - a.civ.techAge);
  if (techOrder[0].civ.techAge > techOrder[2].civ.techAge) {
    const gap = techOrder[0].civ.techAge - techOrder[2].civ.techAge;
    lines.push(`<strong>${escapeHtml(techOrder[0].civ.name)}</strong> held the largest technological edge — ${gap} age${gap > 1 ? 's' : ''} ahead of <strong>${escapeHtml(techOrder[2].civ.name)}</strong> — meaning each of their soldiers fought with significantly superior equipment.`);
  }

  // 3. Morale & stability snapshot
  const stateSnap = o.entries.map(e => {
    const m = Math.round(e.civ.morale), s = Math.round(e.civ.stability);
    return `<strong>${escapeHtml(e.civ.name)}</strong>: morale ${m}, stability ${s}`;
  }).join('; ');
  lines.push(`State of nations going into battle — ${stateSnap}.`);

  // 4. Power order and outcome
  lines.push(`A three-way war decided the fate of the world. On raw computed power: <strong>${escapeHtml(byPower[0].civ.name)}</strong> (${formatNum(byPower[0].power)}), <strong>${escapeHtml(byPower[1].civ.name)}</strong> (${formatNum(byPower[1].power)}), then <strong>${escapeHtml(byPower[2].civ.name)}</strong> (${formatNum(byPower[2].power)}).`);

  if (upset) {
    lines.push(`The fog of war overturned the expected result: <strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> seized victory without holding the strongest army on paper.`);
  } else if (margin < 8) {
    lines.push(`<strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> prevailed by the slimmest of margins — just ${margin.toFixed(0)}% over <strong>${escapeHtml(second.civ.name)}</strong> once the fog of war resolved.`);
  } else {
    lines.push(`<strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> won decisively, ${margin.toFixed(0)}% clear of <strong>${escapeHtml(second.civ.name)}</strong> after the dice settled.`);
  }

  // 5. Winner's top factor
  if (top && top.mult >= 1.10) {
    lines.push(`The victor's greatest battlefield edge was <strong>${escapeHtml(top.label)}</strong> (×${top.mult.toFixed(2)})${top.detail ? ' — ' + escapeHtml(top.detail) : ''}.`);
  }

  // 6. Who fell when + casualties
  lines.push(`<strong>${escapeHtml(third.civ.name)}</strong> fell first, losing ${(third.casualtyPct * 100).toFixed(0)}% of their forces; <strong>${escapeHtml(second.civ.name)}</strong> followed, losing ${(second.casualtyPct * 100).toFixed(0)}%. The victors lost roughly ${(w.casualtyPct * 100).toFixed(0)}%.`);

  return lines.map(l => `<p>${l}</p>`).join('');
}

function renderAftermathPower(outcome) {
  const el = document.getElementById('power-explainer');
  if (!el) return;

  if (outcome.threeWay) {
    const cols = outcome.entries
      .map(e => renderPowerColumn(e.civ, e.breakdown, e.roll, e.luck, e.civ === outcome.winner))
      .join('');
    el.innerHTML = `
      <h3 class="pb-title">How the battle was decided</h3>
      <div class="pb-narrative">${buildPowerNarrative3(outcome)}</div>
      <div class="pb-grid pb-grid-3">${cols}</div>
      <p class="pb-foot">Battle power = troops × tech-age arms, then multiplied by doctrine, morale, stability, terrain, fortification and any special weapon. In a three-way war the highest roll after a ±10% "fog of war" swing conquers the world.</p>
    `;
    return;
  }

  el.innerHTML = `
    <h3 class="pb-title">How the battle was decided</h3>
    <div class="pb-narrative">${buildPowerNarrative(outcome)}</div>
    <div class="pb-grid">
      ${renderPowerColumn(outcome.invader, outcome.invBreakdown, outcome.invRoll, outcome.invLuck, outcome.winner === outcome.invader)}
      ${renderPowerColumn(outcome.defender, outcome.defBreakdown, outcome.defRoll, outcome.defLuck, outcome.winner === outcome.defender)}
    </div>
    <p class="pb-foot">Battle power = troops × tech-age arms, then multiplied by doctrine, morale, stability, terrain, fortification and any special weapon. A final ±10% "fog of war" roll decides close fights.</p>
  `;
}

// ============================================================
// HOVER TOOLTIPS — a floating popup with a brief overview of the
// currently-selected option for each picker.
// ============================================================
const FIELD_SOURCES = { race: RACES, focus: FOCUSES, government: GOVERNMENTS, weapon: WEAPONS, biome: BIOMES };

function initOptionTooltips() {
  let tip = document.getElementById('opt-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'opt-tooltip';
    tip.className = 'opt-tooltip';
    document.body.appendChild(tip);
  }
  document.querySelectorAll('.civ-config select[data-field]').forEach(sel => {
    const field = sel.dataset.field;
    const build = () => {
      const item = FIELD_SOURCES[field][sel.value];
      if (!item) return;
      tip.innerHTML = `<div class="tt-title">${escapeHtml(item.name)}</div>${describeOption(field, item)}`;
    };
    sel.addEventListener('mouseenter', (e) => { build(); tip.classList.add('show'); positionTip(tip, e); });
    sel.addEventListener('mousemove', (e) => positionTip(tip, e));
    sel.addEventListener('change', build);
    sel.addEventListener('mouseleave', () => tip.classList.remove('show'));
    sel.addEventListener('blur', () => tip.classList.remove('show'));
  });
}

function positionTip(tip, e) {
  const pad = 16;
  const w = tip.offsetWidth || 300;
  const h = tip.offsetHeight || 160;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
  if (y < 8) y = 8;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

// ============================================================
// STATS SHEET — a modal codex comparing every option in a
// category, switchable via a dropdown.
// ============================================================
function initStatsSheet() {
  const modal = document.getElementById('sheet-modal');
  const cat = document.getElementById('sheet-category');
  const openBtn = document.getElementById('open-sheet');
  const closeBtn = document.getElementById('sheet-close');
  if (!modal || !cat || !openBtn) return;

  openBtn.addEventListener('click', () => { modal.classList.add('show'); renderSheet(cat.value); });
  closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
  cat.addEventListener('change', () => renderSheet(cat.value));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.remove('show'); });
}

function renderSheet(cat) {
  const el = document.getElementById('sheet-content');
  if (!el) return;
  let html, note;
  if (cat === 'race')            { html = renderMatrix(RACES, true);  note = `${Object.keys(RACES).length} races — modifiers stack with focus, government and biome.`; }
  else if (cat === 'focus')      { html = renderMatrix(FOCUSES, false); note = `${Object.keys(FOCUSES).length} focuses — your civilization's grand strategy.`; }
  else if (cat === 'government') { html = renderMatrix(GOVERNMENTS, false); note = `${Object.keys(GOVERNMENTS).length} governments — some require specific races.`; }
  else if (cat === 'biome')      { html = renderMatrix(BIOMES, false); note = `${Object.keys(BIOMES).length} biomes — your homeland's resource profile.`; }
  else if (cat === 'weapon')     { html = renderWeaponSheet(); note = `${Object.keys(WEAPONS).length} special weapons — unlocked at the listed tech age.`; }
  else if (cat === 'age')        { html = renderAgeSheet(); note = `${TECH_AGES.length} tech ages — higher ages multiply every soldier's battle power.`; }
  el.innerHTML = `<p class="sheet-note">${note}</p>${html}`;
  el.scrollTop = 0;
}

function divergeCell(value, dir) {
  const pct = Math.round((value - 1) * 100);
  if (dir === 0) return `<div class="dvcell"><span class="dv-num neu">${pct > 0 ? '+' : ''}${pct}%</span></div>`;
  const good = pct >= 0;
  const w = Math.min(100, Math.abs(pct));
  const left = good ? '' : `<span class="dv-bar bad" style="width:${w}%"></span>`;
  const right = good ? `<span class="dv-bar good" style="width:${w}%"></span>` : '';
  return `<div class="dvcell">
    <div class="dv"><span class="dv-half l">${left}</span><span class="dv-half r">${right}</span></div>
    <span class="dv-num ${good ? 'good' : 'bad'}">${pct > 0 ? '+' : ''}${pct}%</span>
  </div>`;
}

function renderMatrix(source, isRace) {
  const present = [];
  for (const key of Object.keys(STAT_META)) {
    for (const item of Object.values(source)) {
      const mods = item.mods || {};
      if (mods[key] !== undefined || (isRace && key === 'popCapMod' && item.popCapMod !== undefined)) { present.push(key); break; }
    }
  }
  let head = '<tr><th class="sticky-col">Option</th>';
  for (const k of present) head += `<th>${escapeHtml(STAT_META[k].label)}</th>`;
  head += '</tr>';

  let body = '';
  for (const item of Object.values(source)) {
    const mods = Object.assign({}, item.mods);
    if (isRace && item.popCapMod) mods.popCapMod = item.popCapMod;
    body += `<tr><td class="sticky-col"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.desc || '')}</small></td>`;
    for (const k of present) {
      if (mods[k] === undefined) { body += '<td class="dv-empty">·</td>'; continue; }
      body += `<td>${divergeCell(mods[k], STAT_META[k].dir)}</td>`;
    }
    body += '</tr>';
  }
  return `<div class="sheet-scroll"><table class="sheet-table">${head}${body}</table></div>`;
}

function renderWeaponSheet() {
  let rows = '';
  for (const w of Object.values(WEAPONS)) {
    const f = weaponPowerFactor(w);
    const age = TECH_AGES[w.unlockAge] ? TECH_AGES[w.unlockAge].name : ('Age ' + w.unlockAge);
    const tags = Object.keys(w.battleMod || {}).map(k => BATTLE_EFFECT_LABELS[k]).filter(Boolean)
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const reqParts = [];
    if (w.requires) {
      if (w.requires.race) reqParts.push('race: ' + raceNames(w.requires.race));
      if (w.requires.focusOr) reqParts.push('focus: ' + focusNames(w.requires.focusOr));
      if (w.requires.focus) reqParts.push('focus: ' + focusNames(w.requires.focus));
    }
    const barW = Math.min(100, (f / 3.6) * 100);
    rows += `<tr>
      <td class="sticky-col"><b>${escapeHtml(w.name)}</b><small>${escapeHtml(w.desc)}</small></td>
      <td>${escapeHtml(age)}</td>
      <td><div class="hbar"><span style="width:${barW}%"></span></div><span class="dv-num good">×${f.toFixed(1)} <span class="stars">${combatStars(f)}</span></span></td>
      <td class="tags-cell">${tags}</td>
      <td class="req-cell">${reqParts.length ? escapeHtml(reqParts.join(' · ')) : '—'}</td>
    </tr>`;
  }
  return `<div class="sheet-scroll"><table class="sheet-table weapon-table">
    <tr><th class="sticky-col">Weapon</th><th>Unlocks</th><th>Combat power</th><th>Effects</th><th>Requires</th></tr>${rows}</table></div>`;
}

function renderAgeSheet() {
  const maxK = TECH_AGES[TECH_AGES.length - 1].knowledgeRequired;
  const maxM = TECH_AGES[TECH_AGES.length - 1].armyTechMult;
  let rows = '';
  for (const a of TECH_AGES) {
    const kW = a.knowledgeRequired === 0 ? 2 : Math.min(100, (Math.log10(a.knowledgeRequired + 1) / Math.log10(maxK + 1)) * 100);
    const mW = (a.armyTechMult / maxM) * 100;
    rows += `<tr>
      <td class="sticky-col"><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.desc || '')}</small></td>
      <td><div class="hbar info"><span style="width:${kW}%"></span></div><span class="dv-num">${formatNum(a.knowledgeRequired)}</span></td>
      <td><div class="hbar good"><span style="width:${mW}%"></span></div><span class="dv-num">×${a.armyTechMult.toFixed(1)}</span></td>
    </tr>`;
  }
  return `<div class="sheet-scroll"><table class="sheet-table">
    <tr><th class="sticky-col">Tech Age</th><th>Knowledge to reach (log scale)</th><th>Army tech multiplier</th></tr>${rows}</table></div>`;
}

// ============================================================
// ASYNC 1v1 MULTIPLAYER (URL-param based, no server)
// ------------------------------------------------------------
// Flow:
//   • Player 1 configures Side A, clicks "Challenge a Friend" → a link
//     encoding Side A + world settings is copied to the clipboard.
//   • Player 2 opens that link → Side A and the world settings load
//     locked/read-only ("Opponent locked in"); they pick Side B and
//     click "Accept & Run".  On accept, the URL is rewritten to encode
//     BOTH sides and auto-copied so it can be sent back to Player 1.
//   • Player 1 opens that full link → both sides lock, "Run Match".
//
// Determinism: the seed is derived from a hash of the *combined* config
// (both sides' gameplay choices + world settings).  Identical config →
// identical seed → bit-for-bit identical run for both players.  The
// simulation engine itself is never touched — only which integer seeds
// the RNG, plus a URL rewrite on accept.
// ============================================================

// Shared multiplayer state, read by main.js's startSim().
const MP = { active: false, role: null, config: null };

const MP_VERSION = '1';

// Per-side defaults used when reconstructing names/colors from a link.
const MP_SIDE_FALLBACK = {
  A: { name: 'The First',  color: '#4a90e2' },
  B: { name: 'The Second', color: '#e74c3c' },
};

// ---- Seed derivation (FNV-1a, 32-bit) ----
// Hashes only gameplay-relevant fields (not cosmetic name/color, not a
// manual seed — that field is hidden in multiplayer mode).
function hashConfigToSeed(config) {
  const w = config.world;
  const fields = [
    config.A.race, config.A.focus, config.A.government, config.A.weapon, config.A.biome,
    config.B.race, config.B.focus, config.B.government, config.B.weapon, config.B.biome,
    String(w.maxYear), w.mapSize, w.disasters, w.startingTech, w.interaction,
  ];
  const str = fields.join('');
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ---- URL encode ----
// URLSearchParams handles all escaping (long names, '#' in colors, unicode).
// includeB controls whether Side B is written (challenge link omits it).
function encodeMatchURL(config, includeB) {
  const p = new URLSearchParams();
  p.set('v', MP_VERSION);
  p.set('ar', config.A.race);
  p.set('af', config.A.focus);
  p.set('ag', config.A.government);
  p.set('aw', config.A.weapon);
  p.set('ab', config.A.biome);
  p.set('an', config.A.name);
  p.set('ac', config.A.color);
  if (includeB && config.B) {
    p.set('br', config.B.race);
    p.set('bf', config.B.focus);
    p.set('bg', config.B.government);
    p.set('bw', config.B.weapon);
    p.set('bb', config.B.biome);
    p.set('bn', config.B.name);
    p.set('bc', config.B.color);
  }
  p.set('wl', String(config.world.maxYear));
  p.set('wm', config.world.mapSize);
  p.set('wd', config.world.disasters);
  p.set('wt', config.world.startingTech);
  p.set('wi', config.world.interaction);
  return location.origin + location.pathname + '?' + p.toString();
}

// ---- URL decode ----
// Returns null when no challenge params are present. URLSearchParams
// transparently reverses all the escaping done on encode.
function decodeMatchParams() {
  const p = new URLSearchParams(location.search);
  if (!p.get('ar')) return null;

  const side = (prefix, fb) => ({
    race:       p.get(prefix + 'r'),
    focus:      p.get(prefix + 'f'),
    government: p.get(prefix + 'g'),
    weapon:     p.get(prefix + 'w'),
    biome:      p.get(prefix + 'b'),
    name:       p.get(prefix + 'n') || fb.name,
    color:      p.get(prefix + 'c') || fb.color,
  });

  const A = side('a', MP_SIDE_FALLBACK.A);
  const hasB = !!p.get('br');
  const B = hasB ? side('b', MP_SIDE_FALLBACK.B) : null;
  const world = {
    length:      p.get('wl'),
    mapsize:     p.get('wm'),
    disasters:   p.get('wd'),
    tech:        p.get('wt'),
    interaction: p.get('wi'),
  };

  const decoded = { A, B, world };
  sanitizeDecoded(decoded);
  return decoded;
}

// Guard against links from a newer/older build referencing options that
// no longer exist — fall back to sensible defaults rather than break.
function sanitizeDecoded(decoded) {
  let repaired = false;
  const fixSide = (s, sideKey) => {
    if (!s) return;
    const d = SIDE_DEFAULTS[sideKey] || SIDE_DEFAULTS.A;
    if (!RACES[s.race])            { s.race = d.race; repaired = true; }
    if (!FOCUSES[s.focus])         { s.focus = d.focus; repaired = true; }
    if (!GOVERNMENTS[s.government]) { s.government = d.government; repaired = true; }
    if (!WEAPONS[s.weapon])        { s.weapon = d.weapon; repaired = true; }
    if (!BIOMES[s.biome])          { s.biome = d.biome; repaired = true; }
    if (!/^#[0-9a-fA-F]{6}$/.test(s.color || '')) { s.color = MP_SIDE_FALLBACK[sideKey].color; repaired = true; }
    if (!s.name) s.name = MP_SIDE_FALLBACK[sideKey].name;
  };
  fixSide(decoded.A, 'A');
  fixSide(decoded.B, 'B');

  const w = decoded.world;
  const lengths = ['500', '1000', '2000', '5000', '10000'];
  if (!lengths.includes(String(w.length))) { w.length = '1000'; repaired = true; }
  if (!MAP_SIZES[w.mapsize])               { w.mapsize = 'medium'; repaired = true; }
  if (!['none','low','normal','high','apocalyptic'].includes(w.disasters)) { w.disasters = 'normal'; repaired = true; }
  if (!['stone','bronze','iron'].includes(w.tech))                         { w.tech = 'stone'; repaired = true; }
  if (!['isolated','contested','open'].includes(w.interaction))            { w.interaction = 'contested'; repaired = true; }

  if (repaired) decoded._repaired = true;
}

// ---- Applying a decoded config to the form + locking it ----
function applyConfigToPanel(sideKey, cfg) {
  const panel = document.querySelector(`.civ-config[data-side="${sideKey}"]`);
  if (!panel || !cfg) return;
  const setF = (f, v) => {
    const el = panel.querySelector(`[data-field="${f}"]`);
    if (el && v != null) el.value = v;
  };
  setF('name', cfg.name);
  setF('color', cfg.color);
  setF('race', cfg.race);
  setF('focus', cfg.focus);
  setF('government', cfg.government);
  setF('weapon', cfg.weapon);
  setF('biome', cfg.biome);
  updateHints(panel);
}

function lockPanel(sideKey, labelText) {
  const panel = document.querySelector(`.civ-config[data-side="${sideKey}"]`);
  if (!panel) return;
  panel.classList.add('locked');
  panel.querySelectorAll('input, select').forEach(el => { el.disabled = true; });
  if (!panel.querySelector('.lock-badge')) {
    const badge = document.createElement('div');
    badge.className = 'lock-badge';
    badge.textContent = '🔒 ' + labelText;
    const h2 = panel.querySelector('h2');
    if (h2) h2.insertAdjacentElement('afterend', badge);
    else panel.insertBefore(badge, panel.firstChild);
  }
}

function setWorldFromDecoded(w) {
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  set('world-length', w.length);
  set('world-mapsize', w.mapsize);
  set('world-disasters', w.disasters);
  set('world-tech', w.tech);
  set('world-interaction', w.interaction);
}

function lockWorld() {
  const wc = document.querySelector('.world-config');
  ['world-length', 'world-mapsize', 'world-disasters', 'world-tech', 'world-interaction']
    .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });

  // Hide the manual seed field — the seed is derived in multiplayer mode.
  const seed = document.getElementById('world-seed');
  if (seed) { const lbl = seed.closest('label'); if (lbl) lbl.style.display = 'none'; }

  // Hide the player-count toggle — multiplayer is strictly 1v1.
  const pc = document.getElementById('player-count');
  if (pc) { const lbl = pc.closest('label'); if (lbl) lbl.style.display = 'none'; }

  if (wc && !wc.querySelector('.lock-badge')) {
    const badge = document.createElement('div');
    badge.className = 'lock-badge';
    badge.textContent = '🔒 Set by challenger';
    const h2 = wc.querySelector('h2');
    if (h2) h2.insertAdjacentElement('afterend', badge);
  }
}

function forceTwoPlayer() {
  const seg = document.getElementById('player-count');
  if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.players === '2'));
  const grid = document.querySelector('.setup-grid');
  if (grid) grid.classList.remove('three-player');
  const panelC = document.querySelector('.civ-config[data-side="C"]');
  if (panelC) panelC.style.display = 'none';
}

// ---- Clipboard + toast ----
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
  return true;
}

function showToast(msg, ms = 2800) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

function setMpHint(html) {
  const el = document.getElementById('mp-hint');
  if (el) el.innerHTML = html || '';
}

// ---- Player 1: build + copy the challenge link ----
function copyChallengeLink() {
  const config = readConfig();
  // Validate Side A on its own (Side B is the opponent's, decided later).
  if (typeof validateConfig === 'function' && !validateConfig(config.A)) return;
  const url = encodeMatchURL(config, false);
  copyToClipboard(url).then(() => {
    showToast('⚔ Challenge link copied! Send it to your opponent.');
    setMpHint(`<strong>Challenge ready.</strong> Your Side A choices are baked into the link — send it to a friend. When they accept, they'll send back a link that lets you watch the same battle.`);
  });
}

// ---- Init: detect state on page load and wire everything ----
function initMultiplayer() {
  const challengeBtn = document.getElementById('challenge-btn');
  const startBtn = document.getElementById('start-btn');
  const decoded = decodeMatchParams();

  // State 1 — fresh setup (Player 1). Solo play unchanged.
  if (!decoded) {
    MP.active = false;
    if (challengeBtn) challengeBtn.addEventListener('click', copyChallengeLink);
    return;
  }

  // A challenge link is present → multiplayer mode.
  MP.active = true;
  MP.config = decoded;

  forceTwoPlayer();
  applyConfigToPanel('A', decoded.A);
  setWorldFromDecoded(decoded.world);

  if (decoded.B) {
    // State 3 — full match link: both sides fixed, just run it.
    MP.role = 'replay';
    applyConfigToPanel('B', decoded.B);
    lockPanel('A', 'Locked in');
    lockPanel('B', 'Locked in');
    lockWorld();
    if (startBtn) startBtn.textContent = 'RUN MATCH';
    setMpHint(`<strong>Match ready.</strong> Both civilizations and the world are locked. Press <strong>Run Match</strong> — you'll see the exact same outcome your opponent does.`);
  } else {
    // State 2 — challenge accepted: Side A locked, configure Side B.
    MP.role = 'accepter';
    lockPanel('A', 'Opponent locked in');
    lockWorld();
    if (startBtn) startBtn.textContent = 'ACCEPT & RUN';
    setMpHint(`<strong>You've been challenged.</strong> Side A and the world are locked in by your opponent. Choose your <strong>Side B</strong>, then press <strong>Accept &amp; Run</strong> — the link auto-copies so you can send the result back.`);
  }

  if (decoded._repaired) {
    showToast('Note: some options in this link were unavailable and reset to defaults.', 4200);
  }

  // No challenging from inside an existing match.
  if (challengeBtn) challengeBtn.style.display = 'none';

  // Randomize button hidden in multiplayer — choices are determined by the match config.
  const rndBtn = document.getElementById('randomize-btn');
  if (rndBtn) rndBtn.style.display = 'none';
}

// ============================================================
// RANDOMIZE TEAMS
// Picks a functionally valid random build for each side.
// ============================================================
function randomizeTeams() {
  const sides = playerCount() === 3 ? ['A', 'B', 'C'] : ['A', 'B'];
  for (const side of sides) {
    const panel = document.querySelector(`.civ-config[data-side="${side}"]`);
    if (!panel) continue;

    const raceKeys = Object.keys(RACES);
    const race = raceKeys[Math.floor(Math.random() * raceKeys.length)];

    const validFocuses = Object.keys(FOCUSES).filter(fk => {
      const f = FOCUSES[fk];
      return !f.requires || f.requires.includes(race);
    });
    const focus = validFocuses[Math.floor(Math.random() * validFocuses.length)];

    const validGovs = Object.keys(GOVERNMENTS).filter(gk => {
      const g = GOVERNMENTS[gk];
      return !g.requires || !g.requires.race || g.requires.race.includes(race);
    });
    const gov = validGovs[Math.floor(Math.random() * validGovs.length)];

    const validWeapons = Object.keys(WEAPONS).filter(wk => {
      const w = WEAPONS[wk];
      if (!w.requires) return true;
      if (w.requires.race && !w.requires.race.includes(race)) return false;
      if (w.requires.focus && !w.requires.focus.includes(focus)) return false;
      if (w.requires.focusOr && !w.requires.focusOr.includes(focus)) return false;
      return true;
    });
    const weapon = validWeapons[Math.floor(Math.random() * validWeapons.length)];

    const biomeKeys = Object.keys(BIOMES);
    const biome = biomeKeys[Math.floor(Math.random() * biomeKeys.length)];

    const setF = (f, v) => { const el = panel.querySelector(`[data-field="${f}"]`); if (el) el.value = v; };
    setF('race', race);
    setF('focus', focus);
    setF('government', gov);
    setF('weapon', weapon);
    setF('biome', biome);
    updateHints(panel);
  }
}

// ============================================================
// MOBILE APP-LIKE EXPERIENCE
// Detected by touch capability + viewport width.
// Adds body.mobile class; all new CSS is scoped to that class.
// ============================================================
function detectMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (window.innerWidth <= 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
}

function initMobile() {
  if (!detectMobile()) return;
  document.body.classList.add('mobile');
  initMobileSetupTabs();
  initMobileSimNav();
}

function initMobileSetupTabs() {
  const header = document.querySelector('.setup-header');
  if (!header) return;

  const tabs = document.createElement('div');
  tabs.className = 'mobile-setup-tabs';
  const defs = [
    { target: 'a', label: 'SIDE A' },
    { target: 'world', label: 'WORLD' },
    { target: 'b', label: 'SIDE B' },
  ];
  for (const d of defs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mst-btn';
    btn.dataset.target = d.target;
    btn.textContent = d.label;
    tabs.appendChild(btn);
  }
  header.insertAdjacentElement('afterend', tabs);

  const activateTab = (target) => {
    tabs.querySelectorAll('.mst-btn').forEach(b => b.classList.toggle('active', b.dataset.target === target));
    document.querySelectorAll('.civ-config, .world-config').forEach(el => {
      const elT = el.classList.contains('world-config') ? 'world' : (el.dataset.side || '').toLowerCase();
      el.classList.toggle('mob-tab-active', elT === target);
    });
  };
  activateTab('a');

  tabs.addEventListener('click', e => {
    const btn = e.target.closest('.mst-btn');
    if (btn) activateTab(btn.dataset.target);
  });

  // Add / remove Side C tab when player count changes
  document.getElementById('player-count')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-players]');
    if (!btn) return;
    const three = btn.dataset.players === '3';
    let cTab = tabs.querySelector('[data-target="c"]');
    if (three && !cTab) {
      const nb = document.createElement('button');
      nb.type = 'button';
      nb.className = 'mst-btn';
      nb.dataset.target = 'c';
      nb.textContent = 'SIDE C';
      tabs.appendChild(nb);
    } else if (!three && cTab) {
      const wasActive = cTab.classList.contains('active');
      cTab.remove();
      document.querySelector('.civ-config[data-side="C"]')?.classList.remove('mob-tab-active');
      if (wasActive) activateTab('a');
    }
  });
}

function initMobileSimNav() {
  const simScreen = document.getElementById('sim-screen');
  if (!simScreen) return;

  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';
  nav.id = 'mobile-bottom-nav';
  nav.innerHTML = `
    <button class="mbn-btn active" data-panel="map">
      <span class="mbn-icon">◉</span>
      <span class="mbn-label">MAP</span>
    </button>
    <button class="mbn-btn" data-panel="A">
      <span class="mbn-icon">A</span>
      <span class="mbn-label">SIDE A</span>
    </button>
    <button class="mbn-btn" data-panel="B">
      <span class="mbn-icon">B</span>
      <span class="mbn-label">SIDE B</span>
    </button>
    <button class="mbn-btn mob-nav-c" data-panel="C" style="display:none">
      <span class="mbn-icon">C</span>
      <span class="mbn-label">SIDE C</span>
    </button>`;
  simScreen.appendChild(nav);

  nav.addEventListener('click', e => {
    const btn = e.target.closest('.mbn-btn');
    if (btn) activateMobilePanel(btn.dataset.panel);
  });
}

function activateMobilePanel(panel) {
  const nav = document.getElementById('mobile-bottom-nav');
  if (!nav) return;
  nav.querySelectorAll('.mbn-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
  ['A', 'B', 'C'].forEach(s => {
    const el = document.getElementById(`panel-${s}`);
    if (el) el.classList.toggle('mob-active', s === panel);
  });
}

function resetMobileNav(threePlayer) {
  if (!document.body.classList.contains('mobile')) return;
  activateMobilePanel('map');
  const cBtn = document.querySelector('.mob-nav-c');
  if (cBtn) cBtn.style.display = threePlayer ? '' : 'none';
}
