// Run: node --test test/accents.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCENTS, DEFAULT_ACCENT, accentById, applyAccent } from '../src/lib/accents.ts'

const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

// the app's real surfaces (src/styles.css)
const LIGHT = ['#F4F5F6', '#EBEDEF', '#E3E6E8', '#FFFFFF']
const DARK = ['#111315', '#181B1E', '#1E2226']

test('Graphite is first and the default', () => {
  assert.equal(DEFAULT_ACCENT, 'graphite'); assert.equal(ACCENTS[0].id, 'graphite')
})
test('every accent reads as text on every light surface, and carries white text', () => {
  for (const a of ACCENTS) {
    for (const bg of LIGHT) assert.ok(ratio(a.hex, bg) >= 4.5, `${a.name} on ${bg}: ${ratio(a.hex, bg).toFixed(2)}`)
    assert.ok(ratio('#FFFFFF', a.hex) >= 4.5, `${a.name} white on accent`)
  }
})
test('every light twin reads as text on every dark surface, and carries dark text', () => {
  for (const a of ACCENTS) {
    for (const bg of DARK) assert.ok(ratio(a.lite, bg) >= 4.5, `${a.name} twin on ${bg}: ${ratio(a.lite, bg).toFixed(2)}`)
    assert.ok(ratio('#0B0E10', a.lite) >= 4.5, `${a.name} dark text on twin`)
  }
})
test('ids are unique and an unknown id falls back to the default', () => {
  assert.equal(new Set(ACCENTS.map((a) => a.id)).size, ACCENTS.length)
  assert.equal(accentById('nope').id, 'graphite'); assert.equal(accentById(undefined).id, 'graphite'); assert.equal(accentById('navy').name, 'Navy')
})
test('applying an accent sets both variables', () => {
  const set = {}
  applyAccent('navy', { style: { setProperty: (k, v) => { set[k] = v } } })
  assert.deepEqual(set, { '--brand-base': '#1C3F73', '--brand-lite': '#8AAEEA' })
})
