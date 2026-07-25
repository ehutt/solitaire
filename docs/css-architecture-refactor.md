# CSS architecture refactor — plan

**Status:** not started. Baseline tag: `pre-css-refactor` (commit `f8eb8fc`).
**Goal:** make font, size, theme, and layout changes cheap and safe. Behaviour and
visuals must not change — this is a structural refactor, verified by comparison
against the baseline tag.

---

## Why

Restyling this app currently costs far more than it should, and the cost is
structural. Measured against `www/index.html` at the baseline tag:

| | count |
|---|---|
| CSS lines (inline in `index.html`) | 1,037 |
| Rules scoped to a theme (`body[data-card-style=…]`) | 164 |
| …that set `font-size` | 46 |
| …that only swap colour/border/background | 61 |
| `font-size` declarations | 116 |
| Hardcoded px/rem literals | 373 |
| Rules carrying an `#id` | 107 |
| Test assertions matching raw HTML/CSS text | 75 of 227 (33%) |

Three root causes:

1. **Specificity decides outcomes, not intent.** 107 ID-bearing rules crossed with
   164 theme-scoped attribute rules means that whenever a responsive rule and a
   theme rule touch the same property, the winner depends on selector *shape*.
   This shipped a real bug: `body[data-card-style="…"] #sheet h3` scores (1,1,2)
   and silently beat the tablet block's `#sheet h3` at (1,0,1), so the iPad's
   intended title size had never rendered. Nothing flagged it.
2. **Values live at the leaves.** 373 literals and 116 `font-size`s mean "make
   iPad text bigger" is an edit to ~20 declarations across two themes and three
   media queries. The 35 existing custom properties cover colour only — type,
   spacing, and control sizes never got the same treatment.
3. **Tests pin implementation, not behaviour.** The 75 literal-text assertions
   break on every restyle while catching nothing. A 21px vertical misalignment
   passed all 49 tests, because nothing in the suite can see layout.

## The rule this refactor establishes

> **A component rule never appears inside a theme block or a media query.**
> Components read `var(--token)`. Themes set token *values*. Breakpoints set token
> *values*. One rule per property per component.

That makes the specificity class of bug structurally impossible: there is nothing
to out-rank, because there is only ever one declaration.

## What not to do

- **No Sass, Tailwind, PostCSS, or bundler.** The zero-build single-file setup is
  an asset: `npm run sync` is trivial and there is no toolchain to rot. Tokens +
  `clamp()` + a layout test harness deliver the benefit without giving that up.
- **Do not restyle anything.** If a phase changes a rendered pixel, that is a bug
  in the phase, not an improvement. Visual changes are separate commits.
- Playwright (Phase 0) is a **devDependency only** — it never ships in the app
  bundle and does not touch the runtime build.

---

## Phase 0 — Safety net (do this first)

Nothing else is safe without it, and it is what makes the remaining phases fast
rather than nerve-wracking.

Add a headless layout suite that loads `www/index.html` directly (no simulator,
no build) and asserts what only layout knows. Cover the matrix that currently has
to be checked by hand: **2 card styles × {iPhone, iPad} × {portrait, landscape}**.

Assertions to include, all of which were verified manually in the session that
produced this plan:

- Close-button centre is within 3 CSS px of the settings title's cap band
  (cap band = ink top → baseline; a line box's middle sits below it because
  descender space counts even when glyphs barely use it).
- HUD chip left edges are byte-identical with `0:00 / 0` and with `89:28 / 8888`.
- No horizontal overflow of `#sheet` or `body` at any viewport.
- The sticky sheet header stays opaque and pinned with `#sheet` scrolled 420px.
- Every foundation/tableau slot is on-screen after a deal, in all four viewports.

Suggested files: `tests/layout.spec.mjs`, `playwright.config.mjs`, plus an
`npm run test:layout` script. Keep `npm test` (node:test) as-is for logic.

**Acceptance:** suite passes on the baseline tag, and *fails* if you temporarily
revert the Phase-1 title fix (`body[data-card-style="original"] #sheet h3` size).
Prove the net catches the bug it was built for before relying on it.

## Phase 1 — Typography tokens

Introduce a semantic type scale in `:root` and route all 116 `font-size`
declarations through it. Do this **section by section** (chips → controls →
sheet → stats page → win panel), committing each, so a regression is bisectable.

```css
:root{
  --type-display: …;   /* brand marquee */
  --type-title: …;     /* sheet h3, stats h2, panel h2 */
  --type-body: …;      /* .row labels */
  --type-sub: …;       /* .sub2, captions */
  --type-label: …;     /* uppercase engraved labels, .chip small */
  --type-figure: …;    /* tabular numerals: chips, stat heroes */
}
```

Themes then set only *values* (e.g. vintage's display face and its slightly
larger optical size), never `font-size` on a component selector. Delete the 46
theme rules that set `font-size` as they are absorbed.

