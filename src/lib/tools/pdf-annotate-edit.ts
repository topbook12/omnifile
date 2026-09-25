/**
 * Annotation model + burn engine for the advanced PDF annotator and the
 * redaction tool (Task 2-d) — 100% client-side.
 *
 * This module is STANDALONE and richer than the in-app viewer's simpler
 * `src/lib/pdf-annotate.ts` model (that file is owned by the viewer; do not
 * merge them).
 *
 * ---------------------------------------------------------------------------
 * COORDINATE SYSTEM
 * All annotation geometry lives in PDF user space: y-up, origin at the
 * page's bottom-left, units = PDF points (1/72"). The panels convert pointer
 * events (screen space, y-down) into user space and render their SVG overlay
 * with the y-axis flipped (y_svg = pageH − y_pdf).
 *
 * ⚠ Like the e-sign tool, drawing happens in UNROTATED user space, so pages
 *   with /Rotate ≠ 0 may place marks at a different screen angle than the
 *   (rotation-aware) pdf.js preview suggests. Same accepted trade-off.
 *
 * ---------------------------------------------------------------------------
 * TEXT ENCODING
 * pdf-lib standard fonts (WinAnsi) cannot encode non-Latin glyphs. All text
 * is first sanitized to the Latin-1/WinAnsi subset (`sanitizeLatin`).
 * Additionally — and unlike the viewer's annotator — textbox / note / stamp
 * content that CONTAINS non-Latin characters (e.g. Bengali) is rendered to a
 * transparent canvas with the browser's own fonts (incl. 'Noto Sans Bengali'),
 * trimmed to its ink bbox (cropSignatureCanvas pattern) and embedded as PNG.
 * That burns real Bengali glyphs into the PDF at the cost of: (a) slightly
 * different glyph metrics than live text, and (b) one embedded image per
 * distinct string (cached per save in a Map). Latin-safe text stays as real,
 * selectable PDF text.
 *
 * ---------------------------------------------------------------------------
 * ERROR CONTRACT
 * Expected failures are thrown as ToolError carrying an i18n KEY starting
 * with `pdfErr` (pdfErrEncrypted / pdfErrCorrupt are shared with tools-pdf.ts,
 * pdfErrNoAnnotations is defined in tools-pdf-annotate.ts). Panels call
 * `errMessage(err, t)`.
 */

import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib'
import type { PDFFont, PDFImage, PDFPage } from '@cantoo/pdf-lib'

import { baseName, resultName } from './batch'
import {
  ToolError,
  canvasToBlob,
  closePdfDoc,
  cropSignatureCanvas,
  pdfjsDoc,
  renderPdfPage,
} from './pdf-tools-advanced'

export { baseName, resultName }

/* ------------------------------------------------------------------ model */

/** Rectangle in PDF user space (x, y = bottom-left corner; w, h ≥ 0 after normalisation). */
export interface EditRect {
  x: number
  y: number
  w: number
  h: number
}

/** Point in PDF user space (y-up). */
export interface EditPoint {
  x: number
  y: number
}

/**
 * One annotation, in PDF user space (y-up). `pageIndex` is 0-based.
 * Discriminated on `type` so the burn engine can switch exhaustively.
 */
