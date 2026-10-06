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

test('a refused microphone, a missing recognizer or a failed start reject', async () => {
  await assert.rejects(nativeDictation(fakePlugin({ granted: false }), { lang: 'en-IN', onText: () => {}, onError: () => {} }), /microphone/)
  await assert.rejects(nativeDictation(fakePlugin({ available: false }), { lang: 'en-IN', onText: () => {}, onError: () => {} }), /speech recognition/)
  await assert.rejects(nativeDictation(fakePlugin({ startFails: true }), { lang: 'en-IN', onText: () => {}, onError: () => {} }), /busy/)
})

test('after a pause the earlier words stay: the plugin sends them as accumulated, and the new sentence in matches', async () => {
  const p = fakePlugin(), texts = []
  await nativeDictation(p, { lang: 'en-IN', onText: (t) => texts.push(t), onError: () => {} })
  p.emit('partialResults', { matches: ['call him'] })
  p.emit('partialResults', { matches: ['call him'], accumulated: 'call him', isRestarting: true })     // the pause
  p.emit('partialResults', { matches: ['tomorrow'], accumulated: 'call him' })
  p.emit('partialResults', { matches: ['tomorrow at four'], accumulated: 'call him' })
  assert.equal(texts.at(-1), 'call him tomorrow at four')
})

test('pauses are not errors: silence and restart hiccups are ignored; only a session that ends on an error is reported', async () => {
  const p = fakePlugin(), errors = []
  await nativeDictation(p, { lang: 'en-IN', onText: () => {}, onError: (m) => errors.push(m) })
  p.emit('error', { code: 'NO_MATCH', message: 'No match' })
  p.emit('error', { code: 'SPEECH_TIMEOUT', message: 'No speech input' })
  p.emit('error', { code: 'CLIENT', message: 'Client side error' })
  p.emit('listeningState', { state: 'started', reason: 'userStart' })
  assert.deepEqual(errors, [], 'listening carries on')
  p.emit('error', { code: 'NETWORK', message: 'No connection to the speech service' })
  p.emit('listeningState', { state: 'stopped', status: 'stopped', reason: 'error', errorCode: 'NETWORK' })
  assert.deepEqual(errors, ['No connection to the speech service'])
})
