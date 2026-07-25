// Control-rail behaviour during automatic play.
//
// The rail is gated by two different things and they are not the same: every
// kind of automation blocks input, but only the end-game cascade should *look*
// unavailable. A safe auto-move is a card or two long, and dimming Hint and
// Undo and undimming them again a moment later reads as a flicker.

import { test, expect } from "@playwright/test";

async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");
  await page.waitForFunction(() => document.body.dataset.cardStyle);
  await page.waitForTimeout(1000);
}

/** Sample whether the rail looks disabled, while `run` drives the automation. */
async function sampleWhile(page, run, ms) {
  return page.evaluate(async ([source, duration]) => {
    const hint = document.getElementById("btnHint");
    const undo = document.getElementById("btnUndo");
    const seen = [];
    const tick = () => seen.push({
      hint: hint.disabled,
      hintOpacity: Number(getComputedStyle(hint).opacity),
      undo: undo.disabled
    });
    tick();
    // eslint-disable-next-line no-new-func
    new Function(source)();
    await new Promise((done) => {
      const id = setInterval(tick, 40);
      setTimeout(() => { clearInterval(id); tick(); done() }, duration);
    });
    return seen;
  }, [run, ms]);
}

test("a safe auto-move never dims the control rail", async ({ page }) => {
  await boot(page);

  // Two aces on top of tableau piles: the automation lifts both, one per beat.
  const moved = await page.evaluate(() => {
    started = true; moves = 5;
    for (let i = 0; i < 2; i++) {
      const ace = cards.find((c) => c.rank === 1 && c.suit === i);
      for (const q of [P.stock, P.waste, ...P.t, ...P.f]) {
        const at = q.indexOf(ace);
        if (at >= 0) q.splice(at, 1);
      }
      ace.faceUp = true;
      P.t[i].push(ace);
    }
    layout(); updateButtons();
    return P.f.reduce((n, p) => n + p.length, 0);
  });
  expect(moved).toBe(0);

  const samples = await sampleWhile(page, "maybeAutoFinish()", 2600);

  // The run really happened. At least the two planted aces went up; the dealt
  // hand may legitimately offer more safe cards, so this is a floor, not a count.
  const founded = await page.evaluate(() => P.f.reduce((n, p) => n + p.length, 0));
  expect(founded).toBeGreaterThanOrEqual(2);

  // …and nothing about the rail changed while it did. Comparing against the
  // state before the run, rather than against "enabled", keeps the test honest
  // about Undo, which is legitimately disabled here with an empty undo stack.
  const before = samples[0];
  expect(samples.filter((s) => s.hint !== before.hint || s.undo !== before.undo)).toEqual([]);
  expect(Math.min(...samples.map((s) => s.hintOpacity))).toBe(before.hintOpacity);
});

test("the end-game cascade does disable the rail, and releases it after", async ({ page }) => {
  await boot(page);

  // Every tableau card face up and the stock empty: finishable() is true, so
  // the next beat starts the cascade rather than a safe auto-move.
  await page.evaluate(() => {
    started = true; moves = 5;
    for (const pile of P.t) for (const c of pile) c.faceUp = true;
    layout(); updateButtons();
  });
  expect(await page.evaluate(() => finishable())).toBe(true);

  const samples = await sampleWhile(page, "maybeAutoFinish()", 1600);
  expect(samples.some((s) => s.hint && s.undo)).toBe(true);

  // And when it stops, the rail comes back (unless the game has been won, in
  // which case staying disabled is correct).
  await page.waitForFunction(() => !autoRunning, null, { timeout: 30000 });
  await page.waitForTimeout(100);
  const [hintDisabled, hasWon] = await page.evaluate(
    () => [document.getElementById("btnHint").disabled, won]);
  expect(hintDisabled).toBe(hasWon);
});
