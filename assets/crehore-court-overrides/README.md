# Editable vintage court art

These transparent PNGs are the durable, manually editable artwork for the
twelve vintage J/Q/K cards. The deck builder automatically prefers an override
when its filename is present here, then adds the paper, large rank, and suit to
create the final app card.

When editing:

- erase or paint out unwanted scan lines while preserving transparency;
- keep the original pixel dimensions and canvas bounds;
- do not crop, resize, rename, or convert the PNG;
- save over the same file.

Rebuild the composed WebP cards with:

```sh
python3 assets/build-crehore-deck.py
npm run sync
```

The builder never overwrites an existing override. To restore one court to its
programmatically cleaned scan, move its PNG out of this directory and run the
builder again. Running with `--export-court-overrides` recreates only missing
override PNGs.
