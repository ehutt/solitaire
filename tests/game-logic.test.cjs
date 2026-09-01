const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const html = fs.readFileSync(new URL("../www/index.html", `file://${__filename}`), "utf8");
const splash = fs.readFileSync(new URL("../scripts/assets/classic-splash.svg", `file://${__filename}`), "utf8");

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

test("a new player earns their first freeze on their tenth win", () => {
  global.KEY_STATS = "stats";
  global.saveJSON = () => {};
  global.elapsed = 45;
  global.moves = 80;
  global.stats = {
    wins: 0,
    streak: 0,
    longest: 0,
    lastWin: null,
    freezes: 0,
    winsToward: 0,
    bestTime: null,
    bestMoves: null,
  };
  global.localDayNum = localDayNum;
  global.recordVariantWin = () => {};
  const recordWin = loadFunction("recordWin");

  for(let win = 1; win < 10; win++){
    const result = recordWin();
    assert.equal(result.earned, false, `win ${win} does not earn a freeze`);
    assert.equal(stats.freezes, 0);
  }

  const tenthWin = recordWin();
  assert.equal(tenthWin.earned, true);
  assert.equal(stats.freezes, 1);
  assert.equal(stats.winsToward, 0);
});

test("new player stats start with no freezes or banked wins", () => {
  const defaults = html.match(/let stats = loadJSON\(KEY_STATS\) \|\| \{([^]*?)\n\};/)?.[1];
  assert.ok(defaults, "found the default stats");
  assert.match(defaults, /freezes:0, winsToward:0/);
});

test("using a freeze resets progress before a veteran can earn it back", () => {
  global.KEY_STATS = "stats";
  global.saveJSON = () => {};
  global.elapsed = 45;
  global.moves = 80;
  global.stats = {
    wins: 137,
    streak: 40,
    longest: 40,
    lastWin: localDayNum() - 2,
    freezes: 1,
    winsToward: 10,
    bestTime: 30,
    bestMoves: 70,
  };
  global.localDayNum = localDayNum;
  global.recordVariantWin = () => {};
  const recordWin = loadFunction("recordWin");

  const protectedWin = recordWin();
  assert.equal(protectedWin.usedFreeze, 1);
  assert.equal(protectedWin.earned, false, "the used freeze is not immediately replenished");
  assert.equal(stats.freezes, 0);
  assert.equal(stats.winsToward, 0, "earning progress restarts after freeze use");

  for(let newWin = 1; newWin < 10; newWin++){
    recordWin();
    assert.equal(stats.freezes, 0, `new win ${newWin} does not replenish the freeze`);
  }

  const tenthNewWin = recordWin();
  assert.equal(tenthNewWin.earned, true);
  assert.equal(stats.freezes, 1);
  assert.equal(stats.winsToward, 0);
});

test("wins at the freeze cap do not bank progress", () => {
  global.KEY_STATS = "stats";
  global.saveJSON = () => {};
  global.elapsed = 45;
  global.moves = 80;
  global.stats = {
    wins: 100,
    streak: 20,
    longest: 20,
    lastWin: localDayNum(),
    freezes: 3,
    winsToward: 0,
    bestTime: 30,
    bestMoves: 70,
  };
  global.localDayNum = localDayNum;
  global.recordVariantWin = () => {};
  const recordWin = loadFunction("recordWin");

  for(let win = 0; win < 25; win++) recordWin();

  assert.equal(stats.freezes, 3);
  assert.equal(stats.winsToward, 0);
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
  const swapClasses = [];
  global.document = {
    documentElement: { style: {} },
    body: {
      dataset: {},
      classList: {
        add: (name) => swapClasses.push(["add", name]),
        remove: (name) => swapClasses.push(["remove", name]),
      },
    },
    querySelector: (selector) =>
      selector === 'meta[name="theme-color"]' ? themeColor : null,
  };
  global.getComputedStyle = () => ({
    getPropertyValue: (name) => name === "--felt-deep" ? "#071d17" : "",
  });
  global.requestAnimationFrame = (fn) => fn();
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
  assert.equal(document.documentElement.style.backgroundColor, "#071d17");
  assert.equal(themeColor.content, "#0f2e25");
  assert.deepEqual(statusStyles, ["DARK"]);
  assert.deepEqual(persisted, [["settings", { draw3: false, cardStyle: "original" }]]);
  assert.deepEqual(messages, ["Classic cards"]);
  // Themed colours land in one frame rather than crossfading through the swap.
  assert.deepEqual(swapClasses, [["add", "theme-swap"], ["remove", "theme-swap"]]);
});

