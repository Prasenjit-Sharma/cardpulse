// Run: node --test test/splash.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { hideSplash, setNative } from '../src/lib/platform.ts'

test('outside the app there is no splash to hide, and asking is harmless', () => {
  assert.doesNotThrow(() => hideSplash())
})
test('in the app the splash is let go once, however many places ask, and a failure is swallowed', async () => {
  let n = 0
  setNative({ hideSplash: async () => { n++; throw new Error('already gone') } })
  hideSplash(); hideSplash(); hideSplash()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(n, 1)
})
test('the plugin holds the launch splash until the app lets it go (a launchShowDuration of 0 skips the hold altogether)', async () => {
  const { default: config } = await import('../capacitor.config.ts')
  const s = config.plugins.SplashScreen
  assert.equal(s.launchAutoHide, false)
  assert.ok(s.launchShowDuration > 0)
})
test('a tip sits above the camera but under sheets, dialogs and the photo adjuster', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync('src/styles.css', 'utf8') + readFileSync('src/components/welcome.css', 'utf8')
  const z = (sel) => Number(css.match(new RegExp(`^\\${sel} \\{[^}]*z-index: (\\d+)`, 'm'))[1])
  assert.ok(z('.tip') > z('.camera'))
  assert.ok(z('.tip') < z('.sheet-wrap') && z('.tip') < z('.adjust'))
})
