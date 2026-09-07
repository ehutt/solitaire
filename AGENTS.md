# Better Solitaire

- This is a Capacitor iOS app whose UI and game logic live primarily in `www/index.html`.
- Edit files under `www/`, not the generated copy under `ios/App/App/public/`; run `npm run sync` after web changes.
- Native iOS configuration lives under `ios/App/App/`. Build from `ios/App/App.xcodeproj` with the `App` scheme.
- Preserve the app's saved game/settings when diagnosing issues; do not clear simulator or WebView data unless explicitly asked.
- Verify UI changes in both portrait and landscape on an iPhone simulator. Landscape must account for safe-area/notch insets, the side control rail, and unusually long tableau piles.
- Simulator screenshots taken while landscape may be stored with portrait pixel orientation; rotate the image for inspection rather than mistaking that for an app-layout bug.
- A successful JavaScript parse does not catch runtime layout errors. After changes, launch the app and confirm a full deal renders, New starts another deal, and controls remain responsive.

## CSS architecture

**A component rule never appears inside a theme block or a media query.**
Components read `var(--token)`. Themes set token *values*. Breakpoints set token
*values*. One declaration per property per component — so there is nothing for a
stray selector to out-rank.

- Tokens are declared in three places only: `:root` (defaults), `body` (defaults
  that derive from themed palette variables), and `body[data-card-style="…"]`
  (a theme's values). Breakpoints restate them on `body`; where a breakpoint must
  beat both themes, it uses `body[data-card-style]`, which ties them on
  specificity and wins on source order. A component may own a local knob
  (`--pinned-header-gap`, `--control-rail`) declared on itself.
- The families: `--type-*` (every font-size), `--face-*` (type faces by role),
  `--surface-*` and `--paper-*` (backgrounds and the ink on them), `--chrome-*`
  (ink on the felt-side chrome), `--rule` (hairlines), plus small
  component-specific ones (`--chip-ink`, `--control-ink`, `--seg-on-*`,
  `--confirm-*`, `--focus-ring`). Colour literals live only in these
  declarations.
- Classic uses Limelight for the marquee title (`--face-display`), Marcellus for
  the interface, and Apple's New York for card ranks. New York is intentionally
  left at its natural width; the portrait waste fan reveals 46% of each card,
  while the two-character 10 gets a smaller optical size. Non-Apple platforms
  fall back through `ui-serif`, Iowan Old Style, and Georgia. The bundled faces
  do not carry pip or chess glyphs, so suits and courts fall back to `--serif`.
- The portrait draw-three waste fan advances by 40% of a card width. The 10
  keeps the same height as every other New York rank; the next card may overlap
  part of its second digit, but it must remain recognizable.
- Classic suit glyphs target 90% of the New York rank's apparent height on
  WebKit. Their 1.12em layout box is optically scaled 1.18, or 1.2 for the
  slightly shorter spade and club. Every suit is centered in the same .72em
  cell, so the wider club does not shift left and no suit collides with 10.
- Why: theme selectors like `body[data-card-style="…"] #sheet h3` (1,1,2)
  silently out-rank a responsive block's `#sheet h3` (1,0,1). That shipped —
  the iPad rendered phone-sized sheet titles for months and nothing flagged it.
  Tokens make the whole class of bug unexpressible.
- Exceptions, each commented where it lives: card-face sizes are ratios of the
  card's own em box (`.ix`, `.mid`), and theme blocks still own their chrome's
  padding and margins.

## Verifying a UI change

- `npm test` — logic plus the stylesheet's architecture invariants.
- `npm run test:layout` — Playwright. Asserts rendered geometry (cap-band
  alignment, overflow, sticky headers, slot visibility) and compares every
  computed style and box against `tests/computed-styles.baseline.json`, across
  2 card styles x {iPhone, iPad} x {portrait, landscape}.
- A change that alters the rendering must update that baseline in the same
  commit (`npm run snapshot:baseline`); review the JSON diff as the change.
- `node scripts/compare-to-baseline.mjs <other-www-dir> [chromium|webkit]`
  renders two checkouts side by side and lists every difference — the cheapest
  way to prove a refactor changed nothing. WebKit is the engine iOS ships.
