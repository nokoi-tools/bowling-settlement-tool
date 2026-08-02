/**
 * Nokoi Tools - Bowling Settlement - Calculation
 * 精算は常に今回のゲームスコアのみを使用
 */
(function (global) {
  "use strict";

  const N = (global.Nokoi = global.Nokoi || {});

  function buildTeamsData(scores) {
    const teamsMap = {};
    N.state.teams.forEach((t) => {
      teamsMap[t.id] = {
        id: t.id,
        name: N.getTeamDisplayName(t.id),
        members: [],
        total: 0,
        average: 0,
        scoreParts: [],
      };
    });

    N.state.players.slice(0, N.state.playerCount).forEach((p, i) => {
      const team = teamsMap[p.teamId];
      if (!team) return;
      const score = scores[i];
      team.members.push({
        id: p.id,
        name: N.getPlayerDisplayName(p, i),
        score,
      });
      team.total += score;
      team.scoreParts.push(score);
    });

    const teams = Object.values(teamsMap).slice(0, N.state.teamCount);
    teams.forEach((t) => {
      t.average = t.members.length ? t.total / t.members.length : 0;
      t.formula = buildTeamFormula(t.scoreParts, t.total, t.average);
    });
    return teams;
  }
  N.buildTeamsData = buildTeamsData;

  function buildTeamFormula(parts, total, average) {
    if (!parts.length) return "";
    const scoresStr = parts.map((s) => String(s)).join("＋");
    return `${scoresStr}＝${total} 平均${N.formatScore(average)}`;
  }
  N.buildTeamFormula = buildTeamFormula;

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
  N.rankTeams = rankTeams;

  function buildRankGroups(rankedTeams) {
    const groups = {};
    rankedTeams.forEach((t) => {
      if (!groups[t.rank]) groups[t.rank] = [];
      groups[t.rank].push(t);
    });
    return groups;
  }
  N.buildRankGroups = buildRankGroups;

  function distributeInteger(totalYen, count) {
    const base = Math.floor(totalYen / count);
    const remainder = totalYen - base * count;
    const amounts = Array(count).fill(base);
    for (let i = 0; i < remainder; i++) amounts[i] += 1;
    return amounts;
  }
  N.distributeInteger = distributeInteger;

  function calculatePairBalances(
    fromTeams,
    toTeams,
    diff,
    pricePerPin,
    calcMethod,
    balances
  ) {
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
  N.calculatePairBalances = calculatePairBalances;

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
  N.applyRoundingToBalances = applyRoundingToBalances;

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
    const targets =
      adjust === "winner"
        ? winners
        : adjust === "loser"
          ? losers
          : winners.length
            ? winners
            : losers;

    if (!targets.length) {
      const firstId = N.state.players[0]?.id;
      if (firstId) result.set(firstId, (result.get(firstId) || 0) + diff);
      return result;
    }

    const perPerson = Math.trunc(diff / targets.length);
    let leftover = diff - perPerson * targets.length;
    targets.forEach(([id, val], i) => {
      const add =
        perPerson + (i < Math.abs(leftover) ? (leftover > 0 ? 1 : -1) : 0);
      result.set(id, val + add);
    });

    return result;
  }
  N.adjustRemainder = adjustRemainder;

  function verifyBalanceZero(balances) {
    const sum = [...balances.values()].reduce((a, b) => a + b, 0);
    return sum === 0;
  }
  N.verifyBalanceZero = verifyBalanceZero;

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
  N.minimizeTransactions = minimizeTransactions;

  function runCalculation() {
    const scoreErrors = N.validateScores(true);
    if (scoreErrors.length) {
      return { error: scoreErrors[0].message, scoreErrors };
    }

    const scores = N.getCurrentScores();
    if (scores.some((s) => isNaN(s))) {
      return { error: "スコアを正しく入力してください。", scoreErrors };
    }

    const price = N.state.settings.pricePerPin;
    if (!price || price <= 0) {
      return { error: "精算単価（1ピンあたりの金額）を正しく入力してください。" };
    }

    const teams = buildTeamsData(scores);
    const emptyTeam = teams.find((t) => t.members.length === 0);
    if (emptyTeam) return { error: "すべてのチームに1人以上必要です。" };

    const calcMethod = N.state.settings.calcMethod;
    const rankedTeams = rankTeams(teams, calcMethod);
    const rankGroups = buildRankGroups(rankedTeams);

    const preset = N.state.settings.settlementPreset;
    const pairs =
      preset === "custom"
        ? N.state.settings.settlementPairs
        : N.buildPresetPairs(preset, N.state.teamCount);

    const pairError = N.validateSettlementPairs(pairs, rankGroups);
    if (pairError) return { error: pairError };

    const metricKey = calcMethod === "average" ? "average" : "total";
    const balances = new Map();
    N.state.players.slice(0, N.state.playerCount).forEach((p) => {
      balances.set(p.id, 0);
    });

    const pairDetails = [];
    let rawTotal = 0;

    for (const pair of pairs) {
      const fromTeams = N.getTeamsAtRank(rankGroups, pair.fromRank, pair.fromTeamId);
      const toTeams = N.getTeamsAtRank(rankGroups, pair.toRank, pair.toTeamId);
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
        fromTeams,
        toTeams,
        diff,
        price,
        calcMethod,
        balances
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

    const winner = rankedTeams.find((t) => t.rank === 1);

    if (rawTotal === 0) {
      return {
        rankedTeams,
        rankGroups,
        pairDetails,
        payments: [],
        playerBalances: balances,
        rawTotal: 0,
        trimmed: 0,
        finalTotal: 0,
        isDraw: true,
        calcMethod,
        pricePerPin: price,
        winnerTeamId: winner?.id,
        winnerTeamName: winner?.name,
        warnings: [],
      };
    }

    const { balances: roundedBalances, trimmed } = applyRoundingToBalances(
      balances,
      N.state.settings.rounding
    );

    const repId = N.state.settings.remainderRepId || N.state.players[0]?.id;
    const adjusted = adjustRemainder(
      roundedBalances,
      N.state.settings.remainderAdjust,
      repId
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
      warnings.push(
        "チーム人数が不均等です。合計点方式では人数差に注意してください。平均点方式の利用も検討してください。"
      );
    } else if (uneven) {
      warnings.push("チーム人数が不均等です。平均点方式で計算しています。");
    }

    return {
      rankedTeams,
      rankGroups,
      pairDetails,
      payments,
      playerBalances: adjusted,
      rawTotal,
      trimmed,
      finalTotal,
      isDraw: false,
      calcMethod,
      pricePerPin: price,
      winnerTeamId: winner?.id,
      winnerTeamName: winner?.name,
      warnings,
    };
  }
  N.runCalculation = runCalculation;

  function buildResultText(result) {
    const lines = [
      "【ボウリング精算・差額計算結果】",
      `第${N.state.currentGame}ゲーム`,
      "対象: 今回のゲームのみ",
      "",
      "■ 順位",
    ];

    [...result.rankedTeams]
      .sort((a, b) => a.rank - b.rank)
      .forEach((t) => {
        lines.push(
          `${N.formatRankLabel(t.rank, t.tied)} ${t.name}（${t.formula || `${t.total} / 平均${N.formatScore(t.average)}`}）`
        );
      });

    lines.push("", "■ 差額計算");
    result.pairDetails
      .filter((d) => !d.skipped)
      .forEach((d) => {
        lines.push(
          `${d.fromRank}位→${d.toRank}位: 差${N.formatScore(d.diff)}ピン = ${N.formatYenAbs(d.pairAmount)}`
        );
      });

    lines.push(
      "",
      `処理前精算総額: ${N.formatYenAbs(result.rawTotal || 0)}`,
      `端数切捨: ${N.formatYenAbs(result.trimmed || 0)}`,
      `精算総額: ${N.formatYenAbs(result.finalTotal || 0)}`,
      "",
      "■ 送金結果（支払い内訳）"
    );

    if (!result.payments?.length) {
      lines.push("なし");
    } else {
      result.payments.forEach((p) => {
        const fromP = N.getPlayerById(p.fromId);
        const toP = N.getPlayerById(p.toId);
        lines.push(
          `${fromP ? N.getPlayerDisplayName(fromP, N.state.players.indexOf(fromP)) : "?"} → ${toP ? N.getPlayerDisplayName(toP, N.state.players.indexOf(toP)) : "?"}: ${N.formatYenAbs(p.amount)}`
        );
      });
    }

    lines.push("", "■ 個人収支");
    N.state.players.slice(0, N.state.playerCount).forEach((p, i) => {
      const stats = N.getPlayerStats(p);
      lines.push(
        `${N.getPlayerDisplayName(p, i)}: 今回${N.formatYen(stats.gameBalance)} / 累計${N.formatYen(stats.cumulativeBalance)}`
      );
    });

    return lines.join("\n");
  }
  N.buildResultText = buildResultText;
})(window);
