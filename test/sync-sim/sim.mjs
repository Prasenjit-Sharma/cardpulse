// Two phones, one fake Supabase. Each phone loads its own copy of the real sync engine with its own IndexedDB and localStorage. Started by run.mjs.
import { IDBFactory } from 'fake-indexeddb'
import { copyFileSync } from 'node:fs'
import assert from 'node:assert/strict'

Object.defineProperty(globalThis.navigator, 'onLine', { get: () => !globalThis.__offline, configurable: true })

// ── the fake server: same rules as migration 0002 ──
const server = { items: new Map(), seq: 0, files: new Map(), uploads: 0, failDownloads: 0, consents: [] }
function client(uid) {
  const q = (table) => {
    const f = { filters: [], order: null, lim: Infinity, op: 'select', payload: null }
    const b = {
      select() { return b }, eq(k, v) { f.filters.push((r) => r[k] === v); return b }, gt(k, v) { f.filters.push((r) => r[k] > v); return b },
      is(k, v) { f.filters.push((r) => (r[k] ?? null) === v); return b }, order(k) { f.order = k; return b }, limit(n) { f.lim = n; return b },
      insert(p) { f.op = 'insert'; f.payload = p; return b }, update(p) { f.op = 'update'; f.payload = p; return b },
      then(res, rej) {
        try {
          if (table === 'consents') {
            if (f.op === 'insert') server.consents.push({ owner_id: uid, ...f.payload })
            if (f.op === 'update') server.consents.filter((c) => c.owner_id === uid && f.filters.every((fl) => fl(c))).forEach((c) => Object.assign(c, f.payload))
            return Promise.resolve({ data: null, error: null }).then(res, rej)
          }
          let rows = [...server.items.values()].filter((r) => r.owner_id === uid && f.filters.every((fl) => fl(r)))
          rows.sort((a, b) => a.seq - b.seq)
          rows = rows.slice(0, f.lim).map((r) => structuredClone(r))
          return Promise.resolve({ data: rows, error: null }).then(res, rej)
        } catch (e) { return Promise.reject(e).then(res, rej) }
      },
    }
    return b
  }
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: uid }, access_token: 't' } } }) },
    from: q,
    async rpc(name, args) {
      assert.equal(name, 'sync_push')
      let n = 0
      for (const it of JSON.parse(JSON.stringify(args.p_items))) {
        const key = `${uid}|${it.kind}|${it.id}`
        const cur = server.items.get(key)
        if (cur && cur.client_updated_at > it.updatedAt) continue
        server.items.set(key, { owner_id: uid, kind: it.kind, item_id: it.id, data: it.deleted ? null : it.data, deleted: !!it.deleted, client_updated_at: it.updatedAt, seq: ++server.seq })
        n++
      }
      return { data: n, error: null }
    },
    storage: { from: () => ({
      async upload(path, blob) { assert.ok(path.startsWith(uid + '/')); server.uploads++; server.files.set(path, Buffer.from(await blob.arrayBuffer())); return { error: null } },
      async download(path) {
        if (server.failDownloads > 0) { server.failDownloads--; return { data: null, error: new Error('network') } }
        const b = server.files.get(path); return b ? { data: new Blob([b]), error: null } : { data: null, error: new Error('not found') }
      },
      async remove(paths) { paths.forEach((p) => server.files.delete(p)); return { error: null } },
    }) },
  }
}

// ── phones ──
const stores = {}
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } }
globalThis.localStorage = new Proxy({}, { get: (_t, k) => stores[globalThis.__device][k] })
const factories = {}
globalThis.indexedDB = new Proxy({}, { get: (_t, k) => { const f = factories[globalThis.__device]; const v = f[k]; return typeof v === 'function' ? v.bind(f) : v } })
const phones = {}
async function makePhone(name, uid) {
  stores[name] = mem()
  globalThis.__device = name; globalThis.__client = client(uid); factories[name] = new IDBFactory()
  const file = `./out/sync-${name}.mjs`; copyFileSync('./out/sync.mjs', file)
  const mod = await import(file)
  const c = globalThis.__client
  phones[name] = new Proxy(mod, { get: (t, k) => k === "then" ? undefined : (...a) => { globalThis.__device = name; globalThis.__client = c; return t[k](...a) } })
  return phones[name]
}
const tick = () => new Promise((r) => setTimeout(r, 3))
const bytes = async (b) => b ? Buffer.from(await b.arrayBuffer()).toString() : undefined
const contact = (name) => ({ name, title: '', company: '', phones: [], emails: [], website: '', address: '', gstin: '', social: [] })
const done = (id, name, extra = {}) => ({ id, createdAt: 1, status: 'done', reviewed: false, extracted: [contact(name)], corrected: [contact(name)], ...extra })

