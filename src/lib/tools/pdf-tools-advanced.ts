/**
 * Pure logic for the advanced PDF tools (Task 4-b) — 100% client-side.
 *
 * Libraries
 *  - pdfjs-dist v6  → rendering pages to canvas + text-layer extraction.
 *    ⚠ pdf.js DETACHES the ArrayBuffer passed to getDocument, so we always
 *      hand it a fresh copy (`new Uint8Array(await blob.arrayBuffer())`).
 *  - @cantoo/pdf-lib → assembly / page surgery / AES-256 encryption (fork).
 *  - docx            → Word export.  tesseract.js → on-device OCR.
 *
 * ---------------------------------------------------------------------------
 * ERROR CONTRACT
 * Known, expected failures are thrown as ToolError carrying an i18n KEY
 * (defined in src/lib/i18n/tools-pdf.ts, optional extra detail). Panels call
 * `errMessage(err, t)` to turn any thrown value into a user-facing string:
 *   - ToolError        → t(key) (+ detail in parentheses)
 *   - GeminiError      → mapped onto the shared aiErr* keys (tools-core.ts)
 *   - anything else    → `${t('errGeneric')} — <raw message>`
 * ---------------------------------------------------------------------------
 */

import { PDFDocument } from '@cantoo/pdf-lib'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

import { GeminiError } from '@/lib/gemini'
import { baseName, replaceExt, resultName } from '@/lib/tools/batch'
import type { ToolResultFile } from '@/lib/tools/types'

// Re-exports so panels can build result names without extra imports.
export { baseName, replaceExt, resultName }

/** Standard result names for the PDF tools. */
export const pdfResultName = {
  merged: () => 'merged.pdf',
  compressed: (source: string) => resultName(source, '-compressed', 'pdf'),
  signed: (source: string) => resultName(source, '-signed', 'pdf'),
  protected: (source: string) => resultName(source, '-protected', 'pdf'),
  unlocked: (source: string) => resultName(source, '-unlocked', 'pdf'),
  images: (source: string) => `${baseName(source)}.pdf`,
}

// Configure the pdf.js worker exactly once (files live in /public).
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

/* -------------------------------------------------------------------------- */
/*                                 error plumbing                              */
/* -------------------------------------------------------------------------- */

/** An expected failure carrying an i18n key (see ERROR CONTRACT above). */
export class ToolError extends Error {
  /** Optional raw detail (file name, reason…) appended after the translation. */
  detail?: string

  constructor(i18nKey: string, detail?: string) {
    super(i18nKey)
    this.name = 'ToolError'
    this.detail = detail
  }
}

const I18N_KEY_RE = /^(pdfErr|aiErr|toolPdf|pdfToWordNoText)/

/**
 * Translate any thrown value into a UI-ready message (see ERROR CONTRACT).
 * `t` is the i18n translate function from useI18n().
 */
export function errMessage(err: unknown, t: (key: string) => string): string {
  if (err instanceof GeminiError) {
    switch (err.code) {
      case 'NO_KEY':
        return t('aiErrNoKey')
      case 'INVALID_KEY':
        return t('aiErrInvalidKey')
      case 'RATE_LIMIT':
        return t('aiErrRateLimit')
      case 'NETWORK':
        return t('aiErrNetwork')
      case 'NO_IMAGE':
        return t('aiErrNoImage')
      default:
        return err.detail ? `${t('aiErrApi')} — ${err.detail}` : t('aiErrApi')
    }
  }
  if (err instanceof ToolError) {
    return err.detail ? `${t(err.message)} (${err.detail})` : t(err.message)
  }
  const raw = err instanceof Error ? err.message : String(err)
  if (I18N_KEY_RE.test(raw)) return t(raw)
  return `${t('errGeneric')} — ${raw}`
}

/** Classify a raw pdf-lib load failure. */
function encryptedErr(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  return e?.name === 'EncryptedPDFError' || /encrypt/i.test(e?.message ?? '')
}

function passwordErr(err: unknown): boolean {
  return /password/i.test((err as Error)?.message ?? '')
}

