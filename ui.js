/**
 * Nokoi Tools - Bowling Settlement - UI
 */
(function (global) {
  "use strict";

  const N = (global.Nokoi = global.Nokoi || {});

  let eventsBound = false;

  // ========================================
  // DOM同期
  // ========================================
  function syncFromDom(save) {
    if (save === undefined) save = true;
    const dom = N.dom;
    if (!dom) return;

    if (dom.playerCount) {
      N.state.playerCount = N.clamp(
        parseInt(dom.playerCount.value, 10) || N.MIN_PLAYERS,
        N.MIN_PLAYERS,
        N.MAX_PLAYERS
      );
    }
    if (dom.teamCount) {
      N.state.teamCount = N.clamp(
        parseInt(dom.teamCount.value, 10) || N.MIN_TEAMS,
        N.MIN_TEAMS,
        N.state.playerCount
      );
    }
    if (dom.pricePerPin) {
      N.state.settings.pricePerPin =
        parseInt(dom.pricePerPin.value, 10) || N.DEFAULT_PRICE;
    }

    const calcEl = document.querySelector('input[name="calcMethod"]:checked');
    if (calcEl) N.state.settings.calcMethod = calcEl.value;

    const roundEl = document.querySelector('input[name="rounding"]:checked');
    if (roundEl) N.state.settings.rounding = roundEl.value;

    const remEl = document.querySelector(
      'input[name="remainderAdjust"]:checked'
    );
    if (remEl) N.state.settings.remainderAdjust = remEl.value;

    if (dom.remainderRep) {
      N.state.settings.remainderRepId = dom.remainderRep.value || null;
    }

    N.state.players.forEach((p) => {
      const row = dom.playerList?.querySelector(`.player-row[data-id="${p.id}"]`);
      if (!row) return;
      const nameEl = row.querySelector(".player-name");
      const scoreEl = row.querySelector(".player-score");
      if (nameEl) p.name = nameEl.value;
      if (scoreEl) p.currentScore = scoreEl.value;
    });

    N.state.teams.slice(0, N.state.teamCount).forEach((t) => {
      const input = dom.teamNames?.querySelector(
        `.team-name-input[data-team-id="${t.id}"]`
      );
      if (input) t.name = input.value;
    });

    dom.teamList?.querySelectorAll(".team-select").forEach((sel) => {
      const pid = sel.dataset.playerId;
      const p = N.getPlayerById(pid);
      if (p) p.teamId = parseInt(sel.value, 10);
    });

    if (save) N.scheduleSave();
  }
  N.syncFromDom = syncFromDom;

  // ========================================
  // レンダリング
  // ========================================
  function renderAll() {
    renderGameBar();
    renderPlayerCount();
    renderPlayers();
    renderTeamCount();
    renderTeamNames();
    renderTeamLegend();
    renderTeamList();
    renderTeamWarning();
    renderSettlementPreset();
    renderSettlementPairs();
    renderSettingsInputs();
    renderRepresentativeSelect();
    renderRoulette();
    if (N.state.lastResult) renderResult(N.state.lastResult);
  }
  N.renderAll = renderAll;

  function renderGameBar() {
    const dom = N.dom;
    if (dom.currentGameDisplay) {
      dom.currentGameDisplay.textContent = String(N.state.currentGame);
    }
    if (dom.gameHint) {
      const completed = N.state.gameHistory.length;
      dom.gameHint.textContent = completed
        ? `${completed}ゲーム終了済み · 現在${N.state.currentGame}ゲーム目`
        : "スコアを入力して「精算を計算する」を押してください";
    }
    if (dom.prevGameBtn) dom.prevGameBtn.disabled = N.state.currentGame <= 1;
    if (dom.endSessionBtn) {
      dom.endSessionBtn.disabled = N.state.gameHistory.length === 0;
    }
  }

  function renderPlayerCount() {
    if (N.dom.playerCount) N.dom.playerCount.value = N.state.playerCount;
  }

  function renderPlayers() {
    if (!N.dom.playerList) return;
    N.dom.playerList.innerHTML = "";

    N.state.players.slice(0, N.state.playerCount).forEach((p, i) => {
      const stats = N.getPlayerStats(p);
      const row = document.createElement("div");
      row.className = "player-row";
      row.dataset.id = p.id;

      const num = document.createElement("span");
      num.className = "player-number";
      num.textContent = String(i + 1);

      const name = document.createElement("input");
      name.type = "text";
      name.className = "input player-name";
      name.value = p.name;
      name.placeholder = N.defaultPlayerName(i);
      name.setAttribute("aria-label", `${N.defaultPlayerName(i)}の名前`);

      const score = document.createElement("input");
      score.type = "number";
      score.className = "input player-score";
      score.value = p.currentScore;
      score.placeholder = "0";
      score.min = N.MIN_SCORE;
      score.max = N.MAX_SCORE;
      score.inputMode = "numeric";
      score.setAttribute("aria-label", `${N.defaultPlayerName(i)}の今回スコア`);

      const cum = document.createElement("span");
      cum.className = "player-cumulative";
      cum.textContent = String(stats.cumulative);
      cum.setAttribute("aria-label", "累計スコア");

      const avg = document.createElement("span");
      avg.className = "player-average";
      avg.textContent =
        stats.average > 0 ? N.formatScore(stats.average) : "-";
      avg.setAttribute("aria-label", "平均スコア");

      row.append(num, name, score, cum, avg);
      N.applyTeamColorStyle(row, p.teamId);
      N.dom.playerList.appendChild(row);
    });
  }

  function renderTeamCount() {
    if (N.dom.teamCount) {
      N.dom.teamCount.value = N.state.teamCount;
      N.dom.teamCount.max = N.state.playerCount;
    }
  }

  function renderTeamNames() {
    if (!N.dom.teamNames) return;
    N.dom.teamNames.innerHTML = "";
    for (let t = 1; t <= N.state.teamCount; t++) {
      const team = N.getTeamById(t) || {
        id: t,
        name: N.defaultTeamName(t),
        manualName: false,
      };
      const row = document.createElement("div");
      row.className = "team-name-row";

      const dot = document.createElement("span");
      dot.className = "team-name-dot";
      dot.style.background = N.getTeamColor(t).color;

      const field = document.createElement("div");
      field.className = "team-name-field";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "input team-name-input";
      input.dataset.teamId = String(t);
      input.value = team.name || N.defaultTeamName(t);
      input.setAttribute("aria-label", `チーム${t}の名前`);

      field.appendChild(input);
      if (team.manualName) {
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "btn-text team-name-reset";
        resetBtn.dataset.teamId = String(t);
        resetBtn.textContent = "自動生成に戻す";
        resetBtn.setAttribute("aria-label", `チーム${t}の名前を自動生成に戻す`);
        field.appendChild(resetBtn);
      }

      row.append(dot, field);
      N.dom.teamNames.appendChild(row);
    }
  }
  N.renderTeamNames = renderTeamNames;

  function renderTeamLegend() {
    if (!N.dom.teamLegend) return;
    N.dom.teamLegend.innerHTML = "";
    for (let t = 1; t <= N.state.teamCount; t++) {
      const chip = document.createElement("span");
      chip.className = "team-chip";
      N.applyTeamColorStyle(chip, t);
      const dot = document.createElement("span");
      dot.className = "team-chip-dot";
      chip.append(dot, document.createTextNode(N.getTeamDisplayName(t)));
      N.dom.teamLegend.appendChild(chip);
    }
  }
  N.renderTeamLegend = renderTeamLegend;

  function renderTeamList() {
    if (!N.dom.teamList) return;
    N.dom.teamList.innerHTML = "";

    N.state.players.slice(0, N.state.playerCount).forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "team-row";

      const name = document.createElement("span");
      name.className = "team-row-name";
      name.textContent = N.getPlayerDisplayName(p, i);

      const select = document.createElement("select");
      select.className = "team-select";
      select.dataset.playerId = p.id;
      select.setAttribute("aria-label", `${N.getPlayerDisplayName(p, i)}のチーム`);

      for (let t = 1; t <= N.state.teamCount; t++) {
        const opt = document.createElement("option");
        opt.value = String(t);
        opt.textContent = N.getTeamDisplayName(t);
        if (p.teamId === t) opt.selected = true;
        select.appendChild(opt);
      }
      N.applyTeamColorStyle(select, p.teamId);

      row.append(name, select);
      N.dom.teamList.appendChild(row);
    });
  }
  N.renderTeamList = renderTeamList;

  function renderTeamWarning() {
    if (!N.dom.teamWarning) return;
    const counts = {};
    N.state.players.slice(0, N.state.playerCount).forEach((p) => {
      counts[p.teamId] = (counts[p.teamId] || 0) + 1;
    });
    const vals = Object.values(counts);
    const uneven = vals.length > 1 && new Set(vals).size > 1;
    N.dom.teamWarning.hidden = !uneven;
    if (uneven) {
      N.dom.teamWarning.textContent =
        "チーム人数が不均等です。平均点方式の利用を推奨します。";
    }
  }

  function renderSettlementPreset() {
    N.dom.presetGroup?.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.preset === N.state.settings.settlementPreset
      );
    });
    const isCustom = N.state.settings.settlementPreset === "custom";
    if (N.dom.settlementCustom) N.dom.settlementCustom.hidden = !isCustom;
  }
  N.renderSettlementPreset = renderSettlementPreset;

  function renderSettlementPairs() {
    if (!N.dom.settlementList) return;
    if (N.state.settings.settlementPreset !== "custom") {
      N.dom.settlementList.innerHTML = "";
      return;
    }

    N.dom.settlementList.innerHTML = "";
    const pairs = N.state.settings.settlementPairs || [];

    pairs.forEach((pair, index) => {
      const wrap = document.createElement("div");
      wrap.className = "settlement-pair";
      wrap.dataset.index = String(index);

      const row1 = document.createElement("div");
      row1.className = "settlement-pair-row";
      row1.append(
        createRankSelect("fromRank", pair.fromRank),
        createArrow(),
        createRankSelect("toRank", pair.toRank),
        createRemoveBtn(index)
      );
      wrap.appendChild(row1);

      const row2 = document.createElement("div");
      row2.className = "settlement-pair-row";
      row2.append(
        createTeamSelect("fromTeamId", pair.fromTeamId, "支払うチーム（任意）"),
        createTeamSelect("toTeamId", pair.toTeamId, "受取チーム（任意）")
      );
      wrap.appendChild(row2);
      N.dom.settlementList.appendChild(wrap);
    });
  }
  N.renderSettlementPairs = renderSettlementPairs;

  function createArrow() {
    const arrow = document.createElement("span");
    arrow.className = "settlement-arrow";
    arrow.textContent = "→";
    return arrow;
  }

  function createRemoveBtn(index) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-remove-pair";
    btn.textContent = "×";
    btn.dataset.index = String(index);
    btn.setAttribute("aria-label", "ペアを削除");
    return btn;
  }

  function createRankSelect(field, value) {
    const sel = document.createElement("select");
    sel.className = "settlement-select";
    sel.dataset.field = field;
    for (let r = 1; r <= N.state.teamCount; r++) {
      const opt = document.createElement("option");
      opt.value = String(r);
      opt.textContent = `${r}位`;
      if (r === value) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function createTeamSelect(field, value, label) {
    const sel = document.createElement("select");
    sel.className = "settlement-select";
    sel.dataset.field = field;
    sel.setAttribute("aria-label", label);
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "全チーム（同順位）";
    sel.appendChild(allOpt);
    for (let t = 1; t <= N.state.teamCount; t++) {
      const opt = document.createElement("option");
      opt.value = String(t);
      opt.textContent = N.getTeamDisplayName(t);
      if (value === t) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function renderSettingsInputs() {
    if (N.dom.pricePerPin) {
      N.dom.pricePerPin.value = N.state.settings.pricePerPin;
    }
    const calcEl = document.querySelector(
      `input[name="calcMethod"][value="${N.state.settings.calcMethod}"]`
    );
    if (calcEl) calcEl.checked = true;
    const roundEl = document.querySelector(
      `input[name="rounding"][value="${N.state.settings.rounding}"]`
    );
    if (roundEl) roundEl.checked = true;
    const remEl = document.querySelector(
      `input[name="remainderAdjust"][value="${N.state.settings.remainderAdjust}"]`
    );
    if (remEl) remEl.checked = true;
    if (N.dom.representativeField) {
      N.dom.representativeField.hidden =
        N.state.settings.remainderAdjust !== "representative";
    }
  }

  function renderRepresentativeSelect() {
    if (!N.dom.remainderRep) return;
    N.dom.remainderRep.innerHTML = "";
    N.state.players.slice(0, N.state.playerCount).forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = N.getPlayerDisplayName(p, i);
      if (p.id === N.state.settings.remainderRepId) opt.selected = true;
      N.dom.remainderRep.appendChild(opt);
    });
    if (!N.state.settings.remainderRepId && N.state.players[0]) {
      N.state.settings.remainderRepId = N.state.players[0].id;
    }
  }

  // ========================================
  // ルーレット UI
  // ========================================
  function renderRoulette() {
    renderRoulettePresets();
    renderRoulettePresetName();
    renderRouletteOptions();
    renderRouletteProbabilities();
    renderRouletteDisplay();
  }

  function renderRoulettePresetName() {
    if (!N.dom.roulettePresetName) return;
    const preset = N.Roulette.getActivePreset();
    N.dom.roulettePresetName.value = preset.name || "";
  }

  function renderRoulettePresets() {
    if (!N.dom.roulettePresetTabs) return;
    N.dom.roulettePresetTabs.innerHTML = "";
    const rs = N.Roulette.getState();
    rs.presets.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "roulette-preset-tab";
      btn.dataset.presetId = String(preset.id);
      btn.textContent = preset.name;
      if (preset.id === rs.activePresetId) btn.classList.add("active");
      N.dom.roulettePresetTabs.appendChild(btn);
    });
  }

  function renderRouletteOptions() {
    if (!N.dom.rouletteOptionsList) return;
    N.dom.rouletteOptionsList.innerHTML = "";
    const preset = N.Roulette.getActivePreset();

    preset.options.forEach((opt, index) => {
      const row = document.createElement("div");
      row.className = "roulette-option-row";
      row.dataset.index = String(index);

      const amountInput = document.createElement("input");
      amountInput.type = "number";
      amountInput.className = "input roulette-amount-input";
      amountInput.value = String(opt.amount);
      amountInput.min = "1";
      amountInput.inputMode = "numeric";
      amountInput.setAttribute("aria-label", "金額");

      const weightInput = document.createElement("input");
      weightInput.type = "number";
      weightInput.className = "input roulette-weight-input";
      weightInput.value = String(opt.weight);
      weightInput.min = "1";
      weightInput.inputMode = "numeric";
      weightInput.setAttribute("aria-label", "重み");

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-remove-pair roulette-remove-btn";
      removeBtn.textContent = "×";
      removeBtn.dataset.index = String(index);
      removeBtn.setAttribute("aria-label", "オプションを削除");

      row.append(amountInput, weightInput, removeBtn);
      N.dom.rouletteOptionsList.appendChild(row);
    });
  }

  function renderRouletteProbabilities() {
    if (!N.dom.rouletteProbabilities) return;
    const preset = N.Roulette.getActivePreset();
    const probs = N.Roulette.getProbabilities(preset.options);
    N.dom.rouletteProbabilities.innerHTML = "";

    probs.forEach((p) => {
      const row = document.createElement("div");
      row.className = "roulette-prob-row";
      row.innerHTML = `
        <span class="roulette-prob-amount">${p.amount}円</span>
        <span class="roulette-prob-bar-wrap">
          <span class="roulette-prob-bar" style="width:${p.probability}%"></span>
        </span>
        <span class="roulette-prob-pct">${p.probability.toFixed(1)}%</span>
      `;
      N.dom.rouletteProbabilities.appendChild(row);
    });
  }

  function renderRouletteDisplay() {
    if (!N.dom.rouletteDisplay) return;
    const rs = N.Roulette.getState();
    const amount = rs.lastSpinResult
      ? rs.lastSpinResult.amount
      : N.state.settings.pricePerPin;
    N.dom.rouletteDisplay.textContent = `1ピン＝${amount}円`;
  }
  N.renderRouletteDisplay = renderRouletteDisplay;

  function syncRouletteFromDom() {
    const preset = N.Roulette.getActivePreset();
    const rows = N.dom.rouletteOptionsList?.querySelectorAll(".roulette-option-row");
    if (!rows) return;
    const options = [];
    rows.forEach((row) => {
      const amount = parseInt(
        row.querySelector(".roulette-amount-input")?.value,
        10
      );
      const weight = parseInt(
        row.querySelector(".roulette-weight-input")?.value,
        10
      );
      options.push({ amount, weight });
    });
    const result = N.Roulette.updatePresetOptions(preset.id, options);
    if (result.error) {
      N.showStatus(result.error, "error");
      return;
    }
    renderRouletteProbabilities();
  }

  // ========================================
  // 結果レンダリング
  // ========================================
  function renderResult(result) {
    if (!N.dom.resultSection) return;
    N.dom.resultSection.hidden = false;

    if (N.dom.resultScopeLabel) {
      N.dom.resultScopeLabel.textContent = `第${N.state.currentGame}ゲーム · 今回のスコアで精算 · 単価 ${result.pricePerPin || N.state.settings.pricePerPin}円/ピン`;
    }

    if (N.dom.resultWarnings) {
      N.dom.resultWarnings.hidden = !result.warnings?.length;
      if (result.warnings?.length) {
        N.dom.resultWarnings.textContent = result.warnings.join(" ");
      }
    }

    renderRankingCards(result);
    renderTeamSummary(result);
    renderSettlementSummary(result);
    renderBalanceDisplay(result);
    renderPayments(result);
    N.lastResultText = N.buildResultText(result);
    N.state.lastResult = result;
  }

  function getRankCardClass(rank) {
    if (rank === 1) return "rank-gold";
    if (rank === 2) return "rank-silver";
    if (rank === 3) return "rank-bronze";
    return "rank-gray";
  }

  function renderRankingCards(result) {
    if (!N.dom.rankingTable) return;
    N.dom.rankingTable.innerHTML = "";

    const container = document.createElement("div");
    container.className = "ranking-cards";

    const sorted = [...result.rankedTeams].sort((a, b) => a.rank - b.rank);
    sorted.forEach((t) => {
      const card = document.createElement("div");
      card.className = `ranking-card ${getRankCardClass(t.rank)}`;
      N.applyTeamColorStyle(card, t.id);

      const rankLabel = document.createElement("div");
      rankLabel.className = "ranking-card-rank";
      rankLabel.textContent = N.formatRankLabel(t.rank, t.tied);

      const name = document.createElement("div");
      name.className = "ranking-card-name";
      name.textContent = t.name;

      const formula = document.createElement("div");
      formula.className = "ranking-card-formula";
      formula.textContent = t.formula || `${t.total} · 平均${N.formatScore(t.average)}`;

      const meta = document.createElement("div");
      meta.className = "ranking-card-meta";
      meta.textContent = `${t.members.length}人 · 合計 ${t.total}`;

      card.append(rankLabel, name, formula, meta);
      container.appendChild(card);
    });

    N.dom.rankingTable.appendChild(container);
  }

  function renderTeamSummary(result) {
    if (!N.dom.teamSummary) return;
    N.dom.teamSummary.innerHTML = "";
    const label = result.calcMethod === "average" ? "平均" : "合計";

    result.pairDetails.forEach((d) => {
      if (d.skipped) return;
      const div = document.createElement("div");
      div.className = "team-summary-item";
      const teamId = d.fromTeams?.[0]?.id || 1;
      N.applyTeamColorStyle(div, teamId);

      const name = document.createElement("div");
      name.className = "team-summary-name";
      name.textContent = `${N.formatRankLabel(d.fromRank, false)} → ${N.formatRankLabel(d.toRank, false)}`;

      const detail = document.createElement("div");
      detail.className = "team-summary-detail";
      detail.textContent = `${label}差 ${N.formatScore(d.diff)} ピン × ${result.pricePerPin || N.state.settings.pricePerPin}円 = ${N.formatYenAbs(d.pairAmount)}`;

      div.append(name, detail);
      N.dom.teamSummary.appendChild(div);
    });

    if (!result.pairDetails.some((d) => !d.skipped)) {
      const p = document.createElement("p");
      p.className = "section-hint";
      p.textContent = "差額計算の対象となる差がありません（同点等）";
      N.dom.teamSummary.appendChild(p);
    }
  }

  function renderSettlementSummary(result) {
    if (!N.dom.settlementSummary) return;
    N.dom.settlementSummary.innerHTML = "";

    if (result.isDraw) {
      N.dom.settlementSummary.innerHTML =
        '<div class="result-row highlight"><span class="result-label">精算総額</span><span class="result-value">精算なし</span></div>';
      return;
    }

    const rows = [
      ["処理前精算総額", N.formatYenAbs(result.rawTotal)],
      ["端数切り捨て", N.formatYenAbs(result.trimmed)],
      ["最終精算総額", N.formatYenAbs(result.finalTotal)],
      ["送金回数", `${result.payments.length} 回`],
    ];

    rows.forEach(([label, value], i) => {
      const row = document.createElement("div");
      row.className = "result-row" + (i === 2 ? " highlight" : "");
      row.innerHTML = `<span class="result-label">${label}</span><span class="result-value">${value}</span>`;
      N.dom.settlementSummary.appendChild(row);
    });
  }

  function renderBalanceDisplay(result) {
    if (!N.dom.balanceDisplay) return;
    N.dom.balanceDisplay.innerHTML = "";

    const title = document.createElement("h3");
    title.className = "result-block-title";
    title.textContent = "個人収支";
    N.dom.balanceDisplay.appendChild(title);

    const list = document.createElement("div");
    list.className = "balance-list";

    N.state.players.slice(0, N.state.playerCount).forEach((p, i) => {
      const gameBal = result.playerBalances?.get(p.id) || 0;
      p.gameBalance = gameBal;

      const row = document.createElement("div");
      row.className = "balance-row";
      const stats = N.getPlayerStats(p);

      const name = document.createElement("span");
      name.className = "balance-name";
      name.textContent = N.getPlayerDisplayName(p, i);

      const game = document.createElement("span");
      game.className = "balance-game" + (gameBal > 0 ? " positive" : gameBal < 0 ? " negative" : "");
      game.textContent = `今回 ${N.formatYen(gameBal)}`;

      const cumulativePreview =
        (stats.cumulativeBalance || 0) + gameBal;
      const cum = document.createElement("span");
      cum.className =
        "balance-cum" +
        (cumulativePreview > 0
          ? " positive"
          : cumulativePreview < 0
            ? " negative"
            : "");
      cum.textContent = `累計 ${N.formatYen(cumulativePreview)}`;

      row.append(name, game, cum);
      list.appendChild(row);
    });

    N.dom.balanceDisplay.appendChild(list);
  }

  function renderPayments(result) {
    if (!N.dom.paymentList) return;
    N.dom.paymentList.innerHTML = "";

    if (!result.payments.length) {
      const li = document.createElement("li");
      li.className = "payment-item";
      li.textContent = "支払いはありません";
      N.dom.paymentList.appendChild(li);
      return;
    }

    result.payments.forEach((pay) => {
      const fromP = N.getPlayerById(pay.fromId);
      const toP = N.getPlayerById(pay.toId);
      const fromIdx = N.state.players.indexOf(fromP);
      const toIdx = N.state.players.indexOf(toP);
      const fromName = fromP ? N.getPlayerDisplayName(fromP, fromIdx) : "?";
      const toName = toP ? N.getPlayerDisplayName(toP, toIdx) : "?";

      const li = document.createElement("li");
      li.className = "payment-item";

      const route = document.createElement("div");
      route.className = "payment-route";
      route.textContent = `${fromName} → ${toName}`;

      const amount = document.createElement("div");
      amount.className = "payment-amount";
      amount.textContent = N.formatYenAbs(pay.amount);

      li.append(route, amount);
      N.dom.paymentList.appendChild(li);
    });
  }

  // ========================================
  // ステータス・コピー・共有
  // ========================================
  function showStatus(msg, type) {
    if (!N.dom.statusMessage) return;
    N.dom.statusMessage.textContent = msg;
    N.dom.statusMessage.hidden = false;
    N.dom.statusMessage.className = "status-message is-" + type;
    setTimeout(() => {
      N.dom.statusMessage.hidden = true;
    }, 3000);
  }
  N.showStatus = showStatus;

  async function copyResult() {
    if (!N.lastResultText) return false;
    try {
      await navigator.clipboard.writeText(N.lastResultText);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = N.lastResultText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }

  async function shareResult() {
    if (!N.lastResultText) {
      showStatus("先に計算を実行してください", "error");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: "ボウリング精算・差額計算結果",
          text: N.lastResultText,
        });
        showStatus("共有しました", "success");
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    const ok = await copyResult();
    showStatus(
      ok ? "結果をコピーしました" : "共有できませんでした。結果をコピーしてください",
      ok ? "success" : "error"
    );
  }

  // ========================================
  // プレイヤー名変更
  // ========================================
  function syncPlayerNameFromInput(nameInput) {
    const row = nameInput.closest(".player-row");
    if (!row) return null;
    const player = N.getPlayerById(row.dataset.id);
    if (player) player.name = nameInput.value;
    return player;
  }

  function patchResultPlayerNames(result) {
    if (!result?.rankedTeams) return;
    result.rankedTeams.forEach((team) => {
      team.name = N.getTeamDisplayName(team.id);
      team.members?.forEach((m) => {
        const p = N.getPlayerById(m.id);
        if (p) {
          const idx = N.state.players.indexOf(p);
          m.name = N.getPlayerDisplayName(p, idx >= 0 ? idx : 0);
        }
      });
      if (team.scoreParts?.length) {
        team.formula = N.buildTeamFormula(
          team.scoreParts,
          team.total,
          team.average
        );
      }
    });
    if (result.winnerTeamId) {
      result.winnerTeamName = N.getTeamDisplayName(result.winnerTeamId);
    }
  }

  function refreshResultAfterNameChange() {
    if (!N.state.lastResult) return;
    syncFromDom(false);

    const recalc = N.runCalculation();
    if (!recalc.error) {
      N.previewGameBalances(recalc.playerBalances);
      N.state.lastResult = recalc;
      N.lastResultText = N.buildResultText(recalc);
      renderResult(recalc);
      return;
    }

    patchResultPlayerNames(N.state.lastResult);
    N.lastResultText = N.buildResultText(N.state.lastResult);
    renderResult(N.state.lastResult);
  }

  function onPlayerNamesUpdated() {
    N.updateAutoTeamNames();
    renderTeamNames();
    renderTeamLegend();
    renderTeamList();
    renderRepresentativeSelect();
    refreshResultAfterNameChange();
    N.scheduleSave();
  }

  function handlePlayerNameInput(e) {
    const nameInput = e.target.closest(".player-name");
    if (!nameInput) return;
    syncPlayerNameFromInput(nameInput);
    onPlayerNamesUpdated();
  }

  // ========================================
  // 計算ハンドラ
  // ========================================
  function handleCalculate() {
    if (N.isCalculating) return;
    N.isCalculating = true;
    if (N.dom.calculateBtn) N.dom.calculateBtn.disabled = true;

    clearErrors();
    syncFromDom(false);

    const result = N.runCalculation();

    if (result.error) {
      showStatus(result.error, "error");
      showCalcError(result);
      N.isCalculating = false;
      if (N.dom.calculateBtn) N.dom.calculateBtn.disabled = false;
      return;
    }

    N.previewGameBalances(result.playerBalances);
    renderResult(result);
    N.scheduleSave();
    N.dom.resultSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    N.isCalculating = false;
    if (N.dom.calculateBtn) N.dom.calculateBtn.disabled = false;
  }

  function clearErrors() {
    document.querySelectorAll(".input-error").forEach((el) => {
      el.classList.remove("input-error");
    });
  }

  function showCalcError(result) {
    if (result.scoreErrors) {
      result.scoreErrors.forEach((err) => {
        const row = N.dom.playerList?.querySelectorAll(".player-row")[err.index];
        const scoreEl = row?.querySelector(".player-score");
        if (scoreEl) scoreEl.classList.add("input-error");
      });
    }
  }

  // ========================================
  // イベント
  // ========================================
  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    const dom = N.dom;

    dom.playerCountUp?.addEventListener("click", () =>
      N.setPlayerCount(N.state.playerCount + 1)
    );
    dom.playerCountDown?.addEventListener("click", () =>
      N.setPlayerCount(N.state.playerCount - 1)
    );
    dom.playerCount?.addEventListener("change", (e) =>
      N.setPlayerCount(parseInt(e.target.value, 10))
    );

    dom.teamCountUp?.addEventListener("click", () =>
      N.setTeamCount(N.state.teamCount + 1)
    );
    dom.teamCountDown?.addEventListener("click", () =>
      N.setTeamCount(N.state.teamCount - 1)
    );
    dom.teamCount?.addEventListener("change", (e) =>
      N.setTeamCount(parseInt(e.target.value, 10))
    );

    dom.calculateBtn?.addEventListener("click", handleCalculate);
    dom.copyBtn?.addEventListener("click", async () => {
      const ok = await copyResult();
      if (dom.copyFeedback) {
        dom.copyFeedback.hidden = !ok;
        if (ok) setTimeout(() => { dom.copyFeedback.hidden = true; }, 2000);
      }
      showStatus(
        ok ? "結果をコピーしました" : "コピーできませんでした",
        ok ? "success" : "error"
      );
    });
    dom.shareBtn?.addEventListener("click", shareResult);
    dom.nextGameBtn?.addEventListener("click", N.handleNextGame);
    dom.deleteCurrentGameBtn?.addEventListener("click", N.handleDeleteCurrentGame);
    dom.prevGameBtn?.addEventListener("click", N.handlePrevGame);
    dom.endSessionBtn?.addEventListener("click", N.handleEndSession);

    dom.historyBtn?.addEventListener("click", () => {
      N.renderHistoryList();
      dom.historyModal?.showModal();
    });
    dom.historyModalClose?.addEventListener("click", () =>
      dom.historyModal?.close()
    );
    dom.historyDetailClose?.addEventListener("click", () =>
      dom.historyDetailModal?.close()
    );
    dom.resetHistoryBtn?.addEventListener("click", N.handleResetHistory);
    dom.resetAllBtn?.addEventListener("click", N.resetAllData);

    dom.sessionSummaryClose?.addEventListener("click", () =>
      dom.sessionSummaryModal?.close()
    );
    dom.rateChoiceReuse?.addEventListener("click", N.handleRateChoiceReuse);
    dom.rateChoiceSpin?.addEventListener("click", N.handleRateChoiceSpin);
    dom.rateChoiceClose?.addEventListener("click", () =>
      dom.rateChoiceModal?.close()
    );

    dom.addSettlementPair?.addEventListener("click", () => {
      N.state.settings.settlementPairs.push({
        fromRank: N.state.teamCount,
        toRank: 1,
        fromTeamId: null,
        toTeamId: null,
      });
      N.state.settings.settlementPreset = "custom";
      renderSettlementPreset();
      renderSettlementPairs();
      N.scheduleSave();
    });

    dom.settlementList?.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-remove-pair");
      if (!btn) return;
      const idx = parseInt(btn.dataset.index, 10);
      N.state.settings.settlementPairs.splice(idx, 1);
      renderSettlementPairs();
      N.scheduleSave();
    });

    dom.settlementList?.addEventListener("change", (e) => {
      const sel = e.target.closest(".settlement-select");
      if (!sel) return;
      const wrap = sel.closest(".settlement-pair");
      const idx = parseInt(wrap.dataset.index, 10);
      const field = sel.dataset.field;
      const val = sel.value === "" ? null : parseInt(sel.value, 10);
      N.state.settings.settlementPairs[idx][field] = val;
      N.state.settings.settlementPreset = "custom";
      N.scheduleSave();
    });

    dom.presetGroup?.addEventListener("click", (e) => {
      const btn = e.target.closest(".preset-btn");
      if (!btn) return;
      N.applyPreset(btn.dataset.preset);
    });

    document.addEventListener("change", (e) => {
      if (
        e.target.matches(
          'input[name="calcMethod"], input[name="rounding"], input[name="remainderAdjust"]'
        )
      ) {
        syncFromDom();
        renderSettingsInputs();
        renderRepresentativeSelect();
      }
    });

    dom.playerList?.addEventListener("input", (e) => {
      if (e.target.classList.contains("player-name")) {
        handlePlayerNameInput(e);
        return;
      }
      N.scheduleSave();
    });

    dom.playerList?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const score = e.target.closest(".player-score");
      if (!score) return;
      e.preventDefault();
      const rows = [...dom.playerList.querySelectorAll(".player-score")];
      const idx = rows.indexOf(score);
      if (idx >= 0 && idx < rows.length - 1) rows[idx + 1].focus();
    });

    dom.teamList?.addEventListener("change", (e) => {
      if (!e.target.classList.contains("team-select")) return;
      const p = N.getPlayerById(e.target.dataset.playerId);
      if (p) {
        p.teamId = parseInt(e.target.value, 10);
        N.applyTeamColorStyle(e.target, p.teamId);
        N.onTeamAssignmentChanged();
        renderPlayers();
        renderTeamWarning();
      }
    });

    dom.teamNames?.addEventListener("input", (e) => {
      if (e.target.classList.contains("team-name-input")) {
        const teamId = parseInt(e.target.dataset.teamId, 10);
        N.markTeamManualName(teamId);
        const team = N.getTeamById(teamId);
        if (team) team.name = e.target.value;
        renderTeamLegend();
        renderTeamList();
        refreshResultAfterNameChange();
        N.scheduleSave();
      }
    });

    dom.teamNames?.addEventListener("click", (e) => {
      const resetBtn = e.target.closest(".team-name-reset");
      if (!resetBtn) return;
      const teamId = parseInt(resetBtn.dataset.teamId, 10);
      N.resetTeamAutoName(teamId);
      renderTeamNames();
      renderTeamLegend();
      renderTeamList();
      refreshResultAfterNameChange();
      N.scheduleSave();
    });

    ["pricePerPin", "remainderRep"].forEach((id) => {
      dom[id]?.addEventListener("change", () => syncFromDom());
    });

    dom.rouletteSpinBtn?.addEventListener("click", () => {
      N.Roulette.animateSpin((result) => {
        if (result.error) {
          showStatus(result.error, "error");
          return;
        }
        showStatus(`ルーレット結果: ${result.amount}円`, "success");
        renderRouletteDisplay();
        renderRouletteProbabilities();
      });
    });

    dom.roulettePresetTabs?.addEventListener("click", (e) => {
      const btn = e.target.closest(".roulette-preset-tab");
      if (!btn) return;
      syncRouletteFromDom();
      N.Roulette.setActivePreset(parseInt(btn.dataset.presetId, 10));
      renderRoulette();
    });

    dom.roulettePresetName?.addEventListener("change", () => {
      const preset = N.Roulette.getActivePreset();
      const result = N.Roulette.updatePresetName(
        preset.id,
        dom.roulettePresetName.value
      );
      if (result.error) {
        showStatus(result.error, "error");
        renderRoulettePresetName();
        return;
      }
      renderRoulettePresets();
    });

    dom.rouletteAddOption?.addEventListener("click", () => {
      syncRouletteFromDom();
      const preset = N.Roulette.getActivePreset();
      N.Roulette.addPresetOption(preset.id);
      renderRouletteOptions();
      renderRouletteProbabilities();
    });

    dom.rouletteOptionsList?.addEventListener("click", (e) => {
      const btn = e.target.closest(".roulette-remove-btn");
      if (!btn) return;
      syncRouletteFromDom();
      const preset = N.Roulette.getActivePreset();
      N.Roulette.removePresetOption(preset.id, parseInt(btn.dataset.index, 10));
      renderRouletteOptions();
      renderRouletteProbabilities();
    });

    dom.rouletteOptionsList?.addEventListener("change", () => {
      syncRouletteFromDom();
    });

    window.addEventListener("beforeunload", () => syncFromDom(false));
  }
  N.bindEvents = bindEvents;
})(window);