const A = await makePhone('A', 'u1'), B = await makePhone('B', 'u1')
let pass = 0
const ok = (m) => { pass++; console.log('  ok ', m) }

// 1. first sync: A's finished card, event and own card reach B; the unfinished card does not
await A.putCard(done('c1', 'Asha', { image: new Blob(['front-1'], { type: 'image/jpeg' }), back: new Blob(['back-1']), original: new Blob(['orig']) }))
await A.putCard({ id: 'c2', createdAt: 2, status: 'pending', reviewed: false, image: new Blob(['p']) })
A.saveEvents([{ id: 'e1', name: 'Plast India', createdAt: 5 }])
await A.putMyCard({ id: 'm1', createdAt: 1, updatedAt: 1, label: '', name: 'Me', title: '', company: '', phones: [], emails: [], website: '', address: '', social: [], template: 'ledger', accent: 'graphite', font: 'archivo', photo: new Blob(['me-photo']) })
await A.enableSync('u1'); assert.equal(await A.runSync('u1'), false)
await B.enableSync('u1'); assert.equal(await B.runSync('u1'), true)
const b1 = await B.getCard('c1')
assert.equal(b1.corrected[0].name, 'Asha'); assert.equal(await bytes(b1.image), 'front-1'); assert.equal(await bytes(b1.back), 'back-1')
assert.equal(b1.original, undefined, 'undo copies stay on the phone that made them')
assert.equal(await B.getCard('c2'), undefined, 'a card still being read stays on its own phone')
assert.deepEqual(B.loadEvents().map((e) => e.name), ['Plast India'])
assert.equal(await bytes((await B.getMyCard('m1')).photo), 'me-photo')
assert.deepEqual(A.readOutbox(), {}, 'A\'s outbox is empty after pushing (the pending card is dropped until it finishes)')
ok('first sync carries finished cards, photos, events and own cards; not unfinished cards or undo copies')

// 2. unchanged photos are not uploaded again; an edit on B reaches A
const uploads = server.uploads
await tick(); await B.putCard({ ...(await B.getCard('c1')), corrected: [contact('Asha Rao')] })
await B.runSync('u1')
assert.equal(server.uploads, uploads, 'B re-sent the edited card without re-uploading its photos')
assert.equal(await A.runSync('u1'), true)
const a1 = await A.getCard('c1')
assert.equal(a1.corrected[0].name, 'Asha Rao'); assert.equal(await bytes(a1.image), 'front-1')
assert.equal(await bytes(a1.original), 'orig', 'A keeps its own undo copy while the photo is unchanged')
ok('an edit on one phone reaches the other, photos untouched and not re-sent')

// 3. both edit offline: the later edit wins everywhere, whichever phone syncs first
await tick(); await A.putCard({ ...(await A.getCard('c1')), corrected: [contact('Edit on A (earlier)')] })
await tick(); await B.putCard({ ...(await B.getCard('c1')), corrected: [contact('Edit on B (later)')] })
await B.runSync('u1'); await A.runSync('u1'); await B.runSync('u1')
assert.equal((await A.getCard('c1')).corrected[0].name, 'Edit on B (later)')
assert.equal((await B.getCard('c1')).corrected[0].name, 'Edit on B (later)')
await tick(); await A.putCard({ ...(await A.getCard('c1')), corrected: [contact('A again (latest)')] })
await tick(); await B.putCard({ ...(await B.getCard('c1')), corrected: [contact('B, newest')] })
await A.runSync('u1'); await B.runSync('u1'); await A.runSync('u1')
const fa = (await A.getCard('c1')).corrected[0].name, fb = (await B.getCard('c1')).corrected[0].name
assert.equal(fa, fb, 'both phones agree'); assert.equal(fa, 'B, newest', 'the newest stamp wins even when its phone syncs second')
ok('conflicting offline edits converge on the newest one')

