import { sanitizeCard, type MyCard } from './mycards.ts'
import { publicBase } from './platform.ts'
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

/** A card's public link from a given site address (testable without a window). */
export const publicCardUrlFrom = (base: string, slug: string, eventId?: string, eventName?: string): string => {
  const u = new URL(base)
  u.searchParams.set('card', slug)
  if (eventId) u.searchParams.set('event', eventId)
  if (eventName) u.searchParams.set('eventName', eventName)
  return u.toString()
}
/** The link other people open. From the app it is the public site, never the app's own https://localhost. */
export const publicCardUrl = (slug: string, eventId?: string, eventName?: string): string => publicCardUrlFrom(publicBase(), slug, eventId, eventName)

async function uploadPhoto(ownerId: string, card: MyCard): Promise<string | undefined> {
  if (!supabase || !card.photo) return undefined
  const path = `${ownerId}/${card.id}.jpg`
  const { error } = await supabase.storage.from('card-photos').upload(path, card.photo, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error
  return supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl
}

/**
 * Which unique constraint a Postgres 23505 violation actually came from. `cards` has two: one on `slug` and one on
 * `(owner_id, local_card_id)` — both raise the same error code, so the constraint name in the message is the only
 * way to tell a genuine slug collision from a same-card double-publish race.
 */
export function conflictKind(error: { code?: string; message?: string } | null | undefined): 'slug' | 'owner-local' | 'other' {
  if (!error || error.code !== '23505') return 'other'
  if (error.message?.includes('cards_slug_key')) return 'slug'
  if (error.message?.includes('cards_owner_id_local_card_id_key')) return 'owner-local'
  return 'other'
}

async function findExisting(ownerId: string, localCardId: string): Promise<{ id: string; slug: string } | null> {
  if (!supabase) return null
  const { data } = await supabase.from('cards').select('id, slug').eq('owner_id', ownerId).eq('local_card_id', localCardId).maybeSingle()
  return data
}

/** Publishes or refreshes a card. The slug is generated once on first publish and kept across every later republish. */
export async function publishCard(card: MyCard, ownerId: string): Promise<{ slug: string; publicUrl: string }> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  const payload = buildCardPayload(card)
  const photo_url = await uploadPhoto(ownerId, card)
  const existing = await findExisting(ownerId, card.id)
  if (existing) {
    const { error } = await supabase.from('cards').update({ ...payload, photo_url, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) throw error
    return { slug: existing.slug, publicUrl: publicCardUrl(existing.slug) }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug()
    const { error } = await supabase.from('cards').insert({ ...payload, owner_id: ownerId, photo_url, slug })
    if (!error) return { slug, publicUrl: publicCardUrl(slug) }
    const kind = conflictKind(error)
    if (kind === 'slug') continue                                      // genuine collision: try another random slug
    if (kind === 'owner-local') {                                      // a concurrent publish of the SAME card won the race first
      const race = await findExisting(ownerId, card.id)
      if (race) return { slug: race.slug, publicUrl: publicCardUrl(race.slug) }
    }
    throw error
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
