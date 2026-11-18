"""
Finishes the site's logo images after `node scripts/render-brand.mjs`:
  - browser-tab icons from the daylight planet icon (brand/planet-icon-day-1024.png),
    downsampled with Lanczos, which keeps more of the planet at 16-64 px than a small render
  - the header/opening logo PNGs in public/brand/ converted to WebP (about a sixth the size)

Usage: python3 scripts/make_site_icons.py
"""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
master = Image.open(ROOT / "brand/planet-icon-day-1024.png").convert("RGB")

def small(size: int) -> Image.Image:
    """Downsample, then win back the contrast that averaging takes out at tab sizes."""
    im = master.resize((size, size), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(1.0 + 24 / size)
    return im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=1))


for size in (32, 64):
    small(size).save(ROOT / f"public/favicon-{size}.png", optimize=True)
small(48).save(ROOT / "public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[small(16), small(32)])
for name in ("planet-day", "planet-night"):
    png = ROOT / f"public/brand/{name}.png"
    if not png.exists():
        continue
    Image.open(png).save(ROOT / f"public/brand/{name}.webp", "WEBP", quality=86, method=6)
    png.unlink()
print("favicons and public/brand/*.webp written")
