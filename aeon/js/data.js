// ============================================================
// AEON :: DATA DEFINITIONS
// All races, focuses, weapons, governments, biomes, tech ages.
// `mods` stack multiplicatively when applied (see getMod in sim.js).
// `desc`   = one-line summary (used in pickers + hover tooltips).
// `flavor` = longer lore shown in the option card.
// Biomes also carry a `terrain` archetype that drives map drawing.
// ============================================================

const RACES = {
  humans: {
    name: 'Humans',
    desc: 'Adaptable generalists — quick to learn, quick to spread.',
    flavor: 'Ambitious and endlessly inventive, humans master no single art yet falter at none. Their strength is the speed at which they copy, adapt, and outpace.',
    mods: { research: 1.10, growth: 1.05, military: 1.0, lifespan: 1.0 },
    biomePref: ['plains','forest','coastal','savanna'],
  },
  orcs: {
    name: 'Orcs',
    desc: 'Brutal, fast-breeding warriors. Poor scholars.',
    flavor: 'Strength is the only currency of the orc clans. They breed for war and die young, trading scholarship for raw martial dominance.',
    mods: { research: 0.80, growth: 1.20, military: 1.30, lifespan: 0.85 },
    biomePref: ['plains','mountain','volcanic','savanna'],
  },
  elves: {
    name: 'Elves',
    desc: 'Long-lived and magically gifted, but slow to breed.',
    flavor: 'Centuries pass in a single elven lifetime. Patient and arcane, they cultivate magic and knowledge while their numbers grow only grudgingly.',
    mods: { research: 1.15, growth: 0.70, military: 0.95, lifespan: 1.50, magic: 1.40 },
    biomePref: ['forest','coastal','jungle'],
  },
  dwarves: {
    name: 'Dwarves',
    desc: 'Master miners & engineers. Fortify everything.',
    flavor: 'Carvers of mountains and forgers of legend. Dwarves turn stone into citadels and ore into unbreakable lines of defense.',
    mods: { research: 1.05, growth: 0.90, military: 1.10, defense: 1.40, metal: 1.50 },
    biomePref: ['mountain','volcanic','highlands'],
  },
  lizardfolk: {
    name: 'Lizardfolk',
    desc: 'Heat-adapted and regenerative. Cold cripples them.',
    flavor: 'Sun-warmed predators of the marsh and dune. They heal fast and breed steadily, but the bite of frost slows their cold blood to a crawl.',
    mods: { research: 0.95, growth: 1.10, military: 1.05 },
    biomePref: ['desert','swamp','jungle'],
    biomePenalty: { tundra: 0.6, taiga: 0.7 },
  },
  frostborn: {
    name: 'Frostborn',
    desc: 'Hardy folk of the ice. Heat withers them.',
    flavor: 'Born of glacier and storm, the frostborn endure where others freeze. Their resilience is legendary — but a desert sun is a slow execution.',
    mods: { research: 0.95, growth: 0.95, military: 1.15, defense: 1.10 },
    biomePref: ['tundra','mountain','taiga'],
    biomePenalty: { desert: 0.5, volcanic: 0.7, savanna: 0.8, badlands: 0.7 },
  },
  avians: {
    name: 'Avians',
    desc: 'Winged scouts. Swift and far-seeing, but few and fragile.',
    flavor: 'Sky-dwellers who map the world from above. Their unmatched sight comes at the cost of fragile bodies and small, hard-won populations.',
    mods: { research: 1.05, growth: 0.85, military: 0.95, scouting: 2.0 },
    biomePref: ['mountain','plains','coastal','highlands'],
    popCapMod: 0.75,
  },
  constructs: {
    name: 'Constructs',
    desc: 'Built, not born. No food needed — but growth costs metal + knowledge.',
    flavor: 'Tireless automata that neither hunger nor age. Every new unit must be forged, so a construct nation lives and dies by its mines and its minds.',
    mods: { research: 1.0, growth: 0.0, military: 1.10, defense: 1.20 },
    biomePref: ['mountain','desert','volcanic','badlands'],
    special: 'constructed',
  },
  goblins: {
    name: 'Goblins',
    desc: 'Numberless and cunning. Quantity is its own quality.',
    flavor: 'Individually weak and short-lived, goblins overwhelm through sheer fecundity and low cunning. A goblin horde is a tide that drowns better soldiers.',
    mods: { research: 0.90, growth: 1.35, military: 0.90, lifespan: 0.80, gold: 1.15 },
    biomePref: ['swamp','jungle','mountain','badlands'],
    popCapMod: 1.30,
  },
  merfolk: {
    name: 'Merfolk',
    desc: 'Coastal traders attuned to tide and current. Deserts kill.',
    flavor: 'Dwellers of the shoreline and shallow sea. Masters of trade and current, they wither far from water and treat the open desert as a death sentence.',
    mods: { research: 1.10, growth: 1.0, military: 1.0, trade: 1.30, magic: 1.10 },
    biomePref: ['coastal','swamp','archipelago'],
    biomePenalty: { desert: 0.5, volcanic: 0.6, badlands: 0.6 },
  },
  infernals: {
    name: 'Infernals',
    desc: 'Demonic warlords — mighty and magical, but restless.',
    flavor: 'Exiles of some burning realm, infernals wield fire and dread in equal measure. Their power is immense; their patience and their peace are not.',
    mods: { research: 0.95, growth: 0.75, military: 1.35, magic: 1.30, lifespan: 1.20, stability: 0.92 },
    biomePref: ['volcanic','desert','badlands'],
    biomePenalty: { tundra: 0.6, taiga: 0.7 },
  },
  fae: {
    name: 'Fae',
    desc: 'Capricious spirits of wild magic. Brilliant yet brittle.',
    flavor: 'Tricksters woven from raw magic and moonlight. The fae bend reality with ease but shatter in open war, hoarding their few precious numbers.',
    mods: { research: 1.20, growth: 0.80, military: 0.80, magic: 1.60, lifespan: 1.30 },
    biomePref: ['forest','swamp','jungle'],
    popCapMod: 0.80,
  },
  giants: {
    name: 'Giants',
    desc: 'Mountain-born colossi. Few, slow, and unstoppable in a fight.',
    flavor: 'Each giant is a walking siege engine. They breed rarely and tire the land that feeds them, but a single warband can shatter an army.',
    mods: { research: 0.90, growth: 0.70, military: 1.45, defense: 1.25, lifespan: 1.20 },
    biomePref: ['mountain','tundra','highlands'],
    popCapMod: 0.65,
  },
  undead: {
    name: 'Undead',
    desc: 'The tireless dead. They do not flee, mourn, or break.',
    flavor: 'A nation that death cannot diminish. The undead grow slowly but never panic and never age — a patient, relentless tide of bone and will.',
    mods: { research: 0.90, growth: 0.85, military: 1.20, stability: 1.25, lifespan: 2.0, magic: 1.15 },
    biomePref: ['swamp','tundra','badlands'],
    biomePenalty: { coastal: 0.85 },
  },
  beastfolk: {
    name: 'Beastfolk',
    desc: 'Fierce, mobile clans of the open wild.',
    flavor: 'Half-beast hunters who run down anything that flees. They thrive on open ground, scouting wide and striking fast.',
    mods: { research: 0.90, growth: 1.15, military: 1.15, armyGrowth: 1.10, scouting: 1.30 },
    biomePref: ['plains','savanna','steppe','forest'],
  },
  insectoids: {
    name: 'Insectoids',
    desc: 'A chitinous swarm. Numerous and tenacious — but no longer unstoppable.',
    flavor: 'A single sprawling brood-mind in a million bodies. Insectoids grow steadily and hold ground well, but a rival with strong research or military focus can match their numbers. The swarm adapts; it does not overwhelm.',
    mods: { research: 0.85, growth: 1.20, military: 1.05, defense: 1.20 },
    biomePref: ['jungle','swamp','desert','badlands'],
    popCapMod: 1.20,
  },
};

