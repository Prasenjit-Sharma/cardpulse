import { needsAttention } from '../lib/attention'
import { dueLabel, dueStatus, localISO } from '../lib/followups'
import { companyList } from '../lib/companies'
import { overall, scoreCard, sumTallies } from '../lib/score'
import type { CardRecord } from '../lib/types'
import CardThumb from './CardThumb'
import Icon from './Icon'

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }

const isoToday = () => localISO()                       // the phone's own day, not UTC

/** An open album page: three empty sleeves on punched board, waiting for cards. */
function EmptySleeves() {
  return (
    <svg className="empty-sleeves" viewBox="0 0 260 200" aria-hidden="true">
      <rect x="10" y="8" width="240" height="184" rx="4" fill="var(--board-2)" stroke="var(--board-edge)" />
      {[34, 100, 166].map((cy) => <circle key={cy} cx="22" cy={cy} r="4" fill="var(--punch-hole)" stroke="var(--punch)" />)}
      {[22, 86, 150].map((y, i) => (
        <g key={y} opacity={1 - i * 0.26}>
          <rect x="38" y={y} width="198" height="52" rx="3" fill="var(--sleeve)" stroke="var(--board-edge)" />
          <rect x="38" y={y} width="198" height="2" fill="var(--sleeve-lip)" />
          <rect x="46" y={y + 8} width="60" height="36" rx="2" fill="var(--board-2)" stroke="var(--board-edge)" strokeDasharray="3 3" />
          <rect x="116" y={y + 16} width="78" height="4" rx="2" fill="var(--rule)" />
          <rect x="116" y={y + 26} width="52" height="3" rx="1.5" fill="var(--rule-soft)" />
        </g>
      ))}
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
          <EmptySleeves />
          <h2>The album is empty</h2>
          <p>Scan a card and it is seated in the first sleeve, with everything on it read and filed.</p>
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
            <button className={due.length ? 'warm' : ''} onClick={onInsights}><span>Follow-ups due</span><b className="num">{due.length}</b></button>
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
