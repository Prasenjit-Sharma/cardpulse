/**
 * The app's accent colour: one list, one function. Everything that is "the brand colour" (buttons, active tab, links,
 * highlights, the logo, avatars) reads the CSS variables this sets, so adding or changing a colour happens only here.
 *
 * `hex` is used on light surfaces and carries white text; `lite` is its lighter twin for dark mode and carries dark text.
 * Every pair is checked for contrast in test/accents.test.mjs.
 */
export interface Accent { id: string; name: string; hex: string; lite: string; suits: string }

export const ACCENTS: Accent[] = [
  { id: 'blue', name: 'Blue', hex: '#1A58C2', lite: '#8DB0F0', suits: 'Clear, trading desk' },
  { id: 'graphite', name: 'Graphite', hex: '#2A2F36', lite: '#C8CDD3', suits: 'Neutral, premium' },
  { id: 'navy', name: 'Navy', hex: '#1C3F73', lite: '#8AAEEA', suits: 'Trust, banking, legal' },
  { id: 'teal', name: 'Teal', hex: '#0E6F67', lite: '#4FC1B5', suits: 'Modern, fresh' },
  { id: 'forest', name: 'Forest', hex: '#1F6B3A', lite: '#7BC894', suits: 'Growth, finance' },
  { id: 'burgundy', name: 'Burgundy', hex: '#8C2340', lite: '#E58AA3', suits: 'Authority, hospitality' },
  { id: 'copper', name: 'Copper', hex: '#A34A08', lite: '#E8A25C', suits: 'Warm, manufacturing' },
  { id: 'indigo', name: 'Indigo', hex: '#3F4BA8', lite: '#9AA5F0', suits: 'Technology, consulting' },
  { id: 'plum', name: 'Plum', hex: '#6B2F7A', lite: '#C99AD8', suits: 'Creative, health' },
]

export const DEFAULT_ACCENT = 'blue'

/** An unknown or missing id falls back to the default, so a bad saved value can never leave the app uncoloured. */
export const accentById = (id?: string): Accent => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]!

/** Sets the two variables the stylesheet derives everything else from. Cheap enough to call on every change. */
export function applyAccent(id?: string, root: HTMLElement = document.documentElement): void {
  const a = accentById(id)
  root.style.setProperty('--brand-base', a.hex)
  root.style.setProperty('--brand-lite', a.lite)
}
