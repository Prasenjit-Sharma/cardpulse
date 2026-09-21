/**
 * A minimal ZIP writer and reader (stored, no compression). Backups are mostly JPEGs, which do not compress, so this keeps the
 * code tiny and dependency-free, and the result opens in any ordinary zip tool.
 */
const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry { name: string; data: Blob | Uint8Array | string }
export interface ZipFile { name: string; size: number; crc: number; blob: Blob }

const enc = new TextEncoder()
const dec = new TextDecoder()

async function bytesOf(d: ZipEntry['data']): Promise<Uint8Array> {
  if (typeof d === 'string') return enc.encode(d)
  if (d instanceof Uint8Array) return d
  return new Uint8Array(await d.arrayBuffer())
}

/** A DOS date and time for "now", as zip headers want them. */
function dosStamp(d = new Date()): { time: number; date: number } {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }
}

export async function createZip(entries: ZipEntry[], now = new Date()): Promise<Blob> {
  const { time, date } = dosStamp(now)
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const bytes = await bytesOf(e.data)
    const name = enc.encode(e.name)
    const crc = crc32(bytes)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, time, true); local.setUint16(12, date, true); local.setUint32(14, crc, true)
    local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    parts.push(local.buffer, name, bytes as BlobPart)

    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true)
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true)
    c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + bytes.length
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer], { type: 'application/zip' })
}

/** Lists the files in a zip made by `createZip` (or any zip that stores without compression). Throws on anything else. */
export async function readZip(blob: Blob): Promise<ZipFile[]> {
  const tailLen = Math.min(blob.size, 22 + 65535)
  const tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer())
  const tv = new DataView(tail.buffer)
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('This is not a CardPulse backup file.')
  const count = tv.getUint16(eocd + 10, true)
  const cdSize = tv.getUint32(eocd + 12, true)
  const cdOffset = tv.getUint32(eocd + 16, true)
  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer())
  const cv = new DataView(cd.buffer)
  const files: ZipFile[] = []
  let p = 0
  for (let n = 0; n < count; n++) {
    if (cv.getUint32(p, true) !== 0x02014b50) throw new Error('The backup file is damaged.')
    const method = cv.getUint16(p + 10, true)
    const crc = cv.getUint32(p + 16, true)
    const size = cv.getUint32(p + 24, true)
    const nameLen = cv.getUint16(p + 28, true), extraLen = cv.getUint16(p + 30, true), commentLen = cv.getUint16(p + 32, true)
    const local = cv.getUint32(p + 42, true)
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen))
    if (method !== 0) throw new Error('This backup uses compression that CardPulse cannot open.')
    const lh = new DataView(await blob.slice(local, local + 30).arrayBuffer())
    const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true)
    files.push({ name, size, crc, blob: blob.slice(start, start + size) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

/** A file's bytes, checked against the checksum stored in the zip. */
export async function readVerified(f: ZipFile): Promise<Uint8Array> {
  const bytes = new Uint8Array(await f.blob.arrayBuffer())
  if (crc32(bytes) !== f.crc) throw new Error(`The backup file is damaged (${f.name}).`)
  return bytes
}
