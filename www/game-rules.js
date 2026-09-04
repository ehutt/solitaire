/* global module */
(function installGameRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SolitaireRules = api;
})(typeof globalThis === "object" ? globalThis : this, function createGameRules() {
  "use strict";

  const isRed = (suit) => suit === 1 || suit === 2;
  const topOf = (items) => items[items.length - 1];

  function canFoundation(foundations, card) {
    return foundations[card.suit].length === card.rank - 1;
  }

  function canSafelyAutoFound(foundations, card) {
    if (!canFoundation(foundations, card)) return false;
    if (card.rank <= 2) return true;
    for (let suit = 0; suit < foundations.length; suit++) {
      if (isRed(suit) === isRed(card.suit)) continue;
      if (foundations[suit].length < card.rank - 1) return false;
    }
    return true;
  }

  function canTableau(tableau, card, column) {
    const pile = tableau[column];
    if (pile.length === 0) return card.rank === 13;
    const top = topOf(pile);
    return top.faceUp && isRed(top.suit) !== isRed(card.suit) && top.rank === card.rank + 1;
  }

  return Object.freeze({ isRed, topOf, canFoundation, canSafelyAutoFound, canTableau });
});
