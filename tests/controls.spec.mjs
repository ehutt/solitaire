// Control-rail behaviour during automatic play.
//
// Automatic cards and the player's cards can move concurrently. The control
// rail has a separate visual contract: only the end-game cascade should look
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

test("a stock tap still draws while safe auto-move is running", async ({ page }) => {
  await boot(page);

  const before = await page.evaluate(() => {
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
    layout();
    autoMoveSafeCards();
    return {
      stock: P.stock.length,
      waste: P.waste.length,
      running: autoRunning,
      topStock: P.stock[P.stock.length - 1].id
    };
  });
  expect(before.running).toBe(true);
  expect(before.stock).toBeGreaterThan(0);

  await page.locator(`.card[data-id="${before.topStock}"]`).click();
  await page.waitForTimeout(50);

  const after = await page.evaluate(() => ({ stock: P.stock.length, waste: P.waste.length }));
  expect(after.stock).toBe(before.stock - 1);
  expect(after.waste).toBe(before.waste + 1);
});

test("a tableau tap still moves a card while safe auto-move is running", async ({ page }) => {
  await boot(page);

  const queenId = await page.evaluate(() => {
    started = true; moves = 5;
    const planted = [
      cards.find(c => c.rank === 1 && c.suit === 0),
      cards.find(c => c.rank === 1 && c.suit === 1),
      cards.find(c => c.rank === 13 && !isRed(c.suit)),
      cards.find(c => c.rank === 12 && isRed(c.suit))
    ];
    for (const card of planted) {
      for (const q of [P.stock, P.waste, ...P.t, ...P.f]) {
        const at = q.indexOf(card);
        if (at >= 0) q.splice(at, 1);
      }
      card.faceUp = true;
      els.get(card.id).style.transition = "none";
    }
    P.t[0].push(planted[0]);
    P.t[1].push(planted[1]);
    P.t[2].push(planted[2]);
    P.t[3].push(planted[3]);
    layout();
    autoMoveSafeCards();
    return planted[3].id;
  });
  expect(await page.evaluate(() => autoRunning)).toBe(true);

  await page.locator(`.card[data-id="${queenId}"]`).click({ force: true });

  expect(await page.evaluate(id => locate(cards.find(c => c.id === id)).t, queenId)).toBe(2);
});

test("the game timer pauses in settings and resumes after closing", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    started = true; won = false; elapsed = 10;
    updateHUD(); startTimer();
  });

  await page.click("#btnMenu");
  const pausedAt = await page.evaluate(() => elapsed);
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBe(pausedAt);

  await page.click("#btnSheetClose");
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBeGreaterThan(pausedAt);
});

test("Deal opens a two-action sheet and restart preserves the shuffle", async ({ page }) => {
  await boot(page);
  const firstDeal = await page.evaluate(() => initialDeal.join(","));

  await page.click("#btnDeal");
  await expect(page.locator("#dealSheet")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#btnNewDeal")).toBeFocused();

  await page.click("#btnRestartDeal");
  expect(await page.evaluate(() => initialDeal.join(","))).toBe(firstDeal);
  await expect(page.locator("#dealSheet")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#btnDeal")).toBeFocused();

  await page.click("#btnDeal");
  await page.click("#btnNewDeal");
  expect(await page.evaluate(() => initialDeal.join(","))).not.toBe(firstDeal);
});

test("Escape closes Deal and returns keyboard focus to its control", async ({ page }) => {
  await boot(page);
  await page.locator("#btnDeal").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#btnNewDeal")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#dealSheet")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#btnDeal")).toBeFocused();
});

test("the game timer pauses while the app is hidden", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    started = true; won = false; elapsed = 10;
    updateHUD(); startTimer();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  const pausedAt = await page.evaluate(() => elapsed);
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBe(pausedAt);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBeGreaterThan(pausedAt);
});

test("the game timer follows Capacitor pause and resume events", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    started = true; won = false; elapsed = 10;
    updateHUD(); startTimer();
    document.dispatchEvent(new Event("pause"));
  });

  const pausedAt = await page.evaluate(() => elapsed);
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBe(pausedAt);

  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBeGreaterThan(pausedAt);
});

