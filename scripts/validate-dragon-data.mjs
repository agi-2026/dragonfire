import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const path = resolve("data/dragon-catalog.v1.json");
const catalog = JSON.parse(await readFile(path, "utf8"));
const errors = [];
const expectedUnlocks = [2, 4, 6, 8, 10];

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
  if (dragon.habits?.length !== 5) errors.push(`${dragon.name}: expected 5 Habits`);
  dragon.habits?.forEach((habit, index) => {
    if (habit.slot !== index + 1 || habit.unlockStar !== expectedUnlocks[index]) errors.push(`${dragon.name}: invalid Habit ${index + 1} unlock`);
  });
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const commandCoverage = catalog.dragons.filter((dragon) => dragon.command.structuredEffectsStatus === "verified").length;
const vanguardCoverage = catalog.dragons.filter((dragon) => dragon.vanguard.structuredEffectsStatus === "verified").length;
const habitCoverage = catalog.dragons.flatMap((dragon) => dragon.habits).filter((habit) => habit.levelEffectsStatus === "verified").length;
console.log(`Catalog valid: ${catalog.dragons.length} dragons, ${catalog.dragons.length * 4} base stats`);
console.log(`Competitive mechanic coverage: ${commandCoverage}/33 Commands, ${vanguardCoverage}/33 Vanguards, ${habitCoverage}/165 Habit effects`);
