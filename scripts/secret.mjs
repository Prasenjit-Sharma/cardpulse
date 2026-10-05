// The Supabase secret key for the admin scripts: from SUPABASE_SECRET_KEY if set, otherwise asked for in the terminal
// with the typing hidden, so it never lands in the shell history or a file.
import { stdin, stdout } from 'node:process'

export async function secretKey() {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY.trim()
  if (!stdin.isTTY) { console.error('Set SUPABASE_SECRET_KEY, or run this in a terminal to be asked for it.'); process.exit(1) }
  stdout.write('Supabase secret key (Supabase dashboard → Project Settings → API keys; typing is hidden): ')
  return new Promise((resolve) => {
    let key = ''
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n') }
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { done(); return resolve(key.trim()) }
        if (c === '\u0003') { done(); process.exit(130) }
        if (c === '\u007f' || c === '\b') key = key.slice(0, -1)
        else key += c
      }
    }
    stdin.on('data', onData)
  })
}
