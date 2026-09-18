import type { ReactNode } from 'react'
import Icon from './Icon'

/** Empty screens are onboarding moments: say what belongs here and offer the one obvious next step. */
export default function EmptyState({ icon, title, text, action }: {
  icon: 'users' | 'booth' | 'camera'
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-art"><Icon name={icon} size={32} /></span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  )
}
