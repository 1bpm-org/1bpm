"""
The detailed 1BPM logo: the planet inside the day.

Same ring as the simple mark (one day as a 24-hour dial, opened at 06:00 and 18:00, a point
in each opening). Inside it, the Earth in dots:
  - a fine, faint dotted landmass (Natural Earth 1:50m land, scripts/land-mask.png)
  - over it, where people live, brighter and larger dots (GHS-POP 2025, public/population.png,
    the same grid the site uses)
  - a faint graticule, the two session meridians in amber, a soft limb.

Dots are grouped by size and brightness into a few dozen <path>s of zero-length round-capped
segments, which keeps a picture of ~20k dots to a few hundred KB.

Writes brand/planet-*.svg and brand/logo-planet-*.svg.
Usage: python3 scripts/make_planet.py
"""

import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

from make_brand import AMBER, AMBER_ON_PAPER, INK, PAPER, mark, svg, wordmark

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "brand"
POP = np.asarray(Image.open(ROOT / "public/population.png"), dtype=np.float32)  # 180 x 360
LAND = np.asarray(Image.open(ROOT / "scripts/land-mask.png")) > 0  # 720 x 1440

VIEW_LON = 52.0  # Europe, Africa, South and East Asia face the viewer
VIEW_LAT = 20.0
MERIDIANS = (105.0, -75.0)  # where each bell lands at 13:00 local solar time, as on the site
GOLDEN = math.pi * (3 - math.sqrt(5))

f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")


def fibonacci(n: int):
    i = np.arange(n)
    y = 1 - (i + 0.5) / n * 2
    lat = np.degrees(np.arcsin(y))
    lon = np.degrees(np.arctan2(np.cos(i * GOLDEN), np.sin(i * GOLDEN)))
    return lon, lat


def on_land(lon, lat):
    col = np.clip(((lon + 180) / 360 * 1440).astype(int), 0, 1439)
    row = np.clip(((90 - lat) / 180 * 720).astype(int), 0, 719)
    return LAND[row, col]


