/* Generates all app/PWA/splash images from a single vector definition.
   Run: node assets/build-icons.mjs   (sharp comes in via @capacitor/assets)

   Palette (matches the game):
     felt #0f2e25 → felt-deep #071d17,  brass #d9a648 / #b98a2f  */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const FELT = "#0f2e25", FELT_DEEP = "#071d17";
const BRASS = "#d9a648", BRASS_SOFT = "#b98a2f";

// Classic spade in a 100×100 box, point at top, flared stem at the base.
const SPADE =
  "M50 13 C50 13 19 41 19 59 C19 73 31 79 42 75 C44 74 45 75 44 79 " +
  "C42 87 38 91 32 93 L68 93 C62 91 58 87 56 79 C55 75 56 74 58 75 " +
  "C69 79 81 73 81 59 C81 41 50 13 50 13 Z";

/* One SVG. `spade` = spade height as a fraction of the canvas (smaller for
   maskable so it survives a circular/squircle crop). `bg` toggles the felt. */
function svg(size, { spade = 0.62, bg = true } = {}) {
  const s = size * spade;
  const off = (size - s) / 2;
  const felt = bg
    ? `<defs><radialGradient id="f" cx="50%" cy="0%" r="120%">
         <stop offset="0%" stop-color="${FELT}"/>
         <stop offset="100%" stop-color="${FELT_DEEP}"/>
       </radialGradient></defs>
       <rect width="${size}" height="${size}" fill="url(#f)"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${felt}
    <g transform="translate(${off},${off}) scale(${s / 100})">
      <path d="${SPADE}" fill="${BRASS}" stroke="${BRASS_SOFT}" stroke-width="1.2"/>
    </g>
  </svg>`;
}

async function render(path, size, opts) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(svg(size, opts))).png().toFile(path);
  console.log("  ✓", path);
}

// Splash: centered small spade on full-bleed felt.
async function renderSplash(path, size) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(svg(size, { spade: 0.28 }))).png().toFile(path);
  console.log("  ✓", path);
}

console.log("PWA + web icons →");
await render("www/icons/icon-192.png", 192);
await render("www/icons/icon-512.png", 512);
await render("www/icons/maskable-512.png", 512, { spade: 0.46 });
await render("www/icons/apple-touch-icon-180.png", 180);
await writeFile("www/favicon.ico", await sharp(Buffer.from(svg(64))).png().toBuffer());

console.log("Capacitor source assets →");
await render("assets/icon-only.png", 1024);            // full icon (felt + spade)
await render("assets/icon-foreground.png", 1024, { bg: false }); // spade, transparent
await render("assets/icon-background.png", 1024, { spade: 0 });  // felt only
await renderSplash("assets/splash.png", 2732);
await renderSplash("assets/splash-dark.png", 2732);

console.log("done.");
