'use client'

/**
 * Watermark PDF — two modes:
 *  ADD    · text watermark (font size 0 = auto-fit, colour, opacity, rotation,
 *           layouts: centre / tile / top / bottom, pages: all or ranges) or
 *           image/logo watermark (width % + opacity). Non-Latin text is
 *           rasterised via the browser fonts (see pdf-edit.ts).
 *  REMOVE · drag boxes over unwanted marks, then either paint opaque cover
 *           rectangles (fast, 'surface') or re-render the pages as images with
 *           the boxes erased (deep, destroys content underneath).
 * Everything happens on-device.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Stamp, Undo2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import {
  addWatermark,
  coverAreas,
  renderPageToCanvas,
  type CoverBox,
  type WatermarkLayout,
} from '@/lib/tools/pdf-edit'
import { errMessage, resultName } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

const PREVIEW_W = 600

type WmMode = 'add' | 'remove'
type WmSource = 'text' | 'image'
type PagesMode = 'all' | 'ranges'
type CoverDepth = 'surface' | 'deep'

/** Drag rectangle in normalised preview coords (0..1, y from the top). */
type NormRect = { x1: number; y1: number; x2: number; y2: number }

type PlacedBox = CoverBox & { id: number }

export default function PdfWatermarkTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [previewBusy, setPreviewBusy] = useState(false)

  const [mode, setMode] = useState<WmMode>('add')
  const [source, setSource] = useState<WmSource>('text')
  const [wmText, setWmText] = useState('')
  const [fontSize, setFontSize] = useState(48)
  const [wmColor, setWmColor] = useState('#808080')
  const [opacity, setOpacity] = useState(0.25)
  const [rotation, setRotation] = useState(-45)
  const [layout, setLayout] = useState<WatermarkLayout>('center')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageWidthPct, setImageWidthPct] = useState(40)
  const [pagesMode, setPagesMode] = useState<PagesMode>('all')
  const [pagesInput, setPagesInput] = useState('')

  const [coverColor, setCoverColor] = useState('#ffffff')
  const [depth, setDepth] = useState<CoverDepth>('surface')
  const [boxes, setBoxes] = useState<PlacedBox[]>([])
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

  /* --------------------------------- edits ---------------------------------- */

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setBoxes([])
    setPageIndex(0)
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
    setBoxes([])
    setPageIndex(0)
  }

  /* ------------------------- drag-to-draw (remove mode) ---------------------- */

  const normPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'remove') return
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
    if (rect.x2 - rect.x1 < 0.01 || rect.y2 - rect.y1 < 0.01) return // accidental tap
    setBoxes((prev) => [
      ...prev,
      {
        id: nextId.current++,
        pageIndex,
        xNorm: rect.x1,
        yNorm: rect.y1,
        wNorm: rect.x2 - rect.x1,
        hNorm: rect.y2 - rect.y1,
      },
    ])
  }

  /* ---------------------------------- run ----------------------------------- */

  const run = async () => {
    if (!file || busy) return
    if (mode === 'add') {
      if (source === 'text' && wmText.trim().length === 0) {
        toast.error(t('pdfErrNoWatermarkText'))
        return
      }
      if (source === 'image' && !imageFile) {
        toast.error(t('pdfWmPickFirst'))
        return
      }
      if (pagesMode === 'ranges' && pagesInput.trim().length === 0) {
        toast.error(t('pdfErrBadRanges'))
        return
      }
    } else if (boxes.length === 0) {
      toast.error(t('pdfErrNoEdits'))
      return
    }

    setBusy(true)
    setResults([])
    setFailed([])
    try {
      if (mode === 'add') {
        const blob = await addWatermark(file, {
          source,
          text: source === 'text' ? wmText : undefined,
          fontSize,
          color: wmColor,
          opacity,
          rotation,
          layout,
          imageFile: source === 'image' && imageFile ? imageFile : undefined,
          imageWidthPct,
          pages: pagesMode === 'ranges' ? pagesInput : undefined,
        })
        setResults([{ name: resultName(file.name, '-watermarked', 'pdf'), blob }])
        toast.success(t('pdfWmDone'))
      } else {
        const blob = await coverAreas(
          file,
          boxes,
          { color: coverColor, deep: depth === 'deep' }
        )
        setResults([{ name: resultName(file.name, '-cleaned', 'pdf'), blob }])
        toast.success(t('pdfCoverDone'))
      }
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------- UI ----------------------------------- */

  const radioRow = (value: string, id: string, i18nKey: string) => (
    <Label
      key={id}
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
    >
      <RadioGroupItem id={id} value={value} />
      {t(i18nKey)}
    </Label>
  )

  return (
    <ToolShell icon={<Stamp />} title={t('toolPdfWatermark')} desc={t('toolPdfWatermarkDesc')}>
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
        <ToolOptionsCard title={t('pdfWmMode')}>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as WmMode)} className="gap-3">
            {(
              [
                ['add', 'pdfWmAdd'],
                ['remove', 'pdfWmRemove'],
              ] as Array<[WmMode, string]>
            ).map(([value, key]) => radioRow(value, `pdf-wm-${value}`, key))}
          </RadioGroup>
        </ToolOptionsCard>
      )}

      {file && (
        <ToolOptionsCard title={mode === 'add' ? t('preview') : t('pdfCoverBoxes')}>
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
              className={`block h-auto max-h-[70dvh] w-auto max-w-full rounded-lg border bg-white shadow-sm ${
                mode === 'remove' ? 'cursor-crosshair touch-none' : ''
              }`}
              aria-label={t('preview')}
            />
            {/* Cover boxes on the current page (remove mode) */}
            {boxes.map((b) =>
              b.pageIndex === pageIndex ? (
                <div
                  key={b.id}
                  className="pointer-events-none absolute border-2 border-dashed border-destructive/70"
                  style={{
                    left: `${b.xNorm * 100}%`,
                    top: `${b.yNorm * 100}%`,
                    width: `${b.wNorm * 100}%`,
                    height: `${b.hNorm * 100}%`,
                    background: coverColor,
                  }}
                  aria-hidden
                />
              ) : null
            )}
            {drag && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-destructive/80"
                style={{
                  left: `${Math.min(drag.x1, drag.x2) * 100}%`,
                  top: `${Math.min(drag.y1, drag.y2) * 100}%`,
                  width: `${Math.abs(drag.x2 - drag.x1) * 100}%`,
                  height: `${Math.abs(drag.y2 - drag.y1) * 100}%`,
                  background: coverColor,
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
          {mode === 'remove' && (
            <p className="text-center text-xs text-muted-foreground">{t('pdfCoverDragHint')}</p>
          )}

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

          {mode === 'remove' && boxes.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-10 flex-1 gap-2"
                onClick={() => setBoxes((prev) => prev.slice(0, -1))}
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                {t('pdfEditUndoLast')}
              </Button>
              <Button variant="outline" className="h-10 flex-1" onClick={() => setBoxes([])}>
                {t('pdfEditClearAll')}
              </Button>
            </div>
          )}
        </ToolOptionsCard>
      )}

      {file && mode === 'add' && (
        <ToolOptionsCard title={t('pdfWmAdd')}>
          <ToolField label={t('pdfWmSource')}>
            <RadioGroup
              value={source}
              onValueChange={(v) => setSource(v as WmSource)}
              className="grid grid-cols-2 gap-3"
            >
              {(
                [
                  ['text', 'pdfWmText'],
                  ['image', 'pdfWmImage'],
                ] as Array<[WmSource, string]>
              ).map(([value, key]) => radioRow(value, `pdf-wm-src-${value}`, key))}
            </RadioGroup>
          </ToolField>

          {source === 'text' ? (
            <>
              <ToolField label={t('pdfWmContent')}>
                <Textarea
                  value={wmText}
                  onChange={(e) => setWmText(e.target.value)}
                  rows={2}
                  className="min-h-11 resize-y"
                  placeholder={t('pdfWmContentPlaceholder')}
                />
              </ToolField>
              <ToolField label={`${t('pdfWmFontSize')}: ${fontSize === 0 ? t('pdfWmAutoShort') : `${fontSize} pt`}`} hint={t('pdfWmAuto')}>
                <Slider
                  value={[fontSize]}
                  min={0}
                  max={120}
                  step={2}
                  onValueChange={(v) => setFontSize(v[0] ?? 48)}
                  aria-label={t('pdfWmFontSize')}
                />
              </ToolField>
              <ToolField label={t('pdfWmColor')}>
                <Input
                  type="color"
                  value={wmColor}
                  onChange={(e) => setWmColor(e.target.value)}
                  className="h-11 cursor-pointer p-1"
                  aria-label={t('pdfWmColor')}
                />
              </ToolField>
            </>
          ) : (
            <>
              <ToolField label={t('pdfWmImagePick')}>
                <ToolDropzone
                  accept="image/*"
                  multiple={false}
                  files={imageFile ? [imageFile] : []}
                  onFiles={(incoming) => setImageFile(incoming[0] ?? null)}
                  onRemove={() => setImageFile(null)}
                  disabled={busy}
                />
              </ToolField>
              <ToolField label={`${t('pdfWmImageWidth')}: ${imageWidthPct}%`}>
                <Slider
                  value={[imageWidthPct]}
                  min={5}
                  max={100}
                  step={1}
                  onValueChange={(v) => setImageWidthPct(v[0] ?? 40)}
                  aria-label={t('pdfWmImageWidth')}
                />
              </ToolField>
            </>
          )}

          <ToolField label={`${t('pdfWmOpacity')}: ${Math.round(opacity * 100)}%`}>
            <Slider
              value={[Math.round(opacity * 100)]}
              min={5}
              max={100}
              step={5}
              onValueChange={(v) => setOpacity((v[0] ?? 25) / 100)}
              aria-label={t('pdfWmOpacity')}
            />
          </ToolField>

          <ToolField label={`${t('pdfWmRotation')}: ${rotation}°`}>
            <Slider
              value={[rotation]}
              min={-90}
              max={90}
              step={5}
              onValueChange={(v) => setRotation(v[0] ?? -45)}
              aria-label={t('pdfWmRotation')}
            />
          </ToolField>

          <ToolField label={t('pdfWmLayout')}>
            <RadioGroup
              value={layout}
              onValueChange={(v) => setLayout(v as WatermarkLayout)}
              className="grid grid-cols-2 gap-3"
            >
              {(
                [
                  ['center', 'pdfWmCenter'],
                  ['tile', 'pdfWmTile'],
                  ['top', 'pdfWmTop'],
                  ['bottom', 'pdfWmBottom'],
                ] as Array<[WatermarkLayout, string]>
              ).map(([value, key]) => radioRow(value, `pdf-wm-layout-${value}`, key))}
            </RadioGroup>
          </ToolField>

          <ToolField label={t('pdfWmPages')}>
            <RadioGroup
              value={pagesMode}
              onValueChange={(v) => setPagesMode(v as PagesMode)}
              className="grid grid-cols-2 gap-3"
            >
              {(
                [
                  ['all', 'pdfWmAll'],
                  ['ranges', 'pdfWmRanges'],
                ] as Array<[PagesMode, string]>
              ).map(([value, key]) => radioRow(value, `pdf-wm-pages-${value}`, key))}
            </RadioGroup>
            {pagesMode === 'ranges' && (
              <div className="space-y-1 pt-1">
                <Input
                  value={pagesInput}
                  onChange={(e) => setPagesInput(e.target.value)}
                  placeholder="1-3, 5, 8-"
                  className="h-11"
                  inputMode="numeric"
                  aria-label={t('pdfWmRangesLabel')}
                />
                <p className="text-xs text-muted-foreground">{t('pdfWmRangesHint')}</p>
              </div>
            )}
          </ToolField>
        </ToolOptionsCard>
      )}

      {file && mode === 'remove' && (
        <ToolOptionsCard title={t('pdfWmRemove')}>
          <ToolField label={t('pdfCoverColor')}>
            <Input
              type="color"
              value={coverColor}
              onChange={(e) => setCoverColor(e.target.value)}
              className="h-11 cursor-pointer p-1"
              aria-label={t('pdfCoverColor')}
            />
          </ToolField>

          <ToolField label={t('pdfCoverDepth')}>
            <RadioGroup
              value={depth}
              onValueChange={(v) => setDepth(v as CoverDepth)}
              className="gap-3"
            >
              {(
                [
                  ['surface', 'pdfCoverSurface'],
                  ['deep', 'pdfCoverDeep'],
                ] as Array<[CoverDepth, string]>
              ).map(([value, key]) => radioRow(value, `pdf-cover-${value}`, key))}
            </RadioGroup>
          </ToolField>

          <p
            className={`flex items-start gap-1.5 rounded-lg p-2.5 text-xs ${
              depth === 'deep'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'bg-muted/50 text-muted-foreground'
            }`}
          >
            {depth === 'deep' ? t('pdfCoverDeepHint') : t('pdfCoverSurfaceHint')}
          </p>

          {boxes.length > 0 && (
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 [scrollbar-width:thin]">
              {boxes.map((b, i) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate tabular-nums">
                    {Math.round(b.wNorm * 100)}×{Math.round(b.hNorm * 100)}%
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {tf('pdfPageN', { n: b.pageIndex + 1 })}
                  </span>
                  <button
                    type="button"
                    aria-label={t('toolRemoveFile')}
                    onClick={() => setBoxes((prev) => prev.filter((x) => x.id !== b.id))}
                    className="rounded-full px-2 py-0.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </ToolOptionsCard>
      )}

      {file && (
        <ToolRunButton
          onClick={() => void run()}
          busy={busy}
          disabled={mode === 'remove' && boxes.length === 0}
        >
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