/** Wrap a pdf-lib load failure into the friendliest ToolError. */
function loadErr(err: unknown, wasLocked = false): ToolError {
  if (encryptedErr(err)) return new ToolError(wasLocked ? 'pdfErrWrongPassword' : 'pdfErrEncrypted')
  if (passwordErr(err)) return new ToolError('pdfErrWrongPassword')
  return new ToolError('pdfErrCorrupt')
}

/* -------------------------------------------------------------------------- */
/*                                pdf.js helpers                               */
/* -------------------------------------------------------------------------- */

/**
 * Open a PDF with pdf.js. Always copies the bytes first (pdf.js detaches the
 * buffer it receives) and maps failures onto friendly i18n keys.
 */
export async function pdfjsDoc(file: Blob): Promise<PDFDocumentProxy> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    return await pdfjsLib.getDocument({ data: bytes }).promise
  } catch (err) {
    if ((err as { name?: string })?.name === 'PasswordException') {
      throw new ToolError('pdfErrEncrypted')
    }
    throw new ToolError('pdfErrCorrupt')
  }
}

/** Render one pdf.js page into an offscreen canvas (white background). */
export async function renderPdfPage(page: PDFPageProxy, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ToolError('pdfErrCorrupt')
  // PDF pages are transparent by default; JPEG has no alpha channel.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvas
}

/** Encode a canvas as a Blob. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ToolError('pdfErrCorrupt', 'canvas encode'))),
      type,
      quality
    )
  })
}

/** Free the backing store of a finished canvas. */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/**
 * Release the pdf.js resources of an opened document (page cache + worker).
 * pdf.js v6 removed `PDFDocumentProxy.destroy()` from the public API — the
 * loading task (reachable via `doc.loadingTask`) owns the teardown.
 */
export async function closePdfDoc(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.cleanup()
  } catch {
    /* ignore */
  }
  try {
    await doc.loadingTask.destroy()
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/*                                  1. merge                                   */
/* -------------------------------------------------------------------------- */

/**
 * Concatenate PDFs in the given order into one document.
 * Page order follows the array order (the panel lists files top→bottom).
 */
export async function mergePdfs(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  if (files.length < 2) throw new ToolError('pdfErrNeedTwo')
  const out = await PDFDocument.create()
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!
    let src: PDFDocument
    try {
      src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
    } catch (err) {
      throw loadErr(err, false)
    }
    const copied = await out.copyPages(src, src.getPageIndices())
    copied.forEach((p) => out.addPage(p))
    onProgress?.(i + 1, files.length)
  }
  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                                  2. split                                   */
/* -------------------------------------------------------------------------- */

export type SplitMode = 'every' | 'ranges' | 'single'

export interface SplitPdfOptions {
  mode: SplitMode
  /** mode 'every': pages per output file (2–100). */
  everyN?: number
  /** mode 'ranges': e.g. "1-3, 5, 8-" (open end = last page). */
  ranges?: string
}

/** Normalise Bengali digits so "১-৩" works the same as "1-3". */
function normaliseDigits(input: string): string {
  const bn = '০১২৩৪৫৬৭৮৯'
  return input.replace(/[০-৯]/g, (d) => String(bn.indexOf(d)))
}

/**
 * Parse a range string into 0-based inclusive [start, end] pairs.
 * Throws pdfErrBadRanges on anything malformed or outside the document.
 */
export function parseRanges(input: string, pageCount: number): Array<[number, number]> {
  const clean = normaliseDigits(input)
  const parts = clean
    .split(/[,;،]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) throw new ToolError('pdfErrBadRanges')

  const out: Array<[number, number]> = []
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+)?)?$/)
    if (!m) throw new ToolError('pdfErrBadRanges', `"${part}"`)
    const start = Number.parseInt(m[1]!, 10)
    // "8-" → open end (to the last page)
    const end = m[2] !== undefined ? Number.parseInt(m[2], 10) : pageCount
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 1 ||
      start > pageCount ||
      end < start
    ) {
      throw new ToolError('pdfErrBadRanges', `"${part}"`)
    }
    out.push([start - 1, Math.min(end, pageCount) - 1])
  }
  return out
}

