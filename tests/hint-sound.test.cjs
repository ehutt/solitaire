const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
const deckBuilder = fs.readFileSync(path.join(__dirname, "..", "assets", "build-crehore-deck.py"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function functionSource(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const open = script.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < script.length; i++) {
    if (script[i] === "{") depth++;
    if (script[i] === "}") depth--;
    if (depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`Could not find the end of ${name}`);
}

function loadFunction(name, context) {
  return vm.runInNewContext(`(${functionSource(name)})`, context);
}

function listenerSource(target, eventName) {
  const marker = `${target}.addEventListener("${eventName}", e=>`;
  const start = script.indexOf(marker);
  assert.notEqual(start, -1, `${target} ${eventName} listener should exist`);
  const open = script.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < script.length; i++) {
    if (script[i] === "{") depth++;
    if (script[i] === "}") depth--;
    if (depth === 0) return `function listener(e)${script.slice(open, i + 1)}`;
  }
  throw new Error(`Could not find the end of ${target} ${eventName} listener`);
}

function loadListener(target, eventName, context) {
  return vm.runInNewContext(`(${listenerSource(target, eventName)})`, context);
}

test("stock hints pulse the actual top card with the default hint treatment", () => {
  const topCard = { id: 17 };
  const cardElement = {};
  let pulsed;
  const pulseStock = loadFunction("pulseStock", {
    P: { stock: [topCard] },
    topOf: (pile) => pile[pile.length-1],
    els: { get: (id) => { assert.equal(id,17); return cardElement; } },
    pulseEl(element, className) { pulsed = { element, className }; },
  });

  pulseStock();

  assert.deepEqual(pulsed,{element:cardElement,className:"stock-hint"});
  assert.match(html,/\.card\.hint\{animation:hintPulse \.85s ease 2\}/);
  assert.match(html,/\.card\.stock-hint\{animation:hintPulse \.85s ease 2\}/);
  assert.match(html,/\.card\.stock-hint::after\{[^}]*border:2px solid rgba\(226,177,68,\.9\)/);
  assert.match(html,/\.card\.stock-hint::after\{[^}]*animation:stockRingPulse \.85s ease 2/);
  assert.match(html,/@keyframes hintPulse\{/);
  assert.match(html,/@keyframes stockRingPulse\{/);
  assert.doesNotMatch(html,/hintBorderPulse/);
});

test("empty-stock hints use a solid glowing recycle-slot fallback", () => {
  const stockSlot = {};
  let pulsed;
  const pulseStock = loadFunction("pulseStock", {
    P: { stock: [] },
    topOf: (pile) => pile[pile.length-1],
    els: { get: () => null },
    board: {
      querySelector(selector) {
        assert.equal(selector, '.ph[data-slot="stock"]');
        return stockSlot;
      },
    },
    pulseEl(element, className) {
      pulsed = { element, className };
    },
  });

  pulseStock();

  assert.deepEqual(pulsed, { element: stockSlot, className: "stock-hint" });
  assert.match(html, /body\[data-card-style\] \.ph\.stock-hint\{[^}]*z-index:800;pointer-events:none/);
  assert.match(html, /body\[data-card-style\] \.ph\.stock-hint\{[^}]*border:2px solid rgba\(226,177,68,\.9\)/);
  assert.match(html, /body\[data-card-style\] \.ph\.stock-hint\{[^}]*animation:stockSlotPulse \.85s ease 2/);
  assert.match(html, /@keyframes stockSlotPulse\{/);
});

test("landscape geometry reserves side lanes and fits a full face-up run", () => {
  const properties = {};
  const context = {
    board: {
      clientWidth: 980,
      clientHeight: 360,
      style: { setProperty: (name, value) => { properties[name] = value; } },
    },
    settings: { cardStyle: "crehore" },
    G: null,
  };
  const computeGeometry = loadFunction("computeGeometry", context);

  computeGeometry();

  assert.equal(context.G.landscape, true);
  assert.ok(
    context.G.slotPos.t0[0]-(context.G.slotPos.f0[0]+context.G.cw) > context.G.gap+context.G.cw*.1,
    "foundations keep extra separation left of tableau",
  );
  assert.ok(
    context.G.slotPos.stock[0]-(context.G.slotPos.t6[0]+context.G.cw) > context.G.gap+context.G.cw*.1,
    "stock keeps extra separation right of tableau",
  );
  assert.equal(context.G.slotPos.waste[0], context.G.slotPos.stock[0], "waste opens in the right stock rail");
  assert.ok(context.G.slotPos.waste[1]+context.G.ch*1.24 <= context.G.slotPos.stock[1], "draw-three waste fan stays above stock");
  assert.ok(Math.abs(context.G.slotPos.stock[1] - (360-context.G.ch)/2) < 1);
  assert.ok(context.G.slotPos.f1[1] >= context.G.slotPos.f0[1]+context.G.ch+3, "foundation cards have a visible gap");
  assert.ok(context.G.slotPos.f3[1]+context.G.ch <= 360-context.G.topY+.01, "foundation rail fits vertically");
  assert.ok(context.G.minFaceUpReveal >= (14+108)/522, "face-up reveal clears the vintage index band");
  assert.ok(Math.abs(context.G.preferredFaceUpReveal-142/522) < .0001, "normal reveal ends at the court-art boundary");
  assert.ok(context.G.ch*(1+11*context.G.minFaceUpReveal) <= 360-context.G.topY-18+.01, "K-through-2 indices fit vertically");

  context.settings.cardStyle = "original";
  computeGeometry();
  assert.equal(context.G.minFaceUpReveal, .30, "compressed Classic fans still reveal the entire index");
  assert.equal(context.G.preferredFaceUpReveal, .32, "normal Classic fans leave extra room around court ranks");
  assert.ok(context.G.ch*(1+11*context.G.minFaceUpReveal) <= 360-context.G.topY-18+.01, "Classic K-through-2 indices fit vertically");
  assert.match(functionSource("layout"), /offUp = ch\*preferredFaceUpReveal/);
  assert.match(properties["--cw"], /px$/);
  assert.match(html, /#controls button\{width:100%;min-height:48px/);
  assert.match(html, /new ResizeObserver\(relayoutBoard\)\.observe\(board\)/);
});

test("ghost hints keep a subtle static border on the source card", () => {
  const rule = html.match(/\.card\.move-source-hint::after\{([^}]*)\}/)?.[1];
  assert.ok(rule, "source-card hint border exists");
  assert.match(rule, /border:2px solid rgba\(217,166,72,\.78\)/);
  assert.match(rule, /box-shadow:0 0 7px 2px rgba\(217,166,72,\.36\)/);
  assert.doesNotMatch(rule, /animation/);
  assert.match(functionSource("ghostMove"), /els\.get\(h\.src\[0\]\.id\)/);
  assert.doesNotMatch(functionSource("ghostMove"), /pulseEl/);
});

test("auto-move waits for the first player move and uses a brisk endgame pace", () => {
  const scheduled = [];
  const context = {
    reduced: false,
    settings: { autoComplete: true },
    autoRunning: false,
    won: false,
    started: false,
    moves: 0,
    autoPlayTimer: null,
    cancelAutoPlay() { context.autoPlayTimer = null; },
    safeAutoMoveCandidate: () => ({ card: {} }),
    finishable: () => false,
    autoFinish() {},
    autoMoveSafeCards() {},
    setTimeout(callback, delay) { scheduled.push({ callback, delay }); return 1; },
  };
  const maybeAutoFinish = loadFunction("maybeAutoFinish", context);

  maybeAutoFinish();
  assert.equal(scheduled.length, 0, "opening deal never triggers auto-move");

  context.started = true;
  context.moves = 1;
  maybeAutoFinish();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 345);
  // Safe auto-moves run 15% slower than the card's own glide so each lift
  // reads as a separate move; the endgame cascade keeps its brisker pace.
  assert.match(functionSource("autoMoveSafeCards"), /setTimeout\(step,reduced\?127:316\)/);
  assert.match(functionSource("autoFinish"), /setTimeout\(step,reduced\?70:140\)/);
});

test("auto-complete sends a dragged ace to its foundation instead of a tableau two", () => {
  const ace = { id: 0, suit: 0, rank: 1, faceUp: true };
  const two = { id: 14, suit: 1, rank: 2, faceUp: true };
  const moves = [];
  const context = {
    drag: {
      card: ace,
      stack: [ace],
      loc: { k: "t", t: 0 },
      sx: 0,
      sy: 0,
      moved: true,
      orig: [{ x: 110, y: 200 }],
    },
    settings: { autoComplete: true },
    P: { t: [[ace], [two], [], [], [], [], []] },
    G: {
      cw: 100,
      ch: 145,
      gap: 10,
      tabY: 200,
      landscape: true,
      xs: (column) => column * 110,
      slotPos: { f0: [0, 0] },
    },
    els: {
      get: () => ({ classList: { remove() {} } }),
    },
    canFound: (card) => card === ace,
    canSafelyAutoFound: (card) => card === ace,
    canTab: (card, column) => card === ace && column === 1,
    moveStack: (stack, kind, index) => moves.push({ stack, kind, index }),
    layout() {},
  };
  const pointerUp = loadListener("window", "pointerup", context);

  pointerUp({ clientX: 0, clientY: 0 });

  assert.deepEqual(moves.map(({ kind, index }) => [kind, index]), [["f", 0]]);
});

test("repeated auto-complete scheduling cannot orphan an active run", () => {
  let cancelled = false;
  const context = {
    reduced: false,
    settings: { autoComplete: true },
    autoRunning: true,
    won: false,
    started: true,
    moves: 3,
    autoPlayTimer: 42,
    cancelAutoPlay() {
      cancelled = true;
      context.autoPlayTimer = null;
    },
    safeAutoMoveCandidate: () => ({ card: {} }),
    finishable: () => false,
    setTimeout: () => 99,
  };
  const maybeAutoFinish = loadFunction("maybeAutoFinish", context);

  maybeAutoFinish();

  assert.equal(cancelled, false, "the active run keeps ownership of its timer");
  assert.equal(context.autoPlayTimer, 42);
  assert.equal(context.autoRunning, true);
});

test("a delayed win dialog cannot reopen over a new game", () => {
  let scheduled;
  let dialogs = 0;
  const context = {
    won: false,
    P: { f: Array.from({ length: 4 }, () => Array(13)) },
    stopTimer() {},
    hapticWin() {},
    localStorage: { removeItem() {} },
    KEY_GAME: "game",
    recordWin: () => ({ milestone: 0 }),
    lastWinMilestone: 0,
    updateHUD() {},
    updateButtons() {},
    reduced: false,
    cascade() {},
    winDialogTimer: null,
    cancelWinDialog() {},
    setTimeout(callback, delay) {
      assert.equal(delay, 3000);
      scheduled = callback;
      return 73;
    },
    showWin() { dialogs++; },
  };
  const checkWin = loadFunction("checkWin", context);

  checkWin();
  context.won = false; // newGame has replaced the completed deal
  scheduled();

  assert.equal(dialogs, 0);
  assert.match(functionSource("newGame"), /cancelWinDialog\(\)/);
});

test("vintage ranks use the bold font face below the rounded top edge", () => {
  assert.match(deckBuilder, /RANK_FONT_INDEX = 1\s+# Baskerville Bold/);
  assert.match(deckBuilder, /index_y = 14/);
  assert.match(deckBuilder, /art_top = 142/);
});

test("fresh games always play the shuffle sound, but restarts stay silent", () => {
  let sounds = 0;
  const events = [];
  const fixedDeal = Array.from({ length: 52 }, (_, id) => id);
  const context = {
    makeShuffle: () => { events.push("shuffle"); return fixedDeal.slice(); },
    playShuffleSound: () => { sounds++; events.push("sound"); },
    recordLoss() {},
    cancelAutoPlay() {},
    cancelWinDialog() {},
    stopTimer() {},
    buildDOM() {},
    dealAnimation() {},
    updateHUD() {},
    updateButtons() {},
    saveGame() {},
    maybeAutoFinish() {},
    reduced: false,
    initialDeal: null,
    cards: [],
    P: null,
    moves: 0,
    elapsed: 0,
    started: false,
    won: false,
    autoRunning: false,
    undos: 0,
    undoStack: [],
  };
  const newGame = loadFunction("newGame", context);

  newGame();
  context.started = true;
  context.moves = 12;
  newGame();
  context.won = true;
  newGame();
  newGame(fixedDeal);

  assert.equal(sounds, 3);
  assert.deepEqual(events.slice(0, 2), ["sound", "shuffle"], "sound starts on the tap before deal setup");
});

test("recorded shuffle restarts when enabled and stays silent when muted", () => {
  let pauses = 0;
  let plays = 0;
  const context = {
    settings: { sound: true },
    shuffleAudio: {
      currentTime: 9,
      pause: () => pauses++,
      play: () => {
        plays++;
        return { catch() {} };
      },
    },
  };
  const playShuffleSound = loadFunction("playShuffleSound", context);

  playShuffleSound();
  context.settings.sound = false;
  playShuffleSound();

  assert.equal(pauses, 1);
  assert.equal(plays, 1);
  assert.equal(context.shuffleAudio.currentTime, 0);
});

test("sound setting persists and mute stops the active recording", () => {
  const saved = [];
  let pauses = 0;
  let refreshed = 0;
  const context = {
    settings: { sound: true },
    KEY_SET: "settings",
    saveJSON: (key, value) => saved.push([key, { ...value }]),
    shuffleAudio: { currentTime: 8, pause: () => pauses++ },
    refreshSheet: () => refreshed++,
  };
  const setSound = loadFunction("setSound", context);

  setSound(false);
  setSound(true);

  assert.deepEqual(saved, [
    ["settings", { sound: false }],
    ["settings", { sound: true }],
  ]);
  assert.equal(pauses, 1);
  assert.equal(context.shuffleAudio.currentTime, 0);
  assert.equal(refreshed, 2);
  assert.match(html, /id="segSoundOn"/);
  assert.match(html, /id="segSoundOff"/);
  assert.match(html, /new Audio\("assets\/audio\/card-shuffle\.mp3"\)/);
});

// A table whose only legal play is a partial face-up run sliding sideways:
// nothing to reveal, nothing to score, no empty column worth taking.
function shuffleOnlyTable() {
  const card = (id, suit, rank) => ({ id, suit, rank, faceUp: true });
  const nine = card(8, 0, 9), eightH = card(20, 1, 8), sevenS = card(6, 0, 7);
  const nineC = card(47, 3, 9);
  return {
    P: {
      stock: [], waste: [], f: [[], [], [], []],
      t: [[nine, eightH, sevenS], [nineC], [], [], [], [], []],
    },
    run: [eightH, sevenS],
  };
}

function ruleContext(P) {
  const context = {
    P,
    settings: { draw3: false },
    isRed: (s) => s === 1 || s === 2,
    topOf: (arr) => arr[arr.length - 1],
  };
  vm.createContext(context);
  for (const line of ["PROGRESS_DEPTH", "PROGRESS_NODES"]) {
    const source = script.match(new RegExp(`^const ${line} = .*$`, "m"));
    assert.ok(source, `${line} should exist`);
    vm.runInContext(source[0], context);
  }
  for (const name of [
    "canFound", "canSafelyAutoFound", "canTab", "findAnyMove", "findHint",
    "hasKingForEmptyColumn",
    "snapshotTableau", "simAccepts", "simKey", "simMoves", "simApply",
    "simProgress", "findProgressPath",
  ]) {
    vm.runInContext(functionSource(name), context);
  }
  return context;
}

test("findAnyMove sees partial-run shuffles that findHint deliberately skips", () => {
  const { P, run } = shuffleOnlyTable();
  const context = ruleContext(P);

  assert.equal(context.findHint(), null, "no progress-making move exists");
  const fallback = context.findAnyMove();
  assert.ok(fallback, "a legal move still exists");
  assert.deepEqual(fallback.src, run);
  assert.equal(fallback.dst, "t1");
});

test("findAnyMove reports a genuinely dead table as having no moves", () => {
  const card = (id, suit, rank) => ({ id, suit, rank, faceUp: true });
  const P = {
    stock: [], waste: [], f: [[], [], [], []],
    // Two same-colour piles headed by cards nothing can stack onto or under.
    t: [[card(4, 0, 5)], [card(9, 0, 10)], [], [], [], [], []],
  };
  const context = ruleContext(P);
  // Only relocations into the empty columns remain, which are not moves.
  assert.equal(context.findAnyMove(), null);
});

test("a shuffle-only table has no progress path, so hint reports it stuck", () => {
  const { P } = shuffleOnlyTable();
  const context = ruleContext(P);

  assert.equal(context.findHint(), null, "no single move makes progress");
  assert.ok(context.findAnyMove(), "shuffles are still legal");
  assert.equal(context.findProgressPath(), null, "but none of them lead anywhere");
});

test("hint searches several plies for a line that reaches real progress", () => {
  const card = (id, suit, rank) => ({ id, suit, rank, faceUp: true });
  const down = (id, suit, rank) => ({ id, suit, rank, faceUp: false });
  const sevenS = card(6, 0, 7), eightH = card(20, 1, 8);
  const sevenD = card(32, 2, 7), eightS = card(7, 0, 8);
  const P = {
    stock: [], waste: [], f: [[], [], [], []],
    // 7♠ can only come off onto 8♥, which is buried under 7♦. Parking 7♦ on
    // 8♠ makes no progress by itself but opens the reveal one move later.
    t: [[down(51, 3, 13), sevenS], [eightH, sevenD], [eightS], [], [], [], []],
  };
  const context = ruleContext(P);

  assert.equal(context.findHint(), null, "no single move makes progress");
  const path = context.findProgressPath();
  assert.ok(path, "a two-move line reaches a face-down card");
  assert.deepEqual(path.src, [sevenD]);
  assert.equal(path.dst, "t2");
  assert.equal(path.depth, 2);
});

test("hint never offers a shuffle for its own sake", () => {
  const hintSource = functionSource("hint");
  const searchAt = hintSource.indexOf("findProgressPath()");
  const stuckAt = hintSource.indexOf("showStuck()");
  assert.notEqual(searchAt, -1, "hint searches for a productive line");
  assert.ok(searchAt < stuckAt, "the search runs before showStuck");
  assert.doesNotMatch(hintSource, /findAnyMove/, "no blind shuffle fallback");
});

test("hint prefers a reveal over a foundation play that could strand a card", () => {
  const card = (id, suit, rank) => ({ id, suit, rank, faceUp: true });
  const down = (id, suit, rank) => ({ id, suit, rank, faceUp: false });
  const fiveS = card(4, 0, 5), sevenH = card(19, 1, 7), eightS = card(7, 0, 8);
  // ♠5 fits the spade foundation, but ♦ is only up to 3 — sending it up now
  // can strand a red four. Uncovering a face-down card costs nothing.
  const P = {
    stock: [], waste: [], f: [Array(4), Array(4), Array(3), []],
    t: [[fiveS], [down(51, 3, 13), sevenH], [eightS], [], [], [], []],
  };
  const context = ruleContext(P);

  const reveal = context.findHint();
  assert.deepEqual([...reveal.src].map((c) => c.id), [sevenH.id]);
  assert.equal(reveal.dst, "t2");

  // With no reveal available the risky foundation play is still offered, so
  // the deal never looks stuck when a legal advancing move exists.
  P.t[1] = [sevenH];
  const risky = context.findHint();
  assert.deepEqual([...risky.src].map((c) => c.id), [fiveS.id]);
  assert.equal(risky.dst, "f0");
});

test("the end-game overlay can restart the same deal", () => {
  assert.match(html, /id="btnReplayDeal"/);
  assert.match(script, /\$\("btnReplayDeal"\)\.onclick[\s\S]{0,200}newGame\(initialDeal\)/);
});

test("a new cascade cancels the previous run instead of racing it", () => {
  const cascadeSource = functionSource("cascade");
  assert.match(cascadeSource, /^function cascade\(special=false\)\{\s*stopCascadeLoop\(\);/);
  assert.match(cascadeSource, /const run = fxRun;/);
  assert.match(cascadeSource, /if\(run !== fxRun\) return;/);
  assert.match(functionSource("stopCascadeLoop"), /cancelAnimationFrame\(fxTimer\)/);
  assert.match(functionSource("stopCascadeLoop"), /clearTimeout\(fxClearTimer\)/);
  assert.match(functionSource("stopCascadeLoop"), /fxRun\+\+/);
  // endCascade's deferred clear must be cancellable, or it wipes the canvas
  // partway through the cascade that replaced it.
  assert.match(functionSource("endCascade"), /fxClearTimer = setTimeout/);
});

test("the win cascade reuses the rendered card faces", () => {
  const cascadeSource = functionSource("cascade");
  assert.match(cascadeSource, /els\.get\(q\.card\.id\)\.cloneNode\(true\)/);
  assert.doesNotMatch(cascadeSource, /Iowan Old Style|fillText\(/);
});

test("the settings sheet has its own close control", () => {
  assert.match(html, /<button id="btnSheetClose" class="icon-button" aria-label="Close settings">/);
  assert.match(html, /\$\("btnSheetClose"\)\.onclick = closeSheet;/);
  assert.match(html, /sheetBack\.onclick = closeSheet;/);
  // The sheet uses the three primitives rather than one-off selectors; that the
  // header actually stays pinned and the glyph actually lands on the title's cap
  // band is measured by the layout suite, not spelled out here.
  assert.match(html, /class="pinned-header"/);
  assert.match(html, /<div class="title-row">/);
  assert.doesNotMatch(html, /(original|crehore)"\] \.icon-button\{/);
  assert.doesNotMatch(html, /(original|crehore)"\] \.stats-header button\{/);
  // Both closes are the same primitive; only their placement differs.
  assert.match(html, /<button id="btnStatsClose" class="icon-button" aria-label="Close player stats">\s*<svg class="close-glyph"/);
  // Drawn rather than typed, so the mark's ink centres with its box.
  assert.match(html, /\.close-glyph\{[^}]*stroke:currentColor/);
  assert.doesNotMatch(html, /aria-label="Close (settings|player stats)">✕/);
});

test("header figures reserve a fixed width so the pills never jitter", () => {
  assert.match(html, /#vTime\{min-width:5ch\}/);
  assert.match(html, /#vMoves\{min-width:4ch\}/);
  assert.match(html, /#vStreak\{min-width:4ch\}/);
  assert.match(html, /\.chip b\{[^}]*font-variant-numeric:tabular-nums/);
});
