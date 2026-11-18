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

## Deploy (GitLab Pages → 1bpm.org)

`.gitlab-ci.yml` runs the tests on every push. On the default branch it also builds the site and publishes it to Pages.

1. Push to `gitlab.com/1bpm-foundation/1bpm`. The `pages` job publishes the site.
2. Go to **Deploy → Pages**. Set Pages access to *Everyone*; the project can stay private.
3. Under **Domains**, add `1bpm.org`, and `www.1bpm.org` if you want it. Copy the DNS records GitLab shows into your DNS provider:
   an `A` record (or ALIAS) for the apex domain pointing at GitLab Pages, and a `TXT` record for
   `_gitlab-pages-verification-code.1bpm.org`.
4. Turn on automatic HTTPS (Let's Encrypt) for the domain.

## Regenerate the share image

```bash
npm run og       # renders scripts/og.html to public/og.png using Playwright
```