/** Split one PDF into several single-page-range files. */
export async function splitPdf(file: File, opts: SplitPdfOptions): Promise<ToolResultFile[]> {
  let src: PDFDocument
  try {
    src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  } catch (err) {
    throw loadErr(err, false)
  }
  const pageCount = src.getPageCount()
  const base = baseName(file.name)

  let groups: Array<[number, number]>
  if (opts.mode === 'single') {
    groups = Array.from({ length: pageCount }, (_, i) => [i, i] as [number, number])
  } else if (opts.mode === 'every') {
    const n = opts.everyN ?? 0
    if (!Number.isInteger(n) || n < 2 || n > 100) throw new ToolError('pdfErrEveryN')
    groups = []
    for (let i = 0; i < pageCount; i += n) {
      groups.push([i, Math.min(i + n - 1, pageCount - 1)])
    }
  } else {
    groups = parseRanges(opts.ranges ?? '', pageCount)
  }

  const results: ToolResultFile[] = []
  for (let g = 0; g < groups.length; g++) {
    const [a, b] = groups[g]!
    const doc = await PDFDocument.create()
    const indices = Array.from({ length: b - a + 1 }, (_, i) => a + i)
    const copied = await doc.copyPages(src, indices)
    copied.forEach((p) => doc.addPage(p))
    const bytes = await doc.save()

    const suffix =
      opts.mode === 'every'
        ? `-part-${g + 1}`
        : a === b
          ? `-page-${a + 1}`
          : `-pages-${a + 1}-${b + 1}`
    results.push({
      name: `${base}${suffix}.pdf`,
      blob: new Blob([bytes], { type: 'application/pdf' }),
    })
  }
  return results
}

/* -------------------------------------------------------------------------- */
/*                                 3. compress                                 */
/* -------------------------------------------------------------------------- */

export interface CompressPdfOptions {
  /** Viewport multiplier over the 72dpi base (1 → render at ~144dpi). */
  dpiScale: number
  /** JPEG quality 0.3–0.9. */
  jpegQuality: number
}

/** Quality presets offered by the panel. */
export const COMPRESS_PRESETS: Record<'small' | 'balanced' | 'high', CompressPdfOptions> = {
  small: { dpiScale: 1.5, jpegQuality: 0.5 },
  balanced: { dpiScale: 2, jpegQuality: 0.65 },
  high: { dpiScale: 3, jpegQuality: 0.8 },
}

/**
 * Rasterise every page and rebuild the PDF from JPEGs — the classic
 * "scan-like" compression that reliably shrinks bloated documents.
 *
 * Page geometry is preserved (viewport at scale 1 = PDF points). If the
 * rebuilt file is not actually smaller than the original, the ORIGINAL
 * bytes are returned unchanged (caller can detect this via identical size).
 */
export async function compressPdf(
  file: File,
  opts: CompressPdfOptions,
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const doc = await pdfjsDoc(file)
  const out = await PDFDocument.create()
  const total = doc.numPages

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.max(0.5, opts.dpiScale) * 2
    const canvas = await renderPdfPage(page, scale)
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', Math.min(0.9, Math.max(0.3, opts.jpegQuality)))
    releaseCanvas(canvas)
    const img = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))
    const newPage = out.addPage([base.width, base.height])
    newPage.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height })
    onProgress?.(i, total)
  }

  await closePdfDoc(doc)
  const bytes = await out.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })

  // Not actually smaller? Keep the original untouched rather than shipping
  // a bigger, lossier file. (Panels compare blob.size === file.size.)
  if (blob.size >= file.size) return file.slice(0)
  return blob
}

/* -------------------------------------------------------------------------- */
/*                               4. images → PDF                               */
/* -------------------------------------------------------------------------- */

export type ImagesToPdfPageSize = 'fit' | 'a4' | 'letter'

