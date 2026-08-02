/**
 * Nokoi Tools - Bowling Settlement - Rate Roulette
 */
(function (global) {
  "use strict";

  const N = (global.Nokoi = global.Nokoi || {});

  const ROULETTE_STORAGE_KEY = "nokoi-bowling-roulette";
  const MIN_OPTIONS = 2;
  const MAX_OPTIONS = 100;

  const DEFAULT_PRESETS = [
    {
      id: 1,
      name: "プリセット1",
      options: [
        { amount: 50, weight: 1 },
        { amount: 100, weight: 3 },
        { amount: 150, weight: 2 },
        { amount: 200, weight: 1 },
      ],
    },
    {
      id: 2,
      name: "プリセット2",
      options: [
        { amount: 80, weight: 2 },
        { amount: 100, weight: 2 },
        { amount: 120, weight: 2 },
        { amount: 150, weight: 1 },
        { amount: 200, weight: 1 },
      ],
    },
    {
      id: 3,
      name: "プリセット3",
      options: [
        { amount: 100, weight: 1 },
        { amount: 200, weight: 1 },
        { amount: 300, weight: 1 },
        { amount: 500, weight: 1 },
      ],
    },
  ];

  let rouletteState = {
    activePresetId: 1,
    presets: JSON.parse(JSON.stringify(DEFAULT_PRESETS)),
    lastSpinResult: null,
    isSpinning: false,
  };

  function loadRouletteState() {
    try {
      const raw = localStorage.getItem(ROULETTE_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.presets) && data.presets.length === 3) {
        rouletteState.activePresetId = data.activePresetId || 1;
        rouletteState.presets = data.presets;
        rouletteState.lastSpinResult = data.lastSpinResult || null;
      }
    } catch (e) {
      console.warn("ルーレット設定の復元に失敗:", e);
    }
  }

  function saveRouletteState() {
    try {
      localStorage.setItem(
        ROULETTE_STORAGE_KEY,
        JSON.stringify({
          activePresetId: rouletteState.activePresetId,
          presets: rouletteState.presets,
          lastSpinResult: rouletteState.lastSpinResult,
        })
      );
    } catch (e) {
      console.warn("ルーレット設定の保存に失敗:", e);
    }
  }

  function resetPresets() {
    rouletteState = {
      activePresetId: 1,
      presets: JSON.parse(JSON.stringify(DEFAULT_PRESETS)),
      lastSpinResult: null,
      isSpinning: false,
    };
    localStorage.removeItem(ROULETTE_STORAGE_KEY);
  }

  function getActivePreset() {
    return (
      rouletteState.presets.find((p) => p.id === rouletteState.activePresetId) ||
      rouletteState.presets[0]
    );
  }

  function validateRouletteOptions(options) {
    if (!Array.isArray(options)) return "オプションが不正です。";
    if (options.length < MIN_OPTIONS) {
      return `オプションは${MIN_OPTIONS}個以上必要です。`;
    }
    if (options.length > MAX_OPTIONS) {
      return `オプションは${MAX_OPTIONS}個以下にしてください。`;
    }

    const amounts = new Set();
    for (const opt of options) {
      const amount = parseInt(opt.amount, 10);
      const weight = parseInt(opt.weight, 10);
      if (isNaN(amount) || amount < 1) {
        return "金額は1円以上の整数で入力してください。";
      }
      if (isNaN(weight) || weight < 1) {
        return "重みは1以上の整数で入力してください。";
      }
      if (amounts.has(amount)) {
        return "金額は重複しないようにしてください。";
      }
      amounts.add(amount);
    }
    return null;
  }

  function getProbabilities(options) {
    const totalWeight = options.reduce(
      (s, o) => s + (parseInt(o.weight, 10) || 0),
      0
    );
    if (totalWeight <= 0) return [];
    return options.map((o) => {
      const weight = parseInt(o.weight, 10) || 0;
      return {
        amount: parseInt(o.amount, 10),
        weight,
        probability: (weight / totalWeight) * 100,
      };
    });
  }

  function weightedRandom(options) {
    const totalWeight = options.reduce(
      (s, o) => s + (parseInt(o.weight, 10) || 0),
      0
    );
    let rand = Math.random() * totalWeight;
    for (const opt of options) {
      rand -= parseInt(opt.weight, 10) || 0;
      if (rand <= 0) return parseInt(opt.amount, 10);
    }
    return parseInt(options[options.length - 1].amount, 10);
  }

  function spinRoulette() {
    const preset = getActivePreset();
    const error = validateRouletteOptions(preset.options);
    if (error) return { error };

    const amount = weightedRandom(preset.options);
    rouletteState.lastSpinResult = {
      amount,
      presetId: preset.id,
      presetName: preset.name,
      timestamp: Date.now(),
    };
    saveRouletteState();
    return { amount, preset };
  }

  function setActivePreset(id) {
    rouletteState.activePresetId = id;
    saveRouletteState();
  }

  function updatePresetOptions(presetId, options) {
    const preset = rouletteState.presets.find((p) => p.id === presetId);
    if (!preset) return { error: "プリセットが見つかりません。" };
    const error = validateRouletteOptions(options);
    if (error) return { error };
    preset.options = options.map((o) => ({
      amount: parseInt(o.amount, 10),
      weight: parseInt(o.weight, 10),
    }));
    saveRouletteState();
    return { ok: true };
  }

  function addPresetOption(presetId) {
    const preset = rouletteState.presets.find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.options.length >= MAX_OPTIONS) return;
    const existing = new Set(preset.options.map((o) => o.amount));
    let amount = 100;
    while (existing.has(amount) && amount < 10000) amount += 10;
    preset.options.push({ amount, weight: 1 });
    saveRouletteState();
  }

  function removePresetOption(presetId, index) {
    const preset = rouletteState.presets.find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.options.length <= MIN_OPTIONS) return;
    preset.options.splice(index, 1);
    saveRouletteState();
  }

  function applySpinResult(amount) {
    N.state.settings.pricePerPin = amount;
    N.state.settings.lastUsedRate = amount;
    if (N.dom && N.dom.pricePerPin) {
      N.dom.pricePerPin.value = String(amount);
    }
    if (N.renderRouletteDisplay) N.renderRouletteDisplay();
    N.scheduleSave();
  }

  function animateSpin(callback) {
    if (rouletteState.isSpinning) return;
    rouletteState.isSpinning = true;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const preset = getActivePreset();
    const display = N.dom?.rouletteDisplay;

    if (reducedMotion || !display) {
      const result = spinRoulette();
      rouletteState.isSpinning = false;
      if (result.error) {
        if (callback) callback(result);
        return;
      }
      applySpinResult(result.amount);
      if (N.renderRouletteDisplay) N.renderRouletteDisplay();
      if (callback) callback(result);
      return;
    }

    let ticks = 0;
    const maxTicks = 20;
    const interval = setInterval(() => {
      ticks++;
      const randomOpt =
        preset.options[Math.floor(Math.random() * preset.options.length)];
      if (display) {
        display.textContent = `1ピン＝${parseInt(randomOpt.amount, 10)}円`;
        display.classList.add("roulette-spinning");
      }
      if (ticks >= maxTicks) {
        clearInterval(interval);
        if (display) display.classList.remove("roulette-spinning");
        const result = spinRoulette();
        rouletteState.isSpinning = false;
        if (result.error) {
          if (callback) callback(result);
          return;
        }
        applySpinResult(result.amount);
        if (display) {
          display.textContent = `1ピン＝${result.amount}円`;
          display.classList.add("roulette-result-flash");
          setTimeout(() => display.classList.remove("roulette-result-flash"), 600);
        }
        if (N.renderRouletteDisplay) N.renderRouletteDisplay();
        if (callback) callback(result);
      }
    }, 80);
  }

  function updatePresetName(presetId, name) {
    const preset = rouletteState.presets.find((p) => p.id === presetId);
    if (!preset) return { error: "プリセットが見つかりません。" };
    const trimmed = (name || "").trim();
    if (!trimmed) return { error: "プリセット名を入力してください。" };
    preset.name = trimmed;
    saveRouletteState();
    return { ok: true };
  }

  N.Roulette = {
    ROULETTE_STORAGE_KEY,
    MIN_OPTIONS,
    MAX_OPTIONS,
    DEFAULT_PRESETS,
    loadRouletteState,
    saveRouletteState,
    resetPresets,
    getState: () => rouletteState,
    getActivePreset,
    validateRouletteOptions,
    getProbabilities,
    weightedRandom,
    spinRoulette,
    setActivePreset,
    updatePresetOptions,
    updatePresetName,
    addPresetOption,
    removePresetOption,
    applySpinResult,
    animateSpin,
  };
})(window);
