(function (global) {
  "use strict";

  const VERSION = "0.13.0";
  const POSITIONS = ["Left flank", "Vanguard", "Right flank"];
  const COMMAND_NAMES = new Set([
    "Caraxes", "Crimson", "Kalspire", "Malachite", "Seasmoke", "Sheepstealer", "Sunfyre", "Syrax", "Venator", "Vhagar",
    "Daemoros", "Feskar", "Rhysarion", "Shadowsong", "Tairax", "Tashix", "Tessarion", "Vaeldra", "Velar", "Vermax", "Zivern",
    "Antares", "Arrax", "Arulix", "Bevlorin", "Dawnseeker", "Jagadrix", "Nyrena", "Shadowrend", "Shimmer", "Solstryker", "Thunderstrike", "Vesper",
  ]);
  const HABIT_NAMES = new Set([
    "Vhagar:0", "Vhagar:1", "Venator:1", "Kalspire:0", "Caraxes:0",
    "Syrax:0", "Tessarion:0", "Tessarion:1", "Vaeldra:0", "Shadowsong:0", "Zivern:0",
  ]);
  const VANGUARD_NAMES = new Set(COMMAND_NAMES);
  let catalog = new Map();

  function configureCatalog(value) {
    const dragons = Array.isArray(value) ? value : value?.dragons;
    if (Array.isArray(dragons)) catalog = new Map(dragons.map((dragon) => [dragon.name, dragon]));
  }

  function hashSeed(text) {
    let hash = 2166136261;
    for (let index = 0; index < String(text).length; index += 1) {
      hash ^= String(text).charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = seed || 1;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rankAt(values, rank) {
    return values[Math.max(0, Math.min(values.length - 1, (Number(rank) || 1) - 1))];
  }

  function unlockedCount(dragon) {
    return Math.min(5, Math.floor((Number(dragon.starRank) || 1) / 2));
  }

  function habitRank(dragon, index) {
    if (index >= unlockedCount(dragon)) return 0;
    return Math.max(1, Number(dragon.habitRanks?.[index]) || 1);
  }

  function evidence(dragon) {
    return catalog.get(dragon.name) || dragon.canonical || {};
  }

  function scaledStats(dragon) {
    const base = evidence(dragon).baseStats || { strength: 50, instinct: 50, intelligence: 50, initiative: 50 };
    const level = Number(dragon.reignLevel) || 1;
    const stars = Number(dragon.starRank) || 1;
    const progression = 1 + Math.max(0, level - 1) * 0.012 + Math.max(0, stars - 1) * 0.045;
    return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Number(value) * progression]));
  }

  function affinityMultiplier(dragon, troop) {
    return dragon.affinity?.[troop] === "+" ? 1.07 : dragon.affinity?.[troop] === "-" ? 0.93 : 1;
  }

  function makeFighter(dragon, lane, side, troop) {
    const stats = scaledStats(dragon);
    const power = Math.max(1, Number(dragon.power) || 1);
    const affinity = affinityMultiplier(dragon, troop);
    const scale = Math.sqrt(power / 30000);
    const maxHp = (900 + (stats.strength + stats.instinct + stats.intelligence) * 7.2) * scale * affinity;
    return {
      dragon, lane, side, stats, maxHp, hp: maxHp, alive: true,
      affinity, initiative: stats.initiative,
      dealt: { physical: 1, tactical: 1, fire: 1, all: 1 },
      received: { physical: 1, tactical: 1, fire: 1, all: 1 },
      recoveryMultiplier: 1, recoveryReceived: 1,
      statuses: {}, stacks: {}, lastRecoveredRound: -99,
    };
  }

  function addEvent(log, round, text, kind = "") {
    if (!log) return;
    if (!log[round]) log[round] = [];
    log[round].push({ text, kind });
  }

  function alive(team) { return team.filter((fighter) => fighter.alive); }
  function adjacentTo(fighter, team) { return alive(team).filter((target) => Math.abs(target.lane - fighter.lane) <= 1); }
  function sameLane(fighter, team) { return alive(team).find((target) => target.lane === fighter.lane); }
  function weakest(team) { return alive(team).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; }
  function chooseTarget(attacker, enemies, mode = "default") {
    const living = alive(enemies);
    if (!living.length) return null;
    if (mode === "nonBurn") return [...living].sort((a, b) => Number(Boolean(a.statuses.burn)) - Number(Boolean(b.statuses.burn)) || a.hp - b.hp)[0];
    if (mode === "physicalDealer") return living.find((target) => target.dragon.damageType === "physical") || sameLane(attacker, enemies) || weakest(enemies);
    if (mode === "highestStrength") return [...living].sort((a, b) => b.stats.strength - a.stats.strength)[0];
    return sameLane(attacker, enemies) || weakest(enemies);
  }

  function status(target, name, rounds, value = true) {
    const current = target.statuses[name];
    if (!current || current.rounds < rounds) target.statuses[name] = { rounds, value };
  }

  function defenseStat(type) {
    return type === "physical" ? "strength" : type === "fire" ? "intelligence" : "instinct";
  }

  function deal(attacker, targets, type, coefficient, random, log, round, label = "Command") {
    const list = (Array.isArray(targets) ? targets : [targets]).filter((target) => target?.alive);
    for (const target of list) {
      const attack = attacker.stats[type === "physical" ? "strength" : type === "fire" ? "intelligence" : "instinct"];
      const defense = target.stats[defenseStat(type)];
      const statCurve = Math.max(0.62, Math.min(1.55, attack / Math.max(1, defense)));
      const powerScale = Math.sqrt(Math.max(1, Number(attacker.dragon.power) || 1) / 30000);
      const panic = attacker.statuses.panic ? 0.8 : 1;
      const vulnerable = target.statuses.vulnerable ? 1 + target.statuses.vulnerable.value : 1;
      const weakened = attacker.statuses.weakened ? 0.85 : 1;
      const variance = 0.96 + random() * 0.08;
      const tessarionRank = attacker.dragon.name === "Tessarion" ? habitRank(attacker.dragon, 0) : 0;
      const sharpened = tessarionRank && ["physical", "fire"].includes(type) ? 1 + rankAt([0.07, 0.084, 0.098, 0.119, 0.14], tessarionRank) * (attacker.hp / attacker.maxHp > 0.75 || attacker.statuses.advantage ? 2 : 1) : 1;
      const amount = 155 * coefficient * powerScale * statCurve * attacker.affinity * attacker.dealt.all * attacker.dealt[type] * target.received.all * target.received[type] * panic * vulnerable * weakened * sharpened * variance;
      target.hp = Math.max(0, target.hp - amount);
      addEvent(log, round, `${attacker.dragon.name} ${label === "Basic" ? "hits" : "uses " + label + " on"} ${target.dragon.name} for ${Math.round(amount).toLocaleString()} ${type} damage.`, label === "Basic" ? "" : "command");
      if (target.hp <= 0) {
        target.alive = false;
        addEvent(log, round, `${target.dragon.name} is defeated.`, "ko");
      }
    }
  }

  function recover(source, targets, coefficient, log, round) {
    for (const target of (Array.isArray(targets) ? targets : [targets]).filter(Boolean)) {
      if (!target.alive) continue;
      const amount = target.maxHp * coefficient * source.recoveryMultiplier * target.recoveryReceived;
      const actual = Math.max(0, Math.min(amount, target.maxHp - target.hp));
      target.hp += actual;
      target.lastRecoveredRound = round;
      addEvent(log, round, `${source.dragon.name} restores ${Math.round(actual).toLocaleString()} to ${target.dragon.name}.`, "status");
    }
  }

  function applyVanguard(team, enemies, log) {
    const vanguard = team[1];
    if (!vanguard) return;
    const left = team[0], right = team[2];
    const name = vanguard.dragon.name;
    const selfDamage = (type, pct) => { vanguard.dealt[type] *= 1 + pct; };
    const flankDamage = (fighter, type, pct) => { if (fighter) fighter.dealt[type] *= 1 + pct; };
    const flankStats = (fighter, values) => { if (fighter) for (const [key, value] of Object.entries(values)) fighter.stats[key] += value; };
    const robust = () => { vanguard.stats.strength += 15; vanguard.stats.intelligence += 15; vanguard.stats.instinct += 15; if (right) right.received.all *= 0.92; };
    const tactical = new Set(["Sunfyre", "Syrax", "Tairax", "Velar", "Zivern", "Vesper"]);
    const physical = new Set(["Venator", "Vermax", "Daemoros", "Shadowrend", "Thunderstrike"]);
    const fire = new Set(["Caraxes", "Shadowsong", "Antares", "Jagadrix"]);
    const durable = new Set(["Vhagar", "Vaeldra", "Arrax", "Bevlorin"]);
    if (tactical.has(name)) { selfDamage("tactical", 0.16); flankStats(left, { instinct: 20, initiative: 20 }); }
    else if (physical.has(name)) { selfDamage("physical", 0.16); flankStats(left, { instinct: 20, initiative: 20 }); }
    else if (fire.has(name)) { selfDamage("fire", 0.16); flankStats(right, { strength: 20, initiative: 20 }); }
    else if (durable.has(name)) { vanguard.received.all *= 0.92; flankDamage(left, "tactical", 0.16); }
    else if (["Kalspire", "Seasmoke", "Feskar", "Tessarion", "Arulix", "Nyrena", "Solstryker"].includes(name)) robust();
    else if (["Malachite", "Dawnseeker", "Shimmer"].includes(name)) { vanguard.recoveryMultiplier *= 1.15; vanguard.stats.instinct += 25; flankDamage(left, "fire", 0.16); }
    else if (["Crimson"].includes(name)) { vanguard.recoveryMultiplier *= 1.2; vanguard.stats.intelligence += 25; flankDamage(right, "physical", 0.10); }
    else if (["Rhysarion"].includes(name)) { vanguard.recoveryMultiplier *= 1.15; vanguard.stats.initiative += 25; if (right) right.dealt.all *= 1.08; }
    else if (["Tashix", "Sheepstealer"].includes(name)) { vanguard.recoveryReceived *= 1.2; vanguard.stats.intelligence += 25; flankDamage(right, "physical", 0.10); }
    else if (name === "Shimmer") { vanguard.recoveryMultiplier *= 1.15; vanguard.stats.instinct += 25; flankDamage(left, "fire", 0.16); }
    addEvent(log, 0, `${name}'s Vanguard effect is applied to its actual lane targets.`, "status");
  }

  function applyHabits(team, enemies, log) {
    for (const fighter of team) {
      const dragon = fighter.dragon;
      const h1 = habitRank(dragon, 0);
      if (dragon.name === "Vhagar" && h1) fighter.received.all *= 1 - rankAt([0.035, 0.042, 0.049, 0.06, 0.07], h1);
      if (dragon.name === "Caraxes" && h1) {
        const reduction = rankAt([0.058, 0.07, 0.082, 0.10, 0.117], h1);
        enemies.forEach((enemy) => { enemy.dealt.all *= 1 - reduction; enemy.stats.initiative *= 1 - reduction; });
      }
      if (dragon.name === "Vaeldra" && h1) {
        fighter.dealt.all *= 1 + rankAt([0.083, 0.10, 0.117, 0.142, 0.167], h1);
        fighter.received.all *= 1 - rankAt([0.05, 0.06, 0.07, 0.085, 0.10], h1);
      }
      if (dragon.name === "Syrax" && h1) {
        const value = rankAt([0.038, 0.046, 0.054, 0.065, 0.076], h1);
        team.forEach((ally) => { ally.stats.initiative *= 1 + value; });
      }
      if (dragon.name === "Kalspire" && h1) {
        const value = rankAt([0.05, 0.06, 0.07, 0.085, 0.10], h1);
        fighter.dealt.all *= 1 + value;
        fighter.stats.initiative *= 1 + value * 0.55;
      }
      if (dragon.name === "Venator" && habitRank(dragon, 1)) fighter.dealt.physical *= 1 + rankAt([0.04, 0.048, 0.056, 0.068, 0.08], habitRank(dragon, 1));
      if (dragon.name === "Zivern" && h1) {
        const value = rankAt([0.025, 0.03, 0.035, 0.043, 0.05], h1);
        enemies.forEach((enemy) => { enemy.dealt.all *= 1 - value; });
      }
      if (dragon.name === "Shadowsong" && h1) {
        const value = rankAt([0.15, 0.18, 0.21, 0.255, 0.30], h1);
        adjacentTo(fighter, enemies).slice(0, 2).forEach((enemy) => { enemy.stats.instinct *= 1 - value; enemy.stats.initiative *= 1 - value; });
      }
      if (dragon.name === "Tessarion" && habitRank(dragon, 1)) {
        const fireAlly = team.filter((ally) => ally !== fighter && ally.dragon.damageType === "fire").sort((a, b) => a.lane - b.lane)[0];
        if (fireAlly) fireAlly.dealt.fire *= 1 + rankAt([0.10, 0.12, 0.14, 0.17, 0.20], habitRank(dragon, 1));
      }
    }
    const vhagar = team.find((fighter) => fighter.dragon.name === "Vhagar" && habitRank(fighter.dragon, 1));
    const right = team[2];
    if (vhagar && right?.dragon.damageType === "physical") {
      const value = rankAt([0.125, 0.15, 0.175, 0.2125, 0.25], habitRank(vhagar.dragon, 1));
      right.dealt.physical *= 1 + value;
      addEvent(log, 0, `Vhagar's Battle Leader grants ${Math.round(value * 100)}% physical damage to right-flank ${right.dragon.name}.`, "status");
    }
  }

  function command(fighter, allies, enemies, round, random, log) {
    const name = fighter.dragon.name;
    const target = (mode) => chooseTarget(fighter, enemies, mode);
    const adj = (count = 2) => adjacentTo(fighter, enemies).slice(0, count);
    const all = () => alive(enemies);
    const chance = (value) => random() < value;
    const hit = (targets, type, coefficient, label = "Command") => deal(fighter, targets, type, coefficient, random, log, round, label);

    if (name === "Vhagar") {
      all().forEach((enemy) => { const p = enemy.statuses.burn ? 0.50 : 0.25; if (chance(p)) status(enemy, "taunt", 2, fighter); });
      if (round % 2 === 0) hit(adj(1), "physical", 1.20, "Ancient Fury");
    } else if (name === "Venator") {
      const double = Boolean(fighter.statuses.doubleStrike);
      hit(target(), "physical", double ? 0.80 : 0.40, "Hunter's Assault");
      hit(target(), "physical", double ? 0.80 : 0.40, "Hunter's Assault");
      if ([4, 6, 8, 10].includes(round) && chance(0.40)) status(fighter, "doubleStrike", 2);
    } else if (name === "Kalspire") {
      hit(target(), "tactical", 0.50, "Wyrm Cunning");
      adj(2).slice(1).forEach((enemy) => { if (chance(0.30)) status(enemy, "bleed", 2, 0.025); });
    } else if (name === "Tairax") {
      if (round % 2 === 1 && chance(0.25)) status(target(), "stagger", 1);
      if ([2, 5, 8].includes(round)) { const victim = target("nonBurn"); hit(victim, "fire", 1.15, "Gleaming Flame"); if (victim?.alive && chance(0.50)) status(victim, "burn", 2, 0.025); }
    } else if (name === "Malachite" && [2, 4, 7, 9].includes(round)) {
      hit(target(), "tactical", 1.00, "Verdant Renewal"); recover(fighter, alive(allies), 0.07, log, round);
    } else if (name === "Caraxes" && [3, 6, 9].includes(round)) hit(all(), "fire", fighter.statuses.firstStrike ? 1.50 : 1.00, "Blood Wyrm");
    else if (name === "Crimson") {
      if (round % 2 === 1 && chance(0.20)) status(target(), "stun", 2);
      if ([2, 5, 8].includes(round)) hit(target(), "fire", 1.40, "Crimson Inferno");
    } else if (name === "Syrax") {
      const fireAlly = alive(allies).filter((ally) => ally.dragon.damageType === "fire").sort((a, b) => a.lane - b.lane)[0];
      if (fireAlly && chance(0.20)) { fireAlly.dealt.fire *= 1.10; status(fireAlly, "firstStrike", 2); }
      if ([1, 4, 6, 9].includes(round)) hit(adj(1), "tactical", 1.10, "Strategic Flame");
    } else if (name === "Shadowsong" && [2, 5, 8].includes(round)) hit(adj(2), "fire", adj(2).some((enemy) => enemy.statuses.panic) ? 1.50 : 1.00, "Shadow Flame");
    else if (name === "Vaeldra") { all().forEach((enemy) => { if (chance(0.25)) status(enemy, "taunt", 2, fighter); }); if (round % 2 === 1) hit(adj(2), "physical", 0.45, "Iron Wing"); }
    else if (name === "Zivern" && [1, 4, 6, 9].includes(round)) { const victim = target(); if (victim && chance(0.40)) victim.received.tactical *= 1.15; hit(adj(2), "tactical", 0.75, "Storm Rend"); }
    else if (name === "Seasmoke" && [3, 6, 9].includes(round)) hit(target(), "fire", 1.90, "Sea Flame");
    else if (name === "Sunfyre" && [1, 4, 7, 10].includes(round)) { const count = fighter.hp / fighter.maxHp < 0.75 ? 2 : 1; hit(adj(count), "tactical", 1.10, "Golden Assault"); if (fighter.hp / fighter.maxHp < 0.5) adj(count).forEach((enemy) => { hit(enemy, "fire", 0.55, "Golden Flame"); if (chance(0.50)) status(enemy, "burn", 2, 0.025); }); }
    else if (name === "Tessarion") { if ([1, 4, 7].includes(round)) { const victim = target("physicalDealer"); hit(victim, "fire", 0.95, "Blue Flame"); if (victim && chance(0.50)) victim.dealt.all *= victim.dragon.damageType === "physical" ? 0.80 : 0.90; } if ([3, 6, 9].includes(round)) hit(target(), "physical", 0.60, "Wing Strike"); }
    else if (name === "Tashix" && [3, 6, 9].includes(round)) hit(adj(1), "fire", 2.00, "Blazing Hoard");
    else if (name === "Jagadrix") { const victim = target(); if (victim && chance(0.30)) { victim.stats.instinct *= 0.85; victim.stats.initiative *= 0.85; } if ([2, 5, 8].includes(round)) hit(victim, "fire", 1.20, "Jagged Flame"); }
    else if (name === "Thunderstrike" && round % 2 === 1) hit(target(), "physical", 1.00, "Thunder Strike");
    else if (name === "Vesper") { const victim = target(); if (victim && chance(0.20)) status(victim, "slow", 2, 0.20); hit(victim, "tactical", 0.70, "Night Tactics"); }
    else if (name === "Antares") { const victims = adj(2); if (victims[0] && chance(0.20)) status(victims[0], "vulnerable", 2, 0.10); hit(victims, "fire", 0.65, "Scorching Arc"); }
    else if (name === "Shadowrend") { const victim = target(); if (victim && chance(0.25)) { status(victim, "panic", 2); victim.dealt.all *= 1.20; } if ([4, 7, 9, 10].includes(round)) hit(adj(2), "physical", 0.80, "Shadow Rend"); }
    else if (name === "Dawnseeker") { if (chance(0.30)) { fighter.stats.instinct *= 1.20; fighter.stats.initiative *= 1.20; } if ([1, 2, 4, 7].includes(round)) hit(target(), "tactical", 0.50, "Dawn Tactics"); if ([2, 5, 8].includes(round)) recover(fighter, adjacentTo(fighter, allies).slice(0, 2), 0.03, log, round); }
    else if (name === "Shimmer") { const strongest = [...alive(allies)].sort((a, b) => b.stats.strength - a.stats.strength)[0]; if (strongest && chance(0.30)) { strongest.stats.strength *= 1.18; strongest.stats.initiative *= 1.09; } hit(adj(2), "tactical", 0.50, "Shimmering Blow"); }
    else if (name === "Daemoros" && round % 2 === 1) { const victim = target(); hit(victim, "physical", 1.25, "Ashen Claw"); if (victim && chance(0.20)) status(victim, "burn", 2, 0.025); }
    else if (name === "Rhysarion") { if ([1, 4, 7].includes(round)) hit(adj(2), "physical", 0.70, "Rending Talons"); if ([2, 5, 8].includes(round)) hit(all(), "fire", all().some((enemy) => enemy.statuses.stun || enemy.statuses.stagger || enemy.statuses.taunt) ? 0.30 : 0.20, "Controlled Flame"); }
    else if (name === "Velar") { if ([2, 4, 6, 8].includes(round) && chance(0.20)) alive(allies).slice(0, 2).forEach((ally) => { ally.dealt.all *= 1.15; }); if ([3, 5, 7, 9].includes(round)) hit(all(), "tactical", 0.45, "Velar's Reach"); }
    else if (name === "Bevlorin") { if ([1, 5, 9].includes(round)) hit(all(), "physical", 0.30, "Broad Assault"); if ([3, 7].includes(round)) hit(target(), "physical", 0.90, "Focused Assault"); }
    else if (name === "Nyrena") { if ([1, 3].includes(round)) hit(all(), "fire", 0.20, "Cinder Wave"); if ([5, 7, 9].includes(round)) hit(target(), "tactical", 0.80, "Focused Tactics"); }
    else if (name === "Arrax" && [2, 4, 5, 6, 8].includes(round)) { if ([2, 4, 6, 8].includes(round) && chance(0.25)) status(target(), "weakened", 1); hit(adj(2), "physical", 0.40, "Arrax Assault"); }
    else if (name === "Arulix" && [1, 2, 3, 5, 8].includes(round)) hit(all().filter((enemy) => enemy.dragon.damageType === "physical"), "tactical", 0.45, "Counter Tactics");
    else if (name === "Solstryker" && round % 2 === 1) { hit(target(), "physical", 0.30, "Solar Strike"); const victim = target(); if (victim && chance(0.20)) victim.dealt.physical *= 0.88; }
    else if (name === "Feskar") { const strong = chooseTarget(fighter, enemies, "highestStrength"); if (strong && chance(0.20)) strong.dealt.physical *= 0.88; hit(weakest(enemies), "tactical", 1.00, "Feskar Tactics"); }
    else if (name === "Vermax") { hit(target(), "physical", target()?.dragon.damageType === "fire" ? 1.00 : 0.50, "Relentless Assault"); const tacticalAlly = alive(allies).find((ally) => ally.dragon.damageType === "tactical"); if (tacticalAlly) tacticalAlly.dealt.all *= 1.025; }
    else if (name === "Sheepstealer" && [1, 4, 7, 10].includes(round)) { const recovered = alive(enemies).find((enemy) => round - enemy.lastRecoveredRound <= 1); hit(recovered || target(), "fire", recovered ? 2.00 : 1.00, "Prey Hunter"); }
  }

  function tick(team, round, log) {
    for (const fighter of alive(team)) {
      for (const name of ["burn", "bleed"]) {
        const effect = fighter.statuses[name];
        if (effect) {
          const amount = fighter.maxHp * Number(effect.value || 0.025);
          fighter.hp = Math.max(0, fighter.hp - amount);
          addEvent(log, round, `${fighter.dragon.name} takes ${Math.round(amount).toLocaleString()} ${name} damage.`, "status");
          if (fighter.hp <= 0) { fighter.alive = false; addEvent(log, round, `${fighter.dragon.name} is defeated by ${name}.`, "ko"); }
        }
      }
      for (const [name, effect] of Object.entries(fighter.statuses)) {
        effect.rounds -= 1;
        if (effect.rounds <= 0) delete fighter.statuses[name];
      }
    }
  }

  function runBattle(teamAData, teamBData, options = {}) {
    const troopA = options.troopA || "shieldbearers";
    const troopB = options.troopB || "shieldbearers";
    const maxRounds = Number(options.maxRounds) || 12;
    const random = options.random || seededRandom(hashSeed(options.seed || "dragonfire"));
    const log = options.record ? {} : null;
    const a = teamAData.map((dragon, lane) => makeFighter(dragon, lane, "A", troopA));
    const b = teamBData.map((dragon, lane) => makeFighter(dragon, lane, "B", troopB));
    applyVanguard(a, b, log); applyVanguard(b, a, log);
    applyHabits(a, b, log); applyHabits(b, a, log);
    let completedRound = 0;
    for (let round = 1; round <= maxRounds && alive(a).length && alive(b).length; round += 1) {
      completedRound = round;
      const actors = [...alive(a), ...alive(b)].sort((x, y) => (y.stats.initiative * (1 - (y.statuses.slow?.value || 0))) - (x.stats.initiative * (1 - (x.statuses.slow?.value || 0))) || random() - 0.5);
      for (const fighter of actors) {
        if (!fighter.alive) continue;
        const allies = fighter.side === "A" ? a : b;
        const enemies = fighter.side === "A" ? b : a;
        if (!alive(enemies).length) break;
        if (fighter.statuses.stun || fighter.statuses.stagger) { addEvent(log, round, `${fighter.dragon.name} loses its action to control.`, "status"); continue; }
        const taunter = alive(enemies).find((enemy) => fighter.statuses.taunt?.value === enemy);
        deal(fighter, taunter || chooseTarget(fighter, enemies), fighter.dragon.damageType || "physical", 0.55, random, log, round, "Basic");
        if (alive(enemies).length) command(fighter, allies, enemies, round, random, log);
      }
      tick(a, round, log); tick(b, round, log);
    }
    const health = (team) => Math.max(0, team.reduce((sum, fighter) => sum + fighter.hp, 0) / team.reduce((sum, fighter) => sum + fighter.maxHp, 0));
    const healthA = health(a), healthB = health(b);
    const winner = alive(a).length && !alive(b).length ? "A" : alive(b).length && !alive(a).length ? "B" : healthA > healthB + 0.0001 ? "A" : healthB > healthA + 0.0001 ? "B" : "draw";
    return { winner, rounds: completedRound, healthA, healthB, log, a, b };
  }

  function simulateMatchup(teamA, teamB, options = {}) {
    const count = Math.max(1, Number(options.count) || 100);
    const seed = options.seed || "dragonfire";
    let winsA = 0, winsB = 0, draws = 0, totalRounds = 0, healthA = 0, healthB = 0, representative;
    for (let index = 0; index < count; index += 1) {
      const result = runBattle(teamA, teamB, { ...options, seed: `${seed}:${index}`, record: index === 0 });
      if (index === 0) representative = result;
      if (result.winner === "A") winsA += 1; else if (result.winner === "B") winsB += 1; else draws += 1;
      totalRounds += result.rounds; healthA += result.healthA; healthB += result.healthB;
    }
    return { winsA, winsB, draws, totalRounds, healthA, healthB, representative, count };
  }

  function coverage(team) {
    let known = 0, total = 0;
    const details = [];
    team.forEach((dragon, lane) => {
      total += 2;
      const vanguard = lane === 1 && VANGUARD_NAMES.has(dragon.name);
      const commandKnown = COMMAND_NAMES.has(dragon.name);
      if (vanguard) known += 1;
      if (commandKnown) known += 1;
      details.push(`${dragon.name}: Command ${commandKnown ? "encoded" : "unknown"}${lane === 1 ? `, Vanguard ${vanguard ? "encoded" : "unknown"}` : ""}`);
      for (let index = 0; index < unlockedCount(dragon); index += 1) {
        total += 1;
        if (HABIT_NAMES.has(`${dragon.name}:${index}`)) known += 1;
      }
    });
    return { known, total, ratio: total ? known / total : 0, details };
  }

  function registryCoverage() {
    return { commands: COMMAND_NAMES.size, vanguards: VANGUARD_NAMES.size, habits: HABIT_NAMES.size, total: COMMAND_NAMES.size + VANGUARD_NAMES.size + HABIT_NAMES.size };
  }

  function isHabitEncoded(name, index) { return HABIT_NAMES.has(`${name}:${index}`); }

  function formationProfile(team, troop) {
    const raw = team.reduce((sum, dragon) => sum + (Number(dragon.power) || 0), 0);
    const preview = team.map((dragon, lane) => makeFighter(dragon, lane, "A", troop));
    applyVanguard(preview, [], null);
    applyHabits(preview, [], null);
    const score = preview.reduce((sum, fighter) => {
      const attack = (fighter.dealt.physical + fighter.dealt.tactical + fighter.dealt.fire) / 3 * fighter.dealt.all;
      const durability = 1 / Math.max(0.5, fighter.received.all);
      const statValue = (fighter.stats.strength + fighter.stats.instinct + fighter.stats.intelligence + fighter.stats.initiative) / 4;
      const baseStatValue = Object.values(scaledStats(fighter.dragon)).reduce((total, value) => total + value, 0) / 4;
      return sum + fighter.dragon.power * fighter.affinity * (attack * 0.55 + durability * 0.30 + statValue / baseStatValue * 0.15);
    }, 0);
    const c = coverage(team);
    const reasons = [];
    team.forEach((dragon) => {
      const affinity = dragon.affinity?.[troop];
      if (affinity === "+") reasons.push({ points: 0, text: `${dragon.name} receives its verified ${troop} affinity in combat.` });
      if (affinity === "-") reasons.push({ points: 0, text: `${dragon.name} is penalized by its ${troop} affinity.`, warn: true });
    });
    const center = team[1], right = team[2], left = team[0];
    if (center?.name === "Vhagar") {
      reasons.push({ points: 0, text: `Vhagar Vanguard reduces its own damage received and buffs ${left?.damageType === "tactical" ? left.name : "only a tactical left flank"}.` });
      if (habitRank(center, 1)) reasons.push({ points: 0, text: right?.damageType === "physical" ? `Battle Leader buffs right-flank ${right.name}'s physical damage.` : `Battle Leader does not buff right-flank ${right?.name}; it is not a physical dealer.`, warn: right?.damageType !== "physical" });
    }
    reasons.push({ points: 0, text: `${c.known}/${c.total} formation effects are structured; unknown effects are neutral.`, warn: c.ratio < 1 });
    return { raw, score, bonus: score - raw, reasons, coverage: c };
  }

  function evaluateFormation(team, troop, benchmarks, options = {}) {
    const runs = Math.max(1, Number(options.runs) || 4);
    let wins = 0, games = 0, healthEdge = 0;
    for (let index = 0; index < benchmarks.length; index += 1) {
      const opponent = benchmarks[index];
      const opponentTeam = opponent.team || opponent;
      const opponentTroop = opponent.troop || "shieldbearers";
      const forward = simulateMatchup(team, opponentTeam, { count: runs, maxRounds: options.maxRounds || 12, troopA: troop, troopB: opponentTroop, seed: `${options.seed || "optimizer"}:${index}:forward` });
      const reverse = simulateMatchup(opponentTeam, team, { count: runs, maxRounds: options.maxRounds || 12, troopA: opponentTroop, troopB: troop, seed: `${options.seed || "optimizer"}:${index}:reverse` });
      wins += forward.winsA + forward.draws * 0.5 + reverse.winsB + reverse.draws * 0.5;
      games += forward.count + reverse.count;
      healthEdge += (forward.healthA - forward.healthB) / forward.count + (reverse.healthB - reverse.healthA) / reverse.count;
    }
    const winRate = games ? wins / games : 0.5;
    const score = winRate * 100000 + healthEdge * 1000;
    return { score, winRate, games, coverage: coverage(team) };
  }

  global.DragonfireSimulation = {
    VERSION, POSITIONS, configureCatalog, hashSeed, seededRandom, runBattle, simulateMatchup,
    evaluateFormation, formationProfile, coverage, registryCoverage, isHabitEncoded, habitRank, unlockedCount,
  };
})(typeof window !== "undefined" ? window : globalThis);
