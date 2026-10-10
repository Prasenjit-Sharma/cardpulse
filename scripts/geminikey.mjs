// The paid Gemini key for the lab scripts (brief-lab, read-lab), read in this order: GEMINI_KEY, the Mac Keychain item
// "cardpulse-gemini-brief" (save it once: security add-generic-password -s cardpulse-gemini-brief -a brief -w),
// --clipboard, or pasted when asked (typing hidden). The paid project's key, so lab photos are never used to train models.
import { execFileSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'

export async function geminiKey(label = 'Gemini key') {
  const clean = (s) => s.replace(/\s+/g, '')
  let k = ''
  if (process.env.GEMINI_KEY) k = clean(process.env.GEMINI_KEY)
  if (!k) { try { k = clean(execFileSync('security', ['find-generic-password', '-s', 'cardpulse-gemini-brief', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) } catch { /* not in the Keychain */ } }
  if (!k && process.argv.includes('--clipboard')) k = clean(execFileSync('pbpaste', { encoding: 'utf8' }))
  if (!k) {
    if (!stdin.isTTY) { console.error('Set GEMINI_KEY, save it in the Keychain, or pass --clipboard after copying the key.'); process.exit(1) }
    stdout.write(`${label} (typing hidden, or just Enter to read the clipboard): `)
    k = await new Promise((resolve) => {
      let typed = '', timer
      stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
      const done = (v) => { clearTimeout(timer); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); resolve(v) }
      stdin.on('data', (chunk) => {
        if (chunk.includes('\u0003')) process.exit(130)
        typed += chunk
        clearTimeout(timer)
        if (/[\r\n]$/.test(chunk)) timer = setTimeout(() => done(clean(typed) || clean(execFileSync('pbpaste', { encoding: 'utf8' }))), 150)
      })
    })
  }
  if (!/^[\w.-]{30,}$/.test(k)) { console.error(`That does not look like an API key (read ${k.length} characters, starting "${k.slice(0, 4)}"). Copy the key itself and try again.`); process.exit(1) }
  return k
}
