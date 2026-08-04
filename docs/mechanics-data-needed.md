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

## Assumptions that require battle validation

1. Defense mapping is currently Physical → Instinct, Tactical → Intelligence, and Fire → Initiative, following the public community mechanics guide.
2. Habit stat enhancement uses the community model's divisor of 2470. The game does not publish this formula.
3. A Vanguard effect activates from the center lane. The community guide explicitly labels that position rule as fan-derived rather than official.
4. Level, Stars, Power, troop capacity, and the damage curve are still approximate. These have more impact on predicted win rates than additional Habit screenshots.
5. Status ordering, resistance, evasion, control, First Strike, Double Strike, and reactive-damage timing need held-out combat reports.

## Smallest useful validation pack

Please provide these only when convenient:

1. One current detail screen each for Vhagar, Venator, and Kalspire showing level, Stars, Power, and all four combat attributes.
2. Three complete battle reports using the same formation, including both teams, troop type/count, every round, final survivors, and damage/healing numbers.
3. If available, one report where the same Vanguard dragon is moved out of the center lane, to verify whether the Vanguard effect actually stops.
4. Much later, a high-Star Sunfyre report that visibly triggers Bright Protector or Light of Dawn, so the once-per-round reactive timing can be independently verified.

Official English Habit screenshots are needed only when an English catalog name conflicts with the in-game client. They are no longer needed for bulk numeric entry.
