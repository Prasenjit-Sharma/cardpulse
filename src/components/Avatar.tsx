const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

function hue(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const h = hue(name || '?')
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 55% 92%)`, color: `hsl(${h} 45% 32%)` }}>
      {initials(name)}
    </span>
  )
}
