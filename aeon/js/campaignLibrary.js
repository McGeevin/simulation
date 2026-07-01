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
    { race: 'orcs',      focus: 'faith',     gov: 'republic',   weapon: 'champions', biome: 'plains', power: 395154802, army: 147250, age: 'Transcendent' },
    { race: 'beastfolk', focus: 'faith',     gov: 'horde',      weapon: 'champions', biome: 'plains', power: 413989320, army: 270673, age: 'Singularity' },
    { race: 'orcs',      focus: 'military',  gov: 'empire',     weapon: 'champions', biome: 'plains', power: 432335484, army: 286478, age: 'Transcendent' },
    { race: 'orcs',      focus: 'faith',     gov: 'empire',     weapon: 'champions', biome: 'plains', power: 451066384, army: 186467, age: 'Singularity' },
    { race: 'beastfolk', focus: 'faith',     gov: 'theocracy',  weapon: 'champions', biome: 'plains', power: 456486742, army: 174765, age: 'Transcendent' },
    { race: 'orcs',      focus: 'industry',  gov: 'empire',     weapon: 'orbital',   biome: 'plains', power: 459057139, army: 184605, age: 'Transcendent' },
    { race: 'beastfolk', focus: 'faith',     gov: 'empire',     weapon: 'champions', biome: 'plains', power: 459260584, army: 222102, age: 'Transcendent' },
    { race: 'orcs',      focus: 'faith',     gov: 'theocracy',  weapon: 'champions', biome: 'plains', power: 461362753, army: 141851, age: 'Transcendent' },
    { race: 'beastfolk', focus: 'military',  gov: 'autocracy',  weapon: 'champions', biome: 'plains', power: 482205771, army: 360004, age: 'Transcendent' },
    { race: 'orcs',      focus: 'faith',     gov: 'autocracy',  weapon: 'champions', biome: 'plains', power: 617399640, army: 206513, age: 'Transcendent' },
  ],
  2000: [
    { race: 'orcs',       focus: 'faith',     gov: 'tribal',     weapon: 'champions', biome: 'plains', power: 527778145, army: 234460, age: 'Transcendent' },
    { race: 'orcs',       focus: 'faith',     gov: 'autocracy',  weapon: 'champions', biome: 'plains', power: 531312202, army: 221299, age: 'Transcendent' },
    { race: 'orcs',       focus: 'faith',     gov: 'technocracy',weapon: 'champions', biome: 'plains', power: 532223680, army: 215677, age: 'Ascendant' },
    { race: 'constructs', focus: 'military',  gov: 'empire',     weapon: 'champions', biome: 'mountain', power: 533134200, army: 172938, age: 'Transcendent' },
    { race: 'orcs',       focus: 'faith',     gov: 'horde',      weapon: 'champions', biome: 'plains', power: 541027008, army: 268738, age: 'Transcendent' },
    { race: 'orcs',       focus: 'military',  gov: 'horde',      weapon: 'champions', biome: 'plains', power: 570310210, army: 380355, age: 'Transcendent' },
    { race: 'undead',     focus: 'faith',     gov: 'empire',     weapon: 'champions', biome: 'swamp',  power: 583080211, army: 220938, age: 'Transcendent' },
    { race: 'beastfolk',  focus: 'faith',     gov: 'theocracy',  weapon: 'champions', biome: 'plains', power: 587319807, army: 233369, age: 'Transcendent' },
    { race: 'frostborn',  focus: 'faith',     gov: 'horde',      weapon: 'champions', biome: 'tundra', power: 588874569, army: 235658, age: 'Transcendent' },
    { race: 'orcs',       focus: 'faith',     gov: 'theocracy',  weapon: 'champions', biome: 'plains', power: 681640781, army: 189014, age: 'Transcendent' },
  ],
  5000: [
    { race: 'giants',    focus: 'industry',  gov: 'technocracy', weapon: 'orbital',   biome: 'mountain', power: 759977098,  army: 112331, age: 'Transcendent' },
    { race: 'undead',    focus: 'faith',     gov: 'empire',      weapon: 'champions', biome: 'swamp',    power: 792537442,  army: 209761, age: 'Cosmic' },
    { race: 'giants',    focus: 'industry',  gov: 'monarchy',    weapon: 'orbital',   biome: 'mountain', power: 811591711,  army: 120404, age: 'Transcendent' },
    { race: 'undead',    focus: 'faith',     gov: 'autocracy',   weapon: 'champions', biome: 'swamp',    power: 814220412,  army: 261884, age: 'Cosmic' },
    { race: 'giants',    focus: 'military',  gov: 'tribal',      weapon: 'champions', biome: 'mountain', power: 816343136,  army: 174920, age: 'Transcendent' },
    { race: 'dwarves',   focus: 'faith',     gov: 'technocracy', weapon: 'champions', biome: 'mountain', power: 821868581,  army: 173680, age: 'Cosmic' },
    { race: 'giants',    focus: 'military',  gov: 'technocracy', weapon: 'champions', biome: 'mountain', power: 868103987,  army: 147440, age: 'Transcendent' },
    { race: 'giants',    focus: 'faith',     gov: 'tribal',      weapon: 'champions', biome: 'mountain', power: 989832481,  army: 121159, age: 'Transcendent' },
    { race: 'giants',    focus: 'faith',     gov: 'horde',       weapon: 'champions', biome: 'mountain', power: 1034573943, army: 135279, age: 'Transcendent' },
    { race: 'giants',    focus: 'industry',  gov: 'tribal',      weapon: 'orbital',   biome: 'mountain', power: 1056822594, army: 120140, age: 'Ascendant' },
  ],
  10000: [
    { race: 'giants',    focus: 'military',  gov: 'technocracy', weapon: 'champions', biome: 'mountain', power: 969710573,  army: 164122, age: 'Cosmic' },
    { race: 'giants',    focus: 'faith',     gov: 'republic',    weapon: 'champions', biome: 'mountain', power: 996172193,  army: 102281, age: 'Cosmic' },
    { race: 'giants',    focus: 'military',  gov: 'tribal',      weapon: 'champions', biome: 'mountain', power: 1074783086, army: 180699, age: 'Cosmic' },
    { race: 'giants',    focus: 'industry',  gov: 'tribal',      weapon: 'orbital',   biome: 'mountain', power: 1105775815, army: 122271, age: 'Cosmic' },
    { race: 'giants',    focus: 'industry',  gov: 'autocracy',   weapon: 'orbital',   biome: 'mountain', power: 1108440307, army: 129218, age: 'Ascendant' },
    { race: 'giants',    focus: 'military',  gov: 'empire',      weapon: 'champions', biome: 'mountain', power: 1120391922, army: 185858, age: 'Ascendant' },
    { race: 'giants',    focus: 'faith',     gov: 'tribal',      weapon: 'champions', biome: 'mountain', power: 1173883824, army: 120060, age: 'Cosmic' },
    { race: 'giants',    focus: 'faith',     gov: 'theocracy',   weapon: 'champions', biome: 'mountain', power: 1195614690, army: 100099, age: 'Transcendent' },
    { race: 'giants',    focus: 'industry',  gov: 'empire',      weapon: 'orbital',   biome: 'mountain', power: 1260295498, army: 136608, age: 'Cosmic' },
    { race: 'giants',    focus: 'faith',     gov: 'horde',       weapon: 'champions', biome: 'mountain', power: 1377597537, army: 140603, age: 'Cosmic' },
  ],
};

