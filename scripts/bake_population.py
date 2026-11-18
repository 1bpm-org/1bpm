"""
Offline bake: GHSL population grid (GHS-POP R2023A, epoch 2025, 30 arc-second, EPSG:4326)
-> 360x180 single-channel PNG, 1 degree per texel, equirectangular, row 0 = 90N, col 0 = 180W.

Texel value = log-scaled population density (people / km^2) of the 1-degree cell.
  0          -> empty or near-empty (dropped; the client never places a point there)
  1..255     -> log10(1 + density) / log10(1 + DENSITY_CAP)

Source: European Commission, Joint Research Centre. GHS-POP R2023A.
https://human-settlement.emergency.copernicus.eu/download.php?ds=pop

Usage:
  python3 scripts/bake_population.py path/to/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif public/population.png
"""

import math
import sys

import numpy as np
import rasterio
from rasterio.windows import Window
from PIL import Image

DENSITY_CAP = 2500.0   # people/km^2, a 1-degree average this high is the brightest texel
DENSITY_FLOOR = 1.0    # below this a cell is treated as empty
EARTH_R_KM = 6371.0088


def main(src_path: str, out_path: str) -> None:
    pop = np.zeros((180, 360), dtype=np.float64)

    with rasterio.open(src_path) as ds:
        t = ds.transform
        px_w, px_h = t.a, t.e            # px_h is negative
        x0, y0 = t.c, t.f
        cols = np.arange(ds.width)
        lon_c = x0 + (cols + 0.5) * px_w
        cell_col = np.clip(np.floor(lon_c + 180.0).astype(np.int64), 0, 359)

        strip = 240
        for r0 in range(0, ds.height, strip):
            h = min(strip, ds.height - r0)
            a = ds.read(1, window=Window(0, r0, ds.width, h)).astype(np.float64)
            a[~np.isfinite(a)] = 0.0
            a[a < 0] = 0.0
            rows = np.arange(r0, r0 + h)
            lat_c = y0 + (rows + 0.5) * px_h
            cell_row = np.clip(np.floor(90.0 - lat_c).astype(np.int64), 0, 179)
            # sum the strip into its 1-degree cells
            for rr in np.unique(cell_row):
                band = a[cell_row == rr].sum(axis=0)
                np.add.at(pop[rr], cell_col, band)
            print(f"\r{r0 + h}/{ds.height}", end="", file=sys.stderr)
    print(file=sys.stderr)

    # area of each 1-degree cell
    lat_top = 90.0 - np.arange(180)
    lat_bot = lat_top - 1.0
    area = (EARTH_R_KM ** 2) * math.radians(1.0) * (
        np.sin(np.radians(lat_top)) - np.sin(np.radians(lat_bot))
    )
    density = pop / area[:, None]

    v = np.log10(1.0 + density) / math.log10(1.0 + DENSITY_CAP)
    v = np.clip(np.round(v * 255.0), 1, 255).astype(np.uint8)
    v[density < DENSITY_FLOOR] = 0

    total = pop.sum()
    kept = pop[density >= DENSITY_FLOOR].sum()
    print(f"total population in grid: {total/1e9:.3f} B", file=sys.stderr)
    print(f"population in kept cells: {kept/1e9:.3f} B ({100*kept/total:.2f}%)", file=sys.stderr)
    print(f"kept cells: {(v > 0).sum()} / {v.size}", file=sys.stderr)

    Image.fromarray(v, mode="L").save(out_path, optimize=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
