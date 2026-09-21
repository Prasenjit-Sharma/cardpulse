import qrcode from 'qrcode-generator'

/** The library maps each character to one byte, which garbles Hindi and other scripts. Hand it the UTF-8 bytes instead, one per "character". */
const utf8 = (text: string) => unescape(encodeURIComponent(text))

/** A QR code as a square grid of dark (true) and light (false) modules, error correction M. The caller draws the quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(utf8(text), 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.isDark(y, x)))
}
