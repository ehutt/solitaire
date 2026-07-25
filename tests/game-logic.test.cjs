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
  global.recordVariantWin = () => {};
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

test("variant records capture winning ranges, averages, clean wins, and streaks", () => {
  global.emptyVariantRecord = loadFunction("emptyVariantRecord");
  global.normalizeVariantRecord = loadFunction("normalizeVariantRecord");
  global.stats = { records: { draw1: emptyVariantRecord(), draw3: emptyVariantRecord() } };
  global.gameVariant = "draw3";
  global.settings = { draw3: true };
  global.moves = 92;
  global.elapsed = 185;
  global.undos = 0;
  global.hintUsed = false;
  const recordVariantWin = loadFunction("recordVariantWin");

  recordVariantWin();
  moves = 118;
  elapsed = 245;
  undos = 2;
  hintUsed = true;
  recordVariantWin();

  assert.deepEqual(stats.records.draw1, emptyVariantRecord());
  assert.deepEqual(stats.records.draw3, {
    games: 0,
    wins: 2,
    winningMovesTotal: 210,
    winningTimeTotal: 430,
    shortestMoves: 92,
    longestMoves: 118,
    shortestTime: 185,
    longestTime: 245,
    winsWithoutUndo: 1,
    winsWithoutHints: 1,
    currentWinStreak: 2,
    longestWinStreak: 2,
  });
});

