/**
 * Pure-Canvas image tools for the OmniFile image editor (Task 2-b).
 *
 * Everything here runs 100% client-side with plain Canvas 2D APIs —
 * no dependencies, no fetch, no network. Heavy pixel work is kept inside
 * these helpers; the editor shows a busy state around the async calls and
 * yields to the UI between encode iterations.
 */

/* --------------------------------- helpers --------------------------------- */

function bitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  return canvas
}

/** Decode any image Blob into a fresh canvas (the source is never mutated). */
export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    try {
      return bitmapToCanvas(bitmap)
    } finally {
      try {
        bitmap.close()
      } catch {
        /* ignore */
      }
    }
  }

  // Fallback for browsers without createImageBitmap: <img> + object URL.
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('image encode failed'))),
      mime,
      quality
    )
  })
}

/** Yield to the event loop so spinners and state changes can paint. */
const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function downscaleCanvas(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(src.width * factor))
  const h = Math.max(1, Math.round(src.height * factor))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, w, h)
  }
  return canvas
}

/* ------------------------------- compression ------------------------------- */

export interface CompressResult {
  /** Encoded blob — the closest result to the requested target size. */
  blob: Blob
  /** Encoder quality that produced the blob. */
  quality: number
  /** True when the image had to be downscaled to approach the target. */
  resized: boolean
}

const MIN_QUALITY = 0.05
const MAX_QUALITY = 0.95
const SEARCH_ITERATIONS = 10
const MAX_DOWNSCALE_STEPS = 4
const DOWNSCALE_FACTOR = 0.85

/**
 * Binary-search the largest encoder quality whose encoded size fits
 * `targetBytes`. Returns null when even MIN_QUALITY overshoots.
 */
async function searchQuality(
  canvas: HTMLCanvasElement,
  mime: 'image/jpeg' | 'image/webp',
  targetBytes: number
): Promise<{ blob: Blob; quality: number } | null> {
  let lo = MIN_QUALITY
  let hi = MAX_QUALITY
  let best: { blob: Blob; quality: number } | null = null
  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const q = lo + (hi - lo) / 2
    const blob = await canvasToBlob(canvas, mime, q)
    if (blob.size <= targetBytes) {
      best = { blob, quality: q }
      lo = q
    } else {
      hi = q
    }
    await yieldToUi() // keep the busy spinner animating between encodes
  }
  return best
}

/**
 * Compress a canvas/blob towards an exact byte target (JPEG/WebP only —
 * PNG is lossless and cannot be size-targeted).
 *
 * Strategy: binary-search quality over [0.05, 0.95] (~10 toBlob probes),
 * picking the largest quality with size ≤ target; if even the smallest
 * quality overshoots, progressively downscale the canvas by ×0.85 (up to
 * 4 steps) and re-run the quality search. Always resolves with the closest
 * result found — the caller decides whether the target was reached by
 * comparing `blob.size` with the target.
 */
export async function compressToTarget(
  source: HTMLCanvasElement | Blob,
  targetBytes: number,
  mime: 'image/jpeg' | 'image/webp'
): Promise<CompressResult> {
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
    throw new Error('compressToTarget: invalid target size')
  }

  let work = source instanceof Blob ? await blobToCanvas(source) : source
  let resized = false

  let best = await searchQuality(work, mime, targetBytes)
  for (let step = 0; !best && step < MAX_DOWNSCALE_STEPS; step++) {
    work = downscaleCanvas(work, DOWNSCALE_FACTOR)
    resized = true
    best = await searchQuality(work, mime, targetBytes)
  }

  if (!best) {
    // Target unreachable — return the smallest encode we can produce.
    best = { blob: await canvasToBlob(work, mime, MIN_QUALITY), quality: MIN_QUALITY }
  }

  return { blob: best.blob, quality: best.quality, resized }
}

/* --------------------------- background removal ---------------------------- */

