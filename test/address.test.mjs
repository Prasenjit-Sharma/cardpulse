// Run: node --test test/address.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitAddress } from '../src/lib/address.ts'

test('city-pincode joined by a hyphen', () => {
  const a = splitAddress('1 & 2, Balaji Estate, Opp. Avtar Hotel, Narol-Isanpur Highway, Narol, Ahmedabad-382405')
  assert.deepEqual(a, { street: '1 & 2, Balaji Estate, Opp. Avtar Hotel, Narol-Isanpur Highway, Narol', city: 'Ahmedabad', region: '', postcode: '382405', country: 'India' })
})
test('a pincode with a space, and a state after it', () => {
  const a = splitAddress('101-102, "SHITI RATNA" 1st Floor, Near Panchwati Panch Rasta, Ellisbridge, AHMEDABAD-380 006.')
  assert.equal(a.postcode, '380006'); assert.equal(a.city, 'AHMEDABAD')
  const b = splitAddress('Survey No.353, At Nichi Mandal, Morbi-Halvad Road, Morbi-363642, Guj.')
  assert.equal(b.region, 'Gujarat'); assert.equal(b.postcode, '363642'); assert.equal(b.city, 'Morbi')
  assert.equal(b.street, 'Survey No.353, At Nichi Mandal, Morbi-Halvad Road')
})
test('a comma-separated pincode and a printed state', () => {
  const a = splitAddress('805/A Pinacle Building, Corporate Road, Prahladnagar, Ahmedabad, Gujarat 380015')
  assert.equal(a.city, 'Ahmedabad'); assert.equal(a.region, 'Gujarat'); assert.equal(a.postcode, '380015')
})
test('no pincode: everything stays in the street, nothing is invented', () => {
  assert.deepEqual(splitAddress('Some lane near the market'), { street: 'Some lane near the market', city: '', region: '', postcode: '', country: '' })
  assert.deepEqual(splitAddress(''), { street: '', city: '', region: '', postcode: '', country: '' })
})
test('a phone-like number is not mistaken for a pincode', () => {
  assert.equal(splitAddress('Plot 9, Ring Road, Surat 9824022893').postcode, '')
})

test('the vCard carries street, city, postcode and country as separate parts', async () => {
  const { toVCard } = await import('../src/lib/actions.ts')
  const c = { name: 'Nilay Shah', title: '', company: 'X', phones: [], emails: [], website: '', social: [], gstin: '', address: '1 & 2, Balaji Estate, Narol, Ahmedabad-382405' }
  const line = toVCard(c, '', 'name').split('\r\n').find((l) => l.startsWith('ADR'))
  assert.equal(line, 'ADR;TYPE=WORK:;;1 & 2\\, Balaji Estate\\, Narol;Ahmedabad;;382405;India')
})
