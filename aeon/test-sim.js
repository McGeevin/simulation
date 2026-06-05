const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = ['data.js','rng.js','map.js','sim.js','battle.js'];
let combined = '';
for (const f of files) {
  combined += fs.readFileSync(path.join(__dirname, 'js', f), 'utf8') + '\n';
}

const testCode = `
const world = {
  disasterChance: 0.015,
  startingTech: 'stone',
  interaction: 'contested',
};
const rng = new RNG(12345);
const map = generateMap(60, 40, 'forest', 'mountain', rng);

const configA = { name:'Alpha', color:'#4a90e2', race:'humans', focus:'science', government:'republic', weapon:'gunpowder', biome:'forest' };
const configB = { name:'Beta',  color:'#e74c3c', race:'orcs',   focus:'military', government:'tribal',  weapon:'siege',     biome:'mountain' };

const civA = createCiv(configA, 'A', world, rng);
const civB = createCiv(configB, 'B', world, rng);

const eventCounts = { A:0, B:0 };
const log = (side, year, text, tag) => { eventCounts[side]++; };

console.log('Starting 1000-year sim...');
const t0 = Date.now();
for (let y = 1; y <= 1000; y++) {
  tickYear(civA, y, world, map, civB, log);
  tickYear(civB, y, world, map, civA, log);
}
const dt = Date.now() - t0;

console.log('\\nSim complete in ' + dt + 'ms');
console.log('Events: A=' + eventCounts.A + ', B=' + eventCounts.B);
console.log('\\nFinal state:');
console.log('  ' + civA.name + ': pop=' + Math.floor(civA.population) + ', army=' + civA.army + ', age=' + TECH_AGES[civA.techAge].name + ', knowledge=' + Math.floor(civA.knowledge) + ', gold=' + Math.floor(civA.gold) + ', morale=' + Math.floor(civA.morale) + ', stability=' + Math.floor(civA.stability) + ', weaponUnlocked=' + civA.weaponUnlocked);
console.log('  ' + civB.name + ': pop=' + Math.floor(civB.population) + ', army=' + civB.army + ', age=' + TECH_AGES[civB.techAge].name + ', knowledge=' + Math.floor(civB.knowledge) + ', gold=' + Math.floor(civB.gold) + ', morale=' + Math.floor(civB.morale) + ', stability=' + Math.floor(civB.stability) + ', weaponUnlocked=' + civB.weaponUnlocked);

const outcome = resolveBattle(civA, civB, world, rng);
console.log('\\nBattle:');
console.log('  Invader: ' + outcome.invader.name + ' (power ' + outcome.invPower + ', rolled ' + Math.floor(outcome.invRoll) + ')');
console.log('  Defender: ' + outcome.defender.name + ' (power ' + outcome.defPower + ', rolled ' + Math.floor(outcome.defRoll) + ')');
console.log('  Winner: ' + outcome.winner.name);
console.log('  Winner casualties: ' + (outcome.winnerCasualtyPct*100).toFixed(0) + '%');
console.log('  Loser casualties: ' + (outcome.loserCasualtyPct*100).toFixed(0) + '%');
`;

const sandbox = {
  document: { getElementById: () => null },
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  console,
};
vm.createContext(sandbox);
vm.runInContext(combined + testCode, sandbox);
