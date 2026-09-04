const assert = require("node:assert/strict");
const test = require("node:test");

const Persistence = require("../www/persistence.js");
const silentLogger = { error() {}, warn() {} };

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

function validSavedGame() {
  const deal = Array.from({ length: 52 }, (_, id) => id);
  return {
    schemaVersion: Persistence.SCHEMA_VERSION,
    deal,
    elapsed: 75,
    started: true,
    undos: 1,
    hintUsed: false,
    gameVariant: "draw1",
    s: {
      stock: deal.slice(28),
      waste: [],
      f: [[], [], [], []],
      t: [
        [0],
        [1, 2],
        [3, 4, 5],
        [6, 7, 8, 9],
        [10, 11, 12, 13, 14],
        [15, 16, 17, 18, 19, 20],
        [21, 22, 23, 24, 25, 26, 27],
      ],
      face: deal.map((id) => (id < 28 ? 1 : 0)),
      moves: 3,
    },
  };
}

function defaultSettings() {
  return {
    schemaVersion: Persistence.SCHEMA_VERSION,
    draw3: false,
    winnablePercent: 100,
    autoComplete: true,
    sound: true,
    haptics: true,
    cardStyle: "crehore",
  };
}

test("malformed JSON is preserved for recovery and never overwritten while loading", () => {
  const storage = memoryStorage({ [Persistence.KEYS.stats]: "{not-json" });
  const fallback = { wins: 0 };

  assert.deepEqual(Persistence.loadJSON(storage, Persistence.KEYS.stats, fallback, undefined, silentLogger), fallback);
  assert.equal(storage.getItem(Persistence.KEYS.stats), "{not-json");
  assert.equal(storage.getItem(`${Persistence.KEYS.stats}.recovery`), "{not-json");
});

test("a valid previous value is backed up before a write", () => {
  const original = JSON.stringify({ wins: 8 });
  const storage = memoryStorage({ [Persistence.KEYS.stats]: original });

  assert.equal(Persistence.saveJSON(storage, Persistence.KEYS.stats, { wins: 9 }), true);
  assert.equal(storage.getItem(`${Persistence.KEYS.stats}.backup`), original);
  assert.deepEqual(JSON.parse(storage.getItem(Persistence.KEYS.stats)), { wins: 9 });
});

test("write failures are reported without crashing gameplay", () => {
  const errors = [];
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };

  assert.equal(
    Persistence.saveJSON(storage, Persistence.KEYS.settings, { draw3: true }, { error: (...args) => errors.push(args) }),
    false,
  );
  assert.equal(errors.length, 1);
});

test("saved games require a complete, unique 52-card state", () => {
  const game = validSavedGame();
  assert.equal(Persistence.isValidSavedGame(game), true);

  const duplicateCard = structuredClone(game);
  duplicateCard.s.stock[0] = duplicateCard.s.stock[1];
  assert.equal(Persistence.isValidSavedGame(duplicateCard), false);

  const missingFace = structuredClone(game);
  missingFace.s.face.pop();
  assert.equal(Persistence.isValidSavedGame(missingFace), false);

  const invalidDeal = structuredClone(game);
  invalidDeal.deal[51] = 50;
  assert.equal(Persistence.isValidSavedGame(invalidDeal), false);
});

test("invalid saved games fall back without replacing the original payload", () => {
  const game = validSavedGame();
  game.s.stock.pop();
  const raw = JSON.stringify(game);
  const storage = memoryStorage({ [Persistence.KEYS.game]: raw });

  assert.equal(Persistence.loadGame(storage, silentLogger), null);
  assert.equal(storage.getItem(Persistence.KEYS.game), raw);
  assert.equal(storage.getItem(`${Persistence.KEYS.game}.recovery`), raw);
});

test("saved-game writes add the current schema version", () => {
  const storage = memoryStorage();
  const game = validSavedGame();
  delete game.schemaVersion;

  assert.equal(Persistence.saveGame(storage, game), true);
  assert.equal(JSON.parse(storage.getItem(Persistence.KEYS.game)).schemaVersion, Persistence.SCHEMA_VERSION);
});

test("settings and stats loaders reject unsafe shapes before app startup", () => {
  const invalidSettings = JSON.stringify(["draw3"]);
  const invalidStats = JSON.stringify({ wins: 12, records: "not-an-object" });
  const storage = memoryStorage({
    [Persistence.KEYS.settings]: invalidSettings,
    [Persistence.KEYS.stats]: invalidStats,
  });

  assert.deepEqual(Persistence.loadSettings(storage, silentLogger), defaultSettings());
  assert.equal(Persistence.loadStats(storage, silentLogger), null);
  assert.equal(storage.getItem(`${Persistence.KEYS.settings}.recovery`), invalidSettings);
  assert.equal(storage.getItem(`${Persistence.KEYS.stats}.recovery`), invalidStats);
});