test("the game timer follows the native Capacitor app state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.nativeAppStateListeners = [];
    Object.defineProperty(window, "Capacitor", { value: { Plugins: {
      App: { addListener: (_name, listener) => {
        window.nativeAppStateListeners.push(listener);
        return Promise.resolve({ remove() {} });
      }, getState: () => Promise.resolve({ isActive: window.nativeAppIsActive }) }
    } } });
  });
  await page.goto("/index.html");
  await page.waitForFunction(() => window.nativeAppStateListeners.length === 1);
  await page.evaluate(() => {
    window.nativeAppIsActive = true;
    started = true; won = false; elapsed = 10;
    updateHUD(); startTimer();
    window.nativeAppIsActive = false;
  });

  const pausedAt = await page.evaluate(() => elapsed);
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBe(pausedAt);

  await page.evaluate(() => {
    window.nativeAppIsActive = true;
    window.nativeAppStateListeners[0]({ isActive: true });
  });
  await page.waitForTimeout(1150);
  expect(await page.evaluate(() => elapsed)).toBeGreaterThan(pausedAt);
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

  // Wait for the disabled state rather than sampling a fixed window: the first
  // beat is on a timer, and under a loaded machine it can land after any window
  // short enough to keep the suite quick. Waiting asserts the same thing without
  // racing the scheduler.
  await page.evaluate(() => maybeAutoFinish());
  // `&& !won` matters: once the cascade finishes the game the rail is disabled
  // for a different reason, which would satisfy a looser wait even if the
  // cascade itself never dimmed anything.
  await page.waitForFunction(
    () => !won && document.getElementById("btnHint").disabled &&
          document.getElementById("btnUndo").disabled,
    null, { timeout: 10000 });

  // And when it stops, the rail comes back (unless the game has been won, in
  // which case staying disabled is correct).
  await page.waitForFunction(() => !autoRunning, null, { timeout: 30000 });
  await page.waitForTimeout(100);
  const [hintDisabled, hasWon] = await page.evaluate(
    () => [document.getElementById("btnHint").disabled, won]);
  expect(hintDisabled).toBe(hasWon);
});

test("Classic cascade cards preserve the foundation rank font", async ({ page }) => {
  await boot(page);

  for (const viewport of [
    { width: 390, height: 844 }, { width: 844, height: 390 },
    { width: 834, height: 1194 }, { width: 1194, height: 834 },
  ]) {
    await page.setViewportSize(viewport);
    const typography = await page.evaluate(() => {
      stopCascadeLoop();
      settings.cardStyle = "original";
      document.body.dataset.cardStyle = "original";
      P.stock = []; P.waste = []; P.t = Array.from({ length: 7 }, () => []);
      P.f = Array.from({ length: 4 }, (_, suit) =>
        cards.filter((card) => card.suit === suit).sort((a, b) => a.rank - b.rank));
      for (const card of cards) card.faceUp = true;
      layout();

      const king = P.f[0][12];
      const sourceStyle = getComputedStyle(els.get(king.id).querySelector(".ix i"));
      const normalizer = document.createElement("canvas").getContext("2d");
      normalizer.font = cascadeCanvasFont(sourceStyle);
      const expected = normalizer.font;
      const painted = [];
      const originalFillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        if (text === "K") painted.push(this.font);
        return originalFillText.call(this, text, ...args);
      };
      cascade();
      CanvasRenderingContext2D.prototype.fillText = originalFillText;
      stopCascadeLoop();
      return { expected, painted };
    });
    expect(typography.painted).toContain(typography.expected);
  }
});

