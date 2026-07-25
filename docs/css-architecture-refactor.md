# CSS architecture refactor — plan

**Status:** not started. Baseline tag: `pre-css-refactor` (commit `f8eb8fc`).
**Goal:** make font, size, theme, and layout changes cheap and safe. Behaviour and
visuals must not change — this is a structural refactor, verified by comparison
against the baseline tag.

**This document is scaffolding. Delete it in the final commit** (see Stage 3).

---

## Why

Restyling this app costs far more than it should, and the cost is structural.
Measured against `www/index.html` at the baseline tag:

| | count |
|---|---|
| CSS lines (inline in `index.html`) | 1,037 |
| Rules scoped to a theme (`body[data-card-style=…]`) | 164 |
| …that set `font-size` | 46 |
| …that only swap colour/border/background | 61 |
| `font-size` declarations | 116 |
| Hardcoded px/rem literals | 373 |
| Hex colour literals | 67 |
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
   media queries. The 35 existing custom properties cover colour only.
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
  `clamp()` + a layout harness deliver the benefit without giving that up.
- **Do not restyle anything.** If a step changes a rendered pixel, that is a bug
  in the step, not an improvement. Deliberate visual changes are separate commits,
  after the refactor.
- Playwright (Stage 1) is a **devDependency only** — it never ships in the app
  bundle and does not touch the runtime build.

---

# How to work

**The three stages below are resumption points, not approval gates.** Do not stop
between them to ask permission. If your context budget allows, run straight
through; the boundaries exist so that a session which *does* run out leaves the
repo in a clean, bisectable state rather than a half-converted one.

**Within a stage, grind.** Each stage lists sub-steps. Do them in order, commit
each one, run the oracle after each, tick the checklist. Do not report back
between sub-steps.

### The oracle

After Stage 1 exists, `npm run test:layout` is the source of truth for "did I
change how this looks". Run it after **every** sub-step. It is fast; use it
freely instead of reasoning about whether a change was safe.

```bash
npm test              # logic suite (node:test) — must stay green throughout
npm run test:layout   # visual/layout suite — the refactor's oracle
npm run sync          # copy www/ -> ios/App/App/public/ (gitignored; no commit noise)
```

### Context economy

Screenshots are the single most expensive thing you can put in context, and the
reason Stage 1 comes first is that it converts image inspection into cheap text
assertions. Accordingly:

- **Do not screenshot to verify a sub-step.** That is the layout suite's job.
  Reserve simulator screenshots for the end of a stage, and take at most a few.
- **Do not re-read `www/index.html` in full.** It is ~2,500 lines. Read it once
  at the start of a stage if you must, then use `grep -n` to jump to sections.
- **Prefer `Edit` over `Write`** on `index.html` — never rewrite the whole file.

### If you run low on context

Stop at the next committed sub-step. Tick the checklist in this file, commit that
too, and state plainly where you stopped and what remains. Do not start a sub-step
you cannot finish and verify.

---

# Stage 1 — Safety net

Self-contained; touches no CSS. Everything after this depends on it.

Add a headless layout suite that loads `www/index.html` directly (no simulator,
no build) and asserts what only layout knows, across the matrix that currently
has to be checked by hand: **2 card styles × {iPhone, iPad} × {portrait,
landscape}**.

Set the theme per-run by seeding `localStorage` (`patience.v1.settings`, key
`cardStyle`: `"original"` | `"crehore"`) before load, or by calling
`setCardStyle(…)` after load.

Assertions — all verified by hand in the session that produced this plan, so they
are known to hold at the baseline:

- [x] Close-button centre within 3 CSS px of the settings title's cap band. Cap
      band = ink top → baseline; a line box's middle sits *below* it, because
      descender space counts even when glyphs barely use it. Get the ink box from
      `canvas` `TextMetrics.actualBoundingBoxAscent`, not from `getBoundingClientRect`.
- [x] Same for the stats page header.
- [x] HUD chip left edges byte-identical with `0:00 / 0` and with `89:28 / 8888`.
- [x] No horizontal overflow of `#sheet` or `body` at any viewport.
- [x] Sticky sheet header stays opaque and pinned with `#sheet` scrolled 420px.
- [x] Every foundation and tableau slot on-screen after a deal, all four viewports.

Files: `tests/layout.spec.mjs`, `playwright.config.mjs`, `npm run test:layout`
script. Leave `npm test` (node:test) alone — it covers logic.

### Acceptance

- [x] Suite green at baseline.
- [x] **Prove the net catches its bug:** temporarily delete the
      `body[data-card-style="original"] #sheet h3` / `crehore` size rule from the
      tablet block, confirm the iPad title assertion *fails*, then restore it.
      A net you have not seen fail is not a net.
- [x] Committed.

---

# Stage 2 — The token refactor

The bulk of the work. Long but mechanical, and the oracle makes each step cheap
to verify. Commit each sub-step.

### 2a — Typography tokens

Semantic scale in `:root`; route all 116 `font-size` declarations through it.

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

Work section by section, committing each: chips/HUD → controls → sheet → stats
page → win panel → cards. Themes set token *values* only (e.g. vintage's display
face and its slightly larger optical size); delete the 46 theme rules that set
`font-size` as they are absorbed.

- [ ] chips/HUD  - [ ] controls  - [ ] sheet  - [ ] stats  - [ ] panel  - [ ] cards
- [ ] `grep -c 'body\[data-card-style=[^{]*{[^}]*font-size'` on the CSS returns 0

### 2b — Surface and ink tokens

Same treatment for the 61 colour-only theme rules and the 67 hex literals. Define
`--surface-sheet`, `--surface-sheet-top`, `--ink`, `--ink-muted`, `--rule`,
`--accent`; set once per theme; components reference only those.

