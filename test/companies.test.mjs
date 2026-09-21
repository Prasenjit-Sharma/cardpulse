// Run: node --test test/companies.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { companyKey, companyList } from '../src/lib/companies.ts'

const card = (people, status = 'done') => ({ id: Math.random().toString(), status, corrected: people.map((company) => ({ name: 'x', company })) })

test('spelling and punctuation variants are one company', () => {
  assert.equal(companyKey('ABC Polymers Pvt. Ltd.'), companyKey('abc  polymers pvt ltd'))
  assert.notEqual(companyKey('ABC Polymers'), companyKey('ABC Plastics'))
})
test('counts people per company, biggest first, then alphabetical; blanks and unread cards are skipped', () => {
  const rows = companyList([card(['Zed Ltd', 'ABC Polymers Pvt. Ltd.']), card(['abc polymers pvt ltd', '', 'Beta Co']), card(['Ghost Co'], 'error')])
  assert.deepEqual(rows.map((r) => [r.name, r.n]), [['ABC Polymers Pvt. Ltd.', 2], ['Beta Co', 1], ['Zed Ltd', 1]])
})
