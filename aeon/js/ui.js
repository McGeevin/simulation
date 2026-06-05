// ============================================================
// AEON :: UI
// Setup screen population, option stat-cards, stat panels,
// event logs, and the end-of-game power breakdown.
// ============================================================

function populateSelects() {
  document.querySelectorAll('.civ-config').forEach(panel => {
    const side = panel.dataset.side;
    populateSelect(panel.querySelector('[data-field="race"]'), RACES, side === 'A' ? 'humans' : 'orcs');
    populateSelect(panel.querySelector('[data-field="focus"]'), FOCUSES, side === 'A' ? 'science' : 'military');
    populateSelect(panel.querySelector('[data-field="government"]'), GOVERNMENTS, 'monarchy');
    populateSelect(panel.querySelector('[data-field="weapon"]'), WEAPONS, 'siege');
    populateSelect(panel.querySelector('[data-field="biome"]'), BIOMES, side === 'A' ? 'forest' : 'mountain');

    panel.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => updateHints(panel));
    });
    updateHints(panel);
  });
}

function populateSelect(selectEl, source, defaultKey) {
  for (const [key, item] of Object.entries(source)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = item.name;
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
  const config = { A: {}, B: {}, world: {} };
  document.querySelectorAll('.civ-config').forEach(panel => {
    const side = panel.dataset.side;
    panel.querySelectorAll('[data-field]').forEach(el => {
      config[side][el.dataset.field] = el.value;
    });
  });
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

function renderLegend(civA, civB) {
  const el = document.getElementById('map-legend');
  if (!el) return;
  el.innerHTML = `
    <div class="lg-row"><span class="lg-swatch" style="background:${escapeHtml(civA.color)}"></span>${escapeHtml(civA.name)} <small>${escapeHtml(civA.biomeData.name)}</small></div>
    <div class="lg-row"><span class="lg-swatch" style="background:${escapeHtml(civB.color)}"></span>${escapeHtml(civB.name)} <small>${escapeHtml(civB.biomeData.name)}</small></div>
    <div class="lg-row lg-cap"><span class="lg-star">★</span>Capital</div>`;
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

  // biggest contributing factor for the winner (besides base)
  const wb = o.winner === o.invader ? o.invBreakdown : o.defBreakdown;
  let top = null;
  for (const f of wb.factors) { if (!top || f.mult > top.mult) top = f; }

  const lines = [];
  lines.push(`<strong>${escapeHtml(o.invader.name)}</strong> was the aggressor (higher belligerence: ${o.aAgg >= o.bAgg ? o.aAgg : o.bAgg} vs ${o.aAgg >= o.bAgg ? o.bAgg : o.aAgg}) and marched on <strong>${escapeHtml(o.defender.name)}</strong>, who fought on home ground.`);

  if (upset) {
    lines.push(`On paper <strong>${escapeHtml(favored.name)}</strong> held the edge (${formatNum(o.invPower)} vs ${formatNum(o.defPower)} raw power), but the fog of war — a ${margin.toFixed(0)}% swing in the rolls — handed victory to <strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong>. A genuine upset.`);
  } else if (margin < 8) {
    lines.push(`It was razor-close: <strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> edged ahead by just ${margin.toFixed(0)}% after the dice settled.`);
  } else {
    lines.push(`<strong style="color:${escapeHtml(o.winner.color)}">${escapeHtml(o.winner.name)}</strong> won decisively, ${margin.toFixed(0)}% ahead once the rolls landed.`);
  }

  if (top) {
    lines.push(`Their single greatest edge was <strong>${escapeHtml(top.label)}</strong> (×${top.mult.toFixed(2)})${top.detail ? ' — ' + escapeHtml(top.detail) : ''}.`);
  }
  lines.push(`The victors lost roughly ${(o.winnerCasualtyPct * 100).toFixed(0)}% of their army; the defeated lost ${(o.loserCasualtyPct * 100).toFixed(0)}% and their nation.`);

  return lines.map(l => `<p>${l}</p>`).join('');
}

function renderAftermathPower(outcome) {
  const el = document.getElementById('power-explainer');
  if (!el) return;
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