def density(lon, lat):
    """Bilinear population density 0..1, and the nearest-texel 'is populated' mask."""
    col = np.clip(np.floor(lon + 180), 0, 359).astype(int)
    row = np.clip(np.floor(90 - lat), 0, 179).astype(int)
    keep = POP[row, col] > 0
    fx, fy = lon + 180 - 0.5, 90 - lat - 0.5
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    g = lambda x, y: POP[np.clip(y, 0, 179), np.mod(x, 360)]
    v = (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty
    return np.maximum(v, 1) / 255, keep


def project(lon, lat):
    """Orthographic. x, y on the unit disc (y up); z > 0 faces the viewer."""
    l, p = np.radians(np.asarray(lon) - VIEW_LON), np.radians(np.asarray(lat))
    p0 = math.radians(VIEW_LAT)
    x = np.cos(p) * np.sin(l)
    y = math.cos(p0) * np.sin(p) - math.sin(p0) * np.cos(p) * np.cos(l)
    z = math.sin(p0) * np.sin(p) + math.cos(p0) * np.cos(p) * np.cos(l)
    return x, y, z


def near_meridian(lon, width=1.1):
    d = np.min([np.abs((lon - m + 180) % 360 - 180) for m in MERIDIANS], axis=0)
    return d < width


class Dots:
    """Collects dots into (colour, diameter, opacity) buckets → one <path> each."""

    def __init__(self):
        self.b = defaultdict(list)

    def add(self, x, y, d, op, colour, size_steps=0.15, op_steps=0.04):
        d = max(size_steps, round(d / size_steps) * size_steps)
        op = max(op_steps, round(op / op_steps) * op_steps)
        self.b[(colour, round(d, 2), round(op, 2))].append(f"M{f(x)} {f(y)}h0")

    def svg(self) -> str:
        out = []
        for (colour, d, op), segs in sorted(self.b.items(), key=lambda kv: (kv[0][2], kv[0][1])):
            out.append(
                f'<path d="{"".join(segs)}" stroke="{colour}" stroke-width="{f(d)}" stroke-opacity="{f(op)}" stroke-linecap="round" fill="none"/>'
            )
        return "".join(out)


def planet_dots(cx, cy, R, ink, accent, s):
    dots = Dots()

    # 1. The landmass: a fine, even, faint stipple.
    lon, lat = fibonacci(150_000)
    # break the lattice's regularity (it beats against the pixel grid as moiré)
    rng = np.random.default_rng(3)
    lat = np.clip(lat + rng.uniform(-0.26, 0.26, lat.size), -89.9, 89.9)
    lon = lon + rng.uniform(-0.26, 0.26, lon.size) / np.maximum(np.cos(np.radians(lat)), 0.2)
    keep = on_land(lon, lat)
    lon, lat = lon[keep], lat[keep]
    x, y, z = project(lon, lat)
    front = z > 0.02
    for px, py, pz in zip(x[front], y[front], z[front]):
        limb = min(1.0, (pz - 0.02) / 0.4)
        dots.add(cx + R * px, cy - R * py, 0.95 * s * (0.6 + 0.4 * pz), 0.13 * (0.35 + 0.65 * limb), ink)

    # 2. People: denser, larger and brighter where more of them live.
    lon, lat = fibonacci(900_000)
    v, populated = density(lon, lat)
    w = np.where(populated, 0.015 + 0.985 * v ** 2.1, 0)
    kept = np.random.default_rng(7).random(lon.size) < w * (40_000 / w.sum())
    lon, lat, v = lon[kept], lat[kept], v[kept]
    x, y, z = project(lon, lat)
    front = z > 0.02
    amber = near_meridian(lon)
    for px, py, pz, d, a in zip(x[front], y[front], z[front], v[front], amber[front]):
        limb = min(1.0, (pz - 0.02) / 0.35)
        diameter = (0.7 + 0.95 * d ** 1.4) * s * (0.6 + 0.4 * pz)
        op = (0.34 + 0.66 * d ** 1.1) * (0.3 + 0.7 * limb)
        dots.add(cx + R * px, cy - R * py, diameter, op, accent if a else ink)

    return dots.svg()


def polyline(points, cx, cy, R):
    segs, cur = [], []
    for x, y, z in points:
        if z > 0:
            cur.append(f"{f(cx + R * x)} {f(cy - R * y)}")
        elif cur:
            segs.append(cur)
            cur = []
    if cur:
        segs.append(cur)
    return "".join("M" + "L".join(s) for s in segs if len(s) > 1)


def graticule(cx, cy, R, colour, opacity, width):
    d = ""
    for lo in range(-180, 180, 20):
        lat = np.linspace(-80, 80, 161)
        d += polyline(zip(*project(np.full_like(lat, lo), lat)), cx, cy, R)
    for la in range(-60, 61, 20):
        lon = np.linspace(-180, 180, 361)
        d += polyline(zip(*project(lon, np.full_like(lon, la))), cx, cy, R)
    return f'<path d="{d}" fill="none" stroke="{colour}" stroke-opacity="{opacity}" stroke-width="{f(width)}"/>'


def session_meridians(cx, cy, R, colour, width):
    d = ""
    for m in MERIDIANS:
        lat = np.linspace(-90, 90, 181)
        d += polyline(zip(*project(np.full_like(lat, m), lat)), cx, cy, R)
    return f'<path d="{d}" fill="none" stroke="{colour}" stroke-opacity=".6" stroke-width="{f(width)}"/>'


def planet(cx, cy, size, dark=True, uid="p"):
    """The full emblem centred at (cx, cy); size = outer diameter of the ring and its points."""
    ring_r = size / 2 * 0.9
    R = ring_r * 0.82
    s = size / 512  # weights are designed on a 512 grid
    ink = PAPER if dark else INK
    accent = AMBER if dark else AMBER_ON_PAPER
    hi, lo = ("#16181d", "#08090b") if dark else ("#fbf9f4", "#e6e0d2")
    rim = PAPER if dark else INK

    body = (
        f"<defs>"
        f'<radialGradient id="{uid}s" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="{hi}"/><stop offset="1" stop-color="{lo}"/></radialGradient>'
        f'<radialGradient id="{uid}r" cx="50%" cy="50%" r="50%">'
        f'<stop offset=".9" stop-color="{rim}" stop-opacity="0"/><stop offset="1" stop-color="{rim}" stop-opacity="{".1" if dark else ".07"}"/></radialGradient>'
        f'<clipPath id="{uid}c"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}"/></clipPath>'
        f"</defs>"
    )
    body += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="url(#{uid}s)"/>'
    body += f'<g clip-path="url(#{uid}c)">'
    body += graticule(cx, cy, R, ink, ".06" if dark else ".08", 0.6 * s)
    body += session_meridians(cx, cy, R, accent, 0.9 * s)
    body += planet_dots(cx, cy, R, ink, accent, s)
    body += "</g>"
    body += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="url(#{uid}r)"/>'  # inner rim glow
    body += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="none" stroke="{ink}" stroke-opacity=".18" stroke-width="{f(0.7 * s)}"/>'
    body += mark(cx, cy, ring_r, 3 * s, 7 * s, 9, ink, accent)
    return body


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, dark in (("planet-light-on-dark", True), ("planet-dark-on-light", False)):
        (OUT / f"{name}.svg").write_text(svg(512, 512, planet(256, 256, 512, dark, uid="a" if dark else "b")))
    (OUT / "planet-icon.svg").write_text(svg(512, 512, planet(256, 256, 456, True, uid="i"), bg=INK))
    # Daylight icon, filled out to the edge: the browser-tab icon is drawn from this.
    (OUT / "planet-icon-day.svg").write_text(svg(512, 512, planet(256, 256, 500, False, uid="j"), bg=PAPER))

    cap = 64.0
    d, word_w, lsb = wordmark("1BPM", cap, 0.22)
    size = cap * 4.4
    gapx = cap * 0.85
    w, h = size + gapx + word_w, size
    for name, dark in (("logo-planet-light-on-dark", True), ("logo-planet-dark-on-light", False)):
        body = planet(size / 2, h / 2, size, dark, uid="c" if dark else "d")
        body += f'<path transform="translate({size + gapx - lsb:.2f} {(h - cap) / 2:.2f})" d="{d}" fill="{PAPER if dark else INK}"/>'
        (OUT / f"{name}.svg").write_text(svg(round(w, 2), round(h, 2), body))

    for p in sorted(OUT.glob("*planet*.svg")):
        print(p.name, f"{p.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
