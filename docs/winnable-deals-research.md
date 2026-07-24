# Winnable Klondike deals: research and recommendation

## Executive conclusion

Yes, an app can guarantee that a deal is winnable—but “guaranteed winnable” only means that at least one legal sequence of moves reaches a win under one precisely specified ruleset. It does **not** guarantee that a player who cannot see the hidden cards will discover that sequence, or that an earlier choice cannot destroy it.

For Better Solitaire, the most practical design is:

1. Keep a clearly labeled **Random** mode whose shuffles remain uniform.
2. Add a clearly labeled **Winnable** mode backed by an offline-generated library of random seeds plus their verified solutions.
3. If the product goal is simply a friendlier default rather than a 100% guarantee, sample from the winnable library most of the time and from uniform random deals the rest—but label this honestly as a “Friendly” or “Mostly winnable” deal, not a random deal.

The app’s observed win/completion rate of roughly one third should not be interpreted as “only one third of deals are mathematically winnable.” The best current estimate for the app’s rules is much higher: about **90.48% for draw 1** and **81.945% for draw 3**, assuming unlimited redeals, foundation-to-tableau moves, and *thoughtful* play (all hidden cards known, equivalent in principle to unlimited undo/replay). Those are deal-solvability rates, not ordinary-player completion rates.

## What the percentages mean

### Solvability (existence of a solution)

A fixed deal is solvable if *some* legal move sequence wins. A complete solver can certify this either by returning a winning sequence or by exhausting the state space and proving none exists.

Blake and Gent’s 2024 Solvitaire study defines the commonly measured **thoughtful** variant as one where ranks and suits of hidden cards are known from the start. They note that an electronic game with unlimited undo effectively becomes thoughtful because the player can discover cards and return to the start. Their million-deal results estimate:

| Rules | Thoughtful winnability (95% CI) |
|---|---:|
| Draw 1, unlimited redeals | 90.480% ± 0.116% |
| Draw 3, unlimited redeals | 81.945% ± 0.084% |

