/* global module */
(function installPersistence(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SolitairePersistence = api;
})(typeof globalThis === "object" ? globalThis : this, function createPersistence() {
  "use strict";

  const SCHEMA_VERSION = 1;
  const KEYS = Object.freeze({
    game: "patience.v1.game",
    stats: "patience.v1.stats",
    settings: "patience.v1.settings",
  });

  function report(logger, level, message, error) {
    const handler = logger && typeof logger[level] === "function" ? logger[level] : null;
    if (handler) handler.call(logger, message, error);
  }

  function preserveRecoveryCopy(storage, key, raw, logger) {
    try {
      const recoveryKey = `${key}.recovery`;
      if (storage.getItem(recoveryKey) === null) storage.setItem(recoveryKey, raw);
    } catch (error) {
      report(logger, "error", `Could not preserve invalid data for ${key}`, error);
    }
  }

  function loadJSON(storage, key, fallback = null, validate = () => true, logger = console) {
    let raw;
    try {
      raw = storage.getItem(key);
      if (raw === null) return fallback;
    } catch (error) {
      report(logger, "error", `Could not read ${key}`, error);
      return fallback;
    }

    try {
      const value = JSON.parse(raw);
      if (!validate(value)) throw new Error("Stored value failed validation");
      return value;
    } catch (error) {
      preserveRecoveryCopy(storage, key, raw, logger);
      report(logger, "warn", `Ignoring invalid stored data for ${key}`, error);
      return fallback;
    }
  }

  function saveJSON(storage, key, value, logger = console, validate = () => true) {
    try {
      if (!validate(value)) throw new Error("Refusing to save an invalid value");
      const serialized = JSON.stringify(value);
      const previous = storage.getItem(key);
      if (previous !== null && previous !== serialized) {
        try {
          JSON.parse(previous);
          storage.setItem(`${key}.backup`, previous);
        } catch {
          preserveRecoveryCopy(storage, key, previous, logger);
        }
      }
      storage.setItem(key, serialized);
      return true;
    } catch (error) {
      report(logger, "error", `Could not save ${key}`, error);
      return false;
    }
  }

  function isCardId(value) {
    return Number.isInteger(value) && value >= 0 && value < 52;
  }

  function isDeal(value) {
    return (
      Array.isArray(value) &&
      value.length === 52 &&
      value.every(isCardId) &&
      new Set(value).size === 52
    );
  }

  function isPile(value) {
    return Array.isArray(value) && value.every(isCardId);
  }

  function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isOptional(value, validate) {
    return value === undefined || validate(value);
  }

  function isNullableNonNegativeInteger(value) {
    return value === null || isNonNegativeInteger(value);
  }

  function isSettings(value) {
    if (!isRecord(value)) return false;
    const knownKeys = [
      "schemaVersion",
      "draw3",
      "winnablePercent",
      "dealMode",
      "autoComplete",
      "sound",
      "haptics",
      "cardStyle",
    ];
    if (!knownKeys.some((key) => hasOwn(value, key))) return false;
    if (value.schemaVersion !== undefined && value.schemaVersion !== SCHEMA_VERSION) return false;
    if (
      ![value.draw3, value.autoComplete, value.sound, value.haptics].every((field) =>
        isOptional(field, (item) => typeof item === "boolean")
      )
    ) {
      return false;
    }
    if (
      !isOptional(
        value.winnablePercent,
        (percent) => Number.isFinite(percent) && percent >= 0 && percent <= 100
      )
    ) {
      return false;
    }
    if (!isOptional(value.dealMode, (mode) => mode === "random" || mode === "winnable")) {
      return false;
    }
    return isOptional(value.cardStyle, (style) => style === "original" || style === "crehore");
  }

  function normalizeSettings(value) {
    const dealMixSteps = [0, 25, 50, 75, 100];
    const requestedPercent = Number.isFinite(value.winnablePercent)
      ? value.winnablePercent
      : value.dealMode === "random"
        ? 0
        : 100;
    const winnablePercent = dealMixSteps.reduce(
      (nearest, step) =>
        Math.abs(step - requestedPercent) < Math.abs(nearest - requestedPercent) ? step : nearest,
      0
    );
    const settings = {
      ...value,
      schemaVersion: SCHEMA_VERSION,
      draw3: value.draw3 ?? false,
      winnablePercent,
      autoComplete: value.autoComplete ?? true,
      sound: value.sound ?? true,
      haptics: value.haptics ?? true,
      cardStyle: value.cardStyle ?? "crehore",
    };
    delete settings.dealMode;
    return settings;
  }

  function isVariantRecord(value) {
    if (!isRecord(value)) return false;
    const counters = [
      "games",
      "wins",
      "winningMovesTotal",
      "winningTimeTotal",
      "winsWithoutUndo",
      "winsWithoutHints",
      "currentWinStreak",
      "longestWinStreak",
    ];
    const ranges = ["shortestMoves", "longestMoves", "shortestTime", "longestTime"];
    return (
      counters.every((key) => isOptional(value[key], isNonNegativeInteger)) &&
      ranges.every((key) => isOptional(value[key], isNullableNonNegativeInteger))
    );
  }

  function emptyVariantRecord() {
    return {
      games: 0,
      wins: 0,
      winningMovesTotal: 0,
      winningTimeTotal: 0,
      shortestMoves: null,
      longestMoves: null,
      shortestTime: null,
      longestTime: null,
      winsWithoutUndo: 0,
      winsWithoutHints: 0,
      currentWinStreak: 0,
      longestWinStreak: 0,
    };
  }

  function normalizeVariantRecord(value) {
    return { ...emptyVariantRecord(), ...(value || {}) };
  }

  function isStats(value) {
    if (!isRecord(value)) return false;
    if (value.schemaVersion !== undefined && value.schemaVersion !== SCHEMA_VERSION) return false;
    if (![value.wins, value.streak, value.longest].every(isNonNegativeInteger)) return false;
    if (
      ![value.freezes, value.winsToward, value.dailyWins].every((field) =>
        isOptional(field, isNonNegativeInteger)
      )
    ) {
      return false;
    }
    if (
      ![value.lastWin, value.bestTime, value.bestMoves, value.dailyWinDay].every((field) =>
        isOptional(field, isNullableNonNegativeInteger)
      )
    ) {
      return false;
    }
    if (value.records === undefined) return true;
    if (!isRecord(value.records)) return false;
    return [value.records.draw1, value.records.draw3].every(
      (record) => record === undefined || isVariantRecord(record)
    );
  }

  function normalizeStats(value) {
    return {
      ...value,
      schemaVersion: SCHEMA_VERSION,
      lastWin: value.lastWin ?? null,
      freezes: value.freezes ?? 0,
      winsToward: value.winsToward ?? 0,
      bestTime: value.bestTime ?? null,
      bestMoves: value.bestMoves ?? null,
      dailyWinDay: value.dailyWinDay ?? null,
      dailyWins: value.dailyWins ?? 0,
      records: {
        ...(value.records || {}),
        draw1: normalizeVariantRecord(value.records?.draw1),
        draw3: normalizeVariantRecord(value.records?.draw3),
      },
    };
  }

  function isValidSavedGame(game) {
    if (!game || typeof game !== "object" || Array.isArray(game)) return false;
    if (game.schemaVersion !== undefined && game.schemaVersion !== SCHEMA_VERSION) return false;
    if (!isDeal(game.deal) || !game.s || typeof game.s !== "object") return false;

    const state = game.s;
    if (!isPile(state.stock) || !isPile(state.waste)) return false;
    if (!Array.isArray(state.f) || state.f.length !== 4 || !state.f.every(isPile)) return false;
    if (!Array.isArray(state.t) || state.t.length !== 7 || !state.t.every(isPile)) return false;
    if (
      !Array.isArray(state.face) ||
      state.face.length !== 52 ||
      !state.face.every((face) => face === 0 || face === 1 || typeof face === "boolean")
    ) {
      return false;
    }
    if (!isNonNegativeInteger(state.moves)) return false;

    const placedCards = [state.stock, state.waste, ...state.f, ...state.t].flat();
    if (!isDeal(placedCards)) return false;
    for (let suit = 0; suit < state.f.length; suit++) {
      if (
        state.f[suit].some(
          (id, index) => Math.floor(id / 13) !== suit || (id % 13) + 1 !== index + 1
        )
      ) {
        return false;
      }
    }

    if (game.elapsed !== undefined && !isNonNegativeInteger(game.elapsed)) return false;
    if (game.undos !== undefined && !isNonNegativeInteger(game.undos)) return false;
    if (game.started !== undefined && typeof game.started !== "boolean") return false;
    if (game.hintUsed !== undefined && typeof game.hintUsed !== "boolean") return false;
    return (
      game.gameVariant === undefined ||
      game.gameVariant === null ||
      game.gameVariant === "draw1" ||
      game.gameVariant === "draw3"
    );
  }

  function loadGame(storage, logger = console) {
    const game = loadJSON(storage, KEYS.game, null, isValidSavedGame, logger);
    if (!game) return null;
    return {
      ...game,
      schemaVersion: SCHEMA_VERSION,
      elapsed: game.elapsed ?? 0,
      started: game.started ?? false,
      undos: game.undos ?? 0,
      hintUsed: game.hintUsed ?? false,
      gameVariant: game.gameVariant ?? null,
    };
  }

  function loadSettings(storage, logger = console) {
    const settings = loadJSON(storage, KEYS.settings, { draw3: false }, isSettings, logger);
    return normalizeSettings(settings);
  }

  function loadStats(storage, logger = console) {
    const stats = loadJSON(storage, KEYS.stats, null, isStats, logger);
    return stats ? normalizeStats(stats) : null;
  }

  function saveSettings(storage, settings, logger = console) {
    const versioned = { ...settings, schemaVersion: SCHEMA_VERSION };
    return saveJSON(storage, KEYS.settings, versioned, logger, isSettings);
  }

  function saveStats(storage, stats, logger = console) {
    const versioned = { ...stats, schemaVersion: SCHEMA_VERSION };
    return saveJSON(storage, KEYS.stats, versioned, logger, isStats);
  }

  function saveGame(storage, game, logger = console) {
    const versioned = { ...game, schemaVersion: SCHEMA_VERSION };
    return saveJSON(storage, KEYS.game, versioned, logger, isValidSavedGame);
  }

  return Object.freeze({
    SCHEMA_VERSION,
    KEYS,
    isDeal,
    isSettings,
    isStats,
    isValidSavedGame,
    loadJSON,
    saveJSON,
    loadGame,
    saveGame,
    loadSettings,
    saveSettings,
    loadStats,
    saveStats,
  });
});
