const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

function hue(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/**
 * A written index tab, not a rainbow bubble: board stock tinted a few degrees off the album's own
 * teals and greens, so a list of thirty reads as one page rather than a colour chart.
 */
export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const h = 165 + (hue(name || "?") % 40)   // teal through green: the palette's own range
  return (
    <span
      className="avatar"
      style={{
        width: size, height: size, fontSize: size * 0.34,
        background: `hsl(${h} 16% 88%)`, color: `hsl(${h} 32% 26%)`,
      }}
    >
      {initials(name)}
    </span>
  )
}
