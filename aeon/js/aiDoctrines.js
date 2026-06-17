// ============================================================
// AEON :: AI RIVAL DOCTRINES  (Feature 3)
// Each rival civ gets a persistent `doctrine` that biases the NEW systems
// (diplomacy memory, convergence preparation, the final battle) — a modifier
// layer, never a rewrite of the base sim (which has no turn-by-turn AI to
// override; civs coexist and fight once at the end). With the new systems
// off, doctrines simply sit unused and the base sim is unchanged.
// ============================================================

const DOCTRINES = {
  expansionist: {
    name: 'Expansionist',
    desc: 'Territory above all. Pushes borders relentlessly; never accepts peace without land. Overextends.',
    aggression: 0.80, peaceNeedsLand: true, honors: 0.55, grievanceSensitivity: 1.0,
    battle: { atk: 1.12, def: 0.94 }, resourceLean: 'expansion',
    weakness: 'Overextension — strong everywhere, decisive nowhere.',
  },
  theocratic: {
    name: 'Theocratic',
    desc: 'Religious logic governs all. Wars over faith even when outmatched; manipulable through religious diplomacy.',
    aggression: 0.65, faithDriven: true, honors: 0.70, grievanceSensitivity: 1.4,
    battle: { atk: 1.08, def: 1.08 }, resourceLean: 'faith',
    weakness: 'Brittle if its faith is discredited.',
  },
  isolationist: {
    name: 'Isolationist',
    desc: 'Refuses diplomacy, builds deep defenses, then launches one devastating surprise war at peak strength.',
    aggression: 0.30, surpriseWar: true, honors: 0.85, grievanceSensitivity: 0.7,
    battle: { atk: 1.04, def: 1.22 }, resourceLean: 'defense',
    weakness: 'Predictable once the sleeping giant finally stirs.',
  },
  mercantile: {
    name: 'Mercantile',
    desc: 'Obsessed with trade dominance. Funds rivals-of-rivals and strangles enemies economically. Militarily weak.',
    aggression: 0.25, fundsProxies: true, honors: 0.60, grievanceSensitivity: 1.1,
    battle: { atk: 0.92, def: 1.02 }, resourceLean: 'wealth',
    weakness: 'Thin armies — beat them before the gold decides it.',
  },
  warmonger: {
    name: 'Warmonger',
    desc: 'Pure aggression, attacks regardless of readiness. Low diplomacy ceiling. The world coalitions against them.',
    aggression: 0.98, coalitionMagnet: true, honors: 0.30, grievanceSensitivity: 1.3,
    battle: { atk: 1.20, def: 0.88 }, resourceLean: 'military',
    weakness: 'High early threat; often self-destructs mid-game.',
  },
  survivalist: {
    name: 'Survivalist',
    desc: 'Mirrors the player, patches exploits, waits. No obvious weakness. (Hard / legendary.)',
    aggression: 0.50, mirrorsPlayer: true, honors: 0.75, grievanceSensitivity: 1.0,
    battle: { atk: 1.06, def: 1.10 }, resourceLean: 'balanced',
    weakness: 'None obvious — it adapts to yours.',
  },
};

// Loose race → doctrine affinities for flavourful random assignment.
const RACE_DOCTRINE_AFFINITY = {
  orcs: ['warmonger', 'expansionist'], infernals: ['warmonger', 'theocratic'],
  goblins: ['mercantile', 'warmonger'], merfolk: ['mercantile', 'isolationist'],
  elves: ['isolationist', 'theocratic'], dwarves: ['isolationist', 'survivalist'],
  undead: ['survivalist', 'isolationist'], humans: ['expansionist', 'mercantile'],
  giants: ['isolationist', 'warmonger'], fae: ['theocratic', 'survivalist'],
  beastfolk: ['expansionist', 'warmonger'], lizardfolk: ['survivalist', 'expansionist'],
  frostborn: ['isolationist', 'survivalist'], avians: ['mercantile', 'expansionist'],
  constructs: ['survivalist', 'isolationist'], insectoids: ['expansionist', 'survivalist'],
};

