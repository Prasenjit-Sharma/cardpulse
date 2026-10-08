import Icon from './Icon'
import Sheet from './Sheet'

/**
 * What lead capture does, for an account without a plan or pass: a visitor scans, leaves their details, gets your
 * brochure. Shown instead of Collect leads and What visitors get; the database refuses them anyway (migration 0007).
 */
export default function LeadLock({ open, onClose, onPlans }: { open: boolean; onClose: () => void; onPlans: () => void }) {
  const steps: { icon: 'qr' | 'useradd' | 'file'; text: string }[] = [
    { icon: 'qr', text: 'A visitor scans your QR' },
    { icon: 'useradd', text: 'Leaves their name and number' },
    { icon: 'file', text: 'Gets your brochure at once' },
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Collect leads at any expo">
      <div className="consent">
        <ol className="lead-steps">
          {steps.map((s, i) => (
            <li key={s.text}><span className="lead-step-icon"><Icon name={s.icon} size={20} /></span><span><b>{i + 1}</b> {s.text}</span></li>
          ))}
        </ol>
        <p>Every lead lands in your contacts, filed under the expo. With any plan or the Exhibition pass.</p>
        <div className="consent-actions">
          <button className="outline" onClick={onClose}>Not now</button>
          <button className="cta" onClick={() => { onClose(); onPlans() }}>See plans</button>
        </div>
      </div>
    </Sheet>
  )
}
