import Icon from './Icon'

/** Priority is one tap: a star on the contact page and on each row, never behind a menu. */
export default function StarButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button className={`star-btn${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? 'Remove priority' : 'Mark as priority'}
      onClick={(e) => { e.stopPropagation(); onToggle() }}>
      <Icon name="star" size={20} />
    </button>
  )
}
