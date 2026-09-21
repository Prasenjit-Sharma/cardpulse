const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

/** A written index tab, not a rainbow bubble: board stock washed with the accent, so a list of thirty reads as one page. */
export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        width: size, height: size, fontSize: size * 0.34,
      }}
    >
      {initials(name)}
    </span>
  )
}
