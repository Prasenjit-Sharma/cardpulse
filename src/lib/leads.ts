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

/** New leads for events the signed-in user owns, turned into contacts. Marks each as pulled so it is not fetched twice. */
export async function pullNewLeads(localEvents: EventRec[]): Promise<{ contact: Contact; eventId?: string }[]> {
  if (!supabase) return []
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return []
  const { data, error } = await supabase.from('leads').select('*').is('pulled_at', null).order('created_at', { ascending: true })
  if (error || !data || !data.length) return []
  const leads = data as Lead[]
  const out = leads.map((lead) => leadToContact(lead, localEvents))
  await supabase.from('leads').update({ pulled_at: new Date().toISOString() }).in('id', leads.map((l) => l.id))
  return out
}