**Acceptance:** Phase-0 suite green; `grep -c 'body\[data-card-style=[^{]*{[^}]*font-size' ` returns 0.

## Phase 2 — Surface and ink tokens

Same treatment for the 61 colour-only theme rules. Define semantic surface tokens
— `--surface-sheet`, `--surface-sheet-top`, `--ink`, `--ink-muted`, `--rule`,
`--accent` — set once per theme. Components reference only those.

This kills the hardcoded pairs added during the close-button work, e.g.
`.sheet-header::before{background:#123b2e}` plus its vintage override becomes a
single `background:var(--surface-sheet-top)`.

Keep genuinely *different design* as theme rules — the vintage double rules,
felt texture, and letterpress treatments are not token substitutions and should
stay explicit.

**Acceptance:** Phase-0 suite green; theme-scoped rule count drops from 164 to
roughly 60; no hex literal appears outside the token definitions.

## Phase 3 — Fluid scale, delete breakpoint duplication

Convert the type tokens to `clamp(min, preferred, max)` (the `.brand` rule
already does this). Most of the tablet block's typography then disappears —
"bigger on iPad" becomes one number instead of twenty.

Keep discrete tokens where a jump is deliberate: tap targets and control sizes
should step at the breakpoint, not scale continuously.

**Watch:** `vw` units change on rotation, and this app rotates. Verify all four
viewports, and re-check the iPad-landscape sheet, which has the least vertical
room at the current sizes.

**Acceptance:** Phase-0 suite green; the tablet media block contains no
`font-size` declarations; media-query count drops.

## Phase 4 — Layout primitives

Extract the patterns that recur, so the next page added gets them for free
instead of rediscovering them:

- `.title-row` — centred title + trailing icon action, aligned to the title's cap
  band. Must centre against a box the action button cannot stretch; see
  `.sheet-title-row` for the working version and the reason.
- `.icon-button` — borderless glyph action with a full tap target; SVG mark, not
  a text glyph (a text ✕ sits ~10px low inside its own line box at title sizes).
- `.pinned-header` — sticky header with a full-bleed backdrop that survives
  whatever padding the breakpoint applies.

Then apply them to both the settings sheet and the stats page, which currently
solve the same problem twice.

**Acceptance:** Phase-0 suite green; sheet and stats headers share one rule set.

## Phase 5 — Rebalance the tests

- Delete the literal-text assertions that merely restate CSS (`.row{padding:17px
  0;font-size:1.3rem`). They cost churn and catch nothing.
- Keep and extend the *invariant* assertions, which are cheap and catch whole
  categories. Highest value:
  - no `body[data-card-style=…]` rule sets `font-size`, `padding`, or `margin`
  - every component `font-size` is a `var(--type-*)`
  - no hex colour outside the token block

  The first of these would have caught the iPad title bug at its root,
  permanently.
- Keep all behavioural/logic tests as they are.

**Acceptance:** literal-text assertions well under 10% of the suite; the
invariant tests fail when the rule is violated (verify by breaking it on purpose).

## Phase 6 — Optional: split the stylesheet

Only after tokens, which make the split natural. Extract to `www/styles/`
(`tokens.css`, `base.css`, `components/*.css`, `themes/*.css`) via plain `<link>`
tags — no build step, preserving the zero-toolchain property. Purely
navigational; skip it if the earlier phases already made the file tractable.

## Phase 7 — Write the rule down

Add the golden rule and the token list to `AGENTS.md` so it does not erode.

---

## Verifying a phase

```bash
npm test                     # logic suite (node:test)
npm run test:layout          # Phase-0 suite, once it exists
npm run sync                 # copy www/ -> ios/App/App/public/
```

Compare against the baseline whenever a visual doubt arises:

```bash
git diff pre-css-refactor -- www/index.html
git restore --source=pre-css-refactor www/index.html   # full rollback
```

### Checking on a real simulator

Faster than it looks, and worth it at the end of each phase:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -derivedDataPath /tmp/dd build
xcrun simctl install <device-udid> /tmp/dd/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch  <device-udid> dev.ehutt.solitaire
xcrun simctl io <device-udid> screenshot shot.png
```

Hard-won details:

- Rotate with `osascript -e 'tell application "Simulator" to activate' -e 'tell
  application "System Events" to keystroke (ASCII character 28) using command down'`.
- **Landscape screenshots are stored in portrait pixel orientation.** Rotate the
  image before reading it; do not mistake that for a layout bug.
- To drive UI without tap injection, copy the `.app`, patch its
  `public/index.html` with a small probe script that calls `setCardStyle(…)` and
  clicks `#btnMenu`, and install the copy. Always reinstall the clean build
  afterwards. Snapshot and restore `localStorage` keys `patience.v1.stats` and
  `patience.v1.game` if the probe forces a win — do not disturb saved state.
- Measure alignment rather than eyeballing it: crop the header and compare ink
  bands with PIL/numpy, or read `getBoundingClientRect()` from a probe and render
  the numbers into a visible element.
