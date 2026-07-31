import * as cheerio from "cheerio";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CATALOG_PATH = resolve("data/dragon-catalog.v1.json");
const HUB_URL = "https://dragonfire-hub.com/";
const SOURCE_ID = "dragonfire-hub-public-catalog";
const clean = (value) => value.replace(/\s+/g, " ").trim();

const response = await fetch(HUB_URL, { headers: { accept: "text/html" } });
if (!response.ok) throw new Error(`Dragonfire Hub request failed (${response.status})`);

const $ = cheerio.load(await response.text());
const profiles = new Map();

$("img[alt*=' - Game of Thrones Dragonfire dragon stats and abilities']").each((_, image) => {
  const name = $(image).attr("alt").split(" - ")[0];
  const card = $(image).closest("div.group.relative.p-3");
  const skillText = (alt) => clean(card.find(`img[alt='${alt}']`).closest("div.flex.gap-2").children("div").last().text());
  const stats = {};

  card.find("div.group\\/stat").each((__, stat) => {
    const label = clean($(stat).find("p").eq(0).text()).toLowerCase();
    stats[label] = Number(clean($(stat).find("p").eq(1).text()));
  });

  const troopsPanel = card.find("div.group\\/troops");
  const marchSpeedPanel = troopsPanel.parent().children("div").last();
  profiles.set(name, {
    stats,
    baseTroops: Number(clean(troopsPanel.find("p").eq(1).text())),
    marchSpeed: clean(marchSpeedPanel.find("p").eq(1).text()),
    vanguardText: skillText("Vanguard"),
    commandText: skillText("Command"),
  });
});

const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
const errors = [];

for (const dragon of catalog.dragons) {
  const profile = profiles.get(dragon.name);
  if (!profile) {
    errors.push(`${dragon.name}: missing Dragonfire Hub profile`);
    continue;
  }
  for (const stat of ["strength", "instinct", "intelligence", "initiative"]) {
    if (dragon.baseStats[stat] !== profile.stats[stat]) {
      errors.push(`${dragon.name}: ${stat} conflict (${dragon.baseStats[stat]} vs ${profile.stats[stat]})`);
    }
  }
  if (!profile.commandText) errors.push(`${dragon.name}: missing Command text`);
  if (!profile.vanguardText) errors.push(`${dragon.name}: missing Vanguard text`);

  dragon.baseTroops = profile.baseTroops;
  dragon.marchSpeed = profile.marchSpeed;
  dragon.vanguard.text = profile.vanguardText;
  dragon.vanguard.structuredEffectsStatus = "unverified";
  dragon.vanguard.sourceId = SOURCE_ID;
  dragon.command.text = profile.commandText;
  dragon.command.structuredEffectsStatus = "unverified";
  dragon.command.sourceId = SOURCE_ID;
  dragon.evidence.sourceIds = [...new Set([...dragon.evidence.sourceIds, SOURCE_ID])];
}

if (errors.length) throw new Error(errors.join("\n"));

catalog.sources = catalog.sources.filter((source) => source.id !== SOURCE_ID);
catalog.sources.push({
  id: SOURCE_ID,
  type: "community-database",
  url: HUB_URL,
  fields: ["baseStatsCrossCheck", "baseTroops", "marchSpeed", "vanguardText", "commandText"],
  verification: "All 132 level-one stat values match the independent Wyrmtable snapshot. Command and Vanguard descriptions remain community-sourced and are not yet encoded as verified simulator effects.",
});
catalog.generatedAt = new Date().toISOString();

await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Mechanics synchronized: ${catalog.dragons.length}/33 Commands, ${catalog.dragons.length}/33 Vanguards, 132/132 base stats cross-checked`);