This kills hardcoded pairs like `.sheet-header::before{background:#123b2e}` plus
its vintage override → one `background:var(--surface-sheet-top)`.

**Keep genuinely different *design* as theme rules.** The vintage double rules,
felt texture, and letterpress treatments are not token substitutions; leave them
explicit. The target is ~60 theme rules, not zero.

- [ ] Theme-scoped rule count down from 164 to roughly 60
- [ ] No hex literal outside the token definitions

### 2c — Fluid scale

Convert the type tokens to `clamp(min, preferred, max)` (`.brand` already does
this). Most of the tablet block's typography then disappears — "bigger on iPad"
becomes one number.

Keep discrete tokens where a jump is deliberate: tap targets and control sizes
should step at the breakpoint, not scale continuously.

**Watch:** `vw` changes on rotation and this app rotates. iPad landscape has the
least vertical room at current sizes — check it explicitly.

- [ ] Tablet media block contains no `font-size` declarations
- [ ] Media-query count reduced

### 2d — Layout primitives

Extract the patterns that recur so the next page gets them free:

- `.title-row` — centred title + trailing icon action, aligned to the title's cap
  band. **Must centre against a box the action button cannot stretch**; see
  `.sheet-title-row` for the working version and why the naive version fails.
- `.icon-button` — borderless glyph action with a full tap target. SVG mark, not a
  text glyph: a text `✕` sits ~10px low inside its own line box at title sizes.
- `.pinned-header` — sticky header with a full-bleed backdrop that survives
  whatever padding the breakpoint applies.

Apply to both the settings sheet and the stats page, which now solve this twice.

- [ ] Sheet and stats headers share one rule set

### Stage 2 acceptance

- [ ] `npm test` and `npm run test:layout` green
- [ ] `git diff pre-css-refactor -- www/index.html` reviewed: no intended visual change
- [ ] One simulator pass (iPhone + iPad, both styles, both orientations) — this is
      the one place screenshots are worth their context cost

---

# Stage 3 — Consolidate and land

### 3a — Rebalance the tests

- Delete literal-text assertions that merely restate CSS (e.g.
  `.row{padding:17px 0;font-size:1.3rem`). They cost churn and catch nothing.
- Add *invariant* assertions, which are cheap and catch whole categories:
  - [ ] no `body[data-card-style=…]` rule sets `font-size`, `padding`, or `margin`
  - [ ] every component `font-size` is a `var(--type-*)`
  - [ ] no hex colour outside the token block
  - [ ] verify each fails when you break it on purpose
- Keep all behavioural/logic tests unchanged.
- [ ] Literal-text assertions under 10% of the suite

### 3b — Optional: split the stylesheet

Only if the file still feels unwieldy. Extract to `www/styles/` (`tokens.css`,
`base.css`, `components/*.css`, `themes/*.css`) via plain `<link>` tags — no build
step. Purely navigational; **skip it** if Stage 2 already made the file tractable.

### 3c — Write the rules down, then delete this plan

The durable knowledge must outlive this document:

- [ ] Add to `AGENTS.md`: the golden rule, the token list, and the note that
      themes/breakpoints set token values only.
- [ ] `git rm docs/css-architecture-refactor.md` — this file is scaffolding and
      should not survive the work it describes.
- [ ] Update the existing `AGENTS.md` specificity-gotcha bullet, which points at
      this file: replace it with the rule itself.

### 3d — Land it

- [ ] `npm test` + `npm run test:layout` green
- [ ] Merge to `main` (see Git below)
- [ ] Tag `post-css-refactor`, push with `--follow-tags`

---

# Git

- **Branch:** work on `css-tokens`, cut from `main`. Do not commit the refactor
  directly to `main` — `main` stays on the known-good baseline until Stage 3.
  ```bash
  git switch -c css-tokens main
  ```
- **Commit every sub-step**, with a message saying what moved and why — not
  "refactor CSS". Small commits are what make a visual regression bisectable,
  which is the entire safety story for a change with no runtime errors.
- **Never force-push, never rebase `main`, never move or delete the
  `pre-css-refactor` tag.** It is the restore point.
- `npm run sync` writes to `ios/App/App/public/`, which is gitignored — it will
  not dirty your status.
- **Rollback**, at any point:
  ```bash
  git diff pre-css-refactor -- www/index.html          # what drifted
  git restore --source=pre-css-refactor www/index.html # full revert of the stylesheet
  ```
- **Landing:** fast-forward or `--no-ff` merge into `main`, whichever the user
  prefers; ask if unsure. Then push `main` and the `post-css-refactor` tag.
- Do not open a PR unless asked — this repo's history is linear commits on `main`.

---

# Appendix — simulator verification

Only needed at the end of a stage. `npm run test:layout` covers the rest.

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -derivedDataPath /tmp/dd build
xcrun simctl install <device-udid> /tmp/dd/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch  <device-udid> dev.ehutt.solitaire
xcrun simctl io <device-udid> screenshot shot.png
```

Hard-won details:

- Rotate: `osascript -e 'tell application "Simulator" to activate' -e 'tell
  application "System Events" to keystroke (ASCII character 28) using command down'`
- **Landscape screenshots are stored in portrait pixel orientation.** Rotate the
  image before reading it; do not mistake that for a layout bug.
- To drive UI without tap injection: copy the `.app`, patch its
  `public/index.html` with a probe script that calls `setCardStyle(…)` and clicks
  `#btnMenu`, install the copy, then **reinstall the clean build afterwards**.
- If a probe forces a win, snapshot and restore `localStorage` keys
  `patience.v1.stats` and `patience.v1.game`. Do not disturb saved state.
- Measure, don't eyeball: crop the header and compare ink bands with PIL/numpy, or
  read geometry from a probe and render the numbers into a visible element.
