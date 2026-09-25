'use client'

/**
 * Add hyperlinks to PDF — pick a page, drag a rectangle over the text area
 * that should become clickable, choose the link type (external URL or jump
 * to another page of this PDF), optionally show a visible border. Multiple
 * links across pages are supported; "Process" writes /Link annotations with
 * the pdf-lib low-level context (see pdf-edit.ts). 100% on-device.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Link2, Undo2 } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'
import { addLinkAnnotations, renderPageToCanvas, type PdfLink } from '@/lib/tools/pdf-edit'
import { errMessage, resultName } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

const PREVIEW_W = 600

type LinkMode = 'external' | 'internal'

/** Drag rectangle in normalised preview coords (0..1, y from the top). */
type NormRect = { x1: number; y1: number; x2: number; y2: number }

type PlacedLink = PdfLink & { id: number }

export default function PdfHyperlinkTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [mode, setMode] = useState<LinkMode>('external')
  const [url, setUrl] = useState('https://')
  const [targetPage, setTargetPage] = useState('1')
  const [visible, setVisible] = useState(false)
  const [links, setLinks] = useState<PlacedLink[]>([])
  const [drag, setDrag] = useState<NormRect | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const previewRef = useRef<HTMLCanvasElement>(null)
  const metaRef = useRef({ scale: 1, width: 1, height: 1 })
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const nextId = useRef(1)

  const file = files[0] ?? null

  /* ------------------------------ page preview ------------------------------ */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!file) return
      try {
        setPreviewBusy(true)
        const preview = await renderPageToCanvas(file, pageIndex, PREVIEW_W)
        if (cancelled) {
          preview.canvas.width = 0
          return
        }
        setPageCount(preview.pageCount)
        metaRef.current = { scale: preview.scale, width: preview.width, height: preview.height }
        const vis = previewRef.current
        if (vis) {
          vis.width = preview.canvas.width
          vis.height = preview.canvas.height
          vis.getContext('2d')?.drawImage(preview.canvas, 0, 0)
        }
        preview.canvas.width = 0
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
  }, [file, pageIndex, t])

  /* ------------------------------ drag handling ----------------------------- */

  const normPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = normPos(e)
    startRef.current = p
    setDrag({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!startRef.current) return
    const p = normPos(e)
    setDrag({ x1: startRef.current.x, y1: startRef.current.y, x2: p.x, y2: p.y })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = startRef.current
    if (!start) return
    startRef.current = null
    const p = normPos(e)
    const rect: NormRect = {
      x1: Math.min(start.x, p.x),
      y1: Math.min(start.y, p.y),
      x2: Math.max(start.x, p.x),
      y2: Math.max(start.y, p.y),
    }
    setDrag(null)
    if (rect.x2 - rect.x1 < 0.02 || rect.y2 - rect.y1 < 0.02) return // accidental tap
    commitLink(rect)
  }

  /** Normalised (y-down) drag rect → PDF points rect (y-up). */
  const commitLink = (norm: NormRect) => {
    const { width, height } = metaRef.current
    if (mode === 'external' && url.trim().length === 0) {
      toast.error(t('pdfErrBadUrl'))
      return
    }
    const targetNum = Number.parseInt(targetPage, 10)
    if (mode === 'internal' && (!Number.isFinite(targetNum) || targetNum < 1 || targetNum > pageCount)) {
      toast.error(t('pdfErrBadLinkTarget'))
      return
    }
    const link: PlacedLink = {
      id: nextId.current++,
      pageIndex,
      rect: {
        x1: norm.x1 * width,
        y1: height * (1 - norm.y2),
        x2: norm.x2 * width,
        y2: height * (1 - norm.y1),
      },
      mode,
      url: mode === 'external' ? url.trim() : undefined,
      targetPage: mode === 'internal' ? targetNum - 1 : undefined,
      visible,
    }
    setLinks((prev) => [...prev, link])
  }

  /* --------------------------------- edits ---------------------------------- */

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setLinks([])
    setPageIndex(0)
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
    setLinks([])
    setPageIndex(0)
  }

  const run = async () => {
    if (!file || busy) return
    if (links.length === 0) {
      toast.error(t('pdfErrNoEdits'))
      return
    }
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const blob = await addLinkAnnotations(file, links)
      setResults([{ name: resultName(file.name, '-links', 'pdf'), blob }])
      toast.success(t('pdfLinkDone'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------- UI ----------------------------------- */

  return (
    <ToolShell icon={<Link2 />} title={t('toolPdfHyperlink')} desc={t('toolPdfHyperlinkDesc')}>
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
          <div className="relative mx-auto w-fit max-w-full">
            <canvas
              ref={previewRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                startRef.current = null
                setDrag(null)
              }}
              className="block h-auto max-h-[70dvh] w-auto max-w-full cursor-crosshair touch-none rounded-lg border bg-white shadow-sm"
              aria-label={t('preview')}
            />
            {/* Committed hotspots on the current page */}
            {links.map((l) =>
              l.pageIndex === pageIndex ? (
                <div
                  key={l.id}
                  className={`pointer-events-none absolute rounded-sm border-2 border-dashed bg-primary/10 ${
                    l.visible ? 'border-primary' : 'border-primary/50'
                  }`}
                  style={{
                    left: `${(l.rect.x1 / metaRef.current.width) * 100}%`,
                    top: `${(1 - l.rect.y2 / metaRef.current.height) * 100}%`,
                    width: `${((l.rect.x2 - l.rect.x1) / metaRef.current.width) * 100}%`,
                    height: `${((l.rect.y2 - l.rect.y1) / metaRef.current.height) * 100}%`,
                  }}
                  aria-hidden
                />
              ) : null
            )}
            {/* Rectangle currently being dragged */}
            {drag && (
              <div
                className="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary bg-primary/15"
                style={{
                  left: `${Math.min(drag.x1, drag.x2) * 100}%`,
                  top: `${Math.min(drag.y1, drag.y2) * 100}%`,
                  width: `${Math.abs(drag.x2 - drag.x1) * 100}%`,
                  height: `${Math.abs(drag.y2 - drag.y1) * 100}%`,
                }}
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
          <p className="text-center text-xs text-muted-foreground">{t('pdfLinkDragHint')}</p>

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
        <ToolOptionsCard title={t('pdfLinkMode')}>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as LinkMode)}
            className="gap-3"
          >
            {(
              [
                ['external', 'pdfLinkExternal'],
                ['internal', 'pdfLinkInternal'],
              ] as Array<[LinkMode, string]>
            ).map(([value, key]) => (
              <Label
                key={value}
                htmlFor={`pdf-link-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`pdf-link-${value}`} value={value} />
                {t(key)}
              </Label>
            ))}
          </RadioGroup>

          {mode === 'external' ? (
            <ToolField label={t('pdfLinkUrl')}>
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="h-11"
              />
            </ToolField>
          ) : (
            <ToolField label={t('pdfLinkTarget')} hint={t('pdfLinkTargetHint')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={pageCount}
                value={targetPage}
                onChange={(e) => setTargetPage(e.target.value)}
                className="h-11"
              />
            </ToolField>
          )}

          <Label
            htmlFor="pdf-link-border"
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal"
          >
            <Checkbox
              id="pdf-link-border"
              checked={visible}
              onCheckedChange={(v) => setVisible(v === true)}
            />
            {t('pdfLinkBorder')}
          </Label>
        </ToolOptionsCard>
      )}

      {file && links.length > 0 && (
        <ToolOptionsCard title={`${t('pdfLinkList')} (${links.length})`}>
          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 [scrollbar-width:thin]">
            {links.map((l, i) => (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {l.mode === 'external' ? l.url : tf('pdfLinkToPage', { n: (l.targetPage ?? 0) + 1 })}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {tf('pdfPageN', { n: l.pageIndex + 1 })}
                </span>
                <button
                  type="button"
                  aria-label={t('toolRemoveFile')}
                  onClick={() => setLinks((prev) => prev.filter((x) => x.id !== l.id))}
                  className="rounded-full px-2 py-0.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-10 flex-1 gap-2"
              onClick={() => setLinks((prev) => prev.slice(0, -1))}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              {t('pdfEditUndoLast')}
            </Button>
            <Button variant="outline" className="h-10 flex-1" onClick={() => setLinks([])}>
              {t('pdfEditClearAll')}
            </Button>
          </div>
        </ToolOptionsCard>
      )}

      {file && (
        <ToolRunButton onClick={() => void run()} busy={busy} disabled={links.length === 0}>
          {t('toolRun')}
        </ToolRunButton>
      )}

      {file && <p className="text-xs text-muted-foreground">{t('pdfEditPreviewNote')}</p>}

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