// Per-time-frame framing: how brutal the absolute-tier ladder is at this depth.
const CAMPAIGN_HORIZON_NOTES = {
  1000:  { label: '1,000 Years — Classic',     tone: 'balanced', note: 'Orcs and beastfolk own the short game. A skilled martial build can crack the top of the ladder.' },
  2000:  { label: '2,000 Years — Epoch',        tone: 'balanced', note: 'Constructs and undead emerge among the top powers. A focused build of any kind can contend.' },
  5000:  { label: '5,000 Years — Saga',         tone: 'hard',     note: 'Giants and the undead rise to supremacy in deep time. You will need a high-soldierStrength build or superior tech to keep pace.' },
  10000: { label: '10,000 Years — Deep Time',   tone: 'brutal',   note: 'Mountain Giants rule this age. Their small armies of colossi shatter all but the strongest peers. Bring raw power, not raw numbers.' },
};

if (typeof window !== 'undefined') {
  window.CAMPAIGN_PREMISE = CAMPAIGN_PREMISE;
  window.CAMPAIGN_ARC = CAMPAIGN_ARC;
  window.CAMPAIGN_LADDERS = CAMPAIGN_LADDERS;
  window.CAMPAIGN_HORIZON_NOTES = CAMPAIGN_HORIZON_NOTES;
}
