# Thomas Crehore c. 1820 deck

App-ready playing-card assets derived directly from the reference scans in
`~/Desktop/Thomas Crehore ~1820`.

## Use in the game

- Card faces: `cards/{suit}-{rank}.webp`
- Default ornate back: `cards/back.webp`
- Alternate plain back: `cards/back-plain.webp`
- Suit indices: spades `0`, hearts `1`, diamonds `2`, clubs `3`
- Rank indices: ace `1`, jack `11`, queen `12`, king `13`
- Native asset size: `360 × 522` pixels (`1 : 1.45`)

For example, the queen of diamonds is `cards/2-12.webp`.

`manifest.json` contains the complete machine-readable mapping. Reusable
source-derived pips, court illustrations, paper stock, and backs live under
`components/`. `contact-sheet.webp` shows the whole deck, while
`stack-preview.webp` checks the app's vertical and horizontal fan offsets.

## Regenerate

From the project root:

```sh
python3 assets/build-crehore-deck.py
```

The script uses the original scan pixels for every illustrated element. Only
the rank glyphs are new; they are typeset in Big Caslon and baked into the WebP files.
