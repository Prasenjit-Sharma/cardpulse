// Local runner for the API without Cloudflare: node server/dev-server.mjs
// Env: GEMINI_API_KEY (required unless GEMINI_BASE points at a mock), PORT (default 8787), GEMINI_MODEL, GEMINI_BASE
import { createServer } from 'node:http'
import worker from './worker.ts'

const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_BASE: process.env.GEMINI_BASE,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? '',
  ALLOW_LAN: '1', // local development only
}

createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const r = await worker.fetch(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env)
  res.writeHead(r.status, Object.fromEntries(r.headers))
  res.end(Buffer.from(await r.arrayBuffer()))
}).listen(Number(process.env.PORT ?? 8787), () => console.log(`CardPulse API on http://localhost:${process.env.PORT ?? 8787}`))
