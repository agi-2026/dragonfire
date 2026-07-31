# Competitive parity plan

Dragonfire War Council should match the useful workflow of established Dragonfire simulators without copying their code, branding, layouts, or unsupported claims.

## Product comparison

| Capability | Established simulator benchmark | War Council 0.9 | Decision |
| --- | --- | --- | --- |
| Personal roster | Stars, level, Habits | Power, Stars, level, Habit ranks, ownership | Keep and add verified stat derivation |
| Combat engine | Claimed round-by-round calibration from game captures | Seeded prototype with incomplete formulas | Highest-priority rebuild |
| Formation search | Thousands of lineups, lanes, and troop combinations | Disjoint multi-army heuristic | Run the real engine inside our disjoint optimizer |
| Scenarios | PvP, PvE, and Siege | PvP prototype plus budget Siege allocation | Add scenario-specific rules and benchmarks |
| Dragon mechanics | Stats, Orders, Vanguards, affinities, Habits | Cross-checked base stats, complete English Command/Vanguard text, affinities, partial Habit model | Structure and verify every effect |
| Results | Win rate, best troop, upgrade priority | Prototype outcome rate and explainable heuristic reasons | Add confidence intervals, counters, and marginal upgrade value |
| Rankings | Computed tier list | Publication-gated Data Lab | Keep the gate; publish only after calibration |
| Persistence | Browser and optional cloud | Browser-local JSON import/export and saved teams | Keep private default; add optional account sync later |

## War Council differentiators to preserve

- Allocate several non-overlapping PvP armies instead of optimizing one formation in isolation.
- Reserve a low-investment Siege army without consuming the strongest PvP dragons.
- Keep public game evidence separate from private player roster data.
- Attach a source and confidence state to every mechanic.
- Save a Team Builder result and load it directly into either side of Battle Lab.
- Show why a recommendation changed, not only the winning lineup.

## Implementation order

### P0: credible combat data

1. Encode all 33 Orders/Commands, 33 Vanguards, and 165 Habits as structured effects.
2. Store the official English name separately from localized source text. Never produce an English name through literal translation when a sourced English label exists.
3. Derive Strength, Instinct, Intelligence, Initiative, Power, and troop capacity from level, rarity, Stars, and account modifiers.
4. Add versioned fixtures from anonymized battle captures and fit each formula against observed results.

### P1: optimizer parity

1. Run every legal three-dragon lineup, six lane orders, and applicable troop type through the calibrated engine.
2. Support PvP, PvE, and structure/Siege objectives with separate opponent pools and scoring rules.
3. Compute matchup tables, confidence intervals, counters, and best troop rather than a single generic synergy score.
4. Calculate upgrade priority from marginal win-rate gain per resource cost.

### P2: better product loop

1. Make the primary funnel: import/select roster, verify strongest dragons, choose objective, optimize, inspect explanation, save/test/share.
2. Add battle-report ingestion with consent and redaction controls.
3. Add shareable formation links and optional cloud profiles while preserving local-only mode.

## Publication rule

A competitive tier list remains unpublished until the engine passes held-out battle validation. Community-sourced data can appear in Data Lab with attribution, but it cannot silently become a verified simulator coefficient.
