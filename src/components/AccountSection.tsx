import { useState } from 'react'
import { signInWithGoogle, signOut, useSession } from '../lib/auth'
import { deleteAccount, deleteCloudData } from '../lib/cloudaccount'
import { cloudEnabled } from '../lib/supabase'
import type { SyncStatus } from '../lib/sync'
import type { SyncControl } from '../lib/useSync'
import Icon from './Icon'
import Sheet from './Sheet'

function statusLine(s: SyncStatus, enabled: boolean, now = Date.now()): string {
  if (!enabled) return 'Off. Contacts stay on this phone only.'
  if (s.kind === 'syncing') return 'Syncing…'
  if (s.kind === 'offline') return 'Waiting for network'
  if (s.kind === 'error') return s.message
  if (s.kind === 'idle' && s.at) {
    const min = Math.round((now - s.at) / 60_000)
    return min < 1 ? 'Synced just now' : min < 60 ? `Synced ${min} min ago` : `Synced at ${new Date(s.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return 'On'
}

/** Signing in unlocks the hosted card link, stall lead capture and sync; everything else works fully signed out. */
export default function AccountSection({ sync }: { sync: SyncControl }) {
  const session = useSession()
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!cloudEnabled) return null

  const act = async (job: () => Promise<string | void>) => {
    setBusy(true); setMsg(null)
    try { const text = await job(); if (text) setMsg({ ok: true, text }) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'That did not work. Try again.' }) }
    setBusy(false)
  }
  const userId = session?.user.id ?? ''
  const toggle = () => { if (sync.enabled) void act(sync.turnOff); else setConsent(true) }
  const turnOn = () => { setConsent(false); void act(sync.turnOn) }
  const clearCloud = () => {
    if (!confirm('Delete everything CardPulse keeps for your account on the server? Synced contacts and photos, your card links and any leads not yet received. This phone keeps its own copy.')) return
    void act(async () => { await deleteCloudData(userId); await sync.cleared(); return 'Your cloud data is deleted. Sync is off.' })
  }
  const removeAccount = () => {
    if (!confirm('Delete your CardPulse account and everything it keeps on the server? Your card links stop working. This phone keeps its own contacts. This cannot be undone.')) return
    void act(async () => { await deleteAccount(userId); await sync.cleared(); return 'Your account is deleted.' })
  }

  return (
    <>
      <h3 className="group">Account</h3>
      <section className="card">
        {session ? (
          <>
            <p className="hint" style={{ marginTop: 0 }}>Signed in as {session.user.email}.</p>
            <button role="switch" aria-checked={sync.enabled} className="switch-row" disabled={busy} onClick={toggle}>
              <Icon name="cloud" size={20} />
              <span className="grow"><strong>Sync across devices</strong><small role="status">{statusLine(sync.status, sync.enabled)}</small></span>
              <span className="switch" aria-hidden="true"><i /></span>
            </button>
            {msg && <p className={msg.ok ? 'hint ok' : 'hint bad'} role="status">{msg.text}</p>}
            <button className="outline wide" disabled={busy} onClick={() => void signOut()}>Sign out</button>
            <div className="account-danger">
              <button className="link-danger" disabled={busy} onClick={clearCloud}>Delete cloud data</button>
              <button className="link-danger" disabled={busy} onClick={removeAccount}>Delete account</button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">Sign in to get a shareable link for your digital card, collect visitor details at a stall, and sync your contacts between phones. Everything else in the app works without this.</p>
            <button className="cta small wide" onClick={() => void signInWithGoogle()}><Icon name="share" size={18} /> Sign in with Google</button>
          </>
        )}
      </section>

      <Sheet open={consent} onClose={() => setConsent(false)} title="Sync across devices">
        <div className="consent">
          <p>A copy of your contacts, their card photos, notes, events and your own cards is kept in CardPulse's cloud under <b>{session?.user.email}</b>, so they appear on any phone you sign in on.</p>
          <ul>
            <li>These are other people's details. Sync only the ones you have a business reason to keep.</li>
            <li>Deleting a contact on one phone deletes it on all of them.</li>
            <li>Turn sync off at any time. <b>Delete cloud data</b> removes the server copy; each phone keeps its own.</li>
          </ul>
          <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">How your data is handled</a>
          <div className="consent-actions">
            <button className="outline" onClick={() => setConsent(false)}>Not now</button>
            <button className="cta" onClick={turnOn}>Turn on sync</button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
