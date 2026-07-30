(() => {
  const ROUTES = new Set(["home", "battle", "rankings", "builder", "dragons", "roadmap"]);
  const battleState = {
    a: ["Sunfyre", "Vhagar", "Venator"],
    b: ["Tairax", "Kalspire", "Tessarion"],
  };

  function routeTo(route, updateHash = true) {
    if (!ROUTES.has(route)) route = "home";
    document.body.dataset.route = route;
    document.querySelectorAll(".product-view").forEach((view) => view.classList.toggle("active", view.dataset.view === route));
    document.querySelectorAll(".product-nav [data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
    const activeNav = document.querySelector(`.product-nav [data-route="${route}"]`);
    if (activeNav) {
      const nav = activeNav.parentElement;
      nav.scrollLeft = Math.max(0, activeNav.offsetLeft - (nav.clientWidth - activeNav.offsetWidth) / 2);
    }
    if (updateHash && location.hash !== `#${route}`) history.pushState(null, "", `#${route}`);
    if (route === "battle") renderBattleSetup();
    if (route === "rankings") renderRankings();
    if (route === "dragons") renderLibrary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => routeTo(button.dataset.route)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => routeTo(button.dataset.go)));
  window.addEventListener("popstate", () => routeTo(location.hash.slice(1) || "home", false));
  document.querySelector("#optimizeBtn").addEventListener("click", () => routeTo("builder"));

  function poweredRoster() {
    return roster.filter((dragon) => dragon.power > 0);
  }

  function troopOptions(selected, includeSiege = false) {
    return Object.entries(TROOPS)
      .filter(([key]) => includeSiege || key !== "siege")
      .map(([key, label]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  function battleDragonOptions(selectedName) {
    return poweredRoster()
      .sort((a, b) => b.power - a.power)
      .map((dragon) => `<option value="${esc(dragon.name)}" ${dragon.name === selectedName ? "selected" : ""}>${esc(dragon.name)} · ${fmt(dragon.power)}</option>`)
      .join("");
  }

  function slotMarkup(side, lane, name) {
    const dragon = roster.find((item) => item.name === name) || poweredRoster()[0];
    return `<div class="battle-slot" data-side="${side}" data-lane="${lane}">
      <div class="slot-info"><span class="slot-avatar">${initials(dragon?.name || "?")}</span><span><span class="slot-lane">${POSITIONS[lane]}</span><b class="dragon-name">${esc(dragon?.name || "Unknown")}</b><small class="dragon-meta">${dragon ? `${dragon.starRank}★ · ${dragon.role}` : ""}</small></span></div>
      <select class="select battle-dragon-select" aria-label="${POSITIONS[lane]} dragon">${battleDragonOptions(dragon?.name)}</select>
      <span class="power">${fmt(dragon?.power || 0)}</span>
    </div>`;
  }

  function renderBattleSetup() {
    const available = poweredRoster();
    if (!available.length) return;
    ["a", "b"].forEach((side) => {
      battleState[side] = battleState[side].map((name, lane) => roster.find((dragon) => dragon.name === name && dragon.power > 0)?.name || available[(lane + (side === "b" ? 3 : 0)) % available.length].name);
      const target = document.querySelector(`#battleTeam${side.toUpperCase()}`);
      target.innerHTML = battleState[side].map((name, lane) => slotMarkup(side, lane, name)).join("");
    });
    const troopA = document.querySelector("#battleTroopA");
    const troopB = document.querySelector("#battleTroopB");
    const oldA = troopA.value || "shieldbearers";
    const oldB = troopB.value || "cavalry";
    troopA.innerHTML = troopOptions(oldA);
    troopB.innerHTML = troopOptions(oldB);
  }

  document.querySelectorAll(".battle-slots").forEach((container) => container.addEventListener("change", (event) => {
    const slot = event.target.closest(".battle-slot");
    if (!slot || !event.target.matches(".battle-dragon-select")) return;
    battleState[slot.dataset.side][Number(slot.dataset.lane)] = event.target.value;
    renderBattleSetup();
  }));

  document.querySelector("#swapBattle").addEventListener("click", () => {
    [battleState.a, battleState.b] = [battleState.b, battleState.a];
    const a = document.querySelector("#battleTroopA").value;
    document.querySelector("#battleTroopA").value = document.querySelector("#battleTroopB").value;
    document.querySelector("#battleTroopB").value = a;
    renderBattleSetup();
  });

  function hashSeed(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
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

  function effectAt(values, level) {
    return values[Math.max(0, Math.min(values.length - 1, level - 1))];
  }

  function makeFighter(dragon, lane, side, troop) {
    const affinity = dragon.affinity?.[troop];
    const affinityMultiplier = affinity === "+" ? 1.07 : affinity === "-" ? 0.93 : 1;
    const roleDurability = dragon.role === "tank" ? 1.1 : dragon.role === "healer" ? 1.04 : 1;
    const maxHp = (1050 + dragon.power / 25) * affinityMultiplier * roleDurability;
    return {
      dragon,
      lane,
      side,
      maxHp,
      hp: maxHp,
      damage: (78 + dragon.power / 170) * affinityMultiplier,
      damageMultiplier: 1,
      damageTaken: dragon.role === "tank" ? 0.92 : 1,
      initiative: dragon.reignLevel * 2 + dragon.starRank * 4 + (dragon.role === "control" ? 5 : 0),
      burn: 0,
      panic: 0,
      stagger: 0,
      alive: true,
    };
  }

  function teamLabel(team) {
    return team.map((fighter) => fighter.dragon.name).join(" · ");
  }

  function addEvent(log, round, text, kind = "") {
    if (!log) return;
    if (!log[round]) log[round] = [];
    log[round].push({ text, kind });
  }

  function preCombat(allies, enemies, log) {
    for (const fighter of allies) {
      const { dragon } = fighter;
      const firstRank = habitRank(dragon, 0);
      if (!firstRank) continue;
      if (dragon.name === "Vaeldra") {
        const strength = effectAt([0.083, 0.1, 0.117, 0.142, 0.167], firstRank);
        const reduction = effectAt([0.05, 0.06, 0.07, 0.085, 0.1], firstRank);
        fighter.damageMultiplier *= 1 + strength;
        fighter.damageTaken *= 1 - reduction;
        addEvent(log, 0, `${dragon.name}'s Dragon's Valor grants ${Math.round(strength * 100)}% damage and ${Math.round(reduction * 100)}% mitigation.`, "status");
      }
      if (dragon.name === "Caraxes") {
        const reduction = effectAt([0.058, 0.07, 0.082, 0.1, 0.117], firstRank);
        enemies.forEach((enemy) => { enemy.damageMultiplier *= 1 - reduction; enemy.initiative *= 1 - reduction; });
        addEvent(log, 0, `${dragon.name}'s Battle Dread suppresses all enemies by ${Math.round(reduction * 100)}%.`, "status");
      }
      if (dragon.name === "Kalspire") {
        const increase = effectAt([0.05, 0.06, 0.07, 0.085, 0.1], firstRank);
        fighter.damageMultiplier *= 1 + increase;
        fighter.initiative *= 1 + increase * 0.55;
        addEvent(log, 0, `${dragon.name}'s Sturdy Insight improves its combat stats.`, "status");
      }
      if (dragon.name === "Zivern") {
        const reduction = effectAt([0.025, 0.03, 0.035, 0.043, 0.05], firstRank);
        enemies.forEach((enemy) => { enemy.damageMultiplier *= 1 - reduction; });
        addEvent(log, 0, `${dragon.name}'s Battle Mastery lowers enemy output.`, "status");
      }
      if (dragon.name === "Syrax") {
        const increase = effectAt([0.038, 0.046, 0.054, 0.065, 0.076], firstRank);
        allies.forEach((ally) => { ally.damageMultiplier *= 1 + increase * 0.5; ally.initiative *= 1 + increase; });
        addEvent(log, 0, `${dragon.name}'s Mindful Synergy accelerates the formation.`, "status");
      }
      if (dragon.name === "Vhagar") {
        const reduction = effectAt([0.035, 0.042, 0.049, 0.06, 0.07], firstRank);
        fighter.damageTaken *= 1 - reduction;
        addEvent(log, 0, `${dragon.name}'s Ancestral Shield fortifies the Vanguard.`, "status");
      }
      if (dragon.name === "Shadowsong") {
        const reduction = effectAt([0.15, 0.18, 0.21, 0.255, 0.3], firstRank);
        enemies.filter((enemy) => Math.abs(enemy.lane - fighter.lane) <= 1).slice(0, 2).forEach((enemy) => { enemy.initiative *= 1 - reduction; });
        addEvent(log, 0, `${dragon.name}'s Ensnare delays two adjacent enemies.`, "status");
      }
    }

    const tessarion = allies.find((fighter) => fighter.dragon.name === "Tessarion" && unlockedCount(fighter.dragon) >= 2);
    if (tessarion) {
      const rank = habitRank(tessarion.dragon, 1);
      const bonus = effectAt([0.1, 0.12, 0.14, 0.17, 0.2], rank);
      const fireAllies = allies.filter((ally) => ally !== tessarion && ally.dragon.damageType === "fire").sort((a, b) => a.lane - b.lane);
      if (fireAllies[0]) {
        fireAllies[0].damageMultiplier *= 1 + bonus;
        addEvent(log, 0, `Tessarion's Blazing Leader grants ${Math.round(bonus * 100)}% fire damage to ${fireAllies[0].dragon.name}.`, "status");
      }
    }

    const vhagar = allies.find((fighter) => fighter.dragon.name === "Vhagar" && unlockedCount(fighter.dragon) >= 2);
    const right = allies.find((fighter) => fighter.lane === 2 && fighter.dragon.damageType === "physical");
    if (vhagar && right) {
      const bonus = effectAt([0.125, 0.15, 0.175, 0.2125, 0.25], habitRank(vhagar.dragon, 1));
      right.damageMultiplier *= 1 + bonus;
      addEvent(log, 0, `Vhagar's Battle Leader empowers ${right.dragon.name}'s physical damage.`, "status");
    }
  }

  function alive(team) {
    return team.filter((fighter) => fighter.alive);
  }

  function chooseTarget(attacker, enemies) {
    const living = alive(enemies);
    return living.find((enemy) => enemy.lane === attacker.lane) || living.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  function runOneBattle(teamAData, teamBData, troopA, troopB, maxRounds, random, record = false) {
    const log = record ? {} : null;
    const a = teamAData.map((dragon, lane) => makeFighter(dragon, lane, "A", troopA));
    const b = teamBData.map((dragon, lane) => makeFighter(dragon, lane, "B", troopB));
    preCombat(a, b, log);
    preCombat(b, a, log);
    let completedRound = 0;

    for (let round = 1; round <= maxRounds && alive(a).length && alive(b).length; round++) {
      completedRound = round;
      const acting = [...alive(a), ...alive(b)].sort((first, second) => second.initiative - first.initiative || random() - 0.5);
      for (const fighter of acting) {
        if (!fighter.alive) continue;
        if (fighter.stagger > 0) {
          fighter.stagger -= 1;
          addEvent(log, round, `${fighter.dragon.name} is Staggered and loses its action.`, "status");
          continue;
        }
        const own = fighter.side === "A" ? a : b;
        const opposing = fighter.side === "A" ? b : a;
        const target = chooseTarget(fighter, opposing);
        if (!target) continue;

        let roundMultiplier = 1;
        if (fighter.dragon.name === "Tessarion" && habitRank(fighter.dragon, 0)) {
          const sharpened = effectAt([0.07, 0.084, 0.098, 0.119, 0.14], habitRank(fighter.dragon, 0));
          roundMultiplier *= 1 + sharpened * (fighter.hp / fighter.maxHp > 0.75 ? 2 : 1);
        }
        if (fighter.panic > 0) roundMultiplier *= 0.72;
        let damage = fighter.damage * fighter.damageMultiplier * roundMultiplier * target.damageTaken * (0.91 + random() * 0.18);
        if (fighter.dragon.role === "control") damage *= 0.92;
        if (fighter.dragon.role === "healer") damage *= 0.84;
        target.hp -= damage;
        addEvent(log, round, `${fighter.dragon.name} hits ${target.dragon.name} for ${Math.round(damage).toLocaleString()}.`);

        if (fighter.dragon.damageType === "fire" && random() < 0.2) {
          target.burn = Math.max(target.burn, 2);
          addEvent(log, round, `${target.dragon.name} is Burning.`, "status");
        }
        if ((fighter.dragon.tags || []).includes("panic") && random() < 0.16) {
          target.panic = Math.max(target.panic, 1);
          addEvent(log, round, `${target.dragon.name} is Panicked.`, "status");
        }
        if (fighter.dragon.role === "control" && random() < 0.11) {
          target.stagger = Math.max(target.stagger, 1);
          addEvent(log, round, `${target.dragon.name} is Staggered.`, "status");
        }
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          addEvent(log, round, `${target.dragon.name} is defeated.`, "ko");
        }

        if (fighter.dragon.role === "healer" || (fighter.dragon.tags || []).includes("recovery")) {
          const wounded = alive(own).sort((first, second) => first.hp / first.maxHp - second.hp / second.maxHp)[0];
          if (wounded && wounded.hp < wounded.maxHp) {
            const heal = wounded.maxHp * (fighter.dragon.role === "healer" ? 0.035 : 0.018);
            wounded.hp = Math.min(wounded.maxHp, wounded.hp + heal);
            addEvent(log, round, `${fighter.dragon.name} restores ${Math.round(heal).toLocaleString()} to ${wounded.dragon.name}.`, "status");
          }
        }
      }

      for (const fighter of [...alive(a), ...alive(b)]) {
        if (fighter.burn > 0) {
          const burnDamage = fighter.maxHp * 0.025;
          fighter.hp -= burnDamage;
          fighter.burn -= 1;
          addEvent(log, round, `${fighter.dragon.name} takes ${Math.round(burnDamage).toLocaleString()} Burn damage.`, "status");
          if (fighter.hp <= 0) {
            fighter.hp = 0;
            fighter.alive = false;
            addEvent(log, round, `${fighter.dragon.name} is defeated by Burn.`, "ko");
          }
        }
        if (fighter.panic > 0) fighter.panic -= 1;
      }
    }

    const health = (team) => team.reduce((sum, fighter) => sum + fighter.hp, 0) / team.reduce((sum, fighter) => sum + fighter.maxHp, 0);
    const healthA = Math.max(0, health(a));
    const healthB = Math.max(0, health(b));
    const winner = alive(a).length && !alive(b).length ? "A" : alive(b).length && !alive(a).length ? "B" : healthA > healthB ? "A" : healthB > healthA ? "B" : "draw";
    return { winner, rounds: completedRound, healthA, healthB, log, a, b };
  }

  function selectedBattleTeam(side) {
    return battleState[side].map((name) => roster.find((dragon) => dragon.name === name)).filter(Boolean);
  }

  function simulateMatchup() {
    const teamA = selectedBattleTeam("a");
    const teamB = selectedBattleTeam("b");
    if (teamA.length !== 3 || teamB.length !== 3) return toast("Each formation needs three dragons", true);
    if (new Set(teamA.map((dragon) => dragon.id)).size !== 3 || new Set(teamB.map((dragon) => dragon.id)).size !== 3) return toast("A formation cannot use the same dragon twice", true);
    const count = Number(document.querySelector("#simCount").value);
    const seedText = document.querySelector("#simSeed").value || "dragonfire-alpha";
    const maxRounds = Number(document.querySelector("#simRounds").value);
    const troopA = document.querySelector("#battleTroopA").value;
    const troopB = document.querySelector("#battleTroopB").value;
    let winsA = 0, winsB = 0, draws = 0, totalRounds = 0, healthA = 0, healthB = 0, representative;
    for (let index = 0; index < count; index++) {
      const result = runOneBattle(teamA, teamB, troopA, troopB, maxRounds, seededRandom(hashSeed(`${seedText}:${index}`)), index === 0);
      if (index === 0) representative = result;
      if (result.winner === "A") winsA += 1;
      else if (result.winner === "B") winsB += 1;
      else draws += 1;
      totalRounds += result.rounds;
      healthA += result.healthA;
      healthB += result.healthB;
    }
    renderBattleResult({ teamA, teamB, troopA, troopB, seedText, count, maxRounds, winsA, winsB, draws, totalRounds, healthA, healthB, representative });
  }

  function renderBattleResult(result) {
    const rateA = result.winsA / result.count * 100;
    const rateB = result.winsB / result.count * 100;
    const stronger = rateA === rateB ? "draw" : rateA > rateB ? "A" : "B";
    const log = Object.entries(result.representative.log || {}).map(([round, events]) => `<div class="log-round"><b>${round === "0" ? "PRE-COMBAT" : `ROUND ${round}`}</b><div class="log-events">${events.map((event) => `<span class="${event.kind}">${esc(event.text)}</span>`).join("")}</div></div>`).join("");
    const colorStop = Math.max(1, Math.min(99, rateA));
    document.querySelector("#battleResults").innerHTML = `<section class="panel">
      <div class="result-hero">
        <div class="result-side ${stronger === "A" ? "winner" : ""}"><small>FORMATION A · ${TROOPS[result.troopA]}</small><h3>${stronger === "A" ? "Favored" : stronger === "draw" ? "Even" : "Underdog"}</h3><div class="formation-names">${esc(teamLabel(result.teamA.map((dragon, lane) => ({ dragon, lane }))))}</div></div>
        <div class="win-meter" style="background:conic-gradient(#e9b95e 0 ${colorStop}%,#8264aa ${colorStop}% 100%)"><span><b>${rateA.toFixed(1)}%</b><small>A WIN RATE</small></span></div>
        <div class="result-side ${stronger === "B" ? "winner" : ""}"><small>FORMATION B · ${TROOPS[result.troopB]}</small><h3>${stronger === "B" ? "Favored" : stronger === "draw" ? "Even" : "Underdog"}</h3><div class="formation-names">${esc(teamLabel(result.teamB.map((dragon, lane) => ({ dragon, lane }))))}</div></div>
      </div>
      <div class="result-stats"><div class="stat"><b>${rateA.toFixed(1)} / ${rateB.toFixed(1)}</b><span>A / B win percentage</span></div><div class="stat"><b>${(result.totalRounds / result.count).toFixed(1)}</b><span>Average rounds</span></div><div class="stat"><b>${(result.healthA / result.count * 100).toFixed(0)}% / ${(result.healthB / result.count * 100).toFixed(0)}%</b><span>Average health A / B</span></div><div class="stat"><b>${result.draws}</b><span>Draws in ${result.count}</span></div></div>
      <div class="assumption-bar"><b>Simulation alpha:</b> power, troop affinity, lane targeting, known Habit values, Burn, Panic, Stagger, sustain, and seeded variance are modeled. Hidden Command coefficients, troop counts, exact defense curves, and targeting rules still require battle-log calibration. Seed: <code>${esc(result.seedText)}</code>.</div>
    </section><section class="panel combat-log"><div class="combat-log-head"><h3>Representative battle log</h3><span class="count">Run 1 of ${result.count}</span></div>${log}</section>`;
    document.querySelector("#battleResults").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelector("#runBattle").addEventListener("click", simulateMatchup);

  function bestTroop(dragon) {
    const entries = Object.keys(TROOPS).filter((troop) => troop !== "siege");
    return entries.find((troop) => dragon.affinity?.[troop] === "+") || entries.find((troop) => dragon.affinity?.[troop] !== "-") || "cavalry";
  }

  function metrics(dragon) {
    const unlocked = unlockedCount(dragon);
    const ranks = Array.from({ length: unlocked }, (_, index) => habitRank(dragon, index));
    const habitReadiness = unlocked ? ranks.reduce((sum, rank) => sum + rank, 0) / (unlocked * 5) : 0;
    const known = Array.from({ length: unlocked }, (_, index) => Boolean(HD[`${dragon.name}:${index}`])).filter(Boolean).length;
    const affinityCount = Object.values(dragon.affinity || {}).filter((value) => value === "+").length;
    const utility = new Set(dragon.tags || []).size;
    const absolute = dragon.power * (1 + unlocked * 0.035 + ranks.reduce((sum, rank) => sum + rank, 0) * 0.012 + affinityCount * 0.012 + utility * 0.004);
    const potential = absolute + ({ legendary: 24000, epic: 13000, rare: 6000 }[dragon.rarity] || 0) + (5 - unlocked) * 1500 + Math.max(0, 45 - dragon.reignLevel) * 350;
    return { absolute, potential, habitReadiness, known, unlocked };
  }

  function rankingRows() {
    const data = poweredRoster().map((dragon) => ({ dragon, ...metrics(dragon) }));
    const maximum = Math.max(...data.map((item) => item.absolute), 1);
    data.forEach((item) => { item.rating = item.absolute / maximum * 1000; });
    const query = document.querySelector("#rankSearch").value.trim().toLowerCase();
    const role = document.querySelector("#rankRole").value;
    const rarity = document.querySelector("#rankRarity").value;
    const sort = document.querySelector("#rankSort").value;
    return data.filter(({ dragon }) => (!query || dragon.name.toLowerCase().includes(query)) && (role === "all" || dragon.role === role) && (rarity === "all" || dragon.rarity === rarity)).sort((a, b) => {
      if (sort === "power") return b.dragon.power - a.dragon.power;
      if (sort === "habits") return b.habitReadiness - a.habitReadiness || b.absolute - a.absolute;
      if (sort === "potential") return b.potential - a.potential;
      return b.rating - a.rating;
    });
  }

  function renderRankings() {
    const roleSelect = document.querySelector("#rankRole");
    if (roleSelect.options.length === 1) {
      [...new Set(roster.map((dragon) => dragon.role))].sort().forEach((role) => roleSelect.insertAdjacentHTML("beforeend", `<option value="${esc(role)}">${esc(role[0].toUpperCase() + role.slice(1))}</option>`));
    }
    const rows = rankingRows();
    document.querySelector("#rankingsBody").innerHTML = rows.map((item, index) => {
      const { dragon } = item;
      const confidence = item.unlocked && item.known / item.unlocked >= 0.67 ? "high" : item.known ? "medium" : "low";
      const confidenceLabel = confidence === "high" ? "Documented" : confidence === "medium" ? "Partial" : "Modeled";
      return `<tr><td class="rank-num">${index + 1}</td><td><span class="rank-dragon"><span class="orb ${dragon.rarity}">${initials(dragon.name)}</span><span><b>${esc(dragon.name)}</b><small>${dragon.rarity} · ${dragon.damageType}</small></span></span></td><td><span class="rating">${Math.round(item.rating)}</span><div class="rating-bar"><i style="width:${Math.max(5, item.rating / 10)}%"></i></div></td><td>${fmt(dragon.power)}</td><td>${TROOPS[bestTroop(dragon)]}</td><td>${item.unlocked}/5 · ${Math.round(item.habitReadiness * 100)}%</td><td style="text-transform:capitalize">${esc(dragon.role)}</td><td><span class="confidence ${confidence}">${confidenceLabel}</span></td></tr>`;
    }).join("") || `<tr><td colspan="8">No dragons match these filters.</td></tr>`;
  }

  ["rankSearch", "rankRole", "rankRarity", "rankSort"].forEach((id) => document.querySelector(`#${id}`).addEventListener(id === "rankSearch" ? "input" : "change", renderRankings));
  document.querySelector("#rankExport").addEventListener("click", () => {
    const lines = [["Rank", "Dragon", "Rating", "Power", "Best troop", "Habits unlocked", "Role"]];
    rankingRows().forEach((item, index) => lines.push([index + 1, item.dragon.name, Math.round(item.rating), item.dragon.power, TROOPS[bestTroop(item.dragon)].replace(/^\S+\s/, ""), item.unlocked, item.dragon.role]));
    const csv = lines.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "dragonfire-rankings.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  });

  function renderLibrary() {
    const query = document.querySelector("#librarySearch").value.trim().toLowerCase();
    const filter = document.querySelector("#libraryFilter").value;
    const dragons = [...roster].filter((dragon) => {
      const habits = (HN[dragon.name] || []).join(" ").toLowerCase();
      if (query && !`${dragon.name} ${dragon.role} ${dragon.damageType} ${habits}`.toLowerCase().includes(query)) return false;
      if (filter === "active" && !dragon.active) return false;
      if (filter === "ready" && unlockedCount(dragon) < 2) return false;
      if (filter === "needs-data" && Array.from({ length: unlockedCount(dragon) }, (_, index) => HD[`${dragon.name}:${index}`]).every(Boolean)) return false;
      return true;
    }).sort((a, b) => b.power - a.power);
    document.querySelector("#libraryCount").textContent = `${dragons.length} shown / ${roster.length}`;
    document.querySelector("#dragonLibrary").innerHTML = dragons.map((dragon) => {
      const unlocked = unlockedCount(dragon);
      const habitRows = Array.from({ length: Math.max(1, unlocked) }, (_, index) => `<div class="library-habit"><b>H${index + 1} · ${esc(habitName(dragon, index))} ${unlocked ? `Lv ${habitRank(dragon, index)}` : "Locked"}</b><br><span>${esc(habitDesc(dragon, index))}</span></div>`).join("");
      const missing = Array.from({ length: unlocked }, (_, index) => HD[`${dragon.name}:${index}`]).filter((value) => !value).length;
      const affinity = Object.entries(dragon.affinity || {}).filter(([troop]) => troop !== "siege").map(([troop, value]) => `<span class="${value === "+" ? "plus" : ""}">${TROOPS[troop].split(" ")[0]} ${value || "·"}</span>`).join("");
      return `<article class="panel library-card"><div class="library-top"><div class="library-name"><span class="orb ${dragon.rarity}">${initials(dragon.name)}</span><span><h3>${esc(dragon.name)}</h3><small>${dragon.rarity} · ${dragon.breed} · ${dragon.role}</small></span></div><div class="library-power">${fmt(dragon.power)}<small>${dragon.starRank}★ · Lv ${dragon.reignLevel}</small></div></div><div class="kit-tags">${(dragon.tags || []).slice(0, 7).map((tag) => `<span class="kit-tag">${esc(tag)}</span>`).join("") || `<span class="kit-tag">kit data pending</span>`}</div><div class="habit-list">${habitRows}</div><div class="affinity-strip">${affinity}</div>${missing ? `<div class="data-gap">${missing} unlocked Habit description${missing > 1 ? "s" : ""} still use conservative model values.</div>` : ""}</article>`;
    }).join("") || `<div class="panel battle-empty"><h3>No matching dragons</h3><p>Try a broader filter.</p></div>`;
  }

  document.querySelector("#librarySearch").addEventListener("input", renderLibrary);
  document.querySelector("#libraryFilter").addEventListener("change", renderLibrary);

  const initialRoute = ROUTES.has(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  routeTo(initialRoute, false);
})();
