import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as cheerio from "cheerio";

const root = new URL("../", import.meta.url);
const html = fs.readFileSync(new URL("index.html", root), "utf8");
const product = fs.readFileSync(new URL("product.js", root), "utf8");
const catalog = JSON.parse(fs.readFileSync(new URL("data/dragon-catalog.v1.json", root), "utf8"));
const rosterPath = process.env.DRAGONFIRE_TEST_ROSTER;
const roster = rosterPath ? JSON.parse(fs.readFileSync(rosterPath, "utf8")) : null;

const $ = cheerio.load(html);
const inline = $("script:not([src])").first().html();
assert(inline, "Expected the inline roster and scoring engine");

const elements = new Map();
function element(selector = "element") {
  if (elements.has(selector)) return elements.get(selector);
  const defaults = {
    "#coreDragonSelect": "Vhagar",
    "#coreTargetStars": "4",
    "#coreTargetLevel": "50",
    "#coreTargetHabit": "2",
    "#search": "",
    "#myTeamSearch": "",
    "#myTeamOwnership": "all",
    "#myTeamRarity": "all",
    "#librarySearch": "",
    "#libraryFilter": "all",
    "#onboardingSearch": "",
    "#onboardingRarity": "all",
  };
  const node = {
    value: defaults[selector] ?? "",
    innerHTML: "",
    textContent: "",
    hidden: false,
    disabled: false,
    checked: false,
    files: [],
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    parentElement: { scrollLeft: 0, clientWidth: 1200 },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector(child) { return element(`${selector} ${child}`); },
    querySelectorAll() { return []; },
    closest() { return null; },
    matches() { return false; },
    focus() {},
    click() {},
    scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 300, width: 300, height: 100 }; },
  };
  elements.set(selector, node);
  return node;
}

const storage = new Map([["dragonfire-war-council-onboarded-v3", "1"]]);
if (roster) storage.set("dragonfire-war-council-v3", JSON.stringify(roster));
const context = vm.createContext({
  console,
  structuredClone,
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
  document: {
    body: { dataset: { route: "teambuilder" }, classList: { add() {}, remove() {} } },
    querySelector: (selector) => element(selector),
    querySelectorAll: () => [],
    addEventListener() {},
    dispatchEvent() {},
    createElement: (tag) => element(tag),
  },
  location: { hash: "#teambuilder" },
  history: { pushState() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  setTimeout: () => 0,
  clearTimeout() {},
  fetch: async () => ({ ok: true, json: async () => catalog }),
  URL,
  Blob,
  FileReader: class {},
  CustomEvent: class { constructor(type) { this.type = type; } },
  MutationObserver: class { observe() {} disconnect() {} },
  confirm: () => false,
  prompt: () => null,
});
context.window = context;
context.window.addEventListener = () => {};
context.window.scrollTo = () => {};
context.innerWidth = 1400;
context.innerHeight = 900;

const exposedInline = `${inline}\n;globalThis.__engine={get roster(){return roster},scoreOrder,unlockedCount,habitRank,habitName};`;
const exposedProduct = product.replace(/\}\)\(\);\s*$/, "globalThis.__teamBuilder={projectedDragon,bestCoreFormations};})();");
vm.runInContext(exposedInline, context, { filename: "index.inline.js" });
vm.runInContext(exposedProduct, context, { filename: "product.js" });

const result = vm.runInContext(`(() => {
  const active = __engine.roster.filter((dragon) => dragon.active && dragon.power > 0).sort((a,b) => b.power-a.power || a.name.localeCompare(b.name));
  const core = active.find((dragon) => dragon.name === "Vhagar");
  const projectedPool = active.map((dragon) => __teamBuilder.projectedDragon(dragon, 4, 50, 2));
  const projectedCore = projectedPool.find((dragon) => dragon.name === "Vhagar");
  const current = __teamBuilder.bestCoreFormations(core, active);
  const potential = __teamBuilder.bestCoreFormations(projectedCore, projectedPool);
  const partnerRank = (formations, name) => formations.findIndex((formation) => formation.order.some((dragon) => dragon.name === name)) + 1;
  const venator = projectedPool.find((dragon) => dragon.name === "Venator");
  const malachite = projectedPool.find((dragon) => dragon.name === "Malachite");
  const venatorFormation = potential.find((formation) => formation.order.some((dragon) => dragon.name === "Venator"));
  const venatorReasons = __engine.scoreOrder(venatorFormation.order, venatorFormation.troop, "pvp", true).reasons.map((reason) => reason.text);
  return {
    projectedCore,
    venator,
    malachite,
    minimumsMet: projectedPool.every((dragon) => dragon.starRank >= 4 && dragon.reignLevel >= 50),
    venatorCurrentRank: partnerRank(current, "Venator"),
    venatorPotentialRank: partnerRank(potential, "Venator"),
    malachitePotentialRank: partnerRank(potential, "Malachite"),
    venatorReasons,
    topCurrent: current.slice(0,5).map((formation) => formation.order.map((dragon) => dragon.name).join(" / ")),
    topPotential: potential.slice(0,5).map((formation) => formation.order.map((dragon) => dragon.name).join(" / ")),
  };
})()`, context);

const sourceVhagar = vm.runInContext(`__engine.roster.find((dragon) => dragon.name === "Vhagar")`, context);
assert(sourceVhagar, "Vhagar is required in the regression roster");
assert.equal(result.projectedCore.starRank, Math.max(4, sourceVhagar.starRank), "Scenario floors must never downgrade the core");
assert(result.minimumsMet, "Every candidate dragon must reach the lineup scenario floor");
assert.equal(result.venator.starRank >= 4, true, "Venator must reach 4★ in the scenario");
assert.equal(result.venator.habitRanks[1], 2, "Venator H2 must unlock at the requested Habit rank");
assert.equal(result.malachite.starRank >= 4, true, "Malachite must be evaluated at 4★ or above");
assert.equal(result.malachite.habitRanks[1], 2, "Malachite H2 must unlock at the requested Habit rank");
assert(result.venatorPotentialRank <= 5, "Venator should remain a top-five option when its 4★ physical-damage Habit unlocks");
assert(result.venatorReasons.some((reason) => reason.includes("Battle Leader") && reason.includes("Dragon's Might")), "Vhagar and Venator must expose their compounded right-flank interaction");
assert(!result.venatorReasons.some((reason) => reason === "Vhagar empowers right-flank physical damage"), "Battle Leader must not be double-counted as a Vanguard effect");

console.log(`Team Builder scenario valid: Venator #${result.venatorPotentialRank}, Malachite #${result.malachitePotentialRank}; top five ${result.topPotential.join(" | ")}`);
