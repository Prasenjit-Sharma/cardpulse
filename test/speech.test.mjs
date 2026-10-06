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
