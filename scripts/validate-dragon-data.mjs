import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const path = resolve("data/dragon-catalog.v1.json");
const catalog = JSON.parse(await readFile(path, "utf8"));
const html = await readFile(resolve("index.html"), "utf8");
const simulationSource = await readFile(resolve("simulation-engine.js"), "utf8");
const errors = [];
const expectedUnlocks = [2, 4, 6, 8, 10];
const habitSourceMatch = html.match(/const HN=(\{[\s\S]*?\});\nconst HD=/);
const embeddedHabitNames = habitSourceMatch ? vm.runInNewContext(`(${habitSourceMatch[1]})`) : {};

if (!habitSourceMatch) errors.push("Could not find the embedded English Habit-name fallback");

if (catalog.schema !== "dragonfire-war-council/dragon-catalog-v1") errors.push("Unexpected catalog schema");
if (catalog.dragons?.length !== 33) errors.push(`Expected 33 dragons, got ${catalog.dragons?.length ?? 0}`);

const ids = new Set();
const names = new Set();
for (const dragon of catalog.dragons || []) {
  if (!dragon.id || ids.has(dragon.id)) errors.push(`Missing or duplicate id: ${dragon.id}`);
  if (!dragon.name || names.has(dragon.name)) errors.push(`Missing or duplicate name: ${dragon.name}`);
  ids.add(dragon.id);
  names.add(dragon.name);
  for (const stat of ["strength", "instinct", "intelligence", "initiative"]) {
    if (!Number.isFinite(dragon.baseStats?.[stat]) || dragon.baseStats[stat] <= 0) errors.push(`${dragon.name}: invalid ${stat}`);
  }
  if (!Number.isFinite(dragon.baseTroops) || dragon.baseTroops <= 0) errors.push(`${dragon.name}: invalid base troops`);
  if (!dragon.marchSpeed) errors.push(`${dragon.name}: missing march speed`);
  if (!dragon.vanguard?.text) errors.push(`${dragon.name}: missing Vanguard source text`);
  if (!dragon.command?.text) errors.push(`${dragon.name}: missing Command source text`);
  if (dragon.habits?.length !== 5) errors.push(`${dragon.name}: expected 5 Habits`);
  dragon.habits?.forEach((habit, index) => {
    if (habit.slot !== index + 1 || habit.unlockStar !== expectedUnlocks[index]) errors.push(`${dragon.name}: invalid Habit ${index + 1} unlock`);
    if (habit.name !== embeddedHabitNames[dragon.name]?.[index]) errors.push(`${dragon.name}: embedded Habit ${index + 1} does not match the canonical English name`);
    if (!Array.isArray(habit.effects) || !habit.effects.length) errors.push(`${dragon.name}: missing Habit ${index + 1} mechanic data`);
    if (habit.levelEffectsStatus !== "community-sourced") errors.push(`${dragon.name}: Habit ${index + 1} must retain community-sourced confidence`);
    if (!habit.sourceName || habit.sourceLocale !== "es") errors.push(`${dragon.name}: Habit ${index + 1} missing localized source identity`);
  });
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const simulationContext = vm.createContext({ console });
simulationContext.window = simulationContext;
vm.runInContext(simulationSource, simulationContext);
simulationContext.DragonfireSimulation.configureCatalog(catalog);
const coverage = simulationContext.DragonfireSimulation.registryCoverage();
const commandCoverage = coverage.commands;
const vanguardCoverage = coverage.vanguards;
const habitCoverage = coverage.habits;
console.log(`Catalog valid: ${catalog.dragons.length} dragons, ${catalog.dragons.length * 4} base stats`);
console.log(`Competitive mechanic coverage: ${commandCoverage}/33 Commands, ${vanguardCoverage}/33 Vanguards, ${coverage.habitData}/165 Habit datasets, ${habitCoverage}/165 executable Habit effects`);