export interface ImagesToPdfOptions {
  pageSize: ImagesToPdfPageSize
  /** Page margin in mm (0–20, ignored for 'fit'). */
  margin: number
}

const MM_TO_PT = 72 / 25.4
const A4: [number, number] = [595.28, 841.89]
const LETTER: [number, number] = [612, 792]

/** Decode any image File to a Bitmap with an <img> fallback for old Safari. */
async function decodeBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob)
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.decoding = 'sync'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new ToolError('pdfErrNoImage'))
        img.src = url
      })
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function bitmapSize(bmp: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return { width: bmp.width, height: bmp.height }
}

/**
 * Get embeddable bytes for one image: JPEG/PNG pass through untouched,
 * everything else (WebP/GIF/HEIC/AVIF…) is re-encoded as JPEG on white.
 */
async function toEmbeddableImage(
  file: File
): Promise<{ bytes: Uint8Array; type: 'jpg' | 'png'; width: number; height: number }> {
  const mime = (file.type || '').toLowerCase()
  const isJpeg = mime === 'image/jpeg' || (!mime && /\.jpe?g$/i.test(file.name))
  const isPng = mime === 'image/png' || (!mime && /\.png$/i.test(file.name))

  if (isJpeg || isPng) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type: isJpeg ? 'image/jpeg' : 'image/png' }))
      const size = bitmapSize(bmp)
      bmp.close()
      return { bytes, type: isJpeg ? 'jpg' : 'png', ...size }
    } catch {
      /* corrupted "JPEG" — fall through to the canvas decode path */
    }
  }

  const bmp = await decodeBitmap(file).catch(() => {
    throw new ToolError('pdfErrNoImage', file.name)
  })
  const size = bitmapSize(bmp)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ToolError('pdfErrNoImage', file.name)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp as CanvasImageSource, 0, 0)
  if ('close' in bmp) bmp.close()
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
  releaseCanvas(canvas)
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    type: 'jpg',
    ...size,
  }
}

/**
 * Build one PDF from a list of images (order = array order).
 * 'fit'   → page exactly the image size at 72dpi (1px = 1pt), no margin.
 * 'a4'/'letter' → fixed portrait page, image centred & scaled inside margins.
 */
export async function imagesToPdf(files: File[], opts: ImagesToPdfOptions): Promise<Blob> {
  if (files.length === 0) throw new ToolError('pdfErrNoImage')
  const out = await PDFDocument.create()

  for (const file of files) {
    const img = await toEmbeddableImage(file)
    const embedded =
      img.type === 'jpg' ? await out.embedJpg(img.bytes) : await out.embedPng(img.bytes)

    if (opts.pageSize === 'fit') {
      const page = out.addPage([img.width, img.height])
      page.drawImage(embedded, { x: 0, y: 0, width: img.width, height: img.height })
    } else {
      const [pageW, pageH] = opts.pageSize === 'a4' ? A4 : LETTER
      const page = out.addPage([pageW, pageH])
      const margin = Math.min(20, Math.max(0, opts.margin)) * MM_TO_PT
      const availW = Math.max(1, pageW - margin * 2)
      const availH = Math.max(1, pageH - margin * 2)
      const scale = Math.min(availW / img.width, availH / img.height)
      const drawW = img.width * scale
      const drawH = img.height * scale
      page.drawImage(embedded, {
        x: (pageW - drawW) / 2,
        y: (pageH - drawH) / 2,
        width: drawW,
        height: drawH,
      })
    }
  }

  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                                5. PDF → images                              */
/* -------------------------------------------------------------------------- */

export interface PdfToImagesOptions {
  format: 'image/jpeg' | 'image/png'
  scale: number
}

/** Safety cap — rasterising a 1000-page document would freeze the tab. */
export const PDF_TO_IMAGES_MAX_PAGES = 100

/** Render every page to JPEG/PNG files. */
export async function pdfToImages(
  file: File,
  opts: PdfToImagesOptions,
  onProgress?: (done: number, total: number) => void
): Promise<ToolResultFile[]> {
  const doc = await pdfjsDoc(file)
  const total = Math.min(doc.numPages, PDF_TO_IMAGES_MAX_PAGES)
  const base = baseName(file.name)
  const ext = opts.format === 'image/jpeg' ? 'jpg' : 'png'

  const results: ToolResultFile[] = []
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)
    const canvas = await renderPdfPage(page, opts.scale)
    const blob = await canvasToBlob(canvas, opts.format, 0.92)
    releaseCanvas(canvas)
    results.push({ name: `${base}-page-${i}.${ext}`, blob })
    onProgress?.(i, total)
  }

  await closePdfDoc(doc)
  return results
}

