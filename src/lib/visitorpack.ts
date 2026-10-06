import { supabase } from './supabase.ts'

// Visitor pack: per event, up to 3 files, one web link and a short note, shown to a stall visitor right after they send
// their details on the Collect-leads page (migration 0004). It lives on the server only, per account.

export const MAX_FILES = 3
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_NOTE = 300
export const MAX_LABEL = 80
const TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const BUCKET = 'visitor-packs'

export interface PackFile { name: string; path: string; size: number; type: string }
export interface Pack { note: string; linkUrl: string; linkLabel: string; files: PackFile[] }
/** A pack being edited: files already stored, and new ones picked on the phone. */
export interface PackDraft { note: string; linkUrl: string; linkLabel: string; files: (PackFile | File)[] }

export const emptyPack = (): Pack => ({ note: '', linkUrl: '', linkLabel: '', files: [] })
export const isEmptyPack = (p: Pick<Pack, 'note' | 'linkUrl'> & { files: unknown[] }): boolean => !p.note.trim() && !p.linkUrl.trim() && !p.files.length

/** Why a file cannot go in the pack, or null when it can. */
export function checkFile(f: { name: string; size: number; type: string }): string | null {
  if (!TYPES.has(f.type)) return `${f.name} is not a PDF or a picture (JPEG, PNG or WebP).`
  if (f.size <= 0) return `${f.name} is empty.`
  if (f.size > MAX_FILE_BYTES) return `${f.name} is over 10 MB. Use a smaller file.`
  return null
}

/** The link as stored: a bare address gets https://; anything that is not a web address is refused. Empty is fine. */
export function checkLink(raw: string): { url: string } | { error: string } {
  const t = raw.trim()
  if (!t) return { url: '' }
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || /\s/.test(t) || url.length > 500) throw new Error('bad')
    return { url }
  } catch { return { error: 'That is not a web address. Try one like example.com/page.' } }
}

/** Where a file is kept: the owner's folder, the event, and an unguessable, storage-safe name. */
export const packPath = (owner: string, eventId: string, name: string, rand: string = crypto.randomUUID()): string =>
  `${owner}/${eventId.replace(/[^\w-]+/g, '_')}/${rand}-${name.replace(/[^\w.-]+/g, '-')}`

/** Stored files no longer in the pack, to be removed from storage. */
export const removedPaths = (before: PackFile[], after: PackFile[]): string[] => before.filter((f) => !after.some((a) => a.path === f.path)).map((f) => f.path)

/** "244 KB", "3.2 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A pack as the server sends it (table row or the visitor's answer), checked field by field. Null when there is none. */
export function readPack(raw: unknown): Pack | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  const link = checkLink(str(o.link_url, 500))
  const files = (Array.isArray(o.files) ? o.files : []).filter((f): f is PackFile => !!f && typeof f === 'object'
    && typeof (f as PackFile).name === 'string' && typeof (f as PackFile).path === 'string' && typeof (f as PackFile).size === 'number' && TYPES.has((f as PackFile).type)).slice(0, MAX_FILES)
  return { note: str(o.note, MAX_NOTE), linkUrl: 'url' in link ? link.url : '', linkLabel: str(o.link_label, MAX_LABEL), files }
}

/** The address a visitor opens a stored file at. */
export const fileUrl = (path: string): string => (supabase ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : '')

/* ---------- the owner's side: load, save, delete (signed in and online) ---------- */

const need = () => { if (!supabase) throw new Error('Cloud features are not configured.'); return supabase }

export async function loadPack(eventId: string): Promise<Pack> {
  const { data, error } = await need().from('visitor_packs').select('note, link_url, link_label, files').eq('event_id', eventId).maybeSingle()
  if (error) throw new Error('Could not load what visitors get. Check your connection.')
  return readPack(data) ?? emptyPack()
}

/** Uploads new files, removes the ones taken out, and stores the rest. An empty pack is deleted instead. */
export async function savePack(owner: string, eventId: string, before: Pack, draft: PackDraft): Promise<Pack> {
  const sb = need()
  const files: PackFile[] = []
  for (const f of draft.files.slice(0, MAX_FILES)) {
    if (!(f instanceof File)) { files.push(f); continue }
    const path = packPath(owner, eventId, f.name)
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false })
    // the server's own reason is shown: "Check your connection" hid a refusal that was not about the connection
    if (error) throw new Error(`Could not upload ${f.name}: ${error.message || 'no reason given'}.`)
    files.push({ name: f.name, path, size: f.size, type: f.type })
  }
  const link = checkLink(draft.linkUrl)
  if ('error' in link) throw new Error(link.error)
  const pack: Pack = { note: draft.note.trim().slice(0, MAX_NOTE), linkUrl: link.url, linkLabel: draft.linkLabel.trim().slice(0, MAX_LABEL), files }
  if (isEmptyPack(pack)) { await deletePack(eventId, before); return emptyPack() }
  const { error } = await sb.from('visitor_packs').upsert({ owner_id: owner, event_id: eventId, note: pack.note, link_url: pack.linkUrl, link_label: pack.linkLabel, files: pack.files, updated_at: new Date().toISOString() })
  if (error) throw new Error('Could not save. Check your connection and try again.')
  const gone = removedPaths(before.files, pack.files)
  if (gone.length) await sb.storage.from(BUCKET).remove(gone)               // best effort: a leftover file is harmless
  return pack
}

/** Every pack's files, for "Delete cloud data" (the rows go with delete_my_cloud_data). */
export async function removeAllPackFiles(): Promise<void> {
  const sb = need()
  const { data, error } = await sb.from('visitor_packs').select('files')
  if (error) { if (/does not exist|schema cache|PGRST20/i.test(error.message)) return; throw error }   // migration 0004 not run: nothing to remove
  const paths = (data ?? []).flatMap((r) => readPack(r)?.files.map((f) => f.path) ?? [])
  if (paths.length) { const { error: rm } = await sb.storage.from(BUCKET).remove(paths); if (rm) throw rm }
}

/** Removes an event's pack and its files. `known` avoids a lookup when the pack is already loaded. */
export async function deletePack(eventId: string, known?: Pack): Promise<void> {
  const sb = need()
  const pack = known ?? await loadPack(eventId).catch(() => emptyPack())
  if (pack.files.length) await sb.storage.from(BUCKET).remove(pack.files.map((f) => f.path))
  const { error } = await sb.from('visitor_packs').delete().eq('event_id', eventId)
  if (error) throw new Error('Could not delete what visitors get. Check your connection.')
}
