# AEON — 1v1 Civilization Simulator

A 1000-year, two-civilization sandbox simulator. Pick race, focus, weapon, government, and biome for each side, press play, and watch civilizations rise (or collapse) on a split-biome map. At Year 1000 they fight a final battle for the world.

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
- Full setup screen with all 8 races, 7 focuses, 8 weapons, 5 governments, 8 biomes
- World settings: map size, disaster frequency, starting tech, interaction mode, seed
- Split-biome map generation with wavy contested borders
- Yearly tick simulation: population, food, metal, wood, gold, knowledge, faith, magic
- Tech age progression (Stone → Modern)
- Time controls: pause / 1x / 10x / 100x / MAX, plus Skip-to-Y1000

**Phase 2 (Depth)**
- Tech tree with 7 ages, focus-weighted progression
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
- Aftermath screen with full battle log, final stats, both civs side-by-side

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
