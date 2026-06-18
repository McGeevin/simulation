// ============================================================
// AEON :: CAMPAIGN LIBRARY  (Campaign content + balance data)
// Pure data for the Imperial Campaign ("Ascendant Conqueror"):
//   • CAMPAIGN_PREMISE  — the framing narrative.
//   • CAMPAIGN_ARC      — 10 escalating story beats (named rivals, taunts,
//                         defeat / victory lines). Race-flexible: the rival's
//                         "people" are whichever build fills the rung.
//   • CAMPAIGN_LADDERS  — per-time-frame roster of 10 REAL builds, taken from
//                         an exhaustive balance sweep of all 1,907 valid builds
//                         simulated to each horizon. Round 10 is the measured
//                         #1 build at that horizon; rounds 1–9 escalate up to it
//                         ("work down from the best"). `power` is the measured
//                         intrinsic battle power, used only for the pre-campaign
//                         forecast — never to alter the enemy mid-run.
//
// Data only. If this file is absent the Campaign button stays disabled and the
// rest of AEON is untouched.
// ============================================================

const CAMPAIGN_PREMISE = {
  title: 'Ascendant Conqueror',
  body: `You begin as one upstart among many — a single people with a single, dangerous idea: that the whole world might answer to one throne.

Ten powers stand between you and that throne, each greater than the last. Subjugate them in turn and climb from petty kingdom to world-empire, until only the reigning Hegemon remains.

There are no second chances at the summit. Fall to any rival and your ascent is over — begin again from the first.`,
};

