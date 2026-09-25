/**
 * Pure logic for the PDF conversion tools (Task 2-c) — 100% client-side.
 *
 *  - pdfToXlsx   → pdf.js text layer → xlsx workbook (one sheet per page)
 *  - pdfToPptx   → pdf.js page renders → pptxgenjs full-slide deck (v4 API)
 *  - pdfToHtml   → pdf.js text layer → standalone .html (no external resources)
 *  - textToPdf   → pasted text / .txt → PDF (canvas image mode = full Unicode
 *                  incl. Bengali; pdf-lib text mode = selectable Latin-only)
 *  - applyScanFilter / captureVideoFrame → camera scanner helpers
 *
 * Libraries
 *  - pptxgenjs 4.0.1: `write({ outputType: 'blob' })` returns
 *    Promise<string | ArrayBuffer | Blob | Uint8Array>; images need
 *    `data: 'image/jpeg;base64,…'` (the `data:` prefix is optional but the
 *    `base64,` marker is required); custom layouts via
 *    `defineLayout({ name, width, height })` + `layout = name`.
 *  - xlsx 0.18.5: `utils.aoa_to_sheet` / `utils.book_append_sheet` /
 *    `write(wb, { bookType: 'xlsx', type: 'array' })` → ArrayBuffer.
 *
 * ERROR CONTRACT — same as pdf-tools-advanced.ts: expected failures are
 * thrown as ToolError carrying an i18n key starting with `pdfErr` (defined
 * in src/lib/i18n/tools-pdf-convert.ts); panels show them via
 * errMessage(err, t).
 */

import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib'
import * as XLSX from 'xlsx'

import { baseName } from '@/lib/tools/batch'
import {
  canvasToBlob,
  closePdfDoc,
  pdfExtractText,
  pdfjsDoc,
  renderPdfPage,
  ToolError,
  totalTextLength,
} from '@/lib/tools/pdf-tools-advanced'

/** Page progress callback used across the tool suite. */
export type PageProgress = (done: number, total: number) => void

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/* -------------------------------------------------------------------------- */
/*                                  1. XLSX                                    */
/* -------------------------------------------------------------------------- */

/**
 * Split one extracted page into spreadsheet rows: each line is split on
 * tabs / runs of 2+ spaces (a cheap table heuristic), cells are trimmed and
 * emptied ones dropped; a line with a single cell stays a single column.
 */
function pageToRows(page: string): string[][] {
  const rows: string[][] = []
  for (const line of page.split('\n')) {
    const cells = line
      .split(/\t| {2,}/)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== '')
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

/**
 * Convert a text-layer PDF into an .xlsx workbook — one sheet per page
 * ("Page 1", "Page 2", …). Throws pdfErrNoText when the document has no
 * usable text layer (scanned PDFs).
 */
export async function pdfToXlsx(
  file: File,
  onProgress?: PageProgress
): Promise<Blob> {
  const pages = await pdfExtractText(file, onProgress)
  if (totalTextLength(pages) < 5) throw new ToolError('pdfErrNoText')

  const wb = XLSX.utils.book_new()
  pages.forEach((page, idx) => {
    const rows = pageToRows(page)
    // Keep the sheet alive even for (near-)empty pages so sheet N still
    // matches PDF page N.
    const ws = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [['']])
    XLSX.utils.book_append_sheet(wb, ws, `Page ${idx + 1}`)
  })

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([buf], { type: XLSX_MIME })
}

/* -------------------------------------------------------------------------- */
/*                                  2. PPTX                                    */
/* -------------------------------------------------------------------------- */

/** 16:9 full-bleed slide size in inches. */
const SLIDE_W = 13.333
const SLIDE_H = 7.5

/** Safety cap — rasterising hundreds of pages would exhaust tab memory. */
export const PDF_TO_PPTX_MAX_PAGES = 50

export interface PdfToPptxOptions {
  /** Viewport multiplier over the 72dpi base (1 = screen, 2 = sharp). */
  scale?: number
  /** Maximum number of pages converted (default 50). */
  maxPages?: number
}

/** FileReader → base64 (without the data-uri prefix) as pptxgenjs expects. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      const comma = url.indexOf(',')
      resolve(comma >= 0 ? url.slice(comma + 1) : url)
    }
    reader.onerror = () => reject(new ToolError('pdfErrCorrupt', 'slide encode'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Convert a PDF into a full-bleed .pptx deck — every page becomes one
 * 16:9 slide with the rendered page as a JPEG covering the whole slide.
 */
