#!/usr/bin/env node
"use strict";

// Solver-backed audit of the Hint / out-of-moves logic.
//
// The hint code in www/index.html is loaded verbatim into a sandbox and driven
// against positions produced by real playouts of the headless Klondike core.
// Two properties are checked against the solver, which is the only oracle here
// that does not share the hint code's assumptions:
//
//   SOUNDNESS  when movesRemain() is false, the position must be unwinnable.
//              A solvable position declared "out of moves" is a false game
//              over — the worst failure this feature can have.
//   SAFETY     from a winnable position, taking the hinted move must leave a
//              winnable position. A hint that throws away the win is a bug
//              even though the game is still playable afterwards.
//
// Usage: node scripts/verify-hints.cjs [--deals 200] [--draw3] [--seed 1]

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  applyAction, createState, isWon, seededShuffle, solve,
} = require("./klondike-core.cjs");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "www", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function functionSource(name, optional = false) {
  const start = script.indexOf(`function ${name}(`);
  if (start === -1 && optional) return null;
  assert.notEqual(start, -1, `${name} should exist in www/index.html`);
  const open = script.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < script.length; i++) {
    if (script[i] === "{") depth++;
    if (script[i] === "}") depth--;
    if (depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`Could not find the end of ${name}`);
}

const HINT_FUNCTIONS = [
  "canFound", "canSafelyAutoFound", "canTab", "cardIsPlayable", "stockPlayable",
  "reachableDrawThreeCards", "hasKingForEmptyColumn", "findHint", "findAnyMove",
  "snapshotTableau", "simAccepts", "simKey", "simMoves", "simApply",
  "simProgress", "findProgressPath",
];
const HINT_CONSTS = ["PROGRESS_DEPTH", "PROGRESS_NODES"];

// One sandbox holding the shipped hint code, re-pointed at each position.
function hintSandbox(draw3) {
  const sandbox = {
    P: null,
    settings: { draw3 },
    isRed: (suit) => suit === 1 || suit === 2,
    topOf: (arr) => arr[arr.length - 1],
  };
  vm.createContext(sandbox);
  for (const name of HINT_CONSTS) {
    const source = script.match(new RegExp(`^const ${name} = .*$`, "m"));
    if (source) vm.runInContext(source[0], sandbox);
  }
  for (const name of HINT_FUNCTIONS) {
    // Optional so the same audit can be pointed at an older revision of the
    // hint code, for a before/after comparison on identical deals.
    const source = functionSource(name, true);
    if (source) vm.runInContext(source, sandbox);
  }
  // The app itself has no such predicate — hint() decides inline — so mirror
  // its decision order here. On a pre-search revision of the code this falls
  // through to findAnyMove, which is what that revision used.
  vm.runInContext(
    `function movesRemain(){
       const h = findHint();
       if(h && h.src.length) return true;
       if((P.stock.length || P.waste.length) && stockPlayable()) return true;
       return !!(typeof findProgressPath === "function" ? findProgressPath() : findAnyMove());
     }`, sandbox);
  return sandbox;
}

// Core state -> the app's pile model. Foundations only ever have their length
// read, so placeholder entries are enough to stand in for the played cards.
function toAppPiles(state) {
  const card = (id, faceUp) => ({ id, suit: Math.floor(id / 13), rank: (id % 13) + 1, faceUp });
  return {
    stock: state.stock.map((id) => card(id, false)),
    waste: state.waste.map((id) => card(id, true)),
    f: state.f.map((count) => Array.from({ length: count }, () => ({}))),
    t: state.t.map((pile, column) => pile.map((id, i) => card(id, i >= state.down[column]))),
  };
}

