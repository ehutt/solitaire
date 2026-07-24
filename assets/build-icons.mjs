/* Generates all app/PWA/splash images from a single vector definition.
   Run: node assets/build-icons.mjs   (sharp comes in via @capacitor/assets)

   Icon: "the deal" — a fan of three classic cards (Q♦, K♣, A♥) on the
   classic green felt. Splash keeps the quiet brass spade on felt.
   Palette matches the game: felt #0f2e25 → #071d17, brass #d9a648. */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const FELT = "#0f2e25", FELT_DEEP = "#071d17";
const BRASS = "#d9a648", BRASS_SOFT = "#b98a2f";
const RED = "#bf3b33", INK = "#26282e";

// Classic spade in a 100×100 box (splash screens still use it).
const SPADE =
  "M50 13 C50 13 19 41 19 59 C19 73 31 79 42 75 C44 74 45 75 44 79 " +
  "C42 87 38 91 32 93 L68 93 C62 91 58 87 56 79 C55 75 56 74 58 75 " +
  "C69 79 81 73 81 59 C81 41 50 13 50 13 Z";

const SERIF = "Palatino, 'Book Antiqua', Georgia, serif";

/* One card of the fan: cream stock, corner index (rank + suit), centre pip.
   `shade` dims the cards tucked behind so the fan reads as depth. */
function card({ x, y, rot, cx, cy, fill, rank, suit, color, shade }) {
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="42" height="60" rx="5"
      fill="${fill}" stroke="#8a8070" stroke-width="0.7"/>
    <text x="${x + 5}" y="${y + 15}" font-size="13" font-family="${SERIF}"
      font-weight="bold" fill="${color}">${rank}</text>
    <text x="${x + 6}" y="${y + 26}" font-size="10" font-family="${SERIF}"
      fill="${color}">${suit}</text>
    <text x="${x + 24}" y="${y + 50}" text-anchor="middle" font-size="25"
      font-family="${SERIF}" fill="${color}">${suit}</text>
    ${shade ? `<rect x="${x}" y="${y}" width="42" height="60" rx="5" fill="rgba(9,32,24,${shade})"/>` : ""}
  </g>`;
}

/* The dealt fan in a 100×100 box. `fan` scales it (smaller for maskable). */
function fanSVG(size, { fan = 0.92, bg = true } = {}) {
  const felt = bg
    ? `<defs><radialGradient id="f" cx="40%" cy="25%" r="110%">
         <stop offset="0%" stop-color="#1a4a37"/>
         <stop offset="100%" stop-color="#092018"/>
       </radialGradient></defs>
       <rect width="${size}" height="${size}" fill="url(#f)"/>`
    : "";
  const s = (size / 100) * fan;
  const off = (size * (1 - fan)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${felt}
    <g transform="translate(${off},${off}) scale(${s})">
      ${card({ x: 6, y: 28, rot: -20, cx: 27, cy: 58, fill: "#f2ecdc", rank: "Q", suit: "♦", color: RED, shade: 0.14 })}
      ${card({ x: 27, y: 22, rot: -5, cx: 48, cy: 52, fill: "#f6f0e0", rank: "K", suit: "♣", color: INK, shade: 0.07 })}
      ${card({ x: 48, y: 20, rot: 11, cx: 69, cy: 50, fill: "#faf5e9", rank: "A", suit: "♥", color: RED, shade: 0 })}
    </g>
  </svg>`;
}

/* Quiet brass spade on felt — splash screens. */
function spadeSVG(size, { spade = 0.62, bg = true } = {}) {
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

async function render(path, svgText) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(svgText)).png().toFile(path);
  console.log("  ✓", path);
}

console.log("PWA + web icons →");
await render("www/icons/icon-192.png", fanSVG(192));
await render("www/icons/icon-512.png", fanSVG(512));
await render("www/icons/maskable-512.png", fanSVG(512, { fan: 0.66 }));
await render("www/icons/apple-touch-icon-180.png", fanSVG(180));
await writeFile("www/favicon.ico", await sharp(Buffer.from(fanSVG(64))).png().toBuffer());

console.log("Capacitor source assets →");
await render("assets/icon-only.png", fanSVG(1024));
await render("assets/icon-foreground.png", fanSVG(1024, { bg: false, fan: 0.8 }));
await render("assets/icon-background.png", fanSVG(1024, { fan: 0 })); // felt only
await render("assets/splash.png", spadeSVG(2732, { spade: 0.28 }));
await render("assets/splash-dark.png", spadeSVG(2732, { spade: 0.28 }));

console.log("done.");
