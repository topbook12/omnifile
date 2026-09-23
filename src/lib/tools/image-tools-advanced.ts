/**
 * Advanced image-tool logic (Task 4-a) — compressor, converter, resize/crop,
 * on-device enhancer and SVG vectorizer.
 *
 * Everything is pure client-side Canvas API work. Decoding is delegated to
 * `blobToCanvas` from `@/lib/image-tools` (Task 2-b) — this module never
 * duplicates decode logic. HEIC/HEIF inputs (iPhone photos) are transcoded
 * to PNG via heic2any before hitting the canvas path.
 */

import { blobToCanvas, flattenOnColour } from '@/lib/image-tools'

/* ---------------------------------- types ---------------------------------- */

/** Output formats the browser can actually encode. */
export type ImageOutFormat = 'jpeg' | 'png' | 'webp'

/** Lossy formats usable with a numeric quality. */
export type LossyOutFormat = 'jpeg' | 'webp'

/** Presets for the SVG vector tracer. */
export type VectorPreset = 'logo' | 'sketch' | 'poster' | 'photo'

/** Where the crop window sits on the axis that gets cut away. */
export type CropGravity = 'center' | 'top'

/** File-extension map for the encodable output formats. */
export const IMAGE_EXT: Record<ImageOutFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
}

/** MIME-type map for the encodable output formats. */
export function imageMime(format: ImageOutFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp'
}

/* --------------------------------- helpers --------------------------------- */

/** Yield to the event loop so spinners and progress bars can paint. */
const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Detect HEIC/HEIF input (iPhone photos) from the MIME type or extension.
 * Accepts any `{ name, type }` shape so Files and Blobs both work.
 */
export function isHeic(input: { name: string; type?: string | null }): boolean {
  const mime = (input.type ?? '').toLowerCase()
  if (mime.includes('heic') || mime.includes('heif')) return true
  const name = input.name.toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

/**
 * Decode any local image blob into a fresh canvas. Transparent pixels are
 * preserved. HEIC/HEIF blobs are first transcoded to PNG via heic2any
 * (dynamic import — the ~1 MB decoder is only fetched when actually needed).
 */
export async function decodeImageToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const looksHeic = blob instanceof File ? isHeic(blob) : isHeic({ name: '', type: blob.type })
  if (looksHeic) {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({ blob, toType: 'image/png' })
    const png = Array.isArray(converted) ? converted[0] : converted
    return blobToCanvas(png)
  }
  return blobToCanvas(blob)
}

/** Encode a canvas to a Blob (wrapper around canvas.toBlob). */
export function encodeCanvas(
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

/**
 * High-quality canvas rescale using imageSmoothingQuality 'high'.
 * Callers doing large downscales should halve in steps (see `resizeImage`)
 * instead of one big draw for noticeably crisper results.
 */
function drawScaled(src: HTMLCanvasElement, tw: number, th: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.max(1, tw)
  out.height = Math.max(1, th)
  const ctx = out.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, out.width, out.height)
  }
  return out
}

/* -------------------------------- conversion ------------------------------- */

/**
 * Convert an image blob to `format`. JPEG is lossy (no alpha) — the source
 * is flattened onto white first so transparent PNG/HEIC photos don't turn
 * black. WebP keeps alpha. Returns the encoded blob.
 */
export async function convertImage(blob: Blob, format: ImageOutFormat): Promise<Blob> {
  const canvas = await decodeImageToCanvas(blob)
  if (format === 'jpeg') {
    const flat = flattenOnColour(canvas, '#ffffff')
    return encodeCanvas(flat, 'image/jpeg', 0.92)
  }
  return encodeCanvas(canvas, imageMime(format), format === 'png' ? undefined : 0.92)
}

/* ------------------------------- compression ------------------------------- */

/**
 * Re-encode an image at a fixed quality level (0..1). Only JPEG/WebP take a
 * quality argument — PNG is lossless and always re-encodes at full quality.
 */
export async function compressImageQuality(
  blob: Blob,
  format: LossyOutFormat,
  quality: number
): Promise<Blob> {
  const canvas = await decodeImageToCanvas(blob)
  const q = Math.min(1, Math.max(0.01, quality))
  return encodeCanvas(canvas, imageMime(format), q)
}

/* ----------------------------- resize & crop ------------------------------ */

export interface ResizeOptions {
  /** Target width in pixels. */
  width?: number
  /** Target height in pixels. */
  height?: number
  /** Scale factor in percent (5..400 in the UI, clamped 1..1000 here). */
  percent?: number
  /** Keep aspect ratio when both width & height are given (fit inside). */
  keepAspect?: boolean
}

/**
 * Resize an image by pixels or percent. Only one of width/height scales the
 * other proportionally. With both dimensions and `keepAspect`, the image
 * fits *inside* the box (never distorted, never cropped). Large downscales
 * are halved step-by-step for crisp results. Output is PNG so quality is
 * preserved for later steps.
 */
