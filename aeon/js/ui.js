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