export type PdfEditAnnotation =
  | {
      id: string
      pageIndex: number
      type: 'highlight'
      rect: EditRect
      /** Defaults to #ffe066 when omitted. */
      color?: string
      /** Defaults to 0.45 when omitted. */
      opacity?: number
    }
  | {
      id: string
      pageIndex: number
      type: 'underline'
      rect: EditRect
      color: string
      /** Line thickness in pt — defaults to 2 (burned at the rect's bottom area). */
      thickness?: number
    }
  | {
      id: string
      pageIndex: number
      type: 'strike'
      rect: EditRect
      color: string
      /** Line thickness in pt — defaults to 2 (burned through the rect's vertical middle). */
      thickness?: number
    }
  | {
      id: string
      pageIndex: number
      type: 'rect'
      rect: EditRect
      strokeColor: string
      strokeWidth: number
      /** Omitted / null / 'none' → outline only. */
      fillColor?: string | null
      fillOpacity?: number
    }
  | {
      id: string
      pageIndex: number
      type: 'ellipse'
      rect: EditRect
      strokeColor: string
      strokeWidth: number
      /** Omitted / null / 'none' → outline only. */
      fillColor?: string | null
      fillOpacity?: number
    }
  | {
      id: string
      pageIndex: number
      type: 'line'
      x1: number
      y1: number
      x2: number
      y2: number
      strokeColor: string
      strokeWidth: number
      /** true → two arrow-head strokes at the (x2, y2) end. */
      arrow: boolean
    }
  | {
      id: string
      pageIndex: number
      type: 'ink'
      points: EditPoint[]
      strokeWidth: number
      color: string
    }
  | {
      id: string
      pageIndex: number
      type: 'textbox'
      rect: EditRect
      text: string
      fontSize: number
      color: string
      /** '#ffffff' fills the box white; 'none' keeps it transparent. */
      fillColor: string
      borderColor: string
    }
  | {
      id: string
      pageIndex: number
      type: 'note'
      rect: EditRect
      text: string
      fontSize: number
    }
  | {
      id: string
      pageIndex: number
      type: 'stamp'
      /** Centre of the stamp. */
      x: number
      y: number
      text: string
      color: string
      fontSize: number
      /** Degrees — defaults to −15 (classic rubber-stamp tilt). */
      rotation?: number
    }

/* -------------------------------------------------------------- constants */

/** Swatch palette offered by the panels: yellow, red, orange, green, blue, black. */
export const ANNOTATE_SWATCHES = ['#ffe066', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#111111'] as const

export const DEFAULT_HIGHLIGHT_COLOR = '#ffe066'
export const HIGHLIGHT_OPACITY = 0.45
export const DEFAULT_STAMP_ROTATION = -15
export const DEFAULT_NOTE_TEXT_COLOR = '#3f3f46'

const NOTE_FILL = rgb(0.996, 0.973, 0.769) // light sticky-note yellow
const NOTE_BORDER = rgb(0.851, 0.686, 0.125) // darker yellow crease/border

/** Quality multiplier for canvas-rendered text images (4 px per 1 pt). */
const IMG_SCALE = 4

/** Browser font stack for the non-Latin canvas fallback (Bengali first). */
const FALLBACK_FONT_STACK =
  '"Noto Sans Bengali", "Hind Siliguri", "Noto Sans", "Segoe UI", Arial, sans-serif'

/* ---------------------------------------------------------------- helpers */

const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

/**
 * Map text onto the repertoire pdf-lib standard fonts can encode (Latin-1 +
 * the WinAnsi extras). Anything else — Bengali, emoji, CJK… — becomes "?".
 * Copy of the approach used by src/lib/pdf-annotate.ts (sanitizeWinAnsi).
 */
export function sanitizeLatin(text: string): string {
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

/** true when sanitizeLatin is a no-op — i.e. the text can be drawn as real PDF text. */
export function isLatinSafe(text: string): boolean {
  return sanitizeLatin(text) === text
}

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return rgb(0, 0, 0)
  let h = m[1]!
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Normalise a rect that may have been dragged "backwards" (negative w/h). */
function normRect(r: EditRect): EditRect {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  }
}

/** widthOfTextAtSize that never throws (approximate fallback for odd glyphs). */
function safeWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size)
  } catch {
    return text.length * size * 0.6
  }
}

/**
 * Greedy word-wrap measured with the real font. Long words that cannot fit a
 * line on their own are hard-broken by code points. Paragraph breaks (\n) are
 * preserved; returns at least one (possibly empty) line.
 */