const FOCUSES = {
  military: {
    name: 'Military',
    desc: 'Fast weapons tech and huge standing armies — at the economy\'s expense.',
    flavor: 'Every road leads to the parade ground. A militarized state out-fields and out-arms its rivals, even as its coffers run thin.',
    mods: { armyGrowth: 1.40, weaponTech: 1.30, economy: 0.85, research: 0.95 },
  },
  science: {
    name: 'Science',
    desc: 'The fastest tech tree. Slow to start, devastating late.',
    flavor: 'Knowledge compounds. A scientific civilization stumbles early but, given time, fields weapons its enemies cannot even comprehend.',
    mods: { research: 1.50, weaponTech: 1.10, economy: 1.0, armyGrowth: 0.90 },
  },
  faith: {
    name: 'Faith',
    desc: 'Unshakeable morale and stability. Crusades win wars.',
    flavor: 'A people united by belief do not break. Faith turns farmers into zealots and grief into resolve, and channels devotion into holy war.',
    mods: { morale: 1.40, stability: 1.30, faithGen: 2.0, research: 0.90 },
  },
  trade: {
    name: 'Trade',
    desc: 'Coffers overflow. Rich but militarily soft.',
    flavor: 'Gold is the quiet emperor. Merchant states buy what they cannot build and bribe what they cannot beat — until someone calls the bluff.',
    mods: { gold: 1.60, economy: 1.30, armyGrowth: 0.85, diplomacy: 1.30 },
  },
  magic: {
    name: 'Magic',
    desc: 'Rituals, summons and arcane war. Race-dependent.',
    flavor: 'Where others see limits, mages see leverage. Magic warps growth, war, and the world itself — for those born able to wield it.',
    mods: { magicGen: 1.80, research: 1.10, armyGrowth: 0.95 },
    requires: ['elves','humans','lizardfolk','frostborn','avians','merfolk','infernals','fae','undead'],
  },
  industry: {
    name: 'Industry',
    desc: 'Maximum production. Slowly poisons the land.',
    flavor: 'Smokestacks blot the sky. Industrial powers out-produce everyone, paying for it with a poisoned, restless homeland.',
    mods: { economy: 1.50, weaponTech: 1.20, stability: 0.92, environment: 0.80 },
  },
  naturalism: {
    name: 'Naturalism',
    desc: 'Sustainable harmony. Bonuses scale with the biome.',
    flavor: 'To live with the land, not against it. Naturalist peoples grow slowly and steadily, rewarded for keeping their world whole.',
    mods: { stability: 1.20, growth: 1.10, environment: 1.30, weaponTech: 0.85 },
  },
  exploration: {
    name: 'Exploration',
    desc: 'Aggressive expansion and scouting. Finds what others miss.',
    flavor: 'The map is never finished. Explorers spread fast and far, charting frontiers and unearthing resources rivals never knew existed.',
    mods: { scouting: 1.80, growth: 1.12, gold: 1.15, economy: 1.10, weaponTech: 0.95 },
  },
  diplomacy: {
    name: 'Diplomacy',
    desc: 'Wealth, stability and defense through alliance. Weak on offense.',
    flavor: 'Win without fighting. Diplomatic states prosper behind a wall of treaties — formidable to invade, but slow to march themselves.',
    mods: { diplomacy: 1.50, gold: 1.20, stability: 1.20, morale: 1.10, defense: 1.10, armyGrowth: 0.80 },
  },
  espionage: {
    name: 'Espionage',
    desc: 'Shadows and saboteurs. Quietly undermines every rival.',
    flavor: 'The dagger behind the smile. Spymaster states thrive on stolen secrets and steady nerves, rarely seen and never quite trusted.',
    mods: { scouting: 1.40, gold: 1.15, stability: 1.10, research: 1.05, armyGrowth: 0.95, eventVariance: 0.80 },
  },
  seafaring: {
    name: 'Seafaring',
    desc: 'Masters of the waves — trade, food and far horizons.',
    flavor: 'The sea is a highway to the world\'s wealth. Seafaring peoples grow fat on fish and foreign gold, weakest only when dragged inland.',
    mods: { trade: 1.40, gold: 1.20, food: 1.10, scouting: 1.30, economy: 1.10, armyGrowth: 0.95 },
  },
  culture: {
    name: 'Culture',
    desc: 'Art, faith and identity. A people impossible to break.',
    flavor: 'Monuments, myths, and music. A cultural golden age binds a nation together so tightly that no defeat can truly end it.',
    mods: { morale: 1.30, stability: 1.25, diplomacy: 1.20, faithGen: 1.20, weaponTech: 0.90 },
  },
};