// 4. a newer photo replaces the old one and drops the stale undo copy
await tick(); await B.putCard({ ...(await B.getCard('c1')), image: new Blob(['front-2']) })
await B.runSync('u1'); await A.runSync('u1')
const a4 = await A.getCard('c1')
assert.equal(await bytes(a4.image), 'front-2'); assert.equal(a4.original, undefined)
ok('a changed photo is downloaded, and the undo copy of the old photo is dropped')

// 5. deletions travel: card, event rename then delete, own card
await tick(); A.saveEvents([{ id: 'e1', name: 'Plast India 2026', createdAt: 5 }])
await A.runSync('u1'); await B.runSync('u1')
assert.equal(B.loadEvents()[0].name, 'Plast India 2026')
await tick(); await A.deleteCard('c1'); A.saveEvents([]); await A.deleteMyCard('m1')
await A.runSync('u1'); assert.equal(await B.runSync('u1'), true)
assert.equal(await B.getCard('c1'), undefined); assert.deepEqual(B.loadEvents(), []); assert.equal(await B.getMyCard('m1'), undefined)
assert.equal([...server.files.keys()].filter((k) => k.includes('c1')).length, 0, 'the deleted card\'s photos are gone from the server')
ok('renames and deletions reach the other phone, and deleted photos leave the server')

// 6. a local change waiting to go up is never overwritten by an older remote copy
await A.putCard(done('c3', 'Ravi')); await A.runSync('u1'); await B.runSync('u1')
await tick(); await A.putCard({ ...(await A.getCard('c3')), corrected: [contact('Ravi (A)')] }); await A.runSync('u1')
await tick(); globalThis.__offline = true
await B.putCard({ ...(await B.getCard('c3')), corrected: [contact('Ravi (B, newest)')] })
assert.equal(await B.runSync('u1'), false, 'offline: nothing happens, nothing is lost')
globalThis.__offline = false
await B.runSync('u1'); await A.runSync('u1')
assert.equal((await A.getCard('c3')).corrected[0].name, 'Ravi (B, newest)')
assert.equal((await B.getCard('c3')).corrected[0].name, 'Ravi (B, newest)')
ok('offline edits wait, then win over an older copy from the other phone')

// 7. a failed photo download is retried on the next run
await A.putCard(done('c4', 'Meena', { image: new Blob(['meena-front']) })); await A.runSync('u1')
server.failDownloads = 2   // the download in apply, and the retry at the end of the same run
await B.runSync('u1')
assert.ok(await B.getCard('c4'), 'the contact arrives even when its photo does not')
assert.equal((await B.getCard('c4')).image, undefined)
await B.runSync('u1')
assert.equal(await bytes((await B.getCard('c4')).image), 'meena-front')
ok('a failed photo download does not block the contact and is retried')

// 8. a third phone for another account sees nothing; sync off stops everything
const C = await makePhone('C', 'u2')
await C.enableSync('u2'); await C.runSync('u2')
assert.equal((await C.listCards()).length, 0, 'another account gets none of u1\'s data')
await B.disableSync()
await A.putCard(done('c5', 'After off')); await A.runSync('u1')
assert.equal(await B.runSync('u1'), false); assert.equal(await B.getCard('c5'), undefined)
await B.enableSync('u1'); await B.runSync('u1')
assert.ok(await B.getCard('c5'), 'turning sync back on catches up')
ok('accounts are isolated; turning sync off and on again catches up')

// 9. a card finishing its read later is pushed then
await A.putCard({ ...(await A.getCard('c2')), status: 'done', extracted: [contact('Late')], corrected: [contact('Late')] })
await A.runSync('u1'); await B.runSync('u1')
assert.equal((await B.getCard('c2')).corrected[0].name, 'Late')
ok('a card that finishes reading later syncs then')

console.log(`\n${pass} scenarios passed`)
