// Shared description of what the computed-style snapshot covers.
//
// The layout suite asserts a handful of hand-picked invariants. This snapshot is
// the blunt instrument beside it: for every selector below, in every corner of
// the matrix, it records the computed values that decide how the app *looks* and
// the box it occupies. A token refactor is supposed to change none of them.

export const SNAPSHOT_VIEWPORTS = [
  { name: "iPhone portrait",  width: 390,  height: 844 },
  { name: "iPhone landscape", width: 844,  height: 390 },
  { name: "iPad portrait",    width: 820,  height: 1180 },
  { name: "iPad landscape",   width: 1180, height: 820 }
];

export const SNAPSHOT_STYLES = ["original", "crehore"];

// Properties worth pinning: anything a restyle would move.
export const PROPS = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
  "letterSpacing", "textTransform", "fontVariantNumeric", "textAlign",
  "color", "backgroundColor", "backgroundImage", "opacity",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderTopStyle", "borderTopColor", "borderRightColor", "borderBottomColor",
  "borderLeftColor", "borderRadius",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  // Margins are omitted deliberately: Chrome reports `margin:auto` as either 0px
  // or its used value depending on layout timing, which makes the snapshot flaky.
  // Every element here also records its rect, so margin effects are still pinned.
  "display", "flexDirection", "justifyContent", "alignItems", "gap",
  "minHeight", "minWidth", "width", "height",
  "position", "boxShadow", "textShadow", "transform",
  // Stroke is how a face with no bold weight gets its weight. It is paint, not
  // layout, so nothing else in this snapshot would move if it changed.
  "webkitTextStrokeWidth", "webkitTextStrokeColor"
];

// Selectors are grouped by the screen they live on, because each group needs a
// different bit of driving (open the sheet, open the stats page) before its
// elements are measurable.
export const GROUPS = {
  board: [
    "body", "#app", "#hud", ".brand", ".brand .pip", ".chips", ".chip",
    ".chip small", ".chip b", "#vTime", "#vMoves", "#vStreak",
    // Cards are dealt from a shuffle, so their boxes move run to run: pin two
    // specific cards (one per colour) and snapshot styling only — a leading "!"
    // means "skip the rect".
    "#board", ".ph", '.ph[data-slot="f0"]',
    '.card[data-id="0"]', '.card[data-id="0"] .face',
    '.card[data-id="20"]', '.card[data-id="20"] .front',
    // The index band and its rank: where the card's type actually lives. Rects
    // are skipped — these move with whatever pile the shuffle dealt them to.
    '!.card[data-id="20"] .ix', '!.card[data-id="20"] .ix i',
    '!.card[data-id="20"] .ix b',
    "#controls", "#btnDeal", "#btnHint", "#btnUndo", "#btnMenu",
    "#btnDeal .control-label", "#btnDeal .classic-icon", "#btnDeal .vintage-icon",
    "#toast"
  ],
  deal: [
    "#dealSheet", ".deal-sheet-header", ".deal-sheet-header h2", "#btnDealClose",
    ".deal-actions", ".deal-action", ".deal-action strong", ".deal-action span", "#dealBack"
  ],
  sheet: [
    "#sheet", ".pinned-header", ".title-row", "#sheet h3", ".title-row .icon-button",
    ".close-glyph", ".row", ".row .sub2", ".seg", ".seg button", "#segCardsOriginal",
    // Both halves of a pair, not just the selected one: a bug that lights both
    // is invisible if you only ever sample the half that is meant to be lit.
    "#segCardsCrehore", "#segD1", "#segD3",
    ".deal-mix", ".deal-mix-labels", ".deal-mix-stops", ".deal-mix input",
    "#btnRestart", ".record-preview", ".record-card", ".record-card strong",
    ".record-card span", ".record-link", "#sheetBack"
  ],
  stats: [
    "#statsPage", ".stats-page-inner", ".stats-header", ".stats-header h2",
    "#btnStatsClose", ".stats-tabs", ".stats-tabs button", ".stats-hero",
    ".stats-hero div", ".stats-hero b", ".stats-hero span", ".stats-group",
    ".stats-group h3", ".stats-detail-row", ".stats-detail-row b"
  ],
  panel: [
    "#overlay", ".panel", ".panel h2", ".panel .sub", ".statgrid", ".stat",
    ".stat b", ".stat span", ".panel .note", ".panel button", ".panel button.ghost"
  ]
};

// Pseudo-elements carry real design here (the sheet backdrop, the vintage rules).
export const PSEUDOS = [
  [".pinned-header", "::before"],
  [".chips", "::before"],
  [".chips", "::after"]
];

/** Collect the snapshot for the currently-rendered document. Runs in the page. */
export const collect = (args) => {
  const { props, selectors, pseudos } = args;
  const round = (n) => Math.round(n * 2) / 2;
  const out = {};
  const record = (key, el, pseudo) => {
    const cs = getComputedStyle(el, pseudo || undefined);
    const entry = {};
    for (const p of props) entry[p] = cs[p];
    if (!pseudo) {
      const r = el.getBoundingClientRect();
      entry._rect = [round(r.x), round(r.y), round(r.width), round(r.height)];
    }
    out[key] = entry;
  };
  for (const raw of selectors) {
    const skipRect = raw.startsWith("!");
    const sel = skipRect ? raw.slice(1) : raw;
    const el = document.querySelector(sel);
    if (!el) { out[raw] = "ABSENT"; continue }
    record(raw, el, null);
    if (skipRect) delete out[raw]._rect;
  }
  for (const [sel, pseudo] of pseudos || []) {
    const el = document.querySelector(sel);
    if (!el) { out[sel + pseudo] = "ABSENT"; continue }
    record(sel + pseudo, el, pseudo);
  }
  return out;
};
