"""
Bakes a 0.25-degree land mask (1440x720, equirectangular, row 0 = 90N) from Natural Earth
1:50m land polygons (public domain). Used only to draw the landmass in the planet logo.

Usage: python3 scripts/bake_land.py ne_50m_land.geojson scripts/land-mask.png
"""
import json
import sys

from PIL import Image, ImageDraw

W, H = 1440, 720


def main(src: str, out: str) -> None:
    img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(img)
    for feat in json.load(open(src))["features"]:
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for rings in polys:
            for k, ring in enumerate(rings):
                pts = [((lon + 180) / 360 * W, (90 - lat) / 180 * H) for lon, lat in ring]
                draw.polygon(pts, fill=255 if k == 0 else 0)
    img.save(out, optimize=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
