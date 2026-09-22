import { supabase } from './supabase.ts'
import type { Contact, EventRec } from './types.ts'

export interface Lead {
  id: string; card_id: string; event_id: string | null; event_name: string | null
  name: string; phone: string | null; email: string | null; company: string | null; created_at: string
}

/** A visitor's submission, turned into an ordinary contact. Never invents an event the device does not have. */
export function leadToContact(lead: Lead, localEvents: EventRec[]): { contact: Contact; eventId?: string } {
  const matched = lead.event_id ? localEvents.find((e) => e.id === lead.event_id) : undefined
  const note = matched || !lead.event_name ? 'From your stall' : `From your stall (${lead.event_name})`
  const contact: Contact = {
    name: lead.name, title: '', company: lead.company ?? '',
    phones: lead.phone ? [lead.phone] : [], emails: lead.email ? [lead.email] : [],
    website: '', address: '', gstin: '', social: [], note,
  }
  return matched ? { contact, eventId: matched.id } : { contact }
}

export async function submitLead(cardId: string, eventId: string | null, eventName: string | null, fields: { name: string; phone: string; email: string; company: string }): Promise<void> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  const { error } = await supabase.rpc('submit_lead', {
    p_card_id: cardId, p_event_id: eventId, p_event_name: eventName,
    p_name: fields.name.trim(), p_phone: fields.phone.trim() || null, p_email: fields.email.trim() || null, p_company: fields.company.trim() || null,
  })
  if (error) throw error
}

export interface PulledLead { leadId: string; contact: Contact; eventId?: string }

/**
 * New leads for events the signed-in user owns, turned into contacts. Does NOT mark anything as pulled — that is a
 * separate step (`markLeadsPulled`), done by the caller only for the ones it actually wrote locally, so a lead is
 * never marked pulled and then lost if the local write fails.
 */
export async function pullNewLeads(localEvents: EventRec[]): Promise<PulledLead[]> {
  if (!supabase) return []
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return []
  const { data, error } = await supabase.from('leads').select('*').is('pulled_at', null).order('created_at', { ascending: true })
  if (error || !data || !data.length) return []
  return (data as Lead[]).map((lead) => ({ leadId: lead.id, ...leadToContact(lead, localEvents) }))
}

export async function markLeadsPulled(leadIds: string[]): Promise<void> {
  if (!supabase || !leadIds.length) return
  await supabase.from('leads').update({ pulled_at: new Date().toISOString() }).in('id', leadIds)
}

/**
 * Applies each pulled lead via `write` (the caller's local save). Only the ids whose write actually succeeded are
 * returned — a lead whose local write fails stays unmarked and is picked up again on the next pull, instead of
 * being silently lost.
 */
export async function applyPulledLeads(pulled: PulledLead[], write: (contact: Contact, eventId?: string) => Promise<void>): Promise<string[]> {
  const succeeded: string[] = []
  for (const { leadId, contact, eventId } of pulled) {
    try { await write(contact, eventId); succeeded.push(leadId) } catch { /* left unmarked: retried on the next pull */ }
  }
  return succeeded
}
