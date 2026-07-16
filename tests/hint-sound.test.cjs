const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "www", "index.html"), "utf8");
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

test("stock hints pulse the visible pile overlay", () => {
  const stockSlot = {};
  let pulsed;
  const pulseStock = loadFunction("pulseStock", {
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
  assert.match(html, /\.ph\.stock-hint\{[^}]*z-index:800;pointer-events:none/);
  assert.match(html, /\.ph\.stock-hint\{[^}]*animation:hintPulse \.85s ease 2/);
  assert.doesNotMatch(html, /@keyframes stockHintPulse/);
});

test("fresh games always play the shuffle sound, but restarts stay silent", () => {
  let sounds = 0;
  const fixedDeal = Array.from({ length: 52 }, (_, id) => id);
  const context = {
    makeShuffle: () => fixedDeal.slice(),
    playShuffleSound: () => sounds++,
    stopTimer() {},
    buildDOM() {},
    dealAnimation() {},
    updateHUD() {},
    updateButtons() {},
    saveGame() {},
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
