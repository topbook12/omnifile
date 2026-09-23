'use client'

/**
 * PDF viewer — pdf.js lazy rendering (one page at a time).
 *
 * - Document is loaded from `blob` in an effect keyed on it; the loading
 *   task is destroyed on cleanup (cancelled flag guards against races).
 * - Only the current page renders, onto a <canvas> whose backing store is
 *   scaled by devicePixelRatio for crisp text (CSS size = viewport size).
 * - Fit-width is the default: the effective scale derives from the scroll
 *   container width (ResizeObserver + rAF debounce) and the current page's
 *   base viewport width at scale 1. Manual zoom / ctrl+wheel turns it off.
 * - Page navigation: buttons, ctrl+wheel zoom (trackpad pinch), touch swipe.
 */
import * as React from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/lib/i18n'
import type { ViewerEditorProps } from '@/lib/viewer-types'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.25 // toolbar buttons: ×1.25 / ÷1.25
const WHEEL_FACTOR = 1.1 // ctrl+wheel: ±10% per notch
const SWIPE_MIN_DX = 60 // px before a horizontal swipe flips the page
const SWIPE_RATIO = 1.5 // |dx| must exceed |dy| × this

const round2 = (n: number): number => Math.round(n * 100) / 100
const clampScale = (n: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, round2(n)))

export default function PdfViewer({ blob }: ViewerEditorProps) {
  const { t, tf } = useI18n()

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

  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const renderTaskRef = React.useRef<RenderTask | null>(null)
  const renderSeqRef = React.useRef(0)
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)

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

  /* ---------------------------------------------------- document loading */
  React.useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null

    void (async () => {
      try {
        const data = await blob.arrayBuffer()
        if (cancelled) return
        // Reset viewer state for the new document. All state updates below
        // happen after awaits, never synchronously during effect execution.
        setDoc(null)
        setNumPages(0)
        setPage(1)
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
        // Seed the fit reference with page 1 so the first paint is fitted.
        const p1 = await loaded.getPage(1)
        if (cancelled) {
          void task?.destroy().catch(() => {})
          return
        }
        setBaseWidth(p1.getViewport({ scale: 1 }).width)
        p1.cleanup()
        setDoc(loaded)
        setNumPages(loaded.numPages)
        setPage(1)
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
  }, [doc, page, scale, fitMode, loading, error])

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

  /* ------------------------------------------------------------ handlers */
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
    const touch = e.touches[0]
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
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

  /* -------------------------------------------------------------- render */
  const hasDoc = !!doc && !loading && !error

  return (
    <div className="flex h-full min-h-0 flex-col">
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

      <p className="shrink-0 pb-1 text-center text-xs text-muted-foreground">
        {t('pdfHint')}
      </p>

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
          <canvas
            ref={canvasRef}
            className="mx-auto block shrink-0 bg-white shadow-md"
          />
        )}
      </div>
    </div>
  )
}
