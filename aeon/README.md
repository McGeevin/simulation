# AEON — 1v1 Civilization Simulator

A two-civilization sandbox simulator spanning anywhere from 500 to 10,000 years. Pick race, focus, weapon, government, and biome for each side, choose how long history runs, press play, and watch civilizations rise (or collapse) on a split-biome map. At the end of the run they fight a final battle for the world — and the aftermath screen shows exactly how that battle's power was calculated, factor by factor.

## Running

This is plain HTML/CSS/JS with no build step.

**Option 1 — Open directly:** Double-click `index.html`. Works in modern Chrome/Firefox/Edge.

**Option 2 — Local server (recommended):** Some browsers restrict file:// scripts. Easiest:

```bash
# In the project folder:
python3 -m http.server 8000
# or with Node:
npx serve
```

Then open `http://localhost:8000` in your browser.

**Option 3 — VS Code:** Install the **Live Server** extension, right-click `index.html`, "Open with Live Server".

## File Map

```
aeon/
├── index.html          Entry point + DOM structure
├── css/
│   └── style.css       All styling
└── js/
    ├── data.js         Game data: races, focuses, weapons, biomes, tech ages, events
    ├── rng.js          Seeded RNG (mulberry32) for deterministic runs
    ├── map.js          Map generation, territory expansion, settlements
    ├── sim.js          Yearly tick: population, resources, tech, events, disasters
    ├── render.js       Canvas rendering: map + timeline
    ├── battle.js       Battle resolution + visualizer
    ├── ui.js           Setup screen wiring, panel updates, event log
    └── main.js         Orchestrator: game loop, screen transitions
```

## What's Implemented

**Phase 1 (Core)**
- Full setup screen with 16 races, 12 focuses, 16 weapons, 11 governments, 15 biomes — each with lore-rich descriptions, a **hover tooltip** brief, and live **stat lines** (colour-coded modifier breakdowns; weapons also show unlock age, a combat-power rating with stars, effect tags, and requirements)
- World settings: **simulation length (500–10,000 years)**, map size (up to 150×96), disaster frequency, starting tech, interaction mode, seed
- Split-biome map generation with wavy contested borders, winding rivers, and per-biome terrain detail
- Yearly tick simulation: population, food, metal, wood, gold, knowledge, faith, magic
- Tech age progression across 12 ages (Stone → … → Modern → Atomic → Information → Stellar → Singularity → Transcendent)
- Time controls: pause / 1x / 10x / 100x / MAX, plus Skip-to-End

**Phase 2 (Depth)**
- Tech tree with 12 ages, focus-weighted progression
- Cultural events (golden ages, schisms, breakthroughs, succession crises, rebellions, etc.)
- Biome-specific disasters (volcanic eruptions, blizzards, droughts, floods, plagues)
- Settlements visibly grow through tiers (tent → metropolis)
- Special weapon unlock at proper tech age
- Border contact and skirmishes when civs meet
- Side panels with live stats, color-coded event logs per civ
- Bottom timeline showing all major events plotted across 1000 years

**Phase 3 (Battle + Polish)**
- Stat-based battle resolution with invader/defender mechanics
- Real-time battle visualization: armies spawn, march, clash, resolve
- Special weapons trigger as mid-battle cinematic moments (particle bursts)
- Casualty rates reflect the resolved outcome
- Winner sweeps the map (territory recolor)
- Aftermath screen with a full **power breakdown**: every multiplier (tech-age arms, doctrine, morale, stability, terrain, fortification, special weapon, fog-of-war roll) is itemised for both sides, alongside a plain-language narrative explaining why the winner won, the visual battle log, and final stats

**Phase 4 (Graphics + UI)**
- Baked offscreen terrain layer (rivers, trees, hills, ice, dunes, vines, resource nodes) with only dynamic layers redrawn per frame — richer visuals *and* faster long runs
- Crisp territory borders, glowing capitals with banners, settlement tiers from tent to windowed metropolis
- Map legend, vignette, animated water, and a timeline that auto-scales to the run length
- Display/UI/mono font system, refined palette with gradients and glows, morale/stability bars, custom scrollbars
- Incremental owned-tile caching keeps even a 10,000-year run on the huge map under ~2 seconds when skipped to the end

**Phase 5 (Living Map + Codex)**
- **Ambient citizens**: small figures of each race wander between their settlements in real time, so the map feels populated (purely cosmetic — never affects the deterministic sim)
- **Construction animations**: every new or upgraded settlement rises out of the ground behind scaffolding, with dust and chimney smoke
- **Biome-themed terrain** driven by a `terrain` archetype: forests fill with trees, coastlines grow a real sea with sandy beaches and foam, mountains gain snow-capped peaks, volcanic land glows with animated lava, deserts ripple with dunes, taiga mixes pines and snow, etc.
- **Hover tooltips** on every picker for a quick overview before you commit
- **Codex modal** ("📊 Compare All Options"): a dropdown switches between comparison charts for Races / Focuses / Governments / Weapons / Biomes / Tech Ages — diverging stat bars for the mod-based categories, a combat-power chart for weapons, and a knowledge/army-multiplier chart for the ages

## Customization Pointers

**Add a race:** edit `js/data.js`, append to the `RACES` object. The setup screen will populate automatically.

**Tweak balance:** the `mods` object on each race/focus/government/biome stacks multiplicatively. Search `getMod(civ, 'something')` in `sim.js` to see what's queried.

**Add an event:** append to the `EVENTS` object in `data.js`. Set a `tag` so it color-codes in the timeline and event log.

**Map size / tile detail:** `MAP_SIZES` in `map.js`. Tile size auto-scales to canvas.

**Battle balance:** `computeBattlePower()` in `battle.js`. RNG band is the `rng.range(0.90, 1.10)` line.

## Known Quirks

- Browser tabs in the background throttle `requestAnimationFrame`, so the sim pauses if you switch away. Come back and it resumes.
- At MAX speed, individual frames may simulate 50 years each. Rendering looks choppy but that's intentional (time-blur).
- No save/load — use the seed to reproduce a run.
- Constructs have a unique growth model: they need metal + knowledge to build new units. They can stall if either resource is depleted.

## Next Steps If You Want to Extend

- Replace canvas-drawn shapes with actual sprite sheets in `assets/`
- Add sound effects (battle clash, age-up jingle)
- Diplomatic actions pre-battle (trade, alliance, vassalage)
- Multi-civ (3+ way) instead of 1v1
- Save run summaries to clipboard
- More tech-age-specific unit visuals during battle
