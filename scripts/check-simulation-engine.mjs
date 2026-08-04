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
assert(venatorBattle.a[2].dealt.physical > 1.14, "Battle Leader must buff a physical right flank");
assert.equal(tairaxBattle.a[2].dealt.physical, 1, "Battle Leader must not buff Tairax's non-physical kit");
assert(venatorBattle.a[0].dealt.tactical > 1.15, "Vhagar Vanguard must buff tactical damage on the left flank");

const first = engine.simulateMatchup(venatorTeam, opponents, { count: 20, seed: "deterministic" });
const second = engine.simulateMatchup(venatorTeam, opponents, { count: 20, seed: "deterministic" });
assert.deepEqual({ a: first.winsA, b: first.winsB, d: first.draws }, { a: second.winsA, b: second.winsB, d: second.draws }, "A seed must reproduce the same matchup result");

const coverage = engine.coverage(venatorTeam);
assert(coverage.known >= 7, "Commands, Vanguard, and known Habits should contribute structured coverage");
assert(coverage.known < coverage.total, "Unknown Habits must remain visible rather than receive generic bonuses");

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

console.log(`Simulation engine valid: deterministic results, lane-specific Battle Leader, ${coverage.known}/${coverage.total} effects encoded.`);
