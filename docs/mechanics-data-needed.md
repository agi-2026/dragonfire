# Mechanics evidence and data needed

Generated from catalog snapshot: 2026-08-04T16:02:08.518Z

## Coverage

- 33/33 dragons have five sourced Habit records.
- 165/165 Habits have triggers, targets, rank values, durations, chances, and actions.
- 165/165 Habits currently use trigger/action forms supported by the War Council interpreter.
- Trigger vocabulary: combat_start, each, odd, on_ally_damaged, on_damaged, rounds.
- Action vocabulary: cleanse, cmd_chance, copy, dmg, heal, mod, purge, stack, status.
- Status vocabulary: advantage, bleed, burn, double_strike, evade, first_strike, overwhelm, panic, resistance, slow, stagger, stun, taunt, vulnerable, weakened.
- Target selectors: adjacency, all, any, dealer:fire, dealer:physical, dealer:tactical, highest:inst, highest:int, highest_str, least_troops, linked, most_troops, prefer_dealer:fire, prefer_dealer:physical, prefer_lane:C, prefer_lane:L, prefer_lane:R, prefer_not_status:resistance, prefer_status:prey, same_lane.

## Imported but not yet executable

- None.

No imported Habit is excluded from executable coverage. Community-sourced still does not mean independently verified.

## Player-observed calibration evidence

- 3 anonymized Dragon Pit profiles record level, Stars, Power, troop capacity, and all four combat attributes.
- 3 anonymized battle summaries record team troop counts, troop matchups, final survivors, and visible modifiers.
- The in-game attribute descriptions confirm Strength → Physical offense, Instinct → Tactical offense / Physical defense, Intelligence → Fire offense / Tactical defense, and Initiative → Fire defense / turn order.
- The supplied reports verify positive Affinity at +20% Dragon Stats and Shieldbearers versus Cavalry at -7%/+7% damage.
- Source screenshots are not committed; player, guild, and map identifiers are not stored.

## Assumptions that require battle validation

1. Negative Affinity is provisionally modeled as -20% Dragon Stats by symmetry; its exact in-game penalty is not yet captured.
2. Habit stat enhancement uses the community model's divisor of 2470. The game does not publish this formula.
3. A Vanguard effect activates from the center lane. The community guide explicitly labels that position rule as fan-derived rather than official.
4. Level, Stars, Power, troop capacity, and the damage curve are still approximate. The three profiles include unknown account-wide modifiers, so they cannot identify a universal progression curve alone.
5. Status ordering, resistance, evasion, control, First Strike, Double Strike, and reactive-damage timing need held-out round details.

## Smallest useful validation pack

Please provide these only when convenient:

1. Tap Details on one or two of the supplied reports and capture the round-by-round damage, healing, status, and survivor breakdown.
2. One screen showing the account's Stronghold / Dragon Care bonuses that affect Dragon attributes or troop capacity, so account modifiers can be separated from level/Star progression.
3. If convenient, one battle screen with negative Affinity visible, to replace the provisional symmetric -20% penalty with an observed value.
4. If available, one report where the same Vanguard dragon is moved out of the center lane, to verify whether the Vanguard effect actually stops.
5. Much later, a high-Star Sunfyre report that visibly triggers Bright Protector or Light of Dawn, so the once-per-round reactive timing can be independently verified.

Official English Habit screenshots are needed only when an English catalog name conflicts with the in-game client. They are no longer needed for bulk numeric entry.
