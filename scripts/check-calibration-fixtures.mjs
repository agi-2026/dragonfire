import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("data/calibration/2026-08-04-anonymous-player.json", root), "utf8"));
const catalog = JSON.parse(await readFile(new URL("data/dragon-catalog.v1.json", root), "utf8"));
const catalogByName = new Map(catalog.dragons.map((dragon) => [dragon.name, dragon]));

assert.equal(fixture.privacy.sourceImagesCommitted, false);
assert.equal(fixture.privacy.playerIdentifiersStored, false);
assert.equal(fixture.privacy.guildStored, false);
assert.equal(fixture.privacy.mapCoordinatesStored, false);
assert.equal(fixture.dragonProfiles.length, 3);
assert.equal(fixture.battleSummaries.length, 3);

assert.deepEqual(fixture.statSemantics, {
  strength: "Increases Physical damage dealt.",
  instinct: "Increases Tactical damage dealt and reduces Physical damage received.",
  intelligence: "Increases Fire damage dealt and reduces Tactical damage received.",
  initiative: "Reduces Fire damage received and determines turn order.",
});

const effectiveMultipliers = fixture.dragonProfiles.map((profile) => {
  const base = catalogByName.get(profile.dragon)?.baseStats;
  assert(base, `${profile.dragon} must exist in the canonical catalog`);
  const ratios = Object.keys(profile.stats).map((stat) => profile.stats[stat] / base[stat]);
  return { dragon: profile.dragon, stars: profile.stars, average: ratios.reduce((sum, value) => sum + value, 0) / ratios.length };
}).sort((a, b) => a.stars - b.stars);

assert(effectiveMultipliers[1].average > effectiveMultipliers[0].average, "The observed 4-star profile should exceed the observed 3-star effective stat multiplier");
assert(effectiveMultipliers[2].average > effectiveMultipliers[1].average, "The observed 5-star profile should exceed the observed 4-star effective stat multiplier");

for (const report of fixture.battleSummaries) {
  assert.equal(report.attackerAffinityStatPct, 20);
  assert.equal(report.attacker.reduce((sum, lane) => sum + lane.maximum, 0), 28124);
  const expectedDefenderMaximum = report.opponent.startsWith("Stone") ? 36000 : 39000;
  assert.equal(report.defender.reduce((sum, lane) => sum + lane.maximum, 0), expectedDefenderMaximum);
}

const kalspire = fixture.dragonProfiles.find((profile) => profile.dragon === "Kalspire");
const level49Kalspire = fixture.battleSummaries[0].attacker.find((lane) => lane.dragon === "Kalspire");
const capacityRatio = kalspire.troopCapacity / level49Kalspire.maximum;
assert(capacityRatio > 1.012 && capacityRatio < 1.015, "Kalspire's observed level 49 to 50 troop-capacity change should remain reproducible");

console.log(`Calibration fixture valid: 3 anonymized Dragon Pit profiles, 3 battle summaries, effective stat multipliers ${effectiveMultipliers.map((item) => `${item.dragon} ${item.average.toFixed(3)}x`).join(", ")}.`);
