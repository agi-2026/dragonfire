import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const source = fs.readFileSync(new URL("simulation-engine.js", root), "utf8");
const catalog = JSON.parse(fs.readFileSync(new URL("data/dragon-catalog.v1.json", root), "utf8"));
const context = vm.createContext({ console });
context.window = context;
vm.runInContext(source, context, { filename: "simulation-engine.js" });
const engine = context.DragonfireSimulation;
engine.configureCatalog(catalog);

const base = (name, damageType, habitRanks = []) => ({
  id: name.toLowerCase(), name, damageType, role: "damage", rarity: "legendary",
  power: 42000, starRank: 4, reignLevel: 50, habitRanks,
  affinity: { cavalry: 0, shieldbearers: 0, archers: 0, spearmen: 0 },
});
const dummy = (name) => base(name, "physical", []);
const opponents = [dummy("Thunderstrike"), dummy("Daemoros"), dummy("Shadowrend")];

const kalspire = { ...base("Kalspire", "tactical", [1, 1]), power: 43540, starRank: 4 };
const vhagar = { ...base("Vhagar", "physical", [2, 2]), power: 47840, starRank: 5 };
const venator = { ...base("Venator", "physical", [2]), power: 39520, starRank: 3 };
const tairax = { ...base("Tairax", "fire", [1, 1, 2]), power: 37420, starRank: 6, reignLevel: 47 };
const venatorTeam = [kalspire, vhagar, venator];
const tairaxTeam = [kalspire, vhagar, tairax];
const venatorBattle = engine.runBattle(venatorTeam, opponents, { seed: "habit-target", maxRounds: 1 });
const tairaxBattle = engine.runBattle(tairaxTeam, opponents, { seed: "habit-target", maxRounds: 1 });
assert(venatorBattle.a[2].commandDealt.physical > 1.14, "Battle Leader must buff non-Basic physical damage on the right flank");
assert.equal(tairaxBattle.a[2].commandDealt.fire, 1, "Battle Leader's physical modifier must not buff Tairax's fire kit");
assert(venatorBattle.a[0].dealt.tactical > 1.15, "Vhagar Vanguard must buff tactical damage on the left flank");

const first = engine.simulateMatchup(venatorTeam, opponents, { count: 20, seed: "deterministic" });
const second = engine.simulateMatchup(venatorTeam, opponents, { count: 20, seed: "deterministic" });
assert.deepEqual({ a: first.winsA, b: first.winsB, d: first.draws }, { a: second.winsA, b: second.winsB, d: second.draws }, "A seed must reproduce the same matchup result");

const coverage = engine.coverage(venatorTeam);
assert.equal(coverage.known, coverage.total, "Every unlocked Habit in the regression formation should execute from sourced mechanics");
const maxSunfyre = { ...base("Sunfyre", "tactical", [2, 2, 2, 2, 2]), starRank: 10 };
assert.equal(engine.unknownHabits([maxSunfyre]).length, 0, "Reactive Sunfyre Habits must be executable");
assert.equal(engine.registryCoverage().habits, 165, "All sourced Habit definitions must be executable");

const benchmarks = [
  { team: venatorTeam, troop: "shieldbearers" },
  { team: [tairax, { ...base("Zivern", "tactical", [1]), power: 36820 }, { ...base("Caraxes", "fire", [2]), power: 36520, starRank: 3, reignLevel: 47 }], troop: "archers" },
];
const venatorScore = engine.evaluateFormation(venatorTeam, "shieldbearers", benchmarks, { runs: 20, seed: "vhagar-choice" });
const tairaxScore = engine.evaluateFormation(tairaxTeam, "shieldbearers", benchmarks, { runs: 20, seed: "vhagar-choice" });
assert(venatorScore.winRate > tairaxScore.winRate, "The explicit Vhagar/Venator physical interaction must beat the otherwise equal Tairax variant in this regression fixture");

const caraxes = { ...base("Caraxes", "fire", [2]), power: 36520, starRank: 3, reignLevel: 47 };
const kalspireCenter = engine.formationProfile([caraxes, kalspire, vhagar], "shieldbearers");
const caraxesCenter = engine.formationProfile([kalspire, caraxes, vhagar], "shieldbearers");
assert(caraxesCenter.synergy > kalspireCenter.synergy, "Actual damage-type and lane utilization must prefer Caraxes Vanguard over the weaker fixed-trio lane order");

const damageTypes = ["physical", "tactical", "fire"];
const maxHabitRoster = catalog.dragons.map((dragon, index) => ({
  ...base(dragon.name, damageTypes[index % damageTypes.length], [5, 5, 5, 5, 5]),
  id: dragon.id, rarity: dragon.rarity.toLowerCase(), power: 50000, starRank: 10, reignLevel: 50,
}));
for (let index = 0; index < maxHabitRoster.length; index += 3) {
  const teamA = maxHabitRoster.slice(index, index + 3);
  while (teamA.length < 3) teamA.push(maxHabitRoster[teamA.length]);
  const teamB = Array.from({ length: 3 }, (_, offset) => maxHabitRoster[(index + 3 + offset) % maxHabitRoster.length]);
  assert.doesNotThrow(() => engine.runBattle(teamA, teamB, { seed: `all-habits:${index}`, maxRounds: 3 }), `${teamA.map((dragon) => dragon.name).join(" / ")} max-Habit battle must execute`);
}

console.log(`Simulation engine valid: deterministic results, lane-specific Battle Leader, ${coverage.known}/${coverage.total} effects encoded, all 33 max-Habit dragons smoke-tested.`);
