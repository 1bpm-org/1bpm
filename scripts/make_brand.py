"""
Builds the 1BPM logo set into brand/.

The mark: one day as a 24-hour dial (00:00 at the top), opened at 06:00 and 18:00,
with a point resting in each opening. Two moments, twelve hours apart.

The wordmark is Inter Tight at weight 500, tracked +0.22em, converted to outlines so the
SVGs need no font.

Usage: python3 scripts/make_brand.py
"""

import math
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "brand"
FONT = ROOT / "node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2"

INK = "#07080a"
PAPER = "#f4f1ea"
AMBER = "#c8a571"        # the site's accent, for dark grounds
AMBER_ON_PAPER = "#9a7642"  # same hue, deep enough to hold on paper


def mark(cx: float, cy: float, r: float, stroke: float, dot: float, gap_deg: float, line: str, accent: str) -> str:
    g = math.radians(gap_deg)
    c, s = math.cos(g), math.sin(g)
    f = lambda v: f"{v:.3f}".rstrip("0").rstrip(".")
    lower = f"M{f(cx + r * c)} {f(cy + r * s)}A{f(r)} {f(r)} 0 0 1 {f(cx - r * c)} {f(cy + r * s)}"
    upper = f"M{f(cx - r * c)} {f(cy - r * s)}A{f(r)} {f(r)} 0 0 1 {f(cx + r * c)} {f(cy - r * s)}"
    return (
        f'<path d="{lower}{upper}" fill="none" stroke="{line}" stroke-width="{f(stroke)}"/>'
        f'<circle cx="{f(cx - r)}" cy="{f(cy)}" r="{f(dot)}" fill="{accent}"/>'
        f'<circle cx="{f(cx + r)}" cy="{f(cy)}" r="{f(dot)}" fill="{accent}"/>'
    )


def wordmark(text: str, cap_height: float, tracking_em: float):
    """Returns (svg path d, width, height) with the baseline at y = cap_height."""
    font = TTFont(FONT)
    font = instantiateVariableFont(font, {"wght": 500})
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight
    k = cap_height / cap
    pen = SVGPathPen(gs)
    x = 0.0
    names = [cmap[ord(ch)] for ch in text]
    for i, name in enumerate(names):
        # scale to cap height, flip y, baseline at cap_height
        tp = TransformPen(pen, (k, 0, 0, -k, x, cap_height))
        gs[name].draw(tp)
        x += gs[name].width * k
        if i < len(names) - 1:
            x += tracking_em * upm * k
    # trim the last glyph's right side bearing out of the measured width
    bp = BoundsPen(gs)
    gs[names[-1]].draw(bp)
    last_rsb = (gs[names[-1]].width - bp.bounds[2]) * k
    bp0 = BoundsPen(gs)
    gs[names[0]].draw(bp0)
    first_lsb = bp0.bounds[0] * k
    return pen.getCommands(), x - last_rsb, first_lsb


def svg(w: float, h: float, body: str, bg: str | None = None, title: str = "1BPM") -> str:
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{rect}{body}</svg>\n"
    )


def main() -> None:
    OUT.mkdir(exist_ok=True)

    # --- Mark, 64 grid, for use at 32 px and up ---
    for name, line, accent in (("mark-light-on-dark", PAPER, AMBER), ("mark-dark-on-light", INK, AMBER_ON_PAPER)):
        (OUT / f"{name}.svg").write_text(svg(64, 64, mark(32, 32, 23, 2, 2.9, 16, line, accent)))

    # --- Icon: mark on its ground, square. Avatars, app icons, social. ---
    (OUT / "icon.svg").write_text(svg(512, 512, mark(256, 256, 150, 9, 14, 15, PAPER, AMBER), bg=INK))

    # --- Favicon: heavier line and points so it survives 16 px ---
    (OUT / "favicon.svg").write_text(svg(32, 32, mark(16, 16, 11, 2.2, 2.4, 22, PAPER, AMBER), bg=INK))

    # --- Horizontal lockup ---
    cap = 20.0
    d, word_w, lsb = wordmark("1BPM", cap, 0.22)
    r = cap * 0.8
    stroke, dot = 1.5, 2.2
    pad = dot + stroke  # room for the points beyond the ring
    gapx = cap * 0.95
    mark_w = 2 * (r + pad)
    h = mark_w
    word_x = mark_w + gapx - lsb
    word_y = (h - cap) / 2
    w = mark_w + gapx + word_w
    for name, line, accent in (("logo-light-on-dark", PAPER, AMBER), ("logo-dark-on-light", INK, AMBER_ON_PAPER)):
        body = mark(mark_w / 2, h / 2, r, stroke, dot, 16, line, accent)
        body += f'<path transform="translate({word_x:.3f} {word_y:.3f})" d="{d}" fill="{line}"/>'
        (OUT / f"{name}.svg").write_text(svg(round(w, 2), round(h, 2), body))

    # --- Wordmark alone ---
    for name, fill in (("wordmark-light", PAPER), ("wordmark-dark", INK)):
        body = f'<path transform="translate({-lsb:.3f} 0)" d="{d}" fill="{fill}"/>'
        (OUT / f"{name}.svg").write_text(svg(round(word_w, 2), cap, body))

    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
