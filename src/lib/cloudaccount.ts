import { supabase } from './supabase'

// The account's cloud footprint: counts for published cards, taking a card down, and deleting everything on request.

export interface CardStats { views: number; leads: number }

/** View and lead counts for each published card, by local card id. Empty when signed out, offline, or not set up. */
export async function fetchCardStats(): Promise<Map<string, CardStats>> {
  const out = new Map<string, CardStats>()
  if (!supabase) return out
  const { data } = await supabase.from('cards').select('local_card_id, view_count, lead_count')
  for (const r of (data ?? []) as { local_card_id: string; view_count: number; lead_count: number }[]) out.set(r.local_card_id, { views: r.view_count, leads: r.lead_count })
  return out
}

/** One view per visit: a reload in the same browser session does not count again. Never blocks or fails the page. */
export async function recordCardView(slug: string): Promise<void> {
  if (!supabase) return
  const key = `cardpulse.viewed.${slug}`
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1') } catch { /* storage blocked: count it anyway */ }
  await supabase.rpc('record_card_view', { p_slug: slug })
}

const QUEUE = 'cardpulse.unpublish'
const readQueue = (): string[] => { try { return JSON.parse(localStorage.getItem(QUEUE) ?? '[]') as string[] } catch { return [] } }
const writeQueue = (ids: string[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(ids)) } catch { /* private mode */ } }

/** A deleted digital card's public link is taken down; if that cannot happen now it waits for `flushUnpublish`. */
export function queueUnpublish(localCardId: string) {
  writeQueue([...new Set([...readQueue(), localCardId])])
}

/** Takes down every queued card: its row (and so its link and any leads) and its public photo. */
export async function flushUnpublish(userId: string): Promise<void> {
  if (!supabase) return
  const left: string[] = []
  for (const id of readQueue()) {
    const { error } = await supabase.from('cards').delete().eq('owner_id', userId).eq('local_card_id', id)
    if (error) { left.push(id); continue }
    await supabase.storage.from('card-photos').remove([`${userId}/${id}.jpg`])
  }
  writeQueue(left)
}

/** Every file in the user's own folder of a bucket, removed a page at a time. */
async function emptyFolder(bucket: string, userId: string): Promise<void> {
  const seen = new Set<string>()
  for (;;) {
    const { data, error } = await supabase!.storage.from(bucket).list(userId, { limit: 100 })
    if (error) throw error
    if (!data?.length) return
    // A file that is still listed after being removed means the server refused quietly: stop rather than loop.
    if (data.some((f) => seen.has(f.name))) throw new Error('Could not delete your photos from the server. Try again later.')
    data.forEach((f) => seen.add(f.name))
    const { error: rmError } = await supabase!.storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`))
    if (rmError) throw rmError
  }
}

/** Everything this account has on the server — synced contacts, photos, published cards, leads. The phone keeps its copy. */
export async function deleteCloudData(userId: string): Promise<void> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  await emptyFolder('sync-photos', userId)
  await emptyFolder('card-photos', userId)
  const { error } = await supabase.rpc('delete_my_cloud_data')
  if (error) throw new Error('Could not delete the cloud copy. Check your connection and try again.')
}

/** The cloud data, then the account itself, then sign out. */
export async function deleteAccount(userId: string): Promise<void> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  await deleteCloudData(userId)
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw new Error('Could not delete the account. Check your connection and try again.')
  await supabase.auth.signOut()
}
