/**
 * PDF annotation model + shared drawing helpers for the PDF editor.
 *
 * Annotations are captured in PDF user space (y-up, bottom-left origin) via
 * pdf.js viewport math (`convertToPdfPoint` / `convertToViewportPoint`),
 * previewed on a transparent 2D canvas overlay, and finally burned into the
 * document with pdf-lib on save.
 *
 * pdf-lib standard fonts (WinAnsi encoding) cannot encode non-Latin glyphs,
 * so all burned text is sanitized to a Latin-1-compatible subset — unsupported
 * characters become "?" placeholders (an accepted trade-off for a
 * dependency-free, client-only editor). The canvas overlay paints the same
 * sanitized string so what you see is what gets saved.
 */
import { degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'

/* ------------------------------------------------------------------ model */

export type ToolMode = 'view' | 'text' | 'draw' | 'highlight' | 'whiteout'

export type NumberPosition = 'bottom-center' | 'bottom-right' | 'top-right'

export interface PdfPoint {
  x: number
  y: number
}

export type PdfAnnotation =
  | {
      id: string
      page: number
      type: 'text'
      pdfX: number
      pdfY: number
      data: { text: string; size: number; color: string }
    }
  | {
      id: string
      page: number
      type: 'ink'
      pdfX: number
      pdfY: number
      data: { points: PdfPoint[]; width: number; color: string }
    }
  | {
      id: string
      page: number
      type: 'highlight'
      pdfX: number
      pdfY: number
      data: { width: number; height: number }
    }
  | {
      id: string
      page: number
      type: 'whiteout'
      pdfX: number
      pdfY: number
      data: { width: number; height: number }
    }

/** A fresh annotation before it receives its id/page. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewPdfAnnotation = DistributiveOmit<PdfAnnotation, 'id' | 'page'>

/** Structural subset of the pdf.js PageViewport used by these helpers. */
export interface OverlayViewport {
  width: number
  height: number
  scale: number
  convertToViewportPoint(x: number, y: number): unknown[]
  convertToPdfPoint(x: number, y: number): unknown[]
}

/* -------------------------------------------------------------- constants */

/** Preset ink/text colours: black, red, blue, green, white. */
export const COLOR_SWATCHES = ['#000000', '#dc2626', '#2563eb', '#16a34a', '#ffffff'] as const

export const HIGHLIGHT_STYLE = 'rgba(255, 235, 59, 0.42)'
export const WHITEOUT_STYLE = '#ffffff'

/* ---------------------------------------------------------------- helpers */

const finite = (n: unknown): number => {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

/** Screen (viewport) point → PDF user space (y-up). */
export function toPdfPoint(vp: OverlayViewport, x: number, y: number): PdfPoint {
  const p = vp.convertToPdfPoint(x, y)
  return { x: finite(p?.[0]), y: finite(p?.[1]) }
}

/** PDF user space point → screen (viewport) point pair. */
export function toViewportPair(vp: OverlayViewport, x: number, y: number): [number, number] {
  const p = vp.convertToViewportPoint(x, y)
  return [finite(p?.[0]), finite(p?.[1])]
}

const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

/** Map text onto the WinAnsi repertoire supported by pdf-lib standard fonts. */
export function sanitizeWinAnsi(text: string): string {
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

function hexToRgbColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return rgb(0, 0, 0)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/* --------------------------------------------- canvas overlay (previewing) */

/** Paint one annotation onto the overlay canvas using the page viewport. */
export function paintAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: PdfAnnotation,
  vp: OverlayViewport
): void {
  switch (ann.type) {
    case 'text': {
      const [sx, sy] = toViewportPair(vp, ann.pdfX, ann.pdfY)
      ctx.fillStyle = ann.data.color
      ctx.textBaseline = 'alphabetic'
      ctx.font = `${ann.data.size * vp.scale}px Helvetica, Arial, sans-serif`
      ctx.fillText(sanitizeWinAnsi(ann.data.text), sx, sy)
      break
    }
    case 'ink': {
      const pts = ann.data.points
      if (pts.length < 2) break
      ctx.strokeStyle = ann.data.color
      ctx.lineWidth = Math.max(1, ann.data.width * vp.scale)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const [sx, sy] = toViewportPair(vp, pts[i].x, pts[i].y)
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      }
      ctx.stroke()
      break
    }
    case 'highlight':
    case 'whiteout': {
      const [ax, ay] = toViewportPair(vp, ann.pdfX, ann.pdfY)
      const [bx, by] = toViewportPair(vp, ann.pdfX + ann.data.width, ann.pdfY + ann.data.height)
      ctx.fillStyle = ann.type === 'highlight' ? HIGHLIGHT_STYLE : WHITEOUT_STYLE
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
      break
    }
  }
}

/* --------------------------------------------------- pdf-lib burn-in (save) */

/** Burn one annotation into a pdf-lib page (PDF user space, y-up). */
export function drawAnnotationPdf(page: PDFPage, ann: PdfAnnotation, font: PDFFont): void {
  switch (ann.type) {
    case 'text': {
      const text = sanitizeWinAnsi(ann.data.text)
      if (!text.trim()) break
      page.drawText(text, {
        x: ann.pdfX,
        y: ann.pdfY,
        size: ann.data.size,
        font,
        color: hexToRgbColor(ann.data.color),
      })
      break
    }
    case 'ink': {
      const pts = ann.data.points
      if (pts.length < 2) break
      const color = hexToRgbColor(ann.data.color)
      for (let i = 1; i < pts.length; i++) {
        page.drawLine({
          start: { x: pts[i - 1].x, y: pts[i - 1].y },
          end: { x: pts[i].x, y: pts[i].y },
          thickness: ann.data.width,
          color,
        })
      }
      break
    }
    case 'highlight':
      page.drawRectangle({
        x: ann.pdfX,
        y: ann.pdfY,
        width: ann.data.width,
        height: ann.data.height,
        color: rgb(1, 0.92, 0.23),
        opacity: 0.42,
      })
      break
    case 'whiteout':
      page.drawRectangle({
        x: ann.pdfX,
        y: ann.pdfY,
        width: ann.data.width,
        height: ann.data.height,
        color: rgb(1, 1, 1),
      })
      break
  }
}

/** Diagonal 45° watermark centred on the page (unrotated user space). */
export function drawWatermark(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  opacity: number
): void {
  const t = sanitizeWinAnsi(text).trim()
  if (!t) return
  const { width, height } = page.getSize()
  const tw = font.widthOfTextAtSize(t, size)
  const rad = Math.PI / 4
  const x = width / 2 - (tw / 2) * Math.cos(rad)
  const y = height / 2 - (tw / 2) * Math.sin(rad)
  page.drawText(t, {
    x,
    y,
    size,
    font,
    rotate: degrees(45),
    color: rgb(0.45, 0.45, 0.45),
    opacity,
  })
}

/** Draw an "i / n" page number (unrotated user space). */
export function drawPageNumber(
  page: PDFPage,
  label: string,
  font: PDFFont,
  position: NumberPosition
): void {
  const size = 11
  const margin = 24
  const { width, height } = page.getSize()
  const tw = font.widthOfTextAtSize(label, size)
  let x = (width - tw) / 2
  let y = margin
  if (position === 'bottom-right') x = width - tw - margin
  if (position === 'top-right') {
    x = width - tw - margin
    y = height - margin
  }
  page.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.25) })
}