export async function pdfToPptx(
  file: File,
  opts: PdfToPptxOptions = {},
  onProgress?: PageProgress
): Promise<Blob> {
  const scale = opts.scale ?? 2
  const maxPages = Math.max(1, opts.maxPages ?? PDF_TO_PPTX_MAX_PAGES)

  // pptxgenjs v4 — default export is the class; keep it out of the main bundle.
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'FULL', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'FULL'

  const doc = await pdfjsDoc(file)
  const total = Math.min(doc.numPages, maxPages)
  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i)
      const canvas = await renderPdfPage(page, scale)
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9)
      canvas.width = 0
      canvas.height = 0

      const base64 = await blobToBase64(jpeg)
      const slide = pptx.addSlide()
      slide.addImage({
        data: `image/jpeg;base64,${base64}`,
        x: 0,
        y: 0,
        w: SLIDE_W,
        h: SLIDE_H,
      })
      onProgress?.(i, total)
    }
  } finally {
    await closePdfDoc(doc)
  }

  // write() return type is a union across output types — normalise to Blob.
  const out = await pptx.write({ outputType: 'blob' })
  if (out instanceof Blob) return out
  if (out instanceof ArrayBuffer) return new Blob([out], { type: PPTX_MIME })
  if (ArrayBuffer.isView(out)) return new Blob([new Uint8Array(out)], { type: PPTX_MIME })
  return new Blob([String(out)], { type: PPTX_MIME })
}

/* -------------------------------------------------------------------------- */
/*                                  3. HTML                                    */
/* -------------------------------------------------------------------------- */

/** Escape & < > " ' for safe HTML text/attribute interpolation. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Convert a text-layer PDF into one standalone .html file: inline CSS only,
 * one <section> per page with an <h2> heading and a pre-wrapped text block
 * (dir="auto" so Bengali/Arabic lines render correctly).
 */
