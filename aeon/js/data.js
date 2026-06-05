// ============================================================
// AEON :: DATA DEFINITIONS
// All races, focuses, weapons, governments, biomes, tech ages.
// Modifiers stack multiplicatively when applied.
// ============================================================

const RACES = {
  humans: {
    name: 'Humans',
    desc: 'Balanced. Fast research, no specialization.',
    mods: { research: 1.10, growth: 1.05, military: 1.0, lifespan: 1.0 },
    biomePref: ['plains','forest','coastal'],
  },
  orcs: {
    name: 'Orcs',
    desc: 'Brutal warriors. Strong but slow learners.',
    mods: { research: 0.80, growth: 1.20, military: 1.30, lifespan: 0.85 },
    biomePref: ['plains','mountain','volcanic'],
  },
  elves: {
    name: 'Elves',
    desc: 'Long-lived, magically attuned, slow to reproduce.',
    mods: { research: 1.15, growth: 0.70, military: 0.95, lifespan: 1.50, magic: 1.40 },
    biomePref: ['forest','coastal'],
  },
  dwarves: {
    name: 'Dwarves',
    desc: 'Master miners and engineers. Fortify everything.',
    mods: { research: 1.05, growth: 0.90, military: 1.10, defense: 1.40, metal: 1.50 },
    biomePref: ['mountain','volcanic'],
  },
  lizardfolk: {
    name: 'Lizardfolk',
    desc: 'Heat-adapted, regenerative. Cold kills them.',
    mods: { research: 0.95, growth: 1.10, military: 1.05 },
    biomePref: ['desert','swamp'],
    biomePenalty: { tundra: 0.6 },
  },
  frostborn: {
    name: 'Frostborn',
    desc: 'Hardy people of the ice. Wither in heat.',
    mods: { research: 0.95, growth: 0.95, military: 1.15, defense: 1.10 },
    biomePref: ['tundra','mountain'],
    biomePenalty: { desert: 0.5, volcanic: 0.7 },
  },
  avians: {
    name: 'Avians',
    desc: 'Winged folk. Swift, but fragile, with low population cap.',
    mods: { research: 1.05, growth: 0.85, military: 0.95, scouting: 2.0 },
    biomePref: ['mountain','plains','coastal'],
    popCapMod: 0.75,
  },
  constructs: {
    name: 'Constructs',
    desc: 'Built, not born. No food needed. Need metal + knowledge to grow.',
    mods: { research: 1.0, growth: 0.0, military: 1.10, defense: 1.20 },
    biomePref: ['mountain','desert','volcanic'],
    special: 'constructed', // unique growth model
  },
};

const FOCUSES = {
  military: {
    name: 'Military',
    desc: 'Fast weapons tech, large standing armies, weaker economy.',
    mods: { armyGrowth: 1.40, weaponTech: 1.30, economy: 0.85, research: 0.95 },
  },
  science: {
    name: 'Science',
    desc: 'Fastest tech tree. Slow start, devastating late game.',
    mods: { research: 1.50, weaponTech: 1.10, economy: 1.0, armyGrowth: 0.90 },
  },
  faith: {
    name: 'Faith',
    desc: 'High morale and stability. Can launch holy wars.',
    mods: { morale: 1.40, stability: 1.30, faithGen: 2.0, research: 0.90 },
  },
  trade: {
    name: 'Trade',
    desc: 'Wealth accumulates fast. Weak armies, rich coffers.',
    mods: { gold: 1.60, economy: 1.30, armyGrowth: 0.85, diplomacy: 1.30 },
  },
  magic: {
    name: 'Magic',
    desc: 'Unlocks rituals and summons. Race-dependent.',
    mods: { magicGen: 1.80, research: 1.10, armyGrowth: 0.95 },
    requires: ['elves','humans','lizardfolk','frostborn','avians'],
  },
  industry: {
    name: 'Industry',
    desc: 'Maximum production. Slowly poisons the biome.',
    mods: { economy: 1.50, weaponTech: 1.20, stability: 0.92, environment: 0.80 },
  },
  naturalism: {
    name: 'Naturalism',
    desc: 'Sustainable. Bonuses scale with biome harmony.',
    mods: { stability: 1.20, growth: 1.10, environment: 1.30, weaponTech: 0.85 },
  },
};

const WEAPONS = {
  gunpowder: {
    name: 'Gunpowder Legions',
    desc: 'Ranged dominance. Devastating volleys.',
    unlockAge: 5, // Renaissance
    battleMod: { ranged: 2.0, morale: 1.10 },
  },
  beasts: {
    name: 'War Beasts',
    desc: 'Apex predators bred for war.',
    unlockAge: 3, // Iron
    battleMod: { shock: 1.80, fear: 1.30 },
  },
  siege: {
    name: 'Siege Engineering',
    desc: 'Breaks walls, ends sieges.',
    unlockAge: 3,
    battleMod: { antiDefense: 2.50, attack: 1.20 },
  },
  necromancy: {
    name: 'Necromancy',
    desc: 'Raise the fallen as your soldiers.',
    unlockAge: 4,
    battleMod: { raise: 0.40, fear: 1.50 },
    requires: { focus: ['magic','faith'] },
  },
  mech: {
    name: 'Mechanized Infantry',
    desc: 'Industrial-age war machines.',
    unlockAge: 6, // Industrial
    battleMod: { attack: 2.20, defense: 1.60 },
    requires: { focus: ['industry','science'] },
  },
  champions: {
    name: 'Divine Champions',
    desc: 'A handful of heroes worth a thousand soldiers.',
    unlockAge: 4,
    battleMod: { elite: 3.0, morale: 1.30 },
  },
  plague: {
    name: 'Plague Bearers',
    desc: 'Biological warfare. Weakens before the battle even starts.',
    unlockAge: 4,
    battleMod: { preBattle: 0.30, morale: 0.85 },
  },
  aerial: {
    name: 'Aerial Bombardment',
    desc: 'Strike from above. Demoralizes defenders.',
    unlockAge: 5,
    battleMod: { ranged: 2.20, antiDefense: 1.40 },
    requires: { race: ['avians'], focusOr: ['industry','magic'] },
  },
};

