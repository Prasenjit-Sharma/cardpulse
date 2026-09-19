/**
 * Android's incoming-call screen shows only a contact's DISPLAY NAME, not the company field. Putting the company into the
 * name is how people make it show up on calls. Pure functions, shared by the vCard export and the Settings preview.
 */
export type NameFormat = 'name' | 'name-company' | 'company-name'

export const NAME_FORMATS: { id: NameFormat; label: string; example: (name: string, company: string) => string }[] = [
  { id: 'name-company', label: 'Name (Company)', example: (n, c) => displayName({ name: n, company: c }, 'name-company') },
  { id: 'company-name', label: 'Company - Name', example: (n, c) => displayName({ name: n, company: c }, 'company-name') },
  { id: 'name', label: 'Name only', example: (n, c) => displayName({ name: n, company: c }, 'name') },
]

export const DEFAULT_NAME_FORMAT: NameFormat = 'name-company'

/** The name to save to the phone. Falls back gracefully when a name or company is missing. */
export function displayName(c: { name: string; company: string }, fmt: NameFormat): string {
  const name = c.name.trim(), company = c.company.trim()
  if (!name) return company
  if (!company || fmt === 'name') return name
  return fmt === 'company-name' ? `${company} - ${name}` : `${name} (${company})`
}
