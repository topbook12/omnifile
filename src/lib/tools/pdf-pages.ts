/**
 * Pure logic for the PDF page-management tools (Task 2-b) — 100% client-side.
 *
 * Covers: thumbnail rendering (pdf.js), page organizing (reorder/rotate/
 * blank inserts), extract + crop, whole-document rotation, header/footer
 * & page-number stamping, metadata and Bates numbering.
 *
 * Uses @cantoo/pdf-lib (pdf-lib fork) for surgery and the shared pdf.js
 * helpers from pdf-tools-advanced.ts for rendering. pdf.js DETACHES the
 * ArrayBuffer it receives, so every entry point works on a fresh copy.
 *
 * ---------------------------------------------------------------------------
 * ERROR CONTRACT (same as pdf-tools-advanced.ts)
 * Known failures are thrown as ToolError carrying an i18n KEY starting with
 * `pdfErr` (defined in src/lib/i18n/tools-pdf.ts and tools-pdf-pages.ts).
 * Panels call `errMessage(err, t)` to turn any thrown value into a
 * user-facing string.
 * ---------------------------------------------------------------------------
 *
 * ROTATION MODEL (organizePdf): `plan.rotation` is the EXTRA rotation to ADD
 * to the page's existing rotation (page.getRotation().angle), NOT an absolute
 * target. Final stored rotation = normalize(original + extra) % 360. This
 * matches the UI: pdf.js thumbnails already display the original rotation,
 * and the panel's "rotate" button adds 90° per tap.
 */

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib'

import {
  ToolError,
  canvasToBlob,
  closePdfDoc,
  parseRanges,
  pdfjsDoc,
  renderPdfPage,
} from '@/lib/tools/pdf-tools-advanced'

// Re-exported so the page-tools panels only need this module.
export { ToolError, errMessage } from '@/lib/tools/pdf-tools-advanced'

/* -------------------------------------------------------------------------- */
/*                              error plumbing                                 */
/* -------------------------------------------------------------------------- */

/* Classification copied from pdf-tools-advanced.ts (loadErr is not exported). */

function encryptedErr(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  return e?.name === 'EncryptedPDFError' || /encrypt/i.test(e?.message ?? '')
}

function passwordErr(err: unknown): boolean {
  return /password/i.test((err as Error)?.message ?? '')
}

/** Wrap a pdf-lib load failure into the friendliest ToolError. */
function loadErr(err: unknown): ToolError {
  if (encryptedErr(err)) return new ToolError('pdfErrEncrypted')
  if (passwordErr(err)) return new ToolError('pdfErrWrongPassword')
  return new ToolError('pdfErrCorrupt')
}

/** Open a PDF with pdf-lib on a fresh byte copy (pdf.js may have detached…). */
async function loadPdfDoc(file: Blob): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  } catch (err) {
    throw loadErr(err)
  }
}

const norm360 = (angle: number): number => ((angle % 360) + 360) % 360

/* -------------------------------------------------------------------------- */
/*                             1. renderThumbnails                             */
/* -------------------------------------------------------------------------- */

/** One small page preview. `url` is an object URL the CALLER must revoke. */
export interface PageThumbnail {
  /** 0-based source page index. */
  index: number
  /** Object URL of a JPEG blob (caller revokes). */
  url: string
  /** Rendered pixel width of the thumbnail. */
  width: number
  /** Rendered pixel height of the thumbnail. */
  height: number
}

export interface RenderThumbnailsOptions {
  /** Target width in px (height follows the page aspect). Default 220. */
  thumbWidth?: number
  /** Safety cap for huge documents. Default 200. */
  maxPages?: number
  /**
   * Progress: (done, total) counts THUMBNAILS rendered (total = capped
   * renderTotal); `realTotal` is the document's true page count so panels
   * can show a "only first N pages" note when realTotal > total.
   */
  onProgress?: (done: number, total: number, realTotal: number) => void
}

/**
 * Render every page of the PDF as a small JPEG thumbnail via pdf.js.
 * Pages are rendered sequentially to keep memory flat; object URLs are
 * created here and MUST be revoked by the caller (panels revoke on
 * reset / new file / unmount).
 */
