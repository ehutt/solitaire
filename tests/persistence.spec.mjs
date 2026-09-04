import { expect, test } from "@playwright/test";

test("a saved deal resumes with the same cards and counters", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("patience.v1.settings", JSON.stringify({ draw3: false, autoComplete: false }));
  });
  await page.goto("/index.html");
  await page.evaluate(() => draw());
  const before = await page.evaluate(() => ({
    game: localStorage.getItem(SolitairePersistence.KEYS.game),
    state: serialize(),
    elapsed,
  }));

  await page.reload();

  const after = await page.evaluate(() => ({ state: serialize(), elapsed }));
  expect(before.game).not.toBeNull();
  expect(after.state).toEqual(before.state);
  expect(after.elapsed).toBeGreaterThanOrEqual(before.elapsed);
});

test("invalid stored records retain an exact recovery copy", async ({ page }) => {
  const invalidStats = '{"wins":27,"records":';
  const invalidGame = '{"deal":[0,1,2]';
  await page.addInitScript(
    ({ invalidStats, invalidGame }) => {
      localStorage.setItem("patience.v1.stats", invalidStats);
      localStorage.setItem("patience.v1.game", invalidGame);
    },
    { invalidStats, invalidGame },
  );

  await page.goto("/index.html");

  await expect(page.locator("#board .card")).toHaveCount(52);
  const stored = await page.evaluate(() => ({
    statsRecovery: localStorage.getItem(`${SolitairePersistence.KEYS.stats}.recovery`),
    gameRecovery: localStorage.getItem(`${SolitairePersistence.KEYS.game}.recovery`),
  }));
  expect(stored.statsRecovery).toBe(invalidStats);
  expect(stored.gameRecovery).toBe(invalidGame);
});
