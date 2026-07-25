#!/usr/bin/env node
// Render two checkouts of www/ side by side and report every computed-style or
// geometry difference. Used to prove a structural refactor changed nothing.
//
//   node scripts/compare-to-baseline.mjs <other-www-dir> [chromium|webkit]

import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { caseKey, snapshotCase, SNAPSHOT_STYLES, SNAPSHOT_VIEWPORTS } from "../tests/snapshot-driver.mjs";

const [otherRoot, engineName = "chromium"] = process.argv.slice(2);
if (!otherRoot) { console.error("usage: compare-to-baseline.mjs <other-www-dir> [engine]"); process.exit(2) }

const serve = (root, port) =>
  spawn("node", ["scripts/static-server.cjs"], { stdio: "ignore", env: { ...process.env, PORT: String(port), ROOT: root } });

const servers = [serve(new URL("../www", import.meta.url).pathname, 4301), serve(otherRoot, 4302)];
await new Promise(r => setTimeout(r, 800));

const engine = engineName === "webkit" ? webkit : chromium;
const browser = await engine.launch();

// Selectors the refactor renamed. Comparing them by their old names is what
// makes "did anything move" answerable across the rename.
const LEGACY = {
  ".pinned-header": ".sheet-header",
  ".title-row": ".sheet-title-row",
  ".title-row .icon-button": ".sheet-close"
};

// Asset URLs carry the port they were served from; that is not a visual change.
const normalise = (obj) => JSON.parse(JSON.stringify(obj).replaceAll(/http:\/\/127\.0\.0\.1:\d+/g, "SERVER"));

async function capture(port, aliases) {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${port}`, deviceScaleFactor: 2 });
  const out = {};
  for (const cardStyle of SNAPSHOT_STYLES)
    for (const viewport of SNAPSHOT_VIEWPORTS)
      out[caseKey(cardStyle, viewport)] = normalise(await snapshotCase(page, cardStyle, viewport, aliases));
  await page.close();
  return out;
}

const mine = await capture(4301, {});
const theirs = await capture(4302, LEGACY);
await browser.close();
servers.forEach(s => s.kill());

let diffs = 0;
for (const c of Object.keys(theirs))
  for (const g of Object.keys(theirs[c]))
    for (const sel of Object.keys(theirs[c][g])) {
      const a = theirs[c][g][sel], b = mine[c]?.[g]?.[sel];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (typeof a !== "object" || typeof b !== "object") { console.log(`${c} | ${sel} | ${a} -> ${b}`); diffs++; continue }
      for (const k of Object.keys(a))
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
          console.log(`${c} | ${sel} | ${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
          diffs++;
        }
    }
console.log(`\n${engineName}: ${diffs} difference(s)`);
process.exit(diffs ? 1 : 0);
