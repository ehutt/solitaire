const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const html = fs.readFileSync(new URL("../www/index.html", `file://${__filename}`), "utf8");

function loadFunction(name) {
  const pattern = new RegExp(`function ${name}\\([^]*?^}`, "m");
  const match = html.match(pattern);
  assert.ok(match, `found ${name} in www/index.html`);
  return eval(`(${match[0]})`);
}

const topOf = (cards) => cards[cards.length - 1];
const reachableDrawThreeCards = loadFunction("reachableDrawThreeCards");
const localDayNum = loadFunction("localDayNum");
const displayStreak = loadFunction("displayStreak");

test("draw-three reachability excludes cards permanently buried in each packet", () => {
  global.P = {
    stock: [0, 1, 2, 3, 4, 5].map((id) => ({ id })),
    waste: [],
  };
  assert.deepEqual(reachableDrawThreeCards().map(({ id }) => id), [3, 0]);
});

test("draw-three reachability respects a partially played stock cycle", () => {
  global.P = {
    stock: [0, 1, 2].map((id) => ({ id })),
    waste: [5, 4, 3].map((id) => ({ id })),
  };
  assert.deepEqual(reachableDrawThreeCards().map(({ id }) => id), [3, 0]);
});

test("local day number advances at local midnight across a DST boundary", () => {
  const beforeMidnight = new Date(2026, 2, 7, 23, 59, 59);
  const atMidnight = new Date(2026, 2, 8, 0, 0, 0);
  assert.equal(localDayNum(atMidnight) - localDayNum(beforeMidnight), 1);
});

test("a missed daily streak expires at midnight unless a freeze protects it", () => {
  global.localDayNum = localDayNum;
  global.stats = { lastWin: localDayNum() - 2, streak: 7, freezes: 0 };
  assert.equal(displayStreak(), 0);
  stats.freezes = 1;
  assert.equal(displayStreak(), 7);
});

test("recordWin updates a daily streak immediately and marks each fifth win", () => {
  global.KEY_STATS = "stats";
  global.saveJSON = () => {};
  global.elapsed = 45;
  global.moves = 80;
  global.stats = {
    plays: 5,
    wins: 4,
    streak: 4,
    longest: 4,
    lastWin: localDayNum() - 1,
    freezes: 1,
    winsToward: 4,
    bestTime: 60,
    bestMoves: 90,
  };
  global.localDayNum = localDayNum;
  const recordWin = loadFunction("recordWin");
  const result = recordWin();
  assert.equal(stats.streak, 5);
  assert.equal(stats.wins, 5);
  assert.equal(result.firstWinToday, true);
  assert.equal(result.milestone, 5);

  const secondResult = recordWin();
  assert.equal(stats.streak, 5, "same-day wins do not inflate a daily streak");
  assert.equal(secondResult.firstWinToday, false);
  assert.equal(secondResult.milestone, 0);
});

test("card style switches immediately and persists without replacing the deal", () => {
  const persisted = [];
  const messages = [];
  const statusStyles = [];
  const themeColor = { content: "#7fa4b0" };
  global.settings = { draw3: false, cardStyle: "crehore" };
  global.document = {
    body: { dataset: {} },
    querySelector: (selector) =>
      selector === 'meta[name="theme-color"]' ? themeColor : null,
  };
  global.KEY_SET = "settings";
  global.window = {
    Capacitor: {
      Plugins: {
        StatusBar: { setStyle: ({ style }) => statusStyles.push(style) },
      },
    },
  };
  global.saveJSON = (key, value) => persisted.push([key, { ...value }]);
  global.refreshSheet = () => {};
  global.haptic = () => {};
  global.toast = (message) => messages.push(message);
  global.applyCardStyleTheme = loadFunction("applyCardStyleTheme");
  const setCardStyle = loadFunction("setCardStyle");

  setCardStyle("original");

  assert.equal(settings.cardStyle, "original");
  assert.equal(document.body.dataset.cardStyle, "original");
  assert.equal(themeColor.content, "#0f2e25");
  assert.deepEqual(statusStyles, ["DARK"]);
  assert.deepEqual(persisted, [["settings", { draw3: false, cardStyle: "original" }]]);
  assert.deepEqual(messages, ["Classic cards"]);
});
