/**
 * OmniFile — image export worker (classic worker, plain JS, not bundled).
 * Receives an ImageBitmap + a CSS canvas filter string, renders the bitmap
 * with the filter applied into an OffscreenCanvas and encodes it to a Blob.
 *
 * Message in:  { bitmap, filter, type, quality }
 * Message out: { ok: true, blob } | { ok: false, error }
 */
self.onmessage = async (e) => {
  try {
    const { bitmap, filter, type, quality } = e.data
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (filter && filter.trim()) ctx.filter = filter
    ctx.drawImage(bitmap, 0, 0)
    const blob = await canvas.convertToBlob({ type, quality })
    self.postMessage({ ok: true, blob })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) })
  }
}
