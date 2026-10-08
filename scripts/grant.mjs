// Run: npm run grant -- you@example.com pro [months]   (asks for the Supabase secret key, typed hidden)
// Gives one account a plan, a pack or an Exhibition pass, for testing until Play Billing (migration 0005's grant_*
// functions, which only the service role may call). Never shipped in the app. Prints the account's new balance.
import { createClient } from '@supabase/supabase-js'
import { secretKey } from './secret.mjs'

const URL = 'https://xqwslvteyhfmnxcnlpsg.supabase.co'
const ITEMS = {
  starter: ['grant_plan', 'starter'], plus: ['grant_plan', 'plus'], pro: ['grant_plan', 'pro'], unlimited: ['grant_plan', 'unlimited'],
  pack50: ['grant_pack', 'cards', 50], pack100: ['grant_pack', 'cards', 100], pack200: ['grant_pack', 'cards', 200],
  briefs10: ['grant_pack', 'briefs', 10], pass: ['grant_pass'],
}
const [email, what, n] = process.argv.slice(2)
if (!email || !ITEMS[what]) { console.error('Usage: npm run grant -- <email> starter|plus|pro|unlimited [months] | pack50|pack100|pack200 | briefs10 | pass'); process.exit(1) }

const SECRET = await secretKey()
const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } })
let user
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error(error.message); process.exit(1) }
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (data.users.length < 200) break
}
if (!user) { console.error(`No account for ${email}. Sign in once in the app first.`); process.exit(1) }

const [fn, a, b] = ITEMS[what]
const args = fn === 'grant_plan' ? { p_user: user.id, p_tier: a, p_months: Number(n ?? 1) }
  : fn === 'grant_pack' ? { p_user: user.id, p_kind: a, p_qty: b }
  : { p_user: user.id }
const { data, error } = await admin.rpc(fn, args)
if (error) { console.error(error.message); process.exit(1) }
console.log(`Granted ${what} to ${email}. Now:`)
console.log(`  plan ${data.tier}, cards left ${data.cards.left} (month ${data.cards.month.used}/${data.cards.month.allowance}, pack ${data.cards.pack}${data.cards.pass ? `, pass ${data.cards.pass.used}/${data.cards.pass.allowance}` : ''}), briefs left ${data.briefs.left}, lead capture ${data.canCollect ? 'on' : 'off'}`)
