'use client'

/**
 * Redact PDF — permanently black out sensitive text and areas (Task 2-d).
 *
 * Flow (mobile-first, 100% on-device):
 *   1. Single-PDF dropzone → pdf.js preview of the current page (document
 *      cached in a ref, closed on file change / unmount), same rendering
 *      pipeline as PdfAnnotateTool.
 *   2. Drag solid boxes over the content to remove (PDF user space, y-up).
 *      Boxes are listed per page with undo / clear-page controls and a
 *      black-or-white fill choice.
 *   3. Run → `redactPdf`: pages WITH boxes are rasterised at 2× and the
 *      boxes burned in as JPEG (text underneath destroyed — that is the
 *      point); pages WITHOUT boxes are copied untouched at full quality.
 *      Progress via ToolProgressBar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Eraser, ShieldBan, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  OnDeviceBadge,
  ToolDropzone,
  ToolOptionsCard,
  ToolProgressBar,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { useI18n } from '@/lib/i18n'
import { redactPdf, resultName, type EditPoint, type EditRect, type RedactBox } from '@/lib/tools/pdf-annotate-edit'
import { closePdfDoc, errMessage, pdfjsDoc, renderPdfPage } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

/** One drawn box, tracked per page. */
interface RedactItem {
  id: string
  pageIndex: number
  rect: EditRect
}

function normRectLocal(r: EditRect): EditRect {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  }
}

const MIN_BOX_PT = 3 // drag smaller than this is ignored

