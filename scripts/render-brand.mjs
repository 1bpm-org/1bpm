// Renders the PNG versions of the logo (brand/) and the site's logo images (public/brand/).
// Needs Playwright + Chromium. Usage: node scripts/render-brand.mjs
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const { chromium } = createRequire(import.meta.url)('playwright')
const root = fileURLToPath(new URL('..', import.meta.url))
mkdirSync(root + 'public/brand', { recursive: true })

// [svg, out, width of the svg's own viewport, height, output scale, transparent?]
const jobs = [
  ['brand/planet-icon.svg', 'brand/planet-icon-1024.png', 512, 512, 2, false],
  ['brand/planet-icon.svg', 'brand/planet-icon-512.png', 512, 512, 1, false],
  ['brand/planet-light-on-dark.svg', 'brand/planet-light-on-dark-2048.png', 512, 512, 4, true],
  ['brand/planet-dark-on-light.svg', 'brand/planet-dark-on-light-2048.png', 512, 512, 4, true],
  ['brand/logo-planet-light-on-dark.svg', 'brand/logo-planet-light-on-dark-2400.png', 603.3, 281.6, 4, true],
  ['brand/logo-planet-dark-on-light.svg', 'brand/logo-planet-dark-on-light-2400.png', 603.3, 281.6, 4, true],
  // site: emblem shown up to 180 CSS px, so 360 px covers 2x screens
  ['brand/planet-light-on-dark.svg', 'public/brand/planet-night.png', 512, 512, 360 / 512, true],
  ['brand/planet-dark-on-light.svg', 'public/brand/planet-day.png', 512, 512, 360 / 512, true],
  ['brand/planet-icon.svg', 'public/apple-touch-icon.png', 512, 512, 180 / 512, false],
  // master for the browser-tab icons; scripts/make_favicons.py downsamples it
  ['brand/planet-icon-day.svg', 'brand/planet-icon-day-1024.png', 512, 512, 2, false],
]

const browser = await chromium.launch()
for (const [svg, out, w, h, scale, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) }, deviceScaleFactor: scale })
  await page.goto('file://' + root + svg)
  await page.waitForTimeout(400)
  await page.screenshot({ path: root + out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } })
  await page.close()
  console.log(out)
}
await browser.close()
