#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} = require("node:worker_threads");
const {
  replay,
  seededShuffle,
  solve,
} = require("./klondike-core.cjs");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "winnable-deals.v1.json");
const WEB_PATH = path.join(ROOT, "www", "winnable-deals.js");
const VENDORED_SOLVER_PATH = path.join(
  ROOT,
  ".build",
  "solvitaire",
  "bin",
  process.platform === "win32" ? "solvitaire.exe" : "solvitaire",
);
const SCHEMA_VERSION = 1;
const SHUFFLE_VERSION = "xorshift32-fisher-yates-v1";
const RULES_VERSION = "better-solitaire-klondike-v1";
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const count = Number(argument("--count", "100"));
const firstSeed = Number(argument("--first-seed", "1"));
const nodeLimit = Number(argument("--node-limit", "1000000"));
const timeLimitMs = Number(argument("--time-limit-ms", "8000"));
const externalTimeoutMs = Number(argument("--external-timeout-ms", "15000"));
const workers = Number(argument("--workers", String(Math.min(8, os.availableParallelism()))));
const solverBinary = argument(
  "--solvitaire",
  process.env.SOLVITAIRE_BIN ||
    (fs.existsSync(VENDORED_SOLVER_PATH) ? VENDORED_SOLVER_PATH : ""),
);
const requireExternal = process.argv.includes("--require-external");
const append = process.argv.includes("--append");
const recertify = process.argv.includes("--recertify");

if (!Number.isInteger(count) || count < 1) throw new Error("--count must be a positive integer");
if (!Number.isInteger(firstSeed) || firstSeed < 1) throw new Error("--first-seed must be a positive integer");
if (!Number.isInteger(workers) || workers < 1) throw new Error("--workers must be a positive integer");
if (requireExternal && !solverBinary) {
  throw new Error("--require-external needs --solvitaire or SOLVITAIRE_BIN");
}
if (recertify && !append) {
  throw new Error("--recertify must be used with --append");
}

function idToCard(id) {
  return `${RANKS[id % 13]}${SUITS[Math.floor(id / 13)]}`;
}

function dealForSolvitaire(order) {
  const tableau = [];
  let index = 0;
  for (let column = 0; column < 7; column++) {
    tableau.push(order.slice(index, index + column + 1).map(idToCard));
    index += column + 1;
  }
  return {
    "tableau piles": tableau,
    stock: order.slice(index).map(idToCard),
  };
}

function externallySolve(order, drawCount, temporaryDirectory) {
  if (!solverBinary) return null;
  const dealPath = path.join(temporaryDirectory, `deal-${drawCount}.json`);
  fs.writeFileSync(dealPath, `${JSON.stringify(dealForSolvitaire(order), null, 2)}\n`);
  const gameType = drawCount === 1 ? "klondike-deal-1" : "klondike";
  const output = childProcess.execFileSync(
    solverBinary,
    [
      "--type", gameType,
      "--classify",
      "--streamliners", "smart-solvability",
      "--timeout", String(externalTimeoutMs),
      dealPath,
    ],
    {
      encoding: "utf8",
      timeout: externalTimeoutMs * 3,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const classification = output.trim().split(/,\s*/).at(-1);
  return {
    solved: classification === "solved",
    classification,
  };
}

function solveMode(order, drawCount) {
  const result = solve(order, drawCount, { nodeLimit, timeLimitMs });
  if (!result.solved) return result;
  const verification = replay(order, drawCount, result.solution);
  if (!verification.won) throw new Error(`Internal replay failed for draw ${drawCount}`);
  return result;
}

function evaluateCandidate(candidateSeed, temporaryDirectory) {
  const order = seededShuffle(candidateSeed);
  const draw1 = solveMode(order, 1);
  if (!draw1.solved) return null;
  const draw3 = solveMode(order, 3);
  if (!draw3.solved) return null;

  const external = {
    draw1: externallySolve(order, 1, temporaryDirectory),
    draw3: externallySolve(order, 3, temporaryDirectory),
  };
  if (
    requireExternal &&
    (!external.draw1?.solved || !external.draw3?.solved)
  ) {
    return null;
  }

  return {
    seed: candidateSeed,
    solutions: {
      draw1: draw1.solution,
      draw3: draw3.solution,
    },
    metrics: {
      draw1: {
        moves: draw1.solution.length,
        nodes: draw1.nodes,
        elapsedMs: draw1.elapsedMs,
      },
      draw3: {
        moves: draw3.solution.length,
        nodes: draw3.nodes,
        elapsedMs: draw3.elapsedMs,
      },
    },
    external,
  };
}

function evaluateExternal(candidateSeed, temporaryDirectory) {
  const order = seededShuffle(candidateSeed);
  return {
    draw1: externallySolve(order, 1, temporaryDirectory),
    draw3: externallySolve(order, 3, temporaryDirectory),
  };
}

function evaluateInWorker(candidateSeed, externalOnly = false) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      argv: process.argv.slice(2),
      workerData: { candidateSeed, externalOnly },
    });
    let settled = false;
    worker.once("message", (result) => {
      settled = true;
      resolve(result);
    });
    worker.once("error", (error) => {
      settled = true;
      reject(error);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Worker for seed ${candidateSeed} exited with code ${code}`));
      }
    });
  });
}

function loadExistingCorpus() {
  if (!append) return null;
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Cannot append: ${path.relative(ROOT, DATA_PATH)} does not exist`);
  }
  const corpus = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  if (
    corpus.schemaVersion !== SCHEMA_VERSION ||
    corpus.shuffleVersion !== SHUFFLE_VERSION ||
    corpus.rulesVersion !== RULES_VERSION ||
    !Array.isArray(corpus.deals)
  ) {
    throw new Error("Cannot append to an incompatible corpus");
  }
  if (corpus.generator?.externalRequired && !requireExternal) {
    throw new Error("Existing corpus requires external certification; pass --require-external");
  }
  const seeds = corpus.deals.map(({ seed: dealSeed }) => dealSeed);
  if (seeds.some((dealSeed) => !Number.isInteger(dealSeed) || dealSeed < 1)) {
    throw new Error("Existing corpus contains an invalid seed");
  }
  if (new Set(seeds).size !== seeds.length) {
    throw new Error("Existing corpus contains duplicate seeds");
  }
  if (count < corpus.deals.length) {
    throw new Error(
      `--count is the desired total and cannot be less than the existing ${corpus.deals.length} deals`,
    );
  }
  return corpus;
}