const WEAPONS = {
  chariots: {
    name: 'War Chariots',
    desc: 'The first shock weapon. Devastating in the early ages.',
    flavor: 'Bronze-age terror on wheels. Chariots crash through loose ranks and rule the battlefield until the spear-wall learns to hold.',
    unlockAge: 1, // Bronze
    battleMod: { shock: 1.40, attack: 1.15 },
  },
  cavalry: {
    name: 'Heavy Cavalry',
    desc: 'Early shock troops. Break lines before the enemy is ready.',
    flavor: 'Thundering charges that scatter infantry like chaff. Cheap, early, and brutally effective against the unprepared.',
    unlockAge: 2, // Iron
    battleMod: { shock: 1.50, attack: 1.20 },
  },
  beasts: {
    name: 'War Beasts',
    desc: 'Apex predators bred and armored for the battlefield.',
    flavor: 'Tusked, taloned, and trained to kill. War beasts trample formations and drown morale in primal fear.',
    unlockAge: 2, // Iron
    battleMod: { shock: 1.80, fear: 1.30 },
  },
  siege: {
    name: 'Siege Engineering',
    desc: 'Breaks walls and ends sieges. Murders fortified defenders.',
    flavor: 'Trebuchets, towers, and sappers. No fortress is eternal once the engineers arrive.',
    unlockAge: 2, // Iron
    battleMod: { antiDefense: 2.50, attack: 1.20 },
  },
  champions: {
    name: 'Divine Champions',
    desc: 'A handful of heroes worth a thousand soldiers.',
    flavor: 'Blessed warriors who turn the tide single-handed. Where they walk, lesser armies break and rally.',
    unlockAge: 3, // Medieval
    battleMod: { elite: 3.0, morale: 1.30 },
  },
  necromancy: {
    name: 'Necromancy',
    desc: 'Raise the fallen to fight again. Terrifies the living.',
    flavor: 'The dead do not tire, flee, or mourn. Each fallen soldier — friend or foe — is simply a recruit who has not yet risen.',
    unlockAge: 3, // Medieval
    battleMod: { raise: 0.40, fear: 1.50 },
    requires: { focusOr: ['magic','faith'] },
  },
  plague: {
    name: 'Plague Bearers',
    desc: 'Biological warfare. The enemy is dying before the first clash.',
    flavor: 'Why win a battle when you can win before it begins? Plague bearers ensure the enemy fields the sick, the weak, and the dying.',
    unlockAge: 3, // Medieval
    battleMod: { preBattle: 0.30, morale: 0.85 },
  },
  dragonRiders: {
    name: 'Dragon Riders',
    desc: 'Winged death. Fire from above and primal terror below.',
    flavor: 'To tame a dragon is to own the sky. Few weapons of any age match the fear and fury a dragonflight brings to the field.',
    unlockAge: 3, // Medieval
    battleMod: { shock: 1.60, fear: 1.60, ranged: 1.50 },
    requires: { race: ['elves','infernals','lizardfolk','fae'] },
  },
  arcaneStorm: {
    name: 'Arcane Tempest',
    desc: 'Elemental casters rain fire, frost and lightning.',
    flavor: 'Battlemages who turn the sky into a weapon. Ranged annihilation for those who can pay the arcane price.',
    unlockAge: 4, // Renaissance
    battleMod: { ranged: 1.80, shock: 1.40 },
    requires: { focusOr: ['magic'] },
  },
  gunpowder: {
    name: 'Gunpowder Legions',
    desc: 'Disciplined ranks and devastating volleys.',
    flavor: 'The age of the blade ends here. Massed firearms shred charges and shatter the courage of anything that still uses a sword.',
    unlockAge: 4, // Renaissance
    battleMod: { ranged: 2.0, morale: 1.10 },
  },
  aerial: {
    name: 'Aerial Bombardment',
    desc: 'Strike from above. Demoralizes and outflanks defenders.',
    flavor: 'Death from a clear sky. No wall faces upward, and no formation holds when the bombs begin to fall.',
    unlockAge: 4, // Renaissance
    battleMod: { ranged: 2.20, antiDefense: 1.40 },
    requires: { race: ['avians'], focusOr: ['industry','magic'] },
  },
  mech: {
    name: 'Mechanized Infantry',
    desc: 'Industrial war machines — armored, relentless.',
    flavor: 'Steel that walks and rolls. Mechanized columns combine the punch of artillery with armor no blade or beast can answer.',
    unlockAge: 5, // Industrial
    battleMod: { attack: 2.20, defense: 1.60 },
    requires: { focusOr: ['industry','science'] },
  },
  artillery: {
    name: 'Heavy Artillery',
    desc: 'Long-range guns that flatten fortifications and formations.',
    flavor: 'War decided by mathematics and gunpowder. Artillery breaks both walls and the will to stand behind them.',
    unlockAge: 5, // Industrial
    battleMod: { ranged: 2.40, antiDefense: 1.60 },
  },
  titans: {
    name: 'War Titans',
    desc: 'Towering autonomous engines of destruction.',
    flavor: 'Each titan is a fortress that walks to you. Few weapons can scratch them; nothing they target survives.',
    unlockAge: 7, // Atomic
    battleMod: { attack: 2.60, defense: 2.0, elite: 1.50 },
    requires: { focusOr: ['industry','magic','science'] },
  },
  nanoswarm: {
    name: 'Nanite Swarm',
    desc: 'A self-replicating cloud that devours armor and flesh alike.',
    flavor: 'Invisible, tireless, and merciless. The nanite swarm corrodes the enemy before the battle and consumes them during it.',
    unlockAge: 8, // Information
    battleMod: { attack: 2.20, antiDefense: 1.80, preBattle: 0.50 },
    requires: { focusOr: ['science','industry'] },
  },
  orbital: {
    name: 'Orbital Strike',
    desc: 'Fire from the heavens. The ultimate ranged weapon.',
    flavor: 'When you own the high ground of orbit, the battle is a formality. The enemy chooses only where to die.',
    unlockAge: 9, // Stellar
    battleMod: { ranged: 3.0, antiDefense: 2.0, attack: 1.50 },
    requires: { focusOr: ['science','industry'] },
  },
};

