(function (global) {
  "use strict";

  const VERSION = "0.15.0";
  const POSITIONS = ["Left flank", "Vanguard", "Right flank"];
  const COMMAND_NAMES = new Set([
    "Caraxes", "Crimson", "Kalspire", "Malachite", "Seasmoke", "Sheepstealer", "Sunfyre", "Syrax", "Venator", "Vhagar",
    "Daemoros", "Feskar", "Rhysarion", "Shadowsong", "Tairax", "Tashix", "Tessarion", "Vaeldra", "Velar", "Vermax", "Zivern",
    "Antares", "Arrax", "Arulix", "Bevlorin", "Dawnseeker", "Jagadrix", "Nyrena", "Shadowrend", "Shimmer", "Solstryker", "Thunderstrike", "Vesper",
  ]);
  const HABIT_NAMES = new Set();
  const VANGUARD_NAMES = new Set(COMMAND_NAMES);
  const SUPPORTED_HABIT_TRIGGERS = new Set(["combat_start", "each", "rounds", "odd", "on_damaged", "on_ally_damaged"]);
  const SUPPORTED_HABIT_ACTIONS = new Set(["mod", "dmg", "status", "heal", "stack", "copy", "cleanse", "cmd_chance", "purge"]);
  let catalog = new Map();

  function isHabitDefinitionExecutable(habit) {
    return Array.isArray(habit?.effects) && habit.effects.length > 0 && habit.effects.every((part) => {
      if (!SUPPORTED_HABIT_TRIGGERS.has(part.when)) return false;
      const actions = Array.isArray(part.actions) ? part.actions : Object.values(part.branches || {}).flat();
      return actions.length > 0 && actions.every((action) => SUPPORTED_HABIT_ACTIONS.has(action.t));
    });
  }

  function configureCatalog(value) {
    const dragons = Array.isArray(value) ? value : value?.dragons;
    if (Array.isArray(dragons)) {
      catalog = new Map(dragons.map((dragon) => [dragon.name, dragon]));
      HABIT_NAMES.clear();
      dragons.forEach((dragon) => dragon.habits?.forEach((habit, index) => {
        if (isHabitDefinitionExecutable(habit)) HABIT_NAMES.add(`${dragon.name}:${index}`);
      }));
    }
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
      commandDealt: { physical: 1, tactical: 1, fire: 1, all: 1 },
      commandReceived: { physical: 1, tactical: 1, fire: 1, all: 1 },
      recoveryMultiplier: 1, recoveryReceived: 1,
      statuses: {}, stacks: {}, temporaryMods: [], cmdChance: {}, lastRecoveredRound: -99,
      reactedThisRound: false, allyReactedThisRound: false, allies: null, enemies: null,
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

  function status(target, name, rounds, value = true, caster = null) {
    const current = target.statuses[name];
    if (!current || current.rounds < rounds) target.statuses[name] = { rounds, value: name === "taunt" && caster ? caster : value, caster };
  }

  function statusMagnitude(effect, fallback) { return typeof effect?.value === "number" ? effect.value : fallback; }

  function defenseStat(type) {
    return type === "physical" ? "instinct" : type === "fire" ? "initiative" : "intelligence";
  }

  function deal(attacker, targets, type, coefficient, random, log, round, label = "Command", suppressReactive = false) {
    const list = (Array.isArray(targets) ? targets : [targets]).filter((target) => target?.alive);
    for (const target of list) {
      const evasion = target.statuses.evade;
      if (evasion && random() < statusMagnitude(evasion, 0.30)) {
        addEvent(log, round, `${target.dragon.name} evades ${attacker.dragon.name}'s attack.`, "status");
        continue;
      }
      const attack = attacker.stats[type === "physical" ? "strength" : type === "fire" ? "intelligence" : "instinct"];
      const defense = target.stats[defenseStat(type)];
      const statCurve = Math.max(0.62, Math.min(1.55, attack / Math.max(1, defense)));
      const powerScale = Math.sqrt(Math.max(1, Number(attacker.dragon.power) || 1) / 30000);
      const panic = attacker.statuses.panic ? 0.8 : 1;
      const vulnerable = target.statuses.vulnerable ? 1 + statusMagnitude(target.statuses.vulnerable, 0.10) : 1;
      const resistance = target.statuses.resistance ? 1 - statusMagnitude(target.statuses.resistance, 0.10) : 1;
      const weakened = attacker.statuses.weakened ? 1 - statusMagnitude(attacker.statuses.weakened, 0.15) : 1;
      const advantage = attacker.statuses.advantage ? 1 + statusMagnitude(attacker.statuses.advantage, 0.15) : 1;
      const variance = 0.96 + random() * 0.08;
      const tessarionRank = attacker.dragon.name === "Tessarion" ? habitRank(attacker.dragon, 0) : 0;
      const sharpened = tessarionRank && ["physical", "fire"].includes(type) ? 1 + rankAt([0.07, 0.084, 0.098, 0.119, 0.14], tessarionRank) * (attacker.hp / attacker.maxHp > 0.75 || attacker.statuses.advantage ? 2 : 1) : 1;
      const isBasic = label === "Basic";
      const commandDealt = isBasic ? 1 : attacker.commandDealt.all * attacker.commandDealt[type];
      const commandReceived = isBasic ? 1 : target.commandReceived.all * target.commandReceived[type];
      const amount = 155 * coefficient * powerScale * statCurve * attacker.affinity * attacker.dealt.all * attacker.dealt[type] * commandDealt * target.received.all * target.received[type] * commandReceived * panic * vulnerable * resistance * weakened * advantage * sharpened * variance;
      target.hp = Math.max(0, target.hp - amount);
      addEvent(log, round, `${attacker.dragon.name} ${label === "Basic" ? "hits" : "uses " + label + " on"} ${target.dragon.name} for ${Math.round(amount).toLocaleString()} ${type} damage.`, label === "Basic" ? "" : "command");
      if (target.hp <= 0) {
        target.alive = false;
        addEvent(log, round, `${target.dragon.name} is defeated.`, "ko");
      }
      if (amount > 0 && !suppressReactive) triggerReactiveHabits(target, label === "Basic" ? "basic" : type, round, random, log);
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

  const STAT_KEYS = { str: "strength", inst: "instinct", int: "intelligence", init: "initiative" };
  const STATUS_KEYS = { first_strike: "firstStrike", double_strike: "doubleStrike" };
  const HABIT_SCALE_DIVISOR = 2470;

  function ranked(value, rank) { return Array.isArray(value) ? rankAt(value, rank) : value; }
  function probability(value, rank) {
    const selected = Number(ranked(value ?? 1, rank));
    return selected > 1 ? selected / 100 : selected;
  }
  function healthRatio(fighter) { return fighter.hp / Math.max(1, fighter.maxHp); }
  function hasStatus(fighter, name) { return Boolean(fighter?.statuses?.[STATUS_KEYS[name] || name]); }
  function conditionMet(condition, source, target, allies, enemies) {
    if (!condition) return true;
    if (Array.isArray(condition)) return condition.some((item) => conditionMet(item, source, target, allies, enemies));
    if (condition === "troops_below_50" || condition === "self:troops_below_50") return healthRatio(source) < 0.5;
    if (condition === "troops_below_75" || condition === "self:troops_below_75") return healthRatio(source) < 0.75;
    if (condition === "self:troops_above_75") return healthRatio(source) > 0.75;
    if (condition === "self:advantage") return hasStatus(source, "advantage");
    if (condition === "target:troops_below_75") return healthRatio(target) < 0.75;
    if (condition === "target:troops_below_50") return healthRatio(target) < 0.5;
    if (condition === "target:troops_below_25") return healthRatio(target) < 0.25;
    if (condition === "target:healed") return target?.lastRecoveredRound >= 0;
    if (condition === "target:control") return ["stun", "stagger", "taunt", "panic", "slow"].some((name) => hasStatus(target, name));
    if (condition.startsWith("target:")) return hasStatus(target, condition.slice(7));
    if (condition === "enemy:healed") return alive(enemies).some((fighter) => fighter.lastRecoveredRound >= 0);
    if (condition.startsWith("enemy:")) return alive(enemies).some((fighter) => hasStatus(fighter, condition.slice(6)));
    if (condition.startsWith("stacks_")) {
      const match = condition.match(/^stacks_(.+)_(\d+)$/);
      return match ? Number(source.stacks[match[1]] || 0) >= Number(match[2]) : false;
    }
    return false;
  }

  function targetPool(source, allies, enemies, target = {}) {
    if (target.side === "self") return [source];
    return alive(target.side === "enemy" ? enemies : allies);
  }

  function selectHabitTargets(source, allies, enemies, target = {}, linked = []) {
    if (target.select === "linked") return linked.filter((fighter) => fighter.alive);
    let pool = targetPool(source, allies, enemies, target);
    const select = target.select || "any";
    const laneCode = select.split(":")[1];
    const lane = { L: 0, C: 1, R: 2 }[laneCode];
    if (select === "same_lane") pool = pool.filter((fighter) => fighter.lane === source.lane);
    else if (select === "adjacency") pool = pool.filter((fighter) => Math.abs(fighter.lane - source.lane) <= 1);
    else if (select.startsWith("dealer:")) pool = pool.filter((fighter) => fighter.dragon.damageType === laneCode);
    else if (select.startsWith("prefer_dealer:")) pool = [...pool].sort((a, b) => Number(b.dragon.damageType === laneCode) - Number(a.dragon.damageType === laneCode));
    else if (select.startsWith("prefer_lane:")) pool = [...pool].sort((a, b) => Number(b.lane === lane) - Number(a.lane === lane));
    else if (select.startsWith("prefer_status:")) pool = [...pool].sort((a, b) => Number(hasStatus(b, laneCode)) - Number(hasStatus(a, laneCode)));
    else if (select.startsWith("prefer_not_status:")) pool = [...pool].sort((a, b) => Number(hasStatus(a, laneCode)) - Number(hasStatus(b, laneCode)));
    else if (select === "least_troops") pool = [...pool].sort((a, b) => healthRatio(a) - healthRatio(b));
    else if (select === "most_troops") pool = [...pool].sort((a, b) => healthRatio(b) - healthRatio(a));
    else if (select === "highest_str") pool = [...pool].sort((a, b) => b.stats.strength - a.stats.strength);
    else if (select.startsWith("highest:")) pool = [...pool].sort((a, b) => b.stats[STAT_KEYS[laneCode]] - a.stats[STAT_KEYS[laneCode]]);
    const count = target.count === "all" || target.select === "all" ? pool.length : Math.max(1, Number(target.count) || 1);
    return pool.slice(0, count);
  }

  function modifierLocation(fighter, stat, exceptBasic) {
    if (STAT_KEYS[stat]) return [fighter.stats, STAT_KEYS[stat]];
    if (stat === "dmg_dealt") return [exceptBasic ? fighter.commandDealt : fighter.dealt, "all"];
    if (stat === "dmg_received") return [exceptBasic ? fighter.commandReceived : fighter.received, "all"];
    const match = stat.match(/^(physical|tactical|fire)_(dealt|received)$/);
    if (match) {
      if (match[2] === "dealt") return [exceptBasic ? fighter.commandDealt : fighter.dealt, match[1]];
      return [exceptBasic ? fighter.commandReceived : fighter.received, match[1]];
    }
    if (stat === "recovery") return [fighter, "recoveryMultiplier"];
    if (stat === "recovery_received") return [fighter, "recoveryReceived"];
    return null;
  }

  function applyModifier(target, modifier, rank, scale, duration, round) {
    const location = modifierLocation(target, modifier.stat, modifier.exceptBasic);
    if (!location) return false;
    const [container, key] = location;
    const pct = Number(ranked(modifier.pct, rank));
    const flat = Number(ranked(modifier.flat, rank));
    let temporary;
    if (Number.isFinite(pct)) {
      const factor = Math.max(0.01, 1 + pct * scale / 100);
      container[key] *= factor;
      temporary = { mode: "multiply", factor };
    } else if (Number.isFinite(flat)) {
      container[key] += flat;
      temporary = { mode: "add", delta: flat };
    } else return false;
    if (duration !== "combat" && Number.isFinite(Number(duration))) {
      target.temporaryMods.push({ container, key, ...temporary, expiresAt: round + Number(duration) });
    }
    return true;
  }

  function expireModifiers(team, round) {
    for (const fighter of team) {
      const remaining = [];
      for (const modifier of fighter.temporaryMods) {
        if (modifier.expiresAt <= round) {
          if (modifier.mode === "multiply") modifier.container[modifier.key] /= modifier.factor;
          else modifier.container[modifier.key] -= modifier.delta;
        }
        else remaining.push(modifier);
      }
      fighter.temporaryMods = remaining;
    }
  }

  function executeHabitActions(source, allies, enemies, actions, rank, round, random, log, suppressReactive = false) {
    const context = { linked: [] };
    for (const action of actions || []) {
      const targets = selectHabitTargets(source, allies, enemies, action.tgt, context.linked);
      const applied = [];
      for (const target of targets) {
        if (!conditionMet(action.onlyIf, source, target, allies, enemies)) continue;
        let actionChance = probability(action.chance, rank);
        if (action.bonusChance && conditionMet(action.bonusChance.cond, source, target, allies, enemies)) actionChance = probability(action.bonusChance.chance, rank);
        if (actionChance < 1 && random() >= actionChance) continue;
        if (action.t === "mod") {
          const modifiers = action.bonus && conditionMet(action.bonus.cond, source, target, allies, enemies) ? action.bonus.mods : action.mods;
          const scale = action.scaleStat ? 1 + source.stats[STAT_KEYS[action.scaleStat]] / HABIT_SCALE_DIVISOR : 1;
          for (const modifier of modifiers || []) applyModifier(target, modifier, rank, scale, action.dur, round);
          applied.push(target);
        } else if (action.t === "dmg") {
          const pct = action.bonus && conditionMet(action.bonus.cond, source, target, allies, enemies) ? ranked(action.bonus.pct, rank) : ranked(action.pct, rank);
          deal(source, target, action.dt, Number(pct) / 100, random, log, round, evidence(source.dragon).habits?.[0]?.name || "Habit", suppressReactive);
          applied.push(target);
        } else if (action.t === "status") {
          const statusName = STATUS_KEYS[action.st] || action.st;
          const scale = action.scaleStat ? 1 + source.stats[STAT_KEYS[action.scaleStat]] / HABIT_SCALE_DIVISOR : 1;
          const rawValue = ranked(action.val, rank);
          const value = Number.isFinite(Number(rawValue)) ? Number(rawValue) * scale / 100 : true;
          status(target, statusName, action.dur === "combat" ? 99 : Number(action.dur) || 1, value, source);
          applied.push(target);
        } else if (action.t === "heal") {
          const pct = action.bonus && conditionMet(action.bonus.cond, source, target, allies, enemies) ? ranked(action.bonus.pct, rank) : ranked(action.pct, rank);
          const scale = action.scaleStat ? 1 + source.stats[STAT_KEYS[action.scaleStat]] / HABIT_SCALE_DIVISOR : 1;
          recover(source, target, Number(pct) * scale / 100, log, round);
          applied.push(target);
        } else if (action.t === "stack") {
          const next = Math.min(Number(action.max) || 99, Number(target.stacks[action.id] || 0) + 1);
          if (next > Number(target.stacks[action.id] || 0)) {
            target.stacks[action.id] = next;
            for (const modifier of action.mods || []) applyModifier(target, modifier, rank, 1, "combat", round);
          }
          applied.push(target);
        } else if (action.t === "cmd_chance") {
          source.cmdChance[action.st] = probability(ranked(action.val, rank), rank);
          applied.push(source);
        } else if (action.t === "cleanse") {
          const negative = Object.keys(target.statuses).filter((name) => ["burn", "bleed", "panic", "stun", "stagger", "slow", "weakened", "vulnerable", "taunt"].includes(name));
          negative.slice(0, Number(action.n) || 1).forEach((name) => delete target.statuses[name]);
          applied.push(target);
        } else if (action.t === "purge") {
          delete target.statuses.vulnerable;
          applied.push(target);
        } else if (action.t === "copy") {
          const from = alive(action.from === "enemy" ? enemies : allies).find((fighter) => (action.of || []).some((name) => hasStatus(fighter, name)));
          if (from) (action.of || []).forEach((name) => { if (hasStatus(from, name)) status(target, STATUS_KEYS[name] || name, Number(action.dur) || 1, from.statuses[STATUS_KEYS[name] || name].value, source); });
          applied.push(target);
        }
      }
      if (action.linkNext) context.linked = applied;
    }
  }

  function triggerReactiveHabits(target, damageBranch, round, random, log) {
    if (!target.allies || !target.enemies) return;
    if (!target.reactedThisRound) {
      target.reactedThisRound = true;
      const habits = evidence(target.dragon).habits || [];
      for (let index = 0; index < unlockedCount(target.dragon); index += 1) {
        const rank = habitRank(target.dragon, index);
        for (const part of habits[index]?.effects || []) {
          const actions = part.when === "on_damaged" ? part.branches?.[damageBranch] : null;
          if (actions) executeHabitActions(target, target.allies, target.enemies, actions, rank, round, random, log, true);
        }
      }
    }
    for (const source of alive(target.allies)) {
      if (source === target || source.allyReactedThisRound) continue;
      const habits = evidence(source.dragon).habits || [];
      for (let index = 0; index < unlockedCount(source.dragon); index += 1) {
        const rank = habitRank(source.dragon, index);
        for (const part of habits[index]?.effects || []) {
          const actions = part.when === "on_ally_damaged" ? part.branches?.[damageBranch] : null;
          if (!actions) continue;
          source.allyReactedThisRound = true;
          executeHabitActions(source, source.allies, source.enemies, actions, rank, round, random, log, true);
        }
      }
    }
  }

  function applyHabitTrigger(team, enemies, when, round, random, log) {
    for (const source of alive(team)) {
      const habits = evidence(source.dragon).habits || [];
      for (let index = 0; index < unlockedCount(source.dragon); index += 1) {
        const rank = habitRank(source.dragon, index);
        for (const part of habits[index]?.effects || []) {
          if (part.when !== when) continue;
          if (when === "rounds" && !part.rounds?.includes(round)) continue;
          if (when === "odd" && round % 2 !== 1) continue;
          if (!conditionMet(part.selfCond, source, source, team, enemies)) continue;
          if (probability(part.chance, rank) < 1 && random() >= probability(part.chance, rank)) continue;
          executeHabitActions(source, team, enemies, part.actions, rank, round, random, log);
        }
      }
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
      adj(2).slice(1).forEach((enemy) => { if (chance(0.30)) status(enemy, "bleed", 2, 0.025, fighter); });
    } else if (name === "Tairax") {
      if (round % 2 === 1 && chance(fighter.cmdChance.stagger ?? 0.25)) status(target(), "stagger", 1);
      if ([2, 5, 8].includes(round)) { const victim = target("nonBurn"); hit(victim, "fire", 1.15, "Gleaming Flame"); if (victim?.alive && chance(0.50)) status(victim, "burn", 2, 0.025, fighter); }
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
    else if (name === "Sunfyre" && [1, 4, 7, 10].includes(round)) { const count = fighter.hp / fighter.maxHp < 0.75 ? 2 : 1; hit(adj(count), "tactical", 1.10, "Golden Assault"); if (fighter.hp / fighter.maxHp < 0.5) adj(count).forEach((enemy) => { hit(enemy, "fire", 0.55, "Golden Flame"); if (chance(0.50)) status(enemy, "burn", 2, 0.025, fighter); }); }
    else if (name === "Tessarion") { if ([1, 4, 7].includes(round)) { const victim = target("physicalDealer"); hit(victim, "fire", 0.95, "Blue Flame"); if (victim && chance(0.50)) victim.dealt.all *= victim.dragon.damageType === "physical" ? 0.80 : 0.90; } if ([3, 6, 9].includes(round)) hit(target(), "physical", 0.60, "Wing Strike"); }
    else if (name === "Tashix" && [3, 6, 9].includes(round)) hit(adj(1), "fire", 2.00, "Blazing Hoard");
    else if (name === "Jagadrix") { const victim = target(); if (victim && chance(0.30)) { victim.stats.instinct *= 0.85; victim.stats.initiative *= 0.85; } if ([2, 5, 8].includes(round)) hit(victim, "fire", 1.20, "Jagged Flame"); }
    else if (name === "Thunderstrike" && round % 2 === 1) hit(target(), "physical", 1.00, "Thunder Strike");
    else if (name === "Vesper") { const victim = target(); if (victim && chance(0.20)) status(victim, "slow", 2, 0.20); hit(victim, "tactical", 0.70, "Night Tactics"); }
    else if (name === "Antares") { const victims = adj(2); if (victims[0] && chance(0.20)) status(victims[0], "vulnerable", 2, 0.10); hit(victims, "fire", 0.65, "Scorching Arc"); }
    else if (name === "Shadowrend") { const victim = target(); if (victim && chance(0.25)) { status(victim, "panic", 2); victim.dealt.all *= 1.20; } if ([4, 7, 9, 10].includes(round)) hit(adj(2), "physical", 0.80, "Shadow Rend"); }
    else if (name === "Dawnseeker") { if (chance(0.30)) { fighter.stats.instinct *= 1.20; fighter.stats.initiative *= 1.20; } if ([1, 2, 4, 7].includes(round)) hit(target(), "tactical", 0.50, "Dawn Tactics"); if ([2, 5, 8].includes(round)) recover(fighter, adjacentTo(fighter, allies).slice(0, 2), 0.03, log, round); }
    else if (name === "Shimmer") { const strongest = [...alive(allies)].sort((a, b) => b.stats.strength - a.stats.strength)[0]; if (strongest && chance(0.30)) { strongest.stats.strength *= 1.18; strongest.stats.initiative *= 1.09; } hit(adj(2), "tactical", 0.50, "Shimmering Blow"); }
    else if (name === "Daemoros" && round % 2 === 1) { const victim = target(); hit(victim, "physical", 1.25, "Ashen Claw"); if (victim && chance(0.20)) status(victim, "burn", 2, 0.025, fighter); }
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

  function tick(team, round, log, random) {
    for (const fighter of alive(team)) {
      for (const name of ["burn", "bleed"]) {
        const effect = fighter.statuses[name];
        if (effect) {
          if (effect.caster?.alive) deal(effect.caster, fighter, name === "burn" ? "fire" : "physical", statusMagnitude(effect, 0.20), random, log, round, name, false);
          else {
            const amount = fighter.maxHp * statusMagnitude(effect, 0.025);
            fighter.hp = Math.max(0, fighter.hp - amount);
            addEvent(log, round, `${fighter.dragon.name} takes ${Math.round(amount).toLocaleString()} ${name} damage.`, "status");
            if (fighter.hp <= 0) { fighter.alive = false; addEvent(log, round, `${fighter.dragon.name} is defeated by ${name}.`, "ko"); }
          }
        }
      }
      for (const [name, effect] of Object.entries(fighter.statuses)) {
        effect.rounds -= 1;
        if (effect.rounds <= 0) delete fighter.statuses[name];
      }
      fighter.reactedThisRound = false;
      fighter.allyReactedThisRound = false;
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
    a.forEach((fighter) => { fighter.allies = a; fighter.enemies = b; });
    b.forEach((fighter) => { fighter.allies = b; fighter.enemies = a; });
    applyVanguard(a, b, log); applyVanguard(b, a, log);
    applyHabitTrigger(a, b, "combat_start", 0, random, log);
    applyHabitTrigger(b, a, "combat_start", 0, random, log);
    let completedRound = 0;
    for (let round = 1; round <= maxRounds && alive(a).length && alive(b).length; round += 1) {
      completedRound = round;
      expireModifiers(a, round); expireModifiers(b, round);
      for (const trigger of ["each", "rounds", "odd"]) {
        applyHabitTrigger(a, b, trigger, round, random, log);
        applyHabitTrigger(b, a, trigger, round, random, log);
      }
      const actors = [...alive(a), ...alive(b)].sort((x, y) => Number(Boolean(y.statuses.firstStrike)) - Number(Boolean(x.statuses.firstStrike)) || (y.stats.initiative * (1 - (y.statuses.slow ? statusMagnitude(y.statuses.slow, 0.20) : 0))) - (x.stats.initiative * (1 - (x.statuses.slow ? statusMagnitude(x.statuses.slow, 0.20) : 0))) || random() - 0.5);
      for (const fighter of actors) {
        if (!fighter.alive) continue;
        const allies = fighter.side === "A" ? a : b;
        const enemies = fighter.side === "A" ? b : a;
        if (!alive(enemies).length) break;
        if (fighter.statuses.stun) { addEvent(log, round, `${fighter.dragon.name} loses its action to Stun.`, "status"); continue; }
        const taunter = alive(enemies).find((enemy) => fighter.statuses.taunt?.value === enemy);
        const basicHits = fighter.statuses.doubleStrike ? 2 : 1;
        for (let hit = 0; hit < basicHits && alive(enemies).length; hit += 1) deal(fighter, taunter || chooseTarget(fighter, enemies), fighter.dragon.damageType || "physical", 0.55, random, log, round, "Basic");
        if (alive(enemies).length && !fighter.statuses.stagger && !fighter.statuses.overwhelm) command(fighter, allies, enemies, round, random, log);
        else if (fighter.statuses.stagger || fighter.statuses.overwhelm) addEvent(log, round, `${fighter.dragon.name}'s Command is suppressed by control.`, "status");
      }
      tick(a, round, log, random); tick(b, round, log, random);
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
      total += lane === 1 ? 2 : 1;
      const vanguard = lane === 1 && VANGUARD_NAMES.has(dragon.name);
      const commandKnown = COMMAND_NAMES.has(dragon.name);
      if (vanguard) known += 1;
      if (commandKnown) known += 1;
      details.push(`${dragon.name}: Command ${commandKnown ? "encoded" : "unknown"}${lane === 1 ? `, Vanguard ${vanguard ? "encoded" : "unknown"}` : ""}`);
      for (let index = 0; index < unlockedCount(dragon); index += 1) {
        total += 1;
        const encoded = HABIT_NAMES.has(`${dragon.name}:${index}`);
        if (encoded) known += 1;
        details.push(`${dragon.name} H${index + 1}: ${encoded ? "encoded" : "unknown"}`);
      }
    });
    return { known, total, ratio: total ? known / total : 0, details };
  }

  function registryCoverage() {
    const habitData = [...catalog.values()].reduce((sum, dragon) => sum + (dragon.habits || []).filter((habit) => Array.isArray(habit.effects) && habit.effects.length).length, 0);
    return { commands: COMMAND_NAMES.size, vanguards: VANGUARD_NAMES.size, habits: HABIT_NAMES.size, habitData, total: COMMAND_NAMES.size + VANGUARD_NAMES.size + HABIT_NAMES.size };
  }

  function isHabitEncoded(name, index) { return HABIT_NAMES.has(`${name}:${index}`); }

  function unknownHabits(team) {
    return team.flatMap((dragon) => Array.from({ length: unlockedCount(dragon) }, (_, index) => ({ dragon: dragon.name, index, rank: habitRank(dragon, index) }))).filter((habit) => !isHabitEncoded(habit.dragon, habit.index));
  }

  function formationProfile(team, troop) {
    const raw = team.reduce((sum, dragon) => sum + (Number(dragon.power) || 0), 0);
    const preview = team.map((dragon, lane) => makeFighter(dragon, lane, "A", troop));
    applyVanguard(preview, [], null);
    applyHabitTrigger(preview, [], "combat_start", 0, seededRandom(hashSeed(`profile:${team.map((dragon) => dragon.name).join(":")}`)), null);
    const score = preview.reduce((sum, fighter) => {
      const attackType = fighter.dragon.damageType || "physical";
      const attack = fighter.dealt[attackType] * fighter.dealt.all * (0.45 + 0.55 * fighter.commandDealt[attackType] * fighter.commandDealt.all);
      const durability = 1 / Math.max(0.5, fighter.received.all * (0.45 + 0.55 * fighter.commandReceived[attackType] * fighter.commandReceived.all));
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
    const synergy = raw ? score / raw - 1 : 0;
    return { raw, score, bonus: score - raw, synergy, reasons, coverage: c, unknownHabits: unknownHabits(team) };
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
    const profile = formationProfile(team, troop);
    const synergyIndex = Math.max(0, Math.min(1, 0.5 + profile.synergy * 2));
    const score = (winRate * 0.82 + synergyIndex * 0.18) * 100000 + healthEdge * 500;
    return { score, winRate, games, synergy: profile.synergy, synergyIndex, coverage: profile.coverage, unknownHabits: profile.unknownHabits };
  }

  global.DragonfireSimulation = {
    VERSION, POSITIONS, configureCatalog, hashSeed, seededRandom, runBattle, simulateMatchup,
    evaluateFormation, formationProfile, coverage, registryCoverage, isHabitEncoded, unknownHabits, habitRank, unlockedCount,
  };
})(typeof window !== "undefined" ? window : globalThis);
