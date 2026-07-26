// Layout oracle for the CSS refactor.
//
// These tests assert things only layout knows — alignment, overflow, stickiness,
// on-screen-ness — across the matrix that otherwise has to be checked by hand in
// the simulator: 2 card styles x {iPhone, iPad} x {portrait, landscape}.
//
// They are deliberately about *rendered geometry*, not CSS text, so they survive
// a restructure of the stylesheet and fail only when something actually moves.

import { test, expect } from "@playwright/test";

const STYLES = ["original", "crehore"];
const VIEWPORTS = [
  { name: "iPhone portrait",  width: 390,  height: 844 },
  { name: "iPhone landscape", width: 844,  height: 390 },
  { name: "iPad portrait",    width: 820,  height: 1180 },
  { name: "iPad landscape",   width: 1180, height: 820 }
];

/** Load the app with a card style seeded into localStorage before first paint. */
async function load(page, cardStyle, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.addInitScript((style) => {
    localStorage.setItem("patience.v1.settings", JSON.stringify({ cardStyle: style }));
  }, cardStyle);
  await page.goto("/index.html");
  await page.waitForFunction(() => document.body.dataset.cardStyle);
  expect(await page.evaluate(() => document.body.dataset.cardStyle)).toBe(cardStyle);
  // let the deal animation settle
  await page.waitForTimeout(900);
}

/**
 * Cap-band geometry of the first text node in `selector`, in page coordinates.
 *
 * The cap band is ink-top -> baseline. A line box's own middle sits *below* it,
 * because descender space counts even when the glyphs barely use it — so
 * centring an icon on getBoundingClientRect() puts it visibly low. Ink top comes
 * from canvas TextMetrics.actualBoundingBoxAscent; the baseline comes from a
 * zero-size inline-block probe, which browsers align to the baseline exactly.
 */
async function capBand(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
    const text = el.textContent.trim();

    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    el.appendChild(probe);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();

    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = font;
    const m = ctx.measureText(text);
    const inkTop = baseline - m.actualBoundingBoxAscent;
    return { inkTop, baseline, middle: (inkTop + baseline) / 2 };
  }, selector);
}

/** Open the settings sheet and wait for its slide-in transition to finish. */
async function openSheet(page) {
  await page.click("#btnMenu");
  await page.waitForTimeout(500);
}

/** Open the stats page (reachable only through the sheet) and let it settle. */
async function openStats(page) {
  await openSheet(page);
  await page.click("#btnStats");
  await page.waitForTimeout(500);
}

async function centreY(page, selector) {
  const box = await page.locator(selector).boundingBox();
  return box.y + box.height / 2;
}

const PHONE = VIEWPORTS[0], TABLET = VIEWPORTS[2];

// The bug this suite exists to prevent: a theme-scoped rule out-ranks the tablet
// media block by selector shape alone, so the iPad silently renders phone-sized
// titles. Assert the *intent* — tablets get bigger titles — in both themes.
for (const cardStyle of STYLES) {
  for (const [selector, open] of [["#sheet h3", openSheet], ["#statsPage h2", openStats]]) {
    test(`${cardStyle} — ${selector} is larger on tablet than on phone`, async ({ page }) => {
      const size = async (viewport) => {
        await load(page, cardStyle, viewport);
        await open(page);
        return page.evaluate(sel => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize), selector);
      };
      const phone = await size(PHONE);
      const tablet = await size(TABLET);
      expect(tablet).toBeGreaterThan(phone * 1.25);
    });
  }
}

