#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "vendor", "solvitaire");
const BUILD = path.join(ROOT, ".build", "solvitaire");
const BINARY = path.join(
  BUILD,
  "bin",
  process.platform === "win32" ? "solvitaire.exe" : "solvitaire",
);

function run(args) {
  const result = childProcess.spawnSync("cmake", args, {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("CMake is required to build Solvitaire");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`cmake ${args.join(" ")} exited with status ${result.status}`);
  }
}

run([
  "-S",
  SOURCE,
  "-B",
  BUILD,
  "-DCMAKE_BUILD_TYPE=Release",
  "-DSOLVITAIRE_BUILD_TESTS=OFF",
]);
run([
  "--build",
  BUILD,
  "--target",
  "solvitaire",
  "--parallel",
  String(Math.min(8, os.availableParallelism())),
]);

if (!fs.existsSync(BINARY)) {
  throw new Error(`Solvitaire build completed without producing ${BINARY}`);
}
process.stdout.write(`Solvitaire ready: ${path.relative(ROOT, BINARY)}\n`);
