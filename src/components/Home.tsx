import { needsAttention } from '../lib/attention'
import { dueLabel, dueStatus, localISO } from '../lib/followups'
import { companyList } from '../lib/companies'
import { overall, scoreCard, sumTallies } from '../lib/score'
import type { CardRecord } from '../lib/types'
import CardThumb from './CardThumb'
import Icon from './Icon'

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }

const isoToday = () => localISO()                       // the phone's own day, not UTC

/** The empty home: a stack of two blank cards, drawn in the app's own palette. */
function EmptyCards() {
  return (
    <svg className="empty-sleeves" viewBox="0 0 220 150" aria-hidden="true">
      <rect x="44" y="18" width="150" height="86" rx="10" fill="var(--board-2)" transform="rotate(-6 119 61)" />
      <rect x="26" y="38" width="160" height="92" rx="10" fill="var(--sleeve)" stroke="var(--board-edge)" />
      <rect x="42" y="56" width="30" height="30" rx="15" fill="var(--brand-wash)" />
      <rect x="84" y="60" width="78" height="8" rx="4" fill="var(--rule)" />
      <rect x="84" y="75" width="52" height="6" rx="3" fill="var(--rule-soft)" />
      <rect x="42" y="102" width="96" height="6" rx="3" fill="var(--rule-soft)" />
    </svg>
  )
}

/**
 * Home is the overview, not a second contact list: three counts that each open the right screen, then what needs you.
 * Search lives in Contacts and Companies; scanning is the floating button.
 */
export default function Home({ cards, dupes, ready, needsKey, install, backupNudge, onBackup, onSnoozeBackup, onOpenContact, onContacts, onCompanies, onStarred, onAttention, onInsights, onAccuracy, onSetup }: {
  cards: CardRecord[]
  dupes: Map<string, CardRecord[]>
  ready: boolean
  needsKey: boolean
  install: Install
  backupNudge: boolean
  onBackup: () => void
  onSnoozeBackup: () => void
  onOpenContact: (id: string, idx: number) => void
  onContacts: () => void
  onCompanies: () => void
  onStarred: () => void
  onAttention: () => void
  onInsights: () => void
  onAccuracy: () => void
  onSetup: () => void
}) {
  const people = cards.filter((c) => c.status === 'done').flatMap((c) => (c.corrected ?? []).map((p, i) => ({ card: c, p, i })))
  const starred = people.filter((x) => x.p.priority).length
  const companies = companyList(cards).length
  const due = people.filter((x) => x.p.followUp && x.p.followUp <= isoToday())
  const upcoming = people.filter((x) => x.p.followUp && x.p.followUp > isoToday()).sort((a, b) => a.p.followUp!.localeCompare(b.p.followUp!))
  const toCheck = cards.filter((c) => needsAttention(c, dupes.has(c.id))).length
  const acc = overall(sumTallies(cards.filter((c) => c.opened).map(scoreCard).filter((x): x is NonNullable<typeof x> => !!x)))

  return (
    <>
      <header className="album-head">
        <span className="wordmark">CardPulse</span>
      </header>

      {needsKey && !ready && (
        <button className="banner-row" onClick={onSetup}><Icon name="spark" size={18} /><span className="grow"><strong>Add your Gemini key</strong><small>Needed to read cards</small></span><Icon name="chevron" size={18} /></button>
      )}
      {backupNudge && (
        <div className="banner-row static">
          <Icon name="download" size={18} />
          <span className="grow"><strong>Back up your contacts</strong><small>They are stored only on this phone</small></span>
          <button className="link" onClick={onBackup}>Back up</button>
          <button className="icon-btn ghost small" onClick={onSnoozeBackup} aria-label="Remind me later"><Icon name="x" size={16} /></button>
        </div>
      )}
      {install.visible && (
        <div className="banner-row static">
          <Icon name="download" size={18} />
          <span className="grow"><strong>Install CardPulse</strong><small>{install.mode === 'ios' ? 'Tap Share, then Add to Home Screen' : 'One-tap scanning from your home screen'}</small></span>
          {install.mode === 'native' && <button className="link" onClick={install.install}>Install</button>}
          <button className="icon-btn ghost small" onClick={install.dismiss} aria-label="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="empty-scan">
          <EmptyCards />
          <h2>No cards yet</h2>
          <p>Scan a business card and everything on it is read and saved as a contact, ready to call or message.</p>
        </div>
      ) : (
        <>
          <div className="ledger" role="group" aria-label="Your contacts at a glance">
            <button onClick={onContacts}><b className="num">{people.length}</b><span>Contacts</span></button>
            <button onClick={onCompanies}><b className="num">{companies}</b><span>Companies</span></button>
            <button onClick={onStarred}><b className="num">{starred}</b><span>Starred</span></button>
          </div>

          <div className="stats2 home-stats">
            <button className={toCheck ? 'warm' : ''} onClick={onAttention}><span>Needs attention</span><b className="num">{toCheck}</b></button>
            <button className={due.length ? 'warm' : ''} onClick={onInsights}><span>Follow-ups</span><b className="num">{due.length} due{upcoming.length > 0 && <small> · {upcoming.length} upcoming</small>}</b></button>
            <button onClick={onAccuracy}><span>Accuracy</span><b className="num">{acc == null ? '–' : `${Math.round(acc * 100)}%`}</b></button>
          </div>

          {due.length + upcoming.length > 0 && (
            <section>
              <h3 className="group">Follow-ups <button className="link" onClick={onInsights}>See all</button></h3>
              <div className="plain-list">
                {[...due, ...upcoming].slice(0, 3).map((x, n) => (
                  <div key={`${x.card.id}:${x.i}`} className="contact-row" style={{ ['--i' as string]: n }} onClick={() => onOpenContact(x.card.id, x.i)}>
                    <CardThumb blob={x.card.image} name={x.p.name} />
                    <div className="grow"><strong>{x.p.name}</strong><span className="muted">{x.p.company}</span></div>
                    <em className={`due${dueStatus(x.p.followUp, isoToday()).state === 'upcoming' ? '' : ' warn'}`}>{dueLabel(x.p.followUp, isoToday())}</em>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