/* -------------------------------------------------------------------------- */
/*                                6. PDF → text                                */
/* -------------------------------------------------------------------------- */

/**
 * Extract the text layer page by page. Pages without text yield ''.
 * Lines are reconstructed using the item `hasEOL` flag.
 */
export async function pdfExtractText(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const doc = await pdfjsDoc(file)
  const total = doc.numPages
  const pages: string[] = []

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const lines: string[] = []
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) {
        lines.push(line)
        line = ''
      }
    }
    if (line.trim()) lines.push(line)
    pages.push(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim())
    onProgress?.(i, total)
  }

  await closePdfDoc(doc)
  return pages
}

/** Combined length of all extracted text (used for the "no text layer" check). */
export function totalTextLength(pages: string[]): number {
  return pages.reduce((sum, p) => sum + p.length, 0)
}

/** Build a .docx from per-page text; one heading + one paragraph per line. */
export async function textPagesToDocx(
  pages: string[],
  pageLabel: (n: number) => string
): Promise<Blob> {
  if (totalTextLength(pages) < 5) throw new ToolError('pdfToWordNoText')

  const children: Paragraph[] = []
  pages.forEach((page, idx) => {
    children.push(
      new Paragraph({ text: pageLabel(idx + 1), heading: HeadingLevel.HEADING_2 })
    )
    const lines = page.split('\n')
    if (lines.every((l) => !l.trim())) {
      children.push(new Paragraph({ text: '' }))
    } else {
      for (const lineText of lines) {
        children.push(new Paragraph({ children: [new TextRun(lineText)] }))
      }
    }
  })

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

/**
 * PDF → DOCX (extract + build). `pageLabel` lets the panel pass an i18n'd
 * "Page N" heading, e.g. `(n) => tf('pdfPageN', { n })`.
 */
export async function pdfToDocx(
  file: File,
  opts: {
    onProgress?: (done: number, total: number) => void
    pageLabel?: (n: number) => string
  } = {}
): Promise<Blob> {
  const pages = await pdfExtractText(file, opts.onProgress)
  return textPagesToDocx(pages, opts.pageLabel ?? ((n: number) => `Page ${n}`))
}

/* -------------------------------------------------------------------------- */
/*                                    7. OCR                                   */
/* -------------------------------------------------------------------------- */

const TESSERACT_WORKER_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js'
const TESSERACT_CORE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/'

/**
 * On-device OCR with tesseract.js. Cross-origin workers are blocked by the
 * browser, so the worker script is fetched once and started from a blob URL;
 * the wasm core + trained language data are streamed from the CDN (and then
 * cached by the browser).
 *
 * @param image    a Blob (image file) or a rendered canvas
 * @param langs    e.g. ['ben'], ['eng'] or ['ben','eng']
 */
export async function ocrWithTesseract(
  image: Blob | HTMLCanvasElement,
  langs: string[],
  onProgress?: (progress: number) => void
): Promise<string> {
  const { createWorker } = await import('tesseract.js')

  const workerSrc = await (await fetch(TESSERACT_WORKER_URL)).text()
  const workerBlobUrl = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }))

  const worker = await createWorker(langs, 1, {
    workerBlobURL: true,
    workerPath: workerBlobUrl,
    corePath: TESSERACT_CORE_URL,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress ?? 0)
    },
  })

  try {
    const { data } = await worker.recognize(image)
    return (data?.text ?? '').trim()
  } finally {
    await worker.terminate()
    URL.revokeObjectURL(workerBlobUrl)
  }
}

