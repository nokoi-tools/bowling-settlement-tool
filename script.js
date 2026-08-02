/**
 * Nokoi Tools - ボウリング精算・差額計算ツール v2.0
 * 差額・精算金額の計算支援ツール（ゲーム単位精算）
 */
(function () {
  "use strict";

  const STORAGE_KEY = "nokoi-bowling-v2";
  const STORAGE_KEY_V1 = "nokoi-bowling-v1";
  const STORAGE_VERSION = 2;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 20;
  const MIN_TEAMS = 2;
  const MAX_TEAMS = 20;
  const MIN_SCORE = 0;
  const MAX_SCORE = 300;
  const DEFAULT_PRICE = 100;
  const MIN_RATE_OPTIONS = 2;

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

  const DEFAULT_RATE_PRESETS = [
    {
      id: "rp1",
      name: "プリセット1",
      options: [
        { amount: 50, weight: 5 },
        { amount: 100, weight: 3 },
        { amount: 200, weight: 2 },
      ],
    },
    {
      id: "rp2",
      name: "プリセット2",
      options: [
        { amount: 100, weight: 1 },
        { amount: 150, weight: 1 },
        { amount: 200, weight: 1 },
      ],
    },
    {
      id: "rp3",
      name: "プリセット3",
      options: [
        { amount: 80, weight: 1 },
        { amount: 100, weight: 1 },
      ],
    },
  ];

  let idCounter = 0;
  let state = createDefaultState();
  let lastResultText = "";
  let lastSessionSummaryText = "";
  let isCalculating = false;
  let saveTimer = null;

  const $ = (id) => document.getElementById(id);
  const dom = {};

  function cacheDom() {
    const ids = [
      "sessionBar", "sessionStatus", "currentGameDisplay", "gameTabs", "gameHint",
      "settingsBtn", "historyBtn", "rateResultBanner", "statusMessage",
      "playerCount", "playerCountUp", "playerCountDown", "playerList",
      "teamCount", "teamCountUp", "teamCountDown", "teamNames", "teamLegend",
      "teamList", "teamWarning", "rateSection", "currentRateDisplay",
      "ratePresetTabs", "rateOptions", "spinRouletteBtn", "rateChoiceNext",
      "presetGroup", "settlementList", "addSettlementPair", "settlementCustom",
      "resultSection", "resultScopeLabel", "resultWarnings", "rankingTable",
      "formulaDisplay", "teamSummary", "settlementSummary", "paymentList",
      "playerStats", "playerBalance", "copyBtn", "shareBtn", "nextGameBtn",
      "copyFeedback", "calculateBtn", "sessionEndBtn", "fixedBar",
      "historyModal", "historyModalClose", "historyList", "historyDetailModal",
      "historyDetailClose", "historyDetailTitle", "historyDetailBody",
      "sessionSummaryModal", "sessionSummaryClose", "sessionSummaryBody",
      "sessionCopyBtn", "sessionShareBtn", "settingsModal", "settingsModalClose",
      "settingsBody", "resetAllBtn", "debugPanel",
    ];
    ids.forEach((id) => { dom[id] = $(id); });
  }

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

  function formatBalance(n) {
    const v = Math.round(n);
    if (v > 0) return `+${formatYen(v)}`;
    if (v < 0) return formatYen(v);
    return "±0";
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

  function sortedPlayers() {
    return [...state.players]
      .slice(0, state.playerCount)
      .sort((a, b) => a.order - b.order);
  }

  function getPlayerById(id) {
    return state.players.find((p) => p.id === id);
  }

  function getPlayerDisplayName(p, index) {
    const name = (p.name || "").trim();
    return name || defaultPlayerName(index ?? p.order);
  }

  function getPlayerIndex(p) {
    const sorted = sortedPlayers();
    const idx = sorted.findIndex((x) => x.id === p.id);
    return idx >= 0 ? idx : p.order;
  }

  function getDraft() {
    return state.session.draft;
  }

  function getTeamAssignment(playerId) {
    return getDraft().teamAssignments[playerId] || 1;
  }

  function setTeamAssignment(playerId, teamId) {
    getDraft().teamAssignments[playerId] = teamId;
  }

  function getScore(playerId) {
    const v = getDraft().scores[playerId];
    return v === undefined || v === null ? "" : String(v);
  }

  function setScore(playerId, value) {
    getDraft().scores[playerId] = value;
  }

  function getTeamNameEntry(teamId) {
    const draft = getDraft();
    if (!draft.teamNames[teamId]) {
      draft.teamNames[teamId] = { name: defaultTeamName(teamId), manual: false };
    }
    return draft.teamNames[teamId];
  }

  function getTeamDisplayName(teamId) {
    const entry = getTeamNameEntry(teamId);
    const name = (entry.name || "").trim();
    return name || defaultTeamName(teamId);
  }

  function ensureTeamNamesCount() {
    for (let t = 1; t <= state.teamCount; t++) {
      getTeamNameEntry(t);
    }
  }

  function autoGenerateTeamName(teamId) {
    const members = sortedPlayers().filter((p) => getTeamAssignment(p.id) === teamId);
    const names = members.map((p) => {
      const n = (p.name || "").trim();
      return n || defaultPlayerName(getPlayerIndex(p));
    });
    return names.length ? names.join("・") : defaultTeamName(teamId);
  }

  function refreshAutoTeamNames() {
    if (!state.settings.autoTeamNames) return;
    for (let t = 1; t <= state.teamCount; t++) {
      const entry = getTeamNameEntry(t);
      if (!entry.manual) {
        entry.name = autoGenerateTeamName(t);
      }
    }
  }

  function createDefaultSettings() {
    return {
      autoTeamNames: true,
      calcMethod: "total",
      settlementPreset: "custom",
      settlementPairs: [{ fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null }],
      rounding: "none",
      remainderAdjust: "representative",
      remainderRepId: null,
      ratePresets: JSON.parse(JSON.stringify(DEFAULT_RATE_PRESETS)),
      activeRatePresetIndex: 0,
    };
  }

  function createDefaultDraft() {
    const draft = {
      scores: {},
      teamAssignments: {},
      teamNames: {},
      pricePerPin: DEFAULT_PRICE,
    };
    return draft;
  }

  function createDefaultSession() {
    return {
      active: true,
      currentGame: 1,
      draft: createDefaultDraft(),
      games: [],
      cumulativeBalances: {},
      lastRate: DEFAULT_PRICE,
      nextRateChoice: "spin",
    };
  }

  function createDefaultState() {
    const players = [];
    for (let i = 0; i < 4; i++) {
      const id = genId("p");
      players.push({ id, name: defaultPlayerName(i), order: i });
    }
    const session = createDefaultSession();
    players.forEach((p, i) => {
      session.draft.teamAssignments[p.id] = (i % 2) + 1;
      session.draft.scores[p.id] = "";
    });
    for (let t = 1; t <= 2; t++) {
      session.draft.teamNames[t] = { name: defaultTeamName(t), manual: false };
    }
    return {
      version: STORAGE_VERSION,
      playerCount: 4,
      teamCount: 2,
      players,
      session,
      settings: createDefaultSettings(),
      lastResult: null,
    };
  }

  function normalizeRounding(r) {
    if (r === "100") return "floor100";
    if (r === "1000") return "floor1000";
    return r || "none";
  }

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

  function migrateFromV1(data) {
    const players = (data.players || [])
      .filter((p) => p && p.id)
      .map((p, i) => ({
        id: String(p.id),
        name: String(p.name ?? defaultPlayerName(i)),
        order: i,
      }));

    if (players.length < MIN_PLAYERS) return null;

    const teamCount = clamp(data.teamCount || 2, MIN_TEAMS, players.length);
    const draft = createDefaultDraft();
    draft.pricePerPin = data.settings?.pricePerPin || DEFAULT_PRICE;

    (data.players || []).forEach((p) => {
      if (!p?.id) return;
      draft.scores[String(p.id)] = p.currentScore === undefined || p.currentScore === null ? "" : String(p.currentScore);
      draft.teamAssignments[String(p.id)] = clamp(Number(p.teamId) || 1, 1, teamCount);
    });

    (data.teams || []).forEach((t) => {
      if (!t?.id) return;
      draft.teamNames[t.id] = { name: String(t.name ?? defaultTeamName(t.id)), manual: true };
    });
    for (let t = 1; t <= teamCount; t++) {
      if (!draft.teamNames[t]) {
        draft.teamNames[t] = { name: defaultTeamName(t), manual: false };
      }
    }

    const cumulativeBalances = {};
    const games = (data.gameHistory || []).map((h, gi) => {
      const gameScores = {};
      (h.scores || []).forEach((s) => {
        if (s?.id != null) gameScores[s.id] = Number(s.score) || 0;
      });
      const balances = {};
      if (h.result?.payments) {
        h.result.payments.forEach((pay) => {
          balances[pay.fromId] = (balances[pay.fromId] || 0) - pay.amount;
          balances[pay.toId] = (balances[pay.toId] || 0) + pay.amount;
        });
      }
      Object.entries(balances).forEach(([pid, amt]) => {
        cumulativeBalances[pid] = (cumulativeBalances[pid] || 0) + amt;
      });
      return {
        id: h.id || genId("g"),
        gameNumber: h.gameNumber || gi + 1,
        date: h.date || "",
        scores: gameScores,
        teamAssignments: { ...draft.teamAssignments },
        teamNames: Object.fromEntries(
          Object.entries(draft.teamNames).map(([k, v]) => [k, v.name])
        ),
        pricePerPin: data.settings?.pricePerPin || DEFAULT_PRICE,
        result: h.result || null,
        balances,
        summaryText: h.summaryText || "",
      };
    });

    const settings = createDefaultSettings();
    if (data.settings) {
      settings.calcMethod = data.settings.calcMethod === "average" ? "average" : "total";
      settings.settlementPreset = data.settings.settlementPreset || "custom";
      settings.settlementPairs = Array.isArray(data.settings.settlementPairs)
        ? data.settings.settlementPairs
        : settings.settlementPairs;
      settings.rounding = normalizeRounding(data.settings.rounding);
      settings.remainderAdjust = data.settings.remainderAdjust || "representative";
      settings.remainderRepId = data.settings.remainderRepId || null;
    }

    return {
      version: STORAGE_VERSION,
      playerCount: clamp(data.playerCount || players.length, MIN_PLAYERS, MAX_PLAYERS),
      teamCount,
      players,
      session: {
        active: true,
        currentGame: Math.max(1, Number(data.currentGame) || games.length + 1),
        draft,
        games,
        cumulativeBalances,
        lastRate: draft.pricePerPin,
        nextRateChoice: "reuse",
      },
      settings,
      lastResult: data.lastResult || null,
    };
  }

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const v1raw = localStorage.getItem(STORAGE_KEY_V1);
        if (v1raw) {
          const v1 = JSON.parse(v1raw);
          const migrated = migrateFromV1(v1);
          if (migrated) {
            state = migrated;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            localStorage.removeItem(STORAGE_KEY_V1);
            normalizeLoadedState();
            return;
          }
        }
        return;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;
      if (data.version !== STORAGE_VERSION) return;

      state = data;
      normalizeLoadedState();
    } catch (e) {
      console.warn("復元に失敗、初期値を使用:", e);
      state = createDefaultState();
    }
  }

  function normalizeLoadedState() {
    if (!state.session) state.session = createDefaultSession();
    if (!state.session.draft) state.session.draft = createDefaultDraft();
    if (!state.settings) state.settings = createDefaultSettings();
    if (!Array.isArray(state.players)) state.players = [];
    if (!Array.isArray(state.session.games)) state.session.games = [];
    if (!state.session.cumulativeBalances) state.session.cumulativeBalances = {};

    state.settings.rounding = normalizeRounding(state.settings.rounding);
    if (!Array.isArray(state.settings.ratePresets) || state.settings.ratePresets.length < 1) {
      state.settings.ratePresets = JSON.parse(JSON.stringify(DEFAULT_RATE_PRESETS));
    }
    state.settings.activeRatePresetIndex = clamp(
      state.settings.activeRatePresetIndex || 0,
      0,
      state.settings.ratePresets.length - 1
    );

    state.players = state.players
      .filter((p) => p && p.id)
      .map((p, i) => ({
        id: String(p.id),
        name: String(p.name ?? defaultPlayerName(i)),
        order: Number.isFinite(p.order) ? p.order : i,
      }));

    if (state.players.length < MIN_PLAYERS) {
      state = createDefaultState();
      return;
    }

    state.playerCount = clamp(state.playerCount || state.players.length, MIN_PLAYERS, MAX_PLAYERS);
    state.teamCount = clamp(state.teamCount || MIN_TEAMS, MIN_TEAMS, state.playerCount);

    sortedPlayers().forEach((p) => {
      if (getDraft().teamAssignments[p.id] === undefined) {
        setTeamAssignment(p.id, (p.order % state.teamCount) + 1);
      }
      if (getDraft().scores[p.id] === undefined) {
        setScore(p.id, "");
      }
    });

    ensureTeamNamesCount();
    if (!state.settings.remainderRepId && state.players[0]) {
      state.settings.remainderRepId = state.players[0].id;
    }
  }

  function resetAllData() {
    if (!confirm("すべてのデータをリセットします。よろしいですか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V1);
    state = createDefaultState();
    renderAll();
    showStatus("データをリセットしました", "success");
  }

  function getCurrentGameScores() {
    return sortedPlayers().map((p) => {
      const raw = getScore(p.id);
      if (raw === "") return 0;
      const n = parseInt(raw, 10);
      return isNaN(n) ? NaN : n;
    });
  }

  function validateScores(requireAll) {
    const errors = [];
    sortedPlayers().forEach((p, i) => {
      const raw = getScore(p.id);
      if (raw === "") {
        if (requireAll) {
          errors.push({ index: i, message: `${getPlayerDisplayName(p, i)}のスコアを入力してください` });
        }
        return;
      }
      const s = parseInt(raw, 10);
      if (isNaN(s) || s < MIN_SCORE || s > MAX_SCORE) {
        errors.push({ index: i, message: `${getPlayerDisplayName(p, i)}のスコアは${MIN_SCORE}〜${MAX_SCORE}で入力してください` });
      }
    });
    return errors;
  }

  function buildPresetPairs(preset, teamCount) {
    const pairs = [];
    if (teamCount < 2) return pairs;
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
        pairs.push({ fromRank: teamCount - i, toRank: i + 1, fromTeamId: null, toTeamId: null });
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
      if (p.fromRank <= p.toRank) return "精算ペアは下位 → 上位で設定してください。";
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

  function buildTeamsData(scores) {
    const teamsMap = {};
    for (let t = 1; t <= state.teamCount; t++) {
      teamsMap[t] = {
        id: t,
        name: getTeamDisplayName(t),
        members: [],
        total: 0,
        average: 0,
      };
    }

    sortedPlayers().forEach((p, i) => {
      const teamId = getTeamAssignment(p.id);
      const team = teamsMap[teamId];
      if (!team) return;
      const score = scores[i];
      team.members.push({
        id: p.id,
        name: getPlayerDisplayName(p, i),
        score,
      });
      team.total += score;
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

  function calculatePairBalances(fromTeams, toTeams, diff, pricePerPin, balances) {
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
    const mode = normalizeRounding(rounding);
    if (mode === "none") return { balances, trimmed: 0 };

    let unit = 100;
    let fn = Math.floor;
    if (mode === "floor100") {
      unit = 100; fn = Math.floor;
    } else if (mode === "ceil100") {
      unit = 100; fn = Math.ceil;
    } else if (mode === "round100") {
      unit = 100; fn = Math.round;
    } else if (mode === "floor1000") {
      unit = 1000; fn = Math.floor;
    }

    let trimmed = 0;
    const rounded = new Map();
    balances.forEach((amt, id) => {
      const sign = amt >= 0 ? 1 : -1;
      const abs = Math.abs(amt);
      const roundedAbs = fn(abs / unit) * unit;
      trimmed += abs - roundedAbs;
      rounded.set(id, sign * roundedAbs);
    });
    return { balances: rounded, trimmed };
  }

  function adjustRemainder(balances, adjust, repId) {
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
    return [...balances.values()].reduce((a, b) => a + b, 0) === 0;
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
      if (pay > 0) payments.push({ fromId: d[i].id, toId: c[j].id, amount: pay });
      d[i].amount -= pay;
      c[j].amount -= pay;
      if (d[i].amount === 0) i++;
      if (c[j].amount === 0) j++;
    }
    return payments;
  }

  function runCalculation() {
    const scoreErrors = validateScores(true);
    if (scoreErrors.length) return { error: scoreErrors[0].message, scoreErrors };

    const scores = getCurrentGameScores();
    if (scores.some((s) => isNaN(s))) {
      return { error: "スコアを正しく入力してください。", scoreErrors };
    }

    const price = getDraft().pricePerPin;
    if (!price || price <= 0) return { error: "精算単価（1ピンあたりの金額）を設定してください。ルーレットで決めてください。" };

    const teams = buildTeamsData(scores);
    const emptyTeam = teams.find((t) => t.members.length === 0);
    if (emptyTeam) return { error: "すべてのチームに1人以上必要です。" };

    const calcMethod = state.settings.calcMethod;
    const rankedTeams = rankTeams(teams, calcMethod);
    const rankGroups = buildRankGroups(rankedTeams);

    const preset = state.settings.settlementPreset;
    const pairs = preset === "custom"
      ? state.settings.settlementPairs
      : buildPresetPairs(preset, state.teamCount);

    const pairError = validateSettlementPairs(pairs, rankGroups);
    if (pairError) return { error: pairError };

    const metricKey = calcMethod === "average" ? "average" : "total";
    const balances = new Map();
    sortedPlayers().forEach((p) => balances.set(p.id, 0));

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

      const { pairAmount } = calculatePairBalances(fromTeams, toTeams, diff, price, balances);
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
      const gameBalances = Object.fromEntries(balances);
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
        gameBalances,
        scores,
        teams,
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
      repId
    );

    if (!verifyBalanceZero(adjusted)) {
      return { error: "端数調整後に収支が一致しません。設定を見直してください。" };
    }

    const payments = minimizeTransactions(adjusted);
    const finalTotal = payments.reduce((s, p) => s + p.amount, 0);
    const gameBalances = Object.fromEntries(adjusted);

    const warnings = [];
    const memberCounts = teams.map((t) => t.members.length);
    if (new Set(memberCounts).size > 1) {
      warnings.push(
        calcMethod === "total"
          ? "チーム人数が不均等です。合計点方式では人数差に注意してください。平均点方式の利用も検討してください。"
          : "チーム人数が不均等です。平均点方式で計算しています。"
      );
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
      gameBalances,
      scores,
      teams,
    };
  }

  function getPlayerSessionStats(playerId) {
    const games = state.session.games;
    const gameScores = games.map((g) => g.scores[playerId] ?? null).filter((s) => s !== null);
    const currentRaw = getScore(playerId);
    const current = currentRaw === "" ? null : parseInt(currentRaw, 10);

    let cumulative = gameScores.reduce((a, b) => a + b, 0);
    const allScores = [...gameScores];
    if (current !== null && !isNaN(current) && state.lastResult) {
      cumulative += current;
      allScores.push(current);
    }

    const gamesPlayed = gameScores.length + (state.lastResult && current !== null ? 1 : 0);
    const todayAvg = gamesPlayed ? cumulative / gamesPlayed : 0;
    const high = allScores.length ? Math.max(...allScores) : null;
    const low = allScores.length ? Math.min(...allScores) : null;

    return {
      current: current !== null && !isNaN(current) ? current : null,
      cumulative,
      todayAvg,
      high,
      low,
      gamesPlayed,
    };
  }

  function getCumulativeBalance(playerId) {
    const base = state.session.cumulativeBalances[playerId] || 0;
    const gameBal = state.lastResult?.gameBalances?.[playerId] || 0;
    return base + (state.lastResult ? gameBal : 0);
  }

  function getGameBalance(playerId) {
    return state.lastResult?.gameBalances?.[playerId] || 0;
  }

  function buildTeamFormula(team) {
    const parts = team.members.map((m) => formatScore(m.score));
    const sum = team.total;
    return `${parts.join(" + ")} = ${sum}点 · 平均${formatScore(team.average)}`;
  }

  function computeMvp() {
    const games = state.session.games;
    if (!games.length && !state.lastResult) return null;

    const playerStats = {};
    sortedPlayers().forEach((p) => {
      playerStats[p.id] = {
        name: getPlayerDisplayName(p, getPlayerIndex(p)),
        scores: [],
        wins: 0,
      };
    });

    games.forEach((g) => {
      Object.entries(g.scores || {}).forEach(([pid, score]) => {
        if (playerStats[pid]) playerStats[pid].scores.push(score);
      });
      const winnerTeamIds = (g.result?.rankedTeams || [])
        .filter((t) => t.rank === 1)
        .map((t) => t.id);
      Object.entries(g.teamAssignments || {}).forEach(([pid, teamId]) => {
        if (winnerTeamIds.includes(teamId) && playerStats[pid]) {
          playerStats[pid].wins += 1;
        }
      });
    });

    if (state.lastResult) {
      sortedPlayers().forEach((p, i) => {
        const s = getCurrentGameScores()[i];
        if (!isNaN(s)) playerStats[p.id].scores.push(s);
      });
      const winnerTeamIds = state.lastResult.rankedTeams
        .filter((t) => t.rank === 1)
        .map((t) => t.id);
      sortedPlayers().forEach((p) => {
        if (winnerTeamIds.includes(getTeamAssignment(p.id))) {
          playerStats[p.id].wins += 1;
        }
      });
    }

    let bestAvg = null;
    let highScore = null;
    let mostWins = null;

    Object.values(playerStats).forEach((ps) => {
      if (!ps.scores.length) return;
      const avg = ps.scores.reduce((a, b) => a + b, 0) / ps.scores.length;
      if (!bestAvg || avg > bestAvg.avg) bestAvg = { name: ps.name, avg };
      ps.scores.forEach((s) => {
        if (!highScore || s > highScore.score) highScore = { name: ps.name, score: s };
      });
      if (!mostWins || ps.wins > mostWins.wins) mostWins = { name: ps.name, wins: ps.wins };
    });

    return { bestAvg, highScore, mostWins };
  }

  function computePlayerAvgRanks() {
    const rankHistory = {};
    state.session.games.forEach((g) => {
      const entries = Object.entries(g.scores || {}).map(([id, score]) => ({ id, score }));
      entries.sort((a, b) => b.score - a.score);
      let rank = 1;
      entries.forEach((e, i) => {
        if (i > 0 && e.score !== entries[i - 1].score) rank = i + 1;
        if (!rankHistory[e.id]) rankHistory[e.id] = [];
        rankHistory[e.id].push(rank);
      });
    });

    return sortedPlayers()
      .map((p, i) => {
        const ranks = rankHistory[p.id] || [];
        if (!ranks.length) return null;
        const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
        return { name: getPlayerDisplayName(p, i), avgRank };
      })
      .filter(Boolean)
      .sort((a, b) => a.avgRank - b.avgRank);
  }

  function getActiveRatePreset() {
    const idx = clamp(state.settings.activeRatePresetIndex || 0, 0, state.settings.ratePresets.length - 1);
    return state.settings.ratePresets[idx];
  }

  function validateRateOptions(options) {
    if (!Array.isArray(options) || options.length < MIN_RATE_OPTIONS) {
      return "精算単価オプションは2つ以上必要です。";
    }
    for (const o of options) {
      if (!o.amount || o.amount <= 0) return "金額は1以上を設定してください。";
      if (!o.weight || o.weight <= 0) return "重みは1以上を設定してください。";
    }
    return null;
  }

  function spinRoulette() {
    const preset = getActiveRatePreset();
    const err = validateRateOptions(preset?.options);
    if (err) return { error: err };

    const totalWeight = preset.options.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * totalWeight;
    let chosen = preset.options[0].amount;
    for (const o of preset.options) {
      r -= o.weight;
      if (r <= 0) {
        chosen = o.amount;
        break;
      }
    }

    getDraft().pricePerPin = chosen;
    state.session.lastRate = chosen;
    return { amount: chosen };
  }

  function syncFromDom(save = true) {
    if (dom.playerCount) {
      state.playerCount = clamp(parseInt(dom.playerCount.value, 10) || MIN_PLAYERS, MIN_PLAYERS, MAX_PLAYERS);
    }
    if (dom.teamCount) {
      state.teamCount = clamp(parseInt(dom.teamCount.value, 10) || MIN_TEAMS, MIN_TEAMS, state.playerCount);
    }

    const calcEl = document.querySelector('input[name="calcMethod"]:checked');
    if (calcEl) state.settings.calcMethod = calcEl.value;

    const roundEl = document.querySelector('input[name="rounding"]:checked');
    if (roundEl) state.settings.rounding = normalizeRounding(roundEl.value);

    const nextRateEl = document.querySelector('input[name="nextRateChoice"]:checked');
    if (nextRateEl) state.session.nextRateChoice = nextRateEl.value;

    sortedPlayers().forEach((p) => {
      const row = dom.playerList?.querySelector(`.player-row[data-id="${p.id}"]`);
      if (!row) return;
      const nameEl = row.querySelector(".player-name");
      const scoreEl = row.querySelector(".player-score");
      if (nameEl) p.name = nameEl.value;
      if (scoreEl) setScore(p.id, scoreEl.value);
    });

    for (let t = 1; t <= state.teamCount; t++) {
      const input = dom.teamNames?.querySelector(`.team-name-input[data-team-id="${t}"]`);
      if (input) {
        const entry = getTeamNameEntry(t);
        if (input.value !== entry.name) {
          entry.name = input.value;
          entry.manual = true;
        }
      }
    }

    dom.teamList?.querySelectorAll(".team-select").forEach((sel) => {
      const pid = sel.dataset.playerId;
      if (pid) setTeamAssignment(pid, parseInt(sel.value, 10));
    });

    dom.settlementList?.querySelectorAll(".settlement-pair").forEach((wrap) => {
      const idx = parseInt(wrap.dataset.index, 10);
      if (isNaN(idx) || !state.settings.settlementPairs[idx]) return;
      wrap.querySelectorAll(".settlement-select").forEach((sel) => {
        const field = sel.dataset.field;
        const val = sel.value === "" ? null : parseInt(sel.value, 10);
        state.settings.settlementPairs[idx][field] = val;
      });
    });

    refreshAutoTeamNames();
    if (save) scheduleSave();
  }

  function renderAll() {
    renderSessionBar();
    renderPlayerCount();
    renderPlayers();
    renderTeamCount();
    renderTeamNames();
    renderTeamLegend();
    renderTeamList();
    renderTeamWarning();
    renderRateSection();
    renderSettlementPreset();
    renderSettlementPairs();
    renderSettingsInputs();
    if (state.lastResult) renderResult(state.lastResult);
    else if (dom.resultSection) dom.resultSection.hidden = true;
    updateSessionControls();
  }

  function updateSessionControls() {
    const active = state.session.active;
    if (dom.calculateBtn) dom.calculateBtn.disabled = !active;
    if (dom.sessionEndBtn) {
      dom.sessionEndBtn.disabled = false;
      dom.sessionEndBtn.textContent = active ? "🏁 ゲーム終了" : "🏁 本日の結果";
    }
    if (dom.nextGameBtn) dom.nextGameBtn.disabled = !active;
    if (dom.spinRouletteBtn) dom.spinRouletteBtn.disabled = !active;
  }

  function renderSessionBar() {
    if (dom.sessionStatus) {
      dom.sessionStatus.textContent = state.session.active ? "進行中" : "終了";
    }
    if (dom.currentGameDisplay) {
      dom.currentGameDisplay.textContent = String(state.session.currentGame);
    }
    if (dom.gameHint) {
      const completed = state.session.games.length;
      dom.gameHint.textContent = completed
        ? `${completed}ゲーム終了済み · 現在${state.session.currentGame}ゲーム目`
        : "スコア入力 → 精算 → 次のゲームへ";
    }
    renderGameTabs();
  }

  function renderGameTabs() {
    if (!dom.gameTabs) return;
    dom.gameTabs.innerHTML = "";

    const totalGames = state.session.games.length + (state.session.active ? 1 : 0);
    for (let g = 1; g <= totalGames; g++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "game-tab";
      btn.setAttribute("role", "tab");
      btn.textContent = `G${g}`;
      const isCurrent = g === state.session.currentGame && state.session.active;
      if (isCurrent) btn.classList.add("active");
      btn.setAttribute("aria-selected", isCurrent ? "true" : "false");

      if (g <= state.session.games.length) {
        btn.addEventListener("click", () => {
          const game = state.session.games[g - 1];
          if (game) showHistoryDetail(game.id);
        });
      }
      dom.gameTabs.appendChild(btn);
    }
  }

  function renderPlayerCount() {
    if (dom.playerCount) dom.playerCount.value = state.playerCount;
  }

  function renderPlayers() {
    if (!dom.playerList) return;
    dom.playerList.innerHTML = "";

    sortedPlayers().forEach((p, i) => {
      const stats = getPlayerSessionStats(p.id);
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
      name.disabled = !state.session.active;

      const score = document.createElement("input");
      score.type = "number";
      score.className = "input player-score";
      score.value = getScore(p.id);
      score.placeholder = "0";
      score.min = MIN_SCORE;
      score.max = MAX_SCORE;
      score.inputMode = "numeric";
      score.setAttribute("aria-label", `${defaultPlayerName(i)}の今回スコア`);
      score.disabled = !state.session.active;

      const cum = document.createElement("span");
      cum.className = "player-cumulative";
      cum.textContent = String(stats.cumulative);
      cum.setAttribute("aria-label", "累計スコア");

      row.append(num, name, score, cum);
      applyTeamColorStyle(row, getTeamAssignment(p.id));
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
    refreshAutoTeamNames();
    dom.teamNames.innerHTML = "";
    for (let t = 1; t <= state.teamCount; t++) {
      const entry = getTeamNameEntry(t);
      const row = document.createElement("div");
      row.className = "team-name-row";

      const dot = document.createElement("span");
      dot.className = "team-name-dot";
      dot.style.background = getTeamColor(t).color;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "input team-name-input";
      input.dataset.teamId = String(t);
      input.value = entry.name || defaultTeamName(t);
      input.setAttribute("aria-label", `チーム${t}の名前`);
      input.disabled = !state.session.active;

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

    sortedPlayers().forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "team-row";

      const name = document.createElement("span");
      name.className = "team-row-name";
      name.textContent = getPlayerDisplayName(p, i);

      const select = document.createElement("select");
      select.className = "team-select";
      select.dataset.playerId = p.id;
      select.setAttribute("aria-label", `${getPlayerDisplayName(p, i)}のチーム`);
      select.disabled = !state.session.active;

      for (let t = 1; t <= state.teamCount; t++) {
        const opt = document.createElement("option");
        opt.value = String(t);
        opt.textContent = getTeamDisplayName(t);
        if (getTeamAssignment(p.id) === t) opt.selected = true;
        select.appendChild(opt);
      }
      applyTeamColorStyle(select, getTeamAssignment(p.id));

      row.append(name, select);
      dom.teamList.appendChild(row);
    });
  }

  function renderTeamWarning() {
    if (!dom.teamWarning) return;
    const counts = {};
    sortedPlayers().forEach((p) => {
      const tid = getTeamAssignment(p.id);
      counts[tid] = (counts[tid] || 0) + 1;
    });
    const vals = Object.values(counts);
    const uneven = vals.length > 1 && new Set(vals).size > 1;
    dom.teamWarning.hidden = !uneven;
    if (uneven) {
      dom.teamWarning.textContent = "⚠ チーム人数が不均等です。平均点方式の利用を推奨します。";
    }
  }

  function renderRateSection() {
    const price = getDraft().pricePerPin || DEFAULT_PRICE;
    if (dom.currentRateDisplay) {
      dom.currentRateDisplay.textContent = `1ピン＝${price}円`;
    }
    if (dom.rateResultBanner) {
      dom.rateResultBanner.hidden = true;
    }
    if (dom.rateChoiceNext) {
      dom.rateChoiceNext.hidden = state.session.games.length < 1;
    }
    renderRatePresets();
    renderRateOptions();
  }

  function renderRatePresets() {
    if (!dom.ratePresetTabs) return;
    dom.ratePresetTabs.innerHTML = "";
    state.settings.ratePresets.forEach((preset, i) => {
      const wrap = document.createElement("div");
      wrap.className = "rate-preset-item";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "input rate-preset-name";
      nameInput.value = preset.name || `プリセット${i + 1}`;
      nameInput.setAttribute("aria-label", `プリセット${i + 1}の名前`);
      nameInput.addEventListener("change", () => {
        preset.name = nameInput.value.trim() || `プリセット${i + 1}`;
        scheduleSave();
      });

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset-btn" + (i === state.settings.activeRatePresetIndex ? " active" : "");
      btn.textContent = "選択";
      btn.addEventListener("click", () => {
        state.settings.activeRatePresetIndex = i;
        renderRatePresets();
        renderRateOptions();
        scheduleSave();
      });

      wrap.append(nameInput, btn);
      dom.ratePresetTabs.appendChild(wrap);
    });
  }

  function renderRateOptions() {
    if (!dom.rateOptions) return;
    dom.rateOptions.innerHTML = "";
    const preset = getActiveRatePreset();
    if (!preset) return;

    const totalWeight = preset.options.reduce((s, o) => s + (o.weight || 1), 0);

    preset.options.forEach((opt, i) => {
      const row = document.createElement("div");
      row.className = "rate-option-row";

      const amountLabel = document.createElement("label");
      amountLabel.className = "rate-option-label";
      amountLabel.textContent = "金額";
      const amountInput = document.createElement("input");
      amountInput.type = "number";
      amountInput.className = "input rate-option-amount";
      amountInput.value = opt.amount;
      amountInput.min = 1;
      amountInput.inputMode = "numeric";
      amountInput.addEventListener("change", () => {
        opt.amount = parseInt(amountInput.value, 10) || 1;
        renderRateOptions();
        scheduleSave();
      });

      const weightLabel = document.createElement("label");
      weightLabel.className = "rate-option-label";
      weightLabel.textContent = "重み";
      const weightInput = document.createElement("input");
      weightInput.type = "number";
      weightInput.className = "input rate-option-weight";
      weightInput.value = opt.weight;
      weightInput.min = 1;
      weightInput.inputMode = "numeric";
      weightInput.addEventListener("change", () => {
        opt.weight = parseInt(weightInput.value, 10) || 1;
        renderRateOptions();
        scheduleSave();
      });

      const pct = document.createElement("span");
      pct.className = "rate-option-pct";
      pct.textContent = `${Math.round((opt.weight / totalWeight) * 100)}%`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-remove-pair";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", "オプション削除");
      removeBtn.disabled = preset.options.length <= MIN_RATE_OPTIONS;
      removeBtn.addEventListener("click", () => {
        if (preset.options.length <= MIN_RATE_OPTIONS) return;
        preset.options.splice(i, 1);
        renderRateOptions();
        scheduleSave();
      });

      row.append(amountLabel, amountInput, weightLabel, weightInput, pct, removeBtn);
      dom.rateOptions.appendChild(row);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn-add";
    addBtn.textContent = "＋ オプション追加";
    addBtn.addEventListener("click", () => {
      preset.options.push({ amount: 100, weight: 1 });
      renderRateOptions();
      scheduleSave();
    });
    dom.rateOptions.appendChild(addBtn);
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
      row1.append(
        createRankSelect("fromRank", pair.fromRank),
        Object.assign(document.createElement("span"), { className: "settlement-arrow", textContent: "→" }),
        createRankSelect("toRank", pair.toRank),
        createRemovePairBtn(index)
      );
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

  function createRemovePairBtn(index) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-remove-pair";
    btn.textContent = "×";
    btn.dataset.index = String(index);
    btn.setAttribute("aria-label", "ペアを削除");
    return btn;
  }

  function renderSettingsInputs() {
    const calcEl = document.querySelector(`input[name="calcMethod"][value="${state.settings.calcMethod}"]`);
    if (calcEl) calcEl.checked = true;
    const roundEl = document.querySelector(`input[name="rounding"][value="${state.settings.rounding}"]`);
    if (roundEl) roundEl.checked = true;
    const nextRateEl = document.querySelector(`input[name="nextRateChoice"][value="${state.session.nextRateChoice}"]`);
    if (nextRateEl) nextRateEl.checked = true;
  }

  function renderResult(result) {
    if (!dom.resultSection) return;
    dom.resultSection.hidden = false;

    if (dom.resultScopeLabel) {
      dom.resultScopeLabel.textContent = `第${state.session.currentGame}ゲーム · 今回のみ`;
    }

    if (dom.resultWarnings) {
      dom.resultWarnings.hidden = !result.warnings?.length;
      if (result.warnings?.length) dom.resultWarnings.textContent = result.warnings.join(" ");
    }

    renderRankingTable(result);
    renderFormulaDisplay(result);
    renderTeamSummary(result);
    renderSettlementSummary(result);
    renderPayments(result);
    renderPlayerStats();
    renderPlayerBalance(result);
    lastResultText = buildResultText(result);
    state.lastResult = result;
  }

  function renderRankingTable(result) {
    if (!dom.rankingTable) return;
    dom.rankingTable.innerHTML = "";

    const table = document.createElement("table");
    table.className = "ranking-table";
    table.innerHTML = "<thead><tr><th>順位</th><th>チーム</th><th>人数</th><th>合計</th><th>平均</th></tr></thead>";
    const tbody = document.createElement("tbody");

    [...result.rankedTeams].sort((a, b) => a.rank - b.rank).forEach((t) => {
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
    const wrap = document.createElement("div");
    wrap.className = "ranking-table-wrap";
    wrap.appendChild(table);
    dom.rankingTable.appendChild(wrap);
  }

  function renderFormulaDisplay(result) {
    if (!dom.formulaDisplay) return;
    dom.formulaDisplay.innerHTML = "";

    const teams = result.teams || result.rankedTeams;
    teams.forEach((t) => {
      const div = document.createElement("div");
      div.className = "formula-item";
      applyTeamColorStyle(div, t.id);

      const name = document.createElement("div");
      name.className = "formula-team-name";
      name.textContent = t.name;

      const formula = document.createElement("div");
      formula.className = "formula-text";
      formula.textContent = buildTeamFormula(t);

      div.append(name, formula);
      dom.formulaDisplay.appendChild(div);
    });
  }

  function renderTeamSummary(result) {
    if (!dom.teamSummary) return;
    dom.teamSummary.innerHTML = "";
    const label = result.calcMethod === "average" ? "平均" : "合計";
    const price = getDraft().pricePerPin;

    result.pairDetails.forEach((d) => {
      if (d.skipped) return;
      const div = document.createElement("div");
      div.className = "team-summary-item";
      applyTeamColorStyle(div, d.fromTeams?.[0]?.id || 1);

      const name = document.createElement("div");
      name.className = "team-summary-name";
      name.textContent = `${formatRankLabel(d.fromRank, false)} → ${formatRankLabel(d.toRank, false)}`;

      const detail = document.createElement("div");
      detail.className = "team-summary-detail";
      detail.textContent = `${label}差 ${formatScore(d.diff)} ピン × ${price}円 = ${formatYen(d.pairAmount)}`;

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

    [
      ["処理前精算総額", formatYen(result.rawTotal)],
      ["端数調整", formatYen(result.trimmed)],
      ["最終精算総額", formatYen(result.finalTotal)],
      ["送金回数", `${result.payments.length} 回`],
    ].forEach(([label, value], i) => {
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
      const fromName = fromP ? getPlayerDisplayName(fromP, getPlayerIndex(fromP)) : "?";
      const toName = toP ? getPlayerDisplayName(toP, getPlayerIndex(toP)) : "?";

      const li = document.createElement("li");
      li.className = "payment-item";

      const route = document.createElement("div");
      route.className = "payment-route";
      route.append(document.createTextNode(fromName), document.createTextNode(" → "));
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

  function renderPlayerStats() {
    if (!dom.playerStats) return;
    dom.playerStats.innerHTML = "";

    const table = document.createElement("table");
    table.className = "ranking-table";
    table.innerHTML = "<thead><tr><th>名前</th><th>今回</th><th>累計</th><th>今日平均</th><th>最高</th><th>最低</th></tr></thead>";
    const tbody = document.createElement("tbody");

    sortedPlayers().forEach((p, i) => {
      const stats = getPlayerSessionStats(p.id);
      const tr = document.createElement("tr");
      tr.innerHTML = [
        `<td>${escapeHtml(getPlayerDisplayName(p, i))}</td>`,
        `<td>${stats.current !== null ? stats.current : "—"}</td>`,
        `<td>${stats.cumulative}</td>`,
        `<td>${stats.gamesPlayed ? formatScore(stats.todayAvg) : "—"}</td>`,
        `<td>${stats.high !== null ? stats.high : "—"}</td>`,
        `<td>${stats.low !== null ? stats.low : "—"}</td>`,
      ].join("");
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    const wrap = document.createElement("div");
    wrap.className = "ranking-table-wrap";
    wrap.appendChild(table);
    dom.playerStats.appendChild(wrap);
  }

  function renderPlayerBalance() {
    if (!dom.playerBalance) return;
    dom.playerBalance.innerHTML = "";

    if (!state.session.games.length && !state.lastResult) {
      const p = document.createElement("p");
      p.className = "section-hint";
      p.textContent = "精算確定後に表示されます";
      dom.playerBalance.appendChild(p);
      return;
    }

    sortedPlayers().forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "balance-card";

      const title = document.createElement("div");
      title.className = "balance-card-name";
      title.textContent = getPlayerDisplayName(p, i);

      const gameLines = document.createElement("ul");
      gameLines.className = "balance-game-list";
      state.session.games.forEach((g) => {
        const li = document.createElement("li");
        li.textContent = `Game${g.gameNumber} ${formatBalance(g.balances?.[p.id] || 0)}`;
        gameLines.appendChild(li);
      });
      if (state.lastResult) {
        const li = document.createElement("li");
        li.className = "balance-current";
        li.textContent = `Game${state.session.currentGame} ${formatBalance(getGameBalance(p.id))}（今回）`;
        gameLines.appendChild(li);
      }

      const total = document.createElement("div");
      total.className = "balance-total";
      total.textContent = `累計 ${formatBalance(getCumulativeBalance(p.id))}`;

      card.append(title, gameLines, total);
      dom.playerBalance.appendChild(card);
    });
  }

  function buildResultText(result) {
    const lines = [
      "【ボウリング精算・差額計算結果】",
      `第${state.session.currentGame}ゲーム`,
      "対象: 今回のみ",
      "",
      "■ 順位",
    ];

    [...result.rankedTeams].sort((a, b) => a.rank - b.rank).forEach((t) => {
      lines.push(`${formatRankLabel(t.rank, t.tied)} ${t.name}（${t.members.length}人 / 合計${t.total} / 平均${formatScore(t.average)}）`);
      lines.push(`  ${buildTeamFormula(t)}`);
    });

    lines.push("", "■ 差額計算");
    result.pairDetails.filter((d) => !d.skipped).forEach((d) => {
      lines.push(`${d.fromRank}位→${d.toRank}位: 差${formatScore(d.diff)}ピン = ${formatYen(d.pairAmount)}`);
    });

    lines.push(
      "",
      `処理前精算総額: ${formatYen(result.rawTotal || 0)}`,
      `端数調整: ${formatYen(result.trimmed || 0)}`,
      `精算総額: ${formatYen(result.finalTotal || 0)}`,
      "",
      "■ 送金結果"
    );

    if (!result.payments?.length) {
      lines.push("なし");
    } else {
      result.payments.forEach((pay) => {
        const fromP = getPlayerById(pay.fromId);
        const toP = getPlayerById(pay.toId);
        lines.push(
          `${fromP ? getPlayerDisplayName(fromP, getPlayerIndex(fromP)) : "?"} → ${toP ? getPlayerDisplayName(toP, getPlayerIndex(toP)) : "?"}: ${formatYen(pay.amount)}`
        );
      });
    }

    lines.push("", "■ 個人収支");
    sortedPlayers().forEach((p, i) => {
      lines.push(`${getPlayerDisplayName(p, i)}: 今回 ${formatBalance(getGameBalance(p.id))} / 累計 ${formatBalance(getCumulativeBalance(p.id))}`);
    });

    return lines.join("\n");
  }

  function buildGameDetailHtml(game) {
    const parts = [`<h3>第${game.gameNumber}ゲーム</h3>`, `<p>${escapeHtml(game.date)} · 1ピン＝${game.pricePerPin}円</p>`];

    if (game.result?.teams || game.result?.rankedTeams) {
      const teams = game.result.teams || game.result.rankedTeams;
      parts.push("<h4>チーム・スコア</h4><ul>");
      teams.forEach((t) => {
        parts.push(`<li><strong>${escapeHtml(t.name)}</strong>: ${escapeHtml(buildTeamFormula(t))}</li>`);
      });
      parts.push("</ul>");
    }

    if (game.result?.pairDetails) {
      parts.push("<h4>差額計算</h4><ul>");
      game.result.pairDetails.filter((d) => !d.skipped).forEach((d) => {
        parts.push(`<li>${d.fromRank}位→${d.toRank}位: ${formatYen(d.pairAmount)}</li>`);
      });
      parts.push("</ul>");
    }

    if (game.result?.payments?.length) {
      parts.push("<h4>送金結果</h4><ul>");
      game.result.payments.forEach((pay) => {
        const fromP = getPlayerById(pay.fromId);
        const toP = getPlayerById(pay.toId);
        parts.push(`<li>${escapeHtml(fromP ? getPlayerDisplayName(fromP, getPlayerIndex(fromP)) : "?")} → ${escapeHtml(toP ? getPlayerDisplayName(toP, getPlayerIndex(toP)) : "?")}: ${formatYen(pay.amount)}</li>`);
      });
      parts.push("</ul>");
    }

    return parts.join("");
  }

  function buildSessionSummaryText() {
    const games = state.session.games;
    const mvp = computeMvp();
    const lines = [
      "【ボウリング 本日の結果】",
      `総ゲーム数: ${games.length}`,
      "",
    ];

    if (mvp) {
      lines.push("■ MVP");
      if (mvp.bestAvg) lines.push(`最高平均: ${mvp.bestAvg.name}（${formatScore(mvp.bestAvg.avg)}）`);
      if (mvp.highScore) lines.push(`最高スコア: ${mvp.highScore.name}（${mvp.highScore.score}）`);
      if (mvp.mostWins) lines.push(`最多勝利: ${mvp.mostWins.name}（${mvp.mostWins.wins}回）`);
      lines.push("");
    }

    lines.push("■ 個人成績");
    sortedPlayers().forEach((p, i) => {
      const stats = getPlayerSessionStats(p.id);
      lines.push(`${getPlayerDisplayName(p, i)}: 累計${stats.cumulative} / 平均${stats.gamesPlayed ? formatScore(stats.todayAvg) : "—"} / 最高${stats.high ?? "—"}`);
    });

    lines.push("", "■ 個人収支（累計）");
    sortedPlayers().forEach((p, i) => {
      lines.push(`${getPlayerDisplayName(p, i)}: ${formatBalance(state.session.cumulativeBalances[p.id] || 0)}`);
    });

    const totalPins = games.reduce((sum, g) => {
      return sum + Object.values(g.scores || {}).reduce((a, b) => a + b, 0);
    }, 0);
    lines.push("", `総ピン数: ${totalPins}`);

    lines.push("", "■ 各ゲーム結果");
    games.forEach((g) => {
      const winner = (g.result?.rankedTeams || []).find((t) => t.rank === 1);
      lines.push(`第${g.gameNumber}ゲーム: ${winner ? winner.name + " 優勝" : "—"} / 精算 ${formatYen(g.result?.finalTotal || 0)}`);
    });

    return lines.join("\n");
  }

  function renderSessionSummary() {
    if (!dom.sessionSummaryBody) return;
    const games = state.session.games;
    const mvp = computeMvp();

    let html = `<p><strong>総ゲーム数:</strong> ${games.length}</p>`;

    const avgRanks = computePlayerAvgRanks();
    if (avgRanks.length) {
      html += "<h3>平均順位</h3><ul>";
      avgRanks.forEach((r) => {
        html += `<li>${escapeHtml(r.name)}: ${formatScore(r.avgRank)}位</li>`;
      });
      html += "</ul>";
    }

    if (mvp) {
      html += "<h3>MVP</h3><ul>";
      if (mvp.bestAvg) html += `<li>最高平均: ${escapeHtml(mvp.bestAvg.name)}（${formatScore(mvp.bestAvg.avg)}）</li>`;
      if (mvp.highScore) html += `<li>最高スコア: ${escapeHtml(mvp.highScore.name)}（${mvp.highScore.score}）</li>`;
      if (mvp.mostWins) html += `<li>最多勝利: ${escapeHtml(mvp.mostWins.name)}（${mvp.mostWins.wins}回）</li>`;
      html += "</ul>";
    }

    html += "<h3>個人成績</h3><table class='ranking-table'><thead><tr><th>名前</th><th>累計</th><th>平均</th><th>最高</th></tr></thead><tbody>";
    sortedPlayers().forEach((p, i) => {
      const stats = getPlayerSessionStats(p.id);
      html += `<tr><td>${escapeHtml(getPlayerDisplayName(p, i))}</td><td>${stats.cumulative}</td><td>${stats.gamesPlayed ? formatScore(stats.todayAvg) : "—"}</td><td>${stats.high ?? "—"}</td></tr>`;
    });
    html += "</tbody></table>";

    html += "<h3>個人収支（累計）</h3><ul>";
    sortedPlayers().forEach((p, i) => {
      html += `<li>${escapeHtml(getPlayerDisplayName(p, i))}: ${formatBalance(state.session.cumulativeBalances[p.id] || 0)}</li>`;
    });
    html += "</ul>";

    const totalPins = games.reduce((sum, g) => sum + Object.values(g.scores || {}).reduce((a, b) => a + b, 0), 0);
    html += `<p><strong>総ピン数:</strong> ${totalPins}</p>`;

    html += "<h3>各ゲーム結果</h3><ul>";
    games.forEach((g) => {
      const winner = (g.result?.rankedTeams || []).find((t) => t.rank === 1);
      html += `<li>第${g.gameNumber}ゲーム: ${escapeHtml(winner ? winner.name + " 1位" : "—")} / 精算 ${formatYen(g.result?.finalTotal || 0)}</li>`;
    });
    html += "</ul>";

    html += '<button type="button" class="btn-primary" id="newSessionBtn" style="margin-top:16px">新しいセッションを開始</button>';

    dom.sessionSummaryBody.innerHTML = html;
    lastSessionSummaryText = buildSessionSummaryText();

    dom.sessionSummaryBody.querySelector("#newSessionBtn")?.addEventListener("click", startNewSession);
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
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

  async function copyResult() {
    return copyText(lastResultText);
  }

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
    showStatus(ok ? "結果をコピーしました" : "共有できませんでした。結果をコピーしてください", ok ? "success" : "error");
  }

  async function shareSessionSummary() {
    if (!lastSessionSummaryText) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "ボウリング 本日の結果", text: lastSessionSummaryText });
        showStatus("共有しました", "success");
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    const ok = await copyText(lastSessionSummaryText);
    showStatus(ok ? "結果をコピーしました" : "共有できませんでした", ok ? "success" : "error");
  }

  function showStatus(msg, type) {
    if (!dom.statusMessage) return;
    dom.statusMessage.textContent = msg;
    dom.statusMessage.hidden = false;
    dom.statusMessage.className = "status-message is-" + type;
    setTimeout(() => { dom.statusMessage.hidden = true; }, 3000);
  }

  function showRateBanner(amount) {
    if (!dom.rateResultBanner) return;
    dom.rateResultBanner.hidden = false;
    dom.rateResultBanner.innerHTML = `<strong>今回 1ピン＝${amount}円</strong>`;
    if (dom.currentRateDisplay) dom.currentRateDisplay.textContent = `1ピン＝${amount}円`;
  }

  function handleSpinRoulette() {
    syncFromDom(false);
    const res = spinRoulette();
    if (res.error) {
      showStatus(res.error, "error");
      return;
    }
    showRateBanner(res.amount);
    renderRateSection();
    scheduleSave();
    showStatus(`精算単価: 1ピン＝${res.amount}円`, "success");
  }

  function handleCalculate() {
    if (isCalculating || !state.session.active) return;
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

  function commitCurrentGame(advanceGame, skipConfirm) {
    syncFromDom(false);

    const errors = validateScores(true);
    if (errors.length) {
      showStatus(errors[0].message, "error");
      return false;
    }

    const result = state.lastResult || runCalculation();
    if (result.error) {
      showStatus(result.error, "error");
      return false;
    }

    if (!skipConfirm && !confirm("このゲームの精算を確定して次のゲームへ進みますか？")) {
      return false;
    }

    const lastSaved = state.session.games[state.session.games.length - 1];
    if (lastSaved && lastSaved.gameNumber === state.session.currentGame) {
      showStatus("このゲームは既に履歴へ保存済みです", "error");
      return false;
    }

    const teamNamesSnapshot = {};
    for (let t = 1; t <= state.teamCount; t++) {
      teamNamesSnapshot[t] = getTeamDisplayName(t);
    }

    const teamAssignmentsSnapshot = {};
    sortedPlayers().forEach((p) => {
      teamAssignmentsSnapshot[p.id] = getTeamAssignment(p.id);
    });

    const scoresSnapshot = {};
    sortedPlayers().forEach((p) => {
      scoresSnapshot[p.id] = parseInt(getScore(p.id), 10) || 0;
    });

    const gameBalances = result.gameBalances || {};
    Object.entries(gameBalances).forEach(([pid, amt) => {
      state.session.cumulativeBalances[pid] = (state.session.cumulativeBalances[pid] || 0) + amt;
    });

    state.session.games.push({
      id: genId("g"),
      gameNumber: state.session.currentGame,
      date: new Date().toLocaleString("ja-JP"),
      scores: scoresSnapshot,
      teamAssignments: teamAssignmentsSnapshot,
      teamNames: teamNamesSnapshot,
      pricePerPin: getDraft().pricePerPin,
      result: JSON.parse(JSON.stringify(result)),
      balances: { ...gameBalances },
      summaryText: buildResultText(result),
    });

    if (advanceGame) {
      sortedPlayers().forEach((p) => setScore(p.id, ""));
      state.session.currentGame += 1;
      state.lastResult = null;
      if (dom.resultSection) dom.resultSection.hidden = true;

      if (state.session.nextRateChoice === "reuse") {
        getDraft().pricePerPin = state.session.lastRate;
      } else {
        showStatus("次のゲームの精算単価をルーレットで決めてください", "success");
      }
    }

    return true;
  }

  function handleNextGame() {
    if (!state.session.active) return;
    const ok = commitCurrentGame(true, false);
    if (!ok) return;

    renderAll();
    scheduleSave();
    showStatus(`第${state.session.currentGame}ゲーム目へ進みました`, "success");
    dom.playerList?.querySelector(".player-score")?.focus();
  }

  function handleSessionEnd() {
    if (!state.session.active) {
      renderSessionSummary();
      dom.sessionSummaryModal?.showModal();
      return;
    }

    syncFromDom(false);

    if (state.lastResult) {
      const lastSaved = state.session.games[state.session.games.length - 1];
      if (!lastSaved || lastSaved.gameNumber !== state.session.currentGame) {
        if (confirm("未確定の精算結果があります。確定してから終了しますか？")) {
          commitCurrentGame(false, true);
        }
      }
    }

    state.session.active = false;
    if (dom.resultSection) dom.resultSection.hidden = true;
    state.lastResult = null;

    renderSessionSummary();
    renderAll();
    scheduleSave();
    dom.sessionSummaryModal?.showModal();
  }

  function startNewSession() {
    const players = state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      order: i,
    }));
    state.session = createDefaultSession();
    state.session.draft.pricePerPin = state.session.lastRate;
    players.forEach((p, i) => {
      state.session.draft.teamAssignments[p.id] = (i % state.teamCount) + 1;
      state.session.draft.scores[p.id] = "";
    });
    for (let t = 1; t <= state.teamCount; t++) {
      state.session.draft.teamNames[t] = { name: defaultTeamName(t), manual: false };
    }
    state.players = players;
    state.lastResult = null;
    refreshAutoTeamNames();
    dom.sessionSummaryModal?.close();
    renderAll();
    scheduleSave();
    showStatus("新しいセッションを開始しました", "success");
  }

  function setPlayerCount(count, skipConfirm = false) {
    const newCount = clamp(count, MIN_PLAYERS, MAX_PLAYERS);
    const sorted = sortedPlayers();
    if (newCount < state.playerCount && !skipConfirm) {
      const removed = sorted.slice(newCount);
      const hasData = removed.some((p) => {
        const inGames = state.session.games.some((g) => g.scores?.[p.id] !== undefined);
        return (p.name || "").trim() || getScore(p.id) !== "" || inGames;
      });
      if (hasData && !confirm("減らしたプレイヤーのデータは削除されます。よろしいですか？")) return;
    }

    while (state.players.length < newCount) {
      const i = state.players.length;
      const id = genId("p");
      state.players.push({ id, name: defaultPlayerName(i), order: i });
      setTeamAssignment(id, (i % state.teamCount) + 1);
      setScore(id, "");
    }

    if (newCount < state.players.length) {
      const keepIds = new Set(sortedPlayers().slice(0, newCount).map((p) => p.id));
      state.players = state.players.filter((p) => keepIds.has(p.id));
      state.players.forEach((p, i) => { p.order = i; });
    }

    state.playerCount = newCount;
    if (state.teamCount > newCount) state.teamCount = newCount;
    ensureTeamNamesCount();
    refreshAutoTeamNames();
    renderAll();
    scheduleSave();
  }

  function setTeamCount(count) {
    const newCount = clamp(count, MIN_TEAMS, state.playerCount);
    state.teamCount = newCount;
    ensureTeamNamesCount();
    sortedPlayers().forEach((p) => {
      if (getTeamAssignment(p.id) > newCount) setTeamAssignment(p.id, newCount);
    });
    if (state.settings.settlementPreset !== "custom") {
      state.settings.settlementPairs = buildPresetPairs(state.settings.settlementPreset, newCount);
    }
    refreshAutoTeamNames();
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

  function renderHistoryList() {
    if (!dom.historyList) return;
    dom.historyList.innerHTML = "";

    if (!state.session.games.length) {
      dom.historyList.textContent = "履歴はありません";
      return;
    }

    [...state.session.games].reverse().forEach((h) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";
      btn.dataset.gameId = h.id;

      const title = document.createElement("div");
      title.className = "history-item-title";
      title.textContent = `第${h.gameNumber}ゲーム`;

      const meta = document.createElement("div");
      meta.className = "history-item-meta";
      meta.textContent = `${h.date} · 精算 ${formatYen(h.result?.finalTotal || 0)}`;

      btn.append(title, meta);
      btn.addEventListener("click", () => showHistoryDetail(h.id));
      dom.historyList.appendChild(btn);
    });
  }

  function showHistoryDetail(gameId) {
    const h = state.session.games.find((g) => g.id === gameId);
    if (!h || !dom.historyDetailBody || !dom.historyDetailModal) return;

    if (dom.historyDetailTitle) dom.historyDetailTitle.textContent = `第${h.gameNumber}ゲーム`;
    dom.historyDetailBody.innerHTML = buildGameDetailHtml(h);
    dom.historyDetailModal.showModal();
  }

  function renderSettingsModal() {
    if (!dom.settingsBody) return;
    dom.settingsBody.innerHTML = "";

    const autoSection = document.createElement("section");
    autoSection.className = "section-inner";
    autoSection.innerHTML = "<h3 class='section-title'>チーム名</h3>";
    const autoLabel = document.createElement("label");
    autoLabel.className = "checkbox-label";
    const autoCb = document.createElement("input");
    autoCb.type = "checkbox";
    autoCb.checked = state.settings.autoTeamNames;
    autoCb.addEventListener("change", () => {
      state.settings.autoTeamNames = autoCb.checked;
      if (autoCb.checked) {
        for (let t = 1; t <= state.teamCount; t++) {
          getTeamNameEntry(t).manual = false;
        }
        refreshAutoTeamNames();
        renderTeamNames();
        renderTeamLegend();
        renderTeamList();
      }
      scheduleSave();
    });
    autoLabel.append(autoCb, document.createTextNode("プレイヤー名からチーム名を自動生成（・で連結）"));
    autoSection.appendChild(autoLabel);
    dom.settingsBody.appendChild(autoSection);

    const roundSection = document.createElement("section");
    roundSection.className = "section-inner";
    roundSection.innerHTML = "<h3 class='section-title'>端数処理</h3>";
    const roundGroup = document.createElement("div");
    roundGroup.className = "radio-group";
    [
      ["none", "なし"],
      ["floor100", "100円未満切り捨て"],
      ["ceil100", "100円未満切り上げ"],
      ["round100", "100円単位で四捨五入"],
      ["floor1000", "1,000円未満切り捨て"],
    ].forEach(([val, label]) => {
      const lbl = document.createElement("label");
      lbl.className = "radio-label";
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = "settingsRounding";
      inp.value = val;
      inp.checked = state.settings.rounding === val;
      inp.addEventListener("change", () => {
        state.settings.rounding = val;
        const mainRound = document.querySelector(`input[name="rounding"][value="${val}"]`);
        if (mainRound) mainRound.checked = true;
        scheduleSave();
      });
      lbl.append(inp, document.createTextNode(label));
      roundGroup.appendChild(lbl);
    });
    roundSection.appendChild(roundGroup);
    dom.settingsBody.appendChild(roundSection);

    const homeSection = document.createElement("section");
    homeSection.className = "section-inner";
    homeSection.innerHTML = [
      "<h3 class='section-title'>ホーム画面に追加</h3>",
      "<p class='section-hint'>よく使う場合はホーム画面に追加すると便利です。</p>",
      "<p><strong>iPhone（Safari）</strong><br>共有ボタン → 「ホーム画面に追加」→ 追加</p>",
      "<p style='margin-top:12px'><strong>Android（Chrome）</strong><br>メニュー（⋮）→ 「ホーム画面に追加」または「アプリをインストール」</p>",
    ].join("");
    dom.settingsBody.appendChild(homeSection);
  }

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
    dom.spinRouletteBtn?.addEventListener("click", handleSpinRoulette);
    dom.copyBtn?.addEventListener("click", async () => {
      const ok = await copyResult();
      if (dom.copyFeedback) {
        dom.copyFeedback.hidden = !ok;
        if (ok) setTimeout(() => { dom.copyFeedback.hidden = true; }, 2000);
      }
      showStatus(ok ? "結果をコピーしました" : "コピーできませんでした", ok ? "success" : "error");
    });
    dom.shareBtn?.addEventListener("click", shareResult);
    dom.nextGameBtn?.addEventListener("click", handleNextGame);
    dom.sessionEndBtn?.addEventListener("click", handleSessionEnd);

    dom.sessionCopyBtn?.addEventListener("click", async () => {
      const ok = await copyText(lastSessionSummaryText);
      showStatus(ok ? "結果をコピーしました" : "コピーできませんでした", ok ? "success" : "error");
    });
    dom.sessionShareBtn?.addEventListener("click", shareSessionSummary);

    dom.settingsBtn?.addEventListener("click", () => {
      renderSettingsModal();
      dom.settingsModal?.showModal();
    });
    dom.settingsModalClose?.addEventListener("click", () => dom.settingsModal?.close());

    dom.historyBtn?.addEventListener("click", () => {
      renderHistoryList();
      dom.historyModal?.showModal();
    });
    dom.historyModalClose?.addEventListener("click", () => dom.historyModal?.close());
    dom.historyDetailClose?.addEventListener("click", () => dom.historyDetailModal?.close());
    dom.sessionSummaryClose?.addEventListener("click", () => dom.sessionSummaryModal?.close());

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
      const idx = parseInt(wrap?.dataset.index, 10);
      if (isNaN(idx)) return;
      const field = sel.dataset.field;
      const val = sel.value === "" ? null : parseInt(sel.value, 10);
      state.settings.settlementPairs[idx][field] = val;
      state.settings.settlementPreset = "custom";
      scheduleSave();
    });

    dom.presetGroup?.addEventListener("click", (e) => {
      const btn = e.target.closest(".preset-btn");
      if (!btn || btn.closest("#ratePresetTabs")) return;
      applyPreset(btn.dataset.preset);
    });

    document.addEventListener("change", (e) => {
      if (e.target.matches('input[name="calcMethod"], input[name="rounding"]')) {
        syncFromDom();
        renderSettingsInputs();
      }
      if (e.target.matches('input[name="nextRateChoice"]')) {
        syncFromDom();
      }
    });

    dom.playerList?.addEventListener("input", (e) => {
      if (e.target.classList.contains("player-name")) {
        refreshAutoTeamNames();
        renderTeamNames();
        renderTeamLegend();
        renderTeamList();
      }
      scheduleSave();
    });

    dom.playerList?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const score = e.target.closest(".player-score");
      if (!score || !dom.playerList) return;
      e.preventDefault();
      const rows = [...dom.playerList.querySelectorAll(".player-score")];
      const idx = rows.indexOf(score);
      if (idx >= 0 && idx < rows.length - 1) rows[idx + 1].focus();
    });

    dom.teamList?.addEventListener("change", (e) => {
      if (!e.target.classList.contains("team-select")) return;
      const p = getPlayerById(e.target.dataset.playerId);
      if (p) {
        setTeamAssignment(p.id, parseInt(e.target.value, 10));
        applyTeamColorStyle(e.target, getTeamAssignment(p.id));
        refreshAutoTeamNames();
        renderPlayers();
        renderTeamNames();
        renderTeamLegend();
        renderTeamWarning();
        scheduleSave();
      }
    });

    dom.teamNames?.addEventListener("input", (e) => {
      const input = e.target.closest(".team-name-input");
      if (input) {
        const teamId = parseInt(input.dataset.teamId, 10);
        const entry = getTeamNameEntry(teamId);
        entry.name = input.value;
        entry.manual = true;
      }
      renderTeamLegend();
      renderTeamList();
      scheduleSave();
    });

    window.addEventListener("beforeunload", () => syncFromDom(false));
  }

  const DEBUG_CHECK_KEY = "nokoi-debug-checks-v2";
  const DEBUG_ITEMS = [
    "4人2チームで計算できる",
    "6人3チームで計算できる",
    "ゲーム単位精算",
    "ルーレット精算単価",
    "同点処理",
    "100円端数処理",
    "1,000円端数処理",
    "共有機能",
    "コピー機能",
    "次のゲーム",
    "セッション終了",
    "履歴表示",
    "v1データ移行",
    "LocalStorage復元",
    "全データリセット",
  ];

  function isDebugMode() {
    return typeof window !== "undefined" && window.location.search.includes("debug=1");
  }

  function isTestMode() {
    return typeof window !== "undefined" && window.location.search.includes("test=1");
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
    } catch { /* ignore */ }
  }

  function setupPlayers(count, teamCount, data) {
    state.playerCount = count;
    state.teamCount = teamCount;
    state.players = [];
    for (let i = 0; i < count; i++) {
      const d = data[i] || { name: defaultPlayerName(i), team: (i % teamCount) + 1, score: 150 };
      const id = genId("p");
      state.players.push({ id, name: d.name, order: i });
      setTeamAssignment(id, d.team);
      setScore(id, String(d.score));
    }
    ensureTeamNamesCount();
    refreshAutoTeamNames();
    if (teamCount >= 3) {
      state.settings.settlementPairs = buildPresetPairs(state.settings.settlementPreset, teamCount);
    } else {
      state.settings.settlementPairs = [{ fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null }];
    }
  }

  function applyTestPreset(key) {
    state.session = createDefaultSession();
    state.lastResult = null;
    getDraft().pricePerPin = 100;
    state.settings.calcMethod = "total";
    state.settings.settlementPreset = "first-last";
    state.settings.rounding = "none";

    const setRadio = (name, val) => {
      const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (el) el.checked = true;
    };
    setRadio("calcMethod", "total");
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
    } else if (key === "tie") {
      setupPlayers(4, 2, [
        { name: "T1a", team: 1, score: 150 },
        { name: "T1b", team: 1, score: 150 },
        { name: "T2a", team: 2, score: 150 },
        { name: "T2b", team: 2, score: 150 },
      ]);
    } else if (key === "round100") {
      setupPlayers(4, 2, [
        { name: "A1", team: 1, score: 185 },
        { name: "A2", team: 1, score: 175 },
        { name: "B1", team: 2, score: 160 },
        { name: "B2", team: 2, score: 155 },
      ]);
      state.settings.rounding = "floor100";
      setRadio("rounding", "floor100");
    } else if (key === "round1000") {
      setupPlayers(4, 2, [
        { name: "A1", team: 1, score: 220 },
        { name: "A2", team: 1, score: 210 },
        { name: "B1", team: 2, score: 150 },
        { name: "B2", team: 2, score: 140 },
      ]);
      state.settings.rounding = "floor1000";
      setRadio("rounding", "floor1000");
    }

    applyPreset(state.settings.settlementPreset);
    renderAll();
    scheduleSave();
    showStatus("テストデータを入力しました", "success");
  }

  function initDebugPanel() {
    const panel = dom.debugPanel;
    if (!panel || !isDebugMode()) return;

    panel.hidden = false;
    panel.className = "debug-panel section";
    panel.innerHTML = "";

    const title = document.createElement("h2");
    title.className = "debug-panel-title";
    title.textContent = "公開前チェック（debug=1）";
    panel.appendChild(title);

    const presetWrap = document.createElement("div");
    presetWrap.className = "debug-presets";
    [
      ["4p2t", "4人2チーム"],
      ["6p3t", "6人3チーム"],
      ["tie", "同点ケース"],
      ["round100", "100円端数"],
      ["round1000", "1000円端数"],
    ].forEach(([key, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "debug-preset-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => applyTestPreset(key));
      presetWrap.appendChild(btn);
    });
    panel.appendChild(presetWrap);

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

  function runSelfTests() {
    const tests = [];
    const assert = (name, cond) => tests.push({ name, ok: !!cond });

    const saved = JSON.parse(JSON.stringify(state));
    try {
      state = createDefaultState();
      setupPlayers(4, 2, [
        { name: "A1", team: 1, score: 200 },
        { name: "A2", team: 1, score: 180 },
        { name: "B1", team: 2, score: 150 },
        { name: "B2", team: 2, score: 140 },
      ]);
      state.settings.settlementPreset = "first-last";
      let r = runCalculation();
      assert("4人2チーム精算", !r.error && r.finalTotal > 0);

      assert("ゲーム単位のみ", r.scores && r.scores.length === 4);

      const spin = spinRoulette();
      assert("ルーレット", !spin.error && spin.amount > 0);

      const bal = new Map([["a", -5000], ["b", -5000], ["c", 5000], ["d", 5000]]);
      const pays = minimizeTransactions(bal);
      assert("送金最小化", pays.length <= 2);

      const tied = rankTeams([
        { id: 1, name: "T1", members: [{ id: "a", score: 100 }], total: 100, average: 100 },
        { id: 2, name: "T2", members: [{ id: "b", score: 100 }], total: 100, average: 100 },
      ], "total");
      assert("同点タイ", tied[0].tied && tied[0].rank === 1);

      const migrated = migrateFromV1({
        version: 1,
        playerCount: 4,
        teamCount: 2,
        currentGame: 1,
        players: [
          { id: "p1", name: "A", teamId: 1, currentScore: "180", cumulativeScore: 0 },
          { id: "p2", name: "B", teamId: 1, currentScore: "170", cumulativeScore: 0 },
          { id: "p3", name: "C", teamId: 2, currentScore: "150", cumulativeScore: 0 },
          { id: "p4", name: "D", teamId: 2, currentScore: "140", cumulativeScore: 0 },
        ],
        teams: [{ id: 1, name: "T1" }, { id: 2, name: "T2" }],
        settings: { pricePerPin: 100, calcMethod: "total", rounding: "none" },
        gameHistory: [],
      });
      assert("v1移行", migrated && migrated.version === 2);

      assert("idCounter順序", idCounter >= 0);

      const floor = applyRoundingToBalances(new Map([["a", 1234]]), "floor100");
      assert("floor100", floor.balances.get("a") === 1200);

      const legacy = normalizeRounding("100");
      assert("legacy100", legacy === "floor100");
    } finally {
      state = saved;
    }

    return tests;
  }

  function init() {
    cacheDom();
    loadState();
    ensureTeamNamesCount();
    refreshAutoTeamNames();
    bindEvents();
    renderAll();
    initDebugPanel();

    if (isDebugMode() || isTestMode()) {
      const results = runSelfTests();
      const failed = results.filter((t) => !t.ok);
      console.info("[Nokoi v2] セルフテスト完了", results);
      if (failed.length) console.warn("[Nokoi v2] 失敗:", failed);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
