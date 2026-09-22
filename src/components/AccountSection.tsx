import { signInWithGoogle, signOut, useSession } from '../lib/auth'
import { cloudEnabled } from '../lib/supabase'
import Icon from './Icon'

/** Signing in unlocks the hosted card link and stall lead capture; everything else in the app works fully signed out. */
export default function AccountSection() {
  const session = useSession()
  if (!cloudEnabled) return null
  return (
    <>
      <h3 className="group">Account</h3>
      <section className="card">
        {session ? (
          <>
            <p className="hint">Signed in as {session.user.email}. This unlocks the hosted card link and stall lead capture.</p>
            <button className="outline wide" onClick={() => void signOut()}>Sign out</button>
          </>
        ) : (
          <>
            <p className="hint">Sign in to get a shareable link for your digital card and collect visitor details at a stall. Everything else in the app works without this.</p>
            <button className="cta small wide" onClick={() => void signInWithGoogle()}><Icon name="share" size={18} /> Sign in with Google</button>
          </>
        )}
      </section>
    </>
  )
}
