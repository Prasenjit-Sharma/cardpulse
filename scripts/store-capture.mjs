// Captures the real app's screens for the Play listing. Run: npm run store:capture
// Starts the Vite dev server, opens the app in a throwaway headless Chromium at phone size, loads made-up sample data
// (store/capture/seed.ts) and saves each screen to store/screens/raw/. Nothing touches a real install.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const PORT = 5199
const BASE = `https://localhost:${PORT}`
const OUT = 'store/screens/raw'

/** Starts Vite and resolves once it is serving. */
export function startVite() {
  return new Promise((resolve, reject) => {
    // vite itself, not through npx, so killing the child stops the server
    const vite = spawn('node_modules/.bin/vite', ['--mode', 'android', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { vite.kill(); reject(new Error('Vite did not start in 30 s')) }, 30_000)
    const watch = (b) => { if (/ready in|Local:/.test(String(b))) { clearTimeout(timer); resolve(vite) } }
    vite.stdout.on('data', watch); vite.stderr.on('data', watch)
    vite.on('exit', (code) => reject(new Error(`Vite exited (${code})`)))
  })
}
export const BASE_URL = BASE

async function main() {
  mkdirSync(OUT, { recursive: true })
  const vite = await startVite()
  let browser
  try {
    browser = await chromium.launch()
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, colorScheme: 'light', locale: 'en-IN', timezoneId: 'Asia/Kolkata' })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.warn('page error:', e.message))
    await page.goto(BASE + '/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => { const m = await import('/store/capture/seed.ts'); await m.seed() })
    await page.reload()
    await page.waitForLoadState('networkidle')

    const shot = async (name, waitText) => {
      if (waitText) await page.getByText(waitText, { exact: false }).first().waitFor({ timeout: 15_000 })
      await page.waitForTimeout(900)   // let entrances and the masthead beat settle
      await page.screenshot({ path: `${OUT}/${name}.png` })
      console.log('captured', name)
    }
    // every scroller back to the top, so a screen is captured from its start
    const toTop = () => page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll('*')) if (el.scrollTop) el.scrollTop = 0 })
    const nav = (label) => page.locator('nav button', { hasText: label }).click()

    await shot('home', 'Due')
    await nav('Events'); await shot('events', 'India Plast 2026')
    await nav('Contacts')
    await page.getByText('Rajesh Shah').first().click()   // a row opens its quick actions; Open goes to the contact
    await shot('quick', 'WhatsApp')   // the row's quick actions: Call, WhatsApp, Email
    await page.getByRole('button', { name: /^open$/i }).first().click()
    await page.getByText('24AABCA1234F1Z5').first().waitFor({ timeout: 15_000 })
    await toTop()
    await shot('contact', null)
    await page.getByRole('button', { name: /brief/i }).first().click()
    await shot('brief', 'Ask how India Plast is going')
    await page.goBack().catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
    await page.goto(BASE + '/'); await page.waitForLoadState('networkidle')
    await nav('My Card'); await shot('mycard', 'Share card')   // the card itself is drawn on a canvas
    await page.getByRole('button', { name: /share card/i }).click()
    await shot('share', null)

    const review = await ctx.newPage()
    await review.goto(BASE + '/store/capture/review.html')
    await review.getByText('Nikhil Agarwal').first().waitFor({ timeout: 15_000 })
    await review.waitForTimeout(700)
    await review.screenshot({ path: `${OUT}/review.png` })
    console.log('captured review')
  } finally {
    await browser?.close()
    vite.kill()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1) })