const GOVERNMENTS = {
  monarchy: {
    name: 'Monarchy',
    desc: 'Stable but ruler-dependent — golden ages and dark ages alike.',
    flavor: 'One crown, one fate. A brilliant monarch ushers in a golden age; a fool drags the realm down with them. Expect extremes.',
    mods: { stability: 1.10, eventVariance: 1.30 },
  },
  republic: {
    name: 'Republic',
    desc: 'Slow to decide, but strong over the long run.',
    flavor: 'Power shared is power preserved. Debate slows the republic\'s hand in war, but its institutions outlast any single leader.',
    mods: { research: 1.15, gold: 1.10, armyGrowth: 0.90 },
  },
  theocracy: {
    name: 'Theocracy',
    desc: 'Faith is law. Devastating paired with the Faith focus.',
    flavor: 'The divine rules through mortal hands. A theocracy welds morale and obedience into a single unbreakable instrument.',
    mods: { morale: 1.20, faithGen: 1.40, research: 0.92 },
  },
  tribal: {
    name: 'Tribal Confederacy',
    desc: 'Fast, aggressive, and fierce — with a low ceiling.',
    flavor: 'Loyalty to blood and chief, not flag. Tribes raid and grow with savage speed but struggle to build anything that lasts.',
    mods: { armyGrowth: 1.20, growth: 1.10, research: 0.80 },
  },
  hive: {
    name: 'Hive Collective',
    desc: 'No dissent, no surprises. Relentlessly steady.',
    flavor: 'A single will across countless bodies. The hive knows neither rebellion nor inspiration — only the slow, certain grind of consensus.',
    mods: { stability: 1.50, eventVariance: 0.40, research: 0.95 },
    requires: { race: ['constructs','lizardfolk','goblins','insectoids','undead'] },
  },
  democracy: {
    name: 'Democracy',
    desc: 'Free and inventive, but reluctant to militarize.',
    flavor: 'Every voice counts, and that is both the strength and the burden. Democracies innovate and endure, but rarely rush to war.',
    mods: { research: 1.10, stability: 1.10, morale: 1.10, gold: 1.05, armyGrowth: 0.85 },
  },
  empire: {
    name: 'Empire',
    desc: 'Built for conquest. Expansion is the state religion.',
    flavor: 'Borders are merely the edge of what has not yet been taken. The imperial machine is forged to march, annex, and march again.',
    mods: { armyGrowth: 1.25, stability: 1.10, gold: 1.10, research: 0.95, eventVariance: 1.20 },
  },
  autocracy: {
    name: 'Autocracy',
    desc: 'An iron fist — huge armies, brittle peace.',
    flavor: 'Fear keeps the order and fear builds the army. The autocrat\'s grip is absolute until, all at once, it is not.',
    mods: { armyGrowth: 1.30, stability: 0.95, morale: 0.95, research: 0.90, eventVariance: 1.40 },
  },
  technocracy: {
    name: 'Technocracy',
    desc: 'Rule by the brilliant. Research above all.',
    flavor: 'The experts govern, and progress is policy. A technocracy out-thinks every rival, even if its people feel more like data than citizens.',
    mods: { research: 1.25, weaponTech: 1.10, stability: 1.05, morale: 0.95, faithGen: 0.80 },
  },
  federation: {
    name: 'Federation',
    desc: 'Many states, one banner. Prosperous and resilient.',
    flavor: 'Strength through union. A federation pools wealth and wisdom across its members, slow to anger but very hard to topple.',
    mods: { gold: 1.15, research: 1.10, stability: 1.15, diplomacy: 1.20, armyGrowth: 0.90 },
  },
  horde: {
    name: 'Horde',
    desc: 'Endless aggression and growth. No brakes, no ceiling on chaos.',
    flavor: 'A nation that is always on the move and always at war. The horde swells and strikes without pause — and without much thought.',
    mods: { armyGrowth: 1.35, growth: 1.15, research: 0.75, stability: 0.90, eventVariance: 1.30 },
  },
};