export default function PdfRedactTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [pageCount, setPageCount] = useState(1)
  const [pageIndex, setPageIndex] = useState(0)
  const [previewBusy, setPreviewBusy] = useState(false)

  const [fillHex, setFillHex] = useState('#000000')
  const [boxes, setBoxes] = useState<RedactItem[]>([])
  const [draft, setDraft] = useState<{ start: EditPoint; cur: EditPoint } | null>(null)
  const draftRef = useRef<{ start: EditPoint; cur: EditPoint } | null>(null)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Preview plumbing
  const docRef = useRef<Awaited<ReturnType<typeof pdfjsDoc>> | null>(null)
  const docFileRef = useRef<File | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  const [pageDims, setPageDims] = useState({ w: 612, h: 792 })

  const file = files[0] ?? null
  const pageBoxes = useMemo(() => boxes.filter((b) => b.pageIndex === pageIndex), [boxes, pageIndex])

  const resetEditor = () => {
    setBoxes([])
    setDraft(null)
    draftRef.current = null
    setPageIndex(0)
    setResults([])
    setFailed([])
    setProgress({ done: 0, total: 0 })
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

  /* Track the page-area width so the preview fits the container. */
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerW(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [file])

  /* Page rendering — pdf.js doc cached per file. */
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

  /* ----------------------------- pointer logic ----------------------------- */

  const nextId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `box-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  /** Client point → PDF user space (y-up). */
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

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (previewBusy || !file) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toPdfPoint(e)
    const d = { start: p, cur: p }
    draftRef.current = d
    setDraft(d)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = draftRef.current
    if (!d) return
    d.cur = toPdfPoint(e)
    setDraft({ ...d })
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (!d) return
    const p = toPdfPoint(e)
    const rect = normRectLocal({ x: d.start.x, y: d.start.y, w: p.x - d.start.x, h: p.y - d.start.y })
    if (rect.w < MIN_BOX_PT || rect.h < MIN_BOX_PT) return // min size guard
    setBoxes((prev) => [...prev, { id: nextId(), pageIndex, rect }])
  }

  /* --------------------------------- actions -------------------------------- */

  const undoLast = () => setBoxes((prev) => prev.slice(0, -1))

  const clearPage = () => setBoxes((prev) => prev.filter((b) => b.pageIndex !== pageIndex))

  const run = async () => {
    if (!file || busy) return
    if (boxes.length === 0) {
      toast.error(t('pdfErrNoBoxes'))
      return
    }
    setBusy(true)
    setResults([])
    setFailed([])
    setProgress({ done: 0, total: pageCount })
    try {
      // Group the flat list into the Record<pageIndex, boxes> shape the lib expects.
      const boxesByPage: Record<number, RedactBox[]> = {}
      for (const b of boxes) {
        const list = boxesByPage[b.pageIndex] ?? []
        list.push({ x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h })
        boxesByPage[b.pageIndex] = list
      }
      const blob = await redactPdf(
        file,
        boxesByPage,
        { fillHex },
        (done, total) => setProgress({ done, total })
      )
      setResults([{ name: resultName(file.name, '-redacted', 'pdf'), blob }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ----------------------------------- UI ----------------------------------- */

  const totalProgress = progress.total > 0 ? progress.done / progress.total : 0

  return (
    <ToolShell icon={<ShieldBan />} title={t('toolPdfRedact')} desc={t('toolPdfRedactDesc')}>
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
        <>
          {/* Permanent-redaction warning */}
          <div className="flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-sm text-amber-700 dark:text-amber-300">{t('pdfRedactWarning')}</p>
          </div>

          <ToolOptionsCard>
            {/* ── Box colour: black / white ── */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t('pdfRedactBoxColor')}</span>
              {(
                [
                  { hex: '#000000', label: t('pdfRedactBlack') },
                  { hex: '#ffffff', label: t('pdfRedactWhite') },
                ] as const
              ).map(({ hex, label }) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`${t('pdfRedactBoxColor')}: ${label}`}
                  aria-pressed={fillHex === hex}
                  onClick={() => setFillHex(hex)}
                  className={`h-8 w-8 shrink-0 rounded-full border-2 transition-transform ${
                    fillHex === hex
                      ? 'scale-110 border-foreground ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'border-border'
                  }`}
                  style={{ backgroundColor: hex }}
                  title={label}
                />
              ))}
              <span className="ml-1 text-xs text-muted-foreground">{t('pdfRedactDragHint')}</span>
            </div>

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
                  className="absolute inset-0 h-full w-full cursor-crosshair"
                  style={{ touchAction: 'none' }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {pageBoxes.map((b) => (
                    <rect
                      key={b.id}
                      x={b.rect.x}
                      y={pageDims.h - (b.rect.y + b.rect.h)}
                      width={b.rect.w}
                      height={b.rect.h}
                      fill={fillHex}
                      fillOpacity={0.92}
                    />
                  ))}
                  {draft && (
                    <rect
                      x={Math.min(draft.start.x, draft.cur.x)}
                      y={pageDims.h - Math.max(draft.start.y, draft.cur.y)}
                      width={Math.abs(draft.cur.x - draft.start.x)}
                      height={Math.abs(draft.cur.y - draft.start.y)}
                      fill={fillHex}
                      fillOpacity={0.5}
                      stroke={fillHex === '#000000' ? '#facc15' : '#a1a1aa'}
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                    />
                  )}
                </svg>

                {previewBusy && (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60"
                    role="status"
                  >
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                  </div>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">{t('pdfRedactHint')}</p>
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
                {tf('pdfRedactBoxesPage', { n: pageBoxes.length })}
              </Badge>
            </div>

            {/* ── Actions ── */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-10 flex-1 gap-1.5 sm:flex-none sm:px-4"
                disabled={boxes.length === 0}
                onClick={undoLast}
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                {t('pdfRedactUndo')}
              </Button>
              <Button
                variant="outline"
                className="h-10 flex-1 gap-1.5 sm:flex-none sm:px-4"
                disabled={pageBoxes.length === 0}
                onClick={clearPage}
              >
                <Eraser className="h-4 w-4" aria-hidden />
                {t('pdfRedactClearPage')}
              </Button>
              <Badge variant="secondary" className="h-10 px-3 leading-[2.5rem]">
                {tf('pdfRedactTotal', { n: boxes.length })}
              </Badge>
            </div>

            <ToolRunButton onClick={() => void run()} busy={busy} disabled={boxes.length === 0}>
              {t('toolRun')}
            </ToolRunButton>

            {busy && progress.total > 0 && (
              <ToolProgressBar
                value={totalProgress}
                label={tf('pdfRedactProgress', { n: progress.done, total: progress.total })}
              />
            )}
          </ToolOptionsCard>
        </>
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
