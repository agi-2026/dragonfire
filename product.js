(() => {
  const ROUTES = new Set(["home", "myteam", "battle", "rankings", "teambuilder", "builder", "dragons", "roadmap"]);
  const battleState = {
    a: [null, null, null],
    b: [null, null, null],
  };
  const battleOverrides = { a: null, b: null };
  const SAVED_FORMATIONS_KEY = "dragonfire-saved-formations-v1";
  const CATALOG_URL = "/data/dragon-catalog.v1.json?v=3";
  let canonicalCatalog = null;
  let canonicalCatalogError = null;
  let canonicalByName = new Map();
  let onboardingSelection = new Set();
  let myTeamSelectedId = null;
  let myTeamEditorTab = "progression";

  async function loadCanonicalCatalog() {
    try {
      const response = await fetch(CATALOG_URL, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      const catalog = await response.json();
      if (!Array.isArray(catalog.dragons) || catalog.dragons.length !== 33) throw new Error("Catalog failed its 33-dragon integrity check");
      canonicalCatalog = catalog;
      window.DragonfireSimulation.configureCatalog(catalog);
      canonicalByName = new Map(catalog.dragons.map((dragon) => [dragon.name, dragon]));
      window.DRAGON_CANONICAL = Object.fromEntries(catalog.dragons.map((dragon) => [dragon.name, dragon]));
      catalog.dragons.forEach((dragon) => {
        HN[dragon.name] = dragon.habits.map((habit) => habit.name);
      });
      renderRoster();
      if (drawerDragonIndex !== null) renderDragonDrawer(drawerDragonIndex);
      if (document.body.dataset.route === "myteam") renderMyTeam();
    } catch (error) {
      canonicalCatalogError = error;
    }
    if (document.body.dataset.route === "rankings") renderRankings();
    if (document.body.dataset.route === "dragons") renderLibrary();
    if (document.body.dataset.route === "teambuilder") renderCoreBuilder(false);
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
    if (route === "myteam") renderMyTeam();
    if (route === "rankings") renderRankings();
    if (route === "teambuilder") renderCoreBuilder(false);
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

  function myTeamVisibleDragons() {
    const query = document.querySelector("#myTeamSearch").value.trim().toLowerCase();
    const ownership = document.querySelector("#myTeamOwnership").value;
    const rarity = document.querySelector("#myTeamRarity").value;
    return roster
      .filter((dragon) => (!query || dragon.name.toLowerCase().includes(query))
        && (ownership === "all" || (ownership === "owned" ? dragon.active : !dragon.active))
        && (rarity === "all" || dragon.rarity === rarity))
      .sort((a, b) => Number(b.active) - Number(a.active) || b.power - a.power || a.name.localeCompare(b.name));
  }

  function myTeamCardMarkup(dragon) {
    const selected = dragon.id === myTeamSelectedId;
    return `<article class="my-team-card ${dragon.active ? "owned" : "unowned"} ${selected ? "selected" : ""} ${dragon.rarity}">
      <button class="my-team-card-select" data-myteam-select="${esc(dragon.id)}" aria-label="Edit ${esc(dragon.name)}">${dragonAvatar(dragon,"my-team-card-avatar")}<span><b>${esc(dragon.name)}</b><small>${esc(dragon.rarity)} · ${esc(dragon.role)}</small><em><strong data-myteam-card-power="${esc(dragon.id)}">${fmt(dragon.power)}</strong> Power</em><i><span>${dragon.starRank}★</span><span data-myteam-card-level="${esc(dragon.id)}">Lv ${dragon.reignLevel}</span><span>${unlockedCount(dragon)} Habits</span></i></span></button>
      <button class="my-team-owned-toggle" data-myteam-toggle="${esc(dragon.id)}" aria-pressed="${dragon.active}">${dragon.active ? "✓ Owned" : "+ Add"}</button>
    </article>`;
  }

  function myTeamProgressionMarkup(dragon) {
    const powerMax = Math.max(100000, Math.ceil(Math.max(1, dragon.power) * 1.5 / 10000) * 10000);
    const stars = Array.from({ length: 10 }, (_, index) => index + 1);
    return `<div class="my-team-progression">
      <section class="my-team-stat-control"><div class="my-team-stat-head"><label><small>COMBAT POWER</small><input class="my-team-value-input power" id="myTeamPowerInput" type="number" min="0" max="10000000" step="1" value="${dragon.power}" data-myteam-number="power" aria-label="${esc(dragon.name)} Power value"></label><em>${dragon.estimatedPower ? "Starter estimate" : "Player updated"}</em></div><input class="my-team-range power-range" type="range" min="0" max="${powerMax}" step="1" value="${dragon.power}" data-myteam-range="power" aria-label="${esc(dragon.name)} Power slider"><div class="my-team-stepper"><button data-myteam-step="power" data-delta="-100">−100</button><button data-myteam-step="power" data-delta="-5">−5</button><button data-myteam-step="power" data-delta="5">+5</button><button data-myteam-step="power" data-delta="100">+100</button></div></section>
      <section class="my-team-stat-control"><div class="my-team-stat-head"><label><small>REIGN LEVEL</small><input class="my-team-value-input level" id="myTeamLevelInput" type="number" min="1" max="50" step="1" value="${dragon.reignLevel}" data-myteam-number="reignLevel" aria-label="${esc(dragon.name)} Reign level value"></label><em>1–50</em></div><div class="my-team-range-row"><button data-myteam-step="reignLevel" data-delta="-1" aria-label="Decrease ${esc(dragon.name)} level by one">−</button><input class="my-team-range" type="range" min="1" max="50" step="1" value="${dragon.reignLevel}" data-myteam-range="reignLevel" aria-label="${esc(dragon.name)} Reign level slider"><button data-myteam-step="reignLevel" data-delta="1" aria-label="Increase ${esc(dragon.name)} level by one">+</button></div></section>
      <section class="my-team-stat-control stars-control"><div class="my-team-stat-head"><span><small>STAR RANK</small><b>${dragon.starRank}★</b></span><em>${unlockedCount(dragon)} of 5 Habits unlocked</em></div><div class="my-team-star-buttons" role="group" aria-label="${esc(dragon.name)} Star rank">${stars.map((star) => `<button class="${star === dragon.starRank ? "active" : ""}" data-myteam-star="${star}" aria-pressed="${star === dragon.starRank}">${star}<small>★</small></button>`).join("")}</div><p>One Habit unlocks at 2★, 4★, 6★, 8★, and 10★.</p></section>
    </div>`;
  }

  function myTeamHabitsMarkup(dragon) {
    return `<div class="my-team-habits"><div class="my-team-habit-summary"><b>${unlockedCount(dragon)} Habits unlocked</b><span>Choose the in-game level shown for each unlocked Habit.</span></div>${Array.from({ length: 5 }, (_, index) => {
      const unlocked = index < unlockedCount(dragon);
      const rank = habitRank(dragon, index);
      return `<section class="my-team-habit-row ${unlocked ? "" : "locked"}"><span>H${index + 1}</span><div><b>${esc(habitName(dragon, index))}</b><p>${unlocked ? esc(habitDesc(dragon, index)) : `Unlocks when ${esc(dragon.name)} reaches ${(index + 1) * 2}★.`}</p>${unlocked ? `<div class="my-team-habit-levels" role="group" aria-label="${esc(habitName(dragon, index))} level">${[1, 2, 3, 4, 5].map((level) => `<button class="${level === rank ? "active" : ""}" data-myteam-habit="${index}" data-rank="${level}" aria-pressed="${level === rank}">Lv ${level}</button>`).join("")}</div>` : `<div class="my-team-habit-lock">LOCKED · ${(index + 1) * 2}★ REQUIRED</div>`}</div></section>`;
    }).join("")}</div>`;
  }

  function renderMyTeamEditor() {
    const editor = document.querySelector("#myTeamEditor");
    const dragon = roster.find((item) => item.id === myTeamSelectedId);
    if (!dragon) {
      editor.innerHTML = `<div class="my-team-editor-empty"><span>♜</span><h3>Select a dragon</h3><p>Progression and Habits will appear here.</p></div>`;
      return;
    }
    editor.innerHTML = `<div class="my-team-editor-head">${dragonAvatar(dragon,"my-team-editor-avatar")}<div><span>${esc(dragon.rarity)} · ${esc(dragon.breed)}</span><h3>${esc(dragon.name)}</h3><p>${esc(dragon.role)} · ${esc(dragon.damageType)} damage</p></div><button class="my-team-editor-owned ${dragon.active ? "active" : ""}" data-myteam-toggle="${esc(dragon.id)}" aria-pressed="${dragon.active}">${dragon.active ? "✓ In my team" : "+ Add to my team"}</button></div><div class="my-team-editor-tabs" role="tablist"><button role="tab" aria-selected="${myTeamEditorTab === "progression"}" class="${myTeamEditorTab === "progression" ? "active" : ""}" data-myteam-tab="progression">Progression <span>${fmt(dragon.power)} · ${dragon.starRank}★ · Lv ${dragon.reignLevel}</span></button><button role="tab" aria-selected="${myTeamEditorTab === "habits"}" class="${myTeamEditorTab === "habits" ? "active" : ""}" data-myteam-tab="habits">Habits <span>${unlockedCount(dragon)} unlocked</span></button></div><div class="my-team-editor-body">${myTeamEditorTab === "habits" ? myTeamHabitsMarkup(dragon) : myTeamProgressionMarkup(dragon)}</div><footer class="my-team-save-note"><span>●</span> Changes save automatically to this browser and are included in your next JSON export.</footer>`;
  }

  function renderMyTeam() {
    const visible = myTeamVisibleDragons();
    if (!visible.some((dragon) => dragon.id === myTeamSelectedId)) myTeamSelectedId = visible[0]?.id || null;
    const owned = roster.filter((dragon) => dragon.active).length;
    document.querySelector("#myTeamCount").textContent = `${owned} owned · ${visible.length} shown`;
    document.querySelector("#myTeamGrid").innerHTML = visible.map(myTeamCardMarkup).join("") || `<div class="my-team-no-results"><b>No dragons found</b><span>Clear a filter to see the rest of your roster.</span></div>`;
    renderMyTeamEditor();
  }

  function persistMyTeam(message) {
    save();
    renderRoster();
    renderMyTeam();
    if (message) toast(message);
  }

  ["myTeamSearch", "myTeamOwnership", "myTeamRarity"].forEach((id) => document.querySelector(`#${id}`).addEventListener(id === "myTeamSearch" ? "input" : "change", renderMyTeam));
  document.querySelector("#myTeamGrid").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-myteam-toggle]");
    if (toggle) {
      const dragon = roster.find((item) => item.id === toggle.dataset.myteamToggle);
      if (!dragon) return;
      dragon.active = !dragon.active;
      myTeamSelectedId = dragon.id;
      return persistMyTeam(`${dragon.name} ${dragon.active ? "added to" : "removed from"} your team`);
    }
    const select = event.target.closest("[data-myteam-select]");
    if (select) {
      myTeamSelectedId = select.dataset.myteamSelect;
      myTeamEditorTab = "progression";
      renderMyTeam();
      if (matchMedia("(max-width: 900px)").matches) setTimeout(() => document.querySelector("#myTeamEditor").scrollIntoView({ behavior: "auto", block: "start" }), 0);
    }
  });
  document.querySelector("#myTeamEditor").addEventListener("click", (event) => {
    const dragon = roster.find((item) => item.id === myTeamSelectedId);
    if (!dragon) return;
    const toggle = event.target.closest("[data-myteam-toggle]");
    if (toggle) {
      dragon.active = !dragon.active;
      return persistMyTeam(`${dragon.name} ${dragon.active ? "added to" : "removed from"} your team`);
    }
    const tab = event.target.closest("[data-myteam-tab]");
    if (tab) {
      myTeamEditorTab = tab.dataset.myteamTab;
      return renderMyTeamEditor();
    }
    const star = event.target.closest("[data-myteam-star]");
    if (star) {
      const previousUnlocked = unlockedCount(dragon);
      dragon.starRank = Number(star.dataset.myteamStar);
      const newlyUnlocked = unlockedCount(dragon) - previousUnlocked;
      return persistMyTeam(newlyUnlocked > 0 ? `${dragon.name} reached ${dragon.starRank}★ and unlocked ${newlyUnlocked} Habit` : `${dragon.name} set to ${dragon.starRank}★`);
    }
    const habit = event.target.closest("[data-myteam-habit]");
    if (habit) {
      const index = Number(habit.dataset.myteamHabit);
      dragon.habitRanks = dragon.habitRanks || [];
      dragon.habitRanks[index] = Number(habit.dataset.rank);
      return persistMyTeam(`${dragon.name} · ${habitName(dragon, index)} set to Lv ${habit.dataset.rank}`);
    }
    const step = event.target.closest("[data-myteam-step]");
    if (step) {
      const field = step.dataset.myteamStep;
      const limits = field === "power" ? [0, 10000000] : [1, 50];
      dragon[field] = Math.max(limits[0], Math.min(limits[1], Number(dragon[field]) + Number(step.dataset.delta)));
      if (field === "power") dragon.estimatedPower = false;
      return persistMyTeam(`${dragon.name} ${field === "power" ? "Power" : "level"} updated`);
    }
    const set = event.target.closest("[data-myteam-set]");
    if (set) {
      dragon[set.dataset.myteamSet] = Number(set.dataset.value);
      return persistMyTeam(`${dragon.name} set to level ${set.dataset.value}`);
    }
  });
  document.querySelector("#myTeamEditor").addEventListener("input", (event) => {
    if (!event.target.matches("[data-myteam-range], [data-myteam-number]")) return;
    const dragon = roster.find((item) => item.id === myTeamSelectedId);
    if (!dragon || event.target.value === "") return;
    const field = event.target.dataset.myteamRange || event.target.dataset.myteamNumber;
    const limits = field === "power" ? [0, 10000000] : [1, 50];
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    dragon[field] = Math.max(limits[0], Math.min(limits[1], value));
    if (field === "power") {
      dragon.estimatedPower = false;
      const input = document.querySelector("#myTeamPowerInput");
      const range = document.querySelector('[data-myteam-range="power"]');
      if (dragon.power > Number(range.max)) range.max = Math.ceil(dragon.power * 1.5 / 10000) * 10000;
      input.value = dragon.power;
      range.value = dragon.power;
      const cardPower = [...document.querySelectorAll("[data-myteam-card-power]")].find((node) => node.dataset.myteamCardPower === dragon.id);
      if (cardPower) cardPower.textContent = fmt(dragon.power);
    } else {
      document.querySelector("#myTeamLevelInput").value = dragon.reignLevel;
      document.querySelector('[data-myteam-range="reignLevel"]').value = dragon.reignLevel;
      const cardLevel = [...document.querySelectorAll("[data-myteam-card-level]")].find((node) => node.dataset.myteamCardLevel === dragon.id);
      if (cardLevel) cardLevel.textContent = `Lv ${dragon.reignLevel}`;
    }
  });
  document.querySelector("#myTeamEditor").addEventListener("change", (event) => {
    if (!event.target.matches("[data-myteam-range], [data-myteam-number]")) return;
    const dragon = roster.find((item) => item.id === myTeamSelectedId);
    if (dragon) persistMyTeam(`${dragon.name} updated`);
  });

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

  function projectedDragon(source, targetStars, targetLevel, targetHabitRank) {
    const dragon = clone(source);
    const stars = Math.max(Number(source.starRank) || 1, Number(targetStars) || 10);
    const level = Math.max(Number(source.reignLevel) || 1, Number(targetLevel) || 50);
    const starGain = stars - (Number(source.starRank) || 1);
    const levelGain = level - (Number(source.reignLevel) || 1);
    const starRate = { legendary: 0.105, epic: 0.085, rare: 0.07 }[source.rarity] || 0.08;
    dragon.starRank = stars;
    dragon.reignLevel = level;
    dragon.power = Math.round(Math.max(1, Number(source.power) || 1) * (1 + starGain * starRate) * (1 + levelGain * 0.016));
    dragon.habitRanks = Array.from({ length: 5 }, (_, index) => index < unlockedCount(dragon) ? Math.max(habitRank(source, index), Number(targetHabitRank) || 1) : 0);
    dragon.estimatedPower = true;
    return dragon;
  }

  function bestCoreFormations(core, pool) {
    const others = pool.filter((dragon) => dragon.id !== core.id);
    const troopTypes = Object.keys(TROOPS).filter((troop) => troop !== "siege");
    const formations = [];
    const ranked = [...pool].sort((a, b) => b.power - a.power);
    const benchmarkTeams = [
      { team: ranked.slice(0, 3), troop: "shieldbearers" },
      { team: ranked.slice(3, 6), troop: "archers" },
    ].filter((entry) => entry.team.length === 3);
    for (let first = 0; first < others.length - 1; first += 1) {
      for (let second = first + 1; second < others.length; second += 1) {
        const trio = [core, others[first], others[second]];
        let best = null;
        for (const permutation of PERMS) {
          const order = permutation.map((index) => trio[index]);
          for (const troop of troopTypes) {
            const profile = window.DragonfireSimulation.formationProfile(order, troop);
            if (!best || profile.score > best.prefilter) best = { order, troop, prefilter: profile.score, raw: profile.raw };
          }
        }
        const simulation = window.DragonfireSimulation.evaluateFormation(best.order, best.troop, benchmarkTeams, { runs: 1, seed: `core-${core.name}` });
        best.score = simulation.score;
        best.simulation = simulation;
        const explained = window.DragonfireSimulation.formationProfile(best.order, best.troop);
        formations.push({
          key: trio.map((dragon) => dragon.name).sort().join("|"),
          order: best.order,
          troop: best.troop,
          score: best.score,
          raw: best.raw,
          uplift: best.simulation.winRate * 100,
          simulation: best.simulation,
          reasons: explained.reasons.slice(0, 4),
        });
      }
    }
    return formations.sort((a, b) => b.score - a.score);
  }

  function coreBuilderTargets() {
    return {
      stars: Number(document.querySelector("#coreTargetStars").value) || 10,
      level: Number(document.querySelector("#coreTargetLevel").value) || 50,
      habit: Number(document.querySelector("#coreTargetHabit").value) || 3,
    };
  }

  function corePreviewMarkup(core, projected) {
    const currentHabits = unlockedCount(core);
    const futureHabits = unlockedCount(projected);
    return `<div class="core-preview-identity">${dragonAvatar(core,"core-builder-avatar")}<span><b>${esc(core.name)}</b><small>${esc(core.rarity)} · ${esc(core.role)} · ${esc(core.damageType)} damage</small></span></div><div class="core-preview-stats"><span><small>NOW</small><b>${fmt(core.power)}</b><em>${core.starRank}★ · Lv ${core.reignLevel} · ${currentHabits} Habits</em></span><i>→</i><span><small>POTENTIAL</small><b>${fmt(projected.power)}</b><em>${projected.starRank}★ · Lv ${projected.reignLevel} · ${futureHabits} Habits</em></span></div>`;
  }

  function formationRankMap(formations) {
    return new Map(formations.map((formation, index) => [formation.key, index + 1]));
  }

  function formationCardMarkup(formation, index, comparisonRanks, mode) {
    const comparisonRank = comparisonRanks.get(formation.key);
    const shift = comparisonRank ? comparisonRank - (index + 1) : 0;
    const shiftLabel = shift > 0 ? `↑ ${shift} vs ${mode === "current" ? "potential" : "current"}` : shift < 0 ? `↓ ${Math.abs(shift)} vs ${mode === "current" ? "potential" : "current"}` : "same rank";
    const names = formation.order.map((dragon) => dragon.name);
    return `<article class="core-formation-card ${mode}" data-team="${esc(names.join("|"))}" data-troop="${formation.troop}"><header><span class="core-rank">#${index + 1}</span><div><b>${names.map(esc).join(" · ")}</b><small>${esc(TROOPS[formation.troop])} · ${shiftLabel}</small></div><strong>${formation.uplift.toFixed(1)}%<small>simulated win rate</small></strong></header><div class="core-formation-lanes">${formation.order.map((dragon, lane) => `<div class="core-lane ${lane === 1 ? "center" : ""}">${dragonAvatar(dragon,"core-lane-avatar")}<span><small>${POSITIONS[lane]}</small><b>${esc(dragon.name)}</b><em>${dragon.starRank}★ · Lv ${dragon.reignLevel}</em></span></div>`).join("")}</div><div class="core-reasons">${formation.reasons.slice(0, 3).map((reason) => `<span><i>${reason.warn ? "!" : "✓"}</i>${esc(reason.text)}</span>`).join("")}</div><footer><button class="btn compact-btn core-test-team">⚔ Test current roster</button><button class="btn compact-btn core-save-team">Save lineup</button></footer></article>`;
  }

  function partnerRankingMarkup(formations, coreName, comparisonFormations = []) {
    const comparison = new Map();
    comparisonFormations.forEach((formation, index) => formation.order.filter((dragon) => dragon.name !== coreName).forEach((dragon) => {
      if (!comparison.has(dragon.name)) comparison.set(dragon.name, index + 1);
    }));
    const partners = new Map();
    formations.forEach((formation, index) => formation.order.filter((dragon) => dragon.name !== coreName).forEach((dragon) => {
      if (!partners.has(dragon.name)) partners.set(dragon.name, { dragon, rank: index + 1, formation });
    }));
    return [...partners.values()].sort((a, b) => a.rank - b.rank).slice(0, 8).map((item, index) => {
      const oldRank = comparison.get(item.dragon.name);
      const shift = oldRank ? oldRank - item.rank : 0;
      const shiftCopy = comparisonFormations.length ? (shift > 0 ? ` · ↑${shift} formation ranks` : shift < 0 ? ` · ↓${Math.abs(shift)} formation ranks` : " · same best rank") : "";
      return `<div class="partner-row"><span>${index + 1}</span>${dragonAvatar(item.dragon,"partner-avatar")}<div><b>${esc(item.dragon.name)}</b><small>Best formation #${item.rank} · ${esc(item.dragon.role)}${shiftCopy}</small></div><strong>${item.formation.uplift.toFixed(1)}%</strong></div>`;
    }).join("");
  }

  function partnerBestFormationMap(formations, coreName) {
    const partners = new Map();
    formations.forEach((formation, index) => formation.order.filter((dragon) => dragon.name !== coreName).forEach((dragon) => {
      if (!partners.has(dragon.name)) partners.set(dragon.name, { rank: index + 1, formation });
    }));
    return partners;
  }

  function scenarioMoversMarkup(core, currentFormations, potentialFormations, currentPool, projectedPool) {
    const currentBest = partnerBestFormationMap(currentFormations, core.name);
    const potentialBest = partnerBestFormationMap(potentialFormations, core.name);
    const currentByName = new Map(currentPool.map((dragon) => [dragon.name, dragon]));
    return projectedPool
      .filter((dragon) => dragon.name !== core.name && potentialBest.has(dragon.name))
      .map((dragon) => {
        const current = currentByName.get(dragon.name);
        const before = currentBest.get(dragon.name);
        const after = potentialBest.get(dragon.name);
        const rankGain = (before?.rank || potentialFormations.length) - after.rank;
        const habitGain = unlockedCount(dragon) - unlockedCount(current);
        const starGain = dragon.starRank - current.starRank;
        const levelGain = dragon.reignLevel - current.reignLevel;
        let priority = 0;
        let note = habitGain > 0 ? `${habitGain} new Habit${habitGain === 1 ? "" : "s"}: ${Array.from({ length: unlockedCount(dragon) }, (_, index) => index).slice(unlockedCount(current)).map((index) => habitName(dragon, index)).join(" · ")}` : "No new Habit slot at this floor";
        if (core.name === "Vhagar" && dragon.name === "Venator" && unlockedCount(dragon) >= 2 && unlockedCount(projectedPool.find((item) => item.name === core.name)) >= 2) {
          priority = 2;
          note = "Battle Leader compounds Venator’s 4★ physical-damage Habit on the right flank.";
        }
        if (core.name === "Vhagar" && dragon.name === "Malachite") {
          priority = 1;
          note = unlockedCount(dragon) >= 2 ? "Malachite’s sustain protects Vhagar’s Taunt frontline; 4★ also unlocks Wise Vigor." : "Malachite’s sustain protects Vhagar’s Taunt frontline.";
        }
        return { dragon, current, before, after, rankGain, habitGain, starGain, levelGain, note, priority };
      })
      .sort((a, b) => b.priority - a.priority || b.rankGain - a.rankGain || b.habitGain - a.habitGain || b.starGain - a.starGain || a.after.rank - b.after.rank)
      .slice(0, 8)
      .map((item) => `<article class="scenario-mover">${dragonAvatar(item.dragon,"scenario-mover-avatar")}<div><b>${esc(item.dragon.name)}</b><small>${item.current.starRank}★ → ${item.dragon.starRank}★ · Lv ${item.current.reignLevel} → ${item.dragon.reignLevel}</small><p>${esc(item.note)}</p></div><strong class="${item.rankGain > 0 ? "up" : item.rankGain < 0 ? "down" : ""}">${item.before.rank} → ${item.after.rank}<small>best formation rank</small></strong></article>`).join("");
  }

  function counterStatFor(damageType) {
    return { physical: "instinct", tactical: "intelligence", fire: "initiative" }[damageType] || "instinct";
  }

  function breakerTeams(formation, pool) {
    const seen = new Set();
    const threats = [];
    for (const candidate of buildCandidates(pool, "pvp").slice(0, 160)) {
      const team = resolveTeam(candidate);
      if (team.length !== 3) continue;
      const key = team.map((dragon) => dragon.name).sort().join("|");
      if (key === formation.key || seen.has(key)) continue;
      seen.add(key);
      const result = window.DragonfireSimulation.simulateMatchup(team, formation.order, { count: 6, seed: `breaker-${key}`, troopA: candidate.troop, troopB: formation.troop, maxRounds: 12 });
      const winRate = (result.winsA + result.draws * 0.5) / result.count;
      threats.push({ team, key, troop: candidate.troop, score: winRate, winRate, coverage: window.DragonfireSimulation.coverage(team) });
      if (seen.size >= 80) break;
    }
    return threats.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  function coreRiskNotes(core) {
    const notes = [`High ${counterStatFor(core.damageType)} defenders reduce ${core.damageType} pressure.`];
    if (core.role === "healer" || core.tags?.some((tag) => ["heal", "recovery", "cleanse"].includes(tag))) notes.push("Fast control and burst can deny sustain before it compounds.");
    if (core.role === "tank" || core.tags?.some((tag) => ["taunt", "mitigation"].includes(tag))) notes.push("Cleanse, resistance, and sustained damage can outlast the frontline plan.");
    if (core.tags?.includes("panic")) notes.push("Cleanse and Resistance can break Panic setup before the payoff lands.");
    if (core.tags?.includes("burn")) notes.push("Anti-fire mitigation and cleanse reduce Burn-dependent value.");
    if (notes.length < 3) notes.push("Initiative loss or lane disruption can prevent the intended combo order.");
    return notes.slice(0, 3);
  }

  function investmentMilestonesMarkup(core, projected) {
    const milestones = [];
    for (let index = 0; index < 5; index += 1) {
      const star = (index + 1) * 2;
      if (star > core.starRank && star <= projected.starRank) milestones.push(`<div><span>${star}★</span><b>Unlock H${index + 1} · ${esc(habitName(core, index))}</b><small>${esc(habitDesc(core, index))}</small></div>`);
    }
    if (projected.reignLevel > core.reignLevel) milestones.unshift(`<div><span>LV</span><b>${core.reignLevel} → ${projected.reignLevel}</b><small>Relative Power projection: ${fmt(core.power)} → ${fmt(projected.power)}.</small></div>`);
    return milestones.join("") || `<div><span>✓</span><b>Target already reached</b><small>Raise the target to expose another modeled breakpoint.</small></div>`;
  }

  function renderCoreBuilder() {
    const active = poweredRoster().sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));
    const select = document.querySelector("#coreDragonSelect");
    const previous = select.value;
    select.innerHTML = active.map((dragon) => `<option value="${esc(dragon.name)}" ${dragon.name === previous ? "selected" : ""}>${esc(dragon.name)} · ${fmt(dragon.power)} · ${dragon.starRank}★</option>`).join("");
    const results = document.querySelector("#coreBuilderResults");
    if (active.length < 3) {
      document.querySelector("#coreDragonPreview").innerHTML = "";
      results.innerHTML = `<div class="panel core-builder-empty"><span>!</span><h3>At least three powered dragons are required</h3><p>Open Team Optimizer, choose your roster, and enter current Power before building around a core.</p><button class="btn primary" data-go="builder">Set up my roster</button></div>`;
      return;
    }
    if (!select.value) select.value = active[0].name;
    const core = active.find((dragon) => dragon.name === select.value) || active[0];
    const target = coreBuilderTargets();
    const projectedPool = active.map((dragon) => projectedDragon(dragon, target.stars, target.level, target.habit));
    const projectedCore = projectedPool.find((dragon) => dragon.name === core.name);
    document.querySelector("#coreDragonPreview").innerHTML = corePreviewMarkup(core, projectedCore);

    const currentFormations = bestCoreFormations(core, active);
    const potentialFormations = bestCoreFormations(projectedCore, projectedPool);
    const currentRanks = formationRankMap(currentFormations);
    const potentialRanks = formationRankMap(potentialFormations);
    const currentBest = currentFormations[0];
    const threats = breakerTeams(currentBest, active);
    const changedDragons = projectedPool.filter((dragon, index) => dragon.starRank !== active[index].starRank || dragon.reignLevel !== active[index].reignLevel || unlockedCount(dragon) !== unlockedCount(active[index])).length;
    const sourcedCore = canonicalByName.get(core.name);

    results.innerHTML = `<section class="panel core-builder-summary"><div class="core-summary-hero">${dragonAvatar(core,"core-summary-avatar")}<div><div class="eyebrow">BUILD AROUND ${esc(core.name)}</div><h3>${esc(core.name)} has ${currentFormations.length} legal partner pairs</h3><p>Current ranking uses your roster exactly as entered. Potential ranking raises every candidate dragon to at least ${target.stars}★, level ${target.level}, and Habit level ${target.habit}; dragons already above that floor keep their stronger stats.</p></div><div class="core-ceiling"><small>LINEUP SCENARIO</small><b>${changedDragons}</b><span>candidate dragon${changedDragons === 1 ? "" : "s"} advance at this floor</span></div></div>${sourcedCore ? `<div class="core-source-strip"><span><b>Command:</b> ${esc(sourcedCore.command.text)}</span><span><b>Vanguard:</b> ${esc(sourcedCore.vanguard.text)}</span><em>Both abilities are structured combat events; unlocked Habit coverage is reported per formation.</em></div>` : ""}</section>
      <section class="core-ranking-grid"><div><div class="core-section-title"><span>01</span><div><h3>Current ranking</h3><p>Best formations using your roster exactly as entered.</p></div></div><div class="core-formation-list">${currentFormations.slice(0, 5).map((formation, index) => formationCardMarkup(formation, index, potentialRanks, "current")).join("")}</div></div><div><div class="core-section-title"><span>02</span><div><h3>Potential ranking</h3><p>Every dragon in each candidate trio advances to the selected scenario floor.</p></div></div><div class="core-formation-list">${potentialFormations.slice(0, 5).map((formation, index) => formationCardMarkup(formation, index, currentRanks, "potential")).join("")}</div></div></section>
      <section class="core-partner-grid"><article class="panel"><div class="core-section-title compact"><span>A</span><div><h3>Best partners now</h3><p>Partner’s highest-ranked formation with ${esc(core.name)}.</p></div></div><div class="partner-list">${partnerRankingMarkup(currentFormations, core.name)}</div></article><article class="panel"><div class="core-section-title compact"><span>B</span><div><h3>Best partners at potential</h3><p>Who rises when every candidate can reach the scenario floor.</p></div></div><div class="partner-list">${partnerRankingMarkup(potentialFormations, core.name, currentFormations)}</div></article></section>
      <section class="panel core-scenario-movers"><div class="core-section-title compact"><span>↗</span><div><h3>Potential movers</h3><p>Largest changes in each partner’s best formation rank, including new Star-gated Habit interactions.</p></div></div><div class="scenario-mover-list">${scenarioMoversMarkup(core, currentFormations, potentialFormations, active, projectedPool)}</div></section>
      <section class="core-analysis-grid"><article class="panel core-breakpoints"><div class="core-section-title compact"><span>★</span><div><h3>Investment breakpoints</h3><p>What the selected target unlocks for the core dragon.</p></div></div><div class="breakpoint-list">${investmentMilestonesMarkup(core, projectedCore)}</div></article><article class="panel core-threats"><div class="core-section-title compact"><span>!</span><div><h3>Threat profile</h3><p>Conditions that can break the core plan.</p></div></div><div class="threat-note-list">${coreRiskNotes(core).map((note) => `<span>${esc(note)}</span>`).join("")}</div></article></section>
      <section class="panel breaker-section"><div class="core-section-title compact"><span>×</span><div><h3>Simulated breaker teams</h3><p>Formations from your active roster tested directly against the current #1 core formation.</p></div></div><div class="breaker-grid">${threats.map((threat, index) => `<article><header><span>#${index + 1}</span><b>${threat.team.map((dragon) => esc(dragon.name)).join(" · ")}</b><small>${esc(TROOPS[threat.troop])}</small></header><div>${threat.team.map((dragon) => dragonAvatar(dragon,"breaker-avatar")).join("")}</div><p>${(threat.winRate * 100).toFixed(1)}% simulated win rate · ${threat.coverage.known}/${threat.coverage.total} structured effects</p></article>`).join("")}</div><div class="core-disclaimer">These are seeded engine results, not generic counter tags. Damage-curve calibration and unknown Habits remain the confidence boundary.</div></section>`;
  }

  ["coreDragonSelect", "coreTargetStars", "coreTargetLevel", "coreTargetHabit"].forEach((id) => document.querySelector(`#${id}`).addEventListener("change", renderCoreBuilder));
  document.querySelector("#buildAroundCore").addEventListener("click", renderCoreBuilder);
  document.querySelector("#coreBuilderResults").addEventListener("click", (event) => {
    const routeButton = event.target.closest("[data-go]");
    if (routeButton) return routeTo(routeButton.dataset.go);
    const card = event.target.closest("[data-team]");
    if (!card) return;
    const dragonNames = card.dataset.team.split("|");
    const troop = card.dataset.troop;
    if (event.target.closest(".core-test-team")) applyFormation("a", { dragonNames, troop, mode: "personal" });
    if (event.target.closest(".core-save-team")) saveFormationData(dragonNames, troop, "personal");
  });

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
    const result = window.DragonfireSimulation.simulateMatchup(teamA, teamB, { count, seed: seedText, maxRounds, troopA, troopB });
    renderBattleResult({ teamA, teamB, troopA, troopB, seedText, maxRounds, ...result });
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
      <div class="assumption-bar"><b>Engine v${window.DragonfireSimulation.VERSION}:</b> base attributes, Power progression, +20% positive Affinity stats, ±7% troop-matchup damage, lane targeting, structured Commands and Vanguard effects, and community-sourced Habit mechanics are modeled. Habit data is not official verification; damage and progression curves still require battle-report calibration. Formation A executable coverage: ${window.DragonfireSimulation.coverage(result.teamA).known}/${window.DragonfireSimulation.coverage(result.teamA).total}. Seed: <code>${esc(result.seedText)}</code>.</div>
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
    const structured = window.DragonfireSimulation.registryCoverage();
    const verifiedEffects = structured.total;
    document.querySelector("#catalogProfileCount").textContent = dragons.length;
    document.querySelector("#catalogStatCount").textContent = dragons.length * 4;
    document.querySelector("#catalogMechanicCount").textContent = verifiedEffects;
    document.querySelector("#metaFormations").innerHTML = [
      ["Cross-checked attributes", `${dragons.length * 4}/132`, "Every level-one stat agrees across two community datasets", dragons.length / 33],
      ["Structured Commands", `${structured.commands}/33`, "All sourced Commands execute through explicit round triggers, targets, damage types, and statuses", structured.commands / 33],
      ["Structured Vanguards", `${structured.vanguards}/33`, "Vanguard effects apply only from the center lane to their stated flank targets", structured.vanguards / 33],
      ["Sourced Habit mechanics", `${structured.habitData}/165 sourced, ${structured.habits} running`, "All rank tables and trigger forms execute; calibration remains community-derived", structured.habits / 165],
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
      const mechanicCount = 2 + dragon.habits.filter((habit, habitIndex) => window.DragonfireSimulation.isHabitEncoded(dragon.name, habitIndex)).length;
      return `<tr><td class="rank-num">${index + 1}</td><td><span class="rank-dragon">${rosterDragon ? dragonAvatar(rosterDragon,"rank-avatar") : ""}<span><b>${esc(dragon.name)}</b><small>${esc(dragon.rarity)} · ${esc(dragon.breed)} · Lv1 base</small></span></span></td><td><b class="base-stat str">${dragon.baseStats.strength}</b></td><td><b class="base-stat inst">${dragon.baseStats.instinct}</b></td><td><b class="base-stat int">${dragon.baseStats.intelligence}</b></td><td><b class="base-stat init">${dragon.baseStats.initiative}</b></td><td><span class="mechanic-coverage sourced">7/7 effect datasets</span><small class="coverage-detail">${mechanicCount}/7 executable</small></td><td><span class="source-stack"><a class="source-link" href="https://wyrmtable.com/dragons" target="_blank" rel="noreferrer">Stats ↗</a><a class="source-link" href="https://dragonfire-hub.com/" target="_blank" rel="noreferrer">Abilities ↗</a><a class="source-link" href="https://dragonfiresim.com/" target="_blank" rel="noreferrer">Habit model ↗</a></span></td></tr>`;
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
      const response = await fetch("/api/contribute-roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelVersion: "0.17.0", consentVersion: "2026-07-29", roster: active }) });
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
      return `<article class="panel library-card"><div class="library-top"><div class="library-name">${dragonAvatar(dragon,"library-avatar")}<span><h3>${esc(dragon.name)}</h3><small>${esc(evidence?.rarity || dragon.rarity)} · ${esc(evidence?.breed || dragon.breed)} · ${esc(dragon.role)}</small></span></div><div class="library-power">${dragon.power ? fmt(dragon.power) : "Not set"}<small>Your roster · ${dragon.starRank}★ · Lv ${dragon.reignLevel}</small></div></div><div class="library-base-stats">${baseStats}</div><div class="library-evidence"><span><b>Level-one base · ${evidence?.baseTroops ?? "—"} troops</b><small>${esc(evidence?.marchSpeed || "Unknown")} march · player modifiers excluded</small></span><span class="evidence-badge ${evidence ? "sourced" : "pending"}">${sourceStatus}</span></div><div class="library-abilities">${evidence?.command.text ? `<div class="library-ability command"><b>Command source text</b><span>${esc(evidence.command.text)}</span><small>Structured as round-based combat events in engine v${window.DragonfireSimulation.VERSION}</small></div>` : ""}${evidence?.vanguard.text ? `<div class="library-ability vanguard"><b>Vanguard source text</b><span>${esc(evidence.vanguard.text)}</span><small>Structured with lane-specific targets in engine v${window.DragonfireSimulation.VERSION}</small></div>` : ""}</div><div class="kit-tags">${(dragon.tags || []).slice(0, 7).map((tag) => `<span class="kit-tag">${esc(tag)}</span>`).join("") || `<span class="kit-tag">kit data pending</span>`}</div><div class="habit-list">${habitRows}</div><div class="affinity-strip">${affinity}</div>${missing ? `<div class="data-gap">${missing} unlocked Habit description${missing > 1 ? "s" : ""} remain neutral until their exact formulas are encoded.</div>` : ""}${evidence ? `<div class="library-sources"><a class="source-link" href="https://wyrmtable.com/dragons" target="_blank" rel="noreferrer">Inspect stat source ↗</a><a class="source-link" href="https://dragonfire-hub.com/" target="_blank" rel="noreferrer">Inspect ability source ↗</a></div>` : ""}</article>`;
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
    routeTo("myteam");
    toast(first ? `Roster saved. Starter estimates are applied—customize your strongest dragons next.` : "Empty roster saved. Choose dragons whenever you are ready.");
  });
  document.querySelector("#importOnboarding").addEventListener("click", () => document.querySelector("#fileInput").click());
  document.querySelector("#setupRosterBtn").addEventListener("click", openOnboarding);
  document.querySelector("#emptySetupBtn").addEventListener("click", openOnboarding);
  document.addEventListener("click", (event) => { if (event.target.closest(".open-roster-setup")) openOnboarding(); });
  document.addEventListener("roster-imported", () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    closeOnboarding(false);
    myTeamSelectedId = roster.find((dragon) => dragon.active)?.id || roster[0]?.id || null;
    document.querySelector("#myTeamSearch").value = "";
    document.querySelector("#myTeamOwnership").value = "all";
    document.querySelector("#myTeamRarity").value = "all";
    routeTo("myteam");
  });
  document.addEventListener("roster-reset", () => { localStorage.removeItem(ONBOARDING_KEY); openOnboarding(); });
  document.querySelector("#fileInput").addEventListener("change", (event) => { if (event.target.files[0]) { localStorage.setItem(ONBOARDING_KEY, "1"); closeOnboarding(false); } });

  renderSavedFormations();
  enhanceBuilderResults();
  loadCanonicalCatalog();
  const initialRoute = ROUTES.has(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  routeTo(initialRoute, false);
  if (SHOULD_OPEN_ONBOARDING) setTimeout(openOnboarding, 180);
})();
