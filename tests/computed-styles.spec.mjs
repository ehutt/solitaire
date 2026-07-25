// The blunt oracle: every recorded computed value and box must match the
// committed baseline, for every screen, theme, and viewport.
//
// The CSS refactor is a structural change with no intended visual effect, so any
// diff here is a bug in the refactor. When a visual change *is* intended, run
// `npm run snapshot:baseline` and review the JSON diff as part of that commit.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { caseKey, snapshotCase, SNAPSHOT_STYLES, SNAPSHOT_VIEWPORTS } from "./snapshot-driver.mjs";

const baseline = JSON.parse(readFileSync(new URL("./computed-styles.baseline.json", import.meta.url), "utf8"));

for (const cardStyle of SNAPSHOT_STYLES) {
  for (const viewport of SNAPSHOT_VIEWPORTS) {
    const key = caseKey(cardStyle, viewport);
    test(`computed styles unchanged — ${key}`, async ({ page }) => {
      expect(baseline[key], `no baseline for ${key}; run npm run snapshot:baseline`).toBeTruthy();
      const actual = await snapshotCase(page, cardStyle, viewport);
      expect(actual).toEqual(baseline[key]);
    });
  }
}
