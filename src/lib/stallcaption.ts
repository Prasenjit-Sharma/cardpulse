/** What the caption says by default, before the user edits it — matched to what scanning actually does in that mode. */
export const defaultCaption = (mode: 'share' | 'leads'): string =>
  mode === 'leads' ? 'Scan to view my card and share yours' : 'Scan to save my contact'
