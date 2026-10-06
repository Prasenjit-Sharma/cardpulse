// Run: node --test test/speech.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { dictateNative } from '../src/lib/speech.ts'

test('native dictation: what was heard is added, then the mic turns off', async () => {
  const got = [], ended = []
  const n = { listen: async () => 'call him next tuesday', stopListening: async () => {} }
  dictateNative(n, (t) => got.push(t), (why) => ended.push(why ?? 'done'))
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(got, ['call him next tuesday']); assert.deepEqual(ended, ['done'])
})

test('native dictation: nothing heard adds nothing; a refusal ends with its reason', async () => {
  const got = [], ended = []
  dictateNative({ listen: async () => '  ', stopListening: async () => {} }, (t) => got.push(t), (why) => ended.push(why ?? 'done'))
  dictateNative({ listen: async () => { throw new Error('Microphone permission not granted') }, stopListening: async () => {} }, (t) => got.push(t), (why) => ended.push(why ?? 'done'))
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(got, []); assert.deepEqual(ended, ['done', 'Microphone permission not granted'])
})

test('native dictation: Stop asks the phone to stop listening', async () => {
  let stopped = 0
  const stop = dictateNative({ listen: () => new Promise(() => {}), stopListening: async () => { stopped++ } }, () => {}, () => {})
  stop()
  assert.equal(stopped, 1)
})

test('native dictation: words heard so far are passed on as they arrive', async () => {
  const live = []
  const n = { listen: async (_lang, onPartial) => { onPartial?.('call'); onPartial?.('call him'); return 'call him tomorrow' }, stopListening: async () => {} }
  const got = []
  dictateNative(n, (t) => got.push(t), () => {}, (t) => live.push(t))
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(live, ['call', 'call him']); assert.deepEqual(got, ['call him tomorrow'])
})

// ── a dictation session: keeps listening across pauses until Done ──
import { dictationSession } from '../src/lib/speech.ts'
const tick = () => new Promise((r) => setTimeout(r, 0))
/** listen() answers from a script, one entry per utterance: a string, '' for silence, or an Error. */
function scripted(steps) {
  let i = 0, stopped = 0, pending = null
  const listen = (onPartial) => new Promise((resolve, reject) => {
    const s = steps[i++]
    if (s === undefined) { pending = resolve; return }      // waits until stopNow
    if (s instanceof Error) return reject(s)
    if (s) onPartial(s.split(' ')[0])
    resolve(s)
  })
  const stopNow = async () => { stopped++; pending?.(''); pending = null }
  return { listen, stopNow, stopped: () => stopped }
}

test('a session carries on across pauses and joins what was said', async () => {
  const s = scripted(['call him', 'next tuesday at four'])
  const views = []
  const d = dictationSession(s.listen, s.stopNow, (v) => views.push(v))
  await tick(); await tick()
  assert.equal(views.at(-1).status, 'listening')
  assert.ok(views.some((v) => v.live === 'call'), 'words in progress are shown live')
  assert.equal(await d.finish(), 'call him next tuesday at four')
})

test('two quiet spells in a row pause it instead of closing; the mic resumes', async () => {
  const s = scripted(['', '', 'hello again'])
  const views = []
  const d = dictationSession(s.listen, s.stopNow, (v) => views.push(v))
  for (let k = 0; k < 6; k++) await tick()
  assert.equal(views.at(-1).status, 'paused')
  d.resume()
  for (let k = 0; k < 4; k++) await tick()
  assert.equal(await d.finish(), 'hello again')
})

test('a failure shows as an error in the session, and Cancel drops everything', async () => {
  const s = scripted([new Error('the microphone is not allowed')])
  const views = []
  const d = dictationSession(s.listen, s.stopNow, (v) => views.push(v))
  await tick(); await tick()
  assert.equal(views.at(-1).status, 'error'); assert.match(views.at(-1).error, /microphone/)
  d.cancel()
})
