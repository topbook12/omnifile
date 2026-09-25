'use client'

/**
 * Annotate PDF — full markup editor (Task 2-d).
 *
 * Architecture (mobile-first, 100% on-device):
 *   1. Single-PDF dropzone → pdf.js document cached in a ref (closed on file
 *      change / unmount), current page rendered with `renderPdfPage` at a
 *      scale that fits the container (cap 2×, devicePixelRatio sharpened).
 *   2. A transparent SVG overlay (viewBox = page points, y-axis flipped:
 *      y_svg = pageH − y_pdf) shows COMMITTED annotations, the live drag
 *      draft and the selection ring. Pointer events on the overlay are
 *      converted to PDF user space via getBoundingClientRect + y flip.
 *   3. Tools: select/move, highlight, underline, strike, rect, ellipse,
 *      line, arrow, pencil, text box, sticky note, stamp — with contextual
 *      controls (6 colour swatches + custom picker, stroke width, font size,
 *      shape fill toggle, stamp presets + custom text).
 *   4. Save → `burnAnnotations` burns every mark into the PDF (vector where
 *      possible; non-Latin text is rasterised with browser fonts incl.
 *      Bengali — see pdf-annotate-edit.ts for the trade-off).
 *
 * Annotations live in ONE flat array for all pages; page navigation keeps
 * them. No drag-and-drop dependencies — pure pointer events.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  Highlighter,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Square,
  Stamp as StampIcon,
  StickyNote,
  Strikethrough,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  OnDeviceBadge,
  ToolDropzone,
  ToolOptionsCard,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { useI18n } from '@/lib/i18n'
import {
  ANNOTATE_SWATCHES,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_NOTE_TEXT_COLOR,
  DEFAULT_STAMP_ROTATION,
  HIGHLIGHT_OPACITY,
  annotationBBox,
  annotationHits,
  burnAnnotations,
  moveAnnotation,
  resultName,
  type EditPoint,
  type EditRect,
  type PdfEditAnnotation,
} from '@/lib/tools/pdf-annotate-edit'
import { closePdfDoc, errMessage, pdfjsDoc, renderPdfPage } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

/* ------------------------------------------------------------------ config */

type AnnotateToolId =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'pencil'
  | 'textbox'
  | 'note'
  | 'stamp'

const PALETTE: Array<{ id: AnnotateToolId; icon: LucideIcon; labelKey: string }> = [
  { id: 'select', icon: MousePointer2, labelKey: 'pdfAnnToolSelect' },
  { id: 'highlight', icon: Highlighter, labelKey: 'pdfAnnToolHighlight' },
  { id: 'underline', icon: UnderlineIcon, labelKey: 'pdfAnnToolUnderline' },
  { id: 'strike', icon: Strikethrough, labelKey: 'pdfAnnToolStrike' },
  { id: 'rect', icon: Square, labelKey: 'pdfAnnToolRect' },
  { id: 'ellipse', icon: Circle, labelKey: 'pdfAnnToolEllipse' },
  { id: 'line', icon: Minus, labelKey: 'pdfAnnToolLine' },
  { id: 'arrow', icon: MoveUpRight, labelKey: 'pdfAnnToolArrow' },
  { id: 'pencil', icon: Pencil, labelKey: 'pdfAnnToolPencil' },
  { id: 'textbox', icon: Type, labelKey: 'pdfAnnToolTextbox' },
  { id: 'note', icon: StickyNote, labelKey: 'pdfAnnToolNote' },
  { id: 'stamp', icon: StampIcon, labelKey: 'pdfAnnToolStamp' },
]

const STROKE_WIDTHS = [2, 4, 6]
const FONT_SIZES = [10, 14, 18, 24]
const STAMP_PRESETS = ['APPROVED', 'DRAFT', 'REJECTED', 'CONFIDENTIAL']
const MAX_INK_POINTS = 2000

const STROKE_TOOLS: AnnotateToolId[] = ['underline', 'strike', 'rect', 'ellipse', 'line', 'arrow', 'pencil']
const TEXT_TOOLS: AnnotateToolId[] = ['textbox', 'note', 'stamp']
const SHAPE_TOOLS: AnnotateToolId[] = ['rect', 'ellipse']