export async function resizeImage(blob: Blob, opts: ResizeOptions): Promise<Blob> {
  const src = await decodeImageToCanvas(blob)
  const ow = src.width
  const oh = src.height

  let tw: number
  let th: number

  if (opts.percent !== undefined) {
    const f = Math.min(10, Math.max(0.01, opts.percent / 100))
    tw = Math.max(1, Math.round(ow * f))
    th = Math.max(1, Math.round(oh * f))
  } else {
    const hasW = typeof opts.width === 'number' && opts.width > 0
    const hasH = typeof opts.height === 'number' && opts.height > 0
    if (!hasW && !hasH) throw new Error('resizeImage: width or height required')

    if (hasW && hasH && opts.keepAspect === false) {
      // Explicit stretch to the exact box.
      tw = Math.max(1, Math.round(opts.width as number))
      th = Math.max(1, Math.round(opts.height as number))
    } else if (hasW && hasH) {
      // Fit inside the box, aspect preserved.
      const s = Math.min((opts.width as number) / ow, (opts.height as number) / oh)
      tw = Math.max(1, Math.round(ow * s))
      th = Math.max(1, Math.round(oh * s))
    } else if (hasW) {
      // One dimension given → scale the other proportionally.
      tw = Math.max(1, Math.round(opts.width as number))
      th = Math.max(1, Math.round((oh / ow) * tw))
    } else {
      th = Math.max(1, Math.round(opts.height as number))
      tw = Math.max(1, Math.round((ow / oh) * th))
    }
  }

  // Stepwise halving for large downscales (much sharper than one big draw).
  let work = src
  let cw = src.width
  let ch = src.height
  while (cw / 2 >= tw && ch / 2 >= th && cw > 2 && ch > 2) {
    cw = Math.max(1, Math.floor(cw / 2))
    ch = Math.max(1, Math.floor(ch / 2))
    work = drawScaled(work, cw, ch)
    await yieldToUi()
  }
  if (cw !== tw || ch !== th) work = drawScaled(work, tw, th)

  return encodeCanvas(work, 'image/png')
}

/**
 * Centre/top-crop an image to a target aspect ratio (e.g. {w:1,h:1} → 1:1).
 * The crop window is as large as possible while matching the ratio. When
 * width is cut away, gravity "top" aligns to the left edge; when height is
 * cut away it aligns to the top edge. Output is PNG.
 */
export async function cropToRatio(
  blob: Blob,
  ratio: { w: number; h: number },
  gravity: CropGravity = 'center'
): Promise<Blob> {
  const src = await decodeImageToCanvas(blob)
  const target = ratio.h > 0 ? ratio.w / ratio.h : 1
  const source = src.width / src.height

  let cw: number
  let ch: number
  let cx: number
  let cy: number

  if (source > target) {
    // Source is wider than the target ratio → cut away width.
    ch = src.height
    cw = Math.max(1, Math.round(ch * target))
    cx = gravity === 'top' ? 0 : Math.max(0, Math.round((src.width - cw) / 2))
    cy = 0
  } else {
    // Source is taller (or equal) → cut away height.
    cw = src.width
    ch = Math.max(1, Math.round(cw / target))
    cx = 0
    cy = gravity === 'top' ? 0 : Math.max(0, Math.round((src.height - ch) / 2))
  }

  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch)

  return encodeCanvas(out, 'image/png')
}

/* ---------------------------- local enhancement ---------------------------- */

/** Hard cap on enhanced output pixels — protects low-memory devices. */
const MAX_OUT_PIXELS = 24_000_000

/**
 * Light unsharp mask applied in place: the classic 3×3 kernel
 * [0,-1,0 / -1,5,-1 / 0,-1,0] blended with the original at `amount`
 * (0..1). RGB only — alpha is preserved. Chunked over rows with yields
 * so the UI stays responsive on multi-megapixel images.
 */
async function unsharpInPlace(canvas: HTMLCanvasElement, amount: number): Promise<void> {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  if (w < 2 || h < 2) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const out = new Uint8ClampedArray(data)

  const rowsPerChunk = Math.max(1, Math.floor(200_000 / w))
  for (let y0 = 0; y0 < h; y0 += rowsPerChunk) {
    const yEnd = Math.min(h, y0 + rowsPerChunk)
    for (let y = y0; y < yEnd; y++) {
      const yUp = y > 0 ? y - 1 : 0
      const yDn = y < h - 1 ? y + 1 : h - 1
      for (let x = 0; x < w; x++) {
        const xL = x > 0 ? x - 1 : 0
        const xR = x < w - 1 ? x + 1 : w - 1
        const i = (y * w + x) * 4
        const iU = (yUp * w + x) * 4
        const iD = (yDn * w + x) * 4
        const iL = (y * w + xL) * 4
        const iR = (y * w + xR) * 4
        for (let c = 0; c < 3; c++) {
          const center = data[i + c]
          const k = 5 * center - data[iU + c] - data[iD + c] - data[iL + c] - data[iR + c]
          out[i + c] = center * (1 - amount) + amount * k
        }
      }
    }
    await yieldToUi()
  }

  ctx.putImageData(new ImageData(out, w, h), 0, 0)
}

