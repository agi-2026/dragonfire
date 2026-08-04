import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(await readFile(resolve("data/dragon-catalog.v1.json"), "utf8"));
const calibration = JSON.parse(await readFile(resolve("data/calibration/2026-08-04-anonymous-player.json"), "utf8"));
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
  "## Player-observed calibration evidence",
  "",
  `- ${calibration.dragonProfiles.length} anonymized Dragon Pit profiles record level, Stars, Power, troop capacity, and all four combat attributes.`,
  `- ${calibration.battleSummaries.length} anonymized battle summaries record team troop counts, troop matchups, final survivors, and visible modifiers.`,
  "- The in-game attribute descriptions confirm Strength → Physical offense, Instinct → Tactical offense / Physical defense, Intelligence → Fire offense / Tactical defense, and Initiative → Fire defense / turn order.",
  "- The supplied reports verify positive Affinity at +20% Dragon Stats and Shieldbearers versus Cavalry at -7%/+7% damage.",
  "- Source screenshots are not committed; player, guild, and map identifiers are not stored.",
  "",
  "## Assumptions that require battle validation",
  "",
  "1. Negative Affinity is provisionally modeled as -20% Dragon Stats by symmetry; its exact in-game penalty is not yet captured.",
  "2. Habit stat enhancement uses the community model's divisor of 2470. The game does not publish this formula.",
  "3. A Vanguard effect activates from the center lane. The community guide explicitly labels that position rule as fan-derived rather than official.",
  "4. Level, Stars, Power, troop capacity, and the damage curve are still approximate. The three profiles include unknown account-wide modifiers, so they cannot identify a universal progression curve alone.",
  "5. Status ordering, resistance, evasion, control, First Strike, Double Strike, and reactive-damage timing need held-out round details.",
  "",
  "## Smallest useful validation pack",
  "",
  "Please provide these only when convenient:",
  "",
  "1. Tap Details on one or two of the supplied reports and capture the round-by-round damage, healing, status, and survivor breakdown.",
  "2. One screen showing the account's Stronghold / Dragon Care bonuses that affect Dragon attributes or troop capacity, so account modifiers can be separated from level/Star progression.",
  "3. If convenient, one battle screen with negative Affinity visible, to replace the provisional symmetric -20% penalty with an observed value.",
  "4. If available, one report where the same Vanguard dragon is moved out of the center lane, to verify whether the Vanguard effect actually stops.",
  "5. Much later, a high-Star Sunfyre report that visibly triggers Bright Protector or Light of Dawn, so the once-per-round reactive timing can be independently verified.",
  "",
  "Official English Habit screenshots are needed only when an English catalog name conflicts with the in-game client. They are no longer needed for bulk numeric entry.",
];

await writeFile(outputPath, `${lines.join("\n")}\n`);
console.log(`Mechanics gap report: ${sourced}/165 sourced, ${executable}/165 executable, ${unsupported.length} reactive gaps`);
