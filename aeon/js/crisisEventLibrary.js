// ============================================================
// AEON :: CRISIS EVENT LIBRARY  (Feature 2 data)
// 18 events covering the full 1,000-year span (windows are scaled
// to the actual run length at fire time). At least three are
// chainable: a choice sets a `flag`, and a follow-up event marked
// with `triggeredBy: <flag>` arms 100–200 years later.
//
// Effect schema (all optional, applied to the PLAYER civ):
//   population   : ±fraction   (e.g. -0.15  →  −15% population)
//   resources    : ±fraction   (scales gold / food / metal / wood)
//   military     : ±fraction   (scales army)
//   knowledge    : ±fraction   (scales knowledge pool)
//   loyalty      : { civilian?:pts, military?:pts }  (±stability / ±morale points)
//   relationship : ±points to the primary antagonist, or { A:±, B:±, C:± }
//   flag         : string stored in crisisHistory for chaining / legacy
// ============================================================

const CRISIS_EVENTS = [
  // ── The Meteor Strike — can fire across almost the whole run ──
  {
    id: 'meteor_strike',
    title: 'The Falling Star',
    minYear: 100, maxYear: 900,
    flavor: 'A streak of fire splits the night and the earth answers with a roar. A mountain of star-metal now smoulders in a crater where farmland used to be. Scholars and warlords alike covet what fell.',
    choices: [
      { label: 'Mine the star-metal', hint: 'Military up, but the crater land is lost',
        effect: { military: 0.18, resources: -0.10, flag: 'starmetal_forged' } },
      { label: 'Study the impact', hint: 'A leap in knowledge, slower army',
        effect: { knowledge: 0.25, military: -0.05, flag: 'star_studied' } },
      { label: 'Declare it an omen', hint: 'Faith rallies the people',
        effect: { loyalty: { civilian: 12, military: 8 } } },
    ],
  },

  // ── The Duskwood Plague (chainless, mid-early) ──
  {
    id: 'duskwood_plague',
    title: 'The Duskwood Plague',
    minYear: 200, maxYear: 400,
    flavor: 'A grey sickness creeps out of the Duskwood, and within a season the death-carts run nightly. The physicians argue while the graveyards fill. Something must be done before the cities empty.',
    choices: [
      { label: 'Quarantine the sick', hint: 'Save the population, shatter morale',
        effect: { population: -0.06, loyalty: { civilian: -18 } } },
      { label: 'Burn the infected districts', hint: 'Brutal, but it stops the spread',
        effect: { population: -0.16, loyalty: { civilian: -8, military: 6 }, flag: 'plague_pyres' } },
      { label: 'Pray and endure', hint: 'Faith holds; the toll is heavy',
        effect: { population: -0.22, loyalty: { civilian: 10 } } },
    ],
  },

  // ── The Wandering Army ──
  {
    id: 'wandering_army',
    title: 'The Wandering Army',
    minYear: 300, maxYear: 500,
    flavor: 'A leaderless host of veterans and brigands has drifted to your borders — thousands of swords with no banner. They will serve, or they will pillage. The choice, for now, is yours.',
    choices: [
      { label: 'Hire them on', hint: 'Army surges, treasury bleeds',
        effect: { military: 0.30, resources: -0.25, flag: 'mercenary_host' } },
      { label: 'Drive them off', hint: 'Costly border war, but no debts',
        effect: { military: -0.08, population: -0.03, loyalty: { military: 8 } } },
      { label: 'Point them at a rival', hint: 'They march on your antagonist instead',
        effect: { relationship: -14, flag: 'loosed_the_horde' } },
    ],
  },

  // ── The Refugee Wave ──
  {
    id: 'refugee_wave',
    title: 'The Refugee Wave',
    minYear: 200, maxYear: 600,
    flavor: 'Columns of the displaced stream toward your gates, fleeing a calamity beyond the horizon. They bring hungry mouths — and willing hands, and the gratitude of whoever sent them away.',
    choices: [
      { label: 'Welcome them all', hint: 'Population grows; a rival owes you',
        effect: { population: 0.10, resources: -0.08, relationship: 10, flag: 'sheltered_refugees' } },
      { label: 'Take only the skilled', hint: 'A measured boost to knowledge',
        effect: { population: 0.03, knowledge: 0.10 } },
      { label: 'Seal the borders', hint: 'No burden, but the world remembers',
        effect: { loyalty: { civilian: -6 }, relationship: -8, flag: 'closed_the_gates' } },
    ],
  },

  // ── The Drought ──
  {
    id: 'the_drought',
    title: 'The Long Drought',
    minYear: 100, maxYear: 600,
    flavor: 'The rains simply do not come. Rivers shrink to cracked mud and the granaries dwindle. Every choice now is a choice about who eats and who does not.',
    choices: [
      { label: 'Ration the granaries', hint: 'Stability falls, people survive',
        effect: { resources: -0.12, loyalty: { civilian: -10 } } },
      { label: 'Seize the temples’ stores', hint: 'Food now, faith later',
        effect: { population: -0.02, loyalty: { civilian: -14 }, flag: 'temples_raided' } },
      { label: 'Dig deep wells', hint: 'An investment that pays in knowledge',
        effect: { resources: -0.15, knowledge: 0.12 } },
    ],
  },

  // ── The Ancient Ruin Discovery ──
  {
    id: 'ancient_ruin',
    title: 'The Ancient Ruin',
    minYear: 100, maxYear: 800,
    flavor: 'Quarry-workers break into a vaulted hall older than memory, its walls dense with a script no living scholar can read. Something was sealed here on purpose. Curiosity and caution war in the council.',
    choices: [
      { label: 'Excavate fully', hint: 'Great knowledge — and an awakened risk',
        effect: { knowledge: 0.28, loyalty: { civilian: -6 }, flag: 'ruin_opened' } },
      { label: 'Loot the treasures', hint: 'Fill the coffers, leave the rest',
        effect: { resources: 0.20 } },
      { label: 'Seal it again', hint: 'Some doors are best left shut',
        effect: { loyalty: { civilian: 6 } } },
    ],
  },

  // ── The Suspicious Alliance ──
  {
    id: 'suspicious_alliance',
    title: 'The Suspicious Alliance',
    minYear: 250, maxYear: 600,
    flavor: 'Word arrives that two foreign powers have signed a pact in secret — and your envoys cannot agree on whether the ink is aimed at you. To act is to risk a war; to wait is to risk a knife.',
    choices: [
      { label: 'Send a counter-envoy', hint: 'Buy goodwill with one of them',
        effect: { resources: -0.10, relationship: 12, flag: 'courted_the_pact' } },
      { label: 'Mobilize quietly', hint: 'Be ready; they will notice',
        effect: { military: 0.12, relationship: -10 } },
      { label: 'Ignore the rumor', hint: 'Spend nothing, assume nothing',
        effect: { loyalty: { military: -4 } } },
    ],
  },

  // ── The Trade Route Collapse ──
  {
    id: 'trade_route_collapse',
    title: 'The Trade Route Collapse',
    minYear: 400, maxYear: 700,
    flavor: 'The great caravan road has gone silent — bandits, or a rival’s tariffs, or both. The markets that fed your treasury are starving, and the merchant houses are at your door demanding action.',
    choices: [
      { label: 'Escort the caravans', hint: 'Soldiers restore the flow of gold',
        effect: { military: -0.04, resources: 0.18 } },
      { label: 'Open a new sea lane', hint: 'Slow, but a lasting gain',
        effect: { resources: -0.06, knowledge: 0.10, flag: 'new_sea_lane' } },
      { label: 'Blame a rival', hint: 'Rally the people against an enemy',
        effect: { loyalty: { civilian: 8 }, relationship: -12 } },
    ],
  },

  // ── The Succession Crisis ──
  {
    id: 'succession_crisis',
    title: 'The Succession Crisis',
    minYear: 300, maxYear: 700,
    flavor: 'The old ruler is dead and the heirs are already sharpening more than their wits. Factions gather in the halls. How the throne is settled will echo for a generation.',
    choices: [
      { label: 'Crown the strongest heir', hint: 'Order through strength',
        effect: { loyalty: { civilian: 6, military: 10 } } },
      { label: 'Let the council decide', hint: 'Slower, but broadly legitimate',
        effect: { loyalty: { civilian: 12 }, military: -0.05 } },
      { label: 'Seize power yourself', hint: 'Absolute control, simmering resentment',
        effect: { military: 0.10, loyalty: { civilian: -16 }, flag: 'usurper_throne' } },
    ],
  },

  // ── The Mercenary Uprising ──
  {
    id: 'mercenary_uprising',
    title: 'The Mercenary Uprising',
    minYear: 500, maxYear: 800,
    flavor: 'The sellswords on your payroll have decided the pay is too thin and the loot too far. Armed, drilled, and inside your own walls, they want a renegotiation — at swordpoint.',
    triggeredBy: 'mercenary_host',   // far more likely if you once hired a mercenary host
    choices: [
      { label: 'Pay them off', hint: 'Empty the treasury, keep the peace',
        effect: { resources: -0.28 } },
      { label: 'Crush the revolt', hint: 'Bloody, decisive, costly in lives',
        effect: { military: -0.18, population: -0.04, loyalty: { military: -6 } } },
      { label: 'Turn them loose on a rival', hint: 'Make their problem someone else’s',
        effect: { military: -0.10, relationship: -16 } },
    ],
  },

  // ── The Spy Uncovered ──
  {
    id: 'spy_uncovered',
    title: 'The Spy Uncovered',
    minYear: 400, maxYear: 800,
    flavor: 'A trusted minister is unmasked as a foreign agent, their correspondence a roadmap of everything you thought secret. The court reels. The question is what to do with the thread now in your hand.',
    choices: [
      { label: 'Execute publicly', hint: 'A warning written in blood',
        effect: { loyalty: { civilian: 6, military: 6 }, relationship: -14 } },
      { label: 'Feed them false plans', hint: 'Turn the spy into your weapon',
        effect: { knowledge: 0.08, relationship: -6, flag: 'double_agent' } },
      { label: 'Quietly purge the court', hint: 'Root out the rot, unsettle the rest',
        effect: { loyalty: { civilian: -10 }, military: 0.06 } },
    ],
  },

  // ════════════ CHAIN 1: The Legendary Hero ════════════
  {
    id: 'legendary_hero',
    title: 'The Legendary Hero is Born',
    minYear: 150, maxYear: 700,
    flavor: 'A child is born under a comet, and by their twentieth year the songs have already begun — a warrior, a leader, a legend in the making. How your people raise them will shape what they become.',
    choices: [
      { label: 'Train them for war', hint: 'A champion who will return when it matters',
        effect: { military: 0.10, loyalty: { military: 12 }, flag: 'hero_warrior' } },
      { label: 'Educate them as a sage', hint: 'Wisdom now; a quieter legend',
        effect: { knowledge: 0.18, loyalty: { civilian: 8 }, flag: 'hero_sage' } },
      { label: 'Let them find their own path', hint: 'The people love them either way',
        effect: { loyalty: { civilian: 10, military: 6 }, flag: 'hero_freed' } },
    ],
  },
  {
    id: 'hero_returns',
    title: 'The Hero Returns',
    minYear: 150, maxYear: 950,
    flavor: 'After years abroad, the legend your people raised walks back through the gates — scarred, renowned, and trailing a following of their own. Their loyalty is a sword that cuts in whichever direction you point it.',
    triggeredBy: 'hero_warrior',   // primary chain; also armed by the other hero flags below
    choices: [
      { label: 'Name them warlord', hint: 'A surge of martial might and morale',
        effect: { military: 0.22, loyalty: { military: 16 }, flag: 'hero_champion' } },
      { label: 'Make them your envoy', hint: 'Their fame mends a broken friendship',
        effect: { relationship: 18, loyalty: { civilian: 8 }, flag: 'hero_champion' } },
      { label: 'Fear their ambition', hint: 'Sideline the legend; the people grieve',
        effect: { loyalty: { civilian: -14, military: -10 } } },
    ],
  },

  // ════════════ CHAIN 2: Sacred Grove → Grudge War ════════════
  {
    id: 'sacred_grove',
    title: 'The Sacred Grove',
    minYear: 300, maxYear: 500,
    flavor: 'The richest vein of timber and ore your surveyors have ever found lies beneath a grove a neighbouring people hold sacred. They have asked you, politely and only once, to leave it untouched.',
    choices: [
      { label: 'Seize the grove', hint: 'Riches now — and a grievance that festers',
        effect: { resources: 0.22, relationship: -25, flag: 'grove_seized' } },
      { label: 'Negotiate shared use', hint: 'Less wealth, lasting goodwill',
        effect: { resources: 0.08, relationship: 12 } },
      { label: 'Honour the grove', hint: 'Leave it; earn deep respect',
        effect: { relationship: 18, loyalty: { civilian: 6 }, flag: 'grove_honoured' } },
    ],
  },
  {
    id: 'grove_grudge_war',
    title: 'The Grudge of the Grove',
    minYear: 400, maxYear: 950,
    flavor: 'They have not forgotten the felled grove. A generation raised on that wound now marches under a banner of vengeance, and their envoy offers only one term: blood, or the land returned.',
    triggeredBy: 'grove_seized',
    choices: [
      { label: 'Return the land', hint: 'Swallow pride; the grudge is settled',
        effect: { resources: -0.18, relationship: 22, flag: 'grove_returned' } },
      { label: 'Pay reparations', hint: 'Gold buys an uneasy peace',
        effect: { resources: -0.24, relationship: 10 } },
      { label: 'Meet them in the field', hint: 'Win now, but the hatred only deepens',
        effect: { military: -0.10, loyalty: { military: 8 }, relationship: -18, flag: 'grudge_deepened' } },
    ],
  },

  // ════════════ CHAIN 3: The Schism → Resolution ════════════
  {
    id: 'the_schism',
    title: 'The Great Schism',
    minYear: 500, maxYear: 850,
    flavor: 'A doctrinal quarrel has split your faith down the middle, and both halves now claim to be the true one. Temples are barricaded. Families divided. The realm itself threatens to crack along the same line.',
    choices: [
      { label: 'Enforce one orthodoxy', hint: 'Unity by force; resentment lingers',
        effect: { loyalty: { civilian: -8, military: 6 }, flag: 'schism_enforced' } },
      { label: 'Permit both faiths', hint: 'Tolerance now; the rift stays open',
        effect: { loyalty: { civilian: -4 }, flag: 'schism_unresolved' } },
      { label: 'Convene a grand council', hint: 'Gamble on reconciliation',
        effect: { knowledge: 0.06, loyalty: { civilian: 4 }, flag: 'schism_unresolved' } },
    ],
  },
  {
    id: 'schism_resolution',
    title: 'The Reckoning of Faiths',
    minYear: 650, maxYear: 980,
    flavor: 'The unhealed schism comes to its crisis. The two faiths can no longer share a realm — one banner must rise, or the nation tears in two for good.',
    triggeredBy: 'schism_unresolved',
    choices: [
      { label: 'Forge a reunification', hint: 'A hard-won, lasting unity',
        effect: { loyalty: { civilian: 20, military: 8 }, flag: 'faith_reunified' } },
      { label: 'Accept a permanent split', hint: 'Lose people, keep the peace',
        effect: { population: -0.10, loyalty: { civilian: 6 }, flag: 'faith_split' } },
      { label: 'Purge the heretics', hint: 'Brutal closure; the world recoils',
        effect: { population: -0.07, loyalty: { military: 10 }, relationship: -12, flag: 'faith_purge' } },
    ],
  },

  // ── The Prophet ──
  {
    id: 'the_prophet',
    title: 'The Prophet',
    minYear: 400, maxYear: 650,
    flavor: 'A wild-eyed preacher draws crowds in the thousands, speaking of a coming reckoning and naming kings as sinners. The faithful adore them; the powerful fear them. Their next word could be a blessing or a torch.',
    choices: [
      { label: 'Embrace the prophet', hint: 'Fervour electrifies the nation',
        effect: { loyalty: { civilian: 16, military: 10 }, flag: 'prophet_embraced' } },
      { label: 'Exile the prophet', hint: 'Silence the unrest, lose the zealots',
        effect: { loyalty: { civilian: -12 } } },
      { label: 'Martyr the prophet', hint: 'A dangerous, lasting symbol',
        effect: { loyalty: { civilian: -18, military: 8 }, flag: 'prophet_martyred' } },
    ],
  },
];

if (typeof window !== 'undefined') {
  window.CRISIS_EVENTS = CRISIS_EVENTS;
}