// The ten beats of the ascent. {people}/{land}/{doctrine}/{focus}/{gov} are
// filled from the actual build that occupies the rung for the chosen horizon.
const CAMPAIGN_ARC = [
  {
    act: 'I · The Borderlands',
    title: 'The First Claimant',
    doctrine: 'expansionist',
    bio: `The {people} of the {land} share your dream — and your borders. Their {gov} answers ambition with ambition, pushing its frontier hard against your own. Two upstarts, one valley; only one walks out of it a power.`,
    taunt: `"You think the world has room for two of us? Prove it."`,
    defeat: `The First Claimant's banners come down. Their lands — and their dream — are now yours.`,
    victory: `The First Claimant rides over your ashes. The world will not even remember you tried.`,
  },
  {
    act: 'I · The Borderlands',
    title: 'The Marcher Lords',
    doctrine: 'mercantile',
    bio: `A confederation of {people} marcher-houses, grown rich on the {focus} trade of the {land}. They have never lost a war they could simply buy their way out of — and they have a great deal to spend on you.`,
    taunt: `"Everything has a price, conqueror. Even your generals. Especially your generals."`,
    defeat: `The Marcher Lords' coffers buy them nothing today. Their roads and markets fly your colors now.`,
    victory: `Bought, outspent, and surrounded, your host melts away. The Marcher Lords toast your memory.`,
  },
  {
    act: 'II · The Crowned Powers',
    title: 'The Crowned Neighbor',
    doctrine: 'isolationist',
    bio: `An old, settled crown of the {people}, content behind the deep defenses of the {land} — until your rise gave it a reason to wake. A {gov} that has spent a hundred years digging in, and means to make you bleed for every step.`,
    taunt: `"We were a kingdom when you were a rumor. Come break yourself on our walls."`,
    defeat: `The Crowned Neighbor's walls finally fall. A true kingdom kneels to you — the first of many.`,
    victory: `The walls hold. Your army breaks against them, and the old crown sleeps soundly once more.`,
  },
  {
    act: 'II · The Crowned Powers',
    title: 'The Faithful Host',
    doctrine: 'theocratic',
    bio: `The {people} of the {land} march under one god and one law, their {focus} bent wholly to holy war. They do not fear death; they have been promised it leads somewhere better. That makes them very hard to rout.`,
    taunt: `"Heaven has already chosen the victor. You are merely here to make it official."`,
    defeat: `The Faithful Host's banners burn. Even the devout now whisper that perhaps heaven chose you.`,
    victory: `The zealots wash over your lines, singing. Your conquest ends as a cautionary sermon.`,
  },
  {
    act: 'III · The Great Rivals',
    title: 'The Conqueror-King',
    doctrine: 'warmonger',
    bio: `A mirror of yourself: a {people} warlord of the {land} who is also carving an empire from the bones of weaker states. Two ascents cannot share a world. Whoever wins here fights on; whoever loses becomes a footnote in the other's legend.`,
    taunt: `"I have crushed a dozen kings who talked like you. Let's see if you fight any better."`,
    defeat: `The Conqueror-King falls — and half a continent of his conquests falls into your hands with him.`,
    victory: `The Conqueror-King adds your empire to his. He will tell the story better than you would have.`,
  },
  {
    act: 'III · The Great Rivals',
    title: 'The Twilight Empire',
    doctrine: 'isolationist',
    bio: `An ancient {people} empire of the {land}, past the height of its glory but not its strength — a {gov} that has outlived every enemy by simply refusing to die. Its dusk is longer than most nations' noon.`,
    taunt: `"We have buried conquerors for a thousand years. We have a great deal of practice."`,
    defeat: `The Twilight Empire's long dusk ends at last. Its libraries, legions and legend are yours now.`,
    victory: `The ancient empire endures one more upstart. Its historians barely look up from their work.`,
  },
  {
    act: 'IV · The Superpowers',
    title: 'The Shadow Throne',
    doctrine: 'survivalist',
    bio: `No one is quite sure where the {people} of the Shadow Throne truly rule from. Masters of the {focus} arts, they have unmade three would-be world-conquerors without ever fielding an army you could find. Now they have noticed you.`,
    taunt: `"We already know how you lose. We've known for years. We were just waiting for you to matter."`,
    defeat: `The Shadow Throne is dragged into the light and broken. Its web of secrets now answers to you.`,
    victory: `You never even find the enemy capital. Your empire simply comes apart in your hands.`,
  },
  {
    act: 'IV · The Superpowers',
    title: 'The Dread Dominion',
    doctrine: 'warmonger',
    bio: `The {people} of the Dread Dominion rule the {land} through pure terror, their {gov} an engine built to do nothing but conquer. Whole regions surrender at the mere rumor of their advance. You will not have that luxury.`,
    taunt: `"Kneel now and your death will be quick. It is the only mercy this Dominion has ever offered."`,
    defeat: `The Dread Dominion's terror breaks against you. The world exhales — and starts to fear your name instead.`,
    victory: `The Dominion makes an example of you, as it has of all the others. The world barely notices another.`,
  },
  {
    act: 'V · The Throne of the World',
    title: 'The Pretender',
    doctrine: 'survivalist',
    bio: `The last power between you and the throne: a {people} colossus of the {land} that already calls itself master of the world — and very nearly is. A {focus} titan, peer to the Hegemon in all but name, certain that name will soon be its own.`,
    taunt: `"Two of us claim the world. After today, the claim will be settled — and singular."`,
    defeat: `The Pretender's claim dies with its army. Only one power now stands between you and the world: the Hegemon itself.`,
    victory: `The Pretender proves its claim on your corpse — and marches on to challenge the Hegemon without you.`,
  },
  {
    act: 'V · The Throne of the World',
    title: 'The Eternal Hegemon',
    doctrine: 'survivalist',
    bio: `The reigning master of the world: the {people} of the {land}, undefeated across the entire age. By every measure ever taken, no greater power has existed. Their {gov} is the throne you have climbed ten ruined empires to reach. Beat them, and the world is yours. Truly yours.`,
    taunt: `"Every conqueror reaches this field eventually. None has ever left it crowned. Why would you be different?"`,
    defeat: `The Eternal Hegemon falls. After an entire age of dominion, the world has a new master — and it is you. The ascent is complete.`,
    victory: `The Hegemon endures, as it always has. Your long ascent ends here, at the very summit, one step short of the world.`,
  },
];