/**
 * On-device (free, offline) image enhancement: progressive upscale
 * (2×/4×, in equal sub-steps with high-quality smoothing), a light unsharp
 * mask for perceived sharpness, then a subtle saturation/contrast lift on
 * the final draw. Output is PNG.
 */
export async function enhanceImageLocal(blob: Blob, scale: 2 | 4): Promise<Blob> {
  const src = await decodeImageToCanvas(blob)

  // Clamp the effective scale so output stays within the pixel budget.
  let f: number = scale
  const outPixels = src.width * src.height * f * f
  if (outPixels > MAX_OUT_PIXELS) {
    f = Math.max(1, Math.sqrt(MAX_OUT_PIXELS / (src.width * src.height)))
  }

  const tw = Math.max(1, Math.round(src.width * f))
  const th = Math.max(1, Math.round(src.height * f))

  // Upscale in equal sub-steps (≈2× each) for the best interpolation quality.
  const stepCount = Math.max(1, Math.ceil(Math.log2(f)))
  let work = src
  for (let s = 1; s <= stepCount; s++) {
    const p = Math.pow(f, s / stepCount)
    const w = Math.max(1, Math.round(src.width * p))
    const h = Math.max(1, Math.round(src.height * p))
    if (w === work.width && h === work.height) continue
    work = drawScaled(work, w, h)
    await yieldToUi()
  }
  if (work.width !== tw || work.height !== th) work = drawScaled(work, tw, th)

  await unsharpInPlace(work, 0.5)

  // Final pass: subtle saturation/contrast lift (ignored by very old Safari).
  const final = document.createElement('canvas')
  final.width = tw
  final.height = th
  const fctx = final.getContext('2d')
  if (fctx) {
    fctx.filter = 'saturate(1.06) contrast(1.02)'
    fctx.drawImage(work, 0, 0)
  }

  return encodeCanvas(final, 'image/png')
}

/* ------------------------------- vectorizing ------------------------------- */

export interface VectorPresetOptions {
  [key: string]: number
}

/**
 * imagetracerjs option sets per preset (Task 4-a spec):
 * - logo:   few colours, tight curves, crisp edges
 * - sketch: loose curves, more path omission (hand-drawn feel)
 * - poster: very few flat colours
 * - photo:  many colours + full colour sampling (big but detailed SVG)
 */
export const VECTOR_PRESETS: Record<VectorPreset, VectorPresetOptions> = {
  logo: { numberofcolors: 16, ltres: 0.5, qtres: 0.5, pathomit: 8, roundcoords: 1, blurradius: 0 },
  sketch: { numberofcolors: 8, ltres: 1, qtres: 1, pathomit: 20 },
  poster: { numberofcolors: 4, ltres: 1, qtres: 1, pathomit: 8 },
  photo: { numberofcolors: 36, ltres: 1, qtres: 1, pathomit: 4, colorsampling: 2 },
}

/** Minimal type for the untyped imagetracerjs UMD module. */
interface ImageTracerLike {
  imagedataToSVG(
    imageData: { width: number; height: number; data: Uint8ClampedArray },
    options?: VectorPresetOptions
  ): string
}

/** Wrap an SVG string into a downloadable Blob. */
export function svgStringToBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml' })
}

/**
 * Trace a raster image into vector art (SVG Blob) with imagetracerjs.
 * Work is limited to 1200px on the long edge — tracing cost grows with
 * pixel count and the visual difference above that is negligible.
 */
export async function vectorizeImage(blob: Blob, preset: VectorPreset): Promise<Blob> {
  let canvas = await decodeImageToCanvas(blob)

  const MAX_WORK = 1200
  const maxDim = Math.max(canvas.width, canvas.height)
  if (maxDim > MAX_WORK) {
    const f = MAX_WORK / maxDim
    canvas = drawScaled(
      canvas,
      Math.max(1, Math.round(canvas.width * f)),
      Math.max(1, Math.round(canvas.height * f))
    )
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const mod = (await import('imagetracerjs')) as unknown as {
    default?: ImageTracerLike
  } & ImageTracerLike
  const ImageTracer: ImageTracerLike = mod.default ?? mod
  const svg = ImageTracer.imagedataToSVG(imageData, VECTOR_PRESETS[preset])
  return svgStringToBlob(svg)
}

/* ---------------------------- Gemini AI prompts --------------------------- */

/**
 * Prompt used by the AI background remover (Gemini engine). Asks for the
 * subject on a fully transparent background — the model returns a PNG with
 * real alpha when addressed this way.
 */
export const BG_REMOVE_PROMPT =
  'Remove the background of this image completely. Keep the main subject ' +
  'exactly as it is — do not crop, resize, recolor or modify it. Preserve ' +
  'clean, sharp edges with no leftover background halo. Place the subject ' +
  'on a fully transparent background and output a PNG. Output only the ' +
  'image, no text.'
