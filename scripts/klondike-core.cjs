"use strict";

const SUIT_COUNT = 4;
const FOUNDATION_SIZE = 13;

const suitOf = (id) => Math.floor(id / 13);
const rankOf = (id) => (id % 13) + 1;
const isRedSuit = (suit) => suit === 1 || suit === 2;

function seededRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function seededShuffle(seed) {
  const random = seededRandom(seed);
  const order = Array.from({ length: 52 }, (_, id) => id);
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

function createState(order) {
  if (
    !Array.isArray(order) ||
    order.length !== 52 ||
    new Set(order).size !== 52 ||
    order.some((id) => !Number.isInteger(id) || id < 0 || id > 51)
  ) {
    throw new Error("A deal must be a permutation of card ids 0 through 51");
  }

  const tableau = Array.from({ length: 7 }, () => []);
  const down = [];
  let index = 0;
  for (let column = 0; column < tableau.length; column++) {
    tableau[column] = order.slice(index, index + column + 1);
    down[column] = column;
    index += column + 1;
  }
  return {
    t: tableau,
    down,
    f: Array(SUIT_COUNT).fill(0),
    stock: order.slice(index),
    waste: [],
  };
}

function cloneState(state) {
  return {
    t: state.t.map((pile) => pile.slice()),
    down: state.down.slice(),
    f: state.f.slice(),
    stock: state.stock.slice(),
    waste: state.waste.slice(),
  };
}

function canFoundation(state, card) {
  return state.f[suitOf(card)] === rankOf(card) - 1;
}

function canTableau(state, card, column) {
  const pile = state.t[column];
  if (pile.length === 0) return rankOf(card) === 13;
  const top = pile[pile.length - 1];
  return (
    isRedSuit(suitOf(top)) !== isRedSuit(suitOf(card)) &&
    rankOf(top) === rankOf(card) + 1
  );
}

function isBuiltRun(cards) {
  for (let index = 1; index < cards.length; index++) {
    const below = cards[index - 1];
    const above = cards[index];
    if (
      isRedSuit(suitOf(below)) === isRedSuit(suitOf(above)) ||
      rankOf(below) !== rankOf(above) + 1
    ) {
      return false;
    }
  }
  return true;
}

function revealTableauTop(state, column) {
  if (
    state.t[column].length > 0 &&
    state.t[column].length === state.down[column] &&
    state.down[column] > 0
  ) {
    state.down[column]--;
  }
}

function applyAction(input, action, drawCount, validate = true) {
  const state = cloneState(input);
  const kind = action[0];

  if (kind === "d") {
    if (state.stock.length === 0) {
      if (validate && state.waste.length === 0) throw new Error("Cannot draw from empty stock and waste");
      while (state.waste.length) state.stock.push(state.waste.pop());
    } else {
      for (let index = 0; index < drawCount && state.stock.length; index++) {
        state.waste.push(state.stock.pop());
      }
    }
    return state;
  }

  let cards;
  if (kind === "w") {
    if (validate && state.waste.length === 0) throw new Error("Cannot move from an empty waste");
    cards = [state.waste.pop()];
  } else if (kind === "t") {
    const source = action[1];
    const start = action[2];
    const pile = state.t[source];
    if (
      validate &&
      (
        source < 0 ||
        source > 6 ||
        start < state.down[source] ||
        start >= pile.length ||
        !isBuiltRun(pile.slice(start))
      )
    ) {
      throw new Error(`Invalid tableau source ${source}:${start}`);
    }
    cards = pile.splice(start);
    revealTableauTop(state, source);
  } else {
    throw new Error(`Unknown certificate action: ${JSON.stringify(action)}`);
  }

  const destinationKind = kind === "w" ? action[1] : action[3];
  const destination = kind === "w" ? action[2] : action[4];
  const card = cards[0];
  if (destinationKind === "f") {
    if (
      validate &&
      (cards.length !== 1 || destination !== suitOf(card) || !canFoundation(state, card))
    ) {
      throw new Error(`Invalid foundation move: ${JSON.stringify(action)}`);
    }
    state.f[destination]++;
  } else if (destinationKind === "t") {
    if (validate && !canTableau(state, card, destination)) {
      throw new Error(`Invalid tableau destination: ${JSON.stringify(action)}`);
    }
    state.t[destination].push(...cards);
  } else {
    throw new Error(`Unknown destination: ${JSON.stringify(action)}`);
  }
  return state;
}

function isWon(state) {
  return state.f.every((height) => height === FOUNDATION_SIZE);
}

function isSafeFoundationMove(state, card) {
  const rank = rankOf(card);
  if (rank <= 2) return true;
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    if (isRedSuit(suit) === isRedSuit(suitOf(card))) continue;
    if (state.f[suit] < rank - 1) return false;
  }
  return true;
}