test("a loss resets only the active variant's winning streak", () => {
  global.KEY_STATS = "stats";
  global.saveJSON = () => {};
  global.gameVariant = "draw1";
  global.stats = {
    records: {
      draw1: { currentWinStreak: 4 },
      draw3: { currentWinStreak: 7 },
    },
  };
  const recordLoss = loadFunction("recordLoss");

  recordLoss();

  assert.equal(stats.records.draw1.currentWinStreak, 0);
  assert.equal(stats.records.draw3.currentWinStreak, 7);
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
  global.P = null;
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

test("streak and freeze counts use style-appropriate labels in the header", () => {
  const header = html.match(/<header id="hud">([^]*?)<\/header>/)?.[1];
  assert.ok(header, "found the header");
  // The streak pill carries a plain engraved label in both styles — no flame
  // glyph at all; freezes live only in the menu sheet's record line.
  assert.match(header, /id="chipStreak"[^]*?<small>Streak<\/small><b id="vStreak">/);
  assert.doesNotMatch(header, /🔥|❄️/);
  assert.doesNotMatch(header, /chipFreeze|vFreezes/);
  assert.doesNotMatch(html, /brass-flame|classic-stat-icon|vintage-stat-label/);
  assert.match(html, /\$\("vStreak"\)\.textContent = streak/);
  assert.match(html, /Current streak: \$\{streak\}/);
  assert.match(html, /current streak <b>\$\{displayStreak\(\)\}<\/b>/);
  assert.match(html, /streak freezes <b>\$\{stats\.freezes\}<\/b>/);
});

test("settings record preview combines draw variants", () => {
  assert.match(html, /wins: draw1\.wins \+ draw3\.wins/);
  assert.match(html, /games: draw1\.games \+ draw3\.games/);
  assert.match(html, /<b>\$\{winRate\(combined\)\}%<\/b> win rate/);
  assert.doesNotMatch(html, /<strong>Draw (?:One|Three)<\/strong>/);
});

test("iPad rules keep interface text large after landscape overrides", () => {
  const tabletRules = html.match(/\/\* Final tablet overrides[^]*?<\/style>/)?.[0];
  assert.ok(tabletRules, "found final tablet overrides");
  assert.match(tabletRules, /\.chip\{font-size:1\.5rem/);
  assert.match(tabletRules, /\.row\{padding:21px 0;font-size:1\.65rem/);
  assert.match(tabletRules, /\.row \.sub2\{font-size:1\.3rem/);
  // Both card styles restyle the sheet title with an attribute selector, which
  // outranks a bare `#sheet h3` — the tablet size must be scoped the same way
  // or the iPad silently keeps the phone-sized title.
  assert.match(
    tabletRules,
    /body\[data-card-style="original"\] #sheet h3,\s*body\[data-card-style="crehore"\] #sheet h3\{font-size:2\.7rem/,
  );
  assert.match(tabletRules, /\.record-card span\{font-size:1\.32rem/);
  assert.match(tabletRules, /\.stats-header h2\{font-size:2\.5rem\}/);
  assert.match(tabletRules, /\.stats-detail-row\{font-size:1\.35rem/);
  assert.match(tabletRules, /body\[data-card-style="crehore"\] \.chip\{[^}]*font-size:1\.45rem/);
  assert.match(tabletRules, /orientation:landscape/);
  assert.match(tabletRules, /--control-rail:clamp\(132px,13vw,156px\)/);
});

test("win dialog leaves a little more time to watch the cascade", () => {
  assert.match(html, /winDialogTimer = setTimeout\([^]*?reduced\?100:3000\)/);
});

test("vintage settings copy and stock treatment preserve the intended hierarchy", () => {
  assert.match(html, /<h3>Game Settings<\/h3>/);
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

test("vintage table has wool grain and a soft edge falloff, no heavy vignette", () => {
  const theme = html.match(/body\[data-card-style="crehore"\]\{([^]*?)\n  \}/)?.[1];
  assert.ok(theme, "vintage theme exists");
  assert.match(theme, /feTurbulence/);            // SVG wool grain
  assert.match(theme, /radial-gradient\(130% 100% at 35% -12%/); // lamplight
  const falloff = html.match(/body\[data-card-style="crehore"\]::before\{([^}]*)\}/)?.[1];
  assert.ok(falloff, "edge falloff exists");
  assert.match(falloff, /box-shadow:inset 0 0 60px/);
  assert.doesNotMatch(falloff, /url\(/);
});

test("vintage table uses bright burgundy felt with high-contrast parchment rules", () => {
  const theme = html.match(/body\[data-card-style="crehore"\]\{([^]*?)\n  \}/)?.[1];
  assert.ok(theme, "vintage theme exists");
  assert.match(theme, /--felt:#75141e; --felt-deep:#4d0810/);
  assert.match(theme, /--vintage-ink:#efd9a4; --vintage-ink-strong:#f6e3b2/);
  assert.match(theme, /--vintage-rule-rgb:222,184,112/);
});

test("classic cards use one simple fan-safe index with a right-aligned suit", () => {
  const indexRule = html.match(/body\[data-card-style="original"\] \.ix\{([^}]*)\}/)?.[1];
  assert.ok(indexRule, "classic index rule exists");
  assert.match(indexRule, /justify-content:space-between/);
  assert.match(indexRule, /font-size:2\.7em/);
  assert.match(html, /\.ix b\{\s*flex:none;font-size:\.94em;font-weight:700;text-align:right/);
  assert.doesNotMatch(html, /\.ix\.br|class="ix br/);
  assert.match(html, /const minFaceUpReveal = settings\.cardStyle === "original" \? \.30 : \.24/);
  assert.match(html, /const preferredFaceUpReveal = settings\.cardStyle === "original" \? \.32 : 142\/522/);
});

test("classic court ranks align with number ranks and clear the tableau fan", () => {
  const centerRule = html.match(/body\[data-card-style="original"\] \.mid\{([^}]*)\}/)?.[1];
  const courtRule = html.match(/body\[data-card-style="original"\] \.mid\.court\{([^}]*)\}/)?.[1];
  assert.ok(centerRule, "classic center-symbol rule exists");
  assert.match(centerRule, /inset:0/);
  assert.match(centerRule, /align-items:center;justify-content:center/);
  assert.ok(courtRule, "classic court-symbol rule exists");
  assert.match(courtRule, /line-height:1;transform:translateY\(\.05em\)/);
  assert.match(html, /\.ix\.court i\{font-size:1em\}/);
  assert.match(html, /\.ix\.j i\{transform:translateX\(calc\(var\(--cw\)\*\.018\)\)\}/);
  assert.match(html, /const court = card\.rank>=11 \? \["j","q","k"\]\[card\.rank-11\] : ""/);
  assert.match(html, /` court \$\{court\}`/);
});

test("classic portrait header and controls are enlarged with balanced icons", () => {
  const portraitHud = html.match(/body\[data-card-style="original"\] #hud\{([^}]*)\}/)?.[1];
  assert.ok(portraitHud, "classic portrait HUD rule exists");
  assert.match(portraitHud, /display:flex;flex-wrap:wrap/);
  assert.match(portraitHud, /padding:calc\(env\(safe-area-inset-top, 0px\) \+ 15px\) 16px 13px/);
  assert.match(html, /body\[data-card-style="original"\] \.brand\{\s*justify-content:flex-start;font-size:clamp\(1\.68rem,6\.72vw,2\.28rem\)/);
  // Labelled club-rail pills take their own centered row on portrait phones
  assert.match(html, /body\[data-card-style="original"\] \.chips\{flex:0 0 100%;justify-content:center;gap:6px\}/);
  // Emoji control icons are retired; only the menu ellipsis glyph remains
  assert.match(html, /#btnNew \.classic-icon,\s*[^{]*#btnHint \.classic-icon,\s*[^{]*#btnUndo \.classic-icon\{display:none\}/);
  assert.match(html, /body\[data-card-style="original"\] #btnMenu \.classic-icon\{[^}]*font-size:1\.7rem/);
});
