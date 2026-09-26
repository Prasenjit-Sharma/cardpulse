import { useState } from 'react'
import { signInWithGoogle, signOut, useSession } from '../lib/auth'
import { deleteAccount, deleteCloudData } from '../lib/cloudaccount'
import { cloudEnabled } from '../lib/supabase'
import type { SyncStatus } from '../lib/sync'
import type { SyncControl } from '../lib/useSync'
import { confirmAsk } from './Dialog'
import Sheet from './Sheet'
import { SettingGroup, SettingRow, SwitchRow } from './SettingRow'

export function statusLine(s: SyncStatus, enabled: boolean, now = Date.now()): string {
  if (!enabled) return 'Off. Contacts stay on this phone only.'
  if (s.kind === 'syncing') return 'Syncing…'
  if (s.kind === 'offline') return 'Waiting for network'
  if (s.kind === 'error') return s.message
  if (s.kind === 'idle' && s.at) {
    const min = Math.round((now - s.at) / 60_000)
    return min < 1 ? 'Synced just now' : min < 60 ? `Synced ${min} min ago` : `Synced at ${new Date(s.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
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
  const clearCloud = async () => {
    const ok = await confirmAsk({
      title: 'Delete cloud data?',
      message: 'Everything CardPulse keeps for your account on the server is deleted: synced contacts and photos, your card links, and any leads not yet received. This phone keeps its own copy.',
      confirmLabel: 'Delete', danger: true,
    })
    if (ok) void act(async () => { await deleteCloudData(userId); await sync.cleared(); return 'Your cloud data is deleted. Sync is off.' })
  }
  const removeAccount = async () => {
    const ok = await confirmAsk({
      title: 'Delete your account?',
      message: 'Your account and everything it keeps on the server are deleted, and your card links stop working. This phone keeps its own contacts. This cannot be undone.',
      confirmLabel: 'Delete account', danger: true,
    })
    if (ok) void act(async () => { await deleteAccount(userId); await sync.cleared(); return 'Your account is deleted.' })
  }
  const name = (session?.user.user_metadata as { full_name?: string } | undefined)?.full_name

  return (
    <>
      {session ? (
        <SettingGroup title="Account">
          <SettingRow icon="user" label={name || session.user.email || 'Signed in'} hint={name ? session.user.email : 'Signed in with Google'} />
          <SwitchRow icon="cloud" label="Sync across devices" hint={statusLine(sync.status, sync.enabled)} checked={sync.enabled} disabled={busy} onChange={toggle} />
          <SettingRow icon="logout" label="Sign out" chevron={false} disabled={busy} onClick={() => void signOut()} />
          <SettingRow icon="trash" label="Delete cloud data" hint="Keeps this phone's copy" danger disabled={busy} onClick={() => void clearCloud()} />
          <SettingRow icon="userx" label="Delete account" danger disabled={busy} onClick={() => void removeAccount()} />
        </SettingGroup>
      ) : (
        <SettingGroup title="Account" footer="Everything else in the app works without an account.">
          <SettingRow icon="user" label="Sign in with Google" hint="A shareable card link, stall leads, and sync between phones" onClick={() => void act(signInWithGoogle)} />
        </SettingGroup>
      )}
      {msg && <p className={msg.ok ? 'hint ok setting-msg' : 'hint bad setting-msg'} role="status">{msg.text}</p>}

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
            <button className="cta" onClick={turnOn}>Turn on</button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