test("Classic cascade stamps carry the ink and artwork of their DOM faces", async ({ page }) => {
  await boot(page);

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      stopCascadeLoop();
      settings.cardStyle = "original";
      document.body.dataset.cardStyle = "original";
      P.stock = []; P.waste = []; P.t = Array.from({ length: 7 }, () => []);
      P.f = Array.from({ length: 4 }, (_, suit) =>
        cards.filter((card) => card.suit === suit).sort((a, b) => a.rank - b.rank));
      for (const card of cards) card.faceUp = true;
      layout();
    });
    await page.waitForFunction(() => [...CASCADE_COURT_ART.values()].every((img) => img.complete && img.naturalWidth));

    const faces = await page.evaluate(() => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const near = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
      const paper = hex(getComputedStyle(document.body).getPropertyValue("--paper").trim());
      const describe = (card) => {
        const front = els.get(card.id).querySelector(".front");
        const raster = cascadeFaceRaster(card, G.cw, G.ch, dpr);
        const ctx = raster.getContext("2d");
        const origin = front.getBoundingClientRect();
        const ink = rgb(getComputedStyle(front).color);
        // Count opaque pixels inside a child's box that satisfy `test`.
        const count = (node, test) => {
          const r = node.getBoundingClientRect();
          const x = Math.max(0, Math.round((r.left - origin.left) * dpr));
          const y = Math.max(0, Math.round((r.top - origin.top) * dpr));
          const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
          const data = ctx.getImageData(x, y, w, h).data;
          let hits = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && test([data[i], data[i + 1], data[i + 2]])) hits++;
          return hits;
        };
        return {
          size: [raster.width, raster.height],
          expected: [Math.round(G.cw * dpr), Math.round(G.ch * dpr)],
          rankInk: count(front.querySelector(".ix i"), (px) => near(px, ink)),
          suitInk: count(front.querySelector(".ix b"), (px) => near(px, ink)),
          centreArt: count(front.querySelector(".mid"), (px) => !near(px, paper, 24)),
        };
      };
      return { king: describe(P.f[0][12]), redQueen: describe(P.f[2][11]), ace: describe(P.f[3][0]) };
    });
    for (const face of Object.values(faces)) {
      expect(face.size).toEqual(face.expected);
      expect(face.rankInk).toBeGreaterThan(0);
      expect(face.suitInk).toBeGreaterThan(0);
      expect(face.centreArt).toBeGreaterThan(0);
    }
  }
});

test("replaying the cascade clears the previous trails", async ({ page }) => {
  await boot(page);
  const cleared = await page.evaluate(() => {
    stopCascadeLoop();
    const canvas = document.getElementById("fx");
    const context = canvas.getContext("2d");
    context.fillStyle = "red";
    context.fillRect(0, 0, 20, 20);
    P.stock = []; P.waste = []; P.t = Array.from({ length: 7 }, () => []);
    P.f = [[], [], [], []];
    cascade();
    return context.getImageData(0, 0, 1, 1).data[3] === 0;
  });
  expect(cleared).toBe(true);
});

const cascadeViewports = [
  ["iPhone portrait", { width: 390, height: 844 }],
  ["iPhone landscape", { width: 844, height: 390 }],
  ["iPad portrait", { width: 834, height: 1194 }],
  ["iPad landscape", { width: 1194, height: 834 }],
];

