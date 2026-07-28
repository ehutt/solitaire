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

// The same bug, one breakpoint over. Classic's phone-landscape block sets
// --type-display on `body[data-card-style="original"]`, which out-ranks the
// tablet-landscape block's plain `body` — so a tablet held horizontally drew
// the marquee at the phone's size, and the HUD chips at the theme block's own
// default. Vintage restates its values and escaped it, so this is Classic's.
//
// Compared within an orientation, and at a slimmer margin than the 1.2x this
// once asserted. Both are consequences of the HUD now being sized by measuring
// the row it got: phone portrait gives the marquee a row to itself, while an
// iPad portrait is wide enough to seat the marquee and the stat line together —
// so the phone's title legitimately closes much of the gap. Comparing across
// orientations was only meaningful while the sizes were fixed per breakpoint.
// The bug itself produces a ratio of 1.0, so 1.1 still catches it.
for (const [what, selector] of [["marquee", ".brand"], ["HUD chips", ".chip b"]]) {
  for (const [orientation, phone, tablet] of
       [["portrait", VIEWPORTS[0], VIEWPORTS[2]], ["landscape", VIEWPORTS[1], VIEWPORTS[3]]]) {
    test(`original — the ${what} is larger on a ${orientation} tablet than on a phone`, async ({ page }) => {
      const size = async (viewport) => {
        await load(page, "original", viewport);
        return page.evaluate(
          sel => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize), selector);
      };
      expect(await size(tablet)).toBeGreaterThan(await size(phone) * 1.1);
    });
  }
}

// Sizing the marquee up fails *quietly*: the HUD is nowrap, so the title does
// not overflow — its own text wraps to a second line and doubles the HUD's
// height instead. Nothing else in this suite would notice.
for (const cardStyle of STYLES) {
  for (const viewport of VIEWPORTS) {
    test(`${cardStyle} — ${viewport.name} — the marquee stays on one line`, async ({ page }) => {
      await load(page, cardStyle, viewport);
      const brand = await page.evaluate(() => {
        const el = document.querySelector(".brand");
        const fontSize = parseFloat(getComputedStyle(el).fontSize);
        return { fontSize, height: el.getBoundingClientRect().height };
      });
      // One line box is ~1.2x the font size; two would be ~2.4x.
      expect(brand.height).toBeLessThan(brand.fontSize * 1.7);
    });
  }
}

// Phone landscape sizes the HUD type by measuring the row it actually got —
// the safe-area insets and the control rail eat a width no CSS length can name,
// so the type ships small enough to always fit and --hud-fit spends the rest.
// The failure to guard against is spending too much: the marquee and the chips
// are one nowrap row, and if the fit overshoots they collide.
for (const cardStyle of STYLES) {
  for (const viewport of VIEWPORTS) {
    test(`${cardStyle} — ${viewport.name} — the HUD fills its row without colliding`, async ({ page }) => {
      await load(page, cardStyle, viewport);
      const hud = await page.evaluate(() => {
        const el = document.querySelector("#hud"), cs = getComputedStyle(el);
        const brand = el.querySelector(".brand").getBoundingClientRect();
        const chips = el.querySelector(".chips").getBoundingClientRect();
        return {
          fit: document.body.style.getPropertyValue("--hud-fit"),
          clearance: chips.left - brand.right,
          gap: parseFloat(cs.columnGap) || 0,
          used: (brand.width + chips.width) /
            (el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))
        };
      });
      // Every screen is fitted — measuring each against its own row is what
      // keeps a tablet ahead of a phone without hand-tuned sizes per breakpoint.
      expect(hud.fit).not.toBe("");
      test.skip(viewport.width <= viewport.height,
        "portrait stacks the marquee and the chips, so there is no shared row");
      expect(hud.clearance).toBeGreaterThanOrEqual(hud.gap - 0.5);
      // A shared row that uses half its width is type left on the table.
      expect(hud.used).toBeGreaterThan(0.8);
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

      // The longest column Klondike can build: six face-down under a complete
      // K-to-A run. That is thirteen face-up cards where the card size budgets
      // eleven reveals, so it is the one pile that can run off the bottom of a
      // landscape table — it used to clip the last card by ~5pt. It now trims
      // its own reveal to fit rather than every card in every game shrinking.
      test("a full 19-card column stays on the table", async ({ page }) => {
        const pile = await page.evaluate(() => {
          const all = [...P.stock, ...P.waste, ...P.t.flat(), ...P.f.flat()];
          const run = [];
          for (let r = 13; r >= 1; r--) run.push(all.find(c => c.suit === 0 && c.rank === r));
          const rest = all.filter(c => !run.includes(c));
          const down = rest.slice(0, 6);
          down.forEach(c => c.faceUp = false);
          run.forEach(c => c.faceUp = true);
          P.t = [[...down, ...run], [], [], [], [], [], []];
          P.f = [[], [], [], []];
          P.waste = [];
          P.stock = rest.slice(6);
          P.stock.forEach(c => c.faceUp = false);
          layout();

          const gaps = [];
          for (let i = 1; i < P.t[0].length; i++) {
            if (P.t[0][i - 1].faceUp) gaps.push(P.t[0][i].y - P.t[0][i - 1].y);
          }
          const last = P.t[0][P.t[0].length - 1];
          return {
            cards: P.t[0].length,
            bottom: last.y + G.ch,
            boardHeight: document.getElementById("board").getBoundingClientRect().height,
            reveal: Math.min(...gaps) / G.ch,
            floor: G.minFaceUpReveal
          };
        });
        expect(pile.cards).toBe(19);
        expect(pile.bottom).toBeLessThanOrEqual(pile.boardHeight);
        // Compressing is only allowed to borrow a few percent of the reveal —
        // below that the rank indices of covered cards start to disappear.
        expect(pile.reveal).toBeGreaterThanOrEqual(pile.floor * 0.9);
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
