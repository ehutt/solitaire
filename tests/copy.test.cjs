const assert = require("node:assert/strict");
const test = require("node:test");

const Copy = require("../www/copy.js");

test("editable interface copy lives in one catalog", () => {
  assert.equal(Copy.text.brandTitle, "Better Solitaire");
  assert.equal(Copy.text.settingsTitle, "Game Settings");
  assert.match(Copy.text.settingsNote, /no ads, ever/);
});

test("dynamic deal, stuck, and win copy is generated from the catalog", () => {
  assert.deepEqual(Copy.dealMixText(0), {
    label: "Random",
    summary: "Every deal is shuffled randomly",
  });
  assert.equal(Copy.stuckTitle(true), "No useful moves left");
  assert.equal(Copy.winTitle({ dailyMilestone: 10, firstWinToday: false }), "10th win of the day!");
});

test("copy hydration supports text, prefix, and trusted line-break content", () => {
  const writes = [];
  const element = (key, mode) => ({
    dataset: { [mode]: key },
    firstChild: { id: "child" },
    prepend(value) {
      writes.push([mode, value]);
    },
    set textContent(value) {
      writes.push([mode, value]);
    },
    set innerHTML(value) {
      writes.push([mode, value]);
    },
  });
  const textElement = element("brandTitle", "copy");
  const prefixElement = element("cardStyle", "copyPrefix");
  const htmlElement = element("settingsNote", "copyHtml");
  const document = {
    querySelectorAll(selector) {
      return {
        "[data-copy]": [textElement],
        "[data-copy-prefix]": [prefixElement],
        "[data-copy-html]": [htmlElement],
      }[selector];
    },
  };

  Copy.apply(document);
  assert.deepEqual(writes, [
    ["copy", "Better Solitaire"],
    ["copyPrefix", "Card style"],
    ["copyHtml", Copy.text.settingsNote],
  ]);
});