const BIOMES = {
  forest: {
    name: 'Forest', terrain: 'forest',
    desc: 'Timber and game. Balanced and forgiving.',
    flavor: 'Endless canopy rich in wood and quarry, sheltering settlements from the wind and the eye.',
    mods: { food: 1.10, wood: 1.50, metal: 0.80 },
    color: '#2d5a3a', colorAlt: '#3a6b47', feature: '#4a7a55',
  },
  mountain: {
    name: 'Mountain', terrain: 'mountain',
    desc: 'Deep metals and natural fortresses. Hungry and slow.',
    flavor: 'Iron bones beneath stone skin. Hard to farm, harder to conquer — every peak is a wall.',
    mods: { food: 0.70, metal: 1.50, defense: 1.30 },
    color: '#5a5a5a', colorAlt: '#6b6b6b', feature: '#888888',
  },
  desert: {
    name: 'Desert', terrain: 'desert',
    desc: 'Sparse now; oil, gems and gold later.',
    flavor: 'A patient land. The desert starves the early settler and enriches the one who endures to dig deep.',
    mods: { food: 0.60, gold: 1.20, lateGold: 1.50 },
    color: '#c9a96b', colorAlt: '#d6b878', feature: '#a8893f',
  },
  tundra: {
    name: 'Tundra', terrain: 'tundra',
    desc: 'Harsh, defensible, and unyielding.',
    flavor: 'Frozen ground that gives little and forgives nothing. Only the hardy carve a home from the ice.',
    mods: { food: 0.55, metal: 1.10, defense: 1.10 },
    color: '#a8b5c4', colorAlt: '#bcc6d1', feature: '#e0e6ec',
  },
  plains: {
    name: 'Plains', terrain: 'plains',
    desc: 'Abundant food and easy expansion. No cover.',
    flavor: 'Open, golden, and generous. Crops and armies grow fast here — and there is nowhere to hide from either.',
    mods: { food: 1.40, defense: 0.80, armyGrowth: 1.10 },
    color: '#7a9a5a', colorAlt: '#8aaa6a', feature: '#a0c073',
  },
  swamp: {
    name: 'Swamp', terrain: 'swamp',
    desc: 'Disease and raw magic in the mire.',
    flavor: 'Fetid water and whispering reeds. Sickness festers here, but so do the strange energies mages crave.',
    mods: { food: 0.85, magicGen: 1.30, growth: 0.90 },
    color: '#4a5a3a', colorAlt: '#556a45', feature: '#6a7d4a',
  },
  coastal: {
    name: 'Coastal', terrain: 'coast',
    desc: 'Trade, food, and naval reach.',
    flavor: 'Where land meets the trade winds. Harbors fill with grain and gold, and the sea is a road to everywhere.',
    mods: { food: 1.20, gold: 1.30, trade: 1.40 },
    color: '#5a8a6a', colorAlt: '#6a9a78', feature: '#d8c56a',
  },
  volcanic: {
    name: 'Volcanic', terrain: 'volcanic',
    desc: 'Fabulously metal-rich. Periodically catastrophic.',
    flavor: 'Black glass and molten veins. The richest ore in the world, guarded by the mountain\'s temper.',
    mods: { food: 0.50, metal: 1.80, gold: 1.20 },
    color: '#4a3232', colorAlt: '#5a3c3c', feature: '#c43a1a',
  },
  jungle: {
    name: 'Jungle', terrain: 'jungle',
    desc: 'Lush, defensible, magic-soaked — and disease-ridden.',
    flavor: 'A riot of green that hides as much as it feeds. Vines choke the careless and the air hums with wild magic.',
    mods: { food: 1.20, wood: 1.40, magicGen: 1.15, defense: 1.10, metal: 0.70 },
    color: '#1f4d2b', colorAlt: '#286038', feature: '#3f8a4a',
  },
  savanna: {
    name: 'Savanna', terrain: 'savanna',
    desc: 'Sweeping grassland — fast herds, fast armies.',
    flavor: 'Sun-baked plains stretching to the horizon. Grazing is rich and warbands raised here move like wildfire.',
    mods: { food: 1.25, armyGrowth: 1.15, gold: 1.10, defense: 0.85, wood: 0.70 },
    color: '#9a8a4a', colorAlt: '#aa9a55', feature: '#c0b070',
  },
  steppe: {
    name: 'Steppe', terrain: 'steppe',
    desc: 'Nomad country — horse, herd, and raid.',
    flavor: 'Cold, windswept grasslands made for riders. Mobility is everything; walls mean nothing.',
    mods: { food: 1.10, armyGrowth: 1.25, growth: 1.05, defense: 0.75, metal: 0.90 },
    color: '#8a8a5a', colorAlt: '#999a6a', feature: '#b0b080',
  },
  highlands: {
    name: 'Highlands', terrain: 'highlands',
    desc: 'Green hills and crags — defensible and mineral-rich.',
    flavor: 'Rolling moors over stubborn stone. Hard to march through, easy to defend, and seamed with good ore.',
    mods: { food: 0.90, metal: 1.25, defense: 1.25, wood: 1.10 },
    color: '#4a6a4a', colorAlt: '#557a55', feature: '#6a8a5a',
  },
  archipelago: {
    name: 'Archipelago', terrain: 'archipelago',
    desc: 'Scattered isles — superb trade, natural sea walls.',
    flavor: 'A constellation of islands ringed by warm shallows. The sea both feeds and fortifies those who learn to sail it.',
    mods: { food: 1.15, gold: 1.25, trade: 1.45, defense: 1.20, metal: 0.70 },
    color: '#4a8a7a', colorAlt: '#56998a', feature: '#d4c898',
  },
  badlands: {
    name: 'Badlands', terrain: 'badlands',
    desc: 'Cracked red rock — ore and gold beneath the dust.',
    flavor: 'A scorched maze of canyons and mesas. Little grows, but the bones of the earth lie close to the surface.',
    mods: { food: 0.55, metal: 1.30, gold: 1.15, lateGold: 1.30, defense: 1.05 },
    color: '#8a5a3a', colorAlt: '#9a6a45', feature: '#b07a4a',
  },
  taiga: {
    name: 'Taiga', terrain: 'taiga',
    desc: 'Snow-laden pine forest — timber in a frozen land.',
    flavor: 'Dark evergreens under endless snow. Wood is plentiful and the cold keeps the faint-hearted away.',
    mods: { food: 0.80, wood: 1.40, metal: 1.10, defense: 1.10 },
    color: '#3a5048', colorAlt: '#445a50', feature: '#5a7060',
  },
};

