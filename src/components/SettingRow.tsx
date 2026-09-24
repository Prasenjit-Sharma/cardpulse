import type { ReactNode } from 'react'
import Icon from './Icon'

type IconName = Parameters<typeof Icon>[0]['name']

/** A titled block of rows: a grey band heading, then flat rows ruled apart by hairlines. */
export function SettingGroup({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <>
      <h3 className="group band">{title}</h3>
      <section className="setting-group">{children}</section>
      {footer && <p className="hint setting-foot">{footer}</p>}
    </>
  )
}

/**
 * One row. With `onClick` it is a button (a value and a chevron say it opens something); with `href` a link; with
 * neither, plain text. `trailing` replaces the default value/chevron (a switch, swatches).
 */
export function SettingRow({ icon, label, hint, value, onClick, href, danger, trailing, disabled, chevron = true }: {
  icon?: IconName; label: string; hint?: ReactNode; value?: string; onClick?: () => void; href?: string
  danger?: boolean; trailing?: ReactNode; disabled?: boolean; chevron?: boolean
}) {
  const body = (
    <>
      {icon && <Icon name={icon} size={20} />}
      <span className="grow"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      {trailing ?? (<>{value && <span className="setting-value">{value}</span>}{(onClick || href) && chevron && !danger && <Icon name="chevron" size={16} />}</>)}
    </>
  )
  const cls = `setting-row${danger ? ' danger' : ''}`
  if (href) return <a className={cls} href={href} target="_blank" rel="noreferrer">{body}</a>
  if (onClick) return <button type="button" className={cls} onClick={onClick} disabled={disabled}>{body}</button>
  return <div className={cls}>{body}</div>
}

/** A row that is itself the switch: the whole row is the tap target. */
export function SwitchRow({ icon, label, hint, checked, onChange, disabled }: {
  icon?: IconName; label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="setting-row" disabled={disabled} onClick={() => onChange(!checked)}>
      {icon && <Icon name={icon} size={20} />}
      <span className="grow"><strong>{label}</strong>{hint && <small role="status">{hint}</small>}</span>
      <span className="switch" aria-hidden="true"><i /></span>
    </button>
  )
}
