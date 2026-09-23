'use client'

/**
 * PDF viewer + editor — pdf.js lazy rendering (one page at a time) with a
 * fully client-side annotation layer (pdf-lib burn-in on save).
 *
 * - Document is loaded from `blob` in an effect keyed on it; the loading
 *   task is destroyed on cleanup (cancelled flag guards against races).
 *   `pendingPageRef` preserves (and clamps) the current page across
 *   programmatic reloads (save / rotate / delete / merge / …).
 * - Only the current page renders, onto a <canvas> whose backing store is
 *   scaled by devicePixelRatio for crisp text (CSS size = viewport size).
 *   A transparent overlay canvas sits exactly on top of it (same wrapper)
 *   and hosts the tools: text, freehand ink, highlight and whiteout.
 *   Annotations are stored in PDF user space (y-up, bottom-left origin)
 *   using viewport.convertToPdfPoint / convertToViewportPoint, so they
 *   survive zoom, rotation and page navigation.
 * - Fit-width is the default: the effective scale derives from the scroll
 *   container width (ResizeObserver + rAF debounce) and the current page's
 *   base viewport width at scale 1. Manual zoom / ctrl+wheel turns it off.
 * - Page navigation: buttons, ctrl+wheel zoom (trackpad pinch), touch swipe
 *   (swiping is disabled while an annotation tool is active).
 * - Structural operations (rotate/delete page, watermark, page numbers,
 *   merge, plain save) burn pending annotations with pdf-lib and persist
 *   through onSave; the parent then hands back a new `blob`, which reloads
 *   the document. Rotation keeps annotations live (user space is unchanged
 *   by /Rotate, only the display transform rotates).
 */
import * as React from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import {
  ChevronLeft,
  ChevronRight,
  Combine,
  Droplets,
  Eraser,
  Eye,
  Hash,
  Highlighter,
  Loader2,
  Maximize2,
  Pencil,
  RotateCcw,
  RotateCw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Wrench,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import type { ViewerEditorProps } from '@/lib/viewer-types'
import { openFilesWithInput } from '@/lib/fsa'
import {
  COLOR_SWATCHES,
  HIGHLIGHT_STYLE,
  WHITEOUT_STYLE,
  drawAnnotationPdf,
  drawPageNumber,
  drawWatermark,
  paintAnnotation,
  toPdfPoint,
  type NewPdfAnnotation,
  type NumberPosition,
  type PdfAnnotation,
  type ToolMode,
} from '@/lib/pdf-annotate'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.25 // toolbar buttons: ×1.25 / ÷1.25
const WHEEL_FACTOR = 1.1 // ctrl+wheel: ±10% per notch
const SWIPE_MIN_DX = 60 // px before a horizontal swipe flips the page
const SWIPE_RATIO = 1.5 // |dx| must exceed |dy| × this
const DRAG_MIN_PX = 4 // minimum drag size before a rectangle is committed
const INK_MIN = 1
const INK_MAX = 16
const TEXT_SIZE_MIN = 8
const TEXT_SIZE_MAX = 48
const WM_OPACITY_MIN = 0.1
const WM_OPACITY_MAX = 0.5
const WM_SIZE_MIN = 24
const WM_SIZE_MAX = 120

const round2 = (n: number): number => Math.round(n * 100) / 100
const clampScale = (n: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, round2(n)))

let annSeq = 0
const makeAnnId = (): string => {
  annSeq += 1
  return `ann-${Date.now().toString(36)}-${annSeq.toString(36)}`
}

type Viewport = ReturnType<PDFPageProxy['getViewport']>

/** Local screen/PDF point shape (kept tiny on purpose). */
interface PdfPointLike {
  x: number
  y: number
}

/** Copy into a fresh ArrayBuffer so `new Blob` always sees exact bytes. */
const bytesToPdfBlob = (bytes: Uint8Array): Blob => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'application/pdf' })
}

const SWATCH =
  'h-10 w-10 shrink-0 rounded-full border shadow-sm transition-transform active:scale-95'

