import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(await readFile(resolve("data/dragon-catalog.v1.json"), "utf8"));
const outputPath = resolve("docs/mechanics-data-needed.md");
const supportedTriggers = new Set(["combat_start", "each", "rounds", "odd", "on_ally_damaged", "on_damaged"]);
const supportedActions = new Set(["mod", "dmg", "status", "heal", "stack", "copy", "cleanse", "cmd_chance", "purge"]);
const triggers = new Set();
const actions = new Set();
const statuses = new Set();
const selectors = new Set();
const unsupported = [];
let sourced = 0;

for (const dragon of catalog.dragons) {
  for (const habit of dragon.habits) {
    if (habit.effects?.length) sourced += 1;
    let executable = Boolean(habit.effects?.length);
    for (const part of habit.effects || []) {
      triggers.add(part.when);
      const partActions = Array.isArray(part.actions) ? part.actions : Object.values(part.branches || {}).flat();
      if (!supportedTriggers.has(part.when) || !partActions.length) executable = false;
      for (const action of partActions) {
        actions.add(action.t);
        if (action.st) statuses.add(action.st);
        if (action.tgt?.select) selectors.add(action.tgt.select);
        if (!supportedActions.has(action.t)) executable = false;
      }
    }
    if (!executable) unsupported.push(`${dragon.name} H${habit.slot} (${habit.name}): ${(habit.effects || []).map((part) => part.when).join(", ")}`);
  }
}

const executable = sourced - unsupported.length;
const lines = [
  "# Mechanics evidence and data needed",
  "",
  `Generated from catalog snapshot: ${catalog.generatedAt}`,
  "",
  "## Coverage",
  "",
  `- ${catalog.dragons.length}/33 dragons have five sourced Habit records.`,
  `- ${sourced}/165 Habits have triggers, targets, rank values, durations, chances, and actions.`,
  `- ${executable}/165 Habits currently use trigger/action forms supported by the War Council interpreter.`,
  `- Trigger vocabulary: ${[...triggers].sort().join(", ")}.`,
  `- Action vocabulary: ${[...actions].sort().join(", ")}.`,
  `- Status vocabulary: ${[...statuses].sort().join(", ")}.`,
  `- Target selectors: ${[...selectors].sort().join(", ")}.`,
  "",
  "## Imported but not yet executable",
  "",
  ...(unsupported.length ? unsupported.map((item) => `- ${item}`) : ["- None."]),
  "",
  unsupported.length ? "These records remain visible as community-sourced data, but they are excluded from executable coverage rather than silently treated as neutral or verified." : "No imported Habit is excluded from executable coverage. Community-sourced still does not mean independently verified.",
  "",
  "## Assumptions that require battle validation",
  "",
  "1. Defense mapping is currently Physical → Instinct, Tactical → Intelligence, and Fire → Initiative, following the public community mechanics guide.",
  "2. Habit stat enhancement uses the community model's divisor of 2470. The game does not publish this formula.",
  "3. A Vanguard effect activates from the center lane. The community guide explicitly labels that position rule as fan-derived rather than official.",
  "4. Level, Stars, Power, troop capacity, and the damage curve are still approximate. These have more impact on predicted win rates than additional Habit screenshots.",
  "5. Status ordering, resistance, evasion, control, First Strike, Double Strike, and reactive-damage timing need held-out combat reports.",
  "",
  "## Smallest useful validation pack",
  "",
  "Please provide these only when convenient:",
  "",
  "1. One current detail screen each for Vhagar, Venator, and Kalspire showing level, Stars, Power, and all four combat attributes.",
  "2. Three complete battle reports using the same formation, including both teams, troop type/count, every round, final survivors, and damage/healing numbers.",
  "3. If available, one report where the same Vanguard dragon is moved out of the center lane, to verify whether the Vanguard effect actually stops.",
  "4. Much later, a high-Star Sunfyre report that visibly triggers Bright Protector or Light of Dawn, so the once-per-round reactive timing can be independently verified.",
  "",
  "Official English Habit screenshots are needed only when an English catalog name conflicts with the in-game client. They are no longer needed for bulk numeric entry.",
];

await writeFile(outputPath, `${lines.join("\n")}\n`);
console.log(`Mechanics gap report: ${sourced}/165 sourced, ${executable}/165 executable, ${unsupported.length} reactive gaps`);
