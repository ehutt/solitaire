/* global module */
(function installCopy(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SolitaireCopy = api;
})(typeof globalThis === "object" ? globalThis : this, function createCopy() {
  "use strict";

  const text = Object.freeze({
    brandTitle: "Better Solitaire",
    time: "Time",
    moves: "Moves",
    streak: "Streak",
    deal: "Deal",
    hint: "Hint",
    undo: "Undo",
    winFallbackTitle: "You won!",
    winFallbackSubtitle: "Beautifully played.",
    scoreTime: "time",
    scoreMoves: "moves",
    scoreStreak: "streak",
    newDeal: "New deal",
    restartDeal: "Restart deal",
    admireCascade: "Admire the cascade.",
    newDealDescription: "Different shuffle. Ends the current game.",
    restartDealDescription: "Same shuffle, from the beginning.",
    settingsTitle: "Game Settings",
    tableSection: "Table",
    cardStyle: "Card style",
    cardStyleDescription: "Change the theme without restarting your deal",
    classic: "Classic",
    vintage: "Vintage",
    draw: "Draw",
    drawDescription: "Cards drawn from the stock at a time",
    one: "One",
    three: "Three",
    playSection: "Play",
    autoMove: "Auto-move",
    autoMoveDescription: "Send exposed cards to the foundation automatically",
    on: "On",
    off: "Off",
    shuffleSound: "Shuffle sound",
    shuffleSoundDescription: "Plays when a new deal starts.",
    muted: "Muted",
    haptics: "Haptics",
    hapticsDescription: "Vibration feedback for moves and wins",
    dealSection: "Deal",
    dealMix: "Deal mix",
    random: "Random",
    winnable: "Winnable",
    restartThisDeal: "Restart this deal",
    restartThisDealDescription: "Same shuffle, from the top",
    restart: "Restart",
    recordSection: "Record",
    yourRecord: "Your record",
    detailedStats: "View detailed stats",
    settingsNote:
      "Better Solitaire — no ads, ever. ♣︎<br>Win daily to grow your streak.<br>Every 10 wins earns a streak freeze (maximum 3).<br>Your first undo each game is free; after that, undos count as a move.",
    statsTitle: "Player Stats",
    drawOne: "Draw One",
    drawThree: "Draw Three",
    drawFromStock: "Draw from the stock",
    recycleStock: "Tap the empty slot to recycle ↻",
    tryThisFirst: "Try this first. It opens another move.",
    noUsefulMoves: "No useful moves left",
    noMoves: "No moves left",
    goBackAndUndo: "Go back and undo",
    buriedCard: "A playable card is buried",
    buriedCardDescription: "Switch to draw one to reach the card without restarting this deal.",
    switchToDrawOne: "Switch to draw one",
    keepDrawThree: "Keep draw three",
    switchedToDrawOne: "Switched to draw one",
    bestTime: "Best time",
    fewestMoves: "Fewest moves",
    freezeEarned: "Streak freeze earned",
    streakSecured: "Your streak is secured.",
    gamesWon: "Games won",
    totalGames: "Total games",
    winRate: "Win rate",
    winningMoves: "Winning moves",
    winningTime: "Winning time",
    shortest: "Shortest",
    longest: "Longest",
    average: "Average",
    cleanWins: "Clean wins",
    withoutUndo: "Without undo",
    withoutHints: "Without hints",
    consecutiveWins: "Consecutive wins",
    current: "Current",
    currentStreak: "current streak",
    streakFreezes: "streak freezes",
    wins: "wins",
    played: "played",
  });

  const winPhrases = Object.freeze([
    "Beautifully played.",
    "Nicely done.",
    "Every card in its place.",
    "Solitaire, but better.",
    "The cards fell your way.",
    "Well played.",
    "Not a card out of place.",
    "That one came together.",
    "All cards accounted for.",
    "You played your cards right.",
    "No cards left behind.",
    "No card left unturned.",
    "Aces in their places.",
  ]);

  function apply(document) {
    for (const element of document.querySelectorAll("[data-copy]")) {
      element.textContent = text[element.dataset.copy];
    }
    for (const element of document.querySelectorAll("[data-copy-prefix]")) {
      element.prepend(text[element.dataset.copyPrefix]);
    }
    for (const element of document.querySelectorAll("[data-copy-html]")) {
      element.innerHTML = text[element.dataset.copyHtml];
    }
  }

  function dealMixText(percent) {
    if (percent === 0) return { label: "Random", summary: "Every deal is shuffled randomly" };
    if (percent === 100)
      return { label: "Winnable", summary: "Every deal has a verified solution" };
    return {
      label: `${percent}% winnable`,
      summary: `${percent}% verified, ${100 - percent}% random`,
    };
  }

  function stuckTitle(onlyShuffles) {
    return onlyShuffles ? "No useful moves left" : "No moves left";
  }

  function winTitle(result) {
    if (result.dailyMilestone) return `${result.dailyMilestone}th win of the day!`;
    if (result.firstWinToday) return "First win of the day!";
    return "You won!";
  }

  function cardStyleToast(cardStyle) {
    return cardStyle === "original" ? "Classic cards" : "Vintage cards";
  }

  return Object.freeze({
    text,
    winPhrases,
    apply,
    dealMixText,
    stuckTitle,
    winTitle,
    cardStyleToast,
  });
});
