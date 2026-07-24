"use strict";

(function installDealEngine(global) {
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

  function selectWinnableDeal(corpus, random = Math.random, previousSeed = null) {
    if (
      !corpus ||
      corpus.schemaVersion !== 1 ||
      corpus.shuffleVersion !== "xorshift32-fisher-yates-v1" ||
      !Array.isArray(corpus.seeds) ||
      corpus.seeds.length === 0
    ) {
      throw new Error("The winnable deal corpus is missing or incompatible");
    }
    let index = Math.floor(random() * corpus.seeds.length);
    if (corpus.seeds.length > 1 && corpus.seeds[index] === previousSeed) {
      index = (index + 1) % corpus.seeds.length;
    }
    const seed = corpus.seeds[index];
    return { seed, order: seededShuffle(seed) };
  }

  function shouldUseWinnableDeal(percent, random = Math.random) {
    const frequency = Math.max(0, Math.min(100, Number(percent) || 0));
    return random() < frequency / 100;
  }

  global.DealEngine = Object.freeze({
    seededShuffle,
    selectWinnableDeal,
    shouldUseWinnableDeal,
  });
})(globalThis);
