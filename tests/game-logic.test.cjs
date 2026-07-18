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
const canSafelyAutoFound = loadFunction("canSafelyAutoFound");

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

test("automatic foundation moves stay conservative above rank two", () => {
  global.isRed = (suit) => suit === 1 || suit === 2;
  global.P = { f: [[], [], [], []] };
  global.canFound = (card) => P.f[card.suit].length === card.rank - 1;

  assert.equal(canSafelyAutoFound({ suit: 0, rank: 1 }), true, "aces are always safe");
  P.f[0] = [{}];
  assert.equal(canSafelyAutoFound({ suit: 0, rank: 2 }), true, "twos are always safe");

  P.f = [Array(4), Array(3), Array(2), Array(4)];
  assert.equal(canSafelyAutoFound({ suit: 0, rank: 5 }), false, "waits for both red fours");
  P.f[1] = Array(4);
  P.f[2] = Array(4);
  assert.equal(canSafelyAutoFound({ suit: 0, rank: 5 }), true);
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
  const themeColor = { content: "#7f9e94" };
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

test("persistent controls stay limited to new, hint, undo, and settings", () => {
  const controls = html.match(/<div id="controls">([^]*?)<\/div>\s*<\/div>/)?.[1];
  assert.ok(controls, "found the persistent controls");
  const ids = [...controls.matchAll(/<button id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["btnNew", "btnHint", "btnUndo", "btnMenu"]);
  assert.doesNotMatch(html, /id="btnFinish"/);
});

test("landscape confirmation label fits by yielding its decorative icon", () => {
  assert.match(html, /body\[data-card-style="crehore"\] #btnNew\.confirm\{\s*padding-inline:2px;font-size:\.66rem;letter-spacing:\.045em/);
  assert.match(html, /body\[data-card-style="crehore"\] #btnNew\.confirm \.vintage-icon\{display:none\}/);
  assert.match(html, /#btnNew\.confirm \.classic-icon\{display:none\}/);
});

test("auto-move setting describes automatic foundation play", () => {
  assert.match(html, /Auto-move<span class="sub2">Send exposed cards to the foundation automatically<\/span>/);
});

test("out-of-moves dialog offers a new game", () => {
  assert.match(html, /\$\("winTitle"\)\.textContent = "Out of moves"/);
  assert.match(html, /\$\("btnAgain"\)\.textContent = "New Game"/);
  assert.match(html, /or start a new game\./);
});

test("streak and freeze counts live in settings instead of the header", () => {
  const header = html.match(/<header id="hud">([^]*?)<\/header>/)?.[1];
  assert.ok(header, "found the header");
  assert.doesNotMatch(header, /🔥|❄️|chipStreak|chipFreeze/);
  assert.match(html, /current streak <b>\$\{displayStreak\(\)\}<\/b>/);
  assert.match(html, /streak freezes <b>\$\{stats\.freezes\}<\/b>/);
});

test("vintage settings copy and stock treatment preserve the intended hierarchy", () => {
  assert.match(html, /<h3>Table Settings<\/h3>/);
  assert.match(html, /Win daily to grow your streak\.<br>\s*Every 10 wins earns/);
  assert.match(html, /\.card\.stock-card \.face\{box-shadow:none\}/);
  assert.match(html, /classList\.add\("stock-card"\)/);
  assert.doesNotMatch(html, /#controls::before\{\s*content:"◆"/);
});

test("vintage header diamonds are straight and symmetrical", () => {
  assert.match(html, /\.chips::after\{\s*content:"";align-self:center;width:7px;height:7px/);
  assert.match(html, /clip-path:polygon\(50% 0,100% 50%,50% 100%,0 50%\)/);
  assert.match(html, /\.chips::after\{transform:none\}/);
});

test("vintage table texture has fine grain without enlarged scan smudges", () => {
  const texture = html.match(/body\[data-card-style="crehore"\]::before\{([^}]*)\}/)?.[1];
  assert.ok(texture, "vintage table texture exists");
  assert.match(texture, /repeating-linear-gradient/);
  assert.doesNotMatch(texture, /paper-stock|url\(/);
  assert.doesNotMatch(texture, /contrast\(/);
});

test("vintage table uses a light ground with high-contrast ink and rules", () => {
  const theme = html.match(/body\[data-card-style="crehore"\]\{([^}]*)\}/)?.[1];
  assert.ok(theme, "vintage theme exists");
  assert.match(theme, /--felt:#8faaa1; --felt-deep:#809b92/);
  assert.match(theme, /--vintage-ink:#0f354a; --vintage-ink-strong:#0a2d41/);
  assert.match(theme, /--vintage-rule-rgb:10,43,60/);
});
