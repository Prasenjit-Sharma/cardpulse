import { sanitizeCard, type MyCard } from './mycards.ts'
import { supabase } from './supabase.ts'

/** Crockford's base32: digits and letters with the visually confusable ones (0/O, 1/I/L, U) removed. */
const SLUG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SLUG_LENGTH = 8

/** A random public slug. Collision odds are about 1 in 32^8 (≈1.1×10^12); the caller retries on a unique-constraint conflict. */
export function generateSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('')
}

export interface CardPayload {
  local_card_id: string; name: string; title: string; company: string
  phones: string[]; emails: string[]; website: string; address: string; social: string[]
  template: string; accent: string; font: string
}

/** What gets written to the `cards` row. The photo is never in here — it goes to Storage separately. */
export function buildCardPayload(card: MyCard): CardPayload {
  const c = sanitizeCard(card)
  return {
    local_card_id: c.id, name: c.name, title: c.title, company: c.company,
    phones: c.phones, emails: c.emails, website: c.website, address: c.address, social: c.social,
    template: c.template, accent: c.accent, font: c.font,
  }
}

export const publicCardUrl = (slug: string, eventId?: string, eventName?: string): string => {
  const u = new URL(window.location.origin + window.location.pathname)
  u.searchParams.set('card', slug)
  if (eventId) u.searchParams.set('event', eventId)
  if (eventName) u.searchParams.set('eventName', eventName)
  return u.toString()
}

async function uploadPhoto(ownerId: string, card: MyCard): Promise<string | undefined> {
  if (!supabase || !card.photo) return undefined
  const path = `${ownerId}/${card.id}.jpg`
  const { error } = await supabase.storage.from('card-photos').upload(path, card.photo, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error
  return supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl
}

/** Publishes or refreshes a card. The slug is generated once on first publish and kept across every later republish. */
export async function publishCard(card: MyCard, ownerId: string): Promise<{ slug: string; publicUrl: string }> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  const payload = buildCardPayload(card)
  const photo_url = await uploadPhoto(ownerId, card)
  const { data: existing } = await supabase.from('cards').select('id, slug').eq('owner_id', ownerId).eq('local_card_id', card.id).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('cards').update({ ...payload, photo_url, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) throw error
    return { slug: existing.slug, publicUrl: publicCardUrl(existing.slug) }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug()
    const { error } = await supabase.from('cards').insert({ ...payload, owner_id: ownerId, photo_url, slug })
    if (!error) return { slug, publicUrl: publicCardUrl(slug) }
    if (error.code !== '23505') throw error        // anything but "unique_violation" on the slug is a real failure
  }
  throw new Error('Could not publish the card. Try again.')
}

export interface PublicCardData {
  id: string; slug: string; name: string; title: string; company: string
  phones: string[]; emails: string[]; website: string; address: string; social: string[]
  photo_url: string | null; template: string; accent: string; font: string
}

/** `get_public_card` returns a set (zero or one rows), never a nullable single composite — see Task 4's ruling. */
export async function fetchPublicCard(slug: string): Promise<PublicCardData | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_public_card', { p_slug: slug })
  if (error || !data?.[0]) return null
  return data[0] as PublicCardData
}
