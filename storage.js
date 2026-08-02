/**
 * Nokoi Tools - Bowling Settlement - Storage & State
 */
(function (global) {
  "use strict";

  const N = (global.Nokoi = global.Nokoi || {});

  // ========================================
  // 定数
  // ========================================
  N.STORAGE_KEY = "nokoi-bowling-v1";
  N.STORAGE_VERSION = 2;
  N.MIN_PLAYERS = 2;
  N.MAX_PLAYERS = 20;
  N.MIN_TEAMS = 2;
  N.MAX_TEAMS = 20;
  N.MIN_SCORE = 0;
  N.MAX_SCORE = 300;
  N.DEFAULT_PRICE = 100;

  N.PRESET_COLORS = [
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
  // 状態（idCounter は createDefaultState より先）
  // ========================================
  let idCounter = 0;
  N.state = createDefaultState();
  N.lastResultText = "";
  N.isCalculating = false;
  let saveTimer = null;

  // ========================================
  // ユーティリティ
  // ========================================
  function genId(prefix) {
    idCounter += 1;
    return `${prefix}_${Date.now()}_${idCounter}`;
  }
  N.genId = genId;

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }
  N.clamp = clamp;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  N.escapeHtml = escapeHtml;

  function defaultPlayerName(i) {
    return `プレイヤー${i + 1}`;
  }
  N.defaultPlayerName = defaultPlayerName;

  function defaultTeamName(id) {
    return `チーム${id}`;
  }
  N.defaultTeamName = defaultTeamName;

  function formatYen(n) {
    const v = Math.round(n);
    const sign = v > 0 ? "+" : v < 0 ? "" : "";
    return sign + "¥" + Math.abs(v).toLocaleString("ja-JP");
  }
  N.formatYen = formatYen;

  function formatYenAbs(n) {
    return "¥" + Math.round(Math.abs(n)).toLocaleString("ja-JP");
  }
  N.formatYenAbs = formatYenAbs;

  function formatScore(v) {
    if (Number.isInteger(v)) return String(v);
    return Number(v).toFixed(1);
  }
  N.formatScore = formatScore;

  function formatRankLabel(rank, tied) {
    return tied ? `${rank}位タイ` : `${rank}位`;
  }
  N.formatRankLabel = formatRankLabel;

  function getTeamColor(teamId) {
    if (teamId <= N.PRESET_COLORS.length) {
      const c = N.PRESET_COLORS[teamId - 1];
      return { color: c.color, bg: c.bg };
    }
    const hue = ((teamId - 1) * 137.508) % 360;
    return {
      color: `hsl(${hue}, 55%, 42%)`,
      bg: `hsl(${hue}, 55%, 94%)`,
    };
  }
  N.getTeamColor = getTeamColor;

  function applyTeamColorStyle(el, teamId) {
    if (!el || !teamId) return;
    const { color, bg } = getTeamColor(teamId);
    el.style.setProperty("--team-color", color);
    el.style.setProperty("--team-bg", bg);
    el.classList.add("has-team-color");
  }
  N.applyTeamColorStyle = applyTeamColorStyle;

  function getPlayerById(id) {
    return N.state.players.find((p) => p.id === id);
  }
  N.getPlayerById = getPlayerById;

  function getPlayerDisplayName(p, index) {
    const name = (p.name || "").trim();
    return name || defaultPlayerName(index);
  }
  N.getPlayerDisplayName = getPlayerDisplayName;

  function getTeamById(id) {
    return N.state.teams.find((t) => t.id === id);
  }
  N.getTeamById = getTeamById;

  function getTeamDisplayName(teamId) {
    const t = getTeamById(teamId);
    return (t?.name || "").trim() || defaultTeamName(teamId);
  }
  N.getTeamDisplayName = getTeamDisplayName;

  // ========================================
  // デフォルト状態
  // ========================================
  function createDefaultState() {
    const players = [];
    const teams = [
      { id: 1, name: "チーム1", manualName: false },
      { id: 2, name: "チーム2", manualName: false },
    ];
    for (let i = 0; i < 4; i++) {
      players.push({
        id: genId("p"),
        name: defaultPlayerName(i),
        teamId: (i % 2) + 1,
        currentScore: "",
        cumulativeScore: 0,
        gameBalance: 0,
        cumulativeBalance: 0,
      });
    }
    return {
      version: N.STORAGE_VERSION,
      playerCount: 4,
      teamCount: 2,
      currentGame: 1,
      players,
      teams,
      gameHistory: [],
      settings: {
        pricePerPin: N.DEFAULT_PRICE,
        calcMethod: "total",
        settlementPreset: "custom",
        settlementPairs: [{ fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null }],
        rounding: "none",
        remainderAdjust: "representative",
        remainderRepId: null,
        lastUsedRate: N.DEFAULT_PRICE,
      },
      lastResult: null,
    };
  }
  N.createDefaultState = createDefaultState;

  // ========================================
  // チーム自動命名
  // ========================================
  function getNamePrefix(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= 2) return trimmed;
    return trimmed.slice(0, 2);
  }

  function generateAutoTeamName(teamId) {
    const members = N.state.players
      .slice(0, N.state.playerCount)
      .filter((p) => p.teamId === teamId);
    const prefixes = members
      .map((p) => {
        const idx = N.state.players.indexOf(p);
        return getNamePrefix(getPlayerDisplayName(p, idx));
      })
      .filter(Boolean);
    if (!prefixes.length) return defaultTeamName(teamId);
    return prefixes.join("・") + "チーム";
  }
  N.generateAutoTeamName = generateAutoTeamName;

  function updateAutoTeamNames() {
    for (let t = 1; t <= N.state.teamCount; t++) {
      const team = getTeamById(t);
      if (!team) continue;
      if (team.manualName) continue;
      team.name = generateAutoTeamName(t);
    }
  }
  N.updateAutoTeamNames = updateAutoTeamNames;

  function markTeamManualName(teamId) {
    const team = getTeamById(teamId);
    if (team) team.manualName = true;
  }
  N.markTeamManualName = markTeamManualName;

  function resetTeamAutoName(teamId) {
    const team = getTeamById(teamId);
    if (!team) return;
    team.manualName = false;
    updateAutoTeamNames();
  }
  N.resetTeamAutoName = resetTeamAutoName;

  // ========================================
  // プレイヤー統計（表示専用）
  // ========================================
  function getPlayerAverage(player) {
    const completed = N.state.gameHistory.length;
    const hasCurrent = player.currentScore !== "";
    const current = hasCurrent ? parseInt(player.currentScore, 10) : 0;
    const totalGames = completed + (hasCurrent && !isNaN(current) ? 1 : 0);
    if (totalGames === 0) return 0;
    const total =
      (player.cumulativeScore || 0) +
      (hasCurrent && !isNaN(current) ? current : 0);
    return total / totalGames;
  }
  N.getPlayerAverage = getPlayerAverage;

  function getPlayerStats(player) {
    const current =
      player.currentScore === ""
        ? null
        : parseInt(player.currentScore, 10);
    return {
      current: current !== null && !isNaN(current) ? current : null,
      cumulative: player.cumulativeScore || 0,
      average: getPlayerAverage(player),
      gameBalance: player.gameBalance || 0,
      cumulativeBalance: player.cumulativeBalance || 0,
    };
  }
  N.getPlayerStats = getPlayerStats;

  // ========================================
  // 収支トラッキング
  // ========================================
  function previewGameBalances(playerBalances) {
    if (!playerBalances) return;
    N.state.players.slice(0, N.state.playerCount).forEach((p) => {
      p.gameBalance = playerBalances.get(p.id) || 0;
    });
  }
  N.previewGameBalances = previewGameBalances;

  function commitGameBalances(playerBalances) {
    if (!playerBalances) return;
    let map = playerBalances;
    if (!(playerBalances instanceof Map)) {
      map = new Map();
      if (Array.isArray(playerBalances)) {
        playerBalances.forEach((b) => map.set(b.id, b.amount));
      }
    }
    N.state.players.slice(0, N.state.playerCount).forEach((p) => {
      const bal = map.get(p.id) || 0;
      p.gameBalance = bal;
      p.cumulativeBalance = (p.cumulativeBalance || 0) + bal;
    });
  }
  N.commitGameBalances = commitGameBalances;

  function resetSessionBalances() {
    N.state.players.forEach((p) => {
      p.gameBalance = 0;
      p.cumulativeBalance = 0;
    });
  }
  N.resetSessionBalances = resetSessionBalances;

  function revertGameBalances(playerBalances) {
    if (!playerBalances) return;
    let map = playerBalances;
    if (!(playerBalances instanceof Map)) {
      map = new Map();
      if (Array.isArray(playerBalances)) {
        playerBalances.forEach((b) => map.set(b.id, b.amount));
      }
    }
    N.state.players.forEach((p) => {
      const bal = map.get(p.id) || 0;
      p.cumulativeBalance = Math.max(0, (p.cumulativeBalance || 0) - bal);
      p.gameBalance = 0;
    });
  }
  N.revertGameBalances = revertGameBalances;

  // ========================================
  // スコア取得（精算は今回のみ）
  // ========================================
  function getCurrentScores() {
    return N.state.players.slice(0, N.state.playerCount).map((p) => {
      const current =
        p.currentScore === "" ? 0 : parseInt(p.currentScore, 10);
      return isNaN(current) ? NaN : current;
    });
  }
  N.getCurrentScores = getCurrentScores;

  function validateScores(requireCurrent) {
    const errors = [];
    N.state.players.slice(0, N.state.playerCount).forEach((p, i) => {
      if (p.currentScore === "") {
        if (requireCurrent) {
          errors.push({
            index: i,
            message: `${getPlayerDisplayName(p, i)}のスコアを入力してください`,
          });
        }
        return;
      }
      const s = parseInt(p.currentScore, 10);
      if (isNaN(s) || s < N.MIN_SCORE || s > N.MAX_SCORE) {
        errors.push({
          index: i,
          message: `${getPlayerDisplayName(p, i)}のスコアは${N.MIN_SCORE}〜${N.MAX_SCORE}で入力してください`,
        });
      }
    });
    return errors;
  }
  N.validateScores = validateScores;

  // ========================================
  // 精算プリセット
  // ========================================
  function buildPresetPairs(preset, teamCount) {
    const pairs = [];
    if (teamCount < 2) return pairs;

    if (teamCount === 2) {
      pairs.push({ fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null });
      return pairs;
    }
    if (preset === "first-last") {
      pairs.push({
        fromRank: teamCount,
        toRank: 1,
        fromTeamId: null,
        toTeamId: null,
      });
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
    return N.state.settings.settlementPairs || [];
  }
  N.buildPresetPairs = buildPresetPairs;

  function getTeamsAtRank(rankGroups, rank, teamId) {
    const teams = rankGroups[rank] || [];
    if (teamId) return teams.filter((t) => t.id === teamId);
    return teams;
  }
  N.getTeamsAtRank = getTeamsAtRank;

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
  N.validateSettlementPairs = validateSettlementPairs;

  // ========================================
  // LocalStorage
  // ========================================
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 300);
  }
  N.scheduleSave = scheduleSave;

  function saveState() {
    try {
      if (N.syncFromDom) N.syncFromDom(false);
      localStorage.setItem(N.STORAGE_KEY, JSON.stringify(N.state));
    } catch (e) {
      console.warn("保存に失敗:", e);
    }
  }
  N.saveState = saveState;

  function normalizePlayers(players) {
    return players
      .filter((p) => p && p.id)
      .map((p, i) => ({
        id: String(p.id),
        name: String(p.name ?? defaultPlayerName(i)),
        teamId: clamp(Number(p.teamId) || 1, 1, N.MAX_TEAMS),
        currentScore:
          p.currentScore === undefined || p.currentScore === null
            ? ""
            : String(p.currentScore),
        cumulativeScore: Math.max(0, Number(p.cumulativeScore) || 0),
        gameBalance: Number(p.gameBalance) || 0,
        cumulativeBalance: Number(p.cumulativeBalance) || 0,
      }));
  }

  function normalizeTeams(teams) {
    return teams
      .filter((t) => t && t.id)
      .map((t) => ({
        id: Number(t.id),
        name: String(t.name ?? defaultTeamName(t.id)),
        manualName: !!t.manualName,
      }));
  }

  function migrateV1(data) {
    const migrated = { ...data, version: 2 };

    if (migrated.settings) {
      delete migrated.settings.scoreScope;
      delete migrated.settings.includeCurrentInCumulative;
      if (migrated.settings.lastUsedRate === undefined) {
        migrated.settings.lastUsedRate =
          migrated.settings.pricePerPin || N.DEFAULT_PRICE;
      }
    }

    migrated.players = normalizePlayers(migrated.players || []);
    migrated.teams = normalizeTeams(migrated.teams || []);
    migrated.teams.forEach((t) => {
      if (!t.manualName && t.name !== defaultTeamName(t.id)) {
        t.manualName = true;
      }
    });

    if (!Array.isArray(migrated.gameHistory)) migrated.gameHistory = [];

    migrated.gameHistory = migrated.gameHistory.map((h) => {
      const entry = { ...h };
      if (entry.result?.rankedTeams && !entry.winnerTeamId) {
        const winner = entry.result.rankedTeams.find((t) => t.rank === 1);
        if (winner) {
          entry.winnerTeamId = winner.id;
          entry.winnerTeamName = winner.name;
          entry.averageScore = winner.average;
        }
      }
      if (!entry.pricePerPin) {
        entry.pricePerPin = migrated.settings?.pricePerPin || N.DEFAULT_PRICE;
      }
      return entry;
    });

    return migrated;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(N.STORAGE_KEY);
      if (!raw) return;
      let data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;

      let migrated = false;
      if (!data.version || data.version === 1) {
        data = migrateV1(data);
        migrated = true;
      } else if (data.version !== N.STORAGE_VERSION) {
        return;
      }

      data.players = normalizePlayers(data.players || []);
      if (data.players.length < N.MIN_PLAYERS) return;

      data.teams = normalizeTeams(data.teams || []);
      if (data.teams.length < N.MIN_TEAMS) return;

      N.state = data;
      if (!N.state.settings || typeof N.state.settings !== "object") {
        N.state.settings = createDefaultState().settings;
      }
      if (!Array.isArray(N.state.gameHistory)) N.state.gameHistory = [];
      N.state.playerCount = clamp(
        N.state.playerCount || N.state.players.length,
        N.MIN_PLAYERS,
        N.MAX_PLAYERS
      );
      N.state.teamCount = clamp(
        N.state.teamCount || 2,
        N.MIN_TEAMS,
        N.state.playerCount
      );
      N.state.currentGame = Math.max(1, Number(N.state.currentGame) || 1);

      if (migrated) {
        try {
          localStorage.setItem(N.STORAGE_KEY, JSON.stringify(N.state));
        } catch (e) {
          console.warn("マイグレーション後の保存に失敗:", e);
        }
      }
    } catch (e) {
      console.warn("復元に失敗、初期値を使用:", e);
      N.state = createDefaultState();
    }
  }
  N.loadState = loadState;

  function resetAllData() {
    if (!confirm("すべてのデータをリセットします。よろしいですか？")) return;
    localStorage.removeItem(N.STORAGE_KEY);
    if (N.Roulette && N.Roulette.resetPresets) N.Roulette.resetPresets();
    N.state = createDefaultState();
    if (N.renderAll) N.renderAll();
    if (N.showStatus) N.showStatus("データをリセットしました", "success");
  }
  N.resetAllData = resetAllData;

  // ========================================
  // 人数・チーム変更
  // ========================================
  function ensureTeamsCount() {
    while (N.state.teams.length < N.state.teamCount) {
      const id = N.state.teams.length + 1;
      N.state.teams.push({ id, name: defaultTeamName(id), manualName: false });
    }
  }
  N.ensureTeamsCount = ensureTeamsCount;

  function setPlayerCount(count, skipConfirm) {
    const newCount = clamp(count, N.MIN_PLAYERS, N.MAX_PLAYERS);
    if (newCount < N.state.playerCount && !skipConfirm) {
      const removed = N.state.players.slice(newCount);
      const hasData = removed.some(
        (p) =>
          p.name.trim() ||
          p.currentScore !== "" ||
          p.cumulativeScore > 0
      );
      if (
        hasData &&
        !confirm("減らしたプレイヤーのデータは削除されます。よろしいですか？")
      )
        return;
    }

    while (N.state.players.length < newCount) {
      const i = N.state.players.length;
      N.state.players.push({
        id: genId("p"),
        name: defaultPlayerName(i),
        teamId: (i % N.state.teamCount) + 1,
        currentScore: "",
        cumulativeScore: 0,
        gameBalance: 0,
        cumulativeBalance: 0,
      });
    }
    N.state.playerCount = newCount;
    if (N.state.teamCount > newCount) N.state.teamCount = newCount;
    ensureTeamsCount();
    updateAutoTeamNames();
    if (N.renderAll) N.renderAll();
    scheduleSave();
  }
  N.setPlayerCount = setPlayerCount;

  function setTeamCount(count) {
    const newCount = clamp(count, N.MIN_TEAMS, N.state.playerCount);
    N.state.teamCount = newCount;
    ensureTeamsCount();
    N.state.players.forEach((p) => {
      if (p.teamId > newCount) p.teamId = newCount;
    });
    if (N.state.settings.settlementPreset !== "custom") {
      N.state.settings.settlementPairs = buildPresetPairs(
        N.state.settings.settlementPreset,
        newCount
      );
    }
    updateAutoTeamNames();
    if (N.renderAll) N.renderAll();
    scheduleSave();
  }
  N.setTeamCount = setTeamCount;

  function applyPreset(preset) {
    N.state.settings.settlementPreset = preset;
    if (preset !== "custom") {
      N.state.settings.settlementPairs = buildPresetPairs(
        preset,
        N.state.teamCount
      );
    }
    if (N.renderSettlementPreset) N.renderSettlementPreset();
    if (N.renderSettlementPairs) N.renderSettlementPairs();
    scheduleSave();
  }
  N.applyPreset = applyPreset;

  function onTeamAssignmentChanged() {
    updateAutoTeamNames();
    if (N.renderTeamNames) N.renderTeamNames();
    if (N.renderTeamLegend) N.renderTeamLegend();
    if (N.renderTeamList) N.renderTeamList();
    scheduleSave();
  }
  N.onTeamAssignmentChanged = onTeamAssignmentChanged;
})(window);
