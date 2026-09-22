/** Loose but meaningful checks on what a stranger types into the stall lead form — enough to catch junk, not so strict a real answer is rejected. */
export const validEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())

/** `code` and `number` combined must have a plausible total digit count (E.164 tops out at 15; the shortest real numbers, code included, run about 8). */
export function validPhone(code: string, number: string): boolean {
  const digits = (code + number).replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

/** The stored phone string: code and number joined by one space, the code always starting with "+". */
export function formatPhone(code: string, number: string): string {
  const c = code.trim().replace(/^\+?/, '+')
  const n = number.replace(/[^\d]/g, '')
  return `${c} ${n}`
}

export interface LeadFormFields { name: string; code: string; phone: string; email: string }

/** Whether the form is ready to send, and why not when it isn't. */
export function canSendLead(f: LeadFormFields): { ok: true } | { ok: false; message: string } {
  if (!f.name.trim()) return { ok: false, message: 'Add your name.' }
  const hasPhone = f.phone.trim().length > 0
  const hasEmail = f.email.trim().length > 0
  if (!hasPhone && !hasEmail) return { ok: false, message: 'Add a phone or email so they can reach you.' }
  if (hasPhone && !validPhone(f.code, f.phone)) return { ok: false, message: 'That phone number doesn’t look right.' }
  if (hasEmail && !validEmail(f.email)) return { ok: false, message: 'That email doesn’t look right.' }
  return { ok: true }
}
