// ============================================================
// AEON :: UI
// Setup screen population, stat panel updates, event logs.
// ============================================================

function populateSelects() {
  document.querySelectorAll('.civ-config').forEach(panel => {
    const side = panel.dataset.side;
    populateSelect(panel.querySelector('[data-field="race"]'), RACES, side === 'A' ? 'humans' : 'orcs');
    populateSelect(panel.querySelector('[data-field="focus"]'), FOCUSES, side === 'A' ? 'science' : 'military');
    populateSelect(panel.querySelector('[data-field="government"]'), GOVERNMENTS, 'monarchy');
    populateSelect(panel.querySelector('[data-field="weapon"]'), WEAPONS, 'siege');
    populateSelect(panel.querySelector('[data-field="biome"]'), BIOMES, side === 'A' ? 'forest' : 'mountain');

    // Wire hints
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

function updateHints(panel) {
  const fields = ['race', 'focus', 'government', 'weapon', 'biome'];
  const sources = { race: RACES, focus: FOCUSES, government: GOVERNMENTS, weapon: WEAPONS, biome: BIOMES };
  for (const f of fields) {
    const select = panel.querySelector(`[data-field="${f}"]`);
    const hint = panel.querySelector(`[data-hint="${f}"]`);
    if (select && hint) {
      const item = sources[f][select.value];
      if (item) hint.textContent = item.desc;
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
  config.world.seed = parseInt(document.getElementById('world-seed').value) || 12345;

  // Map disaster setting to chance
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
  document.getElementById(`name-${s}`).textContent = civ.name;
  document.getElementById(`name-${s}`).style.color = civ.color;
  document.getElementById(`subtitle-${s}`).textContent = `${civ.raceData.name} · ${civ.focusData.name} · ${civ.biomeData.name}`;

  document.getElementById(`${s}-pop`).textContent = formatNum(civ.population);
  document.getElementById(`${s}-army`).textContent = formatNum(civ.army);
  document.getElementById(`${s}-age`).textContent = TECH_AGES[civ.techAge].name;
  document.getElementById(`${s}-food`).textContent = formatNum(civ.food);
  document.getElementById(`${s}-metal`).textContent = formatNum(civ.metal);
  document.getElementById(`${s}-gold`).textContent = formatNum(civ.gold);
  document.getElementById(`${s}-knowledge`).textContent = formatNum(civ.knowledge);
  document.getElementById(`${s}-faith`).textContent = formatNum(civ.faith);
  document.getElementById(`${s}-magic`).textContent = formatNum(civ.magic);
  document.getElementById(`${s}-morale`).textContent = Math.round(civ.morale);
  document.getElementById(`${s}-stability`).textContent = Math.round(civ.stability);
}

function logEvent(side, year, text, tag = 'cultural') {
  const log = document.getElementById(`events-${side}`);
  const item = document.createElement('div');
  item.className = `event-item event-${tag}`;
  item.innerHTML = `<span class="event-year">Y${year}</span>${text}`;
  log.insertBefore(item, log.firstChild);
  // Cap log entries
  while (log.children.length > 60) log.removeChild(log.lastChild);
}