function actionScore(state, action) {
  if (action[0] === "d") return 10;
  const fromTableau = action[0] === "t";
  const destinationKind = fromTableau ? action[3] : action[1];
  const card = fromTableau ? state.t[action[1]][action[2]] : state.waste[state.waste.length - 1];
  let score = destinationKind === "f" ? 700 : action[0] === "w" ? 520 : 360;
  if (destinationKind === "f" && isSafeFoundationMove(state, card)) score += 500;
  if (fromTableau) {
    const source = action[1];
    const start = action[2];
    if (state.down[source] > 0 && start === state.down[source]) score += 800;
    if (start === 0) score += 120;
  }
  return score;
}

function legalActions(state) {
  const actions = [];
  const waste = state.waste[state.waste.length - 1];

  if (waste !== undefined) {
    if (canFoundation(state, waste)) actions.push(["w", "f", suitOf(waste)]);
    for (let destination = 0; destination < 7; destination++) {
      if (canTableau(state, waste, destination)) actions.push(["w", "t", destination]);
    }
  }

  for (let source = 0; source < 7; source++) {
    const pile = state.t[source];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (pile.length - 1 >= state.down[source] && canFoundation(state, top)) {
      actions.push(["t", source, pile.length - 1, "f", suitOf(top)]);
    }
    for (let start = state.down[source]; start < pile.length; start++) {
      const card = pile[start];
      for (let destination = 0; destination < 7; destination++) {
        if (destination === source || !canTableau(state, card, destination)) continue;
        if (
          state.t[destination].length === 0 &&
          start === 0 &&
          state.down[source] === 0
        ) {
          continue;
        }
        actions.push(["t", source, start, "t", destination]);
      }
    }
  }

  if (state.stock.length || state.waste.length) actions.push(["d"]);
  return actions.sort((left, right) => actionScore(state, right) - actionScore(state, left));
}

function stateKey(state) {
  return [
    state.f.join(""),
    state.down.join(","),
    state.t.map((pile) => pile.join(".")).join("/"),
    state.stock.join("."),
    state.waste.join("."),
  ].join("|");
}

function solve(order, drawCount, options = {}) {
  if (drawCount !== 1 && drawCount !== 3) throw new Error("drawCount must be 1 or 3");
  const nodeLimit = options.nodeLimit ?? 750_000;
  const timeLimitMs = options.timeLimitMs ?? 5_000;
  const maxDepth = options.maxDepth ?? 350;
  const startedAt = Date.now();
  const seen = new Set();
  const path = [];
  let nodes = 0;
  let cutoff = null;

  function visit(state, depth) {
    if (isWon(state)) return true;
    if (depth >= maxDepth) return false;
    if (++nodes > nodeLimit) {
      cutoff = "node-limit";
      return false;
    }
    if ((nodes & 2047) === 0 && Date.now() - startedAt > timeLimitMs) {
      cutoff = "time-limit";
      return false;
    }

    const key = stateKey(state);
    if (seen.has(key)) return false;
    seen.add(key);

    for (const action of legalActions(state)) {
      const next = applyAction(state, action, drawCount, false);
      path.push(action);
      if (visit(next, depth + 1)) return true;
      path.pop();
      if (cutoff) return false;
    }
    return false;
  }

  // Solving from a supplied mid-game position, not just a fresh deal, is what
  // lets a caller ask "is this table still winnable?" of any state.
  const solved = visit(options.state ? cloneState(options.state) : createState(order), 0);
  return {
    solved,
    solution: solved ? path.slice() : null,
    nodes,
    elapsedMs: Date.now() - startedAt,
    cutoff,
    states: seen.size,
  };
}

function replay(order, drawCount, solution) {
  let state = createState(order);
  for (const action of solution) state = applyAction(state, action, drawCount, true);
  return { won: isWon(state), state };
}

module.exports = {
  applyAction,
  createState,
  isWon,
  legalActions,
  replay,
  seededShuffle,
  solve,
};
