const assert = require("node:assert/strict");
const test = require("node:test");

const Rules = require("../www/game-rules.js");

test("foundation moves follow suit order from ace through king", () => {
  const foundations = [[], [], [], []];
  assert.equal(Rules.canFoundation(foundations, { suit: 0, rank: 1 }), true);
  assert.equal(Rules.canFoundation(foundations, { suit: 0, rank: 2 }), false);
  foundations[0].push({ suit: 0, rank: 1 });
  assert.equal(Rules.canFoundation(foundations, { suit: 0, rank: 2 }), true);
});

test("automatic foundation moves wait for both opposite-colour suits", () => {
  const foundations = [Array(4), Array(3), Array(2), Array(4)];
  const fiveOfSpades = { suit: 0, rank: 5 };

  assert.equal(Rules.canSafelyAutoFound(foundations, fiveOfSpades), false);
  foundations[1] = Array(4);
  foundations[2] = Array(4);
  assert.equal(Rules.canSafelyAutoFound(foundations, fiveOfSpades), true);
});

test("tableau moves alternate colours and descend by one", () => {
  const tableau = [[{ suit: 0, rank: 9, faceUp: true }], [], [{ suit: 1, rank: 9, faceUp: false }]];
  assert.equal(Rules.canTableau(tableau, { suit: 1, rank: 8 }, 0), true);
  assert.equal(Rules.canTableau(tableau, { suit: 3, rank: 8 }, 0), false);
  assert.equal(Rules.canTableau(tableau, { suit: 1, rank: 7 }, 0), false);
  assert.equal(Rules.canTableau(tableau, { suit: 0, rank: 13 }, 1), true);
  assert.equal(Rules.canTableau(tableau, { suit: 0, rank: 8 }, 2), false);
});
