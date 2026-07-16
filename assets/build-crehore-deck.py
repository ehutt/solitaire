#!/usr/bin/env python3
"""Build an app-ready Thomas Crehore-inspired deck from the reference scans.

The twelve court cards, four suit pips, paper stock, and ornate back are taken
directly from the supplied scans. Only the rank glyphs are newly typeset. The
script writes reusable component art, 52 complete card faces, two backs, a JSON
manifest, and visual QA sheets under www/assets/cards/crehore-1820/.

Usage:
    python3 assets/build-crehore-deck.py
    python3 assets/build-crehore-deck.py --source-dir /path/to/scans
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "Desktop" / "Thomas Crehore ~1820"
DEFAULT_OUTPUT = ROOT / "www" / "assets" / "cards" / "crehore-1820"
DEFAULT_FONT = Path("/System/Library/Fonts/Supplemental/Baskerville.ttc")

WIDTH = 360
HEIGHT = 522
CORNER_RADIUS = 19
RANKS = ("", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = (
    {"id": 0, "name": "spades", "symbol": "♠", "red": False},
    {"id": 1, "name": "hearts", "symbol": "♥", "red": True},
    {"id": 2, "name": "diamonds", "symbol": "♦", "red": True},
    {"id": 3, "name": "clubs", "symbol": "♣", "red": False},
)

# Every court scan is used as its own card art. The crop removes the outer
# scanner margin but keeps the handmade blue frame and all printed detail.
COURTS = {
    (0, 11): ("I20 14.jpg", (46, 52, 714, 1058)),
    (0, 12): ("I20 10.jpg", (31, 47, 700, 1057)),
    (0, 13): ("I20 06.jpg", (40, 61, 710, 1068)),
    (1, 11): ("I20 13.jpg", (49, 65, 712, 1059)),
    (1, 12): ("I20 09.jpg", (41, 55, 714, 1059)),
    (1, 13): ("I20 05.jpg", (29, 37, 702, 1048)),
    (2, 11): ("I20 15.jpg", (47, 50, 720, 1049)),
    (2, 12): ("I20 11.jpg", (42, 56, 710, 1069)),
    (2, 13): ("I20 07.jpg", (37, 56, 716, 1075)),
    (3, 11): ("I20 16.jpg", (40, 31, 714, 1047)),
    (3, 12): ("I20 12.jpg", (34, 41, 696, 1049)),
    (3, 13): ("I20 08.jpg", (55, 49, 726, 1067)),
}

# Clean, isolated source-pip regions. Connected-component extraction below
# preserves the original ink grain while removing the surrounding paper.
PIP_SOURCES = {
    0: ("I20 06.jpg", (54, 68, 233, 276)),
    1: ("I20 05.jpg", (40, 56, 228, 260)),
    2: ("I20 07.jpg", (55, 52, 236, 290)),
    # The queen carries the cleanest, most balanced club in the supplied
    # scans. The king's club used in the first draft has a lopsided shoulder
    # that becomes distracting when enlarged on number cards.
    3: ("I20 12.jpg", (475, 45, 720, 320)),
}

# The original one-way courts alternate the printed suit between the upper
# left and upper right. The app index is consistently upper-left, so remove
# only that redundant historical pip from the illustration before placing it
# beneath the dedicated index band. Portrait pixels remain untouched.
COURT_PIP_CORNERS = {
    (0, 11): "left",
    (0, 12): "right",
    (0, 13): "left",
    (1, 11): "right",
    (1, 12): "left",
    (1, 13): "left",
    (2, 11): "right",
    (2, 12): "right",
    (2, 13): "left",
    (3, 11): "right",
    (3, 12): "right",
    (3, 13): "left",
}

RED_INK = (210, 49, 34)
BLACK_INK = (22, 31, 34)
RANK_VISIBLE_HEIGHT = 76
CORNER_SUIT_HEIGHT = 70


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--font", type=Path, default=DEFAULT_FONT)
    return parser.parse_args()


def require_inputs(source: Path, font: Path) -> None:
    names = {"I20 Back.jpg", "I32 Back.jpg"}
    names.update(filename for filename, _ in COURTS.values())
    names.update(filename for filename, _ in PIP_SOURCES.values())
    missing = [str(source / name) for name in sorted(names) if not (source / name).is_file()]
    if missing:
        raise FileNotFoundError("Missing reference scans:\n" + "\n".join(missing))
    if not font.is_file():
        raise FileNotFoundError(f"Rank font not found: {font}")


def rounded_mask(width: int = WIDTH, height: int = HEIGHT, radius: int = CORNER_RADIUS) -> Image.Image:
    scale = 4
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, width * scale - 1, height * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    return mask.resize((width, height), Image.Resampling.LANCZOS)


CARD_MASK = rounded_mask()


def connected_components(mask: np.ndarray) -> tuple[np.ndarray, int]:
    labels = np.zeros(mask.shape, dtype=np.int32)
    current = 0
    height, width = mask.shape
    for y0, x0 in zip(*np.where(mask)):
        if labels[y0, x0]:
            continue
        current += 1
        labels[y0, x0] = current
        queue: deque[tuple[int, int]] = deque([(int(y0), int(x0))])
        while queue:
            y, x = queue.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if (
                        0 <= ny < height
                        and 0 <= nx < width
                        and mask[ny, nx]
                        and not labels[ny, nx]
                    ):
                        labels[ny, nx] = current
                        queue.append((ny, nx))
    return labels, current


def extract_pip(source: Image.Image, box: tuple[int, int, int, int], red: bool) -> Image.Image:
    region = source.crop(box).convert("RGB")
    pixels = np.asarray(region).astype(np.int16)
    if red:
        mask = (
            (pixels[:, :, 0] > 120)
            & (pixels[:, :, 0] - pixels[:, :, 1] > 42)
            & (pixels[:, :, 0] - pixels[:, :, 2] > 30)
        )
    else:
        mask = pixels.mean(axis=2) < 125

    labels, count = connected_components(mask)
    if count == 0:
        raise RuntimeError(f"Could not isolate {'red' if red else 'black'} suit pip in {box}")
    sizes = np.bincount(labels.ravel())[1:]
    component = int(np.argmax(sizes)) + 1
    keep = labels == component
    ys, xs = np.where(keep)
    pad = 5
    left = max(0, int(xs.min()) - pad)
    top = max(0, int(ys.min()) - pad)
    right = min(region.width, int(xs.max()) + pad + 1)
    bottom = min(region.height, int(ys.max()) + pad + 1)

    alpha = Image.fromarray((keep * 255).astype(np.uint8))
    # A tiny expansion/softening retains the stamped, fibrous edge without a
    # paper-colored rectangular halo.
    alpha = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.45))
    result = region.convert("RGBA")
    result.putalpha(alpha)
    return result.crop((left, top, right, bottom))


def remove_court_pip(
    art: Image.Image,
    paper: Image.Image,
    suit: int,
    corner: str,
) -> Image.Image:
    """Replace just the original pip with locally color-matched paper texture."""
    art = art.convert("RGBA")
    width, height = art.size
    x0, x1 = (0, round(width * 0.36)) if corner == "left" else (round(width * 0.64), width)
    y0, y1 = 0, round(height * 0.3)
    region = np.asarray(art.crop((x0, y0, x1, y1)).convert("RGB")).astype(np.int16)
    if SUITS[suit]["red"]:
        candidate = (
            (region[:, :, 0] > 120)
            & (region[:, :, 0] - region[:, :, 1] > 42)
            & (region[:, :, 0] - region[:, :, 2] > 30)
        )
    else:
        # Require all channels to be dark so the blue linework and frame do
        # not join the black pip's connected component.
        candidate = np.max(region, axis=2) < 82

    labels, count = connected_components(candidate)
    if count == 0:
        raise RuntimeError(f"Could not isolate original {SUITS[suit]['name']} court pip")
    component = int(np.argmax(np.bincount(labels.ravel())[1:])) + 1
    pip_mask = Image.fromarray(np.uint8((labels == component) * 255)).filter(ImageFilter.MaxFilter(9))
    blend_mask = np.asarray(pip_mask.filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255

    # Use the same scanned paper substrate as the card, then color-match it to
    # a bright ring immediately around this particular historical pip. This
    # retains natural grain without leaving a suit-shaped light or dark ghost.
    texture = paper.resize(art.size, Image.Resampling.LANCZOS).crop((x0, y0, x1, y1)).convert("RGB")
    texture_pixels = np.asarray(texture).astype(np.float32)
    ring = np.asarray(pip_mask.filter(ImageFilter.MaxFilter(41))) > 0
    ring &= np.asarray(pip_mask) < 8
    brightness = region.mean(axis=2)
    chroma = region.max(axis=2) - region.min(axis=2)
    paper_ring = ring & (brightness > 155) & (chroma < 75)
    if paper_ring.any():
        target_color = np.median(region[paper_ring], axis=0)
        texture_color = np.median(texture_pixels[paper_ring], axis=0)
        texture_pixels = np.clip(texture_pixels + target_color - texture_color, 0, 255)

    original = region.astype(np.float32)
    mixed = original * (1 - blend_mask[:, :, None]) + texture_pixels * blend_mask[:, :, None]
    replacement = Image.fromarray(np.uint8(mixed)).convert("RGBA")
    art.alpha_composite(replacement, (x0, y0))
    return art


def fit_height(image: Image.Image, height: int) -> Image.Image:
    if "A" in image.getbands():
        alpha_box = image.getchannel("A").getbbox()
        if alpha_box:
            image = image.crop(alpha_box)
    scale = height / image.height
    return image.resize((max(1, round(image.width * scale)), height), Image.Resampling.LANCZOS)


def paste_center(canvas: Image.Image, image: Image.Image, x: float, y: float) -> None:
    left = round(x - image.width / 2)
    top = round(y - image.height / 2)
    canvas.alpha_composite(image, (left, top))


def make_paper(plain_scan: Image.Image, seed: int) -> Image.Image:
    # The blank Crehore scan is the actual paper substrate. Tiny deterministic
    # offsets keep adjacent cards from repeating the exact same foxing marks.
    rng = np.random.default_rng(seed)
    target_ratio = WIDTH / HEIGHT
    source_ratio = plain_scan.width / plain_scan.height
    if source_ratio < target_ratio:
        crop_height = round(plain_scan.width / target_ratio)
        travel = max(0, plain_scan.height - crop_height)
        top = int(rng.integers(0, travel + 1)) if travel else 0
        crop = plain_scan.crop((0, top, plain_scan.width, top + crop_height))
    else:
        crop_width = round(plain_scan.height * target_ratio)
        travel = max(0, plain_scan.width - crop_width)
        left = int(rng.integers(0, travel + 1)) if travel else 0
        crop = plain_scan.crop((left, 0, left + crop_width, plain_scan.height))
    return crop.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).convert("RGBA")


def rank_font(
    font_path: Path,
    rank: str,
) -> ImageFont.FreeTypeFont:
    # Size by visible ink rather than nominal points. Baskerville's lining
    # numerals then render every rank at the same perceived height, including
    # the 2 and 10 that were much shorter in Big Caslon's old-style figures.
    max_width = 118 if rank == "10" else 90
    size = 150
    while size > 20:
        font = ImageFont.truetype(str(font_path), size=size)
        left, top, right, bottom = font.getbbox(rank)
        if right - left <= max_width and bottom - top <= RANK_VISIBLE_HEIGHT:
            return font
        size -= 1
    return ImageFont.truetype(str(font_path), size=20)


def add_rank_index(
    card: Image.Image,
    rank: int,
    suit: int,
    pip: Image.Image,
    font_path: Path,
) -> None:
    text = RANKS[rank]
    font = rank_font(font_path, text)
    ink = RED_INK if SUITS[suit]["red"] else BLACK_INK
    draw = ImageDraw.Draw(card)

    # Big Caslon's glyph box has a generous ascender area. Anchor at the top
    # so all ranks share the same visible baseline within the fan-safe corner.
    index_y = 10
    # Align the visible ink to the edge. This compensates for glyphs such as
    # Baskerville's J, whose swash extends left of the font's logical origin.
    unaligned_box = draw.textbbox((16, index_y), text, font=font, anchor="lt")
    index_x = 16 + (16 - unaligned_box[0])
    rank_box = draw.textbbox((index_x, index_y), text, font=font, anchor="lt")
    draw.text((index_x, index_y), text, font=font, fill=ink + (255,), anchor="lt")

    # Suits use one fixed size across all 52 cards, stay slightly shorter than
    # the normalized rank, and share its exact visible vertical center.
    small_pip = fit_height(pip, CORNER_SUIT_HEIGHT)
    max_width = 82
    if small_pip.width > max_width:
        scale = max_width / small_pip.width
        small_pip = small_pip.resize((max_width, round(small_pip.height * scale)), Image.Resampling.LANCZOS)
    rank_center_y = (rank_box[1] + rank_box[3]) / 2
    pip_x = WIDTH - 16 - small_pip.width
    pip_y = round(rank_center_y - small_pip.height / 2)
    card.alpha_composite(small_pip, (pip_x, pip_y))


def compose_number_card(
    paper: Image.Image,
    rank: int,
    suit: int,
    pip: Image.Image,
    font_path: Path,
) -> Image.Image:
    card = paper.copy()
    # The rank is already explicit in the oversized corner index. A single,
    # generous suit mark keeps every number card calm and instantly legible.
    center_pip = fit_height(pip, 190 if rank == 1 else 164)
    if center_pip.width > 218:
        center_pip = center_pip.resize(
            (218, round(center_pip.height * 218 / center_pip.width)),
            Image.Resampling.LANCZOS,
        )
    paste_center(card, center_pip, WIDTH / 2, HEIGHT / 2 + 24)
    add_rank_index(card, rank, suit, pip, font_path)
    card.putalpha(CARD_MASK)
    return card


def extract_court_ink(art: Image.Image) -> Image.Image:
    """Turn a court scan into ink-only artwork on a transparent matte.

    The pale scan paper is deliberately discarded, including inside white
    clothing and faces, so the shared card substrate shows through. Colored
    blocks and the original black/blue linework remain untouched.
    """
    art = art.convert("RGB")
    pixels = np.asarray(art).astype(np.float32)
    lightness = pixels.mean(axis=2)
    chroma = pixels.max(axis=2) - pixels.min(axis=2)

    # Dark linework and strongly colored ink are two independent signals.
    # The thresholds sit beyond the yellowed paper's normal brightness and
    # chroma, avoiding a rectangular scan haze around the figure.
    dark_ink = np.clip((218 - lightness) / 68, 0, 1)
    colored_ink = np.clip((chroma - 72) / 86, 0, 1)
    alpha = np.maximum(dark_ink, colored_ink)
    alpha = np.clip((alpha - 0.10) / 0.90, 0, 1)
    alpha = alpha * alpha * (3 - 2 * alpha)

    # Keep fine engraved strokes connected while retaining a soft printed
    # edge. This expands only the alpha matte, never the source colors.
    matte = Image.fromarray(np.uint8(alpha * 255))
    matte = matte.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.45))
    result = art.convert("RGBA")
    result.putalpha(matte)
    return result


def remove_top_scan_rule(art: Image.Image) -> Image.Image:
    """Remove only long blue-gray remnants of the original top frame.

    Several figures naturally touch or cross the historical card frame. A
    deeper rectangular crop would cut into their hats and crowns, so detect
    the straight frame ink inside a shallow top band instead. Colored headwear
    and compact black details are left intact.
    """
    pixels = np.asarray(art.convert("RGBA")).copy()
    band_height = min(32, art.height)
    band = pixels[:band_height]
    red = band[:, :, 0].astype(np.int16)
    green = band[:, :, 1].astype(np.int16)
    blue = band[:, :, 2].astype(np.int16)
    alpha = band[:, :, 3]
    frame_ink = (
        (alpha > 8)
        & (np.maximum.reduce((red, green, blue)) - np.minimum.reduce((red, green, blue)) < 105)
        & ((red + green + blue) / 3 < 205)
        & ((red + green + blue) / 3 >= 65)
    )

    rule = np.zeros_like(frame_ink)
    min_run = max(36, round(art.width * 0.06))
    for y, row in enumerate(frame_ink):
        padded = np.pad(row.astype(np.int8), (1, 1))
        transitions = np.diff(padded)
        starts = np.where(transitions == 1)[0]
        ends = np.where(transitions == -1)[0]
        for start, end in zip(starts, ends):
            if end - start >= min_run:
                rule[y, start:end] = True

    # Clear the tiny antialias halo created around the detected rule as well,
    # while explicitly retaining saturated hat/crown color and dense black
    # portrait ink where a figure crosses the old frame.
    expanded_rule = np.asarray(
        Image.fromarray(np.uint8(rule * 255)).filter(ImageFilter.MaxFilter(7))
    ) > 0
    chroma = np.maximum.reduce((red, green, blue)) - np.minimum.reduce((red, green, blue))
    lightness = (red + green + blue) / 3
    portrait_ink = (chroma >= 108) | (lightness < 65)
    pixels[:band_height, :, 3][expanded_rule & ~portrait_ink] = 0
    return Image.fromarray(pixels)


def prepare_court_art(
    art: Image.Image,
    paper: Image.Image,
    rank: int,
    suit: int,
) -> Image.Image:
    """Remove scan furniture and return a consistently cropped court cutout."""
    art = remove_court_pip(art, paper, suit, COURT_PIP_CORNERS[(suit, rank)])
    # Keep the complete source top because several hats and crowns cross the
    # historical frame. The straight rule is removed selectively after ink
    # extraction instead of sacrificing any recoverable portrait pixels.
    side_crop = 24
    top_crop = 0
    art = art.crop((side_crop, top_crop, art.width - side_crop, art.height - side_crop))
    # The feet/base are the least useful detail on a phone. A uniform lower
    # crop lets every face and torso read larger without changing proportions
    # from one court to another.
    lower_crop = round(art.height * 0.07)
    art = art.crop((0, 0, art.width, art.height - lower_crop))
    # The ink matte itself is crisp and antialiased. No broad perimeter mask:
    # figures that meet the crop now continue cleanly to the card edge.
    return remove_top_scan_rule(extract_court_ink(art))


def compose_court_card(
    paper: Image.Image,
    art: Image.Image,
    rank: int,
    suit: int,
    pip: Image.Image,
    font_path: Path,
) -> Image.Image:
    card = paper.copy()
    # Scale every court by width so the historical print fills the card from
    # side to side. There is no perimeter fade; overflow is cropped only from
    # the lower figure to preserve every face and crown.
    art_top = 86
    art = art.convert("RGBA")
    scale = WIDTH / art.width
    art = art.resize((WIDTH, round(art.height * scale)), Image.Resampling.LANCZOS)
    visible_height = HEIGHT - art_top
    if art.height > visible_height:
        art = art.crop((0, 0, WIDTH, visible_height))
    card.alpha_composite(art, (0, art_top))
    add_rank_index(card, rank, suit, pip, font_path)
    card.putalpha(CARD_MASK)
    return card


def save_webp(image: Image.Image, path: Path, quality: int = 94) -> None:
    image.save(path, format="WEBP", quality=quality, method=6, exact=True)


def build_contact(cards_dir: Path, output: Path) -> None:
    display_width = 116
    display_height = round(display_width * HEIGHT / WIDTH)
    gap = 6
    sheet_width = 13 * (display_width + gap) + gap
    sheet_height = 5 * (display_height + gap) + gap
    sheet = Image.new("RGB", (sheet_width, sheet_height), (88, 130, 144))
    for suit in range(4):
        for rank in range(1, 14):
            card = Image.open(cards_dir / f"{suit}-{rank}.webp").convert("RGBA")
            card = card.resize((display_width, display_height), Image.Resampling.LANCZOS)
            sheet.paste(card, (gap + (rank - 1) * (display_width + gap), gap + suit * (display_height + gap)), card)
    for col, filename in enumerate(("back.webp", "back-plain.webp")):
        back = Image.open(cards_dir / filename).convert("RGBA")
        back = back.resize((display_width, display_height), Image.Resampling.LANCZOS)
        sheet.paste(back, (gap + col * (display_width + gap), gap + 4 * (display_height + gap)), back)
    save_webp(sheet, output, quality=92)


def build_stack_preview(cards_dir: Path, output: Path) -> None:
    canvas = Image.new("RGB", (920, 600), (91, 137, 153))
    card_width = 132
    card_height = round(card_width * HEIGHT / WIDTH)

    def load(name: str) -> Image.Image:
        return Image.open(cards_dir / name).convert("RGBA").resize(
            (card_width, card_height), Image.Resampling.LANCZOS
        )

    # Face-up tableau: 34% vertical fan, including courts and a ten.
    y = 28
    for index, name in enumerate(("0-13.webp", "1-12.webp", "2-11.webp", "3-10.webp", "0-9.webp")):
        card = load(name)
        canvas.paste(card, (38, round(y + index * card_height * 0.34)), card)

    # Face-down fan followed by exposed cards.
    for index in range(5):
        card = load("back.webp")
        canvas.paste(card, (280, round(28 + index * card_height * 0.15)), card)
    start = 28 + 5 * card_height * 0.15
    for index, name in enumerate(("1-7.webp", "0-6.webp", "2-5.webp")):
        card = load(name)
        canvas.paste(card, (280, round(start + index * card_height * 0.34)), card)

    # Draw-three waste: 30% horizontal fan; the index stays in the revealed edge.
    for index, name in enumerate(("0-12.webp", "2-10.webp", "1-13.webp")):
        card = load(name)
        canvas.paste(card, (530 + round(index * card_width * 0.30), 42), card)

    # A full ace to judge pip texture and linework.
    ace = load("3-1.webp")
    canvas.paste(ace, (730, 310), ace)
    save_webp(canvas, output, quality=92)


def main() -> None:
    args = parse_args()
    source_dir = args.source_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    font_path = args.font.expanduser().resolve()
    require_inputs(source_dir, font_path)

    cards_dir = output_dir / "cards"
    suits_dir = output_dir / "components" / "suits"
    courts_dir = output_dir / "components" / "courts"
    backs_dir = output_dir / "components" / "backs"
    for directory in (cards_dir, suits_dir, courts_dir, backs_dir):
        directory.mkdir(parents=True, exist_ok=True)

    # The first draft used large PNGs. Prune only those known generated files
    # so the native bundle carries the compact WebP deck once.
    for directory in (cards_dir, output_dir / "components", suits_dir, courts_dir, backs_dir):
        for legacy in directory.glob("*.png"):
            legacy.unlink()
    for legacy_name in ("contact-sheet.png", "stack-preview.png"):
        legacy = output_dir / legacy_name
        if legacy.exists():
            legacy.unlink()

    scans = {
        path.name: Image.open(path).convert("RGB")
        for path in source_dir.glob("*.jpg")
    }
    plain_scan = scans["I20 Back.jpg"]
    ornate_scan = scans["I32 Back.jpg"]

    pips: dict[int, Image.Image] = {}
    for suit, (filename, box) in PIP_SOURCES.items():
        pip = extract_pip(scans[filename], box, bool(SUITS[suit]["red"]))
        pips[suit] = pip
        save_webp(pip, suits_dir / f"{SUITS[suit]['name']}.webp")

    court_art: dict[tuple[int, int], Image.Image] = {}
    court_paper = make_paper(plain_scan, 0)
    for (suit, rank), (filename, box) in COURTS.items():
        art = prepare_court_art(scans[filename].crop(box), court_paper, rank, suit)
        court_art[(suit, rank)] = art
        save_webp(art, courts_dir / f"{SUITS[suit]['name']}-{RANKS[rank].lower()}.webp")

    card_entries = []
    for suit in range(4):
        for rank in range(1, 14):
            paper = make_paper(plain_scan, suit * 17 + rank)
            if rank >= 11:
                card = compose_court_card(paper, court_art[(suit, rank)], rank, suit, pips[suit], font_path)
            else:
                card = compose_number_card(paper, rank, suit, pips[suit], font_path)
            filename = f"{suit}-{rank}.webp"
            save_webp(card, cards_dir / filename)
            card_entries.append(
                {
                    "id": suit * 13 + rank - 1,
                    "suit": suit,
                    "suitName": SUITS[suit]["name"],
                    "rank": rank,
                    "rankLabel": RANKS[rank],
                    "file": f"cards/{filename}",
                }
            )

    ornate = ImageOps.fit(ornate_scan, (WIDTH, HEIGHT), Image.Resampling.LANCZOS).convert("RGBA")
    ornate.putalpha(CARD_MASK)
    save_webp(ornate, cards_dir / "back-ornate.webp")
    save_webp(ornate, cards_dir / "back.webp")
    save_webp(ornate, backs_dir / "ornate.webp")

    plain_back = make_paper(plain_scan, 999)
    plain_back.putalpha(CARD_MASK)
    save_webp(plain_back, cards_dir / "back-plain.webp")
    save_webp(plain_back, backs_dir / "plain.webp")

    # Keep one exact fitted paper substrate available to future card themes.
    save_webp(make_paper(plain_scan, 0), output_dir / "components" / "paper-stock.webp")

    manifest = {
        "name": "Thomas Crehore c. 1820",
        "version": 5,
        "cardSize": {"width": WIDTH, "height": HEIGHT, "aspectRatio": WIDTH / HEIGHT},
        "rankFont": {
            "family": ImageFont.truetype(str(font_path), size=32).getname()[0],
            "source": "macOS system font; glyphs are baked into card images",
        },
        "suitOrder": [suit["name"] for suit in SUITS],
        "defaultBack": "cards/back.webp",
        "backVariants": {"ornate": "cards/back-ornate.webp", "plain": "cards/back-plain.webp"},
        "components": {
            "suits": {suit["name"]: f"components/suits/{suit['name']}.webp" for suit in SUITS},
            "courts": {
                f"{SUITS[suit]['name']}-{RANKS[rank].lower()}": f"components/courts/{SUITS[suit]['name']}-{RANKS[rank].lower()}.webp"
                for suit, rank in sorted(COURTS)
            },
            "backs": {"ornate": "components/backs/ornate.webp", "plain": "components/backs/plain.webp"},
            "paper": "components/paper-stock.webp",
        },
        "cards": card_entries,
        "sourceFiles": sorted({"I20 Back.jpg", "I32 Back.jpg", *(name for name, _ in COURTS.values())}),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    build_contact(cards_dir, output_dir / "contact-sheet.webp")
    build_stack_preview(cards_dir, output_dir / "stack-preview.webp")
    print(f"Built {len(card_entries)} faces, 2 backs, and source components in {output_dir}")


if __name__ == "__main__":
    main()
