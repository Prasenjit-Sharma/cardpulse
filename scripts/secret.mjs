// The Supabase secret key for the admin scripts: from SUPABASE_SECRET_KEY if set, then the Mac Keychain item
// "cardpulse-supabase-secret" (save it once: security add-generic-password -s cardpulse-supabase-secret -a admin -w); otherwise asked for in the terminal
// with the typing hidden (or, on a Mac, read from the clipboard when Enter is pressed on an empty prompt), so it never
// lands in the shell history or a file. Line breaks, spaces and terminal paste markers in a pasted key are dropped.
import { execFileSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'

const clean = (s) => s.replace(/\x1b\[20[01]~/g, '').replace(/\s+/g, '')
const looksRight = (k) => /^sb_secret_[A-Za-z0-9_-]{10,}$/.test(k) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k)

function fromClipboard() {
  try { return clean(execFileSync('pbpaste', { encoding: 'utf8' })) } catch { return '' }
}

export async function secretKey() {
  let key = clean(process.env.SUPABASE_SECRET_KEY ?? '')
  if (!key) { try { key = clean(execFileSync('security', ['find-generic-password', '-s', 'cardpulse-supabase-secret', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) } catch { /* not in the Keychain */ } }
  if (!key) {
    if (!stdin.isTTY) { console.error('Set SUPABASE_SECRET_KEY, or run this in a terminal to be asked for it.'); process.exit(1) }
    stdout.write('Supabase secret key (Project Settings → API keys → Secret).\nPaste it and press Enter, or copy it and just press Enter to read the clipboard. Typing is hidden: ')
    key = await new Promise((resolve) => {
      let typed = ''
      let timer
      stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
      const done = (k) => { clearTimeout(timer); stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); resolve(k) }
      const onData = (chunk) => {
        if (chunk.includes('\u0003')) { done(''); process.exit(130) }
        // A paste arrives in one or more chunks and may carry its own line breaks: keep everything, and finish on an
        // Enter that comes on its own (a short pause after the last chunk), not on a line break inside the paste.
        for (const c of chunk) {
          if (c === '\u007f' || c === '\b') typed = typed.slice(0, -1)
          else typed += c
        }
        clearTimeout(timer)
        if (/[\r\n]$/.test(chunk)) timer = setTimeout(() => done(clean(typed) || fromClipboard()), 150)
      }
      stdin.on('data', onData)
    })
  }
  if (!looksRight(key)) {
    console.error(`That does not look like a secret key (${key ? `starts "${key.slice(0, 10)}…", ${key.length} characters` : 'nothing was read'}).`)
    console.error('Use the Secret key (starts sb_secret_), not the Publishable one (starts sb_publishable_).')
    process.exit(1)
  }
  return key
}
