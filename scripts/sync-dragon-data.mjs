import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://wyrmtable.com/api/dragons";
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), "../data/dragon-catalog.v1.json");
const rarityOrder = { Legendary: 0, Epic: 1, Rare: 2 };

const response = await fetch(SOURCE_URL, {
  headers: { accept: "application/json", "user-agent": "Dragonfire-War-Council data research" },
});
if (!response.ok) throw new Error(`Dragon source returned ${response.status}`);

const payload = await response.json();
if (!Array.isArray(payload.dragons) || payload.dragons.length !== 33) {
  throw new Error(`Expected 33 dragons, received ${payload.dragons?.length ?? "invalid data"}`);
}

const dragons = payload.dragons
  .map((dragon) => ({
    id: dragon.id,
    name: dragon.name,
    rarity: dragon.rarity,
    breed: dragon.breed,
    baseLevel: 1,
    baseStats: {
      strength: dragon.stats.str,
      instinct: dragon.stats.inst,
      intelligence: dragon.stats.int,
      initiative: dragon.stats.init,
    },
    affinities: {
      positive: [...dragon.affinity],
      negative: [...dragon.weaknesses],
    },
    vanguard: {
      text: dragon.vanguardText || null,
      structuredEffectsStatus: "unverified",
    },
    command: {
      text: null,
      structuredEffectsStatus: "missing",
    },
    habits: dragon.habits.map((habit) => ({
      slot: habit.slot,
      name: habit.name,
      unlockStar: habit.unlockStar,
      levelEffectsStatus: "unverified",
    })),
    evidence: {
      confidence: "community-sourced",
      sourceIds: ["wyrmtable-public-api"],
      independentlyVerified: false,
    },
  }))
  .sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity] || a.name.localeCompare(b.name));

const catalog = {
  schema: "dragonfire-war-council/dragon-catalog-v1",
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  gameDataAsOf: "2026-07-29",
  policy: {
    unknownMechanics: "exclude-from-competitive-ranking",
    playerModifiersIncluded: false,
    notes: "Base attributes are community-sourced level-one values. Stronghold, Heirloom, Realm, Star, and Reign-level modifiers are not included.",
  },
  sources: [
    {
      id: "wyrmtable-public-api",
      type: "community-database",
      url: SOURCE_URL,
      fields: ["identity", "rarity", "breed", "baseStats", "affinities", "habitNames", "vanguardText"],
      verification: "Source states that values were checked against live game data; Dragonfire War Council has not independently reproduced every value.",
    },
    {
      id: "official-dragon-guide",
      type: "official-mechanics-guide",
      url: "https://news.gotdragonfire.com/a-guide-to-dragons/",
      fields: ["statSemantics", "commands", "habits", "reignLevel", "starRank"],
      verification: "Authoritative for system semantics, not a complete numeric dragon table.",
    },
  ],
  dragons,
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${dragons.length} dragons to ${OUTPUT}`);
