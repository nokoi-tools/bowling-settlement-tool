/**
 * Nokoi Tools - ボウリング精算・差額計算ツール v1.0
 * 差額・精算金額の計算支援ツール
 */
(function () {
  "use strict";

  // ========================================
  // 定数
  // ========================================
  const STORAGE_KEY = "nokoi-bowling-v1";
  const STORAGE_VERSION = 1;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 20;
  const MIN_TEAMS = 2;
  const MAX_TEAMS = 20;
  const MIN_SCORE = 0;
  const MAX_SCORE = 300;
  const DEFAULT_PRICE = 100;

  const PRESET_COLORS = [
    { color: "#0071e3", bg: "#e8f2ff" },
    { color: "#34c759", bg: "#e8f8ec" },
    { color: "#ff3b30", bg: "#ffeceb" },
    { color: "#ff9500", bg: "#fff4e8" },
    { color: "#af52de", bg: "#f3ecff" },
    { color: "#5ac8fa", bg: "#e8f7fd" },
    { color: "#ff2d55", bg: "#ffe8ed" },
    { color: "#5856d6", bg: "#ededfc" },
  ];

  // ========================================
  // 状態（単一オブジェクト）
  // idCounter は createDefaultState() → genId() より先に初期化する
  // ========================================
  let idCounter = 0;
  let state = createDefaultState();
  let lastResultText = "";
  let isCalculating = false;
  let saveTimer = null;

  // ========================================
  // DOM（null安全）
  // ========================================
  const $ = (id) => document.getElementById(id);
  const dom = {};

  function cacheDom() {
    const ids = [
      "currentGameDisplay", "gameHint", "gameBar", "statusMessage",
      "playerCount", "playerCountUp", "playerCountDown", "playerList",
      "teamCount", "teamCountUp", "teamCountDown", "teamNames", "teamLegend",
      "teamList", "teamWarning", "cumulativeOptions", "includeCurrentGame",
      "completedGamesCount", "cumulativeHint", "presetGroup", "settlementList",
      "addSettlementPair", "settlementCustom", "pricePerPin", "remainderRep",
      "representativeField", "resultSection", "resultScopeLabel", "resultWarnings",
      "rankingTable", "teamSummary", "settlementSummary", "paymentList",
      "copyBtn", "shareBtn", "nextGameBtn", "deleteCurrentGameBtn", "copyFeedback",
      "calculateBtn", "historyBtn", "prevGameBtn", "historyModal", "historyModalClose",
      "historyList", "resetHistoryBtn",       "historyDetailModal", "historyDetailClose", "historyDetailTitle",
      "historyDetailBody", "resetAllBtn",
    ];
    ids.forEach((id) => { dom[id] = $(id); });
  }

  // ========================================
  // ユーティリティ
  // ========================================
  function genId(prefix) {
    idCounter += 1;
    return `${prefix}_${Date.now()}_${idCounter}`;
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function defaultPlayerName(i) {
    return `プレイヤー${i + 1}`;
  }

  function defaultTeamName(id) {
    return `チーム${id}`;
  }

  function formatYen(n) {
    return "¥" + Math.round(n).toLocaleString("ja-JP");
  }

  function formatScore(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function formatRankLabel(rank, tied) {
    return tied ? `${rank}位タイ` : `${rank}位`;
  }

  function getTeamColor(teamId) {
    if (teamId <= PRESET_COLORS.length) {
      const c = PRESET_COLORS[teamId - 1];
      return { color: c.color, bg: c.bg };
    }
    const hue = ((teamId - 1) * 137.508) % 360;
    return {
      color: `hsl(${hue}, 55%, 42%)`,
      bg: `hsl(${hue}, 55%, 94%)`,
    };
  }

  function applyTeamColorStyle(el, teamId) {
    if (!el || !teamId) return;
    const { color, bg } = getTeamColor(teamId);
    el.style.setProperty("--team-color", color);
    el.style.setProperty("--team-bg", bg);
    el.classList.add("has-team-color");
  }

  function getPlayerById(id) {
    return state.players.find((p) => p.id === id);
  }

  function getPlayerDisplayName(p, index) {
    const name = (p.name || "").trim();
    return name || defaultPlayerName(index);
  }

  function getTeamById(id) {
    return state.teams.find((t) => t.id === id);
  }

  function getTeamDisplayName(teamId) {
    const t = getTeamById(teamId);
    return (t?.name || "").trim() || defaultTeamName(teamId);
  }

  // ========================================
  // デフォルト状態
  // ========================================
  function createDefaultState() {
    const players = [];
    const teams = [{ id: 1, name: "チーム1" }, { id: 2, name: "チーム2" }];
    for (let i = 0; i < 4; i++) {
      players.push({
        id: genId("p"),
        name: defaultPlayerName(i),
        teamId: (i % 2) + 1,
        currentScore: "",
        cumulativeScore: 0,
      });
    }
    return {
      version: STORAGE_VERSION,
      playerCount: 4,
      teamCount: 2,
      currentGame: 1,
      players,
      teams,
      gameHistory: [],
      settings: {
        pricePerPin: DEFAULT_PRICE,
        calcMethod: "total",
        scoreScope: "current",
        includeCurrentInCumulative: true,
        settlementPreset: "custom",
        settlementPairs: [{ fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null }],
        rounding: "none",
        remainderAdjust: "representative",
        remainderRepId: null,
      },
      lastResult: null,
    };
  }

  // ========================================
  // LocalStorage
  // ========================================
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 300);
  }

  function saveState() {
    try {
      syncFromDom(false);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("保存に失敗:", e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || data.version !== STORAGE_VERSION) return;
      if (!Array.isArray(data.players) || !Array.isArray(data.teams)) return;

      // 壊れたデータを安全に正規化
      data.players = data.players
        .filter((p) => p && p.id)
        .map((p, i) => ({
          id: String(p.id),
          name: String(p.name ?? defaultPlayerName(i)),
          teamId: clamp(Number(p.teamId) || 1, 1, MAX_TEAMS),
          currentScore: p.currentScore === undefined || p.currentScore === null ? "" : String(p.currentScore),
          cumulativeScore: Math.max(0, Number(p.cumulativeScore) || 0),
        }));

      if (data.players.length < MIN_PLAYERS) return;

      data.teams = data.teams
        .filter((t) => t && t.id)
        .map((t) => ({ id: Number(t.id), name: String(t.name ?? defaultTeamName(t.id)) }));

      if (data.teams.length < MIN_TEAMS) return;

      state = data;
      if (!state.settings || typeof state.settings !== "object") {
        state.settings = createDefaultState().settings;
      }
      if (!Array.isArray(state.gameHistory)) state.gameHistory = [];
      state.playerCount = clamp(state.playerCount || state.players.length, MIN_PLAYERS, MAX_PLAYERS);
      state.teamCount = clamp(state.teamCount || 2, MIN_TEAMS, state.playerCount);
      state.currentGame = Math.max(1, Number(state.currentGame) || 1);
    } catch (e) {
      console.warn("復元に失敗、初期値を使用:", e);
      state = createDefaultState();
    }
  }

  function resetAllData() {
    if (!confirm("すべてのデータをリセットします。よろしいですか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = createDefaultState();
    renderAll();
    showStatus("データをリセットしました", "success");
  }

  // ========================================
  // スコア取得
  // ========================================
  function getEffectiveScores() {
    return state.players.slice(0, state.playerCount).map((p) => {
      const current = p.currentScore === "" ? 0 : parseInt(p.currentScore, 10);
      if (state.settings.scoreScope === "current") {
        return isNaN(current) ? NaN : current;
      }
      let total = p.cumulativeScore || 0;
      if (state.settings.includeCurrentInCumulative && p.currentScore !== "") {
        if (!isNaN(current)) total += current;
      }
      return total;
    });
  }

  function validateScores(requireCurrent) {
    const errors = [];
    state.players.slice(0, state.playerCount).forEach((p, i) => {
      if (p.currentScore === "") {
        if (requireCurrent) {
          errors.push({ index: i, message: `${getPlayerDisplayName(p, i)}のスコアを入力してください` });
        }
        return;
      }
      const s = parseInt(p.currentScore, 10);
      if (isNaN(s) || s < MIN_SCORE || s > MAX_SCORE) {
        errors.push({ index: i, message: `${getPlayerDisplayName(p, i)}のスコアは${MIN_SCORE}〜${MAX_SCORE}で入力してください` });
      }
    });
    return errors;
  }

  /** 今回スコアの入力が必要か */
  function needsCurrentScores() {
    if (state.settings.scoreScope === "current") return true;
    return state.settings.includeCurrentInCumulative;
  }

  // ========================================
  // 精算プリセット
  // ========================================
  function buildPresetPairs(preset, teamCount) {
    const pairs = [];
    if (teamCount < 2) return pairs;

    // 2チームは常に 2位→1位
    if (teamCount === 2) {
      pairs.push({ fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null });
      return pairs;
    }
    if (preset === "first-last") {
      pairs.push({ fromRank: teamCount, toRank: 1, fromTeamId: null, toTeamId: null });
      return pairs;
    }
    if (preset === "half-half") {
      const half = Math.floor(teamCount / 2);
      for (let i = 0; i < half; i++) {
        pairs.push({
          fromRank: teamCount - i,
          toRank: i + 1,
          fromTeamId: null,
          toTeamId: null,
        });
      }
      return pairs;
    }
    if (preset === "sequential") {
      for (let r = teamCount; r > 1; r--) {
        pairs.push({ fromRank: r, toRank: r - 1, fromTeamId: null, toTeamId: null });
      }
      return pairs;
    }
    return state.settings.settlementPairs || [];
  }

  function validateSettlementPairs(pairs, rankGroups) {
    if (!pairs.length) return "精算ペアを1つ以上設定してください。";
    const seen = new Set();
    for (const p of pairs) {
      if (p.fromRank <= p.toRank) {
        return "精算ペアは下位 → 上位で設定してください。";
      }
      if (p.fromRank === p.toRank) return "同じ順位同士のペアは設定できません。";
      const key = `${p.fromRank}-${p.toRank}-${p.fromTeamId || "all"}-${p.toTeamId || "all"}`;
      if (seen.has(key)) return "重複した精算ペアがあります。";
      seen.add(key);
      const fromTeams = getTeamsAtRank(rankGroups, p.fromRank, p.fromTeamId);
      const toTeams = getTeamsAtRank(rankGroups, p.toRank, p.toTeamId);
      if (!fromTeams.length || !toTeams.length) {
        return `順位 ${p.fromRank} または ${p.toRank} に該当チームがありません。`;
      }
      if (fromTeams.some((ft) => toTeams.some((tt) => ft.id === tt.id))) {
        return "同じチーム同士の精算ペアは設定できません。";
      }
    }
    return null;
  }

  // ========================================
  // 純粋計算関数
  // ========================================
  function buildTeamsData(scores) {
    const teamsMap = {};
    state.teams.forEach((t) => {
      teamsMap[t.id] = {
        id: t.id,
        name: getTeamDisplayName(t.id),
        members: [],
        total: 0,
        average: 0,
      };
    });

    state.players.slice(0, state.playerCount).forEach((p, i) => {
      const team = teamsMap[p.teamId];
      if (!team) return;
      team.members.push({
        id: p.id,
        name: getPlayerDisplayName(p, i),
        score: scores[i],
      });
      team.total += scores[i];
    });

    const teams = Object.values(teamsMap).slice(0, state.teamCount);
    teams.forEach((t) => {
      t.average = t.members.length ? t.total / t.members.length : 0;
    });
    return teams;
  }

  function rankTeams(teams, calcMethod) {
    const key = calcMethod === "average" ? "average" : "total";
    const sorted = [...teams].sort((a, b) => b[key] - a[key]);
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][key] !== sorted[i - 1][key]) rank = i + 1;
      sorted[i].rank = rank;
      sorted[i].metric = sorted[i][key];
      sorted[i].tied = sorted.filter((t) => t.rank === rank).length > 1;
    }
    return sorted;
  }

  function buildRankGroups(rankedTeams) {
    const groups = {};
    rankedTeams.forEach((t) => {
      if (!groups[t.rank]) groups[t.rank] = [];
      groups[t.rank].push(t);
    });
    return groups;
  }

  function getTeamsAtRank(rankGroups, rank, teamId) {
    const teams = rankGroups[rank] || [];
    if (teamId) return teams.filter((t) => t.id === teamId);
    return teams;
  }

  function distributeInteger(totalYen, count) {
    const base = Math.floor(totalYen / count);
    const remainder = totalYen - base * count;
    const amounts = Array(count).fill(base);
    for (let i = 0; i < remainder; i++) amounts[i] += 1;
    return amounts;
  }

  function calculatePairBalances(fromTeams, toTeams, diff, pricePerPin, calcMethod, balances) {
    const pairAmount = Math.round(diff * pricePerPin);
    if (pairAmount <= 0) return { pairAmount: 0, diff: 0 };

    const fromMembers = fromTeams.flatMap((t) => t.members);
    const toMembers = toTeams.flatMap((t) => t.members);
    const payAmounts = distributeInteger(pairAmount, fromMembers.length);
    const recvAmounts = distributeInteger(pairAmount, toMembers.length);

    fromMembers.forEach((m, i) => {
      balances.set(m.id, (balances.get(m.id) || 0) - payAmounts[i]);
    });
    toMembers.forEach((m, i) => {
      balances.set(m.id, (balances.get(m.id) || 0) + recvAmounts[i]);
    });

    return { pairAmount, diff };
  }

  function applyRoundingToBalances(balances, rounding) {
    if (rounding === "none") return { balances, trimmed: 0 };
    const unit = rounding === "1000" ? 1000 : 100;
    let trimmed = 0;
    const rounded = new Map();
    balances.forEach((amt, id) => {
      const sign = amt >= 0 ? 1 : -1;
      const abs = Math.abs(amt);
      const floored = Math.floor(abs / unit) * unit;
      trimmed += abs - floored;
      rounded.set(id, sign * floored);
    });
    return { balances: rounded, trimmed };
  }

  function adjustRemainder(balances, adjust, repId, rankedTeams) {
    const sum = [...balances.values()].reduce((a, b) => a + b, 0);
    if (sum === 0) return balances;

    const diff = -sum;
    const result = new Map(balances);

    if (adjust === "none") return result;

    if (adjust === "representative" && repId && result.has(repId)) {
      result.set(repId, (result.get(repId) || 0) + diff);
      return result;
    }

    const winners = [...result.entries()].filter(([, v]) => v > 0);
    const losers = [...result.entries()].filter(([, v]) => v < 0);
    const targets = adjust === "winner" ? winners : adjust === "loser" ? losers : winners.length ? winners : losers;

    if (!targets.length) {
      const firstId = state.players[0]?.id;
      if (firstId) result.set(firstId, (result.get(firstId) || 0) + diff);
      return result;
    }

    const perPerson = Math.trunc(diff / targets.length);
    let leftover = diff - perPerson * targets.length;
    targets.forEach(([id, val], i) => {
      const add = perPerson + (i < Math.abs(leftover) ? (leftover > 0 ? 1 : -1) : 0);
      result.set(id, val + add);
    });

    return result;
  }

  function verifyBalanceZero(balances) {
    const sum = [...balances.values()].reduce((a, b) => a + b, 0);
    return sum === 0;
  }

  function minimizeTransactions(balances) {
    const creditors = [];
    const debtors = [];
    balances.forEach((amount, id) => {
      if (amount > 0) creditors.push({ id, amount });
      else if (amount < 0) debtors.push({ id, amount: -amount });
    });
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const payments = [];
    let i = 0;
    let j = 0;
    const d = debtors.map((x) => ({ ...x }));
    const c = creditors.map((x) => ({ ...x }));

    while (i < d.length && j < c.length) {
      const pay = Math.min(d[i].amount, c[j].amount);
      if (pay > 0) {
        payments.push({ fromId: d[i].id, toId: c[j].id, amount: pay });
      }
      d[i].amount -= pay;
      c[j].amount -= pay;
      if (d[i].amount === 0) i++;
      if (c[j].amount === 0) j++;
    }
    return payments;
  }

  function runCalculation() {
    const requireCurrent = needsCurrentScores();
    const scoreErrors = validateScores(requireCurrent);
    if (scoreErrors.length) {
      return { error: scoreErrors[0].message, scoreErrors };
    }

    const scores = getEffectiveScores();
    if (state.settings.scoreScope === "cumulative" && state.gameHistory.length === 0 && !requireCurrent) {
      return { error: "累計精算には終了済みゲームが必要です。または「現在入力中を含める」をオンにしてください。" };
    }
    if (scores.some((s) => isNaN(s))) {
      return { error: "スコアを正しく入力してください。", scoreErrors };
    }

    const price = state.settings.pricePerPin;
    if (!price || price <= 0) return { error: "精算単価（1ピンあたりの金額）を正しく入力してください。" };

    const teams = buildTeamsData(scores);
    const emptyTeam = teams.find((t) => t.members.length === 0);
    if (emptyTeam) return { error: "すべてのチームに1人以上必要です。" };

    const calcMethod = state.settings.calcMethod;
    const rankedTeams = rankTeams(teams, calcMethod);
    const rankGroups = buildRankGroups(rankedTeams);

    const preset = state.settings.settlementPreset;
    const pairs =
      preset === "custom"
        ? state.settings.settlementPairs
        : buildPresetPairs(preset, state.teamCount);

    const pairError = validateSettlementPairs(pairs, rankGroups);
    if (pairError) return { error: pairError };

    const metricKey = calcMethod === "average" ? "average" : "total";
    const balances = new Map();
    state.players.slice(0, state.playerCount).forEach((p) => balances.set(p.id, 0));

    const pairDetails = [];
    let rawTotal = 0;

    for (const pair of pairs) {
      const fromTeams = getTeamsAtRank(rankGroups, pair.fromRank, pair.fromTeamId);
      const toTeams = getTeamsAtRank(rankGroups, pair.toRank, pair.toTeamId);
      const fromMetric = fromTeams[0]?.[metricKey] ?? 0;
      const toMetric = toTeams[0]?.[metricKey] ?? 0;
      const diff = toMetric - fromMetric;

      if (diff <= 0) {
        pairDetails.push({
          fromRank: pair.fromRank,
          toRank: pair.toRank,
          fromTeamId: pair.fromTeamId,
          toTeamId: pair.toTeamId,
          diff: 0,
          pairAmount: 0,
          skipped: true,
        });
        continue;
      }

      const { pairAmount } = calculatePairBalances(
        fromTeams, toTeams, diff, price, calcMethod, balances
      );
      rawTotal += pairAmount;
      pairDetails.push({
        fromRank: pair.fromRank,
        toRank: pair.toRank,
        fromTeams,
        toTeams,
        diff,
        pairAmount,
        skipped: false,
      });
    }

    if (rawTotal === 0) {
      return {
        rankedTeams,
        rankGroups,
        pairDetails,
        payments: [],
        rawTotal: 0,
        trimmed: 0,
        finalTotal: 0,
        isDraw: true,
        calcMethod,
        warnings: [],
      };
    }

    const { balances: roundedBalances, trimmed } = applyRoundingToBalances(
      balances,
      state.settings.rounding
    );

    const repId = state.settings.remainderRepId || state.players[0]?.id;
    const adjusted = adjustRemainder(
      roundedBalances,
      state.settings.remainderAdjust,
      repId,
      rankedTeams
    );

    if (!verifyBalanceZero(adjusted)) {
      return { error: "端数調整後に収支が一致しません。設定を見直してください。" };
    }

    const payments = minimizeTransactions(adjusted);
    const finalTotal = payments.reduce((s, p) => s + p.amount, 0);

    const warnings = [];
    const memberCounts = teams.map((t) => t.members.length);
    const uneven = new Set(memberCounts).size > 1;
    if (uneven && calcMethod === "total") {
      warnings.push("チーム人数が不均等です。合計点方式では人数差に注意してください。平均点方式の利用も検討してください。");
    } else if (uneven) {
      warnings.push("チーム人数が不均等です。平均点方式で計算しています。");
    }

    return {
      rankedTeams,
      rankGroups,
      pairDetails,
      payments,
      rawTotal,
      trimmed,
      finalTotal,
      isDraw: false,
      calcMethod,
      warnings,
    };
  }

  // ========================================
  // DOM同期
  // ========================================
  function syncFromDom(save = true) {
    if (dom.playerCount) state.playerCount = clamp(parseInt(dom.playerCount.value, 10) || MIN_PLAYERS, MIN_PLAYERS, MAX_PLAYERS);
    if (dom.teamCount) state.teamCount = clamp(parseInt(dom.teamCount.value, 10) || MIN_TEAMS, MIN_TEAMS, state.playerCount);
    if (dom.pricePerPin) state.settings.pricePerPin = parseInt(dom.pricePerPin.value, 10) || DEFAULT_PRICE;

    const calcEl = document.querySelector('input[name="calcMethod"]:checked');
    if (calcEl) state.settings.calcMethod = calcEl.value;

    const scopeEl = document.querySelector('input[name="scoreScope"]:checked');
    if (scopeEl) state.settings.scoreScope = scopeEl.value;

    if (dom.includeCurrentGame) {
      state.settings.includeCurrentInCumulative = dom.includeCurrentGame.checked;
    }

    const roundEl = document.querySelector('input[name="rounding"]:checked');
    if (roundEl) state.settings.rounding = roundEl.value;

    const remEl = document.querySelector('input[name="remainderAdjust"]:checked');
    if (remEl) state.settings.remainderAdjust = remEl.value;

    if (dom.remainderRep) state.settings.remainderRepId = dom.remainderRep.value || null;

    state.players.forEach((p, i) => {
      const row = dom.playerList?.querySelector(`.player-row[data-id="${p.id}"]`);
      if (!row) return;
      const nameEl = row.querySelector(".player-name");
      const scoreEl = row.querySelector(".player-score");
      if (nameEl) p.name = nameEl.value;
      if (scoreEl) p.currentScore = scoreEl.value;
    });

    state.teams.slice(0, state.teamCount).forEach((t) => {
      const input = dom.teamNames?.querySelector(`.team-name-input[data-team-id="${t.id}"]`);
      if (input) t.name = input.value;
    });

    dom.teamList?.querySelectorAll(".team-select").forEach((sel) => {
      const pid = sel.dataset.playerId;
      const p = getPlayerById(pid);
      if (p) p.teamId = parseInt(sel.value, 10);
    });

    if (save) scheduleSave();
  }

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
    renderCumulativeOptions();
    renderSettlementPreset();
    renderSettlementPairs();
    renderSettingsInputs();
    renderRepresentativeSelect();
    if (state.lastResult) renderResult(state.lastResult);
  }

  function renderGameBar() {
    if (dom.currentGameDisplay) dom.currentGameDisplay.textContent = String(state.currentGame);
    if (dom.gameHint) {
      const completed = state.gameHistory.length;
      dom.gameHint.textContent = completed
        ? `${completed}ゲーム終了済み · 現在${state.currentGame}ゲーム目`
        : "スコアを入力して「精算を計算する」を押してください";
    }
    if (dom.prevGameBtn) dom.prevGameBtn.disabled = state.currentGame <= 1;
  }

  function renderPlayerCount() {
    if (dom.playerCount) dom.playerCount.value = state.playerCount;
  }

  function renderPlayers() {
    if (!dom.playerList) return;
    dom.playerList.innerHTML = "";

    state.players.slice(0, state.playerCount).forEach((p, i) => {
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
      name.placeholder = defaultPlayerName(i);
      name.setAttribute("aria-label", `${defaultPlayerName(i)}の名前`);

      const score = document.createElement("input");
      score.type = "number";
      score.className = "input player-score";
      score.value = p.currentScore;
      score.placeholder = "0";
      score.min = MIN_SCORE;
      score.max = MAX_SCORE;
      score.inputMode = "numeric";
      score.setAttribute("aria-label", `${defaultPlayerName(i)}の今回スコア`);

      const cum = document.createElement("span");
      cum.className = "player-cumulative";
      cum.textContent = String(p.cumulativeScore || 0);
      cum.setAttribute("aria-label", "累計スコア");

      row.append(num, name, score, cum);
      applyTeamColorStyle(row, p.teamId);
      dom.playerList.appendChild(row);
    });
  }

  function renderTeamCount() {
    if (dom.teamCount) {
      dom.teamCount.value = state.teamCount;
      dom.teamCount.max = state.playerCount;
    }
  }

  function renderTeamNames() {
    if (!dom.teamNames) return;
    dom.teamNames.innerHTML = "";
    for (let t = 1; t <= state.teamCount; t++) {
      const team = getTeamById(t) || { id: t, name: defaultTeamName(t) };
      const row = document.createElement("div");
      row.className = "team-name-row";

      const dot = document.createElement("span");
      dot.className = "team-name-dot";
      const { color } = getTeamColor(t);
      dot.style.background = color;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "input team-name-input";
      input.dataset.teamId = String(t);
      input.value = team.name || defaultTeamName(t);
      input.setAttribute("aria-label", `チーム${t}の名前`);

      row.append(dot, input);
      dom.teamNames.appendChild(row);
    }
  }

  function renderTeamLegend() {
    if (!dom.teamLegend) return;
    dom.teamLegend.innerHTML = "";
    for (let t = 1; t <= state.teamCount; t++) {
      const chip = document.createElement("span");
      chip.className = "team-chip";
      applyTeamColorStyle(chip, t);
      const dot = document.createElement("span");
      dot.className = "team-chip-dot";
      chip.append(dot, document.createTextNode(getTeamDisplayName(t)));
      dom.teamLegend.appendChild(chip);
    }
  }

  function renderTeamList() {
    if (!dom.teamList) return;
    dom.teamList.innerHTML = "";

    state.players.slice(0, state.playerCount).forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "team-row";

      const name = document.createElement("span");
      name.className = "team-row-name";
      name.textContent = getPlayerDisplayName(p, i);

      const select = document.createElement("select");
      select.className = "team-select";
      select.dataset.playerId = p.id;
      select.setAttribute("aria-label", `${getPlayerDisplayName(p, i)}のチーム`);

      for (let t = 1; t <= state.teamCount; t++) {
        const opt = document.createElement("option");
        opt.value = String(t);
        opt.textContent = getTeamDisplayName(t);
        if (p.teamId === t) opt.selected = true;
        select.appendChild(opt);
      }
      applyTeamColorStyle(select, p.teamId);

      row.append(name, select);
      dom.teamList.appendChild(row);
    });
  }

  function renderTeamWarning() {
    if (!dom.teamWarning) return;
    const counts = {};
    state.players.slice(0, state.playerCount).forEach((p) => {
      counts[p.teamId] = (counts[p.teamId] || 0) + 1;
    });
    const vals = Object.values(counts);
    const uneven = vals.length > 1 && new Set(vals).size > 1;
    dom.teamWarning.hidden = !uneven;
    if (uneven) {
      dom.teamWarning.textContent = "⚠ チーム人数が不均等です。平均点方式の利用を推奨します。";
    }
  }

  function renderCumulativeOptions() {
    const isCumulative = state.settings.scoreScope === "cumulative";
    if (dom.cumulativeOptions) dom.cumulativeOptions.hidden = !isCumulative;
    if (dom.completedGamesCount) {
      dom.completedGamesCount.textContent = String(state.gameHistory.length);
    }
    const scopeEl = document.querySelector(`input[name="scoreScope"][value="${state.settings.scoreScope}"]`);
    if (scopeEl) scopeEl.checked = true;
    if (dom.includeCurrentGame) dom.includeCurrentGame.checked = state.settings.includeCurrentInCumulative;
  }

  function renderSettlementPreset() {
    dom.presetGroup?.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === state.settings.settlementPreset);
    });
    const isCustom = state.settings.settlementPreset === "custom";
    if (dom.settlementCustom) dom.settlementCustom.hidden = !isCustom;
  }

  function renderSettlementPairs() {
    if (!dom.settlementList) return;
    if (state.settings.settlementPreset !== "custom") {
      dom.settlementList.innerHTML = "";
      return;
    }

    dom.settlementList.innerHTML = "";
    const pairs = state.settings.settlementPairs || [];

    pairs.forEach((pair, index) => {
      const wrap = document.createElement("div");
      wrap.className = "settlement-pair";
      wrap.dataset.index = String(index);

      const row1 = document.createElement("div");
      row1.className = "settlement-pair-row";

      const fromSel = createRankSelect("fromRank", pair.fromRank);
      const arrow = document.createElement("span");
      arrow.className = "settlement-arrow";
      arrow.textContent = "→";
      const toSel = createRankSelect("toRank", pair.toRank);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-remove-pair";
      removeBtn.textContent = "×";
      removeBtn.dataset.index = String(index);
      removeBtn.setAttribute("aria-label", "ペアを削除");

      row1.append(fromSel, arrow, toSel, removeBtn);
      wrap.appendChild(row1);

      const row2 = document.createElement("div");
      row2.className = "settlement-pair-row";
      row2.append(
        createTeamSelect("fromTeamId", pair.fromTeamId, "支払うチーム（任意）"),
        createTeamSelect("toTeamId", pair.toTeamId, "受取チーム（任意）")
      );
      wrap.appendChild(row2);
      dom.settlementList.appendChild(wrap);
    });
  }

  function createRankSelect(field, value) {
    const sel = document.createElement("select");
    sel.className = "settlement-select";
    sel.dataset.field = field;
    for (let r = 1; r <= state.teamCount; r++) {
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
    for (let t = 1; t <= state.teamCount; t++) {
      const opt = document.createElement("option");
      opt.value = String(t);
      opt.textContent = getTeamDisplayName(t);
      if (value === t) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function renderSettingsInputs() {
    if (dom.pricePerPin) dom.pricePerPin.value = state.settings.pricePerPin;
    const calcEl = document.querySelector(`input[name="calcMethod"][value="${state.settings.calcMethod}"]`);
    if (calcEl) calcEl.checked = true;
    const roundEl = document.querySelector(`input[name="rounding"][value="${state.settings.rounding}"]`);
    if (roundEl) roundEl.checked = true;
    const remEl = document.querySelector(`input[name="remainderAdjust"][value="${state.settings.remainderAdjust}"]`);
    if (remEl) remEl.checked = true;
    if (dom.representativeField) {
      dom.representativeField.hidden = state.settings.remainderAdjust !== "representative";
    }
  }

  function renderRepresentativeSelect() {
    if (!dom.remainderRep) return;
    dom.remainderRep.innerHTML = "";
    state.players.slice(0, state.playerCount).forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = getPlayerDisplayName(p, i);
      if (p.id === state.settings.remainderRepId) opt.selected = true;
      dom.remainderRep.appendChild(opt);
    });
    if (!state.settings.remainderRepId && state.players[0]) {
      state.settings.remainderRepId = state.players[0].id;
    }
  }

  function renderResult(result) {
    if (!dom.resultSection) return;
    dom.resultSection.hidden = false;

    const scope = state.settings.scoreScope === "current"
      ? `第${state.currentGame}ゲーム · 今回のみ`
      : `累計（${state.gameHistory.length}ゲーム終了${state.settings.includeCurrentInCumulative ? "＋現在入力中" : ""}）`;

    if (dom.resultScopeLabel) dom.resultScopeLabel.textContent = scope;

    if (dom.resultWarnings) {
      dom.resultWarnings.hidden = !result.warnings?.length;
      if (result.warnings?.length) dom.resultWarnings.textContent = result.warnings.join(" ");
    }

    renderRankingTable(result);
    renderTeamSummary(result);
    renderSettlementSummary(result);
    renderPayments(result);
    lastResultText = buildResultText(result);
    state.lastResult = result;
  }

  function renderRankingTable(result) {
    if (!dom.rankingTable) return;
    const table = document.createElement("table");
    table.className = "ranking-table";
    table.innerHTML = "<thead><tr><th>順位</th><th>チーム</th><th>人数</th><th>合計</th><th>平均</th></tr></thead>";
    const tbody = document.createElement("tbody");

    const sorted = [...result.rankedTeams].sort((a, b) => a.rank - b.rank);
    sorted.forEach((t) => {
      const tr = document.createElement("tr");
      applyTeamColorStyle(tr, t.id);

      const rankTd = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "rank-badge";
      if (t.rank === 1) badge.classList.add("rank-gold");
      else if (t.rank === 2) badge.classList.add("rank-silver");
      else if (t.rank === 3) badge.classList.add("rank-bronze");
      badge.textContent = formatRankLabel(t.rank, t.tied);
      rankTd.appendChild(badge);

      const nameTd = document.createElement("td");
      nameTd.textContent = t.name;

      const countTd = document.createElement("td");
      countTd.textContent = String(t.members.length);

      const totalTd = document.createElement("td");
      totalTd.textContent = String(t.total);

      const avgTd = document.createElement("td");
      avgTd.textContent = formatScore(t.average);

      tr.append(rankTd, nameTd, countTd, totalTd, avgTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    dom.rankingTable.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "ranking-table-wrap";
    wrap.appendChild(table);
    dom.rankingTable.appendChild(wrap);
  }

  function renderTeamSummary(result) {
    if (!dom.teamSummary) return;
    dom.teamSummary.innerHTML = "";
    const label = result.calcMethod === "average" ? "平均" : "合計";

    result.pairDetails.forEach((d) => {
      if (d.skipped) return;
      const div = document.createElement("div");
      div.className = "team-summary-item";
      const teamId = d.fromTeams?.[0]?.id || 1;
      applyTeamColorStyle(div, teamId);

      const name = document.createElement("div");
      name.className = "team-summary-name";
      name.textContent = `${formatRankLabel(d.fromRank, false)} → ${formatRankLabel(d.toRank, false)}`;

      const detail = document.createElement("div");
      detail.className = "team-summary-detail";
      detail.textContent = `${label}差 ${formatScore(d.diff)} ピン × ${state.settings.pricePerPin}円 = ${formatYen(d.pairAmount)}`;

      div.append(name, detail);
      dom.teamSummary.appendChild(div);
    });

    if (!result.pairDetails.some((d) => !d.skipped)) {
      const p = document.createElement("p");
      p.className = "section-hint";
      p.textContent = "差額計算の対象となる差がありません（同点等）";
      dom.teamSummary.appendChild(p);
    }
  }

  function renderSettlementSummary(result) {
    if (!dom.settlementSummary) return;
    dom.settlementSummary.innerHTML = "";

    if (result.isDraw) {
      dom.settlementSummary.innerHTML = '<div class="result-row highlight"><span class="result-label">精算総額</span><span class="result-value">精算なし</span></div>';
      return;
    }

    const rows = [
      ["処理前精算総額", formatYen(result.rawTotal)],
      ["端数切り捨て", formatYen(result.trimmed)],
      ["最終精算総額", formatYen(result.finalTotal)],
      ["送金回数", `${result.payments.length} 回`],
    ];

    rows.forEach(([label, value], i) => {
      const row = document.createElement("div");
      row.className = "result-row" + (i === 2 ? " highlight" : "");
      const l = document.createElement("span");
      l.className = "result-label";
      l.textContent = label;
      const v = document.createElement("span");
      v.className = "result-value";
      v.textContent = value;
      row.append(l, v);
      dom.settlementSummary.appendChild(row);
    });
  }

  function renderPayments(result) {
    if (!dom.paymentList) return;
    dom.paymentList.innerHTML = "";

    if (!result.payments.length) {
      const li = document.createElement("li");
      li.className = "payment-item";
      li.textContent = "支払いはありません";
      dom.paymentList.appendChild(li);
      return;
    }

    result.payments.forEach((pay) => {
      const fromP = getPlayerById(pay.fromId);
      const toP = getPlayerById(pay.toId);
      const fromIdx = state.players.indexOf(fromP);
      const toIdx = state.players.indexOf(toP);
      const fromName = fromP ? getPlayerDisplayName(fromP, fromIdx) : "?";
      const toName = toP ? getPlayerDisplayName(toP, toIdx) : "?";

      const li = document.createElement("li");
      li.className = "payment-item";

      const route = document.createElement("div");
      route.className = "payment-route";
      route.append(
        document.createTextNode(fromName),
        document.createTextNode(" → "),
      );
      const toSpan = document.createElement("span");
      toSpan.className = "payment-to";
      toSpan.textContent = toName;
      route.appendChild(toSpan);

      const amount = document.createElement("div");
      amount.className = "payment-amount";
      amount.textContent = formatYen(pay.amount);

      li.append(route, amount);
      dom.paymentList.appendChild(li);
    });
  }

  function renderHistoryList() {
    if (!dom.historyList) return;
    dom.historyList.innerHTML = "";

    if (!state.gameHistory.length) {
      dom.historyList.textContent = "履歴はありません";
      return;
    }

    [...state.gameHistory].reverse().forEach((h) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";
      btn.dataset.gameId = h.id;

      const title = document.createElement("div");
      title.className = "history-item-title";
      title.textContent = `第${h.gameNumber}ゲーム`;

      const meta = document.createElement("div");
      meta.className = "history-item-meta";
      meta.textContent = `${h.date} · 精算額 ${formatYen(h.finalTotal || 0)}`;

      btn.append(title, meta);
      btn.addEventListener("click", () => showHistoryDetail(h.id));
      dom.historyList.appendChild(btn);
    });
  }

  function showHistoryDetail(gameId) {
    const h = state.gameHistory.find((g) => g.id === gameId);
    if (!h || !dom.historyDetailBody || !dom.historyDetailModal) return;

    if (dom.historyDetailTitle) dom.historyDetailTitle.textContent = `第${h.gameNumber}ゲーム`;
    dom.historyDetailBody.textContent = h.summaryText || "詳細なし";
    dom.historyDetailModal.showModal();
  }

  // ========================================
  // 結果テキスト・共有
  // ========================================
  function buildResultText(result) {
    const lines = [
      "【ボウリング精算・差額計算結果】",
      `第${state.currentGame}ゲーム`,
      state.settings.scoreScope === "current" ? "対象: 今回のみ" : "対象: 累計",
      "",
      "■ 順位",
    ];

    [...result.rankedTeams].sort((a, b) => a.rank - b.rank).forEach((t) => {
      lines.push(
        `${formatRankLabel(t.rank, t.tied)} ${t.name}（${t.members.length}人 / 合計${t.total} / 平均${formatScore(t.average)}）`
      );
    });

    lines.push("", "■ 差額計算");
    result.pairDetails.filter((d) => !d.skipped).forEach((d) => {
      lines.push(`${d.fromRank}位→${d.toRank}位: 差${formatScore(d.diff)}ピン = ${formatYen(d.pairAmount)}`);
    });

    lines.push(
      "",
      `処理前精算総額: ${formatYen(result.rawTotal || 0)}`,
      `端数切捨: ${formatYen(result.trimmed || 0)}`,
      `精算総額: ${formatYen(result.finalTotal || 0)}`,
      "",
      "■ 送金結果（支払い内訳）"
    );

    if (!result.payments?.length) {
      lines.push("なし");
    } else {
      result.payments.forEach((p) => {
        const fromP = getPlayerById(p.fromId);
        const toP = getPlayerById(p.toId);
        lines.push(
          `${fromP ? getPlayerDisplayName(fromP, state.players.indexOf(fromP)) : "?"} → ${toP ? getPlayerDisplayName(toP, state.players.indexOf(toP)) : "?"}: ${formatYen(p.amount)}`
        );
      });
    }
    return lines.join("\n");
  }

  async function copyResult() {
    if (!lastResultText) return false;
    try {
      await navigator.clipboard.writeText(lastResultText);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = lastResultText;
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

  /**
   * 共有: HTTPS公開後は Web Share API を優先。
   * file:// 環境では navigator.share / clipboard が制限される場合あり。
   */
  async function shareResult() {
    if (!lastResultText) {
      showStatus("先に計算を実行してください", "error");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "ボウリング精算・差額計算結果", text: lastResultText });
        showStatus("共有しました", "success");
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    const ok = await copyResult();
    if (ok) {
      showStatus("結果をコピーしました", "success");
    } else {
      showStatus("共有できませんでした。結果をコピーしてください", "error");
    }
  }

  function showStatus(msg, type) {
    if (!dom.statusMessage) return;
    dom.statusMessage.textContent = msg;
    dom.statusMessage.hidden = false;
    dom.statusMessage.className = "status-message is-" + type;
    setTimeout(() => { dom.statusMessage.hidden = true; }, 3000);
  }

  // ========================================
  // ゲーム管理
  // ========================================
  function handleNextGame() {
    syncFromDom(false);
    const errors = validateScores(true);
    if (errors.length) {
      showStatus(errors[0].message, "error");
      return;
    }

    const result = state.lastResult || runCalculation();
    if (result.error) {
      showStatus(result.error, "error");
      return;
    }

    const lastHistory = state.gameHistory[state.gameHistory.length - 1];
    if (lastHistory && lastHistory.gameNumber === state.currentGame) {
      showStatus("このゲームは既に履歴へ保存済みです", "error");
      return;
    }

    const historyEntry = {
      id: genId("g"),
      gameNumber: state.currentGame,
      date: new Date().toLocaleString("ja-JP"),
      scores: state.players.map((p) => ({
        id: p.id,
        score: parseInt(p.currentScore, 10) || 0,
      })),
      result: JSON.parse(JSON.stringify(result)),
      finalTotal: result.finalTotal || 0,
      summaryText: buildResultText(result),
    };
    state.gameHistory.push(historyEntry);

    state.players.forEach((p) => {
      const current = parseInt(p.currentScore, 10) || 0;
      p.cumulativeScore = (p.cumulativeScore || 0) + current;
      p.currentScore = "";
    });

    state.currentGame += 1;
    state.lastResult = null;
    if (dom.resultSection) dom.resultSection.hidden = true;

    renderAll();
    scheduleSave();
    showStatus(`第${state.currentGame}ゲーム目へ進みました`, "success");

    dom.playerList?.querySelector(".player-score")?.focus();
    dom.playerList?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePrevGame() {
    if (state.currentGame <= 1) return;
    if (!confirm("直前のゲームに戻ります。現在の入力は失われます。よろしいですか？")) return;

    const last = state.gameHistory.pop();
    if (last) {
      state.currentGame = last.gameNumber;
      last.scores.forEach((s) => {
        const p = getPlayerById(s.id);
        if (p) {
          p.cumulativeScore = Math.max(0, (p.cumulativeScore || 0) - s.score);
          p.currentScore = String(s.score);
        }
      });
    } else {
      state.currentGame -= 1;
    }

    state.lastResult = null;
    renderAll();
    scheduleSave();
  }

  function handleDeleteCurrentGame() {
    if (!confirm("現在のゲーム入力を削除しますか？")) return;
    state.players.forEach((p) => { p.currentScore = ""; });
    state.lastResult = null;
    if (dom.resultSection) dom.resultSection.hidden = true;
    renderAll();
    scheduleSave();
  }

  function handleResetHistory() {
    if (!confirm("すべてのゲーム履歴をリセットしますか？累計スコアも0に戻ります。")) return;
    state.gameHistory = [];
    state.currentGame = 1;
    state.players.forEach((p) => {
      p.cumulativeScore = 0;
      p.currentScore = "";
    });
    state.lastResult = null;
    renderAll();
    scheduleSave();
    if (dom.historyModal?.open) dom.historyModal.close();
  }

  // ========================================
  // 人数・チーム変更
  // ========================================
  function ensureTeamsCount() {
    while (state.teams.length < state.teamCount) {
      const id = state.teams.length + 1;
      state.teams.push({ id, name: defaultTeamName(id) });
    }
  }

  function setPlayerCount(count, skipConfirm = false) {
    const newCount = clamp(count, MIN_PLAYERS, MAX_PLAYERS);
    if (newCount < state.playerCount && !skipConfirm) {
      const removed = state.players.slice(newCount);
      const hasData = removed.some((p) => p.name.trim() || p.currentScore !== "" || p.cumulativeScore > 0);
      if (hasData && !confirm("減らしたプレイヤーのデータは削除されます。よろしいですか？")) return;
    }

    while (state.players.length < newCount) {
      const i = state.players.length;
      state.players.push({
        id: genId("p"),
        name: defaultPlayerName(i),
        teamId: (i % state.teamCount) + 1,
        currentScore: "",
        cumulativeScore: 0,
      });
    }
    state.playerCount = newCount;
    if (state.teamCount > newCount) state.teamCount = newCount;
    ensureTeamsCount();
    renderAll();
    scheduleSave();
  }

  function setTeamCount(count) {
    const newCount = clamp(count, MIN_TEAMS, state.playerCount);
    state.teamCount = newCount;
    ensureTeamsCount();
    state.players.forEach((p) => {
      if (p.teamId > newCount) p.teamId = newCount;
    });
    if (state.settings.settlementPreset !== "custom") {
      state.settings.settlementPairs = buildPresetPairs(state.settings.settlementPreset, newCount);
    }
    renderAll();
    scheduleSave();
  }

  function applyPreset(preset) {
    state.settings.settlementPreset = preset;
    if (preset !== "custom") {
      state.settings.settlementPairs = buildPresetPairs(preset, state.teamCount);
    }
    renderSettlementPreset();
    renderSettlementPairs();
    scheduleSave();
  }

  // ========================================
  // 計算ハンドラ
  // ========================================
  function handleCalculate() {
    if (isCalculating) return;
    isCalculating = true;
    if (dom.calculateBtn) dom.calculateBtn.disabled = true;

    clearErrors();
    syncFromDom(false);

    const result = runCalculation();

    if (result.error) {
      showStatus(result.error, "error");
      showCalcError(result);
      isCalculating = false;
      if (dom.calculateBtn) dom.calculateBtn.disabled = false;
      return;
    }

    renderResult(result);
    scheduleSave();
    dom.resultSection?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    isCalculating = false;
    if (dom.calculateBtn) dom.calculateBtn.disabled = false;
  }

  function clearErrors() {
    document.querySelectorAll(".input-error").forEach((el) => el.classList.remove("input-error"));
    document.querySelectorAll(".error-message").forEach((el) => el.remove());
  }

  function showCalcError(result) {
    if (result.scoreErrors) {
      result.scoreErrors.forEach((err) => {
        const row = dom.playerList?.querySelectorAll(".player-row")[err.index];
        const scoreEl = row?.querySelector(".player-score");
        if (scoreEl) scoreEl.classList.add("input-error");
      });
    }
  }

  // ========================================
  // イベント
  // ========================================
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    dom.playerCountUp?.addEventListener("click", () => setPlayerCount(state.playerCount + 1));
    dom.playerCountDown?.addEventListener("click", () => setPlayerCount(state.playerCount - 1));
    dom.playerCount?.addEventListener("change", (e) => setPlayerCount(parseInt(e.target.value, 10)));

    dom.teamCountUp?.addEventListener("click", () => setTeamCount(state.teamCount + 1));
    dom.teamCountDown?.addEventListener("click", () => setTeamCount(state.teamCount - 1));
    dom.teamCount?.addEventListener("change", (e) => setTeamCount(parseInt(e.target.value, 10)));

    dom.calculateBtn?.addEventListener("click", handleCalculate);
    dom.copyBtn?.addEventListener("click", async () => {
      const ok = await copyResult();
      if (dom.copyFeedback) {
        dom.copyFeedback.hidden = !ok;
        if (ok) setTimeout(() => { dom.copyFeedback.hidden = true; }, 2000);
      }
      showStatus(ok ? "結果をコピーしました" : "共有できませんでした。結果をコピーしてください", ok ? "success" : "error");
    });
    dom.shareBtn?.addEventListener("click", shareResult);
    dom.nextGameBtn?.addEventListener("click", handleNextGame);
    dom.deleteCurrentGameBtn?.addEventListener("click", handleDeleteCurrentGame);
    dom.prevGameBtn?.addEventListener("click", handlePrevGame);

    dom.historyBtn?.addEventListener("click", () => {
      renderHistoryList();
      dom.historyModal?.showModal();
    });
    dom.historyModalClose?.addEventListener("click", () => dom.historyModal?.close());
    dom.historyDetailClose?.addEventListener("click", () => dom.historyDetailModal?.close());
    dom.resetHistoryBtn?.addEventListener("click", handleResetHistory);
    dom.resetAllBtn?.addEventListener("click", resetAllData);

    dom.addSettlementPair?.addEventListener("click", () => {
      state.settings.settlementPairs.push({
        fromRank: state.teamCount,
        toRank: 1,
        fromTeamId: null,
        toTeamId: null,
      });
      state.settings.settlementPreset = "custom";
      renderSettlementPreset();
      renderSettlementPairs();
      scheduleSave();
    });

    dom.settlementList?.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-remove-pair");
      if (!btn) return;
      const idx = parseInt(btn.dataset.index, 10);
      state.settings.settlementPairs.splice(idx, 1);
      renderSettlementPairs();
      scheduleSave();
    });

    dom.settlementList?.addEventListener("change", (e) => {
      const sel = e.target.closest(".settlement-select");
      if (!sel) return;
      const wrap = sel.closest(".settlement-pair");
      const idx = parseInt(wrap.dataset.index, 10);
      const field = sel.dataset.field;
      const val = sel.value === "" ? null : parseInt(sel.value, 10);
      state.settings.settlementPairs[idx][field] = val;
      state.settings.settlementPreset = "custom";
      scheduleSave();
    });

    dom.presetGroup?.addEventListener("click", (e) => {
      const btn = e.target.closest(".preset-btn");
      if (!btn) return;
      applyPreset(btn.dataset.preset);
    });

    document.addEventListener("change", (e) => {
      if (e.target.matches('input[name="calcMethod"], input[name="scoreScope"], input[name="rounding"], input[name="remainderAdjust"]')) {
        syncFromDom();
        renderCumulativeOptions();
        renderSettingsInputs();
        renderRepresentativeSelect();
      }
      if (e.target.id === "includeCurrentGame") {
        syncFromDom();
      }
    });

    dom.playerList?.addEventListener("input", (e) => {
      if (e.target.classList.contains("player-name")) {
        renderTeamList();
      }
      scheduleSave();
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
      const p = getPlayerById(e.target.dataset.playerId);
      if (p) {
        p.teamId = parseInt(e.target.value, 10);
        applyTeamColorStyle(e.target, p.teamId);
        renderPlayers();
        renderTeamWarning();
        scheduleSave();
      }
    });

    dom.teamNames?.addEventListener("input", () => {
      renderTeamLegend();
      renderTeamList();
      scheduleSave();
    });

    ["pricePerPin", "remainderRep"].forEach((id) => {
      dom[id]?.addEventListener("change", () => { syncFromDom(); });
    });

    window.addEventListener("beforeunload", () => syncFromDom(false));
  }

  // ========================================
  // 公開前チェック（?debug=1）
  // ========================================
  const DEBUG_CHECK_KEY = "nokoi-debug-checks";
  const DEBUG_ITEMS = [
    "4人2チームで計算できる",
    "6人3チームで計算できる",
    "8人4チームで計算できる",
    "今回のみの精算",
    "累計精算",
    "同点処理",
    "100円未満切り捨て",
    "1,000円未満切り捨て",
    "共有機能",
    "コピー機能",
    "次のゲーム",
    "前のゲーム",
    "履歴表示",
    "LocalStorage復元",
    "全データリセット",
  ];

  function isDebugMode() {
    return typeof window !== "undefined" && window.location.search.includes("debug=1");
  }

  function loadDebugChecks() {
    try {
      return JSON.parse(localStorage.getItem(DEBUG_CHECK_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveDebugChecks(checks) {
    try {
      localStorage.setItem(DEBUG_CHECK_KEY, JSON.stringify(checks));
    } catch { /* 無視 */ }
  }

  function initDebugPanel() {
    const panel = document.getElementById("debugPanel");
    if (!panel || !isDebugMode()) return;

    panel.hidden = false;
    panel.className = "debug-panel section";
    panel.innerHTML = "";

    const title = document.createElement("h2");
    title.className = "debug-panel-title";
    title.textContent = "公開前チェック（debug=1）";
    panel.appendChild(title);

    const presetTitle = document.createElement("p");
    presetTitle.className = "section-hint";
    presetTitle.textContent = "テストデータ一括入力";
    panel.appendChild(presetTitle);

    const presetWrap = document.createElement("div");
    presetWrap.className = "debug-presets";
    const presets = [
      ["4p2t", "4人2チーム"],
      ["6p3t", "6人3チーム"],
      ["8p4t", "8人4チーム"],
      ["tie", "同点ケース"],
      ["uneven", "人数不均等"],
      ["round100", "100円端数"],
      ["round1000", "1000円端数"],
    ];
    presets.forEach(([key, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "debug-preset-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => applyTestPreset(key));
      presetWrap.appendChild(btn);
    });
    panel.appendChild(presetWrap);

    const listTitle = document.createElement("p");
    listTitle.className = "section-hint";
    listTitle.textContent = "手動確認チェックリスト";
    panel.appendChild(listTitle);

    const ul = document.createElement("ul");
    ul.className = "debug-checklist";
    const checks = loadDebugChecks();

    DEBUG_ITEMS.forEach((item, i) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!checks[i];
      cb.addEventListener("change", () => {
        const c = loadDebugChecks();
        c[i] = cb.checked;
        saveDebugChecks(c);
      });
      label.append(cb, document.createTextNode(item));
      li.appendChild(label);
      ul.appendChild(li);
    });
    panel.appendChild(ul);
  }

  /** テストデータプリセットを適用 */
  function applyTestPreset(key) {
    state.gameHistory = [];
    state.currentGame = 1;
    state.lastResult = null;
    state.settings.pricePerPin = 100;
    state.settings.calcMethod = "total";
    state.settings.scoreScope = "current";
    state.settings.settlementPreset = "first-last";
    state.settings.rounding = "none";

    const setRadio = (name, val) => {
      const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (el) el.checked = true;
    };
    setRadio("calcMethod", "total");
    setRadio("scoreScope", "current");
    setRadio("rounding", "none");

    if (key === "4p2t") {
      setupPlayers(4, 2, [
        { name: "こうだい", team: 1, score: 180 },
        { name: "てっぺい", team: 1, score: 165 },
        { name: "ゆうき", team: 2, score: 150 },
        { name: "けんた", team: 2, score: 140 },
      ]);
    } else if (key === "6p3t") {
      setupPlayers(6, 3, [
        { name: "A1", team: 1, score: 180 }, { name: "A2", team: 1, score: 170 },
        { name: "B1", team: 2, score: 160 }, { name: "B2", team: 2, score: 155 },
        { name: "C1", team: 3, score: 145 }, { name: "C2", team: 3, score: 140 },
      ]);
      state.settings.settlementPreset = "half-half";
    } else if (key === "8p4t") {
      const data = [];
      for (let i = 0; i < 8; i++) {
        data.push({ name: `P${i + 1}`, team: (i % 4) + 1, score: 200 - i * 10 });
      }
      setupPlayers(8, 4, data);
      state.settings.settlementPreset = "half-half";
    } else if (key === "tie") {
      setupPlayers(4, 2, [
        { name: "T1a", team: 1, score: 150 },
        { name: "T1b", team: 1, score: 150 },
        { name: "T2a", team: 2, score: 150 },
        { name: "T2b", team: 2, score: 150 },
      ]);
    } else if (key === "uneven") {
      setupPlayers(5, 2, [
        { name: "A1", team: 1, score: 200 },
        { name: "A2", team: 1, score: 190 },
        { name: "A3", team: 1, score: 180 },
        { name: "B1", team: 2, score: 160 },
        { name: "B2", team: 2, score: 150 },
      ]);
      state.settings.calcMethod = "average";
      setRadio("calcMethod", "average");
    } else if (key === "round100") {
      setupPlayers(4, 2, [
        { name: "A1", team: 1, score: 185 },
        { name: "A2", team: 1, score: 175 },
        { name: "B1", team: 2, score: 160 },
        { name: "B2", team: 2, score: 155 },
      ]);
      state.settings.rounding = "100";
      setRadio("rounding", "100");
    } else if (key === "round1000") {
      setupPlayers(4, 2, [
        { name: "A1", team: 1, score: 220 },
        { name: "A2", team: 1, score: 210 },
        { name: "B1", team: 2, score: 150 },
        { name: "B2", team: 2, score: 140 },
      ]);
      state.settings.pricePerPin = 100;
      state.settings.rounding = "1000";
      setRadio("rounding", "1000");
    }

    applyPreset(state.settings.settlementPreset);
    renderAll();
    scheduleSave();
    showStatus("テストデータを入力しました", "success");
    dom.playerList?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** プレイヤー・チームを一括セットアップ */
  function setupPlayers(count, teamCount, data) {
    state.playerCount = count;
    state.teamCount = teamCount;
    state.players = [];
    state.teams = [];
    for (let t = 1; t <= teamCount; t++) {
      state.teams.push({ id: t, name: defaultTeamName(t) });
    }
    for (let i = 0; i < count; i++) {
      const d = data[i] || { name: defaultPlayerName(i), team: (i % teamCount) + 1, score: 150 };
      state.players.push({
        id: genId("p"),
        name: d.name,
        teamId: d.team,
        currentScore: String(d.score),
        cumulativeScore: 0,
      });
    }
    if (teamCount >= 3) {
      state.settings.settlementPairs = buildPresetPairs(state.settings.settlementPreset, teamCount);
    } else {
      state.settings.settlementPairs = [{ fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null }];
    }
  }

  // ========================================
  // 内部テスト（debug=1 時のみコンソール出力）
  // ========================================
  function runSelfTests() {
    const tests = [];
    const assert = (name, cond) => tests.push({ name, ok: !!cond });

    const s = createDefaultState();
    state = s;
    state.players = [
      { id: "p1", name: "A", teamId: 1, currentScore: "200", cumulativeScore: 0 },
      { id: "p2", name: "A", teamId: 1, currentScore: "180", cumulativeScore: 0 },
      { id: "p3", name: "C", teamId: 2, currentScore: "150", cumulativeScore: 0 },
      { id: "p4", name: "D", teamId: 2, currentScore: "140", cumulativeScore: 0 },
    ];
    state.playerCount = 4;
    state.teamCount = 2;
    state.settings.settlementPreset = "first-last";
    state.settings.scoreScope = "current";
    let r = runCalculation();
    assert("4人2チーム", !r.error && r.finalTotal > 0);

    state.players.forEach((p, i) => { p.currentScore = String(150 + i * 10); p.teamId = (i % 3) + 1; });
    state.teamCount = 3;
    state.playerCount = 6;
    state.teams = [{ id: 1, name: "T1" }, { id: 2, name: "T2" }, { id: 3, name: "T3" }];
    state.settings.settlementPreset = "half-half";
    r = runCalculation();
    assert("6人3チーム", !r.error);

    const bal = new Map([["a", -5000], ["b", -5000], ["c", 5000], ["d", 5000]]);
    const pays = minimizeTransactions(bal);
    assert("送金最小化", pays.length <= 2);

    assert("同点名", state.players[0].name === state.players[1].name);

    const tied = rankTeams([
      { id: 1, name: "T1", members: [{ id: "a", score: 100 }], total: 100, average: 100 },
      { id: 2, name: "T2", members: [{ id: "b", score: 100 }], total: 100, average: 100 },
    ], "total");
    assert("同点タイ", tied[0].tied && tied[0].rank === 1);

    state = createDefaultState();
    return tests;
  }

  // ========================================
  // 起動
  // ========================================
  function init() {
    cacheDom();
    loadState();
    ensureTeamsCount();
    bindEvents();
    renderAll();
    initDebugPanel();

    if (isDebugMode()) {
      const results = runSelfTests();
      console.info("[Nokoi debug] セルフテスト完了", results);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