const GOVERNMENTS = {
  monarchy: {
    name: 'Monarchy',
    desc: 'Stable. Ruler-dependent — golden ages and dark ages alike.',
    mods: { stability: 1.10, eventVariance: 1.30 },
  },
  republic: {
    name: 'Republic',
    desc: 'Slower decisions, faster long-term progress.',
    mods: { research: 1.15, gold: 1.10, armyGrowth: 0.90 },
  },
  theocracy: {
    name: 'Theocracy',
    desc: 'Faith is law. Powerful with Faith focus.',
    mods: { morale: 1.20, faithGen: 1.40, research: 0.92 },
  },
  tribal: {
    name: 'Tribal',
    desc: 'Fast and aggressive. Low ceiling.',
    mods: { armyGrowth: 1.20, growth: 1.10, research: 0.80 },
  },
  hive: {
    name: 'Hive Collective',
    desc: 'No dissent, no innovation spikes. Steady.',
    mods: { stability: 1.50, eventVariance: 0.40, research: 0.95 },
    requires: { race: ['constructs','lizardfolk'] },
  },
};

const BIOMES = {
  forest: {
    name: 'Forest',
    desc: 'Wood + game. Balanced.',
    mods: { food: 1.10, wood: 1.50, metal: 0.80 },
    color: '#2d5a3a',
    colorAlt: '#3a6b47',
    feature: '#4a7a55',
  },
  mountain: {
    name: 'Mountain',
    desc: 'Metals and defense. Slow growth.',
    mods: { food: 0.70, metal: 1.50, defense: 1.30 },
    color: '#5a5a5a',
    colorAlt: '#6b6b6b',
    feature: '#888888',
  },
  desert: {
    name: 'Desert',
    desc: 'Sparse. Late-game oil and gems.',
    mods: { food: 0.60, gold: 1.20, lateGold: 1.50 },
    color: '#c9a96b',
    colorAlt: '#d6b878',
    feature: '#a8893f',
  },
  tundra: {
    name: 'Tundra',
    desc: 'Harsh and unyielding.',
    mods: { food: 0.55, metal: 1.10, defense: 1.10 },
    color: '#a8b5c4',
    colorAlt: '#bcc6d1',
    feature: '#e0e6ec',
  },
  plains: {
    name: 'Plains',
    desc: 'Abundant food, no defense.',
    mods: { food: 1.40, defense: 0.80, armyGrowth: 1.10 },
    color: '#7a9a5a',
    colorAlt: '#8aaa6a',
    feature: '#a0c073',
  },
  swamp: {
    name: 'Swamp',
    desc: 'Disease and magic resources.',
    mods: { food: 0.85, magicGen: 1.30, growth: 0.90 },
    color: '#4a5a3a',
    colorAlt: '#556a45',
    feature: '#6a7d4a',
  },
  coastal: {
    name: 'Coastal',
    desc: 'Trade bonus, naval access.',
    mods: { food: 1.20, gold: 1.30, trade: 1.40 },
    color: '#3a6a8a',
    colorAlt: '#4a7a9a',
    feature: '#d4c898',
  },
  volcanic: {
    name: 'Volcanic',
    desc: 'Rich metals. Periodic eruptions.',
    mods: { food: 0.50, metal: 1.80, gold: 1.20 },
    color: '#5a3a3a',
    colorAlt: '#6b4747',
    feature: '#c43a1a',
  },
};

const TECH_AGES = [
  { name: 'Stone', knowledgeRequired: 0,    armyTechMult: 1.0 },
  { name: 'Bronze', knowledgeRequired: 100,  armyTechMult: 1.4 },
  { name: 'Iron', knowledgeRequired: 280,   armyTechMult: 1.9 },
  { name: 'Medieval', knowledgeRequired: 600, armyTechMult: 2.5 },
  { name: 'Renaissance', knowledgeRequired: 1100, armyTechMult: 3.2 },
  { name: 'Industrial', knowledgeRequired: 1900, armyTechMult: 4.2 },
  { name: 'Modern', knowledgeRequired: 3000, armyTechMult: 5.5 },
];

// ============================================================
// EVENTS — random cultural / disaster / political happenings
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
  // biome-specific
  eruption: { name: 'Volcanic Eruption', desc: 'The earth burns.', effect: { populationPct: -0.15, settlementDamage: 0.3 }, weight: 4, tag: 'disaster', biome: 'volcanic' },
  blizzard: { name: 'Great Blizzard', desc: 'A winter without end.', effect: { populationPct: -0.08, food: -0.4 }, weight: 4, tag: 'disaster', biome: 'tundra' },
  drought: { name: 'Drought', desc: 'The wells run dry.', effect: { populationPct: -0.10, food: -0.6 }, weight: 4, tag: 'disaster', biome: 'desert' },
  flood: { name: 'Great Flood', desc: 'Rivers swallow the lowlands.', effect: { populationPct: -0.10, settlementDamage: 0.2 }, weight: 4, tag: 'disaster', biome: 'swamp' },
};