/**
 * True when the PDF already carries a real text layer (checked over the
 * first pages). Used by the OCR tool to skip pointless recognition.
 */
export async function pdfHasTextLayer(
  file: File,
  checkPages = 2,
  threshold = 50
): Promise<boolean> {
  const doc = await pdfjsDoc(file)
  try {
    let total = 0
    const n = Math.min(checkPages, doc.numPages)
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if ('str' in item) total += item.str.trim().length
      }
    }
    return total > threshold
  } finally {
    await closePdfDoc(doc)
  }
}

/** Max pages the OCR tool will rasterise for image-based recognition. */
export const OCR_MAX_PAGES = 10

/* -------------------------------------------------------------------------- */
/*                                  8. e-sign                                  */
/* -------------------------------------------------------------------------- */

export interface SignPdfOptions {
  /** 0-based target page index. */
  pageIndex: number
  /** Click position, normalised 0..1 from the top-left of the preview. */
  xNorm: number
  yNorm: number
  /** Signature width as a fraction of the page width (0.1–0.4). */
  widthNorm: number
}

/**
 * Embed a transparent PNG signature centred on the chosen spot.
 * Note: like the PDF annotator, drawing happens in unrotated user space, so
 * pages with /Rotate ≠ 0 may show the signature at a different screen angle.
 */
export async function signPdf(
  file: File,
  signaturePng: Blob,
  opts: SignPdfOptions
): Promise<Blob> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  } catch (err) {
    throw loadErr(err, false)
  }

  const png = await doc.embedPng(new Uint8Array(await signaturePng.arrayBuffer()))
  const index = Math.min(Math.max(0, Math.floor(opts.pageIndex)), doc.getPageCount() - 1)
  const page = doc.getPage(index)
  const { width: pageW, height: pageH } = page.getSize()

  const drawW = pageW * Math.min(0.9, Math.max(0.05, opts.widthNorm))
  const drawH = drawW * (png.height / png.width)
  const x = pageW * opts.xNorm - drawW / 2
  const y = pageH * (1 - opts.yNorm) - drawH / 2

  page.drawImage(png, {
    x: Math.min(Math.max(0, x), pageW - drawW),
    y: Math.min(Math.max(0, y), pageH - drawH),
    width: drawW,
    height: drawH,
  })

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * Trim a signature pad canvas down to its ink bounding box (with padding)
 * so the PNG placed on the page hugs the actual strokes. Returns null when
 * nothing was drawn.
 */
export function cropSignatureCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width, height } = canvas
  if (width === 0 || height === 0) return null

  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null

  const pad = 6
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)

  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/* -------------------------------------------------------------------------- */
/*                             9. protect / unlock                             */
/* -------------------------------------------------------------------------- */

export interface ProtectPdfOptions {
  userPassword: string
  ownerPassword: string
}

/**
 * Add AES-256 encryption. `ownerPassword` defaults to the user password when
 * empty. Loading an already-encrypted document throws pdfErrAlreadyProtected.
 */
export async function protectPdf(file: File, opts: ProtectPdfOptions): Promise<Blob> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  } catch (err) {
    throw loadErr(err, false)
  }
  if (doc.isEncrypted) throw new ToolError('pdfErrAlreadyProtected')

  doc.encrypt({
    userPassword: opts.userPassword,
    ownerPassword: opts.ownerPassword || opts.userPassword,
    algorithm: 'AES-256',
  })
  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * Remove password protection: load with the password, save without security
 * (the fork strips the /Encrypt dict when a document is opened decrypted).
 */
export async function unlockPdf(file: File, password: string): Promise<Blob> {
  let doc: PDFDocument
  try {
    // A wrong password throws here ('Password incorrect' / 'NEEDS PASSWORD'),
    // so anything past load() was decrypted successfully.
    doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { password })
  } catch (err) {
    throw loadErr(err, true)
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}
