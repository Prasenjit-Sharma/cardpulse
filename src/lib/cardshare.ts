import type { MyCard } from './mycards.ts'

/** A safe, readable file name: "Rajesh-Shah-card.vcf". Letters of any script are kept. */
export function cardFileName(c: MyCard, ext: 'vcf' | 'png'): string {
  const base = c.name.trim().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return `${base ? base + '-card' : 'my-card'}.${ext}`
}

/** What "Copy as text" puts on the clipboard: what is on the card, one item a line. */
export const cardAsText = (c: MyCard): string =>
  [c.name, c.title, c.company, ...c.phones, ...c.emails, c.website, c.address].map((x) => x.trim()).filter(Boolean).join('\n')