export async function renderThumbnails(
  file: Blob,
  opts: RenderThumbnailsOptions = {}
): Promise<PageThumbnail[]> {
  const thumbWidth = Math.max(60, opts.thumbWidth ?? 220)
  const maxPages = Math.max(1, opts.maxPages ?? 200)

  const doc = await pdfjsDoc(file)
  const realTotal = doc.numPages
  const renderTotal = Math.min(realTotal, maxPages)
  const thumbs: PageThumbnail[] = []

  try {
    opts.onProgress?.(0, renderTotal, realTotal)
    for (let i = 1; i <= renderTotal; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const canvas = await renderPdfPage(page, base.width > 0 ? thumbWidth / base.width : 1)
      const { width, height } = canvas
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.7)
      canvas.width = 0
      canvas.height = 0
      thumbs.push({ index: i - 1, url: URL.createObjectURL(blob), width, height })
      opts.onProgress?.(i, renderTotal, realTotal)
    }
  } finally {
    await closePdfDoc(doc)
  }
  return thumbs
}

/* -------------------------------------------------------------------------- */
/*                                 2. organize                                 */
/* -------------------------------------------------------------------------- */

/**
 * One step of the organizer plan.
 * - `page`  → copy source page `srcIndex`; `rotation` is the EXTRA rotation
 *   added to the page's existing rotation (see ROTATION MODEL above).
 * - `blank` → insert a new empty page of the given size [width, height] pt.
 */
export type OrganizerPlanItem =
  | { kind: 'page'; srcIndex: number; rotation: 0 | 90 | 180 | 270 }
  | { kind: 'blank'; size: [number, number] }

/**
 * Build a new PDF following the plan (order = array order). Pages are copied
 * in ONE copyPages call (duplicates in the plan produce independent copies).
 */
export async function organizePdf(file: Blob, plan: OrganizerPlanItem[]): Promise<Blob> {
  const pageSteps = plan.filter((p): p is Extract<OrganizerPlanItem, { kind: 'page' }> => p.kind === 'page')
  if (pageSteps.length === 0) throw new ToolError('pdfErrNoPages')

  const src = await loadPdfDoc(file)
  const pageCount = src.getPageCount()
  for (const step of pageSteps) {
    if (!Number.isInteger(step.srcIndex) || step.srcIndex < 0 || step.srcIndex >= pageCount) {
      throw new ToolError('pdfErrBadRanges', String(step.srcIndex + 1))
    }
  }

  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, pageSteps.map((p) => p.srcIndex))

  let copyIdx = 0
  for (const step of plan) {
    if (step.kind === 'blank') {
      out.addPage(step.size)
      continue
    }
    const page = copied[copyIdx++]!
    out.addPage(page)
    if (step.rotation !== 0) {
      page.setRotation(degrees(norm360(page.getRotation().angle + step.rotation)))
    }
  }

  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                             3. extract + crop                               */
/* -------------------------------------------------------------------------- */

/** Crop margins in PDF points, trimmed inward from each page edge. */
export interface PdfCropMargins {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Build a new PDF containing the selected pages (0-based) in the given order.
 * With `crop`, each page's CROP BOX is inset by the margins relative to its
 * MEDIA BOX (content is kept — only the visible area changes).
 */
export async function extractPdf(
  file: Blob,
  pageIndices: number[],
  crop?: PdfCropMargins
): Promise<Blob> {
  if (pageIndices.length === 0) throw new ToolError('pdfErrNoPages')

  const src = await loadPdfDoc(file)
  const pageCount = src.getPageCount()
  for (const idx of pageIndices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= pageCount) {
      throw new ToolError('pdfErrBadRanges', String(idx + 1))
    }
  }

  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, pageIndices)
  for (const page of copied) {
    if (crop) applyCrop(page, crop)
    out.addPage(page)
  }

  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Inset a page's crop box by the margins, clamped to the media box. */
function applyCrop(page: PDFPage, crop: PdfCropMargins): void {
  const mb = page.getMediaBox()
  const left = Math.max(0, crop.left)
  const right = Math.max(0, crop.right)
  const top = Math.max(0, crop.top)
  const bottom = Math.max(0, crop.bottom)
  const width = mb.width - left - right
  const height = mb.height - top - bottom
  if (width <= 0 || height <= 0) throw new ToolError('pdfErrBadCrop')
  page.setCropBox(mb.x + left, mb.y + bottom, width, height)
}

/* -------------------------------------------------------------------------- */
/*                                 4. rotate                                   */
/* -------------------------------------------------------------------------- */

export type RotateDelta = 90 | 180 | 270 | -90

/**
 * Rotate the whole document or the pages of a range string ("1-3, 5, 8-")
 * by `delta`, relative to each page's CURRENT rotation. Edits in place —
 * annotations, forms and metadata are preserved.
 */