async function generateCorpus() {
  const existingCorpus = loadExistingCorpus();
  let deals = existingCorpus ? existingCorpus.deals.slice() : [];
  const originalDealCount = deals.length;
  const originalAttempted = existingCorpus?.generator?.attempted || 0;
  const corpusFirstSeed = existingCorpus?.generator?.firstSeed || firstSeed;
  let attemptedThisRun = 0;
  let seed = existingCorpus
    ? Math.max(...deals.map(({ seed: dealSeed }) => dealSeed)) + 1
    : firstSeed;

  if (recertify) {
    const pending = deals.filter(
      ({ external }) => !external?.draw1?.solved || !external?.draw3?.solved,
    );
    const failedSeeds = new Set();
    for (let offset = 0; offset < pending.length; offset += workers) {
      const batch = pending.slice(offset, offset + workers);
      const results = await Promise.all(
        batch.map(({ seed: dealSeed }) => evaluateInWorker(dealSeed, true)),
      );
      for (let index = 0; index < batch.length; index++) {
        const external = results[index];
        if (
          requireExternal &&
          (!external.draw1?.solved || !external.draw3?.solved)
        ) {
          failedSeeds.add(batch[index].seed);
          continue;
        }
        batch[index].external = external;
      }
      process.stdout.write(
        `externally certified ${Math.min(offset + batch.length, pending.length)}` +
        `/${pending.length} pending deals\n`,
      );
    }
    if (failedSeeds.size > 0) {
      deals = deals.filter(({ seed: dealSeed }) => !failedSeeds.has(dealSeed));
      process.stdout.write(
        `quarantined ${failedSeeds.size} externally rejected deals; generating replacements\n`,
      );
    }
  }

  while (deals.length < count) {
    const batchSeeds = Array.from({ length: workers }, () => seed++);
    const results = await Promise.all(
      batchSeeds.map((candidateSeed) => evaluateInWorker(candidateSeed)),
    );
    for (let index = 0; index < results.length && deals.length < count; index++) {
      attemptedThisRun++;
      const deal = results[index];
      if (!deal) continue;
      deals.push(deal);
      process.stdout.write(
        `accepted ${deals.length}/${count}: seed ${deal.seed} ` +
        `(draw 1: ${deal.solutions.draw1.length} moves; ` +
        `draw 3: ${deal.solutions.draw3.length} moves)\n`,
      );
    }
  }

  const corpus = {
    schemaVersion: SCHEMA_VERSION,
    shuffleVersion: SHUFFLE_VERSION,
    rulesVersion: RULES_VERSION,
    generatedAt: new Date().toISOString(),
    generator: {
      firstSeed: corpusFirstSeed,
      attempted: originalAttempted + attemptedThisRun,
      accepted: deals.length,
      nodeLimit,
      timeLimitMs,
      workers,
      externalSolver: solverBinary ? path.basename(solverBinary) : null,
      externalRequired: requireExternal,
    },
    deals,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(corpus)}\n`);
  const shipped = {
    schemaVersion: corpus.schemaVersion,
    shuffleVersion: corpus.shuffleVersion,
    rulesVersion: corpus.rulesVersion,
    seeds: corpus.deals.map(({ seed: dealSeed }) => dealSeed),
  };
  fs.writeFileSync(
    WEB_PATH,
    `"use strict";\n` +
    `globalThis.WINNABLE_DEAL_CORPUS = Object.freeze(${JSON.stringify(shipped)});\n`,
  );

  process.stdout.write(
    `${append ? "Expanded" : "Generated"} corpus from ${originalDealCount} to ${deals.length} ` +
    `cross-certified deals (${attemptedThisRun} new candidates; ` +
    `${corpus.generator.attempted} total).\n` +
    `Full certificates: ${path.relative(ROOT, DATA_PATH)}\n` +
    `Shipped seed index: ${path.relative(ROOT, WEB_PATH)}\n`,
  );
}

if (isMainThread) {
  generateCorpus().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
} else {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "better-solitaire-corpus-"));
  try {
    parentPort.postMessage(
      workerData.externalOnly
        ? evaluateExternal(workerData.candidateSeed, temporaryDirectory)
        : evaluateCandidate(workerData.candidateSeed, temporaryDirectory),
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
