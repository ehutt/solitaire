"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Core = require("./klondike-core.cjs");

const outputDirectory = "/tmp/better-solitaire-store";
const seed = 3;

function savedGame(drawCount, actionCount, elapsed) {
  const order = Core.seededShuffle(seed);
  const result = Core.solve(order, drawCount, {
    nodeLimit: 2_000_000,
    timeLimitMs: 20_000,
  });
  if (!result.solved) throw new Error(`Could not solve seed ${seed} in draw ${drawCount}`);

  let state = Core.createState(order);
  for (const action of result.solution.slice(0, actionCount)) {
    state = Core.applyAction(state, action, drawCount, true);
  }

  const face = Array(52).fill(0);
  for (const id of state.waste) face[id] = 1;
  for (let suit = 0; suit < state.f.length; suit++) {
    for (let rank = 1; rank <= state.f[suit]; rank++) face[suit * 13 + rank - 1] = 1;
  }
  for (let column = 0; column < state.t.length; column++) {
    for (let index = state.down[column]; index < state.t[column].length; index++) {
      face[state.t[column][index]] = 1;
    }
  }

  return {
    s: {
      stock: state.stock,
      waste: state.waste,
      f: state.f.map((height, suit) =>
        Array.from({ length: height }, (_, index) => suit * 13 + index)
      ),
      t: state.t,
      face,
      moves: actionCount,
    },
    elapsed,
    started: true,
    undos: 0,
    hintUsed: false,
    gameVariant: drawCount === 3 ? "draw3" : "draw1",
    deal: order,
    schemaVersion: 1,
  };
}

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "draw1-midgame.json"),
  JSON.stringify(savedGame(1, 75, 147))
);
fs.writeFileSync(
  path.join(outputDirectory, "draw3-midgame.json"),
  JSON.stringify(savedGame(3, 70, 193))
);