for (const cardStyle of STYLES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${cardStyle} — ${viewport.name}`, () => {
      test.beforeEach(async ({ page }) => { await load(page, cardStyle, viewport) });

      test("close button sits on the settings title's cap band", async ({ page }) => {
        await openSheet(page);
        const band = await capBand(page, "#sheet h3");
        const button = await centreY(page, "#btnSheetClose");
        expect(Math.abs(button - band.middle)).toBeLessThanOrEqual(3);
      });

      test("close button sits on the stats title's cap band", async ({ page }) => {
        await openSheet(page);
        await page.click("#btnStats");
        await page.waitForTimeout(500);
        const band = await capBand(page, "#statsPage h2");
        const button = await centreY(page, "#btnStatsClose");
        expect(Math.abs(button - band.middle)).toBeLessThanOrEqual(3);
      });

      test("HUD chips do not jitter as their values change", async ({ page }) => {
        const set = (time, moves, streak) => page.evaluate(([t, m, s]) => {
          document.getElementById("vTime").textContent = t;
          document.getElementById("vMoves").textContent = m;
          document.getElementById("vStreak").textContent = s;
        }, [time, moves, streak]);
        const edges = () => page.evaluate(() =>
          [...document.querySelectorAll(".chips .chip")].map(c => c.getBoundingClientRect().left));

        // Same digit count, different digits: tabular figures mean nothing moves
        // at all. This is the every-second case — the timer must not shimmy.
        await set("0:00", "0", "0");
        const zeros = await edges();
        await set("8:88", "8", "8");
        expect(await edges()).toEqual(zeros);

        // Growing to the widest realistic values may widen the chip row, but the
        // row is centred, so the drift must stay small enough to be invisible.
        await set("89:28", "8888", "8888");
        const large = await edges();
        for (let i = 0; i < zeros.length; i++) {
          expect(Math.abs(large[i] - zeros[i])).toBeLessThanOrEqual(8);
        }
      });

      test("nothing overflows horizontally", async ({ page }) => {
        const overflow = await page.evaluate(() => ({
          body: document.body.scrollWidth - document.documentElement.clientWidth,
          docEl: document.documentElement.scrollWidth - document.documentElement.clientWidth
        }));
        expect(overflow.body).toBeLessThanOrEqual(1);
        expect(overflow.docEl).toBeLessThanOrEqual(1);

        // For the sheet, compare real content boxes rather than scrollWidth: the
        // sticky header's backdrop is a deliberately full-bleed ::before, which
        // inflates scrollWidth without being visible (overflow-x is hidden).
        await openSheet(page);
        const spills = await page.evaluate(() => {
          const s = document.getElementById("sheet");
          const box = s.getBoundingClientRect();
          return [...s.querySelectorAll("*")]
            .filter(e => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && (r.left < box.left - 0.5 || r.right > box.right + 0.5);
            })
            .map(e => e.tagName + "." + (e.className || e.id));
        });
        expect(spills).toEqual([]);
      });

      test("sheet header stays pinned and opaque when scrolled", async ({ page }) => {
        await page.click("#btnMenu");
        await page.waitForTimeout(400);
        const before = await page.locator(".pinned-header").boundingBox();
        await page.evaluate(() => { document.getElementById("sheet").scrollTop = 420 });
        await page.waitForTimeout(150);
        const after = await page.locator(".pinned-header").boundingBox();

        // Header must not have scrolled away with the content.
        expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);

        // …and a row must actually have moved underneath it, or the assertion above
        // proves nothing (a short sheet cannot scroll).
        const scrolled = await page.evaluate(() => document.getElementById("sheet").scrollTop);
        expect(scrolled).toBeGreaterThan(0);

        // The backdrop is a full-bleed ::before; it must be painted (non-transparent)
        // so rows do not show through the sticky header.
        const backdrop = await page.evaluate(() => {
          const cs = getComputedStyle(document.querySelector(".pinned-header"), "::before");
          return { background: cs.backgroundColor, width: parseFloat(cs.width) };
        });
        expect(backdrop.background).not.toBe("rgba(0, 0, 0, 0)");
        expect(backdrop.width).toBeGreaterThan(0);
      });

      test("every foundation and tableau slot is on screen after a deal", async ({ page }) => {
        const offenders = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          const bad = [];
          for (const ph of document.querySelectorAll("#board .ph")) {
            const r = ph.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) { bad.push([ph.dataset.slot, "zero size"]); continue }
            if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) {
              bad.push([ph.dataset.slot, `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}x${vh}`]);
            }
          }
          return bad;
        });
        expect(offenders).toEqual([]);
      });

      // The landscape arrangement puts the foundations and the stock in side
      // rails flanking the seven tableau columns. If a rail sits one plain
      // `gap` away it reads as an eighth and ninth column, which is what
      // happened on tablets: the nine columns filled the width exactly, so the
      // outward nudge had no slack to use and silently collapsed to zero.
      test("side rails stand clear of the tableau in landscape", async ({ page }) => {
        const lanes = await page.evaluate(() => {
          if (!G.landscape) return null;
          const { cw, gap, slotPos, xs } = G;
          return {
            gap,
            left: xs(0) - (slotPos.f0[0] + cw),          // foundations -> tableau
            right: slotPos.stock[0] - (xs(6) + cw)        // tableau -> stock
          };
        });
        test.skip(lanes === null, "portrait arrangement has no side rails");

        // Comfortably wider than the gap between two tableau columns, and
        // symmetric. 2.5x is below what every device produces (phones ~2.9x,
        // tablets ~3.7x) so this pins the intent without pinning the ratio.
        expect(lanes.left).toBeGreaterThan(lanes.gap * 2.5);
        expect(lanes.right).toBeGreaterThan(lanes.gap * 2.5);
        expect(Math.abs(lanes.left - lanes.right)).toBeLessThan(1);
      });
    });
  }
}
