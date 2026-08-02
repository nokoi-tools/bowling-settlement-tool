/**
 * Nokoi Tools - Bowling Settlement - Entry Point
 * cacheDom, init, debug panel
 */
(function (global) {
  "use strict";

  const N = (global.Nokoi = global.Nokoi || {});

  const $ = (id) => document.getElementById(id);
  N.dom = {};

  function cacheDom() {
    const ids = [
      "currentGameDisplay", "gameHint", "gameBar", "statusMessage",
      "playerCount", "playerCountUp", "playerCountDown", "playerList",
      "teamCount", "teamCountUp", "teamCountDown", "teamNames", "teamLegend",
      "teamList", "teamWarning", "presetGroup", "settlementList",
      "addSettlementPair", "settlementCustom", "pricePerPin", "remainderRep",
      "representativeField", "resultSection", "resultScopeLabel", "resultWarnings",
      "rankingTable", "teamSummary", "settlementSummary", "balanceDisplay",
      "paymentList", "copyBtn", "shareBtn", "nextGameBtn", "deleteCurrentGameBtn",
      "copyFeedback", "calculateBtn", "historyBtn", "prevGameBtn", "endSessionBtn",
      "historyModal", "historyModalClose", "historyList", "resetHistoryBtn",
      "historyDetailModal", "historyDetailClose", "historyDetailTitle",
      "historyDetailBody", "resetAllBtn", "detailsSettings",
      "sessionSummaryModal", "sessionSummaryBody", "sessionSummaryClose",
      "rateChoiceModal", "rateChoiceReuse", "rateChoiceSpin", "rateChoiceClose",
      "rateChoiceLastValue",
      "roulettePresetTabs", "roulettePresetName", "rouletteOptionsList", "rouletteProbabilities",
      "rouletteDisplay", "rouletteSpinBtn", "rouletteAddOption",
    ];
    ids.forEach((id) => {
      N.dom[id] = $(id);
    });
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
    "同点処理",
    "100円未満切り捨て",
    "1,000円未満切り捨て",
    "共有機能",
    "コピー機能",
    "次のゲーム",
    "前のゲーム",
    "履歴表示",
    "ルーレット",
    "ゲーム終了サマリー",
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

  function applyTestPreset(key) {
    N.state.gameHistory = [];
    N.state.currentGame = 1;
    N.state.lastResult = null;
    N.state.settings.pricePerPin = 100;
    N.state.settings.calcMethod = "total";
    N.state.settings.settlementPreset = "first-last";
    N.state.settings.rounding = "none";
    N.resetSessionBalances();

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
      N.state.settings.settlementPreset = "half-half";
    } else if (key === "8p4t") {
      const data = [];
      for (let i = 0; i < 8; i++) {
        data.push({ name: `P${i + 1}`, team: (i % 4) + 1, score: 200 - i * 10 });
      }
      setupPlayers(8, 4, data);
      N.state.settings.settlementPreset = "half-half";
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
      N.state.settings.calcMethod = "average";
      setRadio("calcMethod", "average");
    } else if (key === "round100") {
      setupPlayers(4, 2, [
        { name: "A1", team: 1, score: 185 },
        { name: "A2", team: 1, score: 175 },
        { name: "B1", team: 2, score: 160 },
        { name: "B2", team: 2, score: 155 },
      ]);
      N.state.settings.rounding = "100";
      setRadio("rounding", "100");
    } else if (key === "round1000") {
      setupPlayers(4, 2, [
        { name: "A1", team: 1, score: 220 },
        { name: "A2", team: 1, score: 210 },
        { name: "B1", team: 2, score: 150 },
        { name: "B2", team: 2, score: 140 },
      ]);
      N.state.settings.pricePerPin = 100;
      N.state.settings.rounding = "1000";
      setRadio("rounding", "1000");
    }

    N.applyPreset(N.state.settings.settlementPreset);
    N.updateAutoTeamNames();
    N.renderAll();
    N.scheduleSave();
    N.showStatus("テストデータを入力しました", "success");
    N.dom.playerList?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setupPlayers(count, teamCount, data) {
    N.state.playerCount = count;
    N.state.teamCount = teamCount;
    N.state.players = [];
    N.state.teams = [];
    for (let t = 1; t <= teamCount; t++) {
      N.state.teams.push({ id: t, name: N.defaultTeamName(t), manualName: false });
    }
    for (let i = 0; i < count; i++) {
      const d = data[i] || {
        name: N.defaultPlayerName(i),
        team: (i % teamCount) + 1,
        score: 150,
      };
      N.state.players.push({
        id: N.genId("p"),
        name: d.name,
        teamId: d.team,
        currentScore: String(d.score),
        cumulativeScore: 0,
        gameBalance: 0,
        cumulativeBalance: 0,
      });
    }
    if (teamCount >= 3) {
      N.state.settings.settlementPairs = N.buildPresetPairs(
        N.state.settings.settlementPreset,
        teamCount
      );
    } else {
      N.state.settings.settlementPairs = [
        { fromRank: 2, toRank: 1, fromTeamId: null, toTeamId: null },
      ];
    }
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

  function runSelfTests() {
    const tests = [];
    const assert = (name, cond) => tests.push({ name, ok: !!cond });

    const saved = N.state;
    N.state = N.createDefaultState();
    N.state.players = [
      { id: "p1", name: "A", teamId: 1, currentScore: "200", cumulativeScore: 0, gameBalance: 0, cumulativeBalance: 0 },
      { id: "p2", name: "B", teamId: 1, currentScore: "180", cumulativeScore: 0, gameBalance: 0, cumulativeBalance: 0 },
      { id: "p3", name: "C", teamId: 2, currentScore: "150", cumulativeScore: 0, gameBalance: 0, cumulativeBalance: 0 },
      { id: "p4", name: "D", teamId: 2, currentScore: "140", cumulativeScore: 0, gameBalance: 0, cumulativeBalance: 0 },
    ];
    N.state.playerCount = 4;
    N.state.teamCount = 2;
    N.state.settings.settlementPreset = "first-last";
    let r = N.runCalculation();
    assert("4人2チーム", !r.error && r.finalTotal > 0);
    assert("今回のみ精算", r.rankedTeams[0].total === 380);

    N.state.players.forEach((p, i) => {
      p.currentScore = String(150 + i * 10);
      p.teamId = (i % 3) + 1;
    });
    N.state.teamCount = 3;
    N.state.playerCount = 6;
    N.state.teams = [
      { id: 1, name: "T1", manualName: false },
      { id: 2, name: "T2", manualName: false },
      { id: 3, name: "T3", manualName: false },
    ];
    N.state.settings.settlementPreset = "half-half";
    r = N.runCalculation();
    assert("6人3チーム", !r.error);

    const bal = new Map([
      ["a", -5000], ["b", -5000], ["c", 5000], ["d", 5000],
    ]);
    const pays = N.minimizeTransactions(bal);
    assert("送金最小化", pays.length <= 2);

    const tied = N.rankTeams([
      { id: 1, name: "T1", members: [{ id: "a", score: 100 }], total: 100, average: 100, scoreParts: [100] },
      { id: 2, name: "T2", members: [{ id: "b", score: 100 }], total: 100, average: 100, scoreParts: [100] },
    ], "total");
    assert("同点タイ", tied[0].tied && tied[0].rank === 1);

    const rouletteErr = N.Roulette.validateRouletteOptions([{ amount: 100, weight: 1 }]);
    assert("ルーレット最小2", rouletteErr !== null);

    N.state = saved;
    return tests;
  }

  function init() {
    cacheDom();
    N.loadState();
    N.ensureTeamsCount();
    N.updateAutoTeamNames();
    N.Roulette.loadRouletteState();
    N.bindEvents();
    N.renderAll();
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
})(window);
