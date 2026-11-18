# 1BPM — Twice a day

One page. Two bells a day, at 06:00 UTC and 18:00 UTC, shown in the visitor's own time zone.
No account, no tracker, no backend.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # clock tests across Auckland, Kolkata, London, Los Angeles, São Paulo, including DST changes
npm run build    # static site in dist/
```

## Structure

| File | What it does |
| --- | --- |
| `index.html` | All the page text, including the letter, as plain HTML. It still works if JavaScript or WebGL fails. |
| `src/clock.ts` | Session clock. Pure TypeScript, no DOM, uses `Intl` with the browser's IANA time zone. |
| `src/field.ts` | Builds the points once at startup: a Fibonacci sphere, keeping only points over populated 1° cells. |
| `src/shaders.ts` | The point and globe shaders: back-hemisphere cull, meridian glows, bell sweep. |
| `src/world.ts` | three.js scene: one `Points` and one dark sphere, so 2 draw calls. Only uniforms change each frame. Lowers pixel ratio if frames are slow. |
| `src/audio.ts` | Bell sound, synthesised. Only starts after a user gesture. |
| `src/main.ts` | Modes (approach, orient, wait, sit, after), sit timer, keyboard controls, share. |
| `src/copy.ts` | All interface text, as templates that can be translated. |
| `public/population.png` | 360×180 grayscale image, 13 KB, log-scaled population density. |

## Population data

`public/population.png` is built offline from GHS-POP R2023A (epoch 2025, 30″, EPSG:4326),
European Commission Joint Research Centre, CC BY 4.0. To rebuild it:

```bash
pip install rasterio pillow numpy
python3 scripts/bake_population.py GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif public/population.png
```

The grid totals 8.19 billion people. Cells under 1 person/km² are dropped; they hold 0.13% of the population.

## Deploy (GitHub Pages → 1bpm.org)

`.github/workflows/pages.yml` runs the tests, builds the site and publishes it on every push to `main`.

1. In the repository, open **Settings → Pages** and set **Source** to *GitHub Actions*.
2. Under **Custom domain**, enter `1bpm.org` and save.
3. At your DNS provider, point the apex domain at GitHub Pages using the `A` records listed in GitHub's
   custom-domain documentation, and add a `CNAME` record for `www` pointing to `<account>.github.io`.
4. When the domain check passes, turn on **Enforce HTTPS**.

On a free GitHub plan, Pages only publishes from public repositories.

`.gitlab-ci.yml` does the same for GitLab Pages, if the code moves there.

## Regenerate the share image

```bash
npm run og       # renders scripts/og.html to public/og.png using Playwright
```

## Logo

`brand/` holds the logo set. The planet logo (`planet-*`, `logo-planet-*`) is the main one: the
Earth drawn as dots from the same population grid the site uses, over a faint dotted landmass,
inside one day drawn as a 24-hour dial. The dial (00:00 at the top) is opened at 06:00 and 18:00,
with an amber point in each opening. The simple ring (`mark-*`, `favicon.svg`) is for sizes too small
for the planet to read, such as the browser-tab icon.

```bash
pip install fonttools brotli numpy pillow
npm run brand            # SVGs: simple mark, wordmark, planet
node scripts/render-brand.mjs   # PNGs, plus the site's logo images in public/brand/
```

Land outlines: Natural Earth 1:50m (public domain), baked to `scripts/land-mask.png` by `scripts/bake_land.py`.

## Day and night

From 06:00 to 18:00 on the visitor's own clock the page is ink on paper; from 18:00 to 06:00 it
is paper on ink. The time zone comes from the browser, so no location permission is asked and
nothing is sent. The theme is set before first paint and switches live if the page is open across
06:00 or 18:00.
