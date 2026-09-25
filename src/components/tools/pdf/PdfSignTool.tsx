'use client'

/**
 * E-sign PDF — pick a page (pdf.js preview + nav), draw a signature on an
 * inline pad (pointer events, touch-friendly), tap the page to place it,
 * choose the width, then burn the transparent PNG into the PDF with
 * @cantoo/pdf-lib. 100% on-device.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Eraser, PenTool, Signature } from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolDropzone,
  ToolField,
  ToolOptionsCard,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useI18n } from '@/lib/i18n'
import {
  canvasToBlob,
  closePdfDoc,
  cropSignatureCanvas,
  errMessage,
  pdfResultName,
  pdfjsDoc,
  renderPdfPage,
  signPdf,
} from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

const PAD_W = 600
const PAD_H = 160
const PREVIEW_TARGET_W = 600

export default function PdfSignTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [pageCount, setPageCount] = useState(1)
  const [pageIndex, setPageIndex] = useState(0)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [showPad, setShowPad] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [sigBlob, setSigBlob] = useState<Blob | null>(null)
  const [placement, setPlacement] = useState<{ x: number; y: number } | null>(null)
  const [widthNorm, setWidthNorm] = useState(0.2)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const docRef = useRef<Awaited<ReturnType<typeof pdfjsDoc>> | null>(null)
  const docFileRef = useRef<File | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const padCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  const file = files[0] ?? null

  /* Object-URL for the signature thumbnail — created in useMemo, revoked here. */
  const sigUrl = useMemo(() => (sigBlob ? URL.createObjectURL(sigBlob) : null), [sigBlob])
  useEffect(() => {
    return () => {
      if (sigUrl) URL.revokeObjectURL(sigUrl)
    }
  }, [sigUrl])

  /* Unmount: destroy the pdf.js document. */
  useEffect(() => {
    return () => {
      if (docRef.current) void closePdfDoc(docRef.current)
      docRef.current = null
    }
  }, [])

  /* Preview rendering — re-renders on file/page changes. */
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
        const scale = Math.min(3, Math.max(0.4, PREVIEW_TARGET_W / base.width))
        const offscreen = await renderPdfPage(page, scale)
        if (cancelled) {
          offscreen.width = 0
          return
        }
        const vis = previewCanvasRef.current
        if (vis) {
          vis.width = offscreen.width
          vis.height = offscreen.height
          vis.getContext('2d')?.drawImage(offscreen, 0, 0)
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
  }, [file, pageIndex])

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setSigBlob(null)
    setHasInk(false)
    setShowPad(false)
    setPlacement(null)
    setPageIndex(0)
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
    setSigBlob(null)
    setHasInk(false)
    setShowPad(false)
    setPlacement(null)
    setPageIndex(0)
  }

  /* ------------------------------- signature pad ------------------------------ */

  const padCtx = () => {
    const ctx = padCanvasRef.current?.getContext('2d') ?? null
    if (ctx) {
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111111'
    }
    return ctx
  }

  const padPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = padCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const ctx = padCtx()
    if (!ctx) return
    padCanvasRef.current?.setPointerCapture(e.pointerId)
    const { x, y } = padPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1) // a single tap paints a dot
    ctx.stroke()
    drawingRef.current = true
    setHasInk(true)
  }

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = padCtx()
    if (!ctx) return
    const { x, y } = padPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = () => {
    drawingRef.current = false
  }

  const clearPad = () => {
    const canvas = padCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const applySignature = async () => {
    const canvas = padCanvasRef.current
    if (!canvas) return
    const cropped = cropSignatureCanvas(canvas)
    if (!cropped) {
      toast.error(t('pdfSignNoSig'))
      return
    }
    const blob = await canvasToBlob(cropped, 'image/png')
    setSigBlob(blob)
    setShowPad(false)
  }

  /* --------------------------------- placement -------------------------------- */

  const onPreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setPlacement({ x, y })
  }

  /* ------------------------------------ run ----------------------------------- */

  const run = async () => {
    if (!file || busy) return
    if (!sigBlob) {
      toast.error(t('pdfSignNoSig'))
      return
    }
    if (!placement) {
      toast.error(t('pdfSignNoPlace'))
      return
    }
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const blob = await signPdf(file, sigBlob, {
        pageIndex,
        xNorm: placement.x,
        yNorm: placement.y,
        widthNorm,
      })
      setResults([{ name: pdfResultName.signed(file.name), blob }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ------------------------------------ UI ------------------------------------ */

  return (
    <ToolShell icon={<Signature />} title={t('toolPdfSign')} desc={t('toolPdfSignDesc')}>
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
        <ToolOptionsCard title={t('preview')}>
          {/* Page preview with placement marker */}
          <div className="relative mx-auto w-fit max-w-full">
            <canvas
              ref={previewCanvasRef}
              onClick={onPreviewClick}
              className="block h-auto max-h-[70dvh] w-auto max-w-full cursor-crosshair rounded-lg border bg-white shadow-sm"
              style={{ touchAction: 'manipulation' }}
              aria-label={t('preview')}
            />
            {placement && (
              <div
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/30"
                style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%` }}
                aria-hidden
              />
            )}
            {previewBusy && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60"
                role="status"
              >
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              </div>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">{t('pdfSignPlaceHint')}</p>

          {/* Page navigation */}
          <div className="flex items-center justify-center gap-2">
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
            <span className="min-w-24 text-center text-sm tabular-nums">
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
          </div>
        </ToolOptionsCard>
      )}

      {file && (
        <ToolOptionsCard title={t('pdfSignDraw')}>
          {/* Signature thumbnail once captured */}
          {sigBlob && sigUrl && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <img
                src={sigUrl}
                alt={t('pdfSignDraw')}
                className="h-12 w-auto max-w-[50%] object-contain"
              />
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" aria-hidden />
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="h-11 flex-1 gap-2"
              onClick={() => setShowPad((v) => !v)}
            >
              <PenTool className="h-4 w-4" aria-hidden />
              {showPad ? t('close') : t('pdfSignDraw')}
            </Button>
          </div>

          {showPad && (
            <div className="space-y-2.5">
              <div className="rounded-xl border bg-white p-1">
                <canvas
                  ref={padCanvasRef}
                  width={PAD_W}
                  height={PAD_H}
                  className="block h-40 w-full cursor-crosshair rounded-lg"
                  style={{ touchAction: 'none' }}
                  onPointerDown={startDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                  onPointerLeave={endDraw}
                  onPointerCancel={endDraw}
                  aria-label={t('pdfSignDraw')}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="h-11 flex-1 gap-2" onClick={clearPad}>
                  <Eraser className="h-4 w-4" aria-hidden />
                  {t('pdfSignClear')}
                </Button>
                <Button
                  className="h-11 flex-1 gap-2"
                  disabled={!hasInk}
                  onClick={() => void applySignature()}
                >
                  <Check className="h-4 w-4" aria-hidden />
                  {t('pdfSignUse')}
                </Button>
              </div>
            </div>
          )}

          <ToolField label={`${t('pdfSignWidth')}: ${Math.round(widthNorm * 100)}%`}>
            <Slider
              value={[Math.round(widthNorm * 100)]}
              min={10}
              max={40}
              step={1}
              onValueChange={(v) => setWidthNorm((v[0] ?? 20) / 100)}
              aria-label={t('pdfSignWidth')}
            />
          </ToolField>

          <ToolRunButton onClick={() => void run()} busy={busy} disabled={!sigBlob || !placement}>
            {t('toolRun')}
          </ToolRunButton>
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
