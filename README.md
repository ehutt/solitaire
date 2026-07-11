# Better Solitaire ♠️

Klondike solitaire the way it should be. **Free forever. No ads. No in-app purchases. Just cards.**

First in the **"Better"** series: better versions of popular App Store apps that
people actually use, but which aren't free, or are ruined by ads and IAP.

Play it: open `index.html` in any browser (works great on a phone), or via the
published artifact link from the Claude Code session that built it.

## Features

- **Full Klondike** — draw-1 or draw-3, unlimited stock recycles, drag *and*
  tap-to-play (tap a card and it flies to the smartest legal spot)
- **True random shuffles** — every deal is a fresh shuffle; not every game is
  winnable, and that's part of the game
- **Daily streak 🔥** — win at least one game a day to keep it alive
- **Streak freezes ❄️** — every 10 wins earns a freeze (max 3, you start with 1);
  a missed day is quietly covered by a freeze at your next win
- **Move counter & timer**, personal bests (fastest win, fewest moves), win rate
- **Undo with a gentle cost** — your first undo each game is free; after that,
  each undo counts as a move (the move count never goes down)
- **Hints** (`h`), space bar to draw, ⌘Z to undo
- **Auto-finish** — a brass ✨ Finish button appears when the endgame is forced
- **Win celebration** — the classic trailing card cascade (an homage to the
  Windows original), painted on canvas, followed by a stats card
- **Deal animation, 3D card flips, restart-same-deal**, and full persistence —
  close the tab mid-game and it resumes exactly where you left off
- Respects `prefers-reduced-motion`

## Design

A midnight card room: deep pine felt `#0F2E25`, warm paper cards `#FAF5E9`,
carmine `#BF3B33` and ink `#26282E` suits, brass `#D9A648` reserved for the
streak flame, hints, and celebration. Card faces are typographic — real pip
layouts, Palatino/Iowan serif indices — in the playing-card tradition.

## Architecture

One self-contained file, zero dependencies:

- `index.html` — markup, CSS, and ~700 lines of vanilla JS
  - State: `cards[52]` + piles `{stock, waste, f[4], t[7]}`
  - Rendering: absolutely-positioned card divs moved with `transform`
    (layout is a pure function of state + board size)
  - Undo: full-state snapshots (id arrays + face flags), capped at 400
  - Persistence: `localStorage` (`patience.v1.game` / `.stats` / `.settings` —
    key names kept stable across the rename so no one loses a streak)
  - Streak math: local day numbers, freezes consumed at win-reconciliation

## Road to the App Store

The game is already touch-first and offline-capable. To ship as a real iOS app:

1. **PWA pass** — add a `manifest.json` + service worker (installable, offline)
2. **Wrap with Capacitor** (`npm create @capacitor/app`) — WKWebView shell,
   no code changes needed; add haptics via `@capacitor/haptics` on card drops
3. **App Store polish** — app icon (the brass ♠ on felt), launch screen,
   Game Center leaderboards for streak/best-time if desired
4. Price: **free**, no IAP, no ads. That's the whole point.

## Ideas for v2

- Daily deal — everyone plays the same shuffle, one attempt per day
- Subtle sound design (felt thump, paper slide) via WebAudio
- Left-hand mode (mirror the top row)
- Spider & FreeCell as sibling tables in the same card room
- More "Better" apps: the series continues
