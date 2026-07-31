# Dragonfire War Council

An original, static-first PvP research tool for Dragonfire players. The current alpha combines a versioned evidence catalog, a clearly labeled prototype battle engine, reusable formations, a dedicated My Team roster editor, a core-dragon Team Builder, a multi-army Team Optimizer, and a private-by-default roster.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`. The site has no frontend build step or account system. Dragon portraits load from official `gotdragonfire.com` and `news.gotdragonfire.com` image URLs with a local SVG fallback. A Vercel project can point directly at this directory with the framework preset set to “Other.”

## Product loop

1. **My Team** is the everyday roster editor. Search or filter every imported dragon, toggle ownership, adjust Power and level with sliders and step buttons, set Stars directly, and edit every unlocked Habit from a dedicated tab.
2. **Battle Lab** compares two three-dragon formations over a seeded Monte Carlo run.
3. **Data Lab** exposes sourced level-one attributes and mechanic coverage. Competitive rankings are intentionally unpublished until power curves, Commands, Vanguards, Habit scaling, and battle outcomes are validated.
4. **Team Builder** starts from one dragon the player wants to use. It tests every partner pair, lane order, and PvP troop type, then compares current teams with a core-only future investment target. It also surfaces partner movement, Habit unlock breakpoints, risk conditions, and modeled breaker teams.
5. **Team Optimizer** turns the complete roster into disjoint PvP, siege, and development squads. Its compact dragon grid supports desktop hover previews and a focused editor drawer for Power, Stars, level, ownership, and Habit ranks.
6. **Dragon Library** exposes the data and confidence behind each recommendation.

## Canonical game-data pipeline

The public catalog lives in [`data/dragon-catalog.v1.json`](./data/dragon-catalog.v1.json). It currently contains all 33 known dragons, 132 level-one Strength, Instinct, Intelligence, and Initiative values, 33 English Command descriptions, 33 English Vanguard descriptions, base troop counts, and march speeds. All 132 stat values agree across two public community datasets. Each record retains source and verification metadata; community-sourced values are never relabeled as independently verified.

```bash
npm run sync:data      # refresh Wyrmtable identities, then cross-check and enrich from Dragonfire Hub
npm run sync:mechanics # refresh Command, Vanguard, base troop, and march-speed evidence only
npm run check:data     # enforce 33 unique dragons plus complete stats, Commands, Vanguards, and Habit slots
npm run check       # validate the catalog and JavaScript syntax
```

The factual snapshot uses the public [Wyrmtable dragon API](https://wyrmtable.com/api/dragons), the public [Dragonfire Hub catalog](https://dragonfire-hub.com/) for English Command and Vanguard evidence plus an independent stat cross-check, and the [official Dragon guide](https://news.gotdragonfire.com/a-guide-to-dragons/) for system semantics. No competing site's interface, code, ranking algorithm, or branding is copied. Collected ability descriptions are shown to users, but their structured effects remain `unverified`; unknown mechanic formulas use the publication policy `exclude-from-competitive-ranking`.

The feature-parity boundary and implementation sequence are documented in [`docs/competitive-parity.md`](./docs/competitive-parity.md).

## Private-by-default roster setup

New visitors begin with the 31 commonly available catalog dragons selected. Sheepstealer and Vermax are separated as limited-release dragons and remain off unless the player opts in. Starter estimates make the simulator usable immediately:

- Legendary: 1 Star, level 40, 22,000 estimated power
- Epic: 2 Stars, level 30, 16,000 estimated power
- Rare: 3 Stars, level 20, 10,000 estimated power

Roster data is stored only in browser `localStorage` under `dragonfire-war-council-v3`. Saved formations use `dragonfire-saved-formations-v1`. Restore Defaults returns to this recommended starter roster. Import/export remains the portable backup mechanism; there is no cloud synchronization. Importing an older roster now opens My Team immediately so the player can review and update it with button- and slider-first controls.

## Analytics and community data

Visitor measurement and roster research are deliberately separate:

1. In the Vercel project, open **Analytics**, enable **Web Analytics**, and redeploy. The included `/_vercel/insights/script.js` integration counts privacy-friendly page views and unique visitors. It converts the known app tabs to clean paths such as `/battle` and `/rankings`, while stripping query strings and arbitrary URL fragments.
2. For opt-in roster snapshots, add a Postgres provider such as Neon from the Vercel Marketplace, run [`schema.sql`](./schema.sql), and confirm that Vercel exposes `DATABASE_URL` to Production and Preview deployments. Redeploy after adding the variable.
3. The **Contribute roster snapshot** button is the only upload path. It shows a confirmation and sends active dragon name, rarity, Power, Stars, level, Habit levels, the starter-estimate marker, consent version, and model version to `/api/contribute-roster`.

The server validates and bounds every field. The database schema intentionally has no username, email, guild, IP, cookie, request-header, battle-history, or saved-team columns. Keep aggregate visitor analytics separate from contributed game data; do not try to identify or join individual people across those systems.

Useful aggregate queries after contributions arrive:

```sql
-- Most commonly owned dragons
SELECT dragon->>'name' AS dragon, count(*) AS snapshots
FROM roster_contributions, jsonb_array_elements(roster) AS dragon
GROUP BY 1 ORDER BY 2 DESC;

-- Typical Stars, level, Power, and Habit ranks per dragon
SELECT dragon->>'name' AS dragon,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (dragon->>'stars')::numeric) AS median_stars,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (dragon->>'level')::numeric) AS median_level,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (dragon->>'power')::numeric)
         FILTER (WHERE (dragon->>'estimatedPower')::boolean = false) AS median_confirmed_power
FROM roster_contributions, jsonb_array_elements(roster) AS dragon
GROUP BY 1 ORDER BY 1;
```

Published dragon portraits are displayed from Warner Bros. Games' official Dragonfire catalog and news site. The limited-release dragons retain an original deterministic SVG fallback because no matching portrait is currently published in the official catalog. This implementation includes attribution but does not imply an artwork license or official affiliation.

This follows the useful product loop popularized by matchup simulators such as PvPoke, while keeping the Dragonfire implementation, visual identity, data model, and code original.

## What the alpha models

- One shared troop type per formation and positive/negative affinities
- Three fixed lanes with mirrored targeting and fallback targeting
- Current power, star-gated Habit unlocks, Habit levels, role, and damage type
- Known pre-combat effects for Vhagar, Kalspire, Syrax, Zivern, Vaeldra, Caraxes, Shadowsong, and Tessarion
- Tessarion's per-round scaling and Blazing Leader targeting
- Seeded damage variance, Burn, Panic, Stagger, healing/recovery, and a round cap
- A representative battle log plus aggregate win rate, duration, and remaining health
- Core-dragon team search across every legal partner pair, all six lane orders, and every non-siege troop type
- A core-only future projection for Stars, level, and unlocked Habit ranks, with current-versus-potential partner movement

## What is not yet confirmed

The game does not expose a complete public combat formula. English Command and Vanguard descriptions are now complete in the evidence catalog, but their exact execution order, troop-capacity conversion, defense curves, targeting priorities, resistance, status chances, and Habit level scaling are still modeled conservatively. Battle Lab output is a formation hypothesis, not a predicted win rate, and the competitive leaderboard stays gated until those mechanics are encoded and validated against battle outcomes.

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

Before monetization, obtain written permission or a fan-content license for continued use of official portrait artwork. Attribution alone is not a substitute for licensing.
