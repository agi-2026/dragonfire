# Literal synergy model

Team Optimizer v0.17 ranks formations by the percentages the game descriptions actually expose. It does not convert roster Power into an invented damage or healing formula.

## Ranking contract

For each documented effect, the engine resolves:

1. Star unlock and the player's Habit level.
2. Source and eligible recipient.
3. Lane or adjacency requirement.
4. Physical, tactical, fire, recovery, mitigation, or control applicability.
5. Stated chance, active rounds, and duration.
6. Target coverage across the three-dragon formation.

Compatible effects compound multiplicatively. The result reports three independent values:

- **Cross-dragon interaction:** one dragon making another dragon's kit more effective.
- **Self-kit multiplier:** the documented percentage value a dragon activates for itself or applies to an enemy.
- **Affinity multiplier:** the geometric team average of the verified +20% positive Dragon Stats affinity and the provisional -20% negative assumption.

The displayed literal multiplier is:

```text
cross interaction x sqrt(self kit) x affinity
```

**Synergy + strength** is the default PvP recommendation mode. It applies a bounded strength prior to prevent a clever but severely underpowered formation from being labeled the main army:

```text
selection index = literal multiplier x (formation raw Power / strongest available trio raw Power) ^ 0.65
```

This is a roster-strength prior, not a damage formula. **Pure multiplier lab** removes the prior and ranks only the literal multiplier. Seeded benchmark battles are displayed as supporting evidence but do not reorder either ranking.

## Expected-value rules

- A 35% every-round effect lasting two rounds receives up to 70% expected uptime.
- Effects that start on a named round use only the remaining modeled rounds.
- Conditional and reactive effects use a visible 50% opportunity assumption until event timing is calibrated.
- A percentage buff that misses its required lane or damage type contributes zero.
- “Two allies” targets the two other formation members when available.
- Burn, Panic, and First-Strike payoffs are discounted by the producer's expected status uptime.
- Damage-received reductions are converted to equivalent durability, so 20% less damage is 1 / 0.8 = 1.25 durability rather than merely 1.20.

## Example: Malachite / Vhagar / Venator

- Malachite supplies +70% Recovery to three allies.
- Vhagar receives +18% more Recovery from round 4 onward at Habit level 2.
- Vhagar gives +16% tactical damage to left-flank Malachite.
- Vhagar's Battle Leader gives +15% non-basic physical damage to right-flank Venator.
- Malachite's Forest's Instinct can buff the two physical allies and reduce their tactical damage received.

This formation can therefore outrank a higher-Power trio on literal interaction while still showing its lower raw Power. That is a synergy claim, not a guaranteed battle-result claim.