const TECH_AGES = [
  { name: 'Stone',        knowledgeRequired: 0,      armyTechMult: 1.0,  desc: 'Flint, fire, and the first walls.' },
  { name: 'Bronze',       knowledgeRequired: 100,    armyTechMult: 1.4,  desc: 'Alloyed blades and the first cities.' },
  { name: 'Iron',         knowledgeRequired: 280,    armyTechMult: 1.9,  desc: 'Iron arms and disciplined legions.' },
  { name: 'Medieval',     knowledgeRequired: 600,    armyTechMult: 2.5,  desc: 'Castles, knights, and steel.' },
  { name: 'Renaissance',  knowledgeRequired: 1100,   armyTechMult: 3.2,  desc: 'Gunpowder, science, and gold.' },
  { name: 'Industrial',   knowledgeRequired: 1900,   armyTechMult: 4.2,  desc: 'Steam, rail, and the factory line.' },
  { name: 'Modern',       knowledgeRequired: 3000,   armyTechMult: 5.5,  desc: 'Mechanized war and mass production.' },
  { name: 'Atomic',       knowledgeRequired: 6000,   armyTechMult: 6.8,  desc: 'Splitting the atom; rewriting war.' },
  { name: 'Information',  knowledgeRequired: 12000,  armyTechMult: 8.2,  desc: 'Networks, drones, and smart steel.' },
  { name: 'Stellar',      knowledgeRequired: 28000,  armyTechMult: 9.8,  desc: 'Orbit, fusion, and the high ground of space.' },
  { name: 'Singularity',  knowledgeRequired: 60000,  armyTechMult: 11.5, desc: 'Self-improving minds beyond mortal grasp.' },
  { name: 'Transcendent', knowledgeRequired: 150000, armyTechMult: 13.5, desc: 'Reality itself becomes a tool of war.' },
];

