"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {
  replay,
  seededShuffle,
} = require("../scripts/klondike-core.cjs");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "www", "index.html"), "utf8");
const corpus = JSON.parse(
  fs.readFileSync(path.join(root, "data", "winnable-deals.v1.json"), "utf8"),
);
const browserContext = {};
vm.createContext(browserContext);
vm.runInContext(
  fs.readFileSync(path.join(root, "www", "deal-engine.js"), "utf8"),
  browserContext,
);
vm.runInContext(
  fs.readFileSync(path.join(root, "www", "winnable-deals.js"), "utf8"),
  browserContext,
);

test("settings expose a stepped Random to Winnable deal mix", () => {
  assert.match(
    html,
    /<span>Random<\/span><span>Winnable<\/span>/,
  );
  assert.match(
    html,
    /id="dealMix" type="range" min="0" max="100" step="25" value="100"/,
  );
  assert.match(html, /\.deal-mix\{width:min\(220px,46vw\)\}/);
  assert.match(html, /summary:`\$\{percent\}% verified, \$\{100-percent\}% random`/);
  assert.match(
    html,
    /settings\.winnablePercent = settings\.dealMode === "random" \? 0 : 100/,
  );
  assert.match(html, /DealEngine\.shouldUseWinnableDeal\(settings\.winnablePercent,Math\.random\)/);
  assert.match(
    html,
    /#sheet\{\s*padding-left:calc\(env\(safe-area-inset-left,0px\) \+ 20px\);\s*padding-right:calc\(env\(safe-area-inset-right,0px\) \+ 20px\)/,
  );
  assert.doesNotMatch(html, /id="segDeal(?:Winnable|Random)"/);
});

test("table settings keep their labels and preferred order", () => {
  const cardStyle = html.indexOf("<div>Card style");
  const draw = html.indexOf("<div>Draw<span");
  const autoMove = html.indexOf("<div>Auto-move");
  const sound = html.indexOf("<div>Sound<span");
  const haptics = html.indexOf("<div>Haptics");
  const dealMix = html.indexOf("<div>Deal mix");
  const restart = html.indexOf("<div>Restart this deal");
  const record = html.indexOf("<div>Your record");

  assert.deepEqual(
    [cardStyle, draw, autoMove, sound, haptics, dealMix, restart, record],
    [cardStyle, draw, autoMove, sound, haptics, dealMix, restart, record]
      .toSorted((left, right) => left - right),
  );
  assert.match(
    html,
    /Card style<span class="sub2">Change the theme without restarting your deal<\/span>/,
  );
  assert.doesNotMatch(html, /Change the deck without restarting your deal/);
});

test("deal mix probability includes exact Random and Winnable endpoints", () => {
  const choose = browserContext.DealEngine.shouldUseWinnableDeal;
  assert.equal(choose(0, () => 0), false);
  assert.equal(choose(100, () => 0.999999), true);
  assert.equal(choose(50, () => 0.499999), true);
  assert.equal(choose(50, () => 0.5), false);
});

test("browser and offline generators reproduce the same seeded deals", () => {
  for (const deal of corpus.deals) {
    assert.deepEqual(
      Array.from(browserContext.DealEngine.seededShuffle(deal.seed)),
      seededShuffle(deal.seed),
      `seed ${deal.seed}`,
    );
  }
});

test("shipped seed index exactly matches the certificate corpus", () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.shuffleVersion, "xorshift32-fisher-yates-v1");
  assert.deepEqual(
    Array.from(browserContext.WINNABLE_DEAL_CORPUS.seeds),
    corpus.deals.map(({ seed }) => seed),
  );
  assert.equal(new Set(corpus.deals.map(({ seed }) => seed)).size, corpus.deals.length);
});

test("every shipped deal replays to a win under draw one and draw three", () => {
  for (const deal of corpus.deals) {
    const order = seededShuffle(deal.seed);
    for (const [label, drawCount] of [["draw1", 1], ["draw3", 3]]) {
      assert.ok(Array.isArray(deal.solutions[label]) && deal.solutions[label].length > 0);
      assert.equal(
        replay(order, drawCount, deal.solutions[label]).won,
        true,
        `seed ${deal.seed} ${label}`,
      );
      if (corpus.generator.externalRequired) {
        assert.equal(deal.external[label].solved, true, `external check: seed ${deal.seed} ${label}`);
      }
    }
  }
});

test("winnable selection avoids an immediate repeat when alternatives exist", () => {
  const sample = {
    schemaVersion: 1,
    shuffleVersion: "xorshift32-fisher-yates-v1",
    seeds: [11, 22],
  };
  const first = browserContext.DealEngine.selectWinnableDeal(sample, () => 0, null);
  const second = browserContext.DealEngine.selectWinnableDeal(sample, () => 0, first.seed);
  assert.equal(first.seed, 11);
  assert.equal(second.seed, 22);
});
