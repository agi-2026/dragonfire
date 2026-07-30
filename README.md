# Dragonfire War Council

An original, static-first PvP research tool for Dragonfire players. The current alpha combines a seeded battle simulator, transparent roster rankings, a multi-army team builder, and a versionable dragon/Habit library.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`. The site has no build step, backend, account system, analytics, or external asset dependency. A Vercel project can point directly at this directory with the framework preset set to “Other.”

## Product loop

1. **Battle Lab** compares two three-dragon formations over a seeded Monte Carlo run.
2. **Rankings** explain current investment and kit readiness without claiming official precision.
3. **Team Builder** turns the roster into disjoint PvP, siege, and development squads.
4. **Dragon Library** exposes the data and confidence behind each recommendation.

This follows the useful product loop popularized by matchup simulators such as PvPoke, while keeping the Dragonfire implementation, visual identity, data model, and code original.

## What the alpha models

- One shared troop type per formation and positive/negative affinities
- Three fixed lanes with mirrored targeting and fallback targeting
- Current power, star-gated Habit unlocks, Habit levels, role, and damage type
- Known pre-combat effects for Vhagar, Kalspire, Syrax, Zivern, Vaeldra, Caraxes, Shadowsong, and Tessarion
- Tessarion's per-round scaling and Blazing Leader targeting
- Seeded damage variance, Burn, Panic, Stagger, healing/recovery, and a round cap
- A representative battle log plus aggregate win rate, duration, and remaining health

## What is not yet confirmed

The game does not expose a complete public combat formula. Command coefficients, troop-capacity conversion, defense curves, exact targeting priorities, resistance, status chances, and several Habit descriptions are still modeled conservatively. UI output labels that uncertainty instead of presenting the result as an official tier list.

## Calibration plan

The next durable feature should be battle-report ingestion, not more decorative UI. A useful report schema is:

```json
{
  "patch": "game-version",
  "teamA": { "dragons": [], "troop": "shieldbearers", "troopCount": 0 },
  "teamB": { "dragons": [], "troop": "cavalry", "troopCount": 0 },
  "rounds": [],
  "winner": "A",
  "source": "manual-or-screenshot",
  "confidence": "verified"
}
```

Store the mechanics dataset separately from player rosters and tag every rule with `introducedIn`, `retiredIn`, `source`, and `confidence`. That makes balance changes auditable and lets old battles remain reproducible.

## Public-launch path

- **Alpha:** static Vercel deploy, feedback link, shareable matchup parameters, privacy-friendly analytics.
- **Calibration:** battle report upload, versioned mechanics, formula fitting, public matchup matrix.
- **Growth:** shareable profiles, guild tools, counters and team coverage, supporter page.
- **Expansion:** heirlooms, upgrade costs, troops, commanders, progression planner.

Do not copy game or third-party site artwork without permission. Original presentation and source-backed data are more defensible for donations, advertising, or an eventual developer partnership.