export function wrapTextForBox(text: string, font: PDFFont, maxWidth: number, fontSize: number): string[] {
  const max = Math.max(4, maxWidth)
  const lines: string[] = []
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (para === '') {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of para.split(' ')) {
      if (word === '') continue
      // Break the word into pieces that each fit on a line of their own.
      const pieces: string[] = []
      if (safeWidth(font, word, fontSize) > max) {
        let chunk = ''
        for (const ch of Array.from(word)) {
          if (chunk && safeWidth(font, chunk + ch, fontSize) > max) {
            pieces.push(chunk)
            chunk = ch
          } else {
            chunk += ch
          }
        }
        if (chunk) pieces.push(chunk)
      } else {
        pieces.push(word)
      }
      for (const piece of pieces) {
        const candidate = line ? `${line} ${piece}` : piece
        if (safeWidth(font, candidate, fontSize) <= max) {
          line = candidate
          continue
        }
        if (line) lines.push(line)
        line = ''
        // Degenerate piece (single glyph wider than the box) is pushed as-is.
        if (safeWidth(font, piece, fontSize) <= max) line = piece
        else lines.push(piece)
      }
    }
    if (line) lines.push(line)
  }
  return lines.length > 0 ? lines : ['']
}

/** Rotate the anchor offset so a w×h box rotated by `rotationDeg` centres on (cx, cy). */
function rotAnchor(cx: number, cy: number, w: number, h: number, rotationDeg: number) {
  const th = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  return {
    x: cx - ((w / 2) * cos - (h / 2) * sin),
    y: cy - ((w / 2) * sin + (h / 2) * cos),
  }
}

/**
 * Render text to a transparent canvas with browser fonts (supports Bengali),
 * trim to the ink bbox and embed as PNG. One PDFImage per distinct
 * text+style is cached in `cache` for the whole save.
 *
 * Trade-off (documented at file head): exact browser glyph shapes at the cost
 * of an embedded image per string — the text stops being selectable there.
 */
async function embedTextImage(
  doc: PDFDocument,
  text: string,
  fontSize: number,
  colorHex: string,
  cache: Map<string, PDFImage>
): Promise<PDFImage | null> {
  const key = `${fontSize}|${colorHex}|${text}`
  const cached = cache.get(key)
  if (cached) return cached

  const fontPx = Math.max(4, fontSize * IMG_SCALE)
  const fontSpec = `${fontPx}px ${FALLBACK_FONT_STACK}`
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n')

  const canvas = document.createElement('canvas')
  const measurer = canvas.getContext('2d')
  if (!measurer) return null
  measurer.font = fontSpec
  let maxW = 0
  for (const l of rawLines) maxW = Math.max(maxW, measurer.measureText(l || ' ').width)

  const lineH = fontPx * 1.3
  canvas.width = Math.max(2, Math.ceil(maxW) + 8)
  canvas.height = Math.max(2, Math.ceil(rawLines.length * lineH) + 8)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = fontSpec // canvas resize resets state → set again
  ctx.fillStyle = colorHex
  ctx.textBaseline = 'alphabetic'
  rawLines.forEach((l, i) => ctx.fillText(l, 4, 4 + fontPx * 0.95 + i * lineH))

  const cropped = cropSignatureCanvas(canvas)
  canvas.width = 0
  canvas.height = 0
  if (!cropped) return null

  const png = await canvasToBlob(cropped, 'image/png')
  cropped.width = 0
  cropped.height = 0
  const img = await doc.embedPng(new Uint8Array(await png.arrayBuffer()))
  cache.set(key, img)
  return img
}

/** Place a pre-trimmed text image inside a rect (top-anchored, never upscaled). */
function drawTextImageFitted(page: PDFPage, img: PDFImage, r: EditRect, pad: number): void {
  const natW = img.width / IMG_SCALE
  const natH = img.height / IMG_SCALE
  const maxW = Math.max(6, r.w - pad * 2)
  const maxH = Math.max(6, r.h - pad)
  const f = Math.min(maxW / natW, maxH / natH, 1)
  const w = natW * f
  const h = natH * f
  page.drawImage(img, {
    x: r.x + pad + (maxW - w) / 2,
    y: r.y + r.h - pad - h,
    width: w,
    height: h,
  })
}

/** Draw the wrapped Latin lines of a textbox / note from the top of its rect. */
function drawWrappedLatin(
  page: PDFPage,
  text: string,
  r: EditRect,
  pad: number,
  fontSize: number,
  colorHex: string,
  font: PDFFont
): void {
  const lines = wrapTextForBox(sanitizeLatin(text), font, Math.max(8, r.w - pad * 2), fontSize)
  const lineH = fontSize * 1.3
  let y = r.y + r.h - pad - fontSize * 0.9
  for (const line of lines) {
    if (y < r.y + 2) break // rect is full — drop the overflow
    if (line) {
      page.drawText(line, { x: r.x + pad, y, size: fontSize, font, color: hexToRgb(colorHex) })
    }
    y -= lineH
  }
}

