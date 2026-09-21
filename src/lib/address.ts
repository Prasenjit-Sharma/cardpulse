export interface AddressParts { street: string; city: string; region: string; postcode: string; country: string }

const STATES: Record<string, string> = {
  gujarat: 'Gujarat', guj: 'Gujarat', maharashtra: 'Maharashtra', maha: 'Maharashtra', rajasthan: 'Rajasthan', raj: 'Rajasthan',
  delhi: 'Delhi', 'new delhi': 'Delhi', karnataka: 'Karnataka', 'tamil nadu': 'Tamil Nadu', tn: 'Tamil Nadu', telangana: 'Telangana',
  'andhra pradesh': 'Andhra Pradesh', kerala: 'Kerala', 'uttar pradesh': 'Uttar Pradesh', up: 'Uttar Pradesh', 'madhya pradesh': 'Madhya Pradesh',
  mp: 'Madhya Pradesh', punjab: 'Punjab', haryana: 'Haryana', 'west bengal': 'West Bengal', wb: 'West Bengal', odisha: 'Odisha', bihar: 'Bihar',
  jharkhand: 'Jharkhand', chhattisgarh: 'Chhattisgarh', uttarakhand: 'Uttarakhand', assam: 'Assam', goa: 'Goa', 'himachal pradesh': 'Himachal Pradesh',
  'jammu and kashmir': 'Jammu and Kashmir', chandigarh: 'Chandigarh',
}
const norm = (s: string) => s.toLowerCase().replace(/[.\s]+/g, ' ').trim()

/**
 * Best-effort split of one printed address line into vCard parts, so the phone's Contacts app shows a street, a city and a
 * postcode instead of one long street line. Indian pincode (6 digits) anchors it. Anything it cannot place stays in `street`.
 */
export function splitAddress(address: string): AddressParts {
  const empty: AddressParts = { street: address.trim(), city: '', region: '', postcode: '', country: '' }
  const text = address.replace(/\s+/g, ' ').trim()
  if (!text) return empty

  let country = ''
  let rest = text.replace(/[,\s]*\bindia\b\.?\s*$/i, () => { country = 'India'; return '' })
  const m = [...rest.matchAll(/(?<!\d)(\d{3}\s?\d{3})(?!\d)/g)].pop()
  if (!m) return { ...empty, country }
  const postcode = m[1]!.replace(/\s/g, '')
  const before = rest.slice(0, m.index).replace(/[\s,\-–]+$/, '')
  const after = rest.slice(m.index! + m[0].length).replace(/^[\s,\-–.]+|[\s,]+$/g, '')

  const segs = before.split(',').map((s) => s.trim()).filter(Boolean)
  let region = ''
  const tail = STATES[norm(after)]
  if (tail) region = tail
  else if (segs.length && STATES[norm(segs[segs.length - 1]!)]) region = STATES[norm(segs.pop()!)]!
  if (after && !tail) segs.push(after)                                                  // unrecognised trailing text is kept, not lost

  const city = segs.length > 1 ? segs.pop()!.replace(/[\s\-–]+$/, '') : ''
  return { street: segs.join(', '), city, region, postcode, country: country || (region || postcode ? 'India' : '') }
}