export async function rotatePdf(
  file: Blob,
  selector: 'all' | string,
  delta: RotateDelta
): Promise<Blob> {
  const doc = await loadPdfDoc(file)
  const pageCount = doc.getPageCount()

  let indices: number[]
  if (selector === 'all') {
    indices = Array.from({ length: pageCount }, (_, i) => i)
  } else {
    indices = parseRanges(selector, pageCount).flatMap(([a, b]) =>
      Array.from({ length: b - a + 1 }, (_, k) => a + k)
    )
  }
  if (indices.length === 0) throw new ToolError('pdfErrNoPages')

  for (const idx of indices) {
    const page = doc.getPage(idx)
    page.setRotation(degrees(norm360(page.getRotation().angle + delta)))
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                          5. header / footer stamping                        */
/* -------------------------------------------------------------------------- */

/** One text band: up to three segments aligned left / center / right. */
export interface StampTexts {
  left?: string
  center?: string
  right?: string
}

export interface StampHeaderFooterOptions {
  header?: StampTexts
  footer?: StampTexts
  /** Default 10. */
  fontSize?: number
  /** "#rrggbb". Default "#000000". */
  colorHex?: string
  /** Distance from the page edge in points. Default 36. */
  marginPoints?: number
  /** First value of the {n} placeholder. Default 1. */
  startNumber?: number
  /** Don't stamp page 1 (its {n} still counts). Default false. */
  skipFirstPage?: boolean
  /** Replacement for the {title} placeholder. */
  title?: string
  /** BCP-47 locale for the {date} placeholder (default: browser locale). */
  locale?: string
}

/**
 * Replace {n} {total} {title} {date} placeholders. Exported so panels can
 * render a faithful live preview with the same rules as the lib.
 */
export function applyPlaceholders(
  text: string,
  vars: { n: number | string; total: number | string; title: string; date: string }
): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key as keyof typeof vars]) : whole
  )
}

/**
 * Stamp running headers/footers on every page (in place). Baselines:
 * top band at pageH - margin - fontSize·0.2, bottom band at margin + fontSize.
 * {n} respects startNumber and counts every page even when skipFirstPage is
 * set (page 1 is only skipped visually).
 *
 * ⚠ The PDF standard fonts only encode Latin (WinAnsi) text — any other
 * character is replaced with "?" so stamping never hard-fails.
 */