// Per-horizon roster of REAL builds (from the full balance sweep). Index i is
// round i+1. Round 10 is the measured #1 build at that horizon.
const CAMPAIGN_LADDERS = {
  1000: [
    { race: 'elves',      focus: 'industry',    gov: 'democracy',   weapon: 'orbital',   biome: 'forest',  power: 10959449, army: 236755,  age: 'Transcendent' },
    { race: 'merfolk',    focus: 'culture',     gov: 'technocracy', weapon: 'champions', biome: 'coastal', power: 13247602, army: 325764,  age: 'Transcendent' },
    { race: 'humans',     focus: 'science',     gov: 'democracy',   weapon: 'orbital',   biome: 'plains',  power: 16016353, army: 278800,  age: 'Ascendant' },
    { race: 'fae',        focus: 'faith',       gov: 'horde',       weapon: 'champions', biome: 'forest',  power: 18114996, army: 320826,  age: 'Transcendent' },
    { race: 'insectoids', focus: 'diplomacy',   gov: 'horde',       weapon: 'champions', biome: 'jungle',  power: 19345037, army: 444497,  age: 'Transcendent' },
    { race: 'beastfolk',  focus: 'culture',     gov: 'empire',      weapon: 'champions', biome: 'plains',  power: 23409365, army: 458486,  age: 'Transcendent' },
    { race: 'undead',     focus: 'industry',    gov: 'autocracy',   weapon: 'orbital',   biome: 'swamp',   power: 28406285, army: 376227,  age: 'Transcendent' },
    { race: 'goblins',    focus: 'exploration', gov: 'hive',        weapon: 'champions', biome: 'swamp',   power: 34388133, army: 907494,  age: 'Transcendent' },
    { race: 'orcs',       focus: 'faith',       gov: 'horde',       weapon: 'champions', biome: 'plains',  power: 40264151, army: 465160,  age: 'Transcendent' },
    { race: 'insectoids', focus: 'faith',       gov: 'hive',        weapon: 'champions', biome: 'jungle',  power: 60328835, army: 689090,  age: 'Transcendent' },
  ],
  2000: [
    { race: 'undead',     focus: 'espionage',   gov: 'technocracy', weapon: 'champions', biome: 'swamp',   power: 16500504,  army: 323217,  age: 'Ascendant' },
    { race: 'orcs',       focus: 'espionage',   gov: 'technocracy', weapon: 'champions', biome: 'plains',  power: 20273818,  army: 402103,  age: 'Ascendant' },
    { race: 'merfolk',    focus: 'culture',     gov: 'monarchy',    weapon: 'champions', biome: 'coastal', power: 24919295,  army: 517610,  age: 'Ascendant' },
    { race: 'goblins',    focus: 'trade',       gov: 'horde',       weapon: 'champions', biome: 'swamp',   power: 30653038,  army: 793584,  age: 'Ascendant' },
    { race: 'fae',        focus: 'faith',       gov: 'horde',       weapon: 'champions', biome: 'forest',  power: 35281218,  army: 530410,  age: 'Ascendant' },
    { race: 'humans',     focus: 'faith',       gov: 'tribal',      weapon: 'champions', biome: 'plains',  power: 37810490,  army: 510670,  age: 'Ascendant' },
    { race: 'insectoids', focus: 'science',     gov: 'tribal',      weapon: 'orbital',   biome: 'jungle',  power: 46653745,  army: 650765,  age: 'Ascendant' },
    { race: 'elves',      focus: 'faith',       gov: 'horde',       weapon: 'champions', biome: 'forest',  power: 49534663,  army: 627110,  age: 'Ascendant' },
    { race: 'beastfolk',  focus: 'culture',     gov: 'horde',       weapon: 'champions', biome: 'plains',  power: 56734237,  army: 1028606, age: 'Ascendant' },
    { race: 'insectoids', focus: 'faith',       gov: 'horde',       weapon: 'champions', biome: 'jungle',  power: 105727911, army: 1203371, age: 'Ascendant' },
  ],
  5000: [
    { race: 'merfolk',    focus: 'science',     gov: 'democracy',   weapon: 'singularityCannon', biome: 'coastal', power: 29889721,    army: 293333,    age: 'Aetherial' },
    { race: 'undead',     focus: 'magic',       gov: 'democracy',   weapon: 'arcaneCataclysm',   biome: 'swamp',   power: 57941617,    army: 288194,    age: 'Aetherial' },
    { race: 'frostborn',  focus: 'magic',       gov: 'tribal',      weapon: 'arcaneCataclysm',   biome: 'tundra',  power: 68799774,    army: 371244,    age: 'Cosmic' },
    { race: 'elves',      focus: 'magic',       gov: 'autocracy',   weapon: 'arcaneCataclysm',   biome: 'forest',  power: 69502962,    army: 451177,    age: 'Aetherial' },
    { race: 'humans',     focus: 'magic',       gov: 'tribal',      weapon: 'arcaneCataclysm',   biome: 'plains',  power: 95722071,    army: 515761,    age: 'Aetherial' },
    { race: 'beastfolk',  focus: 'faith',       gov: 'tribal',      weapon: 'crusade',           biome: 'plains',  power: 108297842,   army: 779043,    age: 'Cosmic' },
    { race: 'insectoids', focus: 'culture',     gov: 'empire',      weapon: 'crusade',           biome: 'jungle',  power: 111192495,   army: 1406078,   age: 'Aetherial' },
    { race: 'orcs',       focus: 'faith',       gov: 'tribal',      weapon: 'crusade',           biome: 'plains',  power: 127124676,   army: 808958,    age: 'Cosmic' },
    { race: 'goblins',    focus: 'seafaring',   gov: 'technocracy', weapon: 'champions',         biome: 'swamp',   power: 149508231,   army: 2306239,   age: 'Empyrean' },
    { race: 'insectoids', focus: 'exploration', gov: 'hive',        weapon: 'champions',         biome: 'jungle',  power: 11352061771, army: 144631047, age: 'Omega' },
  ],
  10000: [
    { race: 'beastfolk',  focus: 'diplomacy',   gov: 'monarchy',    weapon: 'mercenaries',     biome: 'plains',    power: 33648378,      army: 393949,       age: 'Empyrean' },
    { race: 'elves',      focus: 'magic',       gov: 'tribal',      weapon: 'arcaneCataclysm', biome: 'forest',    power: 74472648,      army: 469564,       age: 'Empyrean' },
    { race: 'infernals',  focus: 'magic',       gov: 'tribal',      weapon: 'arcaneCataclysm', biome: 'volcanic',  power: 78005469,      army: 406528,       age: 'Aetherial' },
    { race: 'merfolk',    focus: 'magic',       gov: 'tribal',      weapon: 'arcaneCataclysm', biome: 'coastal',   power: 95791969,      army: 573787,       age: 'Empyrean' },
    { race: 'undead',     focus: 'magic',       gov: 'tribal',      weapon: 'arcaneCataclysm', biome: 'swamp',     power: 105007858,     army: 557344,       age: 'Aetherial' },
    { race: 'humans',     focus: 'magic',       gov: 'tribal',      weapon: 'arcaneCataclysm', biome: 'plains',    power: 108382271,     army: 649202,       age: 'Empyrean' },
    { race: 'orcs',       focus: 'faith',       gov: 'horde',       weapon: 'divineWrath',     biome: 'plains',    power: 127760130,     army: 748620,       age: 'Aetherial' },
    { race: 'goblins',    focus: 'espionage',   gov: 'hive',        weapon: 'ghostArmy',       biome: 'swamp',     power: 141109272,     army: 1774587,      age: 'Empyrean' },
    { race: 'insectoids', focus: 'faith',       gov: 'technocracy', weapon: 'divineWrath',     biome: 'jungle',    power: 515693465,     army: 3217169,      age: 'Omega' },
    { race: 'insectoids', focus: 'exploration', gov: 'hive',        weapon: 'champions',       biome: 'jungle',    power: 9080708533686, army: 112676757456, age: 'Omega' },
  ],
};

// Per-time-frame framing: how brutal the absolute-tier ladder is at this depth.
const CAMPAIGN_HORIZON_NOTES = {
  1000:  { label: '1,000 Years — Classic', tone: 'balanced', note: 'A smooth, varied ascent. Most committed builds can run the full ladder.' },
  2000:  { label: '2,000 Years — Epoch',   tone: 'balanced', note: 'Foes drawn from the long-game powers. A strong build is rewarded.' },
  5000:  { label: '5,000 Years — Saga',    tone: 'brutal',   note: 'The final foe is a deep-time titan of near-unbeatable scale. Bring a peer build.' },
  10000: { label: '10,000 Years — Deep Time', tone: 'brutal', note: 'The Hegemon is the single strongest build ever measured. Only a peer build can hope to dethrone it.' },
};

if (typeof window !== 'undefined') {
  window.CAMPAIGN_PREMISE = CAMPAIGN_PREMISE;
  window.CAMPAIGN_ARC = CAMPAIGN_ARC;
  window.CAMPAIGN_LADDERS = CAMPAIGN_LADDERS;
  window.CAMPAIGN_HORIZON_NOTES = CAMPAIGN_HORIZON_NOTES;
}
