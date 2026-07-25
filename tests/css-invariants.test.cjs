// Invariants of the stylesheet's architecture.
//
// These replace the literal-text assertions that used to restate declarations
// ("`.row{padding:17px 0`"): they broke on every restyle and caught nothing.
// Each rule below is a whole category of bug instead — and each checker is
// itself tested against a deliberately broken sample, so none of them is a net
// that has never been seen to catch anything.
//
// The architecture, in one line: a component rule never appears inside a theme
// block or a media query. Components read var(--token); themes and breakpoints
// set token *values*.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const html = fs.readFileSync(new URL("../www/index.html", `file://${__filename}`), "utf8");
const css = html.match(/<style>([^]*?)<\/style>/)[1].replace(/\/\*[^]*?\*\//g, "");

/** Every rule in the stylesheet as {selector, declarations[]}. Flat: at-rule
 *  wrappers vanish, which is what we want — a rule inside a media query is
 *  still a rule, and the checks below care about the selector's shape. */
function rules(source) {
  const out = [];
  for (const [, selector, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = body
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.includes(":"))
      .map((d) => {
        const at = d.indexOf(":");
        return { property: d.slice(0, at).trim(), value: d.slice(at + 1).trim() };
      });
    out.push({ selector: selector.trim(), declarations });
  }
  return out;
}

const isTheme = (selector) => selector.includes('data-card-style="');
const isToken = (property) => property.startsWith("--");

// ---- the checkers -------------------------------------------------------

/** A theme may choose values; it may not size type. */
function themesSettingType(source) {
  return themeDeclarations(source, /^font-size$/);
}

/** Spacing is the part of the theme layer this refactor did not reach: each
 *  card style still shapes its own chrome (the Vintage rules, the club-rail
 *  pills, the HUD bands) with its own padding and margins. That is real design,
 *  not a token substitution — but it is also where the next specificity
 *  accident would come from, so the count is ratcheted rather than ignored. */
function themesSettingSpacing(source) {
  return themeDeclarations(source, /^(padding|margin)(-|$)/);
}

function themeDeclarations(source, property) {
  return rules(source)
    .filter((r) => isTheme(r.selector))
    .flatMap((r) => r.declarations
      .filter((d) => property.test(d.property))
      .map((d) => `${r.selector} { ${d.property} }`));
}

/** Sizes come from the type scale — or from the element's own box, for the
 *  card-face ratios, which are geometry rather than typography. */
function fontSizesOffTheScale(source) {
  const intrinsic = /^(calc\(var\(--cw\)|[\d.]+em$|1em$)/;
  return rules(source)
    .flatMap((r) => r.declarations
      .filter((d) => d.property === "font-size")
      .filter((d) => !d.value.includes("var(--type-") && !intrinsic.test(d.value))
      .map((d) => `${r.selector} { font-size: ${d.value} }`));
}

/** Colours are named once, in a token declaration, and read from there. */
function hexOutsideTokens(source) {
  return rules(source)
    .flatMap((r) => r.declarations
      .filter((d) => !isToken(d.property) && /#[0-9a-fA-F]{3,8}\b/.test(d.value))
      .map((d) => `${r.selector} { ${d.property} }`));
}

/** Shared tokens are declared on the document, the body, or a theme — never
 *  scattered onto components, where they would inherit into places nobody
 *  looked. Component-local knobs (--pinned-header-gap, --control-rail) are
 *  deliberately declared on the component that owns them. */
const SHARED = /^--(type|face|surface|chrome-ink|paper|rule|ink|chip|control-ink|seg|confirm|badge|ghost|focus|slider|card-back)/;
function sharedTokensDeclaredOffRoot(source) {
  const allowed = /^(:root|body(\[[^\]]*\])?)$/;
  return rules(source)
    .filter((r) => r.declarations.some((d) => isToken(d.property) && SHARED.test(d.property)))
    .filter((r) => !r.selector.split(",").every((s) => allowed.test(s.trim())))
    .map((r) => r.selector);
}

// ---- the invariants -----------------------------------------------------

test("no theme-scoped rule sets font-size", () => {
  assert.deepEqual(themesSettingType(css), []);
});

test("theme-scoped spacing does not grow", () => {
  // A ratchet, not a target: lower it when a theme's spacing moves to a token,
  // and do not raise it. Every entry here is a rule that could out-rank a
  // breakpoint by selector shape alone.
  assert.ok(
    themesSettingSpacing(css).length <= 43,
    `theme-scoped padding/margin declarations: ${themesSettingSpacing(css).length}`,
  );
});

test("every font-size reads the type scale or the element's own box", () => {
  assert.deepEqual(fontSizesOffTheScale(css), []);
});

test("no colour literal appears outside a token declaration", () => {
  assert.deepEqual(hexOutsideTokens(css), []);
});

test("shared tokens are declared on :root, body, or a theme — nowhere else", () => {
  assert.deepEqual(sharedTokensDeclaredOffRoot(css), []);
});

// ---- and the nets are known to catch things -----------------------------

test("each invariant fails on a sample that violates it", () => {
  assert.deepEqual(
    themesSettingType('body[data-card-style="original"] .row{font-size:2rem}'),
    ['body[data-card-style="original"] .row { font-size }'],
  );
  assert.deepEqual(
    themesSettingSpacing('body[data-card-style="crehore"] .row{padding-top:4px}'),
    ['body[data-card-style="crehore"] .row { padding-top }'],
  );
  assert.deepEqual(fontSizesOffTheScale(".row{font-size:1.08rem}"), [".row { font-size: 1.08rem }"]);
  assert.deepEqual(fontSizesOffTheScale(".ix{font-size:2.7em}"), [], "card ratios are allowed");
  assert.deepEqual(fontSizesOffTheScale(".row{font-size:var(--type-row)}"), []);
  assert.deepEqual(hexOutsideTokens(".panel{color:#123456}"), [".panel { color }"]);
  assert.deepEqual(hexOutsideTokens(":root{--paper:#123456}"), []);
  assert.deepEqual(sharedTokensDeclaredOffRoot(".chip{--type-chip:1rem}"), [".chip"]);
  assert.deepEqual(sharedTokensDeclaredOffRoot('body[data-card-style="crehore"]{--type-chip:1rem}'), []);
  assert.deepEqual(sharedTokensDeclaredOffRoot(".pinned-header{--pinned-header-gap:12px}"), [],
    "a component may own its own knob");
});
