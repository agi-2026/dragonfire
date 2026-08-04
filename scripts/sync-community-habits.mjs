import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { resolve } from "node:path";

const CATALOG_PATH = resolve("data/dragon-catalog.v1.json");
const SNAPSHOT_PATH = resolve("data/habit-effects.community.v1.json");
const SITE_URL = "https://dragonfiresim.com/";
const SOURCE_ID = "dragonfiresim-public-habit-model";
const SOURCE_IDS = { bruma: "seasmoke", fuegosol: "sunfyre" };

function extractObjectLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${marker} in public bundle`);
  const start = markerIndex + marker.length;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated ${marker} object literal`);
}

const homeResponse = await fetch(SITE_URL, { headers: { accept: "text/html" } });
if (!homeResponse.ok) throw new Error(`DragonfireSim request failed (${homeResponse.status})`);
const home = await homeResponse.text();
const assetPath = home.match(/\/assets\/index-[^"']+\.js/)?.[0];
if (!assetPath) throw new Error("Could not identify the current DragonfireSim bundle");

const assetUrl = new URL(assetPath, SITE_URL).href;
const bundleResponse = await fetch(assetUrl, { headers: { accept: "text/javascript" } });
if (!bundleResponse.ok) throw new Error(`DragonfireSim bundle request failed (${bundleResponse.status})`);
const bundle = await bundleResponse.text();
const literal = extractObjectLiteral(bundle, "DF.HABITS=");
const sandbox = Object.create(null);
const remoteHabits = vm.runInNewContext(`(${literal})`, sandbox, { timeout: 1_000 });
const cleanHabits = JSON.parse(JSON.stringify(remoteHabits));

const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
const catalogById = new Map(catalog.dragons.map((dragon) => [dragon.id, dragon]));
const snapshotDragons = {};
const errors = [];

for (const [remoteId, habits] of Object.entries(cleanHabits)) {
  if (remoteId === "danzarina") continue; // Not present in the current 33-dragon catalog.
  const catalogId = SOURCE_IDS[remoteId] || remoteId;
  const dragon = catalogById.get(catalogId);
  if (!dragon) {
    errors.push(`${remoteId}: no catalog mapping`);
    continue;
  }
  if (!Array.isArray(habits) || habits.length !== 5) {
    errors.push(`${dragon.name}: expected five Habits, found ${habits?.length ?? 0}`);
    continue;
  }

  snapshotDragons[dragon.name] = habits.map((habit, index) => {
    const canonical = dragon.habits[index];
    if (habit.unlock !== canonical.unlockStar) {
      errors.push(`${dragon.name} H${index + 1}: unlock conflict (${habit.unlock} vs ${canonical.unlockStar})`);
    }
    return {
      slot: index + 1,
      englishName: canonical.name,
      sourceName: habit.name,
      sourceLocale: "es",
      unlockStar: habit.unlock,
      parts: habit.parts,
    };
  });
}

for (const dragon of catalog.dragons) {
  const habits = snapshotDragons[dragon.name];
  if (!habits) errors.push(`${dragon.name}: missing public Habit table`);
  else if (habits.length !== dragon.habits.length) errors.push(`${dragon.name}: Habit count mismatch`);
}
if (errors.length) throw new Error(errors.join("\n"));

const fetchedAt = new Date().toISOString();
const snapshot = {
  schema: "dragonfire-war-council/community-habit-effects-v1",
  fetchedAt,
  source: {
    id: SOURCE_ID,
    type: "community-simulator-public-bundle",
    siteUrl: SITE_URL,
    assetUrl,
    assetSha256: createHash("sha256").update(bundle).digest("hex"),
    locale: "es",
    verification: "Mechanics and level values are community-authored. English names come from the independent canonical catalog and are matched by dragon and unlock slot, not literal translation.",
  },
  dragons: snapshotDragons,
};

for (const dragon of catalog.dragons) {
  const sourceHabits = snapshotDragons[dragon.name];
  dragon.habits.forEach((habit, index) => {
    habit.effects = sourceHabits[index].parts;
    habit.sourceName = sourceHabits[index].sourceName;
    habit.sourceLocale = sourceHabits[index].sourceLocale;
    habit.levelEffectsStatus = "community-sourced";
    habit.sourceId = SOURCE_ID;
  });
  dragon.evidence.sourceIds = [...new Set([...dragon.evidence.sourceIds, SOURCE_ID])];
}

catalog.sources = catalog.sources.filter((source) => source.id !== SOURCE_ID);
catalog.sources.push(snapshot.source);
catalog.generatedAt = fetchedAt;

await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Community Habit mechanics synchronized: ${Object.keys(snapshotDragons).length}/33 dragons, ${Object.values(snapshotDragons).flat().length}/165 Habits`);
console.log(`Source snapshot: ${assetUrl} (${snapshot.source.assetSha256.slice(0, 12)})`);
