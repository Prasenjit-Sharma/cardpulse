/**
 * Made-up sample data for the store screenshots, written through the app's own storage functions. Runs inside the
 * throwaway Playwright browser (scripts/store-capture.mjs), never in a real install. Every person, company, number and
 * event here is invented.
 */
import { putCardRaw } from '/src/lib/db.ts'
import { saveEventsRaw } from '/src/lib/events.ts'
import { emptyCard, putMyCardRaw } from '/src/lib/mycards.ts'
import { localISO } from '/src/lib/followups.ts'
import type { CardRecord, Contact } from '/src/lib/types.ts'

const DAY = 86_400_000
const now = Date.now()
const iso = (offsetDays: number) => localISO(new Date(now + offsetDays * DAY))

const person = (p: Partial<Contact> & Pick<Contact, 'name' | 'company'>): Contact => ({
  title: '', phones: [], emails: [], website: '', address: '', gstin: '', social: [], ...p,
})

/** A business card photo drawn on a canvas, so the contact pages show a card rather than an empty frame. */
async function cardPhoto(c: Contact, tone: string): Promise<Blob> {
  const cv = new OffscreenCanvas(1050, 600)
  const g = cv.getContext('2d')!
  g.fillStyle = '#FBFAF6'; g.fillRect(0, 0, 1050, 600)
  g.fillStyle = tone; g.fillRect(0, 0, 1050, 18); g.fillRect(70, 90, 70, 70)
  g.fillStyle = '#1A1A24'; g.font = '700 30px sans-serif'; g.fillText(c.company.toUpperCase(), 165, 138)
  g.font = '700 52px sans-serif'; g.fillText(c.name, 70, 300)
  g.fillStyle = '#55556A'; g.font = '400 30px sans-serif'; g.fillText(c.title, 70, 345)
  g.font = '400 28px sans-serif'
  ;[...c.phones, ...c.emails, c.website].filter(Boolean).forEach((line, i) => g.fillText(line, 70, 440 + i * 40))
  return cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
}

const EVENT = { id: 'ev-plast', name: 'India Plast 2026', createdAt: now - 2 * DAY, start: iso(-1), end: iso(1) }
const OLD_EVENT = { id: 'ev-auto', name: 'Auto Expo Components', createdAt: now - 40 * DAY, start: iso(-42), end: iso(-40) }

const RAJESH = person({
  name: 'Rajesh Shah', title: 'Director', company: 'ABC Polymers Pvt. Ltd.',
  phones: ['+91 98240 22893', '0261 245 6789'], emails: ['rajesh@abcpolymers.in'], website: 'abcpolymers.in',
  address: 'Plot 42, GIDC Sachin, Surat, Gujarat 394230', gstin: '24AABCA1234F1Z5',
  followUp: iso(0), priority: true, tags: ['Hot lead'],
  note: 'Wants 2-colour printed woven sacks, 40k a month. Send samples.',
  brief: {
    person: 'Rajesh Shah has led ABC Polymers for over a decade and oversees its export business.',
    company: 'ABC Polymers makes woven polypropylene sacks and FIBC bags in Surat, and has opened a second plant this year.',
    starters: ['Ask how the new Surat plant is coming along', 'Their exports to Kenya doubled this year'],
    links: [], sources: [{ title: 'abcpolymers.in', uri: 'https://abcpolymers.in' }], suggestions: '',
    at: now - 2 * 3_600_000, model: 'sample',
  },
})

