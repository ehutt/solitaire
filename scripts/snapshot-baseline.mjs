#!/usr/bin/env node
// Regenerate tests/computed-styles.baseline.json from the working tree.
//
// Run this ONLY when a visual change is intended, and review the resulting diff
// as the change itself — that JSON is the record of what the app looks like.
// Requires the static server: `node scripts/static-server.cjs` (or npm run test:layout once).

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { caseKey, snapshotCase, SNAPSHOT_STYLES, SNAPSHOT_VIEWPORTS } from "../tests/snapshot-driver.mjs";

const server = spawn("node", ["scripts/static-server.cjs"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 700));

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, baseURL: "http://127.0.0.1:4173" });
const out = {};
for (const cardStyle of SNAPSHOT_STYLES) {
  for (const viewport of SNAPSHOT_VIEWPORTS) {
    const key = caseKey(cardStyle, viewport);
    out[key] = await snapshotCase(page, cardStyle, viewport);
    console.log("captured", key);
  }
}
await browser.close();
server.kill();

writeFileSync(new URL("../tests/computed-styles.baseline.json", import.meta.url),
  JSON.stringify(out, null, 1) + "\n");
console.log("wrote tests/computed-styles.baseline.json");
