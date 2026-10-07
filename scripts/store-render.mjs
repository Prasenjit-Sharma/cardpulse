// Renders the Google Play screenshots and feature graphic from store/slides/*.html. Run: npm run store:render
// Uses the captures in store/screens/raw (npm run store:capture). Output: RGB PNGs (no alpha) in store/play/, plus a
// contact sheet at search-result size (160 px wide) for the thumbnail test.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { rgbFromPng, rgbFromSvg } from './png.mjs'
import { BASE_URL, startVite } from './store-capture.mjs'

const SLIDES = readdirSync('store/slides').filter((f) => /^\d\d-.*\.html$/.test(f)).sort()

async function main() {
  mkdirSync('store/play/phone', { recursive: true })
  const vite = await startVite()
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const render = async (file, w, h, out) => {
      await page.setViewportSize({ width: w, height: h })
      await page.goto(`${BASE_URL}/store/slides/${file}`)
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      writeFileSync(out, rgbFromPng(await page.screenshot({ animations: 'disabled' })))
      console.log('rendered', out)
    }
    for (const f of SLIDES) await render(f, 1080, 1920, `store/play/phone/${f.replace('.html', '.png')}`)
    await render('feature-graphic.html', 1024, 500, 'store/play/feature-graphic.png')
  } finally {
    await browser.close()
    vite.kill()
  }
  // the thumbnail test: every slide at 160 px wide, side by side
  const w = 160, h = Math.round(1920 * w / 1080), gap = 12
  const images = SLIDES.map((f, i) => `<image x="${gap + i * (w + gap)}" y="${gap}" width="${w}" height="${h}" href="data:image/png;base64,${readFileSync(`store/play/phone/${f.replace('.html', '.png')}`).toString('base64')}"/>`)
  const W = gap + SLIDES.length * (w + gap)
  writeFileSync('store/play/contact-sheet.png', rgbFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h + gap * 2}"><rect width="100%" height="100%" fill="#F4F4FA"/>${images.join('')}</svg>`))
  console.log('rendered store/play/contact-sheet.png')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1) })
