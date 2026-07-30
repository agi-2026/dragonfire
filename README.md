# Dragonfire War Council

An original, static-first PvP research tool for Dragonfire players. The current alpha combines a seeded battle simulator, a global maxed formation index, reusable formations, a multi-army team builder, and a versionable dragon/Habit library.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`. The site has no frontend build step or account system. Dragon portraits load from official `gotdragonfire.com` and `news.gotdragonfire.com` image URLs with a local SVG fallback. A Vercel project can point directly at this directory with the framework preset set to “Other.”

## Product loop

1. **Battle Lab** compares two three-dragon formations over a seeded Monte Carlo run.
2. **Rankings** exhaustively score all 5,456 maxed trios across six lane orders and four PvP troop types, independent of personal rosters.
3. **Team Builder** turns the roster into disjoint PvP, siege, and development squads. Its compact dragon grid supports desktop hover previews and a focused editor drawer for Power, Stars, level, ownership, and Habit ranks.
4. **Dragon Library** exposes the data and confidence behind each recommendation.

## Private-by-default roster setup

New visitors begin with the 31 commonly available catalog dragons selected. Sheepstealer and Vermax are separated as limited-release dragons and remain off unless the player opts in. Starter estimates make the simulator usable immediately:

- Legendary: 1 Star, level 40, 22,000 estimated power
- Epic: 2 Stars, level 30, 16,000 estimated power
- Rare: 3 Stars, level 20, 10,000 estimated power

Roster data is stored only in browser `localStorage` under `dragonfire-war-council-v3`. Saved formations use `dragonfire-saved-formations-v1`. Restore Defaults returns to this recommended starter roster. Import/export remains the portable backup mechanism; there is no cloud synchronization. The Team Builder labels estimated power and prompts the player to replace it with in-game values for accurate results.

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

Before monetization, obtain written permission or a fan-content license for continued use of official portrait artwork. Attribution alone is not a substitute for licensing.