// The app hint expressed as a core action, so it can be applied and solved.
function hintAction(sandbox, state) {
  const h = sandbox.findHint();
  let source = "findHint";
  let move = h && h.src.length ? h : null;
  if (!move) {
    move = sandbox.findProgressPath ? sandbox.findProgressPath() : sandbox.findAnyMove();
    source = sandbox.findProgressPath ? "findProgressPath" : "findAnyMove";
  }
  if (!move) return null;
  const head = move.src[0];
  if (move.dst[0] === "f" && source === "findHint") source = "findHint:foundation";
  const fromWaste = state.waste.length && state.waste[state.waste.length - 1] === head.id;
  if (move.dst[0] === "f") {
    const at = fromWaste ? null : locate(state, head.id);
    return { source, action: fromWaste ? ["w", "f", head.suit]
      : ["t", at.column, at.index, "f", head.suit] };
  }
  const destination = Number(move.dst.slice(1));
  if (fromWaste) return { source, action: ["w", "t", destination] };
  const at = locate(state, head.id);
  return { source, action: ["t", at.column, at.index, "t", destination] };
}

function locate(state, id) {
  for (let column = 0; column < 7; column++) {
    const index = state.t[column].indexOf(id);
    if (index >= 0) return { column, index };
  }
  throw new Error(`card ${id} is not in the tableau`);
}

const winnable = (state, drawCount, budget) =>
  solve(null, drawCount, { state, nodeLimit: budget.nodes, timeLimitMs: budget.ms });

function parseArgs(argv) {
  const args = { deals: 200, drawCount: 1, seed: 1, nodes: 400_000, ms: 4000 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--deals") args.deals = Number(argv[++i]);
    else if (argv[i] === "--draw3") args.drawCount = 3;
    else if (argv[i] === "--seed") args.seed = Number(argv[++i]);
    else if (argv[i] === "--ms") args.ms = Number(argv[++i]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const budget = { nodes: args.nodes, ms: args.ms };
  const sandbox = hintSandbox(args.drawCount === 3);
  const report = {
    deals: 0, hintWins: 0, deadEnds: 0, falseGameOvers: 0,
    inconclusiveDead: 0, hintsChecked: 0, losingHints: 0, inconclusiveHints: 0,
    hintsBySource: {}, losingBySource: {},
  };
  const failures = [];

  for (let deal = 0; deal < args.deals; deal++) {
    const order = seededShuffle(args.seed + deal);
    let state = createState(order);
    report.deals++;
    const seen = new Set();

    for (let step = 0; step < 600; step++) {
      if (isWon(state)) { report.hintWins++; break; }
      sandbox.P = toAppPiles(state);

      if (!sandbox.movesRemain()) {
        report.deadEnds++;
        const verdict = winnable(state, args.drawCount, budget);
        if (verdict.solved) {
          report.falseGameOvers++;
          failures.push({ kind: "false-game-over", deal: args.seed + deal, step });
        } else if (verdict.cutoff) report.inconclusiveDead++;
        break;
      }

      const hint = hintAction(sandbox, state);
      if (!hint) {
        // movesRemain() said yes on the strength of the stock: draw.
        const next = applyAction(state, ["d"], args.drawCount, false);
        const key = JSON.stringify(next);
        if (seen.has(key)) break;      // cycling the stock forever
        seen.add(key);
        state = next;
        continue;
      }

      // SAFETY: only meaningful from a position the solver can still win.
      if (report.hintsChecked < 40 * args.deals) {
        const before = winnable(state, args.drawCount, budget);
        if (before.solved) {
          report.hintsChecked++;
          const after = winnable(
            applyAction(state, hint.action, args.drawCount, false), args.drawCount, budget,
          );
          if (!after.solved) {
            if (after.cutoff) report.inconclusiveHints++;
            else {
              report.losingHints++;
              report.losingBySource[hint.source] = (report.losingBySource[hint.source] || 0) + 1;
              failures.push({
                kind: "losing-hint", deal: args.seed + deal, step,
                source: hint.source, action: hint.action,
              });
            }
          }
        }
      }
      report.hintsBySource[hint.source] = (report.hintsBySource[hint.source] || 0) + 1;
      state = applyAction(state, hint.action, args.drawCount, false);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.log("\nfailures (first 10):");
    for (const failure of failures.slice(0, 10)) console.log(" ", JSON.stringify(failure));
  }
  process.exitCode = report.falseGameOvers || report.losingHints ? 1 : 0;
}

main();
