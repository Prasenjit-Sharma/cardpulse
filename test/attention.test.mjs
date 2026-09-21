// Run: node --test test/attention.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { attentionReasons, needsAttention } from '../src/lib/attention.ts'

const person = (o = {}) => ({ name: 'Rajesh Shah', title: '', company: 'ABC', phones: ['+91 98240 22893'], emails: ['r@abc.com'], website: '', address: '', gstin: '', social: [], ...o })
const card = (o = {}, people = [person()]) => ({ id: 'c', createdAt: 1, status: 'done', reviewed: false, corrected: people, ...o })

test('a clean card needs nothing', () => {
  assert.deepEqual(attentionReasons(card(), false), [])
  assert.equal(needsAttention(card(), false), false)
})
test('notes, tags, follow-up and priority never raise a flag', () => {
  assert.deepEqual(attentionReasons(card({}, [person({ note: 'x', tags: ['a'], followUp: '2026-10-01', priority: true })]), false), [])
})
test('a duplicate, a model warning and each fishy field are named in plain words', () => {
  assert.deepEqual(attentionReasons(card(), true), ['Possible duplicate'])
  assert.match(attentionReasons(card({ aiNotes: 'Email cut off' }), false)[0], /unsure/)
  assert.deepEqual(attentionReasons(card({}, [person({ name: '' })]), false), ['No name was found'])
  assert.deepEqual(attentionReasons(card({}, [person({ phones: [], emails: [] })]), false), ['No phone or email was found'])
  assert.deepEqual(attentionReasons(card({}, [person({ emails: ['nilayshah80@gma'] })]), false), ['An email address looks wrong'])
  assert.deepEqual(attentionReasons(card({}, [person({ phones: ['+91 982'] })]), false), ['A phone number looks wrong'])
  assert.deepEqual(attentionReasons(card({}, [person({ gstin: '24AABCA1234F1' })]), false), ['The GSTIN looks wrong'])
})
test('valid Indian numbers, landlines and a real GSTIN pass', () => {
  assert.deepEqual(attentionReasons(card({}, [person({ phones: ['+91 79 2643 1275', '02764 286120'], gstin: '24AABCA1234F1Z5' })]), false), [])
})
test('once the user has dealt with it, it stays quiet; failed and pending cards are not judged here', () => {
  assert.equal(needsAttention(card({ reviewed: true }), true), false)
  assert.deepEqual(attentionReasons(card({ status: 'error' }), true), [])
  assert.deepEqual(attentionReasons(card({ status: 'pending' }), true), [])
})
