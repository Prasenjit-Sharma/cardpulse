// Run: npm run test:sync
// Bundles the real sync engine with a stand-in for Supabase, then plays two phones (and a third account) against one
// in-memory server that follows migration 0002's rules. Each phone has its own IndexedDB and localStorage.
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
mkdirSync(here + 'out', { recursive: true })
await build({
  entryPoints: [here + 'entry.ts'], bundle: true, format: 'esm', platform: 'node', outfile: here + 'out/sync.mjs',
  define: { 'import.meta.env': '{}' }, logLevel: 'warning',
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /\/supabase(\.ts)?$/ }, () => ({ path: here + 'fakesupabase.ts' })) } }],
})
process.chdir(here)
await import('./sim.mjs')