/* --------------------------------------------------------- drawing engine */

/** Everything `drawAnnotation` needs that is shared across one save run. */
export interface DrawAnnotationCtx {
  font: PDFFont
  boldFont: PDFFont
  /** Cache of embedded PNGs (one image per distinct text+style). */
  imageCache: Map<string, PDFImage>
}

/**
 * Burn ONE annotation into a pdf-lib page (PDF user space, y-up).
 * Non-Latin text in textbox / note / stamp falls back to a canvas-rendered
 * PNG (see file head); everything else is native vector PDF content.
 */
export async function drawAnnotation(
  page: PDFPage,
  doc: PDFDocument,
  ann: PdfEditAnnotation,
  ctx: DrawAnnotationCtx
): Promise<void> {
  switch (ann.type) {
    case 'highlight': {
      const r = normRect(ann.rect)
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: Math.max(1, r.w),
        height: Math.max(1, r.h),
        color: hexToRgb(ann.color ?? DEFAULT_HIGHLIGHT_COLOR),
        opacity: ann.opacity ?? HIGHLIGHT_OPACITY,
      })
      break
    }

    case 'underline':
    case 'strike': {
      const r = normRect(ann.rect)
      const t = Math.max(1, ann.thickness ?? 2)
      // underline → bottom area of the rect; strike → vertical middle.
      const y = ann.type === 'underline' ? r.y + t / 2 : r.y + r.h / 2
      page.drawLine({
        start: { x: r.x, y },
        end: { x: r.x + r.w, y },
        thickness: t,
        color: hexToRgb(ann.color),
        lineCap: LineCapStyle.Round,
      })
      break
    }

    case 'rect': {
      const r = normRect(ann.rect)
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: Math.max(1, r.w),
        height: Math.max(1, r.h),
        borderColor: hexToRgb(ann.strokeColor),
        borderWidth: Math.max(0.5, ann.strokeWidth),
        ...(ann.fillColor && ann.fillColor !== 'none'
          ? { color: hexToRgb(ann.fillColor), opacity: ann.fillOpacity ?? 1 }
          : {}),
      })
      break
    }

    case 'ellipse': {
      const r = normRect(ann.rect)
      page.drawEllipse({
        x: r.x + r.w / 2,
        y: r.y + r.h / 2,
        xScale: Math.max(0.5, r.w / 2),
        yScale: Math.max(0.5, r.h / 2),
        borderColor: hexToRgb(ann.strokeColor),
        borderWidth: Math.max(0.5, ann.strokeWidth),
        ...(ann.fillColor && ann.fillColor !== 'none'
          ? { color: hexToRgb(ann.fillColor), opacity: ann.fillOpacity ?? 1 }
          : {}),
      })
      break
    }

    case 'line': {
      const color = hexToRgb(ann.strokeColor)
      page.drawLine({
        start: { x: ann.x1, y: ann.y1 },
        end: { x: ann.x2, y: ann.y2 },
        thickness: Math.max(0.5, ann.strokeWidth),
        color,
        lineCap: LineCapStyle.Round,
      })
      if (ann.arrow) {
        const ang = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1)
        const head = Math.max(8, ann.strokeWidth * 4)
        for (const spread of [Math.PI - 0.45, Math.PI + 0.45]) {
          const a = ang + spread
          page.drawLine({
            start: { x: ann.x2, y: ann.y2 },
            end: { x: ann.x2 + head * Math.cos(a), y: ann.y2 + head * Math.sin(a) },
            thickness: Math.max(0.5, ann.strokeWidth),
            color,
            lineCap: LineCapStyle.Round,
          })
        }
      }
      break
    }

    case 'ink': {
      const pts = ann.points
      const color = hexToRgb(ann.color)
      if (pts.length === 1) {
        // Single tap → round dot.
        page.drawCircle({ x: pts[0]!.x, y: pts[0]!.y, size: Math.max(0.75, ann.strokeWidth / 2), color })
        break
      }
      for (let i = 1; i < pts.length; i++) {
        page.drawLine({
          start: { x: pts[i - 1]!.x, y: pts[i - 1]!.y },
          end: { x: pts[i]!.x, y: pts[i]!.y },
          thickness: Math.max(0.5, ann.strokeWidth),
          color,
          lineCap: LineCapStyle.Round,
        })
      }
      break
    }

    case 'textbox': {
      const r = normRect(ann.rect)
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: Math.max(1, r.w),
        height: Math.max(1, r.h),
        borderColor: hexToRgb(ann.borderColor),
        borderWidth: 1,
        ...(ann.fillColor && ann.fillColor !== 'none' ? { color: hexToRgb(ann.fillColor) } : {}),
      })
      const text = ann.text ?? ''
      if (!text.trim()) break
      if (isLatinSafe(text)) {
        drawWrappedLatin(page, text, r, 4, ann.fontSize, ann.color, ctx.font)
      } else {
        const img = await embedTextImage(doc, text, ann.fontSize, ann.color, ctx.imageCache)
        if (img) drawTextImageFitted(page, img, r, 4)
      }
      break
    }

    case 'note': {
      const r = normRect(ann.rect)
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: Math.max(1, r.w),
        height: Math.max(1, r.h),
        color: NOTE_FILL,
        borderColor: NOTE_BORDER,
        borderWidth: 1,
      })
      // Sticky-note folded-corner crease (top-right).
      const fold = Math.min(14, r.w / 3, r.h / 3)
      if (fold > 2) {
        page.drawLine({
          start: { x: r.x + r.w - fold, y: r.y + r.h },
          end: { x: r.x + r.w, y: r.y + r.h - fold },
          thickness: 1,
          color: NOTE_BORDER,
        })
      }
      const text = ann.text ?? ''
      if (!text.trim()) break
      if (isLatinSafe(text)) {
        drawWrappedLatin(page, text, r, 8, ann.fontSize, DEFAULT_NOTE_TEXT_COLOR, ctx.font)
      } else {
        const img = await embedTextImage(doc, text, ann.fontSize, DEFAULT_NOTE_TEXT_COLOR, ctx.imageCache)
        if (img) drawTextImageFitted(page, img, r, 8)
      }
      break
    }

    case 'stamp': {
      const text = (ann.text ?? '').replace(/\s+/g, ' ').trim()
      if (!text) break
      const rotation = ann.rotation ?? DEFAULT_STAMP_ROTATION
      const cx = ann.x
      const cy = ann.y
      if (isLatinSafe(text)) {
        const s = sanitizeLatin(text)
        const tw = safeWidth(ctx.boldFont, s, ann.fontSize)
        const boxW = tw + 16
        const boxH = ann.fontSize * 1.6
        const anchor = rotAnchor(cx, cy, boxW, boxH, rotation)
        page.drawRectangle({
          x: anchor.x,
          y: anchor.y,
          width: boxW,
          height: boxH,
          rotate: degrees(rotation),
          borderColor: hexToRgb(ann.color),
          borderWidth: 2,
        })
        // Baseline-left so the text centre lands on (cx, cy); baseline sits
        // ≈0.35 em below the visual centre (cap-height / 2).
        const th = (rotation * Math.PI) / 180
        const tx = cx - ((tw / 2) * Math.cos(th) - 0.35 * ann.fontSize * Math.sin(th))
        const ty = cy - ((tw / 2) * Math.sin(th) + 0.35 * ann.fontSize * Math.cos(th))
        page.drawText(s, {
          x: tx,
          y: ty,
          size: ann.fontSize,
          font: ctx.boldFont,
          color: hexToRgb(ann.color),
          rotate: degrees(rotation),
        })
      } else {
        // Non-Latin stamp → rotated PNG with a border frame around it.
        const img = await embedTextImage(doc, text, ann.fontSize, ann.color, ctx.imageCache)
        if (!img) break
        const textW = img.width / IMG_SCALE
        const textH = img.height / IMG_SCALE
        const frameW = textW + 14
        const frameH = textH + 10
        const frameAnchor = rotAnchor(cx, cy, frameW, frameH, rotation)
        page.drawRectangle({
          x: frameAnchor.x,
          y: frameAnchor.y,
          width: frameW,
          height: frameH,
          rotate: degrees(rotation),
          borderColor: hexToRgb(ann.color),
          borderWidth: 2,
        })
        const textAnchor = rotAnchor(cx, cy, textW, textH, rotation)
        page.drawImage(img, {
          x: textAnchor.x,
          y: textAnchor.y,
          width: textW,
          height: textH,
          rotate: degrees(rotation),
        })
      }
      break
    }
  }
}