export async function pdfToHtml(
  file: File,
  opts: {
    onProgress?: PageProgress
    /** i18n'd "Page N" heading, e.g. (n) => tf('pdfPageN', { n }). */
    pageLabel?: (n: number) => string
  } = {}
): Promise<Blob> {
  const pages = await pdfExtractText(file, opts.onProgress)
  if (totalTextLength(pages) < 5) throw new ToolError('pdfErrNoText')

  const label = opts.pageLabel ?? ((n: number) => `Page ${n}`)
  const title = baseName(file.name)

  const sections = pages
    .map(
      (page, idx) =>
        `  <section>\n    <h2>${escapeHtml(label(idx + 1))}</h2>\n` +
        `    <div dir="auto" style="white-space:pre-wrap">${escapeHtml(page)}</div>\n  </section>`
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI','Noto Sans Bengali',sans-serif;
       max-width:840px;margin:0 auto;padding:16px;line-height:1.6;color:#1c1c1c;background:#ffffff}
  section{margin:0 0 28px;padding:16px;border:1px solid #e4e4e4;border-radius:12px}
  h2{font-size:0.95rem;font-weight:600;margin:0 0 10px;color:#6b6b6b}
</style>
</head>
<body>
${sections}
</body>
</html>`

  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

/* -------------------------------------------------------------------------- */
/*                                 4. Text → PDF                               */
/* -------------------------------------------------------------------------- */

export type TextToPdfPageSize = 'a4' | 'letter'
export type TextToPdfMode = 'image' | 'text'
export type TextToPdfFont = 'helvetica' | 'times'

export interface TextToPdfOptions {
  pageSize?: TextToPdfPageSize
  /** 'image' = canvas render (full Unicode incl. Bengali); 'text' = selectable Latin-only. */
  mode?: TextToPdfMode
  /** Body font size in pt (10–28). */
  fontSize?: number
  /** Optional document title drawn bold + centred on the first page. */
  title?: string
  /** 'text' mode only — body font family (standard-14). */
  font?: TextToPdfFont
}

const A4_SIZE: [number, number] = [595.28, 841.89]
const LETTER_SIZE: [number, number] = [612, 792]

/** Hard cap so a pasted novel cannot freeze the tab for minutes. */
const TEXT_TO_PDF_MAX_PAGES = 200

/** Same WinAnsi mapping as src/lib/pdf-annotate.ts (standard-14 fonts). */
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

function sanitizeWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp === 9 || cp === 10 || cp === 13) {
      out += ' '
      continue
    }
    if ((cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255) || WINANSI_EXTRA.includes(ch)) {
      out += ch
      continue
    }
    out += '?'
  }
  return out
}

/**
 * Word-wrap one logical line into visual lines. Words wider than a full
 * line are hard-broken character by character (long Bengali compounds,
 * URLs…). `width()` measures any candidate string in the current font.
 */
function wrapLine(
  line: string,
  width: (s: string) => number,
  maxWidth: number
): string[] {
  if (!line) return ['']

  // Split into tokens first, hard-breaking overlong words.
  const tokens: string[] = []
  for (const raw of line.split(' ')) {
    if (width(raw) <= maxWidth) {
      tokens.push(raw)
      continue
    }
    let chunk = ''
    for (const ch of raw) {
      const test = chunk + ch
      if (chunk && width(test) > maxWidth) {
        tokens.push(chunk)
        chunk = ch
      } else {
        chunk = test
      }
    }
    if (chunk) tokens.push(chunk)
  }

  const out: string[] = []
  let cur = ''
  for (const word of tokens) {
    if (!cur) {
      cur = word
      continue
    }
    if (width(`${cur} ${word}`) <= maxWidth) {
      cur += ` ${word}`
    } else {
      out.push(cur)
      cur = word
    }
  }
  out.push(cur)
  return out
}

/** Text → PDF, image mode. Every page = canvas render → JPEG → full-bleed. */
async function textToPdfImage(
  text: string,
  opts: { pageSize: TextToPdfPageSize; fontSize: number; title?: string }
): Promise<Blob> {
  const [pageW, pageH] = opts.pageSize === 'letter' ? LETTER_SIZE : A4_SIZE
  const SCALE = 2
  const canvasW = Math.round(pageW * SCALE)
  const canvasH = Math.round(pageH * SCALE)
  const margin = 64 // canvas px, top + bottom
  const lineHeight = opts.fontSize * 1.6 * SCALE
  const fontPx = opts.fontSize * SCALE

  const FONT = `${fontPx}px system-ui, 'Noto Sans Bengali', sans-serif`
  const TITLE_FONT = `bold ${fontPx}px system-ui, 'Noto Sans Bengali', sans-serif`

  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('canvas 2d context unavailable')

  const maxWidth = canvasW - margin * 2
  measure.font = FONT
  const bodyLines = text.split('\n').flatMap((line) => wrapLine(line, (s) => measure.measureText(s).width, maxWidth))

  let lines: Array<{ text: string; bold: boolean; center: boolean }> = []
  const bodyRows = bodyLines.map((l) => ({ text: l, bold: false, center: false }))
  if (opts.title) {
    measure.font = TITLE_FONT
    const titleLines = wrapLine(
      opts.title,
      (s) => measure.measureText(s).width,
      maxWidth
    ).map((l) => ({ text: l, bold: true, center: true }))
    lines = [...titleLines, { text: '', bold: false, center: false }, ...bodyRows]
    measure.font = FONT
  } else {
    lines = bodyRows
  }

  const perPage = Math.max(1, Math.floor((canvasH - margin * 2) / lineHeight))
  const pageCount = Math.ceil(lines.length / perPage)
  if (pageCount > TEXT_TO_PDF_MAX_PAGES) throw new ToolError('pdfErrTextTooLong')

  const out = await PDFDocument.create()
  for (let p = 0; p < pageCount; p++) {
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasW, canvasH)
    ctx.textBaseline = 'top'
    for (let row = 0; row < perPage; row++) {
      const line = lines[p * perPage + row]
      if (!line) break
      ctx.font = line.bold ? TITLE_FONT : FONT
      ctx.fillStyle = line.bold ? '#111111' : '#1a1a1a'
      const w = ctx.measureText(line.text).width
      const x = line.center ? Math.max(margin, (canvasW - w) / 2) : margin
      ctx.fillText(line.text, x, margin + row * lineHeight)
    }

    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.92)
    canvas.width = 0
    canvas.height = 0
    const img = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))
    const page = out.addPage([pageW, pageH])
    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH })
  }

  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Text → PDF, selectable text mode (standard-14 fonts, Latin-only). */
async function textToPdfLibText(
  text: string,
  opts: { pageSize: TextToPdfPageSize; fontSize: number; title?: string; font: TextToPdfFont }
): Promise<Blob> {
  const [pageW, pageH] = opts.pageSize === 'letter' ? LETTER_SIZE : A4_SIZE
  const margin = 48
  const lineHeight = opts.fontSize * 1.6
  const maxWidth = pageW - margin * 2

  const out = await PDFDocument.create()
  const body = opts.font === 'times' ? StandardFonts.TimesRoman : StandardFonts.Helvetica
  const heading = opts.font === 'times' ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold
  const font = await out.embedFont(body)
  const boldFont = await out.embedFont(heading)

  const width = (s: string) => font.widthOfTextAtSize(s, opts.fontSize)
  const sanitized = sanitizeWinAnsi(text)
  const bodyLines = sanitized.split('\n').flatMap((line) => wrapLine(line, width, maxWidth))

  let lines: Array<{ text: string; bold: boolean }> = []
  const bodyRows = bodyLines.map((l) => ({ text: l, bold: false }))
  if (opts.title) {
    const cleanTitle = sanitizeWinAnsi(opts.title).trim()
    if (cleanTitle) {
      const titleWidth = (s: string) => boldFont.widthOfTextAtSize(s, opts.fontSize)
      const titleLines = wrapLine(cleanTitle, titleWidth, maxWidth).map((l) => ({
        text: l,
        bold: true,
      }))
      lines = [...titleLines, { text: '', bold: false }, ...bodyRows]
    } else {
      lines = bodyRows
    }
  } else {
    lines = bodyRows
  }

  const perPage = Math.max(1, Math.floor((pageH - margin * 2) / lineHeight))
  const pageCount = Math.ceil(lines.length / perPage)
  if (pageCount > TEXT_TO_PDF_MAX_PAGES) throw new ToolError('pdfErrTextTooLong')

  const ink = rgb(0.1, 0.1, 0.1)
  for (let p = 0; p < pageCount; p++) {
    const page = out.addPage([pageW, pageH])
    for (let row = 0; row < perPage; row++) {
      const line = lines[p * perPage + row]
      if (!line) break
      if (!line.text) continue
      const usedFont = line.bold ? boldFont : font
      const w = usedFont.widthOfTextAtSize(line.text, opts.fontSize)
      page.drawText(line.text, {
        x: line.bold ? Math.max(margin, (pageW - w) / 2) : margin,
        y: pageH - margin - row * lineHeight - opts.fontSize,
        size: opts.fontSize,
        font: usedFont,
        color: ink,
      })
    }
  }

  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * Convert plain text into a PDF. Image mode renders through a canvas so
 * every Unicode script (incl. Bengali) survives; text mode produces real,
 * selectable content but is limited to the standard-14 WinAnsi repertoire.
 */
export async function textToPdf(text: string, opts: TextToPdfOptions = {}): Promise<Blob> {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
  if (!clean.trim()) throw new ToolError('pdfErrEmptyText')

  const pageSize: TextToPdfPageSize = opts.pageSize ?? 'a4'
  const mode: TextToPdfMode = opts.mode ?? 'image'
  const fontSize = Math.min(28, Math.max(10, opts.fontSize ?? 14))
  const title = opts.title?.trim() || undefined

  if (mode === 'text') {
    return textToPdfLibText(clean, {
      pageSize,
      fontSize,
      title,
      font: opts.font ?? 'helvetica',
    })
  }
  return textToPdfImage(clean, { pageSize, fontSize, title })
}

/* -------------------------------------------------------------------------- */
/*                              5. Camera scanner                              */
/* -------------------------------------------------------------------------- */

export type ScanFilter = 'none' | 'gray' | 'bw'

/** BW binarisation threshold (0–255). */
const SCAN_BW_THRESHOLD = 160

/**
 * Mutate a canvas in place with the scan filter:
 *  - 'gray' → luminance grayscale
 *  - 'bw'   → grayscale + hard threshold at 160 (crisp scanned look, tiny JPEG)
 * 'none' leaves the canvas untouched. Returns void on purpose.
 */
export function applyScanFilter(canvas: HTMLCanvasElement, filter: ScanFilter): void {
  if (filter === 'none') return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  if (width === 0 || height === 0) return

  const image = ctx.getImageData(0, 0, width, height)
  const d = image.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!
    const v =
      filter === 'bw'
        ? lum >= SCAN_BW_THRESHOLD
          ? 255
          : 0
        : Math.round(lum)
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
  }
  ctx.putImageData(image, 0, 0)
}

/** Grab the current video frame into a fresh canvas (full sensor resolution). */
export function captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 1280
  canvas.height = video.videoHeight || 720
  const ctx = canvas.getContext('2d')
  ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}
