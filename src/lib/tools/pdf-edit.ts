/**
 * Pure logic for the core PDF editing tools (Task 2-a) — 100% client-side.
 *
 * Panels served by this lib:
 *  - PdfTextTool        → addTextBlocks()      (text on any page, Latin + Unicode)
 *  - PdfImageStampTool  → addImageStamps()     (crop / resize / rotate / opacity)
 *  - PdfHyperlinkTool   → addLinkAnnotations() (external URL + internal jump links)
 *  - PdfWatermarkTool   → addWatermark()       (text / logo watermark, 4 layouts)
 *                       → coverAreas()         (surface paint-over & deep erase)
 *
 * Shared preview helper:
 *  - renderPageToCanvas() renders one page with pdf.js at a display width and
 *    returns it together with the scale + PDF-point page size, so every panel
 *    can convert clicks/rects into PDF coordinates the same way.
 *
 * ERROR CONTRACT (see pdf-tools-advanced.ts): expected failures are thrown as
 * ToolError carrying an i18n key starting with `pdfErr`; panels display them
 * via errMessage(err, t).
 *
 * Coordinate systems:
 *  - PDF user space is y-UP (origin bottom-left), 1 unit = 1 pt.
 *  - Canvas/browser space is y-DOWN. Conversion used throughout:
 *      pdfX = clickX / previewScale
 *      pdfY = (canvasHeight − clickY) / previewScale
 */

import {
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
} from '@cantoo/pdf-lib'

import {
  ToolError,
  canvasToBlob,
  closePdfDoc,
  parseRanges,
  pdfjsDoc,
  renderPdfPage,
} from '@/lib/tools/pdf-tools-advanced'

/* -------------------------------------------------------------------------- */
/*                              loading + preview                              */
/* -------------------------------------------------------------------------- */

function encryptedErr(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  return e?.name === 'EncryptedPDFError' || /encrypt/i.test(e?.message ?? '')
}

function passwordErr(err: unknown): boolean {
  return /password/i.test((err as Error)?.message ?? '')
}

/**
 * Load a PDF with @cantoo/pdf-lib, copying the bytes first (pdf.js-style
 * detachment safety) and classifying any failure:
 *   encrypted  → pdfErrEncrypted (or pdfErrWrongPassword when a password was
 *                supplied and rejected)
 *   otherwise  → pdfErrCorrupt
 */
export async function loadPdfDoc(file: File | Blob, password?: string): Promise<PDFDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    return await PDFDocument.load(bytes, { password })
  } catch (err) {
    if (encryptedErr(err)) {
      throw new ToolError(password ? 'pdfErrWrongPassword' : 'pdfErrEncrypted')
    }
    if (passwordErr(err)) throw new ToolError('pdfErrWrongPassword')
    throw new ToolError('pdfErrCorrupt')
  }
}

/** One rendered page preview plus everything panels need for coordinate math. */
export interface PagePreview {
  /** Offscreen canvas — the panel copies it into the visible canvas. */
  canvas: HTMLCanvasElement
  /** Preview scale: display px per PDF point. */
  scale: number
  /** Page size in PDF points (unrotated user space). */
  width: number
  height: number
  /** Total pages, so panels can wire prev/next from a single call. */
  pageCount: number
}

/**
 * Render one page of `file` into a fresh offscreen canvas sized to roughly
 * `maxWidth` display pixels. Opens the document, renders, then releases the
 * pdf.js resources — safe to call on every page/file change.
 */