/** In-progress drag (never 'select'/'stamp' — those resolve on pointerdown). */
interface DraftShape {
  tool: Exclude<AnnotateToolId, 'select' | 'stamp'>
  start: EditPoint
  cur: EditPoint
  points: EditPoint[]
}

/** Pending text editor for textbox / note (dragged rect + typed text). */
interface TextDraft {
  kind: 'textbox' | 'note'
  rect: EditRect
  text: string
}

/* ---------------------------------------------------------------- svg math */

function normRectLocal(r: EditRect): EditRect {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  }
}

/** Cheap char-based wrap for the SVG preview (the burn uses real font metrics). */
function previewWrap(text: string, boxW: number, fontSize: number): string[] {
  const maxChars = Math.max(1, Math.floor(boxW / (fontSize * 0.55)))
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const cand = line ? `${line} ${word}` : word
      if (cand.length <= maxChars) {
        line = cand
        continue
      }
      if (line) out.push(line)
      if (word.length <= maxChars) {
        line = word
      } else {
        for (let i = 0; i < word.length; i += maxChars) out.push(word.slice(i, i + maxChars))
        line = ''
      }
    }
    if (line) out.push(line)
  }
  return out
}

/** Grow a note rect so short drags still fit the typed text. */
function autoNoteRect(r: EditRect, text: string, fontSize: number): EditRect {
  const maxChars = Math.max(4, Math.floor((r.w - 16) / (fontSize * 0.55)))
  let lines = 0
  let longest = 0
  for (const para of text.split('\n')) {
    longest = Math.max(longest, para.length)
    lines += Math.max(1, Math.ceil(para.length / maxChars))
  }
  return {
    x: r.x,
    y: r.y,
    w: Math.max(r.w, Math.min(longest * fontSize * 0.62 + 16, 340)),
    h: Math.max(r.h, lines * fontSize * 1.35 + 16),
  }
}

const SVG_FONT = 'Helvetica, Arial, sans-serif'

function arrowHeads(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
  stroke: string,
  flipY: (y: number) => number
) {
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(8, strokeWidth * 4)
  return [Math.PI - 0.45, Math.PI + 0.45].map((spread) => {
    const a = ang + spread
    return (
      <line
        key={spread}
        x1={x2}
        y1={flipY(y2)}
        x2={x2 + head * Math.cos(a)}
        y2={flipY(y2 + head * Math.sin(a))}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    )
  })
}