test("stats reject parseable corrupt counters without replacing the original payload", () => {
  const invalidStats = JSON.stringify({
    wins: "12",
    streak: 4,
    longest: 8,
  });
  const storage = memoryStorage({ [Persistence.KEYS.stats]: invalidStats });

  assert.equal(Persistence.loadStats(storage, silentLogger), null);
  assert.equal(storage.getItem(Persistence.KEYS.stats), invalidStats);
  assert.equal(storage.getItem(`${Persistence.KEYS.stats}.recovery`), invalidStats);
});

test("stats validate optional and per-variant counters before loading", () => {
  const invalidPayloads = [
    { wins: 12, streak: 4, longest: 8, freezes: "2" },
    {
      wins: 12,
      streak: 4,
      longest: 8,
      records: { draw1: { games: [] }, draw3: {} },
    },
  ];

  for (const payload of invalidPayloads) {
    const raw = JSON.stringify(payload);
    const storage = memoryStorage({ [Persistence.KEYS.stats]: raw });
    assert.equal(Persistence.loadStats(storage, silentLogger), null);
    assert.equal(storage.getItem(`${Persistence.KEYS.stats}.recovery`), raw);
  }
});

test("legacy stats receive safe defaults for every current counter", () => {
  const legacyStats = { wins: 8, streak: 2, longest: 5, lastWin: null };
  const storage = memoryStorage({
    [Persistence.KEYS.stats]: JSON.stringify(legacyStats),
  });

  const stats = Persistence.loadStats(storage, silentLogger);
  assert.equal(stats.schemaVersion, Persistence.SCHEMA_VERSION);
  assert.equal(stats.freezes, 0);
  assert.equal(stats.winsToward, 0);
  assert.equal(stats.dailyWins, 0);
  assert.deepEqual(stats.records.draw1, {
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
  });
  assert.deepEqual(stats.records.draw3, stats.records.draw1);
});

test("settings reject parseable corrupt values without replacing the original payload", () => {
  const invalidSettings = JSON.stringify({ draw3: "yes", cardStyle: "missing" });
  const storage = memoryStorage({ [Persistence.KEYS.settings]: invalidSettings });

  assert.deepEqual(Persistence.loadSettings(storage, silentLogger), defaultSettings());
  assert.equal(storage.getItem(Persistence.KEYS.settings), invalidSettings);
  assert.equal(storage.getItem(`${Persistence.KEYS.settings}.recovery`), invalidSettings);
});

test("legacy settings migrate to a complete versioned value", () => {
  const storage = memoryStorage({
    [Persistence.KEYS.settings]: JSON.stringify({ draw3: true, dealMode: "random" }),
  });

  assert.deepEqual(Persistence.loadSettings(storage, silentLogger), {
    schemaVersion: Persistence.SCHEMA_VERSION,
    draw3: true,
    winnablePercent: 0,
    autoComplete: true,
    sound: true,
    haptics: true,
    cardStyle: "crehore",
  });
});

test("settings and stats writes include the current schema version", () => {
  const storage = memoryStorage();

  assert.equal(Persistence.saveSettings(storage, { draw3: false }), true);
  assert.equal(
    Persistence.saveStats(storage, { wins: 1, streak: 1, longest: 1, lastWin: null }),
    true
  );
  assert.equal(
    JSON.parse(storage.getItem(Persistence.KEYS.settings)).schemaVersion,
    Persistence.SCHEMA_VERSION
  );
  assert.equal(
    JSON.parse(storage.getItem(Persistence.KEYS.stats)).schemaVersion,
    Persistence.SCHEMA_VERSION
  );
});

test("legacy saved games receive safe defaults without losing their deal", () => {
  const game = validSavedGame();
  delete game.schemaVersion;
  delete game.elapsed;
  delete game.started;
  delete game.undos;
  delete game.hintUsed;
  delete game.gameVariant;
  const storage = memoryStorage({ [Persistence.KEYS.game]: JSON.stringify(game) });

  assert.deepEqual(Persistence.loadGame(storage), {
    ...game,
    schemaVersion: Persistence.SCHEMA_VERSION,
    elapsed: 0,
    started: false,
    undos: 0,
    hintUsed: false,
    gameVariant: null,
  });
});