test("persistent controls stay limited to deal, hint, undo, and settings", () => {
  const controls = html.match(/<div id="controls">([^]*?)<\/div>\s*<\/div>/)?.[1];
  assert.ok(controls, "found the persistent controls");
  const ids = [...controls.matchAll(/<button id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["btnDeal", "btnHint", "btnUndo", "btnMenu"]);
  assert.doesNotMatch(html, /id="btnFinish"/);
});

test("deal menu provides new and restart as a deliberate two-step choice", () => {
  assert.match(html, /id="btnDeal"[^>]*aria-controls="dealSheet"/);
  assert.match(html, /id="btnNewDeal"[^]*?<strong>New deal<\/strong>/);
  assert.match(html, /id="btnRestartDeal"[^]*?<strong>Restart deal<\/strong>/);
  assert.match(html, /\$\("btnRestartDeal"\)\.onclick = \(\)=>beginDeal\(initialDeal\)/);
  assert.doesNotMatch(html, /newConfirm|Tap Confirm|btnDeal\.confirm/);
});

test("auto-move setting describes automatic foundation play", () => {
  assert.match(html, /Auto-move<span class="sub2">Send exposed cards to the foundation automatically<\/span>/);
});

test("out-of-moves dialog prioritizes recovery and keeps stats out of the decision", () => {
  assert.match(html, /"No useful moves left" : "No moves left"/);
  assert.match(html, /\{id:"btnAdmire",label:undoStack\.length \? "Undo a move" : "Back to table",tone:"primary"\}/);
  assert.match(html, /\{id:"btnReplayDeal",label:"Restart deal",tone:"secondary"\}/);
  assert.match(html, /\{id:"btnAgain",label:"New deal",tone:"quiet"\}/);
  assert.match(html, /\.panel\[data-mode="stuck"\] \.scorecard-only,[^]*display:none/);
});

test("draw recovery explains the rule change without showing game statistics", () => {
  assert.match(html, /Draw three cannot reach the next useful card\./);
  assert.match(html, /Switching to draw one keeps this deal and your progress\./);
  assert.match(html, /configureDialog\("draw-one",\[/);
  assert.match(html, /\.panel\[data-mode="draw-one"\] \.scorecard-only\{display:none\}/);
});

test("win dialog uses fixed scorecard copy and separates freeze progress", () => {
  assert.doesNotMatch(html, /The cards fell your way|Order from chaos|Beautifully played/);
  assert.match(html, /\$\("winSub"\)\.textContent = "The deal is complete\."/);
  assert.match(html, /until your next streak freeze\./);
  assert.match(html, /id="wProgress"/);
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

// The iPad's larger interface text is asserted by the layout suite, which
// measures it rendered at an iPad viewport in both card styles
// (tests/layout.spec.mjs, "is larger on tablet than on phone"). Restating the
// declarations here caught nothing and broke on every restyle. What remains is
// the structural fact those sizes depend on:
test("tablet type sizes are declared where they can out-rank both themes", () => {
  const tabletRules = html.match(/\/\* Final tablet overrides[^]*?<\/style>/)?.[0];
  assert.ok(tabletRules, "found final tablet overrides");
  // `body[data-card-style]` ties the themes on specificity and wins on order.
  // A bare `#sheet h3` here would lose, and the iPad would silently keep the
  // phone-sized title — which is exactly what used to ship.
  assert.match(tabletRules, /body\[data-card-style\]\{[^}]*--type-sheet-title/);
});

test("win dialog leaves a little more time to watch the cascade", () => {
  assert.match(html, /winDialogTimer = setTimeout\([^]*?reduced\?100:3000\)/);
});

test("vintage settings copy and stock treatment preserve the intended hierarchy", () => {
  assert.match(html, /<h3 id="settingsTitle">Game Settings<\/h3>/);
  assert.match(html, /settings-section-label">Table<\/h4>[^]*settings-section-label">Play<\/h4>[^]*settings-section-label">Deal<\/h4>[^]*settings-section-label">Record<\/h4>/);
  assert.match(html, /Win daily to grow your streak\.<br>\s*Every 10 wins earns/);
  assert.match(html, /\.card\.stock-card \.face\{box-shadow:none\}/);
  assert.match(html, /classList\.add\("stock-card"\)/);
  assert.doesNotMatch(html, /#controls::before\{\s*content:"◆"/);
});

test("vintage header uses one simple printer's rule between the title and stats", () => {
  const hud = html.match(/body\[data-card-style="crehore"\] #hud\{([^}]*)\}/)?.[1];
  const chips = html.match(/body\[data-card-style="crehore"\] \.chips\{([^}]*)\}/)?.[1];
  const rosette = html.match(/body\[data-card-style="crehore"\] \.brand-rosette\{([^}]*)\}/)?.[1];
  const controls = html.match(/body\[data-card-style="crehore"\] #controls\{([^}]*)\}/)?.[1];
  assert.match(hud, /border:0/);
  assert.doesNotMatch(hud, /double/);
  assert.match(chips, /border:0;margin:0;padding-top:2px/);
  assert.match(html, /--vintage-divider-display:block/);
  assert.match(html, /<div class="vintage-divider" aria-hidden="true"><\/div>/);
  assert.doesNotMatch(html, /M34 6C26 6 25 2 19 2|M414 6c22 0 27-5 43-5/);
  assert.match(rosette, /width:\.62em;height:\.62em/);
  assert.match(rosette, /opacity:\.68/);
  assert.match(controls, /border:0/);
  assert.doesNotMatch(controls, /double/);
  assert.doesNotMatch(html, /\.chips::before|\.chips::after/);
});

test("classic branding uses clubs in the marquee and launch screen", () => {
  assert.match(html, /id="clubArt"/);
  assert.match(html, /<use href="#clubArt"\/>/);
  assert.doesNotMatch(html, /class="pip"[^>]*>♠/);
  assert.match(splash, /fill="#d9a648"/);
  assert.match(splash, /stroke="#b98a2f"/);
  assert.match(splash, /M50 5C37 5 27 15 27 28/);
});

test("game figures use a traditional serif with stable, readable numerals", () => {
  assert.match(html, /--face-figures:Georgia,var\(--serif\)/);
  assert.match(html, /font-family:var\(--face-figures\)/);
  assert.match(html, /font-variant-numeric:tabular-nums/);
  assert.match(html, /font-feature-settings:"tnum" 1/);
  assert.doesNotMatch(html, /slashed-zero|"zero" 1/);
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

test("classic cards use a compact fan-safe horizontal index", () => {
  const indexRule = html.match(/body\[data-card-style="original"\] \.ix\{([^}]*)\}/)?.[1];
  const theme = html.match(/body\[data-card-style="original"\]\{([^]*?)\n  \}/)?.[1];
  assert.ok(indexRule, "classic index rule exists");
  assert.ok(theme, "classic theme exists");
  assert.match(theme, /--face-card:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif/);
  assert.match(theme, /--face-label:"Marcellus",var\(--serif\)/);
  assert.match(theme, /--type-card-index-suit:1\.15em/);
  assert.match(indexRule, /display:flex/);
  assert.match(indexRule, /justify-content:space-between/);
  assert.match(indexRule, /font-weight:700/);
  assert.doesNotMatch(indexRule, /z-index/);
  // Face composition is sized in card-relative ems outside the theme block.
  assert.match(html, /\.ix\{font-size:2\.75em\}/);
  assert.doesNotMatch(html, /\.ix\.ten\{font-size:/);
  assert.doesNotMatch(html, /\.ix\.ten i\{[^}]*transform:scaleX/);
  assert.match(html, /\.ix b\{font-size:var\(--type-card-index-suit\)\}/);
  assert.match(html, /\.mid\{font-size:5\.45em;transform:translateY\(\.15em\)\}/);
  assert.match(html, /\.mid\.ace\{font-size:6\.05em\}/);
  assert.match(html, /\.ix b\{\s*flex:none;font-family:var\(--serif\)/);
  assert.match(html, /return `\$\{center\}<div class="ix tl\$\{indexClass\}">/);
  assert.doesNotMatch(html, /\.ix\.br|class="ix br/);
  assert.match(html, /const minFaceUpReveal = settings\.cardStyle === "original" \? \.30 : \.24/);
  assert.match(html, /const preferredFaceUpReveal = settings\.cardStyle === "original" \? \.32 : 142\/522/);
  assert.match(html, /const fanOff = cw\*\.3/);
});

test("classic courts use vector artwork while their ranks clear the tableau fan", () => {
  const centerRule = html.match(/body\[data-card-style="original"\] \.mid\{([^}]*)\}/)?.[1];
  const courtRule = html.match(/body\[data-card-style="original"\] \.mid\.court\{([^}]*)\}/)?.[1];
  assert.ok(centerRule, "classic center-symbol rule exists");
  assert.match(centerRule, /inset:0/);
  assert.match(centerRule, /align-items:center;justify-content:center/);
  assert.ok(courtRule, "classic court-symbol rule exists");
  assert.match(courtRule, /inset:calc\(var\(--cw\)\*\.5 - 1px\) -1px -1px/);
  assert.match(courtRule, /line-height:1;transform:none;opacity:1/);
  assert.match(html, /\.ix\.court i\{font-size:1em\}/);
  assert.doesNotMatch(html, /\.ix\.j i\{[^}]*transform/);
  assert.doesNotMatch(html, /ORIGINAL_MOTIF|♞|♛|♚/);
  assert.match(html, /const CLASSIC_COURT_ART = \{ j:"jack", q:"queen", k:"king" \}/);
  assert.match(html, /const CLASSIC_COURT_SUITS = \["clubs","diamonds","hearts","spades"\]/);
  assert.match(html, /assets\/cards\/classic\/courts\/\$\{CLASSIC_COURT_SUITS\[card\.suit\]\}-\$\{CLASSIC_COURT_ART\[court\]\}\.svg/);
  assert.match(html, /class="court-art"/);
  assert.match(html, /const court = card\.rank>=11 \? \["j","q","k"\]\[card\.rank-11\] : ""/);
  assert.match(html, /` court \$\{court\}`/);
});

test("classic portrait header and controls are enlarged with balanced icons", () => {
  const portraitHud = html.match(/body\[data-card-style="original"\] #hud\{([^}]*)\}/)?.[1];
  assert.ok(portraitHud, "classic portrait HUD rule exists");
  assert.match(portraitHud, /display:flex;flex-wrap:wrap/);
  assert.match(html, /body\[data-card-style="original"\]\{--type-display:clamp\(1\.68rem,6\.72vw,2\.28rem\)\}/);
  // The labelled club rail takes its own centered row on portrait phones. It is
  // a rule bar, not pills, so the container gap is 0 — the hairline between two
  // chips is what separates them.
  assert.match(html, /body\[data-card-style="original"\] \.chips\{\s*flex:0 0 100%;justify-content:center;gap:0;/);
  // Emoji control icons are retired; only the menu ellipsis glyph remains
  assert.match(html, /#btnDeal \.classic-icon,\s*[^{]*#btnHint \.classic-icon,\s*[^{]*#btnUndo \.classic-icon\{display:none\}/);
  assert.match(html, /body\[data-card-style="original"\]\{[^}]*--type-menu-glyph:1\.7rem/);
});