/**
 * Flood-fill background removal (Task 2-b).
 *
 * Seeds a BFS from every border pixel; a pixel joins the background when its
 * squared RGB distance to the sampled border-median colour is within the
 * tolerance-scaled anchor threshold, OR its squared distance to the neighbour
 * it was reached from is within a smaller gradient threshold (so smooth
 * vignettes and gradients still flood). Already-transparent pixels always
 * join. Sets alpha = 0 for every filled pixel and returns a NEW ImageData —
 * the input is never mutated.
 */
export function removeBackground(imageData: ImageData, tolerance: number): ImageData {
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data
  const out = new ImageData(new Uint8ClampedArray(data), w, h)
  const total = w * h
  if (total === 0) return out

  const tol = Math.min(100, Math.max(0, tolerance)) / 100
  // Squared-RGB thresholds: anchor (vs border median) and neighbour (gradients).
  const anchorThresh = Math.pow(tol * 160 + 8, 2) * 3
  const neighThresh = Math.pow(tol * 48 + 6, 2) * 3

  // ---- sample the border median colour (the presumed backdrop) ----
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const sample = (idx: number) => {
    const i = idx * 4
    rs.push(data[i])
    gs.push(data[i + 1])
    bs.push(data[i + 2])
  }
  for (let x = 0; x < w; x++) {
    sample(x)
    sample((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    sample(y * w)
    sample(y * w + (w - 1))
  }
  const median = (values: number[]): number => {
    values.sort((a, b) => a - b)
    return values[values.length >> 1]
  }
  const mr = median(rs)
  const mg = median(gs)
  const mb = median(bs)

  // ---- BFS flood fill from all border pixels ----
  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const fill = (idx: number) => {
    visited[idx] = 1
    out.data[idx * 4 + 3] = 0
    queue[tail++] = idx
  }
  for (let x = 0; x < w; x++) {
    if (!visited[x]) fill(x)
    const bottom = (h - 1) * w + x
    if (!visited[bottom]) fill(bottom)
  }
  for (let y = 0; y < h; y++) {
    const left = y * w
    if (!visited[left]) fill(left)
    const right = y * w + (w - 1)
    if (!visited[right]) fill(right)
  }

  while (head < tail) {
    const idx = queue[head++]
    const x = idx % w
    const y = (idx - x) / w
    const i4 = idx * 4
    const pr = data[i4]
    const pg = data[i4 + 1]
    const pb = data[i4 + 2]

    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0)
      const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0)
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const nIdx = ny * w + nx
      if (visited[nIdx]) continue
      const j4 = nIdx * 4

      // Already transparent → part of the background, always fill.
      if (data[j4 + 3] === 0) {
        fill(nIdx)
        continue
      }

      const ar = data[j4] - mr
      const ag = data[j4 + 1] - mg
      const ab = data[j4 + 2] - mb
      if (ar * ar + ag * ag + ab * ab <= anchorThresh) {
        fill(nIdx)
        continue
      }

      const nr = data[j4] - pr
      const ng = data[j4 + 1] - pg
      const nb = data[j4 + 2] - pb
      if (nr * nr + ng * ng + nb * nb <= neighThresh) {
        fill(nIdx)
      }
    }
  }

  return out
}

/* ------------------------------- compositing ------------------------------- */

/** Composite a canvas over a solid colour (output keeps the source size). */
export function flattenOnColour(src: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d')
  if (ctx) {
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(src, 0, 0)
  }
  return out
}

/**
 * Draw `background` cover-fit (scaled to fill, centred) beneath `src`,
 * at the source canvas dimensions.
 */
export function flattenOnImage(
  src: HTMLCanvasElement,
  background: ImageBitmap | HTMLImageElement
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d')
  if (ctx) {
    const bw = 'naturalWidth' in background ? background.naturalWidth : background.width
    const bh = 'naturalHeight' in background ? background.naturalHeight : background.height
    if (bw > 0 && bh > 0) {
      const scale = Math.max(out.width / bw, out.height / bh)
      const dw = bw * scale
      const dh = bh * scale
      ctx.drawImage(background, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh)
    }
    ctx.drawImage(src, 0, 0)
  }
  return out
}

/** Decode a locally picked File into something drawImage() accepts. */
export async function decodeImageFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}
