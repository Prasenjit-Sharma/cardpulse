// Which Supabase project an admin script works on: --env test (pulse-test, the dev and staging apps; the default),
// --env prod (pulse-prod, the store app) or --env legacy (the first development project, until checklist C6).
// Each project's secret key is its own Mac Keychain item (save it once with the command printed when it is missing).
export const ENVS = {
  test: { url: 'https://efhhwamvfgcjgbpwfnuy.supabase.co', publishable: 'sb_publishable_QnRfHJSXzqXH5r2paLxE6A_ZemmJpsi', keychain: 'cardpulse-supabase-secret-test' },
  prod: { url: 'https://suhlynnoeatjnrokaaox.supabase.co', publishable: 'sb_publishable_w9PvGhjwDyhlquaeGyaC-w_wtwxcgNa', keychain: 'cardpulse-supabase-secret-prod' },
  legacy: { url: 'https://xqwslvteyhfmnxcnlpsg.supabase.co', publishable: 'sb_publishable_xRiJzrH9yCIo_NwHN1jNDw_zWfTAiqf', keychain: 'cardpulse-supabase-secret' },
}

/** The environment named by --env (default test), with its name; exits with a usage line on an unknown one. */
export function pickEnv(argv = process.argv) {
  const i = argv.indexOf('--env'), name = i > 0 ? argv[i + 1] : 'test'
  const env = ENVS[name]
  if (!env) { console.error(`Unknown --env ${name}: use test, prod or legacy.`); process.exit(1) }
  console.error(`Supabase project: ${name} (${env.url})`)
  return { name, ...env }
}

/** argv without the --env pair, so scripts keep reading their own positional arguments. */
export const argsWithoutEnv = (argv = process.argv) => { const i = argv.indexOf('--env'); return i > 0 ? [...argv.slice(0, i), ...argv.slice(i + 2)] : argv }
