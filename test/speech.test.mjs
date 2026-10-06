// Run: node --test test/speech.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeDictation } from '../src/lib/speech.ts'

/** A stand-in for the speech plugin: records calls and lets a test fire its events. */
function fakePlugin({ granted = true, available = true, startFails = false } = {}) {
  const handlers = {}, calls = []
  const p = {
    calls,
    emit: (ev, data) => (handlers[ev] ?? []).forEach((f) => f(data)),
    requestPermissions: async () => ({ speechRecognition: granted ? 'granted' : 'denied' }),
    available: async () => ({ available }),
    removeAllListeners: async () => { calls.push('removeAll'); for (const k of Object.keys(handlers)) delete handlers[k] },
    addListener: async (ev, f) => { (handlers[ev] ??= []).push(f); return { remove: async () => {} } },
    setPTTState: async (o) => { calls.push(`held:${o.held}`) },
    start: async (o) => { calls.push(`start:${o.continuousPTT}`); if (startFails) throw new Error('busy') },
    stop: async () => { calls.push('stop'); setTimeout(() => { p.emit('partialResults', { accumulatedText: 'call him tomorrow at four' }); p.emit('listeningState', { state: 'stopped', status: 'stopped', reason: 'userStop' }) }, 5) },
  }
  return p
}

test('a native dictation listens continuously and passes on the text so far and the voice level', async () => {
  const p = fakePlugin(), texts = [], levels = []
  const d = await nativeDictation(p, { lang: 'en-IN', onText: (t) => texts.push(t), onLevel: (l) => levels.push(l), onError: () => {} })
  assert.deepEqual(p.calls.filter((c) => c !== 'removeAll'), ['held:true', 'start:true'])
  p.emit('partialResults', { matches: ['call him'] })
  p.emit('partialResults', { accumulatedText: 'call him tomorrow', matches: ['tomorrow'] })
  p.emit('audioLevel', { level: 0.6 })
  assert.deepEqual(texts, ['call him', 'call him tomorrow']); assert.deepEqual(levels, [0.6])
  void d
})

test('Done stops the hold, waits for the last words, returns everything and cleans up', async () => {
  const p = fakePlugin()
  const d = await nativeDictation(p, { lang: 'en-IN', onText: () => {}, onError: () => {} })
  assert.equal(await d.finish(), 'call him tomorrow at four')
  assert.deepEqual(p.calls.slice(-3), ['held:false', 'stop', 'removeAll'])
})

test('Done still returns when the phone never confirms the stop', async () => {
  const p = fakePlugin()
  p.stop = async () => { p.calls.push('stop') }                 // silence from the plugin
  const d = await nativeDictation(p, { lang: 'en-IN', onText: () => {}, onError: () => {} })
  p.emit('partialResults', { matches: ['hello there'] })
  assert.equal(await d.finish(400), 'hello there')
})

test('a refused microphone, a missing recognizer or a failed start reject; errors during listening reach onError', async () => {
  await assert.rejects(nativeDictation(fakePlugin({ granted: false }), { lang: 'en-IN', onText: () => {}, onError: () => {} }), /microphone/)
  await assert.rejects(nativeDictation(fakePlugin({ available: false }), { lang: 'en-IN', onText: () => {}, onError: () => {} }), /speech recognition/)
  await assert.rejects(nativeDictation(fakePlugin({ startFails: true }), { lang: 'en-IN', onText: () => {}, onError: () => {} }), /busy/)
  const p = fakePlugin(), errors = []
  await nativeDictation(p, { lang: 'en-IN', onText: () => {}, onError: (m) => errors.push(m) })
  p.emit('error', { code: 'NETWORK', message: 'No connection to the speech service' })
  assert.deepEqual(errors, ['No connection to the speech service'])
})