export default function PdfViewer({ blob, onDirtyChange, onSave }: ViewerEditorProps) {
  const { t, tf } = useI18n()

  /* ------------------------------------------------ document/viewer state */
  const [doc, setDoc] = React.useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [zoom, setZoom] = React.useState(1)
  const [fitMode, setFitMode] = React.useState(true)
  const [containerWidth, setContainerWidth] = React.useState(0)
  // Current page's base viewport width at scale 1 — the fit reference.
  const [baseWidth, setBaseWidth] = React.useState(0)

  /* -------------------------------------------------------- editor state */
  const [tool, setTool] = React.useState<ToolMode>('view')
  const [annotations, setAnnotations] = React.useState<PdfAnnotation[]>([])
  const [inkColor, setInkColor] = React.useState<string>('#dc2626')
  const [inkWidth, setInkWidth] = React.useState(3)
  const [textColor, setTextColor] = React.useState<string>('#000000')
  const [textSize, setTextSize] = React.useState(16)
  const [pendingText, setPendingText] = React.useState<PdfPointLike | null>(null)
  const [textValue, setTextValue] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [watermarkOpen, setWatermarkOpen] = React.useState(false)
  const [watermarkText, setWatermarkText] = React.useState('')
  const [watermarkOpacity, setWatermarkOpacity] = React.useState(0.3)
  const [watermarkSize, setWatermarkSize] = React.useState(48)
  const [numbersOpen, setNumbersOpen] = React.useState(false)
  const [numberPos, setNumberPos] = React.useState<NumberPosition>('bottom-center')
  const [mergeOpen, setMergeOpen] = React.useState(false)

  /* ---------------------------------------------------------------- refs */
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const overlayRef = React.useRef<HTMLCanvasElement | null>(null)
  const renderTaskRef = React.useRef<RenderTask | null>(null)
  const renderSeqRef = React.useRef(0)
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const viewportRef = React.useRef<Viewport | null>(null)
  const annotationsRef = React.useRef<PdfAnnotation[]>([])
  const pageRef = React.useRef(page)
  const toolRef = React.useRef<ToolMode>(tool)
  const inkColorRef = React.useRef(inkColor)
  const inkWidthRef = React.useRef(inkWidth)
  const busyRef = React.useRef(false)
  const pendingPageRef = React.useRef(1)
  const strokeRef = React.useRef<{ points: PdfPointLike[] } | null>(null)
  const rectDragRef = React.useRef<PdfPointLike & { x1: number; y1: number } | null>(null)
  const onDirtyRef = React.useRef(onDirtyChange)

  /* -------------------------------------------------------- state mirrors */
  React.useEffect(() => {
    onDirtyRef.current = onDirtyChange
  })
  React.useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])
  React.useEffect(() => {
    pageRef.current = page
  }, [page])
  React.useEffect(() => {
    toolRef.current = tool
    inkColorRef.current = inkColor
    inkWidthRef.current = inkWidth
  }, [tool, inkColor, inkWidth])

  /* ------------------------------------------------------- dirty plumbing */
  React.useEffect(() => {
    onDirtyRef.current(annotations.length > 0)
  }, [annotations])

  // Effective render scale: fit-width when enabled, otherwise manual zoom.
  const fitScale =
    fitMode && baseWidth > 0 && containerWidth > 0
      ? clampScale(containerWidth / baseWidth)
      : null
  const scale = fitScale ?? zoom

  // Latest scale for event handlers registered once (wheel zoom).
  const scaleRef = React.useRef(scale)
  React.useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  /* ------------------------------------------------------ overlay drawing */
  const redrawOverlay = React.useCallback(() => {
    const overlay = overlayRef.current
    const viewport = viewportRef.current
    if (!overlay || !viewport) return
    const dpr = window.devicePixelRatio || 1
    const cssW = Math.max(1, Math.floor(viewport.width))
    const cssH = Math.max(1, Math.floor(viewport.height))
    const bw = Math.max(1, Math.floor(cssW * dpr))
    const bh = Math.max(1, Math.floor(cssH * dpr))
    if (overlay.width !== bw) overlay.width = bw
    if (overlay.height !== bh) overlay.height = bh
    overlay.style.width = `${cssW}px`
    overlay.style.height = `${cssH}px`
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const currentPage = pageRef.current
    for (const ann of annotationsRef.current) {
      if (ann.page === currentPage) paintAnnotation(ctx, ann, viewport)
    }

    // Live previews while dragging (refs → no re-render needed).
    const stroke = strokeRef.current
    if (stroke && stroke.points.length > 1) {
      ctx.strokeStyle = inkColorRef.current
      ctx.lineWidth = Math.max(1, inkWidthRef.current * viewport.scale)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      stroke.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()
    }
    const drag = rectDragRef.current
    if (drag) {
      const x = Math.min(drag.x, drag.x1)
      const y = Math.min(drag.y, drag.y1)
      const w = Math.abs(drag.x1 - drag.x)
      const h = Math.abs(drag.y1 - drag.y)
      ctx.fillStyle = toolRef.current === 'highlight' ? HIGHLIGHT_STYLE : WHITEOUT_STYLE
      ctx.fillRect(x, y, w, h)
      // Teal dashed outline keeps whiteout previews visible on white pages.
      ctx.strokeStyle = 'rgba(13, 148, 136, 0.9)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1))
      ctx.setLineDash([])
    }
  }, [])

  /* ---------------------------------------------------- document loading */
  React.useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null
    const targetPage = Math.max(1, pendingPageRef.current)
    pendingPageRef.current = 1
    // Drop any in-flight gesture state from the previous document.
    strokeRef.current = null
    rectDragRef.current = null

    void (async () => {
      try {
        const data = await blob.arrayBuffer()
        if (cancelled) return
        // Reset viewer state for the new document. All state updates below
        // happen after awaits, never synchronously during effect execution.
        setDoc(null)
        setNumPages(0)
        setPage(targetPage)
        setZoom(1)
        setFitMode(true)
        setBaseWidth(0)
        setError(false)
        setLoading(true)

        task = pdfjsLib.getDocument({ data })
        const loaded = await task.promise
        if (cancelled) {
          // Teardown goes through the loading task (PDFDocumentProxy has no
          // destroy() in pdf.js v6 — the task owns the transport).
          void task?.destroy().catch(() => {})
          return
        }
        // Seed the fit reference with the target page so the first paint is
        // fitted (pages may differ in size).
        const safeTarget = Math.min(Math.max(1, targetPage), loaded.numPages)
        const p = await loaded.getPage(safeTarget)
        if (cancelled) {
          void task?.destroy().catch(() => {})
          return
        }
        setBaseWidth(p.getViewport({ scale: 1 }).width)
        p.cleanup()
        setDoc(loaded)
        setNumPages(loaded.numPages)
        setPage(safeTarget)
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      void task?.destroy().catch(() => {})
    }
  }, [blob])

  /* ------------------------------------------------------ page rendering */
  React.useEffect(() => {
    const canvas = canvasRef.current
    const theDoc = doc
    if (!theDoc || !canvas || loading) return

    const seq = ++renderSeqRef.current
    let disposed = false
    let pageProxy: PDFPageProxy | null = null
    let task: RenderTask | null = null

    void (async () => {
      try {
        // Defensive: drop any render that is somehow still in flight.
        try {
          renderTaskRef.current?.cancel()
        } catch {
          /* previous task already finished */
        }

        pageProxy = await theDoc.getPage(page)
        if (disposed || seq !== renderSeqRef.current) return

        // Keep the fit reference in sync with the page being rendered
        // (pages may differ in size). Same value → React bails out.
        setBaseWidth(pageProxy.getViewport({ scale: 1 }).width)

        const viewport = pageProxy.getViewport({ scale })
        const dpr = window.devicePixelRatio || 1

        // Backing store at device resolution, CSS size at CSS pixels.
        // Assigning width/height also clears any previous content.
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        // The overlay shares the page's viewport (rotation included) so PDF
        // user-space coordinates round-trip exactly between screen and file.
        viewportRef.current = viewport
        redrawOverlay()

        task = pageProxy.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        })
        renderTaskRef.current = task
        await task.promise
        if (disposed || seq !== renderSeqRef.current) return
      } catch (err) {
        if (err instanceof pdfjsLib.RenderingCancelledException) return
        if (!disposed && seq === renderSeqRef.current) setError(true)
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null
        try {
          pageProxy?.cleanup()
        } catch {
          /* page may already be destroyed */
        }
      }
    })()

    return () => {
      disposed = true
      if (renderTaskRef.current === task) renderTaskRef.current = null
      try {
        task?.cancel()
      } catch {
        /* already finished */
      }
    }
    // `fitMode` and `error` are deliberate deps: toggling fit (or recovering
    // from a failed render) must re-trigger a paint even if `scale` is equal.
  }, [doc, page, scale, fitMode, loading, error, redrawOverlay])

  /* ------------------------------------- overlay repaint on annotation ops */
  React.useEffect(() => {
    redrawOverlay()
  }, [annotations, page, doc, loading, error, redrawOverlay])

  /* ---------------------------------------------- fit-width (ResizeObserver) */
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setContainerWidth(el.clientWidth))
    })
    ro.observe(el) // also fires once right away, seeding containerWidth
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  /* ------------------------------------- ctrl+wheel zoom (trackpad pinch) */
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setError(false)
      setFitMode(false)
      setZoom(clampScale(scaleRef.current * (e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR)))
    }
    // React's synthetic onWheel is passive → register natively.
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* -------------------------------------------------------------- handlers */
  const goToPage = (next: number) => {
    setError(false)
    setPage(Math.min(Math.max(1, next), Math.max(1, numPages)))
  }

  const handleZoomIn = () => {
    setError(false)
    setFitMode(false)
    setZoom(clampScale(scaleRef.current * ZOOM_FACTOR))
  }

  const handleZoomOut = () => {
    setError(false)
    setFitMode(false)
    setZoom(clampScale(scaleRef.current / ZOOM_FACTOR))
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    // Swiping is a viewing gesture — never fire while a tool is active.
    if (tool !== 'view' || busy) {
      touchStartRef.current = null
      return
    }
    const touch = e.touches[0]
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (tool !== 'view' || busy) {
      touchStartRef.current = null
      return
    }
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || numPages < 1) return
    const touch = e.changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) > SWIPE_MIN_DX && Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) {
      goToPage(dx < 0 ? page + 1 : page - 1)
    }
  }

  /* ------------------------------------------------------ annotation ops */
  const addAnnotation = React.useCallback((ann: NewPdfAnnotation) => {
    const full = { ...ann, id: makeAnnId(), page: pageRef.current } as PdfAnnotation
    setAnnotations((prev) => [...prev, full])
  }, [])

  const handleUndo = () => setAnnotations((prev) => prev.slice(0, -1))
  const handleClearAll = () => setAnnotations([])

  const getOverlayPoint = (e: React.PointerEvent<HTMLCanvasElement>): PdfPointLike | null => {
    const canvas = overlayRef.current
    if (!canvas || !viewportRef.current) return null
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'view' || busy || !e.isPrimary) return
    const vp = viewportRef.current
    const pt = getOverlayPoint(e)
    if (!vp || !pt) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }

    if (tool === 'text') {
      const p = toPdfPoint(vp, pt.x, pt.y)
      setTextValue('')
      setPendingText({ x: p.x, y: p.y })
      return
    }
    if (tool === 'draw') {
      strokeRef.current = { points: [pt] }
      return
    }
    // highlight / whiteout — start a rectangle drag
    rectDragRef.current = { x: pt.x, y: pt.y, x1: pt.x, y1: pt.y }
  }

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary) return
    const vp = viewportRef.current
    if (!vp) return

    const stroke = strokeRef.current
    if (stroke) {
      const pt = getOverlayPoint(e)
      if (!pt) return
      const pts = stroke.points
      const last = pts[pts.length - 1]
      if (!last) return
      pts.push(pt)
      // Fast incremental segment; a full redraw happens on pointer up.
      const ctx = overlayRef.current?.getContext('2d')
      if (ctx) {
        const dpr = window.devicePixelRatio || 1
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.strokeStyle = inkColor
        ctx.lineWidth = Math.max(1, inkWidth * vp.scale)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(pt.x, pt.y)
        ctx.stroke()
      }
      return
    }

    const drag = rectDragRef.current
    if (drag) {
      const pt = getOverlayPoint(e)
      if (!pt) return
      drag.x1 = pt.x
      drag.y1 = pt.y
      redrawOverlay()
    }
  }

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary) return

    const stroke = strokeRef.current
    if (stroke) {
      strokeRef.current = null
      const vp = viewportRef.current
      if (vp && toolRef.current === 'draw' && stroke.points.length >= 2) {
        const points = stroke.points.map((p) => toPdfPoint(vp, p.x, p.y))
        addAnnotation({
          type: 'ink',
          pdfX: points[0].x,
          pdfY: points[0].y,
          data: { points, width: inkWidthRef.current, color: inkColorRef.current },
        })
      } else {
        redrawOverlay()
      }
      return
    }

    const drag = rectDragRef.current
    if (drag) {
      rectDragRef.current = null
      const vp = viewportRef.current
      const kind = toolRef.current
      const sx = Math.min(drag.x, drag.x1)
      const sy = Math.min(drag.y, drag.y1)
      const sw = Math.abs(drag.x1 - drag.x)
      const sh = Math.abs(drag.y1 - drag.y)
      if (
        vp &&
        (kind === 'highlight' || kind === 'whiteout') &&
        (sw >= DRAG_MIN_PX || sh >= DRAG_MIN_PX)
      ) {
        commitRect(vp, kind, sx, sy, sw, sh)
      } else {
        redrawOverlay() // tap, or tool switched mid-drag → discard
      }
    }
  }

  const commitRect = (
    vp: NonNullable<Viewport>,
    kind: 'highlight' | 'whiteout',
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ) => {
    const topLeft = toPdfPoint(vp, sx, sy)
    const bottomRight = toPdfPoint(vp, sx + sw, sy + sh)
    const pdfX = Math.min(topLeft.x, bottomRight.x)
    const pdfY = Math.min(topLeft.y, bottomRight.y)
    const data = {
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    }
    if (kind === 'whiteout') addAnnotation({ type: 'whiteout', pdfX, pdfY, data })
    else addAnnotation({ type: 'highlight', pdfX, pdfY, data })
  }

  const handleOverlayPointerCancel = () => {
    const hadDrag = strokeRef.current !== null || rectDragRef.current !== null
    strokeRef.current = null
    rectDragRef.current = null
    if (hadDrag) redrawOverlay()
  }

  const commitText = () => {
    const at = pendingText
    const value = textValue.trim()
    if (!at || !value) return
    addAnnotation({
      type: 'text',
      pdfX: at.x,
      pdfY: at.y,
      data: { text: value, size: textSize, color: textColor },
    })
    setPendingText(null)
    setTextValue('')
  }

  /* ---------------------------------------------------- pdf-lib operations */

  /**
   * Shared pipeline for every structural operation: burn pending annotations
   * (unless asked not to), run the mutation, save through the parent and
   * drop the (now burned-in) annotations. The parent updates `blob`, which
   * reloads the pdf.js document onto the page recorded in pendingPageRef.
   */
  const applyStructural = React.useCallback(
    async (opts: {
      burnAnnotations?: boolean
      keepAnnotations?: boolean
      successKey?: 'tSaved' | 'pdfPageDeleted' | 'pdfWatermarkApplied' | 'pdfPageNumbersApplied' | 'pdfMerged'
      mutate?: (pdfDoc: PDFDocument, font: PDFFont) => void | Promise<void>
    }) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        const src = await blob.arrayBuffer()
        const pdfDoc = await PDFDocument.load(src, { ignoreEncryption: true })
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        if (opts.burnAnnotations !== false && annotationsRef.current.length > 0) {
          const pageCount = pdfDoc.getPageCount()
          for (const ann of annotationsRef.current) {
            const idx = ann.page - 1
            if (idx < 0 || idx >= pageCount) continue
            drawAnnotationPdf(pdfDoc.getPage(idx), ann, font)
          }
        }
        if (opts.mutate) await opts.mutate(pdfDoc, font)
        const bytes = await pdfDoc.save()
        await onSave(bytesToPdfBlob(bytes))
        if (opts.keepAnnotations === true) {
          // The parent resets its dirty flag after every save, but live
          // annotations (rotate keeps them unburned) are still unsaved —
          // re-assert so the close guard and Save button stay accurate.
          onDirtyRef.current(annotationsRef.current.length > 0)
        } else {
          setAnnotations([])
        }
        if (opts.successKey) toast.success(t(opts.successKey))
      } catch {
        pendingPageRef.current = 1
        toast.error(t('tSaveFailed'))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [blob, onSave, t]
  )

  const handleSaveAnnotations = () => {
    if (annotationsRef.current.length === 0) return
    pendingPageRef.current = pageRef.current
    void applyStructural({ successKey: 'tSaved' })
  }

  const handleRotate = (dir: -1 | 1) => {
    pendingPageRef.current = pageRef.current
    void applyStructural({
      // /Rotate only changes the display transform, not user space, so the
      // live annotations stay valid — keep them instead of burning them.
      burnAnnotations: false,
      keepAnnotations: true,
      mutate: (pdfDoc) => {
        const count = pdfDoc.getPageCount()
        const idx = Math.min(Math.max(0, pageRef.current - 1), Math.max(0, count - 1))
        const pg = pdfDoc.getPage(idx)
        const current = pg.getRotation().angle
        pg.setRotation(degrees((((current + dir * 90) % 360) + 360) % 360))
      },
    })
  }

  const confirmDeletePage = () => {
    if (numPages <= 1) return
    setDeleteOpen(false)
    pendingPageRef.current = Math.min(Math.max(1, pageRef.current), numPages - 1)
    void applyStructural({
      successKey: 'pdfPageDeleted',
      mutate: (pdfDoc) => {
        const count = pdfDoc.getPageCount()
        if (count <= 1) return
        const idx = Math.min(Math.max(0, pageRef.current - 1), count - 1)
        pdfDoc.removePage(idx)
      },
    })
  }

  const applyWatermark = () => {
    const text = watermarkText.trim()
    if (!text) return
    setWatermarkOpen(false)
    pendingPageRef.current = pageRef.current
    const opacity = watermarkOpacity
    const size = watermarkSize
    void applyStructural({
      successKey: 'pdfWatermarkApplied',
      mutate: (pdfDoc, font) => {
        for (const pg of pdfDoc.getPages()) drawWatermark(pg, text, font, size, opacity)
      },
    })
  }

  const applyPageNumbers = () => {
    setNumbersOpen(false)
    pendingPageRef.current = pageRef.current
    const pos = numberPos
    void applyStructural({
      successKey: 'pdfPageNumbersApplied',
      mutate: (pdfDoc, font) => {
        const pages = pdfDoc.getPages()
        pages.forEach((pg, i) => drawPageNumber(pg, `${i + 1} / ${pages.length}`, font, pos))
      },
    })
  }

  const handleMergePick = async () => {
    // Must run inside the click gesture chain so the file picker is allowed.
    const picked = await openFilesWithInput('application/pdf', false)
    if (picked.length === 0) return
    const srcBytes = await picked[0].arrayBuffer()
    pendingPageRef.current = pageRef.current
    await applyStructural({
      successKey: 'pdfMerged',
      mutate: async (pdfDoc) => {
        const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true })
        const copied = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices())
        for (const cp of copied) pdfDoc.addPage(cp)
      },
    })
  }

  /* -------------------------------------------------------------- render */
  const hasDoc = !!doc && !loading && !error
  const canUndo = annotations.length > 0

  const TOOLS: { id: ToolMode; label: string; icon: LucideIcon }[] = [
    { id: 'view', label: t('pdfToolView'), icon: Eye },
    { id: 'text', label: t('pdfToolText'), icon: Type },
    { id: 'draw', label: t('pdfToolDraw'), icon: Pencil },
    { id: 'highlight', label: t('pdfToolHighlight'), icon: Highlighter },
    { id: 'whiteout', label: t('pdfToolWhiteout'), icon: Square },
  ]

  const NUMBER_POSITIONS: { id: NumberPosition; preview: string }[] = [
    { id: 'bottom-center', preview: 'bottom-1 left-1/2 -translate-x-1/2' },
    { id: 'bottom-right', preview: 'bottom-1 right-1.5' },
    { id: 'top-right', preview: 'top-1 right-1.5' },
  ]

  const hint =
    tool === 'text'
      ? t('pdfTapToAddText')
      : tool === 'draw'
        ? t('pdfDrawHint')
        : tool !== 'view' || annotations.length > 0
          ? t('pdfAnnotationsHint')
          : t('pdfHint')

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---------------- Row 1: page navigation + zoom ---------------- */}
      <div className="no-touch-callout flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background/95 px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => goToPage(page - 1)}
          disabled={!hasDoc || page <= 1}
          title={t('pdfPrev')}
          aria-label={t('pdfPrev')}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-24 px-1 text-center text-sm whitespace-nowrap tabular-nums text-muted-foreground">
          {tf('pdfPage', { page, total: numPages })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => goToPage(page + 1)}
          disabled={!hasDoc || page >= numPages}
          title={t('pdfNext')}
          aria-label={t('pdfNext')}
        >
          <ChevronRight />
        </Button>

        <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={handleZoomOut}
          disabled={!hasDoc}
          title={t('pdfZoomOut')}
          aria-label={t('pdfZoomOut')}
        >
          <ZoomOut />
        </Button>
        <span className="min-w-12 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={handleZoomIn}
          disabled={!hasDoc}
          title={t('pdfZoomIn')}
          aria-label={t('pdfZoomIn')}
        >
          <ZoomIn />
        </Button>
        <Button
          variant={fitMode ? 'default' : 'ghost'}
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setFitMode((f) => !f)}
          disabled={!hasDoc}
          title={t('pdfFit')}
          aria-label={t('pdfFit')}
          aria-pressed={fitMode}
        >
          <Maximize2 />
        </Button>
      </div>

      {/* ---------------- Row 2: tools + save ---------------- */}
      <div className="flex shrink-0 items-center gap-1.5 border-b bg-background/95 px-2 py-2">
        <div className="no-touch-callout flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <span className="flex shrink-0 items-center gap-1 pl-0.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
            {t('pdfTools')}
          </span>

          <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

          {TOOLS.map((item) => (
            <Button
              key={item.id}
              variant={tool === item.id ? 'default' : 'secondary'}
              size="sm"
              className="h-11 shrink-0 gap-1.5 rounded-full px-3.5"
              onClick={() => setTool(item.id)}
              disabled={!hasDoc || busy}
              aria-pressed={tool === item.id}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium">{item.label}</span>
            </Button>
          ))}

          <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={handleUndo}
            disabled={!canUndo || busy || !hasDoc}
            title={t('pdfAnnotationUndo')}
            aria-label={t('pdfAnnotationUndo')}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={handleClearAll}
            disabled={!canUndo || busy || !hasDoc}
            title={t('pdfAnnotationsClear')}
            aria-label={t('pdfAnnotationsClear')}
          >
            <Eraser />
          </Button>

          <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => handleRotate(-1)}
            disabled={!hasDoc || busy}
            title={t('pdfRotatePageLeft')}
            aria-label={t('pdfRotatePageLeft')}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => handleRotate(1)}
            disabled={!hasDoc || busy}
            title={t('pdfRotatePageRight')}
            aria-label={t('pdfRotatePageRight')}
          >
            <RotateCw />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setDeleteOpen(true)}
            disabled={!hasDoc || busy || numPages <= 1}
            title={t('pdfDeletePage')}
            aria-label={t('pdfDeletePage')}
          >
            <Trash2 />
          </Button>

          <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setWatermarkOpen(true)}
            disabled={!hasDoc || busy}
            title={t('pdfWatermark')}
            aria-label={t('pdfWatermark')}
          >
            <Droplets />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setNumbersOpen(true)}
            disabled={!hasDoc || busy}
            title={t('pdfPageNumbers')}
            aria-label={t('pdfPageNumbers')}
          >
            <Hash />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => setMergeOpen(true)}
            disabled={!hasDoc || busy}
            title={t('pdfMerge')}
            aria-label={t('pdfMerge')}
          >
            <Combine />
          </Button>
        </div>

        <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

        <Button
          variant={canUndo ? 'default' : 'outline'}
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={handleSaveAnnotations}
          disabled={!hasDoc || busy || !canUndo}
          title={t('save')}
          aria-label={t('save')}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Save />}
        </Button>
      </div>

      {/* ---------------- Draw options (contextual) ---------------- */}
      {tool === 'draw' && hasDoc && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/30 px-3 py-2">
          <Label className="shrink-0 text-xs text-muted-foreground">{t('pdfTextColor')}</Label>
          <div className="flex items-center gap-1.5">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={cn(
                  SWATCH,
                  inkColor === c ? 'border-primary ring-2 ring-ring ring-offset-1' : 'border-border'
                )}
                style={{ backgroundColor: c }}
                onClick={() => setInkColor(c)}
                aria-label={c}
                aria-pressed={inkColor === c}
              />
            ))}
          </div>
          <div className="h-6 w-px bg-border" aria-hidden="true" />
          <Label className="shrink-0 text-xs text-muted-foreground">{t('pdfTextSize')}</Label>
          <Slider
            value={[inkWidth]}
            min={INK_MIN}
            max={INK_MAX}
            step={1}
            onValueChange={(v) => setInkWidth(v[0] ?? 3)}
            className="w-24 sm:w-36"
            aria-label={t('pdfTextSize')}
          />
          <span className="w-6 text-xs tabular-nums text-muted-foreground">{inkWidth}</span>
        </div>
      )}

      {/* ---------------- Hint line ---------------- */}
      <p className="shrink-0 truncate px-3 pb-1 pt-0.5 text-center text-xs text-muted-foreground">
        {hint}
      </p>

      {/* ---------------- Page area ---------------- */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-muted/40 p-3 dark:bg-muted/20"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loading && (
          <div className="m-auto flex w-full max-w-sm flex-col gap-3 py-8">
            <Skeleton className="h-4 w-1/2 self-center" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-4 w-2/3 self-center" />
          </div>
        )}
        {!loading && error && (
          <div className="m-auto w-full max-w-xs">
            <Card>
              <CardContent className="text-center text-sm text-muted-foreground">
                {t('errGeneric')}
              </CardContent>
            </Card>
          </div>
        )}
        {hasDoc && (
          <div className="relative mx-auto shrink-0 bg-white shadow-md">
            <canvas ref={canvasRef} className="block" />
            <canvas
              ref={overlayRef}
              className="absolute inset-0"
              style={{
                touchAction: tool === 'view' ? 'auto' : 'none',
                pointerEvents: tool === 'view' || busy ? 'none' : 'auto',
                cursor: tool === 'text' ? 'text' : 'crosshair',
              }}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              onPointerCancel={handleOverlayPointerCancel}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* ---------------- Text annotation dialog ---------------- */}
      <Dialog
        open={pendingText !== null}
        onOpenChange={(open) => {
          if (!open) setPendingText(null)
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pdfAddText')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText()
              }}
              placeholder={t('pdfTextPlaceholder')}
              autoFocus
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('pdfTextColor')}</Label>
              <div className="flex items-center gap-2">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      SWATCH,
                      textColor === c
                        ? 'border-primary ring-2 ring-ring ring-offset-1'
                        : 'border-border'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setTextColor(c)}
                    aria-label={c}
                    aria-pressed={textColor === c}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('pdfTextSize')}</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[textSize]}
                  min={TEXT_SIZE_MIN}
                  max={TEXT_SIZE_MAX}
                  step={1}
                  onValueChange={(v) => setTextSize(v[0] ?? 16)}
                  className="flex-1"
                  aria-label={t('pdfTextSize')}
                />
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                  {textSize}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingText(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={commitText} disabled={!textValue.trim()}>
              {t('pdfAddText')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Watermark dialog ---------------- */}
      <Dialog open={watermarkOpen} onOpenChange={setWatermarkOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pdfWatermark')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pdf-wm-text" className="text-xs text-muted-foreground">
                {t('pdfWatermarkText')}
              </Label>
              <Input
                id="pdf-wm-text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder={t('pdfWatermarkText')}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('pdfTextSize')}</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[watermarkSize]}
                  min={WM_SIZE_MIN}
                  max={WM_SIZE_MAX}
                  step={2}
                  onValueChange={(v) => setWatermarkSize(v[0] ?? 48)}
                  className="flex-1"
                  aria-label={t('pdfTextSize')}
                />
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                  {watermarkSize}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('pdfWatermark')}</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[watermarkOpacity]}
                  min={WM_OPACITY_MIN}
                  max={WM_OPACITY_MAX}
                  step={0.05}
                  onValueChange={(v) => setWatermarkOpacity(v[0] ?? 0.3)}
                  className="flex-1"
                  aria-label={t('pdfWatermark')}
                />
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                  {Math.round(watermarkOpacity * 100)}%
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWatermarkOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={applyWatermark} disabled={!watermarkText.trim()}>
              {t('apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Page numbers dialog ---------------- */}
      <Dialog open={numbersOpen} onOpenChange={setNumbersOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pdfPageNumbers')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('pdfPageNumbers')}</Label>
            <div className="flex gap-2" role="radiogroup" aria-label={t('pdfPageNumbers')}>
              {NUMBER_POSITIONS.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  role="radio"
                  aria-checked={numberPos === pos.id}
                  aria-label={pos.id}
                  onClick={() => setNumberPos(pos.id)}
                  className={cn(
                    'flex h-16 w-12 items-center justify-center rounded-lg border-2 bg-muted/40 transition-colors',
                    numberPos === pos.id
                      ? 'border-primary'
                      : 'border-transparent hover:border-border'
                  )}
                >
                  <span className="relative block h-14 w-10 rounded-sm border border-border bg-background">
                    <span
                      className={cn(
                        'absolute text-[7px] font-medium leading-none tabular-nums text-teal-700 dark:text-teal-400',
                        pos.preview
                      )}
                    >
                      1 / 3
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNumbersOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={applyPageNumbers}>{t('apply')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Merge dialog ---------------- */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pdfMerge')}</DialogTitle>
            <DialogDescription>{t('pdfMergeHint')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => {
                setMergeOpen(false)
                void handleMergePick()
              }}
            >
              <Combine className="h-4 w-4" aria-hidden="true" />
              {t('pdfMerge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Delete page confirmation ---------------- */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pdfDeletePage')}</AlertDialogTitle>
            <AlertDialogDescription>{t('pdfDeletePageConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => confirmDeletePage()}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