export async function stampHeaderFooter(file: Blob, opts: StampHeaderFooterOptions): Promise<Blob> {
  const doc = await loadPdfDoc(file)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontSize = clampNum(opts.fontSize ?? 10, 4, 72)
  const margin = Math.max(0, opts.marginPoints ?? 36)
  const startNumber = Number.isFinite(opts.startNumber) ? Number(opts.startNumber) : 1
  const color = hexToRgb(opts.colorHex)
  const total = doc.getPageCount()
  const title = opts.title ?? ''
  const date = new Date().toLocaleDateString(opts.locale || undefined)

  const bands: Array<{ texts: StampTexts; y: (pageH: number) => number }> = []
  if (opts.header) bands.push({ texts: opts.header, y: (h) => h - margin - fontSize * 0.2 })
  if (opts.footer) bands.push({ texts: opts.footer, y: () => margin + fontSize })

  const pages = doc.getPages()
  for (let i = 0; i < pages.length; i++) {
    if (opts.skipFirstPage && i === 0) continue
    const page = pages[i]!
    const vars = { n: startNumber + i, total, title, date }
    for (const band of bands) {
      const y = band.y(page.getHeight())
      drawBand(page, font, band.texts, { size: fontSize, margin, color, y, vars })
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Draw the left/center/right segments of one band with measured alignment. */
function drawBand(
  page: PDFPage,
  font: PDFFont,
  texts: StampTexts,
  cfg: {
    size: number
    margin: number
    color: Color
    y: number
    vars: { n: number | string; total: number | string; title: string; date: string }
  }
): void {
  const pageW = page.getWidth()
  const segments: Array<[string | undefined, 'left' | 'center' | 'right']> = [
    [texts.left, 'left'],
    [texts.center, 'center'],
    [texts.right, 'right'],
  ]
  for (const [raw, align] of segments) {
    if (!raw || !raw.trim()) continue
    const text = winAnsiSafe(font, applyPlaceholders(raw, cfg.vars))
    if (!text.trim()) continue
    const w = font.widthOfTextAtSize(text, cfg.size)
    const x =
      align === 'left'
        ? cfg.margin
        : align === 'center'
          ? Math.max(cfg.margin, (pageW - w) / 2)
          : Math.max(0, pageW - cfg.margin - w)
    page.drawText(text, { x, y: cfg.y, size: cfg.size, font, color: cfg.color })
  }
}

/* -------------------------------------------------------------------------- */
/*                                6. metadata                                  */
/* -------------------------------------------------------------------------- */

export interface PdfMetadataOptions {
  title?: string
  author?: string
  subject?: string
  /** Comma-separated; split into an array. */
  keywords?: string
}

/** Set document info fields (in place). Empty/undefined fields are ignored. */
export async function setPdfMetadata(file: Blob, opts: PdfMetadataOptions): Promise<Blob> {
  const doc = await loadPdfDoc(file)
  if (opts.title?.trim()) doc.setTitle(opts.title.trim())
  if (opts.author?.trim()) doc.setAuthor(opts.author.trim())
  if (opts.subject?.trim()) doc.setSubject(opts.subject.trim())
  const keywords = (opts.keywords ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  if (keywords.length > 0) doc.setKeywords(keywords)

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                             7. Bates numbering                              */
/* -------------------------------------------------------------------------- */

export type BatesPosition =
  | 'bottom-right'
  | 'bottom-center'
  | 'bottom-left'
  | 'top-right'
  | 'top-center'
  | 'top-left'

export interface BatesOptions {
  /** Text before the serial number. Default ''. */
  prefix?: string
  /** Text after the serial number. Default ''. */
  suffix?: string
  /** First serial number. Default 1. */
  start?: number
  /** Zero-padded digit count (0–8). Default 4. */
  padding?: number
  /** Default 10. */
  fontSize?: number
  /** "#rrggbb". Default "#000000". */
  colorHex?: string
  /** Default 'bottom-right'. */
  position?: BatesPosition
  /** Distance from the page edge in points. Default 36. */
  margin?: number
}

/**
 * Stamp a unique sequential serial number on every page (in place):
 * `prefix + String(start + i).padStart(padding, '0') + suffix`.
 * Same Latin-only caveat as stampHeaderFooter (prefix/suffix sanitized).
 */
export async function stampBates(file: Blob, opts: BatesOptions = {}): Promise<Blob> {
  const doc = await loadPdfDoc(file)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontSize = clampNum(opts.fontSize ?? 10, 4, 72)
  const margin = Math.max(0, opts.margin ?? 36)
  const color = hexToRgb(opts.colorHex)
  const start = Number.isFinite(opts.start) ? Number(opts.start) : 1
  const padding = Math.round(clampNum(opts.padding ?? 4, 0, 8))
  const prefix = opts.prefix ?? ''
  const suffix = opts.suffix ?? ''
  const position = opts.position ?? 'bottom-right'

  const pages = doc.getPages()
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!
    const text = winAnsiSafe(
      font,
      `${prefix}${String(start + i).padStart(padding, '0')}${suffix}`
    )
    if (!text.trim()) continue
    const w = font.widthOfTextAtSize(text, fontSize)
    const pageW = page.getWidth()
    const pageH = page.getHeight()

    const horiz = position.split('-')[1] as 'left' | 'center' | 'right'
    const atTop = position.startsWith('top')
    const x =
      horiz === 'left'
        ? margin
        : horiz === 'center'
          ? Math.max(margin, (pageW - w) / 2)
          : Math.max(0, pageW - margin - w)
    // Baselines mirror the header/footer bands: a whisker below the top
    // margin, a whisker above the bottom margin.
    const y = atTop ? pageH - margin - fontSize * 0.2 : margin + fontSize * 0.2
    page.drawText(text, { x, y, size: fontSize, font, color })
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                                  helpers                                    */
/* -------------------------------------------------------------------------- */

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Parse "#rrggbb" into a pdf-lib color; falls back to black. */
function hexToRgb(hex: string | undefined): Color {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return rgb(0, 0, 0)
  const int = parseInt(m[1]!, 16)
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255)
}

/**
 * The standard-14 fonts use WinAnsi encoding and THROW on any other
 * character (e.g. Bengali). Replace unsupported characters with "?" so a
 * Bengali header never crashes the run.
 */
function winAnsiSafe(font: PDFFont, text: string): string {
  let out = ''
  for (const ch of text) {
    if (ch === '\t' || ch === '\n' || ch === '\r') {
      out += ' '
      continue
    }
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}
