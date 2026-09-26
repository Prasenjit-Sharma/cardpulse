import type { Interaction } from './followups.ts'
import type { PhoneKind } from './phones.ts'

export interface Contact {
  name: string
  title: string
  company: string
  phones: string[]
  emails: string[]
  website: string
  address: string
  gstin: string
  social: string[]
  /** Free-text note (typed or dictated). */
  note?: string
  /** ISO date (yyyy-mm-dd) to follow up on. */
  followUp?: string
  /** Why this contact matters: Customer, Supplier, Hot lead, or anything custom. */
  tags?: string[]
  priority?: boolean
  /** Labels the user gave numbers, keyed by `phoneKey`. Unlabelled numbers are guessed from their shape (see phones.ts). */
  phoneKinds?: Record<string, PhoneKind>
  /** `phoneKey` of the number the user wants first: called, exported and shown at the top. */
  mainPhone?: string
  /** Calls, meetings and messages with this person, newest first. Kept in the app only; never exported to the phone's contacts. */
  log?: Interaction[]
}

export type Status = 'pending' | 'running' | 'done' | 'error'

export interface CardRecord {
  id: string
  createdAt: number
  /** Front of the card (or the only side). Absent when the user chose not to keep photos. */
  image?: Blob
  /** The photo as first taken, kept only after the user adjusts the crop so the adjustment can be undone. */
  original?: Blob
  /** Same, for the back side. */
  originalBack?: Blob
  /** Optional back side; read together with the front as ONE card. */
  back?: Blob
  /** `image` is only a small thumbnail, so the card cannot be re-read. */
  thumbOnly?: boolean
  status: Status
  error?: string
  model?: string
  latencyMs?: number
  /** How many cards shared the Gemini call that read this one (1 = read on its own). Time and tokens are that call's share. */
  batchSize?: number
  tokensIn?: number
  tokensOut?: number
  languages?: string[]
  aiNotes?: string
  /** What the model returned — never modified after extraction. */
  extracted?: Contact[]
  /** What the user says is right. Equals `extracted` until edited. */
  corrected?: Contact[]
  /** The user has dealt with anything flagged on this card: edited a basic field, or said "Looks fine". */
  reviewed: boolean
  /** Why a pending card is not being read right now: no signal, or a retry is coming. */
  waiting?: 'offline' | 'retry'
  /** Automatic retries used so far. */
  attempts?: number
  /** The contact page was opened at least once. Only opened cards count towards accuracy. */
  opened?: boolean
  /** Exhibition/event this card was captured at. */
  eventId?: string
  /** Where the contact came from when it was not read from a photo: a scanned QR code. Such cards never count towards accuracy. */
  source?: 'qr'
  /** Last change on any phone (ms). Sync keeps the newest copy. Absent on cards from before sync: use `createdAt`. */
  updatedAt?: number
}

export interface EventRec {
  id: string
  name: string
  createdAt: number
  /** First and last day (yyyy-mm-dd). The event is live between them, both days included. Absent on undated events. */
  start?: string
  end?: string
  /** Last rename (ms), for sync. Absent on events from before sync. */
  updatedAt?: number
}

export const emptyContact = (): Contact => ({
  name: '', title: '', company: '', phones: [], emails: [], website: '', address: '', gstin: '', social: [],
})

export const SCALAR_FIELDS = ['name', 'title', 'company', 'website', 'address', 'gstin'] as const
export const LIST_FIELDS = ['phones', 'emails', 'social'] as const
export type FieldKey = (typeof SCALAR_FIELDS)[number] | (typeof LIST_FIELDS)[number]
export const ALL_FIELDS: FieldKey[] = [...SCALAR_FIELDS, ...LIST_FIELDS]
