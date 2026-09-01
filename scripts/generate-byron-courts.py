#!/usr/bin/env python3
"""Extract and recolor the upper courts from Byron Knoll's SVG card set."""

from __future__ import annotations

import argparse
import re
import xml.etree.ElementTree as ET
from pathlib import Path


SVG_NS = "http://www.w3.org/2000/svg"
RANKS = ("jack", "queen", "king")
SUITS = ("clubs", "diamonds", "hearts", "spades")

# Each source layer has one visual role. Keeping the distinct blue-gray layers is
# important: collapsing them is what made the proof's eyes look cramped.
PALETTE = {
    "#accdde": "#9BA6A6",
    "#6a9fc7": "#718187",
    "#578db5": "#3A5157",
    "#6094bb": "#718187",
    "#6194bb": "#718187",
    "#5f94bc": "#718187",
    "#5e95bc": "#718187",
    "#5f95ba": "#718187",
    "#1156a1": "#132A31",
    "#e2d200": "#D0AC3D",
    "#dcd00f": "#D0AC3D",
    "#9da51a": "#B49C43",
    "#9ea31b": "#B49C43",
    "#678f19": "#486451",
    "#678f1a": "#486451",
    "#659019": "#486451",
    "#66901c": "#486451",
    "#65901b": "#486451",
    "#698e23": "#486451",
    "#596314": "#294C3B",
    "#5a6315": "#294C3B",
    "#22591c": "#294C3B",
    "#235520": "#294C3B",
    "#195d20": "#294C3B",
    "#1a5b22": "#294C3B",
    "#1c5c20": "#294C3B",
    "#df0000": "#B84539",
    "#b400b4": "#B84539",
    "#a6152a": "#8E3835",
    "#000000": "#171C1D",
    "#000400": "#171C1D",
}


def court_group(root: ET.Element) -> ET.Element:
    candidates: list[ET.Element] = []
    for group in root.iter(f"{{{SVG_NS}}}g"):
        transform = group.get("transform", "")
        paths = [child for child in group if child.tag == f"{{{SVG_NS}}}path"]
        if paths and ("matrix(0.15" in transform or "matrix(0.16" in transform):
            candidates.append(group)
    if not candidates:
        raise ValueError("Could not find the source court color group")
    return max(candidates, key=lambda group: len(list(group)))


def recolor(style: str) -> str:
    def replace(match: re.Match[str]) -> str:
        source = match.group(0).lower()
        if source not in PALETTE:
            raise ValueError(f"Unmapped source color: {source}")
        return PALETTE[source]

    return re.sub(r"#[0-9a-fA-F]{6}", replace, style)


def generate(source: Path, output: Path, rank: str, suit: str) -> None:
    root = ET.parse(source).getroot()
    group = court_group(root)
    label = f"{rank.title()} of {suit.title()}"
    paths: list[str] = []
    for path in group:
        style = recolor(path.get("style", ""))
        path_id = path.get("id", "")
        path_data = path.get("d", "")
        paths.append(f'  <path id="{path_id}" style="{style}" d="{path_data}"/>')

    svg = "\n".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 772 628" preserveAspectRatio="xMidYMax meet" role="img" aria-labelledby="title desc">',
            f'  <title id="title">{label}</title>',
            f'  <desc id="desc">Single-ended {label.lower()} court illustration derived from Byron Knoll\'s public-domain vector card set.</desc>',
            *paths,
            "</svg>",
            "",
        ]
    )
    output.write_text(svg, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for rank in RANKS:
        for suit in SUITS:
            source = args.source_dir / f"{rank}_of_{suit}2.svg"
            output = args.output_dir / f"{suit}-{rank}.svg"
            generate(source, output, rank, suit)
            print(output)


if __name__ == "__main__":
    main()
