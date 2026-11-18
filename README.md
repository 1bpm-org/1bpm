# 1BPM — Twice a day

Two bells a day, at 06:00 UTC and 18:00 UTC, shown in the visitor's own time zone.
No account, no tracker. A small API (Cloudflare Worker + D1) holds the "at least X people" commitments
and sends reminders to browsers that asked for them.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # clock tests (Auckland, Kolkata, London, Los Angeles, São Paulo, DST) and API tests
npm run build    # static site in dist/
```

The API, locally (the dev site talks to it on port 8787):

```bash
cd api && npm install
npx wrangler d1 migrations apply 1bpm --local
npm run dev      # http://localhost:8787
```

## Routes

| Route | |
| --- | --- |
| `/` | The world, the countdown, the commitment, the sit, the letter |
| `/practice/` | How to sit |
| `/session/` | The session, with the visitor's two local times |
| `/room/` | If you open a room |
| `/difficulties/` | When it is hard |
| `/onboarding/` | Shown once, before the world, until `1bpm.onboarded` is set; linked as "See the introduction" in every footer |

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
| `src/commit.ts`, `src/api.ts` | "Count me in": a random id per browser and the bell it chose. Nothing else is sent. |
| `src/reminders.ts`, `public/sw.js` | Bell reminders, off by default. The service worker exists only after someone turns them on, and has no fetch handler or offline cache. |
| `src/onboarding.ts`, `src/page.ts`, `src/shell.ts` | The introduction and the four reading pages (no canvas). |
| `api/` | The Worker: counts, commitments, push subscriptions, the cron that sends reminders. |
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

## The API (Cloudflare → api.1bpm.org)

`.github/workflows/api.yml` deploys `api/` on every push to `main` that touches it, or when run by hand.
It finds or creates the D1 database `1bpm`, applies `api/migrations/`, and deploys the Worker on the
custom domain `api.1bpm.org`. It needs two repository secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_ACCOUNT_ID`: the account that holds the 1bpm.org zone.
- `CLOUDFLARE_API_TOKEN`: a token made from the *Edit Cloudflare Workers* template, plus
  **Account → D1 → Edit** and **Zone → DNS → Edit**, limited to that account and the 1bpm.org zone.

What it stores:

- `commitments`: `client_id` (a random UUID from the browser), `session_start` (the bell), `created_at`.
  Unique per client and bell. Rows older than 48 hours are deleted by the cron.
- `push`: the browser's push endpoint and keys, for people who turned reminders on. Deleted by
  "Stop reminders", or when the push service says the subscription is gone. Not linked to commitments.
- `hits`: a salted hash of the caller's address per minute and per hour, for the write rate limit
  (10 a minute, 40 an hour). Rows expire within the hour.
- `meta`: the VAPID key pair and the salt, made by the Worker on first use.

X is `count(*)` for one bell. Nothing is added to it. Commitments are accepted only for the coming bell
and can be withdrawn until it rings. Counts are cached at the edge for 20 seconds and purged on a write.

Reminders: the cron runs at 05:50, 06:00, 17:50 and 18:00 UTC and sends Web Push (RFC 8291/8292,
written against WebCrypto, no library). Large sends fan out across invocations through the Worker's
binding to itself. An open tab also schedules its own reminders; both paths share one tag, so a bell
notifies once. Nothing is sent during a sit.

## Regenerate the share image

```bash
npm run og       # renders scripts/og.html to public/og.png using Playwright
```

## Logo

`brand/` holds the logo set. The planet logo (`planet-*`, `logo-planet-*`) is the main one: the
Earth drawn as dots from the same population grid the site uses, over a faint dotted landmass,
inside one day drawn as a 24-hour dial. The dial (00:00 at the top) is opened at 06:00 and 18:00,
with an amber point in each opening. The browser-tab icon is the daylight planet on paper
(`planet-icon-day.svg`). The simple ring (`mark-*`, `favicon.svg`) remains for one-colour uses.

```bash
pip install fonttools brotli numpy pillow
npm run brand            # SVGs: simple mark, wordmark, planet
node scripts/render-brand.mjs   # PNGs, plus the site's logo images in public/brand/
python3 scripts/make_site_icons.py   # tab icons (favicon.ico, favicon-32/64.png) and WebP site logos
```

Land outlines: Natural Earth 1:50m (public domain), baked to `scripts/land-mask.png` by `scripts/bake_land.py`.

## Day and night

From 06:00 to 18:00 on the visitor's own clock the page is ink on paper; from 18:00 to 06:00 it
is paper on ink. The time zone comes from the browser, so no location permission is asked and
nothing is sent. The theme is set before first paint and switches live if the page is open across
06:00 or 18:00.
