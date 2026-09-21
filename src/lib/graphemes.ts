const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

/** What a reader sees as single letters. A Devanagari letter with its vowel sign, or a conjunct like श्री, is one unit, so cutting between units never leaves a dangling mark. */
export const graphemes = (s: string): string[] => (segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : [...s])

/** Text that only Latin-based scripts can be letter-spaced safely; spacing breaks the shaping of Devanagari and other scripts. */
export const isLatin = (s: string): boolean => !/[^\u0000-ɏ -⁯]/.test(s)
