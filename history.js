/**
 * Nokoi Tools - Bowling Settlement - History & Session
 */
(function (global) {
  "use strict";

  const N = (global.Nokoi = global.Nokoi || {});

  function buildHistoryEntry(result) {
    const winner = result.rankedTeams?.find((t) => t.rank === 1);
    return {
      id: N.genId("g"),
      gameNumber: N.state.currentGame,
      date: new Date().toLocaleString("ja-JP"),
      scores: N.state.players.map((p) => ({
        id: p.id,
        score: parseInt(p.currentScore, 10) || 0,
      })),
      result: JSON.parse(JSON.stringify(result)),
      finalTotal: result.finalTotal || 0,
      winnerTeamId: winner?.id || result.winnerTeamId,
      winnerTeamName: winner?.name || result.winnerTeamName || "",
      averageScore: winner?.average || 0,
      pricePerPin: result.pricePerPin || N.state.settings.pricePerPin,
      playerBalances: result.playerBalances
        ? [...result.playerBalances.entries()].map(([id, amount]) => ({
            id,
            amount,
          }))
        : [],
      summaryText: N.buildResultText(result),
    };
  }

  function handleNextGame() {
    N.syncFromDom(false);
    const errors = N.validateScores(true);
    if (errors.length) {
      N.showStatus(errors[0].message, "error");
      return;
    }

    const result = N.state.lastResult || N.runCalculation();
    if (result.error) {
      N.showStatus(result.error, "error");
      return;
    }

    const lastHistory = N.state.gameHistory[N.state.gameHistory.length - 1];
    if (lastHistory && lastHistory.gameNumber === N.state.currentGame) {
      N.showStatus("このゲームは既に履歴へ保存済みです", "error");
      return;
    }

    N.commitGameBalances(result.playerBalances);

    const historyEntry = buildHistoryEntry(result);
    N.state.gameHistory.push(historyEntry);
    N.state.settings.lastUsedRate = historyEntry.pricePerPin;

    N.state.players.forEach((p) => {
      const current = parseInt(p.currentScore, 10) || 0;
      p.cumulativeScore = (p.cumulativeScore || 0) + current;
      p.currentScore = "";
      p.gameBalance = 0;
    });

    N.state.currentGame += 1;
    N.state.lastResult = null;
    if (N.dom.resultSection) N.dom.resultSection.hidden = true;

    N.renderAll();
    N.scheduleSave();
    N.showStatus(`第${N.state.currentGame}ゲーム目へ進みました`, "success");

    N.dom.playerList?.querySelector(".player-score")?.focus();
    N.dom.playerList?.scrollIntoView({ behavior: "smooth", block: "start" });

    showRateChoiceModal();
  }

  function showRateChoiceModal() {
    const modal = N.dom.rateChoiceModal;
    if (!modal) return;
    const lastRate = N.state.settings.lastUsedRate || N.DEFAULT_PRICE;
    if (N.dom.rateChoiceLastValue) {
      N.dom.rateChoiceLastValue.textContent = `${lastRate}円`;
    }
    modal.showModal();
  }

  function handleRateChoiceReuse() {
    const rate = N.state.settings.lastUsedRate || N.DEFAULT_PRICE;
    N.state.settings.pricePerPin = rate;
    if (N.dom.pricePerPin) N.dom.pricePerPin.value = String(rate);
    N.dom.rateChoiceModal?.close();
    N.scheduleSave();
    N.showStatus(`単価 ${rate}円 を引き続き使用します`, "success");
  }

  function handleRateChoiceSpin() {
    N.dom.rateChoiceModal?.close();
    N.Roulette.animateSpin((result) => {
      if (result.error) {
        N.showStatus(result.error, "error");
        return;
      }
      N.showStatus(`ルーレット結果: ${result.amount}円`, "success");
      if (N.dom.detailsSettings && !N.dom.detailsSettings.open) {
        N.dom.detailsSettings.open = true;
      }
      N.dom.pricePerPin?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function handlePrevGame() {
    if (N.state.currentGame <= 1) return;
    if (
      !confirm(
        "直前のゲームに戻ります。現在の入力は失われます。よろしいですか？"
      )
    )
      return;

    const last = N.state.gameHistory.pop();
    if (last) {
      N.state.currentGame = last.gameNumber;

      if (last.playerBalances?.length) {
        const balMap = new Map(
          last.playerBalances.map((b) => [b.id, b.amount])
        );
        N.revertGameBalances(balMap);
      }

      last.scores.forEach((s) => {
        const p = N.getPlayerById(s.id);
        if (p) {
          p.cumulativeScore = Math.max(0, (p.cumulativeScore || 0) - s.score);
          p.currentScore = String(s.score);
        }
      });

      if (last.pricePerPin) {
        N.state.settings.pricePerPin = last.pricePerPin;
      }
    } else {
      N.state.currentGame -= 1;
    }

    N.state.lastResult = null;
    N.renderAll();
    N.scheduleSave();
  }

  function handleDeleteCurrentGame() {
    if (!confirm("現在のゲーム入力を削除しますか？")) return;
    N.state.players.forEach((p) => {
      p.currentScore = "";
      p.gameBalance = 0;
    });
    N.state.lastResult = null;
    if (N.dom.resultSection) N.dom.resultSection.hidden = true;
    N.renderAll();
    N.scheduleSave();
  }

  function handleResetHistory() {
    if (
      !confirm(
        "すべてのゲーム履歴をリセットしますか？累計スコア・収支も0に戻ります。"
      )
    )
      return;
    N.state.gameHistory = [];
    N.state.currentGame = 1;
    N.state.players.forEach((p) => {
      p.cumulativeScore = 0;
      p.currentScore = "";
      p.gameBalance = 0;
      p.cumulativeBalance = 0;
    });
    N.state.lastResult = null;
    N.renderAll();
    N.scheduleSave();
    if (N.dom.historyModal?.open) N.dom.historyModal.close();
  }

  function renderHistoryList() {
    if (!N.dom.historyList) return;
    N.dom.historyList.innerHTML = "";

    if (!N.state.gameHistory.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "履歴はありません";
      N.dom.historyList.appendChild(empty);
      return;
    }

    [...N.state.gameHistory].reverse().forEach((h) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";
      btn.dataset.gameId = h.id;

      const title = document.createElement("div");
      title.className = "history-item-title";
      title.textContent = `第${h.gameNumber}ゲーム`;

      const rate = document.createElement("div");
      rate.className = "history-item-rate";
      rate.textContent = `1ピン＝${h.pricePerPin || "-"}円`;

      const winner = document.createElement("div");
      winner.className = "history-item-winner";
      winner.textContent = h.winnerTeamName
        ? `勝者: ${h.winnerTeamName}`
        : "勝者: -";

      const meta = document.createElement("div");
      meta.className = "history-item-meta";
      const avgText =
        h.averageScore != null
          ? `平均 ${N.formatScore(h.averageScore)} · `
          : "";
      meta.textContent = `${h.date} · ${avgText}精算 ${N.formatYenAbs(h.finalTotal || 0)} · 単価 ${h.pricePerPin || "-"}円`;

      btn.append(title, rate, winner, meta);
      btn.addEventListener("click", () => showHistoryDetail(h.id));
      N.dom.historyList.appendChild(btn);
    });
  }

  function showHistoryDetail(gameId) {
    const h = N.state.gameHistory.find((g) => g.id === gameId);
    if (!h || !N.dom.historyDetailBody || !N.dom.historyDetailModal) return;

    if (N.dom.historyDetailTitle) {
      N.dom.historyDetailTitle.textContent = `第${h.gameNumber}ゲーム`;
    }

    N.dom.historyDetailBody.innerHTML = "";

    const info = document.createElement("div");
    info.className = "history-detail-info";
    info.innerHTML = `
      <p><strong>日時:</strong> ${N.escapeHtml(h.date)}</p>
      <p><strong>勝者:</strong> ${N.escapeHtml(h.winnerTeamName || "-")}</p>
      <p><strong>平均:</strong> ${h.averageScore != null ? N.formatScore(h.averageScore) : "-"}</p>
      <p><strong>精算額:</strong> ${N.formatYenAbs(h.finalTotal || 0)}</p>
      <p><strong>単価:</strong> ${h.pricePerPin || "-"}円/ピン</p>
    `;
    N.dom.historyDetailBody.appendChild(info);

    if (h.summaryText) {
      const pre = document.createElement("pre");
      pre.className = "history-detail-text";
      pre.textContent = h.summaryText;
      N.dom.historyDetailBody.appendChild(pre);
    } else {
      const p = document.createElement("p");
      p.textContent = "詳細なし";
      N.dom.historyDetailBody.appendChild(p);
    }

    N.dom.historyDetailModal.showModal();
  }

  function buildSessionSummary() {
    const games = N.state.gameHistory.length;
    const players = N.state.players.slice(0, N.state.playerCount);

    const playerSummaries = players.map((p, i) => {
      const stats = N.getPlayerStats(p);
      return {
        name: N.getPlayerDisplayName(p, i),
        cumulative: stats.cumulative,
        average: stats.average,
        gameBalance: stats.gameBalance,
        cumulativeBalance: stats.cumulativeBalance,
      };
    });

    const teamSummaries = [];
    for (let t = 1; t <= N.state.teamCount; t++) {
      const members = players.filter((p) => p.teamId === t);
      const totalCumulative = members.reduce(
        (s, p) => s + (p.cumulativeScore || 0),
        0
      );
      const avg =
        games > 0 && members.length
          ? totalCumulative / (games * members.length)
          : 0;
      teamSummaries.push({
        name: N.getTeamDisplayName(t),
        teamId: t,
        cumulative: totalCumulative,
        average: avg,
        memberCount: members.length,
      });
    }

    const totalSettlement = N.state.gameHistory.reduce(
      (s, h) => s + (h.finalTotal || 0),
      0
    );

    return {
      games,
      playerSummaries,
      teamSummaries,
      totalSettlement,
      date: new Date().toLocaleDateString("ja-JP"),
    };
  }

  function handleEndSession() {
    if (!N.state.gameHistory.length) {
      N.showStatus("終了済みのゲームがありません", "error");
      return;
    }
    showSessionSummaryModal();
  }

  function showSessionSummaryModal() {
    const summary = buildSessionSummary();
    const modal = N.dom.sessionSummaryModal;
    const body = N.dom.sessionSummaryBody;
    if (!modal || !body) return;

    body.innerHTML = "";

    const header = document.createElement("div");
    header.className = "session-summary-header";
    header.innerHTML = `
      <p class="session-summary-date">${N.escapeHtml(summary.date)}</p>
      <p class="session-summary-games">${summary.games} ゲーム</p>
      <p class="session-summary-total">精算総額 ${N.formatYenAbs(summary.totalSettlement)}</p>
    `;
    body.appendChild(header);

    const teamSection = document.createElement("div");
    teamSection.className = "session-summary-section";
    teamSection.innerHTML = `<h3 class="session-summary-title">チーム累計</h3>`;
    summary.teamSummaries.forEach((t) => {
      const row = document.createElement("div");
      row.className = "session-summary-row";
      N.applyTeamColorStyle(row, t.teamId);
      row.innerHTML = `
        <span class="session-summary-name">${N.escapeHtml(t.name)}</span>
        <span class="session-summary-value">累計 ${t.cumulative} · 平均 ${N.formatScore(t.average)}</span>
      `;
      teamSection.appendChild(row);
    });
    body.appendChild(teamSection);

    const playerSection = document.createElement("div");
    playerSection.className = "session-summary-section";
    playerSection.innerHTML = `<h3 class="session-summary-title">個人成績・収支</h3>`;
    summary.playerSummaries.forEach((p) => {
      const row = document.createElement("div");
      row.className = "session-summary-row";
      row.innerHTML = `
        <span class="session-summary-name">${N.escapeHtml(p.name)}</span>
        <span class="session-summary-value">累計 ${p.cumulative} · 平均 ${N.formatScore(p.average)}</span>
        <span class="session-summary-balance">収支 ${N.formatYen(p.cumulativeBalance)}</span>
      `;
      playerSection.appendChild(row);
    });
    body.appendChild(playerSection);

    modal.showModal();
  }

  N.buildHistoryEntry = buildHistoryEntry;
  N.handleNextGame = handleNextGame;
  N.handlePrevGame = handlePrevGame;
  N.handleDeleteCurrentGame = handleDeleteCurrentGame;
  N.handleResetHistory = handleResetHistory;
  N.renderHistoryList = renderHistoryList;
  N.showHistoryDetail = showHistoryDetail;
  N.handleEndSession = handleEndSession;
  N.showSessionSummaryModal = showSessionSummaryModal;
  N.handleRateChoiceReuse = handleRateChoiceReuse;
  N.handleRateChoiceSpin = handleRateChoiceSpin;
  N.buildSessionSummary = buildSessionSummary;
})(window);