/* ------------------------------------------------------------ hit & move */

/** Axis-aligned bounding box (PDF user space) used for hit-testing and the selection ring. */
export function annotationBBox(ann: PdfEditAnnotation): EditRect {
  switch (ann.type) {
    case 'highlight':
    case 'underline':
    case 'strike':
    case 'rect':
    case 'ellipse':
    case 'textbox':
    case 'note':
      return normRect(ann.rect)
    case 'line': {
      const pad = ann.strokeWidth / 2 + 2
      return {
        x: Math.min(ann.x1, ann.x2) - pad,
        y: Math.min(ann.y1, ann.y2) - pad,
        w: Math.abs(ann.x2 - ann.x1) + pad * 2,
        h: Math.abs(ann.y2 - ann.y1) + pad * 2,
      }
    }
    case 'ink': {
      const pad = ann.strokeWidth / 2 + 2
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of ann.points) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
      if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
    }
    case 'stamp': {
      // Rotation is ignored for hit-testing — axis-aligned approximation.
      const w = (ann.text?.length ?? 0) * ann.fontSize * 0.62 + 24
      const h = ann.fontSize * 2
      return { x: ann.x - w / 2, y: ann.y - h / 2, w, h }
    }
  }
}

/**
 * Point-in-bbox test with a small tolerance pad — used by the select tool to
 * pick the annotation under the pointer (panels test from topmost backwards).
 */
