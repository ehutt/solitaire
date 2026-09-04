const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "www");

function assertUsefulFile(relativePath) {
  const absolutePath = path.join(webRoot, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} exists`);
  assert.ok(fs.statSync(absolutePath).size > 20, `${relativePath} is not empty`);
}

test("both card styles ship every face asset the renderer can request", () => {
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) {
      assertUsefulFile(`assets/cards/crehore-1820/cards/${suit}-${rank}.webp`);
    }
  }

  for (const suit of ["spades", "hearts", "diamonds", "clubs"]) {
    for (const rank of ["jack", "queen", "king"]) {
      assertUsefulFile(`assets/cards/classic/courts/${suit}-${rank}.svg`);
    }
  }
});

test("every service-worker shell entry exists and includes runtime modules", () => {
  const source = fs.readFileSync(path.join(webRoot, "sw.js"), "utf8");
  const context = {
    self: { addEventListener() {}, skipWaiting() {}, clients: { claim() {} } },
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__shell = SHELL;`, context);

  for (const relativePath of context.__shell) {
    if (relativePath !== ".") assertUsefulFile(relativePath);
  }
  for (const moduleName of ["copy.js", "deal-engine.js", "game-rules.js", "persistence.js", "winnable-deals.js"]) {
    assert.ok(context.__shell.includes(moduleName), `${moduleName} is available offline`);
  }
});
