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
  assert.equal(scheduled[0].delay, 300);
  assert.match(functionSource("autoMoveSafeCards"), /setTimeout\(step,reduced\?110:275\)/);
  assert.match(functionSource("autoFinish"), /setTimeout\(step,reduced\?70:140\)/);
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
    cancelAutoPlay() {},
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
