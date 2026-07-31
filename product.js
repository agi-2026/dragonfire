(() => {
  const ROUTES = new Set(["home", "battle", "rankings", "builder", "dragons", "roadmap"]);
  const battleState = {
    a: [null, null, null],
    b: [null, null, null],
  };
  const battleOverrides = { a: null, b: null };
  const SAVED_FORMATIONS_KEY = "dragonfire-saved-formations-v1";
  const CATALOG_URL = "/data/dragon-catalog.v1.json?v=2";
  let canonicalCatalog = null;
  let canonicalCatalogError = null;
  let canonicalByName = new Map();
  let onboardingSelection = new Set();

  async function loadCanonicalCatalog() {
    try {
      const response = await fetch(CATALOG_URL, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      const catalog = await response.json();
      if (!Array.isArray(catalog.dragons) || catalog.dragons.length !== 33) throw new Error("Catalog failed its 33-dragon integrity check");
      canonicalCatalog = catalog;
      canonicalByName = new Map(catalog.dragons.map((dragon) => [dragon.name, dragon]));
      window.DRAGON_CANONICAL = Object.fromEntries(catalog.dragons.map((dragon) => [dragon.name, dragon]));
      catalog.dragons.forEach((dragon) => {
        HN[dragon.name] = dragon.habits.map((habit) => habit.name);
      });
      renderRoster();
      if (drawerDragonIndex !== null) renderDragonDrawer(drawerDragonIndex);
    } catch (error) {
      canonicalCatalogError = error;
    }
    if (document.body.dataset.route === "rankings") renderRankings();
    if (document.body.dataset.route === "dragons") renderLibrary();
  }

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
    return roster.filter((dragon) => dragon.active && dragon.power > 0);
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

  function slotMarkup(side, lane, name, overrideDragon = null) {
    const dragon = overrideDragon || roster.find((item) => item.name === name) || poweredRoster()[0];
    const selector = overrideDragon
      ? `<select class="select battle-dragon-select" disabled aria-label="${POSITIONS[lane]} maxed dragon"><option>${esc(dragon.name)} · MAXED</option></select>`
      : `<select class="select battle-dragon-select" aria-label="${POSITIONS[lane]} dragon">${battleDragonOptions(dragon?.name)}</select>`;
    return `<div class="battle-slot" data-side="${side}" data-lane="${lane}">
      <div class="slot-info"><span class="slot-avatar">${dragon ? dragonAvatar(dragon,"battle-avatar") : ""}</span><span><span class="slot-lane">${POSITIONS[lane]}</span><b class="dragon-name">${esc(dragon?.name || "Unknown")}</b><small class="dragon-meta">${dragon ? `${dragon.starRank}★ · ${dragon.role}` : ""}</small></span></div>
      ${selector}
      <span class="power">${fmt(dragon?.power || 0)}</span>
    </div>`;
  }

  function maxedDragon(source) {
    return { ...clone(source), active: true, power: 100000, starRank: 10, reignLevel: 50, habitRanks: [5, 5, 5, 5, 5], habitImpact: [] };
  }

  function renderBattleSetup() {
    const available = poweredRoster();
    const troopA = document.querySelector("#battleTroopA");
    const troopB = document.querySelector("#battleTroopB");
    const oldA = troopA.value || "shieldbearers";
    const oldB = troopB.value || "cavalry";
    troopA.innerHTML = troopOptions(oldA);
    troopB.innerHTML = troopOptions(oldB);
    if (available.length < 3 && (!battleOverrides.a || !battleOverrides.b)) {
      ["A", "B"].forEach((side) => { document.querySelector(`#battleTeam${side}`).innerHTML = `<div class="battle-setup-empty"><b>Roster setup needed</b><span>Select at least three dragons and enter their power before simulating.</span><button class="btn open-roster-setup">Set up my roster</button></div>`; });
      document.querySelector("#runBattle").disabled = true;
      return;
    }
    document.querySelector("#runBattle").disabled = false;
    ["a", "b"].forEach((side) => {
      const target = document.querySelector(`#battleTeam${side.toUpperCase()}`);
      const override = battleOverrides[side];
      document.querySelector(`#battleMode${side.toUpperCase()}`).textContent = override ? "MAXED META" : "MY ROSTER";
      document.querySelector(`.personal-battle[data-side="${side}"]`).hidden = !override;
      if (override) {
        battleState[side] = override.map((dragon) => dragon.name);
        target.innerHTML = override.map((dragon, lane) => slotMarkup(side, lane, dragon.name, dragon)).join("");
      } else {
        battleState[side] = battleState[side].map((name, lane) => roster.find((dragon) => dragon.name === name && dragon.active && dragon.power > 0)?.name || available[(lane + (side === "b" ? 3 : 0)) % available.length].name);
        target.innerHTML = battleState[side].map((name, lane) => slotMarkup(side, lane, name)).join("");
      }
    });
  }

  document.querySelectorAll(".battle-slots").forEach((container) => container.addEventListener("change", (event) => {
    const slot = event.target.closest(".battle-slot");
    if (!slot || !event.target.matches(".battle-dragon-select")) return;
    battleOverrides[slot.dataset.side] = null;
    battleState[slot.dataset.side][Number(slot.dataset.lane)] = event.target.value;
    renderBattleSetup();
  }));

  document.querySelector("#swapBattle").addEventListener("click", () => {
    [battleState.a, battleState.b] = [battleState.b, battleState.a];
    [battleOverrides.a, battleOverrides.b] = [battleOverrides.b, battleOverrides.a];
    const a = document.querySelector("#battleTroopA").value;
    document.querySelector("#battleTroopA").value = document.querySelector("#battleTroopB").value;
    document.querySelector("#battleTroopB").value = a;
    renderBattleSetup();
  });

  function savedFormations() {
    try { return JSON.parse(localStorage.getItem(SAVED_FORMATIONS_KEY) || "[]").filter((item) => Array.isArray(item.dragonNames) && item.dragonNames.length === 3); }
    catch (_) { return []; }
  }

  function renderSavedFormations(selectedId = "") {
    const select = document.querySelector("#savedFormationSelect");
    const items = savedFormations();
    select.innerHTML = items.length ? `<option value="">Choose a saved formation…</option>${items.map((item) => `<option value="${esc(item.id)}" ${item.id === selectedId ? "selected" : ""}>${esc(item.name)} · ${item.mode === "maxed" ? "Maxed meta" : "My roster"}</option>`).join("")}` : `<option value="">No saved formations yet</option>`;
  }

  function saveFormation(side, suggestedName = "") {
    const team = selectedBattleTeam(side);
    if (team.length !== 3) return toast("Choose three dragons before saving", true);
    const defaultName = suggestedName || team.map((dragon) => dragon.name).join(" / ");
    const name = prompt("Formation name", defaultName);
    if (!name) return;
    const item = { id: `formation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), dragonNames: team.map((dragon) => dragon.name), troop: document.querySelector(`#battleTroop${side.toUpperCase()}`).value, mode: battleOverrides[side] ? "maxed" : "personal", createdAt: new Date().toISOString() };
    const items = savedFormations();
    items.unshift(item);
    localStorage.setItem(SAVED_FORMATIONS_KEY, JSON.stringify(items.slice(0, 30)));
    renderSavedFormations(item.id);
    toast("Formation saved in this browser");
  }

  function applyFormation(side, formation) {
    if (formation.mode === "maxed") return toast("Maxed projections are paused until rarity Power curves are verified", true);
    const sources = formation.dragonNames.map((name) => (formation.mode === "maxed" ? DEFAULT_ROSTER : roster).find((dragon) => dragon.name === name)).filter(Boolean);
    if (sources.length !== 3) return toast("One or more dragons are unavailable", true);
    battleState[side] = sources.map((dragon) => dragon.name);
    battleOverrides[side] = formation.mode === "maxed" ? sources.map(maxedDragon) : null;
    routeTo("battle");
    document.querySelector(`#battleTroop${side.toUpperCase()}`).value = formation.troop || "cavalry";
  }

  function loadSavedFormation(side) {
    const id = document.querySelector("#savedFormationSelect").value;
    const formation = savedFormations().find((item) => item.id === id);
    if (!formation) return toast("Choose a saved formation first", true);
    applyFormation(side, formation);
  }

  document.querySelectorAll(".save-battle").forEach((button) => button.addEventListener("click", () => saveFormation(button.dataset.side)));
  document.querySelectorAll(".personal-battle").forEach((button) => button.addEventListener("click", () => { battleOverrides[button.dataset.side] = null; renderBattleSetup(); }));
  document.querySelector("#loadFormationA").addEventListener("click", () => loadSavedFormation("a"));
  document.querySelector("#loadFormationB").addEventListener("click", () => loadSavedFormation("b"));
  document.querySelector("#deleteFormation").addEventListener("click", () => {
    const id = document.querySelector("#savedFormationSelect").value;
    if (!id) return toast("Choose a saved formation first", true);
    localStorage.setItem(SAVED_FORMATIONS_KEY, JSON.stringify(savedFormations().filter((item) => item.id !== id)));
    renderSavedFormations();
    toast("Saved formation deleted");
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
    if (battleOverrides[side]) return battleOverrides[side];
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

  function evidenceRows() {
    if (!canonicalCatalog) return [];
    const data = [...canonicalCatalog.dragons];
    const query = document.querySelector("#rankSearch").value.trim().toLowerCase();
    const rarity = document.querySelector("#rankRarity").value;
    const sort = document.querySelector("#rankSort").value;
    return data.filter((dragon) => (!query || `${dragon.name} ${dragon.breed}`.toLowerCase().includes(query)) && (rarity === "all" || dragon.rarity.toLowerCase() === rarity)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : b.baseStats[sort] - a.baseStats[sort] || a.name.localeCompare(b.name));
  }

  function renderEvidenceMilestones() {
    if (!canonicalCatalog) return;
    const dragons = canonicalCatalog.dragons;
    const sourcedCommands = dragons.filter((dragon) => dragon.command.text).length;
    const sourcedVanguards = dragons.filter((dragon) => dragon.vanguard.text).length;
    const namedHabits = dragons.reduce((sum, dragon) => sum + dragon.habits.filter((habit) => habit.name).length, 0);
    const verifiedEffects = dragons.filter((dragon) => dragon.command.structuredEffectsStatus === "verified").length + dragons.filter((dragon) => dragon.vanguard.structuredEffectsStatus === "verified").length + dragons.flatMap((dragon) => dragon.habits).filter((habit) => habit.levelEffectsStatus === "verified").length;
    document.querySelector("#catalogProfileCount").textContent = dragons.length;
    document.querySelector("#catalogStatCount").textContent = dragons.length * 4;
    document.querySelector("#catalogMechanicCount").textContent = verifiedEffects;
    document.querySelector("#metaFormations").innerHTML = [
      ["Cross-checked attributes", `${dragons.length * 4}/132`, "Every level-one stat agrees across two community datasets", dragons.length / 33],
      ["Command descriptions", `${sourcedCommands}/33`, "English source text collected; structured effects still require review", sourcedCommands / 33],
      ["Vanguard descriptions", `${sourcedVanguards}/33`, "Source text collected; structured effects still require review", sourcedVanguards / 33],
      ["Habit identities", `${namedHabits}/165`, "Names and Star unlocks sourced; level scaling remains unverified", namedHabits / 165],
    ].map(([label, value, copy, progress]) => `<article class="panel evidence-milestone"><span>${esc(label)}</span><b>${esc(value)}</b><p>${esc(copy)}</p><div><i style="width:${Math.round(progress * 100)}%"></i></div></article>`).join("");
  }

  function renderRankings() {
    if (canonicalCatalogError) {
      document.querySelector("#metaFormations").innerHTML = `<div class="panel data-load-error"><b>Catalog unavailable</b><span>${esc(canonicalCatalogError.message)}</span></div>`;
      document.querySelector("#rankingsBody").innerHTML = `<tr><td colspan="8">Evidence catalog could not be loaded.</td></tr>`;
      return;
    }
    if (!canonicalCatalog) {
      document.querySelector("#rankingsBody").innerHTML = `<tr><td colspan="8">Loading sourced catalog…</td></tr>`;
      return;
    }
    renderEvidenceMilestones();
    const rows = evidenceRows();
    document.querySelector("#rankingsBody").innerHTML = rows.map((dragon, index) => {
      const rosterDragon = DEFAULT_ROSTER.find((item) => item.name === dragon.name);
      const mechanicCount = Number(dragon.command.structuredEffectsStatus === "verified") + Number(dragon.vanguard.structuredEffectsStatus === "verified") + dragon.habits.filter((habit) => habit.levelEffectsStatus === "verified").length;
      return `<tr><td class="rank-num">${index + 1}</td><td><span class="rank-dragon">${rosterDragon ? dragonAvatar(rosterDragon,"rank-avatar") : ""}<span><b>${esc(dragon.name)}</b><small>${esc(dragon.rarity)} · ${esc(dragon.breed)} · Lv1 base</small></span></span></td><td><b class="base-stat str">${dragon.baseStats.strength}</b></td><td><b class="base-stat inst">${dragon.baseStats.instinct}</b></td><td><b class="base-stat int">${dragon.baseStats.intelligence}</b></td><td><b class="base-stat init">${dragon.baseStats.initiative}</b></td><td><span class="mechanic-coverage sourced">2/2 ability texts</span><small class="coverage-detail">${mechanicCount}/7 effects encoded</small></td><td><span class="source-stack"><a class="source-link" href="https://wyrmtable.com/dragons" target="_blank" rel="noreferrer">Stats ↗</a><a class="source-link" href="https://dragonfire-hub.com/" target="_blank" rel="noreferrer">Abilities ↗</a></span></td></tr>`;
    }).join("") || `<tr><td colspan="8">No dragons match these filters.</td></tr>`;
  }

  ["rankSearch", "rankRarity", "rankSort"].forEach((id) => document.querySelector(`#${id}`).addEventListener(id === "rankSearch" ? "input" : "change", renderRankings));
  document.querySelector("#rankExport").addEventListener("click", () => {
    if (!canonicalCatalog) return toast("Evidence catalog is still loading", true);
    const lines = [["Dragon", "Rarity", "Breed", "Level-one Strength", "Level-one Instinct", "Level-one Intelligence", "Level-one Initiative", "Base troops", "March speed", "Command source text", "Vanguard source text", "Evidence confidence", "Stat source", "Ability source"]];
    evidenceRows().forEach((dragon) => lines.push([dragon.name, dragon.rarity, dragon.breed, dragon.baseStats.strength, dragon.baseStats.instinct, dragon.baseStats.intelligence, dragon.baseStats.initiative, dragon.baseTroops, dragon.marchSpeed, dragon.command.text, dragon.vanguard.text, dragon.evidence.confidence, "https://wyrmtable.com/api/dragons", "https://dragonfire-hub.com/"]));
    const csv = lines.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "dragonfire-evidence-catalog.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  });

  function saveFormationData(dragonNames, troop, mode = "personal") {
    const name = prompt("Formation name", dragonNames.join(" / "));
    if (!name) return;
    const items = savedFormations();
    const item = { id: `formation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), dragonNames, troop, mode, createdAt: new Date().toISOString() };
    items.unshift(item);
    localStorage.setItem(SAVED_FORMATIONS_KEY, JSON.stringify(items.slice(0, 30)));
    renderSavedFormations(item.id);
    toast("Formation saved in this browser");
  }

  function enhanceBuilderResults() {
    document.querySelectorAll("#results .army:not([data-battle-ready])").forEach((army) => {
      const dragonNames = [...army.querySelectorAll(".lane-name")].map((node) => node.textContent.trim());
      if (dragonNames.length !== 3) return;
      const troopLabel = army.querySelector(".troop-pill")?.textContent.trim();
      const troop = Object.entries(TROOPS).find(([, label]) => label === troopLabel)?.[0] || "archers";
      const actions = document.createElement("div");
      actions.className = "army-actions";
      actions.innerHTML = `<button class="btn compact-btn builder-test">⚔ Test in Battle Lab</button><button class="btn compact-btn builder-save">Save formation</button>`;
      actions.querySelector(".builder-test").addEventListener("click", () => {
        applyFormation("a", { dragonNames, troop, mode: "personal" });
        toast("Formation loaded into A");
      });
      actions.querySelector(".builder-save").addEventListener("click", () => saveFormationData(dragonNames, troop));
      army.append(actions);
      army.dataset.battleReady = "true";
    });
  }

  new MutationObserver(enhanceBuilderResults).observe(document.querySelector("#results"), { childList: true, subtree: true });

  document.querySelector("#contributeRoster").addEventListener("click", async () => {
    const active = roster.filter((dragon) => dragon.active).map((dragon) => ({
      name: dragon.name,
      rarity: dragon.rarity,
      power: Number(dragon.power) || 0,
      stars: Number(dragon.starRank) || 1,
      level: Number(dragon.reignLevel) || 1,
      habitRanks: Array.from({ length: unlockedCount(dragon) }, (_, index) => habitRank(dragon, index)),
      estimatedPower: Boolean(dragon.estimatedPower),
    }));
    if (!active.length) return toast("Your active roster is empty", true);
    const approved = confirm(`Contribute one anonymous snapshot of ${active.length} active dragons?\n\nSent: dragon names, rarity, Power, Stars, level, Habit levels, starter-estimate markers, and model version.\nNot sent: username, email, guild, cookies, saved teams, or battle history.`);
    if (!approved) return;
    const button = document.querySelector("#contributeRoster");
    const status = document.querySelector("#contributionStatus");
    button.disabled = true;
    status.textContent = "Sending…";
    try {
      const response = await fetch("/api/contribute-roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelVersion: "0.9.0", consentVersion: "2026-07-29", roster: active }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Contribution service is not connected yet");
      status.textContent = "Thank you — snapshot received.";
      toast("Anonymous roster snapshot contributed");
    } catch (error) {
      status.textContent = error.message;
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  function renderLibrary() {
    const query = document.querySelector("#librarySearch").value.trim().toLowerCase();
    const filter = document.querySelector("#libraryFilter").value;
    const dragons = [...roster].filter((dragon) => {
      const evidence = canonicalByName.get(dragon.name);
      const habits = (evidence?.habits || HN[dragon.name] || []).map((habit) => typeof habit === "string" ? habit : habit.name).join(" ");
      if (query && !`${dragon.name} ${dragon.role} ${dragon.damageType} ${evidence?.breed || dragon.breed} ${habits}`.toLowerCase().includes(query)) return false;
      if (filter === "active" && !dragon.active) return false;
      if (filter === "ready" && unlockedCount(dragon) < 2) return false;
      const mechanicsVerified = evidence && evidence.command.structuredEffectsStatus === "verified" && evidence.vanguard.structuredEffectsStatus === "verified" && evidence.habits.every((habit) => habit.levelEffectsStatus === "verified");
      if (filter === "needs-data" && mechanicsVerified) return false;
      return true;
    }).sort((a, b) => b.power - a.power);
    document.querySelector("#libraryCount").textContent = `${dragons.length} shown / ${roster.length}`;
    document.querySelector("#dragonLibrary").innerHTML = dragons.map((dragon) => {
      const evidence = canonicalByName.get(dragon.name);
      const unlocked = unlockedCount(dragon);
      const habitRows = Array.from({ length: Math.max(1, unlocked) }, (_, index) => {
        const sourcedHabit = evidence?.habits[index];
        return `<div class="library-habit"><b>H${index + 1} · ${esc(sourcedHabit?.name || habitName(dragon, index))} ${unlocked ? `Lv ${habitRank(dragon, index)}` : "Locked"}</b><br><span>${esc(habitDesc(dragon, index))}</span><small>${sourcedHabit ? `Unlocks at ${sourcedHabit.unlockStar}★ · effect formula ${sourcedHabit.levelEffectsStatus}` : "Source identity pending"}</small></div>`;
      }).join("");
      const missing = Array.from({ length: unlocked }, (_, index) => HD[`${dragon.name}:${index}`]).filter((value) => !value).length;
      const affinity = Object.entries(dragon.affinity || {}).filter(([troop]) => troop !== "siege").map(([troop, value]) => `<span class="${value === "+" ? "plus" : ""}">${TROOPS[troop].split(" ")[0]} ${value || "·"}</span>`).join("");
      const stats = evidence?.baseStats;
      const baseStats = [
        ["STR", stats?.strength, "str"],
        ["INST", stats?.instinct, "inst"],
        ["INT", stats?.intelligence, "int"],
        ["INIT", stats?.initiative, "init"],
      ].map(([label, value, type]) => `<span><small>${label}</small><b class="base-stat ${type}">${value ?? "—"}</b></span>`).join("");
      const sourceStatus = evidence ? "Community-sourced" : canonicalCatalog ? "Catalog match missing" : "Catalog loading";
      return `<article class="panel library-card"><div class="library-top"><div class="library-name">${dragonAvatar(dragon,"library-avatar")}<span><h3>${esc(dragon.name)}</h3><small>${esc(evidence?.rarity || dragon.rarity)} · ${esc(evidence?.breed || dragon.breed)} · ${esc(dragon.role)}</small></span></div><div class="library-power">${dragon.power ? fmt(dragon.power) : "Not set"}<small>Your roster · ${dragon.starRank}★ · Lv ${dragon.reignLevel}</small></div></div><div class="library-base-stats">${baseStats}</div><div class="library-evidence"><span><b>Level-one base · ${evidence?.baseTroops ?? "—"} troops</b><small>${esc(evidence?.marchSpeed || "Unknown")} march · player modifiers excluded</small></span><span class="evidence-badge ${evidence ? "sourced" : "pending"}">${sourceStatus}</span></div><div class="library-abilities">${evidence?.command.text ? `<div class="library-ability command"><b>Command source text</b><span>${esc(evidence.command.text)}</span><small>Collected, not yet encoded in the competitive engine</small></div>` : ""}${evidence?.vanguard.text ? `<div class="library-ability vanguard"><b>Vanguard source text</b><span>${esc(evidence.vanguard.text)}</span><small>Collected, not yet encoded in the competitive engine</small></div>` : ""}</div><div class="kit-tags">${(dragon.tags || []).slice(0, 7).map((tag) => `<span class="kit-tag">${esc(tag)}</span>`).join("") || `<span class="kit-tag">kit data pending</span>`}</div><div class="habit-list">${habitRows}</div><div class="affinity-strip">${affinity}</div>${missing ? `<div class="data-gap">${missing} unlocked Habit description${missing > 1 ? "s" : ""} still use conservative model values.</div>` : ""}${evidence ? `<div class="library-sources"><a class="source-link" href="https://wyrmtable.com/dragons" target="_blank" rel="noreferrer">Inspect stat source ↗</a><a class="source-link" href="https://dragonfire-hub.com/" target="_blank" rel="noreferrer">Inspect ability source ↗</a></div>` : ""}</article>`;
    }).join("") || `<div class="panel battle-empty"><h3>No matching dragons</h3><p>Try a broader filter.</p></div>`;
  }

  document.querySelector("#librarySearch").addEventListener("input", renderLibrary);
  document.querySelector("#libraryFilter").addEventListener("change", renderLibrary);

  function onboardingDragons() {
    const query = document.querySelector("#onboardingSearch").value.trim().toLowerCase();
    const rarity = document.querySelector("#onboardingRarity").value;
    return roster.filter((dragon) => !dragon.limited && (!query || dragon.name.toLowerCase().includes(query)) && (rarity === "all" || dragon.rarity === rarity));
  }

  function onboardingCard(dragon) {
    const selected = onboardingSelection.has(dragon.id);
    return `<button class="onboarding-dragon ${selected ? "selected" : ""} ${dragon.limited ? "limited" : ""}" data-onboarding-id="${dragon.id}" aria-pressed="${selected}">${dragonAvatar(dragon,"onboarding-avatar")}<span><b>${esc(dragon.name)}</b><small>${dragon.rarity} · ${dragon.starRank}★ · Lv ${dragon.reignLevel} · ${fmt(dragon.power)} est.</small></span><i>${selected ? "✓" : "+"}</i></button>`;
  }

  function renderOnboarding() {
    const dragons = onboardingDragons();
    document.querySelector("#onboardingLimitedGrid").innerHTML = roster.filter((dragon) => dragon.limited).map(onboardingCard).join("");
    document.querySelector("#onboardingGrid").innerHTML = dragons.map(onboardingCard).join("") || `<div class="onboarding-no-results">No common dragons match this filter.</div>`;
    const count = onboardingSelection.size;
    const limitedCount = roster.filter((dragon) => dragon.limited && onboardingSelection.has(dragon.id)).length;
    const commonDragons = roster.filter((dragon) => !dragon.limited);
    const allCommonSelected = commonDragons.every((dragon) => onboardingSelection.has(dragon.id));
    document.querySelector("#onboardingCount").textContent = `${count} selected${limitedCount ? ` · ${limitedCount} limited` : ""}`;
    document.querySelector("#saveOnboarding").textContent = count ? `Continue with ${count} dragons` : "Continue with empty roster";
    document.querySelector("#toggleAllCommon").textContent = allCommonSelected ? "Deselect all" : "Select all";
    document.querySelector("#toggleAllCommon").setAttribute("aria-pressed", String(allCommonSelected));
  }

  function openOnboarding() {
    onboardingSelection = new Set(roster.filter((dragon) => dragon.active).map((dragon) => dragon.id));
    document.querySelector("#onboardingSearch").value = "";
    document.querySelector("#onboardingRarity").value = "all";
    renderOnboarding();
    document.querySelector("#onboarding").hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(() => document.querySelector("#onboardingSearch").focus(), 0);
  }

  function closeOnboarding(markSeen = true) {
    document.querySelector("#onboarding").hidden = true;
    document.body.classList.remove("modal-open");
    if (markSeen) localStorage.setItem(ONBOARDING_KEY, "1");
  }

  ["onboardingGrid", "onboardingLimitedGrid"].forEach((gridId) => document.querySelector(`#${gridId}`).addEventListener("click", (event) => {
    const button = event.target.closest("[data-onboarding-id]");
    if (!button) return;
    const id = button.dataset.onboardingId;
    if (onboardingSelection.has(id)) onboardingSelection.delete(id); else onboardingSelection.add(id);
    renderOnboarding();
  }));
  document.querySelector("#onboardingSearch").addEventListener("input", renderOnboarding);
  document.querySelector("#onboardingRarity").addEventListener("change", renderOnboarding);
  document.querySelector("#toggleAllCommon").addEventListener("click", () => {
    const commonDragons = roster.filter((dragon) => !dragon.limited);
    const allCommonSelected = commonDragons.every((dragon) => onboardingSelection.has(dragon.id));
    commonDragons.forEach((dragon) => allCommonSelected ? onboardingSelection.delete(dragon.id) : onboardingSelection.add(dragon.id));
    renderOnboarding();
  });
  document.querySelector("#closeOnboarding").addEventListener("click", () => closeOnboarding());
  document.querySelector("#onboarding").addEventListener("click", (event) => { if (event.target.id === "onboarding") closeOnboarding(); });
  document.querySelector("#saveOnboarding").addEventListener("click", () => {
    roster.forEach((dragon) => { dragon.active = onboardingSelection.has(dragon.id); });
    save();
    localStorage.setItem(ONBOARDING_KEY, "1");
    const first = roster.find((dragon) => dragon.active);
    document.querySelector("#search").value = "";
    renderRoster();
    closeOnboarding(false);
    routeTo("builder");
    toast(first ? `Roster saved. Starter estimates are applied—customize your strongest dragons next.` : "Empty roster saved. Choose dragons whenever you are ready.");
  });
  document.querySelector("#importOnboarding").addEventListener("click", () => document.querySelector("#fileInput").click());
  document.querySelector("#setupRosterBtn").addEventListener("click", openOnboarding);
  document.querySelector("#emptySetupBtn").addEventListener("click", openOnboarding);
  document.addEventListener("click", (event) => { if (event.target.closest(".open-roster-setup")) openOnboarding(); });
  document.addEventListener("roster-reset", () => { localStorage.removeItem(ONBOARDING_KEY); openOnboarding(); });
  document.querySelector("#fileInput").addEventListener("change", (event) => { if (event.target.files[0]) { localStorage.setItem(ONBOARDING_KEY, "1"); closeOnboarding(false); } });

  renderSavedFormations();
  enhanceBuilderResults();
  loadCanonicalCatalog();
  const initialRoute = ROUTES.has(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  routeTo(initialRoute, false);
  if (SHOULD_OPEN_ONBOARDING) setTimeout(openOnboarding, 180);
})();
