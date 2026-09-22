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