export function annotationHits(ann: PdfEditAnnotation, pdfX: number, pdfY: number): boolean {
  const pad = 4
  const b = annotationBBox(ann)
  return (
    pdfX >= b.x - pad &&
    pdfX <= b.x + b.w + pad &&
    pdfY >= b.y - pad &&
    pdfY <= b.y + b.h + pad
  )
}

/** Return a moved copy of the annotation shifted by (dxPdf, dyPdf) in PDF points. */
export function moveAnnotation(ann: PdfEditAnnotation, dxPdf: number, dyPdf: number): PdfEditAnnotation {
  switch (ann.type) {
    case 'highlight':
    case 'underline':
    case 'strike':
    case 'rect':
    case 'ellipse':
    case 'textbox':
    case 'note':
      return { ...ann, rect: { ...ann.rect, x: ann.rect.x + dxPdf, y: ann.rect.y + dyPdf } }
    case 'line':
      return {
        ...ann,
        x1: ann.x1 + dxPdf,
        y1: ann.y1 + dyPdf,
        x2: ann.x2 + dxPdf,
        y2: ann.y2 + dyPdf,
      }
    case 'ink':
      return { ...ann, points: ann.points.map((p) => ({ x: p.x + dxPdf, y: p.y + dyPdf })) }
    case 'stamp':
      return { ...ann, x: ann.x + dxPdf, y: ann.y + dyPdf }
  }
}

/* ------------------------------------------------------------ burn (save) */

/** Classify a raw pdf-lib load failure (same mapping as pdf-tools-advanced). */
function loadPdfErr(err: unknown): ToolError {
  const e = err as { name?: string; message?: string }
  if (e?.name === 'EncryptedPDFError' || /encrypt/i.test(e?.message ?? '')) {
    return new ToolError('pdfErrEncrypted')
  }
  if (/password/i.test(e?.message ?? '')) return new ToolError('pdfErrWrongPassword')
  return new ToolError('pdfErrCorrupt')
}

/**
 * Load a PDF with pdf-lib, mapping failures onto friendly ToolError keys.
 * Always hands pdf-lib a FRESH byte copy (pdf.js may have detached buffers
 * from earlier reads of the same Blob).
 */