/** One committed annotation rendered in page-point SVG space (y flipped). */
function AnnotationSvg({ ann, pageH }: { ann: PdfEditAnnotation; pageH: number }) {
  const F = (y: number) => pageH - y
  switch (ann.type) {
    case 'highlight': {
      const r = normRectLocal(ann.rect)
      return (
        <rect
          x={r.x}
          y={F(r.y + r.h)}
          width={r.w}
          height={r.h}
          fill={ann.color ?? DEFAULT_HIGHLIGHT_COLOR}
          fillOpacity={ann.opacity ?? HIGHLIGHT_OPACITY}
        />
      )
    }
    case 'underline':
    case 'strike': {
      const r = normRectLocal(ann.rect)
      const th = Math.max(1, ann.thickness ?? 2)
      const y = ann.type === 'underline' ? F(r.y + th / 2) : F(r.y + r.h / 2)
      return (
        <line x1={r.x} y1={y} x2={r.x + r.w} y2={y} stroke={ann.color} strokeWidth={th} strokeLinecap="round" />
      )
    }
    case 'rect': {
      const r = normRectLocal(ann.rect)
      const hasFill = !!ann.fillColor && ann.fillColor !== 'none'
      return (
        <rect
          x={r.x}
          y={F(r.y + r.h)}
          width={r.w}
          height={r.h}
          stroke={ann.strokeColor}
          strokeWidth={ann.strokeWidth}
          fill={hasFill ? (ann.fillColor ?? undefined) : 'none'}
          fillOpacity={hasFill ? (ann.fillOpacity ?? 1) : undefined}
        />
      )
    }
    case 'ellipse': {
      const r = normRectLocal(ann.rect)
      const hasFill = !!ann.fillColor && ann.fillColor !== 'none'
      return (
        <ellipse
          cx={r.x + r.w / 2}
          cy={F(r.y + r.h / 2)}
          rx={Math.max(0.5, r.w / 2)}
          ry={Math.max(0.5, r.h / 2)}
          stroke={ann.strokeColor}
          strokeWidth={ann.strokeWidth}
          fill={hasFill ? (ann.fillColor ?? undefined) : 'none'}
          fillOpacity={hasFill ? (ann.fillOpacity ?? 1) : undefined}
        />
      )
    }
    case 'line':
      return (
        <>
          <line
            x1={ann.x1}
            y1={F(ann.y1)}
            x2={ann.x2}
            y2={F(ann.y2)}
            stroke={ann.strokeColor}
            strokeWidth={ann.strokeWidth}
            strokeLinecap="round"
          />
          {ann.arrow && arrowHeads(ann.x1, ann.y1, ann.x2, ann.y2, ann.strokeWidth, ann.strokeColor, F)}
        </>
      )
    case 'ink': {
      if (ann.points.length === 1) {
        const p = ann.points[0]!
        return <circle cx={p.x} cy={F(p.y)} r={Math.max(0.75, ann.strokeWidth / 2)} fill={ann.color} />
      }
      return (
        <polyline
          points={ann.points.map((p) => `${p.x},${F(p.y)}`).join(' ')}
          fill="none"
          stroke={ann.color}
          strokeWidth={ann.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    }
    case 'textbox': {
      const r = normRectLocal(ann.rect)
      const hasFill = ann.fillColor !== 'none'
      const lines = previewWrap(ann.text, Math.max(8, r.w - 8), ann.fontSize)
      const lineH = ann.fontSize * 1.3
      const firstBaseline = pageH - (r.y + r.h - 4 - ann.fontSize * 0.9)
      return (
        <g>
          <rect
            x={r.x}
            y={F(r.y + r.h)}
            width={r.w}
            height={r.h}
            fill={hasFill ? ann.fillColor : 'none'}
            stroke={ann.borderColor}
            strokeWidth={1}
          />
          {lines.map((l, i) => (
            <text
              key={i}
              x={r.x + 4}
              y={firstBaseline + i * lineH}
              fontSize={ann.fontSize}
              fill={ann.color}
              fontFamily={SVG_FONT}
            >
              {l}
            </text>
          ))}
        </g>
      )
    }
    case 'note': {
      const r = normRectLocal(ann.rect)
      const lines = previewWrap(ann.text, Math.max(8, r.w - 16), ann.fontSize)
      const lineH = ann.fontSize * 1.3
      const firstBaseline = pageH - (r.y + r.h - 8 - ann.fontSize * 0.9)
      const fold = Math.min(14, r.w / 3, r.h / 3)
      return (
        <g>
          <rect
            x={r.x}
            y={F(r.y + r.h)}
            width={r.w}
            height={r.h}
            fill="#fef9c4"
            stroke="#d9a514"
            strokeWidth={1}
          />
          {fold > 2 && (
            <line
              x1={r.x + r.w - fold}
              y1={F(r.y + r.h)}
              x2={r.x + r.w}
              y2={F(r.y + r.h - fold)}
              stroke="#d9a514"
              strokeWidth={1}
            />
          )}
          {lines.map((l, i) => (
            <text
              key={i}
              x={r.x + 8}
              y={firstBaseline + i * lineH}
              fontSize={ann.fontSize}
              fill={DEFAULT_NOTE_TEXT_COLOR}
              fontFamily={SVG_FONT}
            >
              {l}
            </text>
          ))}
        </g>
      )
    }
    case 'stamp': {
      const rot = ann.rotation ?? DEFAULT_STAMP_ROTATION
      const w = (ann.text?.length ?? 0) * ann.fontSize * 0.62 + 16
      const h = ann.fontSize * 1.6
      return (
        <g transform={`rotate(${-rot} ${ann.x} ${F(ann.y)})`}>
          <rect
            x={ann.x - w / 2}
            y={F(ann.y) - h / 2}
            width={w}
            height={h}
            rx={3}
            fill="none"
            stroke={ann.color}
            strokeWidth={2}
          />
          <text
            x={ann.x}
            y={F(ann.y)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={ann.fontSize}
            fontWeight="bold"
            fill={ann.color}
            fontFamily={SVG_FONT}
          >
            {ann.text}
          </text>
        </g>
      )
    }
  }
}

/** Live drag preview. */
function DraftSvg({
  draft,
  pageH,
  color,
  strokeWidth,
  fillShape,
}: {
  draft: DraftShape
  pageH: number
  color: string
  strokeWidth: number
  fillShape: boolean
}) {
  const F = (y: number) => pageH - y
  const s = draft.start
  const c = draft.cur
  const w = c.x - s.x
  const h = c.y - s.y
  switch (draft.tool) {
    case 'pencil':
      return (
        <polyline
          points={draft.points.map((p) => `${p.x},${F(p.y)}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'line':
    case 'arrow':
      return (
        <>
          <line x1={s.x} y1={F(s.y)} x2={c.x} y2={F(c.y)} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          {draft.tool === 'arrow' && arrowHeads(s.x, s.y, c.x, c.y, strokeWidth, color, F)}
        </>
      )
    case 'textbox':
    case 'note':
      return (
        <rect
          x={Math.min(s.x, c.x)}
          y={F(Math.max(s.y, c.y))}
          width={Math.abs(w)}
          height={Math.abs(h)}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      )
    case 'highlight':
      return (
        <rect
          x={Math.min(s.x, c.x)}
          y={F(Math.max(s.y, c.y))}
          width={Math.abs(w)}
          height={Math.abs(h)}
          fill={color}
          fillOpacity={HIGHLIGHT_OPACITY}
        />
      )
    case 'rect':
    case 'ellipse': {
      const hasFill = fillShape
      const shapeProps = {
        stroke: color,
        strokeWidth,
        fill: hasFill ? color : 'none',
        fillOpacity: hasFill ? 0.25 : undefined,
      }
      if (draft.tool === 'rect') {
        return (
          <rect x={Math.min(s.x, c.x)} y={F(Math.max(s.y, c.y))} width={Math.abs(w)} height={Math.abs(h)} {...shapeProps} />
        )
      }
      return (
        <ellipse
          cx={(s.x + c.x) / 2}
          cy={F((s.y + c.y) / 2)}
          rx={Math.abs(w / 2)}
          ry={Math.abs(h / 2)}
          {...shapeProps}
        />
      )
    }
    default:
      // underline / strike → dashed band outline while dragging
      return (
        <rect
          x={Math.min(s.x, c.x)}
          y={F(Math.max(s.y, c.y))}
          width={Math.abs(w)}
          height={Math.abs(h)}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )
  }
}

/** Dashed ring around the selected annotation (in page-point space). */
function SelectionRing({ ann, pageH }: { ann: PdfEditAnnotation; pageH: number }) {
  const b = annotationBBox(ann)
  return (
    <g className="text-primary">
      <rect
        x={b.x - 5}
        y={pageH - (b.y + b.h) - 5}
        width={b.w + 10}
        height={b.h + 10}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

/* ------------------------------------------------------------------ panel */

export default function PdfAnnotateTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [pageCount, setPageCount] = useState(1)
  const [pageIndex, setPageIndex] = useState(0)
  const [previewBusy, setPreviewBusy] = useState(false)

  // Tool state
  const [tool, setTool] = useState<AnnotateToolId>('highlight')
  const [color, setColor] = useState<string>(DEFAULT_HIGHLIGHT_COLOR)
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [fontSize, setFontSize] = useState(14)
  const [fillShape, setFillShape] = useState(false)
  const [stampText, setStampText] = useState('APPROVED')

  // Annotations (all pages) + interaction state
  const [annotations, setAnnotations] = useState<PdfEditAnnotation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftShape | null>(null)
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)

  // Run state
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Preview plumbing
  const docRef = useRef<Awaited<ReturnType<typeof pdfjsDoc>> | null>(null)
  const docFileRef = useRef<File | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; start: EditPoint; orig: PdfEditAnnotation } | null>(null)
  const draftRef = useRef<DraftShape | null>(null)
  const [containerW, setContainerW] = useState(0)
  const [pageDims, setPageDims] = useState({ w: 612, h: 792 })
  const [scale, setScale] = useState(1)

  const file = files[0] ?? null
  const pageAnns = useMemo(() => annotations.filter((a) => a.pageIndex === pageIndex), [annotations, pageIndex])
  const selected = useMemo(
    () => (selectedId ? (annotations.find((a) => a.id === selectedId) ?? null) : null),
    [annotations, selectedId]
  )

  const resetEditor = () => {
    setAnnotations([])
    setSelectedId(null)
    setDraft(null)
    setTextDraft(null)
    setPageIndex(0)
    setResults([])
    setFailed([])
    dragRef.current = null
    draftRef.current = null
  }

  const addFiles = (incoming: File[]) => {
    resetEditor()
    setFiles(incoming.slice(0, 1))
  }

  const removeFile = () => {
    if (docRef.current) void closePdfDoc(docRef.current)
    docRef.current = null
    resetEditor()
    setFiles([])
  }

  /* Unmount: release the pdf.js document. */
  useEffect(() => {
    return () => {
      if (docRef.current) void closePdfDoc(docRef.current)
      docRef.current = null
    }
  }, [])

  /* Measure the page area so the preview scale follows the container width. */
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerW(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [file])

  /* Page rendering — pdf.js doc cached per file, re-rendered on page/scale change. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!file) {
        docFileRef.current = null
        return
      }
      try {
        setPreviewBusy(true)
        if (!docRef.current || docFileRef.current !== file) {
          if (docRef.current) void closePdfDoc(docRef.current)
          docRef.current = await pdfjsDoc(file)
          docFileRef.current = file
          setPageCount(docRef.current.numPages)
        }
        const doc = docRef.current
        if (!doc || cancelled) return

        const page = await doc.getPage(Math.min(pageIndex + 1, doc.numPages))
        const base = page.getViewport({ scale: 1 })
        if (cancelled) return

        const areaW = containerW > 40 ? containerW : 480
        const fit = Math.min(2, Math.max(0.35, areaW / base.width))
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const offscreen = await renderPdfPage(page, fit * dpr)
        if (cancelled) {
          offscreen.width = 0
          return
        }

        setPageDims({ w: base.width, h: base.height })
        setScale(fit)
        const vis = canvasRef.current
        if (vis) {
          vis.width = offscreen.width
          vis.height = offscreen.height
          vis.getContext('2d')?.drawImage(offscreen, 0, 0)
          vis.style.width = `${Math.round(base.width * fit)}px`
          vis.style.height = `${Math.round(base.height * fit)}px`
        }
        offscreen.width = 0
      } catch (err) {
        if (!cancelled) {
          toast.error(errMessage(err, t))
          setFiles([])
        }
      } finally {
        if (!cancelled) setPreviewBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, pageIndex, containerW, t])

  /* Delete key removes the selected annotation (unless typing in a field). */
  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      deleteSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, deleteSelected])

  /* ----------------------------- pointer logic ----------------------------- */

  const nextId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ann-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  /** Client point → PDF user space (y-up) using the overlay box. */
  const toPdfPoint = (e: React.PointerEvent<SVGSVGElement>): EditPoint => {
    const el = overlayRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const px = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0
    const py = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0
    return {
      x: Math.min(pageDims.w, Math.max(0, px * pageDims.w)),
      y: Math.min(pageDims.h, Math.max(0, (1 - py) * pageDims.h)),
    }
  }

  const pushAnnotation = (ann: PdfEditAnnotation) => {
    setAnnotations((prev) => [...prev, ann])
    setSelectedId(ann.id)
  }

  const commitDraft = (d: DraftShape) => {
    const id = nextId()
    const s = d.start
    const c = d.cur
    const dw = c.x - s.x
    const dh = c.y - s.y
    const rect = normRectLocal({ x: s.x, y: s.y, w: dw, h: dh })

    switch (d.tool) {
      case 'highlight': {
        if (Math.max(Math.abs(dw), Math.abs(dh)) < 3) return // min size guard
        pushAnnotation({ id, pageIndex, type: 'highlight', rect, color, opacity: HIGHLIGHT_OPACITY })
        return
      }
      case 'underline':
      case 'strike': {
        if (Math.max(Math.abs(dw), Math.abs(dh)) < 3) return
        pushAnnotation({ id, pageIndex, type: d.tool, rect, color, thickness: Math.max(2, strokeWidth) })
        return
      }
      case 'rect':
      case 'ellipse': {
        if (Math.max(Math.abs(dw), Math.abs(dh)) < 3) return
        pushAnnotation({
          id,
          pageIndex,
          type: d.tool,
          rect,
          strokeColor: color,
          strokeWidth,
          fillColor: fillShape ? color : null,
          fillOpacity: fillShape ? 0.25 : undefined,
        })
        return
      }
      case 'line':
      case 'arrow': {
        if (Math.hypot(dw, dh) < 3) return
        pushAnnotation({
          id,
          pageIndex,
          type: 'line',
          x1: s.x,
          y1: s.y,
          x2: c.x,
          y2: c.y,
          strokeColor: color,
          strokeWidth,
          arrow: d.tool === 'arrow',
        })
        return
      }
      case 'pencil': {
        const pts = [...d.points]
        if (pts.length === 1) pts.push({ x: pts[0]!.x + 0.6, y: pts[0]!.y + 0.6 }) // tap → dot
        pushAnnotation({ id, pageIndex, type: 'ink', points: pts, strokeWidth, color })
        return
      }
      case 'textbox':
      case 'note': {
        // Short drags grow into a usable box; the popover then collects text.
        let r = rect
        if (r.w < 60 || r.h < 24) r = { x: s.x, y: s.y, w: Math.max(140, r.w), h: Math.max(48, r.h) }
        r = { ...r, x: Math.min(r.x, Math.max(4, pageDims.w - 24)) }
        setTextDraft({ kind: d.tool, rect: r, text: '' })
        return
      }
    }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (previewBusy || textDraft || !file) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toPdfPoint(e)

    if (tool === 'select') {
      let hit: PdfEditAnnotation | null = null
      for (let i = pageAnns.length - 1; i >= 0; i--) {
        const a = pageAnns[i]!
        if (annotationHits(a, p.x, p.y)) {
          hit = a
          break
        }
      }
      if (hit) {
        setSelectedId(hit.id)
        dragRef.current = { id: hit.id, start: p, orig: hit }
      } else {
        setSelectedId(null)
      }
      return
    }

    if (tool === 'stamp') {
      const text = stampText.trim()
      if (!text) {
        toast.error(t('pdfAnnStampEmpty'))
        return
      }
      pushAnnotation({
        id: nextId(),
        pageIndex,
        type: 'stamp',
        x: p.x,
        y: p.y,
        text,
        color,
        fontSize,
        rotation: DEFAULT_STAMP_ROTATION,
      })
      return
    }

    const d: DraftShape = { tool: tool as DraftShape['tool'], start: p, cur: p, points: [p] }
    draftRef.current = d
    setDraft(d)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      const p = toPdfPoint(e)
      const { id, start, orig } = dragRef.current
      // Recompute from the ORIGINAL every move → no drifting.
      const moved = moveAnnotation(orig, p.x - start.x, p.y - start.y)
      setAnnotations((prev) => prev.map((a) => (a.id === id ? moved : a)))
      return
    }
    const d = draftRef.current
    if (!d) return
    const p = toPdfPoint(e)
    if (d.tool === 'pencil') {
      if (d.points.length < MAX_INK_POINTS) d.points.push(p)
    } else {
      d.cur = p
    }
    setDraft({ ...d, points: [...d.points] })
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      dragRef.current = null
      return
    }
    const d = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (!d) return
    if (d.tool === 'pencil') {
      const p = toPdfPoint(e)
      const last = d.points[d.points.length - 1]
      if (last && Math.hypot(p.x - last.x, p.y - last.y) > 0.5 && d.points.length < MAX_INK_POINTS) {
        d.points.push(p)
      }
    }
    commitDraft(d)
  }

  /* --------------------------- text editor popover -------------------------- */

  const popoverPos = useMemo(() => {
    if (!textDraft) return null
    const r = textDraft.rect
    const boxW = pageDims.w * scale
    const left = Math.min(Math.max(8, r.x * scale), Math.max(8, boxW - 272))
    const top = (pageDims.h - r.y) * scale + 6
    return { left, top }
  }, [textDraft, scale, pageDims])

  const confirmTextDraft = () => {
    const td = textDraft
    if (!td || !td.text.trim()) return
    if (td.kind === 'textbox') {
      pushAnnotation({
        id: nextId(),
        pageIndex,
        type: 'textbox',
        rect: td.rect,
        text: td.text,
        fontSize,
        color,
        fillColor: '#ffffff',
        borderColor: color,
      })
    } else {
      pushAnnotation({
        id: nextId(),
        pageIndex,
        type: 'note',
        rect: autoNoteRect(td.rect, td.text, fontSize),
        text: td.text,
        fontSize,
      })
    }
    setTextDraft(null)
  }

  /* --------------------------------- actions -------------------------------- */

  const undoLast = () => {
    const last = annotations[annotations.length - 1]
    if (!last) return
    setAnnotations((prev) => prev.slice(0, -1))
    if (selectedId === last.id) setSelectedId(null)
  }

  const clearPage = () => {
    setAnnotations((prev) => prev.filter((a) => a.pageIndex !== pageIndex))
    setSelectedId(null)
  }

  const run = async () => {
    if (!file || busy) return
    if (annotations.length === 0) {
      toast.error(t('pdfErrNoAnnotations'))
      return
    }
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const blob = await burnAnnotations(file, annotations)
      setResults([{ name: resultName(file.name, '-annotated', 'pdf'), blob }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ----------------------------------- UI ----------------------------------- */

  const hint =
    tool === 'select'
      ? t('pdfAnnSelectHint')
      : tool === 'stamp'
        ? t('pdfAnnTapStampHint')
        : tool === 'textbox' || tool === 'note'
          ? t('pdfAnnTextboxHint')
          : tool === 'pencil'
            ? t('pdfDrawHint')
            : t('pdfAnnDragHint')

  return (
    <ToolShell icon={<Highlighter />} title={t('toolPdfAnnotate')} desc={t('toolPdfAnnotateDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="application/pdf"
        multiple={false}
        files={file ? [file] : []}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy}
      />

      {file && (
        <ToolOptionsCard>
          {/* ── Tool palette ── */}
          <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label={t('tools')}>
            {PALETTE.map(({ id, icon: Icon, labelKey }) => (
              <Button
                key={id}
                type="button"
                variant={tool === id ? 'default' : 'outline'}
                size="sm"
                className="h-11 w-11 p-0"
                aria-pressed={tool === id}
                aria-label={t(labelKey)}
                title={t(labelKey)}
                onClick={() => {
                  setTool(id)
                  if (id !== 'select') setSelectedId(null)
                }}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </Button>
            ))}
          </div>

          {/* ── Contextual controls ── */}
          {tool !== 'select' && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
              {tool !== 'note' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{t('pdfAnnColor')}</span>
                  {ANNOTATE_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`${t('pdfAnnColor')}: ${c}`}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                      className={`h-8 w-8 shrink-0 rounded-full border-2 transition-transform ${
                        color === c ? 'scale-110 border-foreground ring-2 ring-ring ring-offset-2 ring-offset-background' : 'border-border'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <label
                    className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-border"
                    title={t('pdfAnnCustom')}
                  >
                    <span
                      className="pointer-events-none absolute inset-0"
                      style={{ background: 'conic-gradient(#dc2626, #ffe066, #16a34a, #2563eb, #a855f7, #dc2626)' }}
                      aria-hidden
                    />
                    <input
                      type="color"
                      aria-label={t('pdfAnnCustom')}
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                </div>
              )}

              {STROKE_TOOLS.includes(tool) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{t('pdfAnnStroke')}</span>
                  {STROKE_WIDTHS.map((w) => (
                    <Button
                      key={w}
                      type="button"
                      size="sm"
                      variant={strokeWidth === w ? 'default' : 'outline'}
                      className="h-9 min-w-11"
                      aria-pressed={strokeWidth === w}
                      onClick={() => setStrokeWidth(w)}
                    >
                      {w}
                    </Button>
                  ))}
                </div>
              )}

              {TEXT_TOOLS.includes(tool) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{t('pdfAnnFontSize')}</span>
                  {FONT_SIZES.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={fontSize === s ? 'default' : 'outline'}
                      className="h-9 min-w-11"
                      aria-pressed={fontSize === s}
                      onClick={() => setFontSize(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              )}

              {SHAPE_TOOLS.includes(tool) && (
                <div className="flex items-center gap-2">
                  <Switch id="pdf-ann-fill" checked={fillShape} onCheckedChange={setFillShape} />
                  <Label htmlFor="pdf-ann-fill" className="text-sm">
                    {t('pdfAnnFill')}
                  </Label>
                </div>
              )}

              {tool === 'stamp' && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">{t('pdfAnnStampText')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {STAMP_PRESETS.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={stampText === s ? 'default' : 'outline'}
                        className="h-9"
                        aria-pressed={stampText === s}
                        onClick={() => setStampText(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                  <Input
                    value={stampText}
                    onChange={(e) => setStampText(e.target.value)}
                    placeholder={t('pdfAnnStampText')}
                    className="h-10"
                    maxLength={40}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Page canvas + SVG overlay ── */}
          <div ref={areaRef} className="w-full">
            <div className="relative mx-auto w-fit">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={tf('pdfPage', { page: pageIndex + 1, total: pageCount })}
                className="block rounded-lg border bg-white shadow-sm"
              />
              <svg
                ref={overlayRef}
                viewBox={`0 0 ${pageDims.w} ${pageDims.h}`}
                className={`absolute inset-0 h-full w-full ${tool === 'select' ? 'cursor-pointer' : 'cursor-crosshair'}`}
                style={{ touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onContextMenu={(e) => e.preventDefault()}
              >
                {pageAnns.map((a) => (
                  <AnnotationSvg key={a.id} ann={a} pageH={pageDims.h} />
                ))}
                {draft && (
                  <DraftSvg draft={draft} pageH={pageDims.h} color={color} strokeWidth={strokeWidth} fillShape={fillShape} />
                )}
                {selected && !draft && <SelectionRing ann={selected} pageH={pageDims.h} />}
              </svg>

              {previewBusy && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60"
                  role="status"
                >
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                </div>
              )}

              {textDraft && popoverPos && (
                <div
                  className="absolute z-20 w-64 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border bg-popover p-3 shadow-lg"
                  style={{ left: popoverPos.left, top: popoverPos.top }}
                >
                  <Textarea
                    autoFocus
                    value={textDraft.text}
                    onChange={(e) => setTextDraft({ ...textDraft, text: e.target.value })}
                    placeholder={textDraft.kind === 'note' ? t('pdfAnnNotePh') : t('pdfAnnTextboxPh')}
                    rows={3}
                    className="min-h-20 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-9 flex-1" onClick={confirmTextDraft}>
                      {t('pdfAnnAdd')}
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => setTextDraft(null)}>
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{hint}</p>
          </div>

          {/* ── Page navigation + per-page count ── */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              disabled={pageIndex <= 0 || previewBusy}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              aria-label={t('pdfPrev')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-28 text-center text-sm tabular-nums">
              {tf('pdfPage', { page: pageIndex + 1, total: pageCount })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              disabled={pageIndex >= pageCount - 1 || previewBusy}
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              aria-label={t('pdfNext')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Badge variant="secondary" className="h-7 px-3">
              {tf('pdfAnnMarksPage', { n: pageAnns.length })}
            </Badge>
          </div>

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-10 flex-1 gap-1.5 sm:flex-none sm:px-4"
              disabled={annotations.length === 0}
              onClick={undoLast}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              {t('pdfAnnotationUndo')}
            </Button>
            {selectedId && (
              <Button
                variant="outline"
                className="h-10 flex-1 gap-1.5 text-destructive hover:text-destructive sm:flex-none sm:px-4"
                onClick={deleteSelected}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('pdfAnnDeleteSel')}
              </Button>
            )}
            <Button
              variant="outline"
              className="h-10 flex-1 gap-1.5 sm:flex-none sm:px-4"
              disabled={annotations.length === 0}
              onClick={clearPage}
            >
              <Eraser className="h-4 w-4" aria-hidden />
              {t('pdfAnnClearPage')}
            </Button>
          </div>

          <div className="space-y-1.5">
            <ToolRunButton onClick={() => void run()} busy={busy} disabled={annotations.length === 0}>
              {t('toolRun')}
            </ToolRunButton>
            <p className="text-center text-xs text-muted-foreground">{tf('pdfAnnTotal', { n: annotations.length })}</p>
          </div>
        </ToolOptionsCard>
      )}

      <ToolResults
        results={results}
        failed={failed}
        onClear={() => {
          setResults([])
          setFailed([])
        }}
      />
    </ToolShell>
  )
}
