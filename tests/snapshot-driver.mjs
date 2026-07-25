// Drives the app into each screen and collects the computed-style snapshot.
// Shared by the snapshot spec and by `npm run snapshot:baseline`, so the
// baseline and the comparison can never drift apart in how they measure.

import { GROUPS, PROPS, PSEUDOS, SNAPSHOT_STYLES, SNAPSHOT_VIEWPORTS, collect } from "./snapshot-selectors.mjs";

export { GROUPS, SNAPSHOT_STYLES, SNAPSHOT_VIEWPORTS };

// The deal is shuffled, so card positions (and which card lands in the stock,
// which changes its shadow) differ run to run. Seed Math.random once per page so
// every run deals the same game and the snapshot is comparable.
const seeded = new WeakSet();
const SEED_SCRIPT = () => {
  let s = 0x9e3779b9;
  Math.random = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function caseKey(cardStyle, viewport) {
  return `${cardStyle} — ${viewport.name}`;
}

/** Load the app with a fixed record so the stats screens render stable content. */
export async function loadCase(page, cardStyle, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  if (!seeded.has(page)) { await page.addInitScript(SEED_SCRIPT); seeded.add(page) }
  await page.goto("/index.html");
  await page.evaluate((style) => {
    localStorage.setItem("patience.v1.settings", JSON.stringify({ cardStyle: style }));
    localStorage.removeItem("patience.v1.stats");
    localStorage.removeItem("patience.v1.game");
  }, cardStyle);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.cardStyle);
  // Media queries must be evaluating against the intended viewport before
  // anything is measured; a resize that lands late silently changes breakpoints.
  await page.waitForFunction(
    ([w, h]) => innerWidth === w && innerHeight === h,
    [viewport.width, viewport.height]
  );
  await page.waitForTimeout(900);
  // Freeze animations so a mid-transition frame can never enter the snapshot.
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none !important;transition:none !important}" });
  await page.waitForTimeout(100);
}

const SHOW = {
  board: async () => {},
  sheet: async (page) => {
    await page.click("#btnMenu");
    await page.waitForTimeout(150);
  },
  stats: async (page) => {
    await page.click("#btnMenu");
    await page.waitForTimeout(100);
    await page.click("#btnStats");
    await page.waitForTimeout(200);
  },
  panel: async (page) => {
    await page.evaluate(() => document.getElementById("overlay").classList.add("show"));
    await page.waitForTimeout(150);
  }
};

/**
 * Snapshot every group for one (card style, viewport) case.
 *
 * `aliases` maps a current selector to the one that addressed the same element
 * in an older checkout, so a renamed class can still be compared like for like.
 * Results are keyed by the current name either way.
 */
export async function snapshotCase(page, cardStyle, viewport, aliases = {}) {
  const rename = (sel) => aliases[sel] || sel;
  const result = {};
  for (const [group, selectors] of Object.entries(GROUPS)) {
    await loadCase(page, cardStyle, viewport);
    await SHOW[group](page);
    const raw = await page.evaluate(collect, {
      props: PROPS,
      selectors: selectors.map(rename),
      pseudos: (group === "board" || group === "sheet" ? PSEUDOS : []).map(([sel, p]) => [rename(sel), p])
    });
    result[group] = {};
    for (const sel of selectors) result[group][sel] = raw[rename(sel)];
    for (const [sel, pseudo] of group === "board" || group === "sheet" ? PSEUDOS : [])
      result[group][sel + pseudo] = raw[rename(sel) + pseudo];
  }
  return result;
}