// ============================================================
// EVENTS — random cultural / disaster / political happenings.
// `tag` color-codes the event in the log and timeline.
// ============================================================
const EVENTS = {
  goldenAge: { name: 'Golden Age', desc: 'A flourishing of art and learning.', effect: { knowledge: 1.5, morale: 20, stability: 10 }, weight: 3, tag: 'cultural' },
  scientificBreakthrough: { name: 'Scientific Breakthrough', desc: 'A revolutionary discovery.', effect: { knowledge: 2.0 }, weight: 4, tag: 'tech' },
  religiousRevival: { name: 'Religious Revival', desc: 'Faith sweeps the populace.', effect: { faith: 2.0, morale: 15 }, weight: 3, tag: 'cultural' },
  schism: { name: 'Religious Schism', desc: 'The faithful are divided.', effect: { stability: -25, faith: -1.0 }, weight: 2, tag: 'cultural' },
  plague: { name: 'Plague', desc: 'Disease ravages the population.', effect: { populationPct: -0.18, morale: -15 }, weight: 3, tag: 'disaster' },
  successionCrisis: { name: 'Succession Crisis', desc: 'A power vacuum at the top.', effect: { stability: -30, morale: -10 }, weight: 2, tag: 'cultural' },
  greatLeader: { name: 'Great Leader Emerges', desc: 'A figure who reshapes the age.', effect: { morale: 25, stability: 15, armyGrowth: 1.3 }, weight: 2, tag: 'major' },
  famine: { name: 'Famine', desc: 'The harvest fails.', effect: { populationPct: -0.12, food: -0.5 }, weight: 3, tag: 'disaster' },
  rebellion: { name: 'Rebellion', desc: 'The people rise up.', effect: { stability: -35, armyPct: -0.10 }, weight: 2, tag: 'major' },
  windfall: { name: 'Trade Windfall', desc: 'Markets boom.', effect: { gold: 2.0, morale: 10 }, weight: 3, tag: 'cultural' },
  migration: { name: 'Great Migration', desc: 'Settlers pour in from afar.', effect: { populationPct: 0.10, stability: -8 }, weight: 2, tag: 'cultural' },
  grandWonder: { name: 'Grand Wonder', desc: 'A monument for the ages is raised.', effect: { knowledge: 1.3, morale: 22, stability: 15 }, weight: 1, tag: 'major' },
  // biome-specific (delivered via the disaster system)
  eruption: { name: 'Volcanic Eruption', desc: 'The earth burns.', effect: { populationPct: -0.15, settlementDamage: 0.3 }, weight: 4, tag: 'disaster', biome: 'volcanic' },
  blizzard: { name: 'Great Blizzard', desc: 'A winter without end.', effect: { populationPct: -0.08, food: -0.4 }, weight: 4, tag: 'disaster', biome: 'tundra' },
  drought: { name: 'Drought', desc: 'The wells run dry.', effect: { populationPct: -0.10, food: -0.6 }, weight: 4, tag: 'disaster', biome: 'desert' },
  flood: { name: 'Great Flood', desc: 'Rivers swallow the lowlands.', effect: { populationPct: -0.10, settlementDamage: 0.2 }, weight: 4, tag: 'disaster', biome: 'swamp' },
  wildfire: { name: 'Wildfire', desc: 'Flame races through the wilds.', effect: { populationPct: -0.10, food: -0.5, settlementDamage: 0.2 }, weight: 4, tag: 'disaster', biome: 'jungle' },
  sandstorm: { name: 'Sandstorm', desc: 'A wall of grit buries the land.', effect: { populationPct: -0.07, food: -0.35 }, weight: 4, tag: 'disaster', biome: 'steppe' },
};