async function loadPdfDoc(file: Blob): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
  } catch (err) {
    throw loadPdfErr(err)
  }
}

/**
 * Burn every annotation into the PDF and save.
 * Annotations are grouped by 0-based pageIndex and drawn in array order;
 * annotations pointing at invalid pages are skipped.
 */
export async function burnAnnotations(
  file: Blob,
  annotations: PdfEditAnnotation[]
): Promise<Blob> {
  const doc = await loadPdfDoc(file)
  const pageCount = doc.getPageCount()

  const byPage = new Map<number, PdfEditAnnotation[]>()
  for (const ann of annotations) {
    if (!Number.isInteger(ann.pageIndex) || ann.pageIndex < 0 || ann.pageIndex >= pageCount) continue
    const list = byPage.get(ann.pageIndex)
    if (list) list.push(ann)
    else byPage.set(ann.pageIndex, [ann])
  }
  if (byPage.size === 0) throw new ToolError('pdfErrNoAnnotations')

  const ctx: DrawAnnotationCtx = {
    font: await doc.embedFont(StandardFonts.Helvetica),
    boldFont: await doc.embedFont(StandardFonts.HelveticaBold),
    imageCache: new Map<string, PDFImage>(),
  }

  for (const [pageIndex, list] of byPage) {
    const page = doc.getPage(pageIndex)
    for (const ann of list) {
      await drawAnnotation(page, doc, ann, ctx)
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* ------------------------------------------------------------- redaction */

/** One redaction box in PDF user space (y-up, 0-based page). */
export interface RedactBox {
  x: number
  y: number
  w: number
  h: number
}

export interface RedactOptions {
  /** Fill colour of the burned boxes — defaults to #000000. */
  fillHex?: string
}

/**
 * Permanent redaction: pages WITH boxes are rasterised at 2× and the boxes
 * are painted over before re-encoding as JPEG 0.85 (the text underneath is
 * destroyed — that is the point); pages WITHOUT boxes are copied untouched
 * so they keep full original quality. Page geometry follows the compressPdf
 * pattern: new page = scale-1 viewport dimensions, image drawn edge to edge.
 *
 * ⚠ Unrotated user space: on pages with /Rotate ≠ 0 box placement follows
 *   the rasterised (rotation-aware) canvas, matching the pdf.js preview.
 */
export async function redactPdf(
  file: Blob,
  boxesByPage: Record<number, RedactBox[]>,
  opts: RedactOptions = {},
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const doc = await pdfjsDoc(file) // pdf.js — page rendering
  const lib = await loadPdfDoc(file) // pdf-lib — page surgery (fresh byte copy)

  const total = doc.numPages
  const out = await PDFDocument.create()
  const fill = opts.fillHex ?? '#000000'

  for (let i = 1; i <= total; i++) {
    const raw = boxesByPage[i - 1] ?? []
    const boxes = raw
      .map(normRect)
      .filter((b) => b.w >= 0.5 && b.h >= 0.5 && Number.isFinite(b.x + b.y + b.w + b.h))

    if (boxes.length === 0) {
      // Untouched page → direct copy keeps vectors, text and quality.
      const [copied] = await out.copyPages(lib, [i - 1])
      out.addPage(copied)
      onProgress?.(i, total)
      continue
    }

    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = 2
    const canvas = await renderPdfPage(page, scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ToolError('pdfErrCorrupt', 'redact canvas')
    ctx.fillStyle = fill
    for (const b of boxes) {
      // PDF y-up → canvas y-down, clamped to the canvas.
      const left = Math.max(0, b.x * scale)
      const top = Math.max(0, (base.height - (b.y + b.h)) * scale)
      const w = Math.min(canvas.width - left, b.w * scale)
      const h = Math.min(canvas.height - top, b.h * scale)
      if (w > 0 && h > 0) ctx.fillRect(left, top, w, h)
    }
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.85)
    canvas.width = 0
    canvas.height = 0

    const img = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))
    const newPage = out.addPage([base.width, base.height])
    newPage.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height })
    onProgress?.(i, total)
  }

  await closePdfDoc(doc)
  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}