const AiDoctrines = {
  active: false,

  init() {
    this.active = true;
  },

  // Assign a doctrine to every rival. The primary antagonist takes the doctrine
  // chosen in Options; the others are assigned by race affinity / RNG.
  assign(civs, rng) {
    if (!civs || !civs.length) return;
    const playerSide = gameConfig.playerSide;
    const rivals = civs.filter(c => c.side !== playerSide);

    // The player's own civ carries no doctrine (they are the doctrine).
    const player = civs.find(c => c.side === playerSide);
    if (player) player.doctrine = null;

    if (!rivals.length) return;

    // First rival (by A→B→C order) is the primary antagonist.
    const antagonist = rivals[0];
    antagonist.doctrine = DOCTRINES[gameConfig.antagonistDoctrine] ? gameConfig.antagonistDoctrine : 'expansionist';
    antagonist.isAntagonist = true;
    if (typeof Game !== 'undefined') Game._antagonistSide = antagonist.side;

    for (let i = 1; i < rivals.length; i++) {
      const r = rivals[i];
      const aff = RACE_DOCTRINE_AFFINITY[r.race];
      r.doctrine = (aff && rng ? rng.pick(aff) : (rng ? rng.pick(Object.keys(DOCTRINES)) : 'expansionist'));
      r.isAntagonist = false;
    }
  },

  get(civ) {
    return (civ && civ.doctrine && DOCTRINES[civ.doctrine]) || null;
  },

  // Battlefield modifier for the convergence final battle.
  battleModifier(civ, role) {
    const d = this.get(civ);
    if (!d) return 1.0;
    if (role === 'invader' || role === 'attacker') return d.battle.atk;
    if (role === 'defender') return d.battle.def;
    return (d.battle.atk + d.battle.def) / 2;
  },

  // Will this rival entertain diplomacy at the given relationship score?
  acceptsDiplomacy(civ, relationshipScore) {
    const d = this.get(civ);
    if (!d) return true;
    if (d.mirrorsPlayer) return relationshipScore >= -40;
    const ceiling = d.aggression > 0.9 ? -60 : d.aggression > 0.7 ? -30 : 0;
    return relationshipScore >= ceiling;
  },

  honorsAgreements(civ, rng) {
    const d = this.get(civ);
    if (!d) return true;
    return (rng ? rng.next() : Math.random()) < d.honors;
  },

  // One-line description of a rival's stance toward the player (for warnings).
  describeStance(civ, relationshipScore) {
    const d = this.get(civ);
    const label = d ? d.name : 'Independent';
    let mood;
    if (relationshipScore <= -40) mood = 'openly hostile';
    else if (relationshipScore <= -15) mood = 'resentful';
    else if (relationshipScore < 15) mood = 'wary';
    else if (relationshipScore < 40) mood = 'cordial';
    else mood = 'firmly allied';
    return `${label}, ${mood}`;
  },

  // What is this rival doing to prepare for the Convergence? (Doctrine-flavored.)
  prepActivity(civ, rng) {
    const d = this.get(civ);
    const lean = d ? d.resourceLean : 'balanced';
    const opts = {
      expansion: ['is annexing every neutral border province within reach',
                  'has stretched its armies thin across a dozen new frontiers'],
      faith:     ['has declared a holy war of preparation, conscripting the devout',
                  'is consecrating its legions for the reckoning to come'],
      defense:   ['is digging in — vast fortress lines and stockpiled granaries',
                  'has gone silent behind a wall of new redoubts'],
      wealth:    ['is buying mercenaries and bribing your would-be allies',
                  'is flooding the markets to starve your war chest'],
      military:  ['is mobilizing everything that can hold a weapon, readiness be damned',
                  'has put its entire economy on a war footing'],
      balanced:  ['is quietly matching every move you make',
                  'is patching its weaknesses and waiting for yours'],
    };
    const list = opts[lean] || opts.balanced;
    return (rng ? rng.pick(list) : list[0]);
  },
};

if (typeof window !== 'undefined') {
  window.DOCTRINES = DOCTRINES;
  window.AiDoctrines = AiDoctrines;
}