// ============================================================
// STAT METADATA — drives the stat-line UI in the picker.
// dir:  +1 = higher is better (green), -1 = lower is better,
//        0 = neutral (shown grey).
// ============================================================
const STAT_META = {
  research:     { label: 'Research',     dir: 1 },
  growth:       { label: 'Pop. Growth',  dir: 1 },
  military:     { label: 'Military',      dir: 1 },
  lifespan:     { label: 'Lifespan',      dir: 1 },
  magic:        { label: 'Innate Magic',  dir: 1 },
  defense:      { label: 'Defense',       dir: 1 },
  metal:        { label: 'Metal',         dir: 1 },
  wood:         { label: 'Wood',          dir: 1 },
  food:         { label: 'Food',          dir: 1 },
  gold:         { label: 'Gold',          dir: 1 },
  lateGold:     { label: 'Late-game Gold',dir: 1 },
  scouting:     { label: 'Scouting',      dir: 1 },
  armyGrowth:   { label: 'Army Growth',   dir: 1 },
  weaponTech:   { label: 'Weapon Tech',   dir: 1 },
  economy:      { label: 'Economy',       dir: 1 },
  morale:       { label: 'Morale',        dir: 1 },
  stability:    { label: 'Stability',     dir: 1 },
  faithGen:     { label: 'Faith',         dir: 1 },
  magicGen:     { label: 'Magic Output',  dir: 1 },
  diplomacy:    { label: 'Diplomacy',     dir: 1 },
  trade:        { label: 'Trade',         dir: 1 },
  environment:  { label: 'Eco-harmony',   dir: 1 },
  popCapMod:    { label: 'Pop. Cap',      dir: 1 },
  eventVariance:{ label: 'Event Swing',   dir: 0 },
};

// Friendly labels for weapon battle effects (qualitative tags).
const BATTLE_EFFECT_LABELS = {
  ranged:      'Ranged firepower',
  shock:       'Shock charge',
  attack:      'Raw attack',
  defense:     'Battlefield armor',
  elite:       'Elite heroes',
  antiDefense: 'Anti-fortification',
  fear:        'Inflicts fear',
  morale:      'Morale swing',
  preBattle:   'Pre-battle attrition',
  raise:       'Raises the dead',
};