export async function renderPageToCanvas(
  file: File | Blob,
  pageIndex: number,
  maxWidth: number
): Promise<PagePreview> {
  const doc = await pdfjsDoc(file)
  try {
    const pageCount = doc.numPages
    const idx = Math.min(Math.max(0, Math.floor(pageIndex)), pageCount - 1)
    const page = await doc.getPage(idx + 1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(3, Math.max(0.3, maxWidth / base.width))
    const canvas = await renderPdfPage(page, scale)
    return { canvas, scale, width: base.width, height: base.height, pageCount }
  } finally {
    await closePdfDoc(doc)
  }
}

/* -------------------------------------------------------------------------- */
/*                            shared drawing helpers                           */
/* -------------------------------------------------------------------------- */

/** Parse '#rrggbb' (with or without '#'); falls back to black. */
export function hexToRgbColor(hex: string): ReturnType<typeof rgb> {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return rgb(0, 0, 0)
  const n = parseInt(m[1]!, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

/**
 * Decode any image Blob with createImageBitmap and an <img> fallback for old
 * Safari. Exported for the stamp panel's crop preview.
 */
export async function decodeImageBlob(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
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

/**
 * Trim a transparent canvas down to its ink bounding box (with padding).
 * Same pattern as cropSignatureCanvas in pdf-tools-advanced.ts, but generic —
 * used for browser-rasterised Unicode text.
 */
function trimCanvasInk(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null
  const { width, height } = canvas
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

/**
 * pdf-lib rotates around the bottom-left anchor of the unrotated box. Given
 * the intended visual CENTRE of a w×h box rotated by θ° (counter-clockwise),
 * return the anchor (x, y) that keeps the centre fixed:
 *   anchor = centre − R(θ)·(w/2, h/2)
 */
function rotatedAnchor(
  drawW: number,
  drawH: number,
  rotationDeg: number,
  centreX: number,
  centreY: number
): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: centreX - ((drawW / 2) * cos - (drawH / 2) * sin),
    y: centreY - ((drawW / 2) * sin + (drawH / 2) * cos),
  }
}

/** Axis-aligned bounding box of a w×h box rotated by θ°. */
function rotatedBBox(
  drawW: number,
  drawH: number,
  rotationDeg: number
): { w: number; h: number } {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return { w: drawW * cos + drawH * sin, h: drawW * sin + drawH * cos }
}

/* -------------------------------------------------------------------------- */
/*                          1. text editor (addText)                          */
/* -------------------------------------------------------------------------- */

/** Fonts offered by the text tool — the 14 standard PDF fonts subset. */
export type EditTextFont =
  | 'helvetica'
  | 'helveticaBold'
  | 'timesRoman'
  | 'timesRomanBold'
  | 'courier'
  | 'courierOblique'

const TEXT_FONTS: Record<EditTextFont, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  helveticaBold: StandardFonts.HelveticaBold,
  timesRoman: StandardFonts.TimesRoman,
  timesRomanBold: StandardFonts.TimesRomanBold,
  courier: StandardFonts.Courier,
  courierOblique: StandardFonts.CourierOblique,
}

/** CSS font stacks for the browser-side raster of non-Latin text. */
const TEXT_FONT_CSS: Record<EditTextFont, string> = {
  helvetica: "'Helvetica Neue', Arial, sans-serif",
  helveticaBold: "'Helvetica Neue', Arial, sans-serif",
  timesRoman: "'Times New Roman', Times, serif",
  timesRomanBold: "'Times New Roman', Times, serif",
  courier: "'Courier New', Courier, monospace",
  courierOblique: "'Courier New', Courier, monospace",
}

function cssFont(font: EditTextFont, px: number): string {
  const bold = font === 'helveticaBold' || font === 'timesRomanBold' ? 'bold ' : ''
  const italic = font === 'courierOblique' ? 'italic ' : ''
  return `${bold}${italic}${px}px ${TEXT_FONT_CSS[font]}`
}

/** The 14 standard PDF fonts are single-byte Latin-1 — check before drawText. */
function isLatin1(text: string): boolean {
  return [...text].every((ch) => (ch.codePointAt(0) ?? 0) <= 0xff)
}

/** Line spacing used by every text path (matches typical UI text). */
const LINE_HEIGHT = 1.3
/** Raster resolution for the Unicode path: canvas px per font-size pt. */
const TEXT_RASTER_PX = 100

/**
 * Render text on a transparent canvas using the browser's font stack (full
 * Unicode + complex-script shaping, e.g. Bengali conjuncts) and trim it to
 * the ink bbox. Returns null when nothing visible was drawn.
 */
function renderTextInkCanvas(
  text: string,
  font: EditTextFont,
  color: string
): HTMLCanvasElement | null {
  const lines = text.replace(/\r/g, '').split('\n')
  if (lines.every((l) => l.length === 0)) return null
  const px = TEXT_RASTER_PX
  const lineH = px * LINE_HEIGHT

  const measure = document.createElement('canvas')
  const mctx = measure.getContext('2d')
  if (!mctx) return null
  mctx.font = cssFont(font, px)
  const width = Math.ceil(Math.max(...lines.map((l) => mctx.measureText(l).width), 1)) + 20
  const height = Math.ceil(lineH * lines.length + px * 0.4)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Setting canvas.width resets the 2d state — assign the font again.
  ctx.font = cssFont(font, px)
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  lines.forEach((line, i) => ctx.fillText(line, 10, lineH * i + px))
  return trimCanvasInk(canvas)
}

/** One text block placed by clicking the preview. Top-left anchor, PDF pts. */
export interface EditTextBlock {
  /** 0-based page index. */
  pageIndex: number
  /** Block top-left corner in PDF points (y-up). */
  x: number
  y: number
  text: string
  font: EditTextFont
  size: number
  /** Hex colour like '#1f2937'. */
  color: string
}

async function embedFontCached(
  doc: PDFDocument,
  cache: Map<EditTextFont, PDFFont>,
  font: EditTextFont
): Promise<PDFFont> {
  const hit = cache.get(font)
  if (hit) return hit
  const embedded = await doc.embedFont(TEXT_FONTS[font])
  cache.set(font, embedded)
  return embedded
}

/**
 * Burn text blocks into the PDF, grouped per page.
 *
 * Latin-1 text is drawn with the chosen standard font as real, selectable
 * text (multi-line: '\n' splits, line height = size × 1.3).
 *
 * Text containing non-Latin characters (Bengali, CJK, emoji…) cannot be
 * encoded by the standard fonts, so it is rasterised on a transparent canvas
 * with the browser's font stack (correct shaping via HarfBuzz) and stamped
 * as a PNG at the same footprint. Trade-off: those blocks look identical but
 * are images — not selectable/searchable.
 *
 * The block anchor is the TOP-LEFT corner of the text box in both paths, so
 * preview markers and burned output line up.
 */
export async function addTextBlocks(file: File, blocks: EditTextBlock[]): Promise<Blob> {
  const effective = blocks.filter((b) => b.text.trim().length > 0)
  if (effective.length === 0) throw new ToolError('pdfErrNoEdits')

  const doc = await loadPdfDoc(file)
  const fontCache = new Map<EditTextFont, PDFFont>()

  const byPage = new Map<number, EditTextBlock[]>()
  for (const b of effective) {
    const list = byPage.get(b.pageIndex) ?? []
    list.push(b)
    byPage.set(b.pageIndex, list)
  }

  for (const [rawIndex, pageBlocks] of byPage) {
    const idx = clamp(Math.floor(rawIndex), 0, doc.getPageCount() - 1)
    const page = doc.getPage(idx)
    const { width: pageW, height: pageH } = page.getSize()

    for (const block of pageBlocks) {
      const lines = block.text.replace(/\r/g, '').split('\n')
      const blockH = block.size * LINE_HEIGHT * lines.length
      const x = clamp(block.x, 0, Math.max(0, pageW - 4))
      const yTop = clamp(block.y, blockH, pageH)

      if (isLatin1(block.text)) {
        const font = await embedFontCached(doc, fontCache, block.font)
        const widest = Math.max(
          ...lines.map((l) => (l ? font.widthOfTextAtSize(l, block.size) : 0)),
          1
        )
        const drawX = clamp(x, 0, Math.max(0, pageW - widest))
        lines.forEach((line, i) => {
          if (!line) return
          // Baseline of line i sits ~85% of the size below the block top.
          page.drawText(line, {
            x: drawX,
            y: Math.max(0, yTop - block.size * 0.85 - i * block.size * LINE_HEIGHT),
            size: block.size,
            font,
            color: hexToRgbColor(block.color),
          })
        })
      } else {
        // Unicode path — see the trade-off note in the function comment.
        const ink = renderTextInkCanvas(block.text, block.font, block.color)
        if (!ink) continue
        const pngBlob = await canvasToBlob(ink, 'image/png')
        const png = await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()))
        // Scale so the block footprint matches the Latin line-height math
        // (≈ size × 1.3 × lines, i.e. visually ≈ size × lines of glyphs).
        const drawH = blockH
        const drawW = (ink.width * drawH) / ink.height
        const drawX = clamp(x, 0, Math.max(0, pageW - drawW))
        const drawY = clamp(block.y, drawH, pageH) - drawH
        page.drawImage(png, { x: drawX, y: drawY, width: drawW, height: drawH })
      }
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                        2. image handler (addImage)                         */
/* -------------------------------------------------------------------------- */

/** Crop insets in percent of the source image (each 0–45). */
export interface ImageCropPct {
  left: number
  right: number
  top: number
  bottom: number
}

export function isIdentityCrop(crop?: ImageCropPct): boolean {
  return !crop || (crop.left === 0 && crop.right === 0 && crop.top === 0 && crop.bottom === 0)
}

/** One image placement; the click point is the stamp's visual centre. */
export interface ImageStamp {
  pageIndex: number
  /** Centre of the stamp, normalised 0..1 (y measured from the top). */
  xNorm: number
  yNorm: number
  /** Stamp width as % of the page width (5–100). */
  widthPct: number
  rotation: 0 | 90 | 180 | 270
  /** 0.1–1. */
  opacity: number
  /** Crop snapshot taken when the placement was made. */
  crop?: ImageCropPct
}

function cropKey(crop?: ImageCropPct): string {
  return crop ? `${crop.left}-${crop.right}-${crop.top}-${crop.bottom}` : 'none'
}

/**
 * Produce embeddable bytes for the source image with an optional crop.
 * JPEG sources without cropping pass through untouched (best quality/size);
 * everything else goes through a canvas — PNG when the source may have
 * transparency (PNG/WebP/GIF), JPEG for cropped photos.
 */
async function prepareStampImage(
  bmp: ImageBitmap | HTMLImageElement,
  source: File | Blob,
  crop?: ImageCropPct
): Promise<{ bytes: Uint8Array; type: 'jpg' | 'png'; width: number; height: number }> {
  const mime = (source.type || '').toLowerCase()
  const isJpeg = mime === 'image/jpeg' || (!mime && /\.jpe?g$/i.test(source instanceof File ? source.name : ''))

  if (isJpeg && isIdentityCrop(crop)) {
    const bytes = new Uint8Array(await source.arrayBuffer())
    return { bytes, type: 'jpg', width: bmp.width, height: bmp.height }
  }

  const sx = (bmp.width * (crop?.left ?? 0)) / 100
  const sy = (bmp.height * (crop?.top ?? 0)) / 100
  const sw = Math.max(1, (bmp.width * (100 - (crop?.left ?? 0) - (crop?.right ?? 0))) / 100)
  const sh = Math.max(1, (bmp.height * (100 - (crop?.top ?? 0) - (crop?.bottom ?? 0))) / 100)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw)
  canvas.height = Math.round(sh)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ToolError('pdfErrNoImage')
  ctx.drawImage(bmp as CanvasImageSource, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const type = isJpeg ? 'jpg' : 'png'
  const blob = await canvasToBlob(canvas, type === 'jpg' ? 'image/jpeg' : 'image/png', 0.92)
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type, width: canvas.width, height: canvas.height }
}

/**
 * Burn image placements into the PDF. Placements may reuse the same image
 * with different crops — embedded variants are cached per crop signature.
 *
 * pdf-lib rotates images around their bottom-left anchor, so the anchor is
 * recomputed for every placement to keep the visual centre on the clicked
 * point, and the rotated bounding box is clamped to stay inside the page.
 */
export async function addImageStamps(
  file: File,
  imageFile: File | Blob,
  stamps: ImageStamp[]
): Promise<Blob> {
  if (stamps.length === 0) throw new ToolError('pdfErrNoEdits')

  const bmp = await decodeImageBlob(imageFile).catch(() => {
    throw new ToolError('pdfErrNoImage')
  })

  const doc = await loadPdfDoc(file)
  const embeddedCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>()
  const prepareCache = new Map<string, { bytes: Uint8Array; type: 'jpg' | 'png'; width: number; height: number }>()

  const getEmbedded = async (crop?: ImageCropPct) => {
    const key = cropKey(crop)
    const hit = embeddedCache.get(key)
    if (hit) return hit
    let prepared = prepareCache.get(key)
    if (!prepared) {
      prepared = await prepareStampImage(bmp, imageFile, crop)
      prepareCache.set(key, prepared)
    }
    const img =
      prepared.type === 'jpg' ? await doc.embedJpg(prepared.bytes) : await doc.embedPng(prepared.bytes)
    embeddedCache.set(key, img)
    return img
  }

  const byPage = new Map<number, ImageStamp[]>()
  for (const s of stamps) {
    const list = byPage.get(s.pageIndex) ?? []
    list.push(s)
    byPage.set(s.pageIndex, list)
  }

  for (const [rawIndex, list] of byPage) {
    const idx = clamp(Math.floor(rawIndex), 0, doc.getPageCount() - 1)
    const page = doc.getPage(idx)
    const { width: pageW, height: pageH } = page.getSize()

    for (const stamp of list) {
      const img = await getEmbedded(stamp.crop)
      const drawW = (pageW * clamp(stamp.widthPct, 5, 100)) / 100
      const drawH = drawW * (img.height / img.width)
      const bbox = rotatedBBox(drawW, drawH, stamp.rotation)
      // Keep the rotated stamp fully inside the page (spec: clamp inside).
      const centreX = clamp(pageW * stamp.xNorm, bbox.w / 2, Math.max(bbox.w / 2, pageW - bbox.w / 2))
      const centreY = clamp(pageH * (1 - stamp.yNorm), bbox.h / 2, Math.max(bbox.h / 2, pageH - bbox.h / 2))
      const anchor = rotatedAnchor(drawW, drawH, stamp.rotation, centreX, centreY)
      page.drawImage(img, {
        x: anchor.x,
        y: anchor.y,
        width: drawW,
        height: drawH,
        rotate: degrees(stamp.rotation),
        opacity: clamp(stamp.opacity, 0.1, 1),
      })
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                       3. hyperlink annotations (links)                      */
/* -------------------------------------------------------------------------- */

export interface PdfLink {
  pageIndex: number
  /** Hotspot in PDF points, y-up, normalised so x1 ≤ x2 and y1 ≤ y2. */
  rect: { x1: number; y1: number; x2: number; y2: number }
  mode: 'external' | 'internal'
  /** mode 'external': absolute URL. */
  url?: string
  /** mode 'internal': 0-based target page index. */
  targetPage?: number
  /** Draw a thin blue border around the hotspot instead of staying invisible. */
  visible?: boolean
}

function normaliseUrl(raw: string | undefined): string {
  const url = (raw ?? '').trim()
  if (!url) throw new ToolError('pdfErrBadUrl')
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url
  return `https://${url}`
}

/**
 * Add /Link annotations using the pdf-lib low-level context.
 *
 * API notes verified against node_modules/@cantoo/pdf-lib:
 *  - `doc.context.obj(literal)` builds PDFDict/PDFArray from plain literals;
 *    plain strings inside become PDFName (so 'URI'/'S'/'Fit' need no wrapper)
 *    while the URL must be wrapped with PDFString.of() to stay a string.
 *  - `doc.context.register(obj)` returns the indirect PDFRef.
 *  - The page's /Annots array may not exist: PDFPageLeaf.Annots() is the typed
 *    lookup (undefined when missing); missing arrays are created, registered
 *    on the page node and filled. (The fork also offers page.node.addAnnot(ref)
 *    as a one-line equivalent that normalises the entry.)
 *  - Rect must be [x1, y1, x2, y2] with y1 < y2 in PDF's y-up space.
 */
export async function addLinkAnnotations(file: File, links: PdfLink[]): Promise<Blob> {
  if (links.length === 0) throw new ToolError('pdfErrNoEdits')

  const doc = await loadPdfDoc(file)
  const pageCount = doc.getPageCount()

  for (const link of links) {
    const pageIndex = clamp(Math.floor(link.pageIndex), 0, pageCount - 1)
    const page = doc.getPage(pageIndex)

    const x1 = Math.min(link.rect.x1, link.rect.x2)
    const x2 = Math.max(link.rect.x1, link.rect.x2)
    const y1 = Math.min(link.rect.y1, link.rect.y2)
    const y2 = Math.max(link.rect.y1, link.rect.y2)

    let dest: { A: { S: string; URI: PDFString } } | { Dest: [PDFRef, PDFName] }
    if (link.mode === 'external') {
      dest = { A: { S: 'URI', URI: PDFString.of(normaliseUrl(link.url)) } }
    } else {
      const target = Math.floor(link.targetPage ?? -1)
      if (target < 0 || target >= pageCount) throw new ToolError('pdfErrBadLinkTarget')
      // 'Fit' destination: whole target page in the window.
      dest = { Dest: [doc.getPage(target).ref, PDFName.of('Fit')] }
    }

    const annot: PDFDict = doc.context.obj({
      Subtype: 'Link',
      Rect: [x1, y1, x2, y2],
      Border: link.visible ? [0, 0, 1] : [0, 0, 0],
      ...(link.visible ? { C: [0, 0, 1] } : {}), // blue stroke for visible links
      ...dest,
    })
    const annotRef = doc.context.register(annot)

    const existing = page.node.lookup(PDFName.of('Annots'))
    if (existing instanceof PDFArray) {
      existing.push(annotRef)
    } else {
      // No (valid) /Annots yet — create one, register it on the page, fill it.
      const fresh = doc.context.obj([])
      page.node.set(PDFName.of('Annots'), doc.context.register(fresh))
      fresh.push(annotRef)
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* -------------------------------------------------------------------------- */
/*                          4. watermark (add + remove)                        */
/* -------------------------------------------------------------------------- */

export type WatermarkLayout = 'center' | 'tile' | 'top' | 'bottom'

export interface WatermarkOptions {
  source: 'text' | 'image'
  /** source 'text': single line (whitespace collapsed). */
  text?: string
  /** 24–120, 0 = auto-fit per page. */
  fontSize?: number
  /** Hex colour like '#808080'. */
  color?: string
  /** Degrees, −90..90 (negative = classic diagonal down-right). */
  rotation?: number
  /** 0.05–1. */
  opacity?: number
  layout?: WatermarkLayout
  /** source 'image': logo file (any image type). */
  imageFile?: File | Blob
  /** Logo width as % of page width (5–100). */
  imageWidthPct?: number
  /** Page ranges like "1-3, 5" — empty = every page. */
  pages?: string
}

/** Expand a ranges string into sorted 0-based page indices. */
function resolvePageIndices(pages: string | undefined, pageCount: number): number[] {
  const raw = (pages ?? '').trim()
  if (!raw) return Array.from({ length: pageCount }, (_, i) => i)
  const indices: number[] = []
  for (const [a, b] of parseRanges(raw, pageCount)) {
    for (let i = a; i <= b; i++) indices.push(i)
  }
  return indices
}

/** Grid centres for the 'tile' layout: thirds of the page in both axes. */
const TILE_STOPS = [1 / 6, 3 / 6, 5 / 6]

/**
 * Add a text or image watermark.
 *
 * Text: Latin-1 content is drawn as real text with Helvetica Bold; non-Latin
 * content (e.g. Bengali watermarks) is rasterised once via the browser font
 * stack and stamped like an image (same trade-off as addTextBlocks).
 *
 * Layouts: centre (one, centred) · tile (3×3 grid at thirds) · top · bottom.
 * Rotation pivots on the visual centre of each stamp.
 */
export async function addWatermark(file: File, opts: WatermarkOptions): Promise<Blob> {
  const doc = await loadPdfDoc(file)
  const pageCount = doc.getPageCount()
  const indices = resolvePageIndices(opts.pages, pageCount)
  if (indices.length === 0) throw new ToolError('pdfErrBadRanges')

  const opacity = clamp(opts.opacity ?? 0.25, 0.05, 1)
  const rotation = clamp(opts.rotation ?? -45, -90, 90)

  /* -------- prepare the stamp source: text → metrics, image → embed -------- */

  let drawTextStamp: ((page: ReturnType<typeof doc.getPage>) => void) | null = null
  let drawImageStamp: ((page: ReturnType<typeof doc.getPage>) => void) | null = null

  if (opts.source === 'text') {
    const text = (opts.text ?? '').replace(/\s+/g, ' ').trim()
    if (!text) throw new ToolError('pdfErrNoWatermarkText')
    const color = hexToRgbColor(opts.color ?? '#808080')

    if (isLatin1(text)) {
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      drawTextStamp = (page) => {
        const { width: pageW, height: pageH } = page.getSize()
        const fixed = opts.fontSize ?? 0
        // Auto-fit: shrink/grow so the text spans ~80% of the page width.
        const size =
          fixed > 0
            ? fixed
            : Math.min(pageH * 0.25, (pageW * 0.8) / Math.max(1, font.widthOfTextAtSize(text, 100) / 100))
        const w = font.widthOfTextAtSize(text, size)
        const h = size
        for (const [cx, cy] of stampCentres(w, h, pageW, pageH, opts.layout ?? 'center')) {
          // drawText anchors on the baseline start; treat the box as w × size
          // and re-anchor so the visual centre lands on (cx, cy).
          const anchor = rotatedAnchor(w, h, rotation, cx, cy)
          page.drawText(text, {
            x: anchor.x,
            y: anchor.y,
            size,
            font,
            color,
            opacity,
            rotate: degrees(rotation),
          })
        }
      }
    } else {
      // Unicode watermark (Bengali…) → transparent PNG via the browser fonts.
      const ink = renderTextInkCanvas(text, 'helveticaBold', opts.color ?? '#808080')
      if (!ink) throw new ToolError('pdfErrNoWatermarkText')
      const pngBlob = await canvasToBlob(ink, 'image/png')
      const png = await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()))
      const aspect = png.height / png.width
      drawImageStamp = (page) => {
        const { width: pageW, height: pageH } = page.getSize()
        const fixed = opts.fontSize ?? 0
        // Ink was rasterised at 100 px per size pt: scale maps size ↔ px.
        const scale =
          fixed > 0
            ? fixed / TEXT_RASTER_PX
            : Math.min((pageW * 0.8) / ink.width, (pageH * 0.35) / ink.height)
        const drawW = ink.width * scale
        const drawH = drawW * aspect
        stampCentres(drawW, drawH, pageW, pageH, opts.layout ?? 'center').forEach(([cx, cy]) => {
          const anchor = rotatedAnchor(drawW, drawH, rotation, cx, cy)
          page.drawImage(png, {
            x: anchor.x,
            y: anchor.y,
            width: drawW,
            height: drawH,
            opacity,
            rotate: degrees(rotation),
          })
        })
      }
    }
  } else {
    if (!opts.imageFile) throw new ToolError('pdfErrNoImage')
    const bmp = await decodeImageBlob(opts.imageFile).catch(() => {
      throw new ToolError('pdfErrNoImage')
    })
    const prepared = await prepareStampImage(bmp, opts.imageFile, undefined)
    const img =
      prepared.type === 'jpg' ? await doc.embedJpg(prepared.bytes) : await doc.embedPng(prepared.bytes)
    const aspect = img.height / img.width
    drawImageStamp = (page) => {
      const { width: pageW, height: pageH } = page.getSize()
      const drawW = (pageW * clamp(opts.imageWidthPct ?? 40, 5, 100)) / 100
      const drawH = drawW * aspect
      stampCentres(drawW, drawH, pageW, pageH, opts.layout ?? 'center').forEach(([cx, cy]) => {
        const anchor = rotatedAnchor(drawW, drawH, rotation, cx, cy)
        page.drawImage(img, {
          x: anchor.x,
          y: anchor.y,
          width: drawW,
          height: drawH,
          opacity,
          rotate: degrees(rotation),
        })
      })
    }
  }

  for (const idx of indices) {
    const page = doc.getPage(clamp(idx, 0, pageCount - 1))
    drawTextStamp?.(page)
    drawImageStamp?.(page)
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Centre points of a w×h stamp for the requested layout. */
function stampCentres(
  drawW: number,
  drawH: number,
  pageW: number,
  pageH: number,
  layout: WatermarkLayout
): Array<[number, number]> {
  if (layout === 'tile') {
    return TILE_STOPS.flatMap((gx) =>
      TILE_STOPS.map((gy) => [pageW * gx, pageH * gy] as [number, number])
    )
  }
  if (layout === 'top') return [[pageW / 2, pageH - drawH / 2 - pageH * 0.06]]
  if (layout === 'bottom') return [[pageW / 2, drawH / 2 + pageH * 0.06]]
  return [[pageW / 2, pageH / 2]]
}

/* -------------------------------------------------------------------------- */
/*                        5. cover areas (remove marks)                        */
/* -------------------------------------------------------------------------- */

/** One cover box in normalised page coordinates (origin top-left). */
export interface CoverBox {
  pageIndex: number
  xNorm: number
  yNorm: number
  wNorm: number
  hNorm: number
}

/**
 * Hide unwanted marks by painting boxes over them.
 *
 * depth 'surface' (default): opaque filled rectangles are drawn on top of the
 * page content — fast, and the underlying text stays selectable (but still
 * readable by copy/paste!).
 *
 * depth 'deep': affected pages are rasterised at 2× with the boxes painted
 * into the bitmap and rebuilt as image pages (same geometry approach as
 * compressPdf); untouched pages are copied as-is. Content under the boxes is
 * permanently destroyed.
 */
export async function coverAreas(
  file: File,
  boxes: CoverBox[],
  opts: { color?: string; deep?: boolean } = {}
): Promise<Blob> {
  if (boxes.length === 0) throw new ToolError('pdfErrNoEdits')
  const colorHex = opts.color ?? '#ffffff'

  const byPage = new Map<number, CoverBox[]>()
  for (const b of boxes) {
    const list = byPage.get(b.pageIndex) ?? []
    list.push(b)
    byPage.set(b.pageIndex, list)
  }

  if (!opts.deep) {
    const doc = await loadPdfDoc(file)
    const pageCount = doc.getPageCount()
    for (const [rawIndex, list] of byPage) {
      const page = doc.getPage(clamp(Math.floor(rawIndex), 0, pageCount - 1))
      const { width: W, height: H } = page.getSize()
      for (const b of list) {
        page.drawRectangle({
          x: b.xNorm * W,
          y: (1 - b.yNorm - b.hNorm) * H,
          width: b.wNorm * W,
          height: b.hNorm * H,
          color: hexToRgbColor(colorHex),
        })
      }
    }
    const bytes = await doc.save()
    return new Blob([bytes], { type: 'application/pdf' })
  }

  // Deep erase: rasterise affected pages with the boxes painted on.
  const DEEP_SCALE = 2
  const pdfDoc = await pdfjsDoc(file)
  try {
    const src = await loadPdfDoc(file)
    const out = await PDFDocument.create()
    const total = pdfDoc.numPages
    // Copy every page up-front, then replace the affected ones with bitmaps.
    const copied = await out.copyPages(src, src.getPageIndices())

    for (let i = 0; i < total; i++) {
      const list = byPage.get(i)
      if (!list || list.length === 0) {
        out.addPage(copied[i]!)
        continue
      }
      const page = await pdfDoc.getPage(i + 1)
      const base = page.getViewport({ scale: 1 })
      const canvas = await renderPdfPage(page, DEEP_SCALE)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = colorHex
      for (const b of list) {
        ctx.fillRect(
          b.xNorm * canvas.width,
          (1 - b.yNorm - b.hNorm) * canvas.height,
          Math.max(1, b.wNorm * canvas.width),
          Math.max(1, b.hNorm * canvas.height)
        )
      }
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.92)
      const img = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))
      const newPage = out.addPage([base.width, base.height])
      newPage.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height })
    }

    const bytes = await out.save()
    return new Blob([bytes], { type: 'application/pdf' })
  } finally {
    await closePdfDoc(pdfDoc)
  }
}