Source: Charles Blake and Ian Gent, [*The Winnability of Klondike Solitaire and Many Other Patience Games*, Table 1 and Table 3](https://sites.cs.st-andrews.ac.uk/people/ipg1/Klondike/WinnabilityArxivVersion5-August2024.pdf).

These figures closely match Better Solitaire’s rules: draw 1 or draw 3, unlimited stock recycling, movable partial tableau piles, and cards may be moved back from foundations to the tableau. Rule details matter substantially; the paper shows winnability falling as draw size rises and documents deals where moving a card back from a foundation is essential.

### Thoughtful versus ordinary hidden-information play

Thoughtful solvability is an **upper bound** on ordinary play. In normal Klondike, the player does not know the 21 face-down tableau cards and may have to make an irreversible choice before seeing them. Blake and Gent explicitly say that the optimal win probability for classic hidden-information Klondike remains unknown and is not known even within a factor of two. [Paper, pp. 1–2 and 26](https://sites.cs.st-andrews.ac.uk/people/ipg1/Klondike/WinnabilityArxivVersion5-August2024.pdf).

“Thoughtless solvability” is not a standard technical metric in the primary literature located for this review. If it means playing without look-ahead, undo, or deliberate search, that is a **policy/player completion rate**, not a property of the deal. It should be measured separately in product analytics.

An older hidden-information planning study gives useful context, but not a modern estimate of human play: Bjarnason, Fern, and Tadepalli found a Monte Carlo policy that won over 35% of random draw-3 games, while a greedy baseline won about 13%. The same paper reports that their earlier full-information planner won at least 82%. This large gap illustrates why a one-third completion rate can coexist with roughly 82% thoughtful deal solvability. [*Lower Bounding Klondike Solitaire with Monte-Carlo Planning*](https://ojs.aaai.org/index.php/ICAPS/article/download/13363/13211/16880).

### Practical completion rate

Completion depends on the player, hints, undo/replay, auto-moves, abandonment, and whether a locally legal move ruins the only winning line. Therefore:

- “81.9% of draw-3 deals are solvable” does **not** predict an 81.9% user win rate.
- A “winnable deal” can still feel hard or unfair when its sole solution requires information the player could not yet know.
- If the product goal is relaxation, a corpus should be filtered not only for solvability but also for **human-friendly difficulty**.

Useful difficulty signals available from a stored solution include solution length, search effort, number of forced guesses before information is revealed, number of foundation reversals, and how many early moves preserve a winning continuation.

## How established apps present this

MobilityWare’s official Solitaire help cleanly separates two modes:

- **Random Deal:** shuffled and displayed without knowing whether it is winnable.
- **Winning Deal:** guaranteed to have a known solution, with “Show Me How to Win.”
- Its Daily Challenges are also guaranteed winnable.

Source: MobilityWare, [“What’s the difference between the Random Deal and Winning Deal?”](https://mobilityware.helpshift.com/hc/en/10-solitaire/faq/1498-what-s-the-difference-between-the-random-deal-and-winning-deal/).

MobilityWare also says Winning Deals require an internet connection and that a timeout fetching one falls back to a random deal. That strongly indicates a server-delivered/catalog architecture rather than solving every new deal on the phone. [Official connectivity help](https://mobilityware.helpshift.com/hc/en/10-solitaire/faq/1903-i-m-told-that-i-don-t-have-an-internet-connection-how-do-i-fix-this/). Its official FreeCell glossary is explicit that a Winning Deal is “pulled from a library of known winnable deals,” showing the same general product pattern in a sister app. [FreeCell definitions](https://mobilityware.helpshift.com/hc/en/12-freecell/faq/3459-definitions-of-terms-used-in-freecell/).

The important product lesson is transparency: a prominent app does not call its filtered deals random. It offers Random and Winning as distinct choices and retains a solution certificate for the latter.

## Algorithms for producing winnable deals

### 1. Generate, solve, and keep (recommended)

This is rejection sampling:

```text
repeat:
    seed := new random seed
    deal := shuffle(seed)
    result := solve(deal, exact rules)
until result includes a legal winning move sequence
store(seed, rules_version, solution, difficulty_metadata)
```

A returned legal solution is a definitive certificate of winnability. A timeout is only “unknown,” not “unwinnable”; discard it from the guaranteed corpus or give it a larger offline budget.

Why this is the best fit:

- The accepted deals begin as uniform random permutations, so they retain the natural distribution of random deals **conditioned on the solver finding a win**.
- At the measured base rates, only about 1.11 random candidates per accepted draw-1 deal or 1.22 per accepted draw-3 deal are needed in principle. Solver time, not scarcity of solvable shuffles, is the constraint.
- Offline generation avoids CPU/battery/latency problems in the zero-dependency web/iOS client.
- Storing the solution enables “Show me how,” solution-aware hints, regression tests, and difficulty classification.

Solvitaire is an open-source depth-first backtracking solver with transposition handling, dominance rules, streamliners, and search heuristics. Its authors warn that seemingly safe pruning rules can be wrong and document rare false classifications in earlier Klondike solvers, so every imported solver must be checked against Better Solitaire’s exact rules. Source and reproducible experiment data are linked in the [paper’s Data and Code Availability section](https://sites.cs.st-andrews.ac.uk/people/ipg1/Klondike/WinnabilityArxivVersion5-August2024.pdf) and the [Solvitaire repository](https://github.com/thecharlesblake/Solvitaire).

### 2. Curated/precomputed seed sets (recommended delivery mechanism)

Run the previous pipeline in CI or a one-off offline job and ship a compact list of seeds, solutions, and metadata. A seed is enough to reconstruct the deck deterministically, but a saved solution is worth retaining as an audit certificate.

This is compatible with daily deals and local/offline play. Version the shuffle algorithm and rules alongside every seed; otherwise a later shuffle or rule change can silently invalidate the guarantee.

Advantages over runtime solving:

- no solver in the app bundle;
- instant deal selection;
- stable replay/share IDs;
- deliberate difficulty distribution;
- easy de-duplication and QA.

The cost is a finite catalog, which is practically irrelevant: even a few thousand deals provide substantial variety, and more can be generated in releases.

### 3. Reverse or constructive generation (possible, but not preferred)

In principle, start from a won state and apply legal inverse moves until reaching a valid Klondike opening layout. Reversing the recorded moves proves the resulting deal winnable.

The hard part is not the proof; it is sampling good openings. Ordinary reverse moves do not naturally recreate the strict opening constraints (seven columns of lengths 1–7, exactly one exposed card per column, and a 24-card ordered stock). A reverse random walk also has cycles and a highly non-uniform endpoint distribution. Naive constructive generators tend to produce recognizable, easy, or otherwise “cooked” deals.

This approach is useful if the goal is deliberately tutorial-like deals. It is a poor default if the goal is for guaranteed deals to feel statistically like normal shuffles. No primary source located here demonstrates a widely used production Klondike app using reverse construction; treat it as a design technique, not an established industry standard.

### 4. Hand-authored deals

Hand construction guarantees winnability when the author records a valid solution. It is excellent for onboarding and daily challenges, but expensive and prone to stylistic repetition. It does not scale as the main endless-deal source.

### 5. “Helpful shuffle” heuristics without solving

Examples would include preventing buried low cards, ensuring playable aces, or swapping cards after the shuffle. These can increase *apparent* ease but cannot guarantee a solution unless followed by a solver. They also distort the distribution in difficult-to-measure ways and risk visible patterns.

Use heuristics only as a candidate pre-filter or explicit difficulty control, then verify with a solver.

## Recommended rollout for Better Solitaire

### Product modes

1. **Winnable** (recommended default): 100% verified, solution retained.
2. **Random**: existing Fisher–Yates-style fresh shuffle, no solvability claim.
3. Optionally later, **Daily**: one verified seed per ruleset/day.

Avoid claiming that an opaque mixture is a “true random shuffle.” If a softer transition is desired, label it **Friendly** and disclose that it favors verified winnable deals.

### Corpus pipeline

- Generate seeded uniform permutations offline.
- Solve separately for draw 1 and draw 3 under the app’s exact rules.
- Replay every returned solution through the app’s own move engine in a headless verifier.
- Save `seed`, `shuffleVersion`, `rulesVersion`, `drawMode`, solution moves, solver/version, and difficulty metrics.
- Keep draw-1 and draw-3 guarantees separate. A deal verified under draw 1 is not automatically certified under draw 3.
- Sample without immediate repeats; weighting by difficulty can target a relaxing but varied experience.

### Analytics before and after

Track these as different quantities:

- deals started and completed;
- mode and draw count;
- restarts/undos/hints;
- abandonment;
- whether a verified deal was still solvable at the final player position;
- corpus difficulty bucket.

This will show whether the current one-third rate is driven by draw-3 usage, player decisions, difficult but solvable deals, or abandonment. It also prevents conflating player win rate with deal solvability.

## Direct answer

- **Is guaranteeing winnability possible?** Yes. Produce or select a deal together with a verified legal solution.
- **Can the app determine this instantly for an arbitrary shuffle?** Not reliably with a tiny heuristic. General Klondike solving is a substantial state-space search; do it offline.
- **Are other apps probably rigging “random” games?** At least one major app, MobilityWare, explicitly does **not**: it separates unknown Random Deals from guaranteed Winning Deals. We found no primary evidence supporting the broader claim that popular apps silently manipulate deals they label random.
- **How should this app increase wins?** Default to a transparent, preverified Winnable corpus while preserving a true Random option. Add difficulty filtering if the objective is player enjoyment rather than only mathematical solvability.