for (const [cardStyle, styleLabel] of [["original", "Classic"], ["crehore", "Vintage"]]) {
  for (const [viewportLabel, viewport] of cascadeViewports) {
    test(`${styleLabel} cascade accumulates classic trails on ${viewportLabel}`, async ({ page }) => {
      await boot(page);
      await page.setViewportSize(viewport);

      const coverage = await page.evaluate(async (style) => {
        stopCascadeLoop();
        settings.cardStyle = style;
        document.body.dataset.cardStyle = style;
        P.stock = []; P.waste = []; P.t = Array.from({ length: 7 }, () => []);
        const ace = cards.find((card) => card.suit === 0 && card.rank === 1);
        P.f = [[ace], [], [], []];
        ace.faceUp = true;
        layout();

        const faceImage = CARD_IMAGES[ace.id];
        if (style === "crehore" && !faceImage.complete) {
          await new Promise((resolve) => {
            faceImage.addEventListener("load", resolve, { once: true });
            faceImage.addEventListener("error", resolve, { once: true });
          });
        }

        // Drive exactly the same frames in every browser run. A classic
        // cascade keeps each paint on its canvas; coverage must therefore grow
        // long after the first complete card face is visible.
        const frames = new Map();
        let frameId = 0;
        window.requestAnimationFrame = (callback) => {
          const id = ++frameId;
          frames.set(id, callback);
          return id;
        };
        window.cancelAnimationFrame = (id) => frames.delete(id);
        const step = (time) => {
          const callbacks = [...frames.values()];
          frames.clear();
          for (const callback of callbacks) callback(time);
        };

        const values = [.9, 0, 0]; // rightward, slowest horizontal and vertical launch
        Math.random = () => values.shift() ?? .5;
        const epoch = performance.now();
        cascade();

        const paintedPixels = () => {
          const canvas = document.getElementById("fx");
          const pixels = canvas.getContext("2d").getImageData(
            0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
          return count;
        };

        for (let i = 1; i <= 55; i++) step(epoch + i * 16.7);
        const early = paintedPixels();
        for (let i = 56; i <= 110; i++) step(epoch + i * 16.7);
        const late = paintedPixels();
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const cardPixels = G.cw * G.ch * dpr * dpr;
        stopCascadeLoop();
        return { early, late, cardPixels };
      }, cardStyle);

      expect(coverage.early).toBeGreaterThan(coverage.cardPixels * 1.5);
      expect(coverage.late).toBeGreaterThan(coverage.early * 1.15);
    });
  }
}

test("Classic court faces clip their artwork to every rounded corner", async ({ page }) => {
  await boot(page);
  const faces = await page.evaluate(() => {
    settings.cardStyle = "original";
    document.body.dataset.cardStyle = "original";
    layout();
    return cards.filter((card) => card.rank >= 11).map((card) => {
      const style = getComputedStyle(els.get(card.id).querySelector(".front"));
      return {
        overflow: style.overflow,
        topLeft: style.borderTopLeftRadius,
        topRight: style.borderTopRightRadius,
        bottomLeft: style.borderBottomLeftRadius,
        bottomRight: style.borderBottomRightRadius,
      };
    });
  });

  expect(faces).toHaveLength(12);
  for (const face of faces) {
    expect(face.overflow).toBe("hidden");
    expect(face.bottomLeft).toBe(face.topLeft);
    expect(face.bottomRight).toBe(face.topRight);
    expect(parseFloat(face.bottomLeft)).toBeGreaterThan(0);
    expect(parseFloat(face.bottomRight)).toBeGreaterThan(0);
  }
});

// A theme swap must land in one step. The failure it guards is subtle and only
// visible for ~150ms: the outgoing theme's colour crossfading on a control while
// every other surface has already changed — a Vintage-red segment sitting in an
// otherwise Classic sheet.
for (const [from, to, deselected] of [
  ["crehore", "original", "#segCardsCrehore"],
  ["original", "crehore", "#segCardsOriginal"]
]) {
  test(`switching ${from} to ${to} leaves no colour mid-crossfade`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html");
    await page.evaluate((style) => {
      localStorage.setItem("patience.v1.settings", JSON.stringify({ cardStyle: style }));
    }, from);
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.cardStyle);
    await page.waitForTimeout(900);
    await page.click("#btnMenu");
    await page.waitForTimeout(500);

    const target = to === "original" ? "#segCardsOriginal" : "#segCardsCrehore";
    const samples = await page.evaluate(async ([tapped, dropped]) => {
      const seen = [];
      const read = () => [
        getComputedStyle(document.querySelector(dropped)).backgroundColor,
        getComputedStyle(document.getElementById("btnDeal")).backgroundColor
      ];
      document.querySelector(tapped).click();
      // Sample across the window the old transition covered.
      for (let i = 0; i < 8; i++) {
        seen.push(read());
        await new Promise((r) => setTimeout(r, 25));
      }
      return seen;
    }, [target, deselected]);

    // Every sample identical to the first: the swap was one step, not a fade.
    for (const sample of samples) expect(sample).toEqual(samples[0]);
    // …and the highlight really did leave the segment that lost selection.
    expect(samples[0][0]).toBe("rgba(0, 0, 0, 0)");
  });
}