const PEOPLE: [Contact, string, number, string?][] = [
  [RAJESH, '#C62F22', 0, EVENT.id],
  [person({ name: 'Anita Kapoor', title: 'Head of Procurement', company: 'Kapoor Packaging', phones: ['+91 98110 45672'], emails: ['anita@kapoorpack.com'], website: 'kapoorpack.com', address: 'Okhla Phase II, New Delhi 110020', gstin: '07AAFCK4521M1Z2', followUp: iso(1) }), '#13773F', 0, EVENT.id],
  [person({ name: 'Vikram Rao', title: 'Sales Manager', company: 'Deccan Extrusions', phones: ['+91 98450 77120'], emails: ['vikram.rao@deccanx.in'], address: 'Peenya, Bengaluru 560058' }), '#3B2FC9', 0, EVENT.id],
  [person({ name: 'Meera Iyer', title: 'Founder', company: 'Iyer Bioplastics', phones: ['+91 98400 31845'], emails: ['meera@iyerbio.com'], website: 'iyerbio.com', address: 'Guindy, Chennai 600032', priority: true }), '#9A4A06', 0, EVENT.id],
  [person({ name: 'Arjun Malhotra', title: 'CEO', company: 'Malhotra Moulds', phones: ['+91 98728 64410'], emails: ['arjun@malhotramoulds.in'], address: 'Focal Point, Ludhiana 141010', followUp: iso(-1) }), '#2A1F9E', 0, EVENT.id],
  [person({ name: 'Sneha Patil', title: 'Purchase Officer', company: 'Sahyadri Agro Foods', phones: ['+91 99220 18453'], address: 'Nashik, Maharashtra 422007' }), '#13773F', 0, EVENT.id],
  [person({ name: 'Farhan Qureshi', title: 'Export Manager', company: 'Gulf Link Traders', phones: ['+91 98200 55731'], emails: ['farhan@gulflink.co'] }), '#C62F22', 0, EVENT.id],
  [person({ name: 'Kavita Joshi', title: 'Partner', company: 'Joshi & Sons Printers', phones: ['+91 94140 22987'], address: 'Sanganer, Jaipur 302029' }), '#3B2FC9', 0, EVENT.id],
  [person({ name: 'Rohit Bansal', title: 'Plant Head', company: 'Bansal Polyfab', phones: ['+91 98140 66032'], followUp: iso(3) }), '#9A4A06', -1, EVENT.id],
  [person({ name: 'Anita Kapoor', title: 'Head of Procurement', company: 'Kapoor Packaging', phones: ['+91 98110 45672'], emails: ['anita@kapoorpack.com'] }), '#13773F', -1, EVENT.id],
  [person({ name: 'Suresh Menon', title: 'Director', company: 'Kerala Coir Exports', phones: ['+91 94470 12876'], website: 'keralacoir.in', priority: true }), '#2A1F9E', -3],
  [person({ name: 'Pooja Desai', title: 'Brand Manager', company: 'Desai Snacks', phones: ['+91 98250 40981'], followUp: iso(2) }), '#C62F22', -4],
  [person({ name: 'Imran Sheikh', title: 'Owner', company: 'Sheikh Machine Tools', phones: ['+91 98221 70345'] }), '#3B2FC9', -38, OLD_EVENT.id],
  [person({ name: 'Lakshmi Narayanan', title: 'VP Operations', company: 'Coimbatore Pumps Ltd.', phones: ['+91 98430 26518'], gstin: '33AACCC9821K1Z7' }), '#13773F', -39, OLD_EVENT.id],
]

/** One card with four people on it, for the review screen (store/capture/review.tsx). */
export const GROUP_PEOPLE: Contact[] = [
  person({ name: 'Nikhil Agarwal', title: 'Managing Partner', company: 'Agarwal Associates', phones: ['+91 98300 51247'], emails: ['nikhil@agarwalca.in'] }),
  person({ name: 'Priya Sen', title: 'Partner', company: 'Agarwal Associates', phones: ['+91 98310 77802'], emails: ['priya@agarwalca.in'] }),
  person({ name: 'Rahul Ghosh', title: 'Partner', company: 'Agarwal Associates', phones: ['+91 98361 22094'] }),
  person({ name: 'Tanya Bose', title: 'Associate Director', company: 'Agarwal Associates', phones: ['+91 98744 63150'], emails: ['tanya@agarwalca.in'] }),
]

export async function seed(): Promise<void> {
  saveEventsRaw([EVENT, OLD_EVENT])
  let n = 0
  for (const [c, tone, day, eventId] of PEOPLE) {
    const createdAt = now + day * DAY - (n++) * 7 * 60_000
    const card: CardRecord = {
      id: `sample-${n}`, createdAt, updatedAt: createdAt, image: await cardPhoto(c, tone), status: 'done',
      extracted: [structuredClone(c)], corrected: [structuredClone(c)], reviewed: true, opened: true, eventId,
    }
    await putCardRaw(card)
  }
  await putMyCardRaw({
    ...emptyCard(), id: 'my-aarav', label: 'Work', name: 'Aarav Mehta', title: 'Founder', company: 'Mehta Exports',
    phones: ['+91 98765 43210'], emails: ['aarav@mehtaexports.in'], website: 'mehtaexports.in', address: 'Andheri East, Mumbai 400069',
  })
  localStorage.setItem('cardpulse.tour', '1')
  localStorage.setItem('cardpulse.tips', JSON.stringify(['scan-modes', 'events', 'contact', 'mycard']))
  localStorage.setItem('cardpulse.activeEvent', EVENT.id)
  localStorage.setItem('cardpulse.lastBackup', String(now))   // no 'export a copy' reminder on Home
}
