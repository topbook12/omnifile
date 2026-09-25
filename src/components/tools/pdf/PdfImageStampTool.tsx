'use client'

/**
 * Add images to PDF — pick a page (pdf.js preview + nav), optionally crop the
 * image with 4 inset sliders (live preview), then tap the page to place it
 * with width / rotation / opacity. Multiple placements are supported; the
 * tap point is the stamp's visual centre (rotation-safe, see pdf-edit.ts).
 * Everything happens on-device.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, Undo2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useI18n } from '@/lib/i18n'
import {
  addImageStamps,
  decodeImageBlob,
  renderPageToCanvas,
  type ImageCropPct,
  type ImageStamp,
} from '@/lib/tools/pdf-edit'
import { errMessage, resultName } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

const PREVIEW_W = 600
const CROP_PREVIEW_W = 220

const ROTATIONS: Array<[ImageStamp['rotation'], string]> = [
  [0, 'pdfStampRot0'],
  [90, 'pdfStampRot90'],
  [180, 'pdfStampRot180'],
  [270, 'pdfStampRot270'],
]

const NO_CROP: ImageCropPct = { left: 0, right: 0, top: 0, bottom: 0 }

type PlacedStamp = ImageStamp & { id: number; crop: ImageCropPct }

export default function PdfImageStampTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [crop, setCrop] = useState<ImageCropPct>(NO_CROP)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [widthPct, setWidthPct] = useState(30)
  const [rotation, setRotation] = useState<ImageStamp['rotation']>(0)
  const [opacity, setOpacity] = useState(1)
  const [stamps, setStamps] = useState<PlacedStamp[]>([])
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const previewRef = useRef<HTMLCanvasElement>(null)
  const cropPreviewRef = useRef<HTMLCanvasElement>(null)
  const metaRef = useRef({ scale: 1, width: 1, height: 1 })
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

  /* --------------------------- crop preview (image) ------------------------- */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!imageFile) {
        const canvas = cropPreviewRef.current
        if (canvas) {
          canvas.width = 0
          canvas.height = 0
        }
        return
      }
      try {
        const bmp = await decodeImageBlob(imageFile)
        if (cancelled) return
        const canvas = cropPreviewRef.current
        if (!canvas) return
        const sx = (bmp.width * crop.left) / 100
        const sy = (bmp.height * crop.top) / 100
        const sw = Math.max(1, (bmp.width * (100 - crop.left - crop.right)) / 100)
        const sh = Math.max(1, (bmp.height * (100 - crop.top - crop.bottom)) / 100)
        const scale = Math.min(1, CROP_PREVIEW_W / sw)
        canvas.width = Math.max(1, Math.round(sw * scale))
        canvas.height = Math.max(1, Math.round(sh * scale))
        canvas
          .getContext('2d')
          ?.drawImage(bmp as CanvasImageSource, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        if ('close' in bmp) bmp.close()
      } catch {
        /* preview only — addImageStamps reports decode errors on run */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [imageFile, crop])

  /* --------------------------------- edits ---------------------------------- */

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setStamps([])
    setPageIndex(0)
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
    setStamps([])
    setPageIndex(0)
  }
  const addImage = (incoming: File[]) => {
    if (incoming.length === 0) return
    setImageFile(incoming[0]!)
    setCrop(NO_CROP)
  }

  /** Click → normalised coords (0..1, y from top). The click is the centre. */
  const onPreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageFile) {
      toast.error(t('pdfStampPickFirst'))
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const xNorm = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const yNorm = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setStamps((prev) => [
      ...prev,
      {
        id: nextId.current++,
        pageIndex,
        xNorm,
        yNorm,
        widthPct,
        rotation,
        opacity,
        crop: { ...crop },
      },
    ])
  }

  const run = async () => {
    if (!file || busy) return
    if (!imageFile) {
      toast.error(t('pdfStampPickFirst'))
      return
    }
    if (stamps.length === 0) {
      toast.error(t('pdfErrNoEdits'))
      return
    }
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const blob = await addImageStamps(file, imageFile, stamps)
      setResults([{ name: resultName(file.name, '-images', 'pdf'), blob }])
      toast.success(t('pdfStampDone'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------- UI ----------------------------------- */

  const setCropSide = (side: keyof ImageCropPct) => (v: number[]) =>
    setCrop((prev) => ({ ...prev, [side]: v[0] ?? 0 }))

  return (
    <ToolShell icon={<ImageIcon />} title={t('toolPdfAddImage')} desc={t('toolPdfAddImageDesc')}>
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

      <ToolOptionsCard title={t('pdfStampPick')}>
        <ToolDropzone
          accept="image/*"
          multiple={false}
          files={imageFile ? [imageFile] : []}
          onFiles={addImage}
          onRemove={() => setImageFile(null)}
          disabled={busy}
        />

        {imageFile && (
          <>
            <ToolField label={t('pdfStampCrop')} hint="0 – 45 %">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('pdfStampCropLeft')}</p>
                  <Slider
                    value={[crop.left]}
                    min={0}
                    max={45}
                    step={1}
                    onValueChange={setCropSide('left')}
                    aria-label={t('pdfStampCropLeft')}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('pdfStampCropRight')}</p>
                  <Slider
                    value={[crop.right]}
                    min={0}
                    max={45}
                    step={1}
                    onValueChange={setCropSide('right')}
                    aria-label={t('pdfStampCropRight')}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('pdfStampCropTop')}</p>
                  <Slider
                    value={[crop.top]}
                    min={0}
                    max={45}
                    step={1}
                    onValueChange={setCropSide('top')}
                    aria-label={t('pdfStampCropTop')}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('pdfStampCropBottom')}</p>
                  <Slider
                    value={[crop.bottom]}
                    min={0}
                    max={45}
                    step={1}
                    onValueChange={setCropSide('bottom')}
                    aria-label={t('pdfStampCropBottom')}
                  />
                </div>
              </div>
            </ToolField>

            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
              <div className="flex min-h-16 flex-1 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] p-1">
                <canvas ref={cropPreviewRef} className="max-h-32 max-w-full object-contain" aria-label={t('pdfStampCropPreview')} />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{t('pdfStampCropPreview')}</span>
            </div>
          </>
        )}
      </ToolOptionsCard>

      {file && (
        <ToolOptionsCard title={t('preview')}>
          <div className="relative mx-auto w-fit max-w-full">
            <canvas
              ref={previewRef}
              onClick={onPreviewClick}
              className="block h-auto max-h-[70dvh] w-auto max-w-full cursor-crosshair rounded-lg border bg-white shadow-sm"
              style={{ touchAction: 'manipulation' }}
              aria-label={t('preview')}
            />
            {stamps.map((s) =>
              s.pageIndex === pageIndex ? (
                <div
                  key={s.id}
                  className="pointer-events-none absolute h-6 w-6 rounded-full border-2 border-primary bg-primary/30"
                  style={{
                    left: `${s.xNorm * 100}%`,
                    top: `${s.yNorm * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                  }}
                  aria-hidden
                />
              ) : null
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
          <p className="text-center text-xs text-muted-foreground">{t('pdfStampHint')}</p>

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
        <ToolOptionsCard title={t('pdfStampPlacements')}>
          <ToolField label={`${t('pdfStampWidth')}: ${widthPct}%`}>
            <Slider
              value={[widthPct]}
              min={5}
              max={100}
              step={1}
              onValueChange={(v) => setWidthPct(v[0] ?? 30)}
              aria-label={t('pdfStampWidth')}
            />
          </ToolField>

          <div className="grid gap-4 sm:grid-cols-2">
            <ToolField label={t('pdfStampRotation')}>
              <Select
                value={String(rotation)}
                onValueChange={(v) => setRotation(Number(v) as ImageStamp['rotation'])}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROTATIONS.map(([value, key]) => (
                    <SelectItem key={value} value={String(value)}>
                      {t(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ToolField>
            <ToolField label={`${t('pdfStampOpacity')}: ${Math.round(opacity * 100)}%`}>
              <Slider
                value={[Math.round(opacity * 100)]}
                min={10}
                max={100}
                step={5}
                onValueChange={(v) => setOpacity((v[0] ?? 100) / 100)}
                aria-label={t('pdfStampOpacity')}
              />
            </ToolField>
          </div>

          {stamps.length > 0 && (
            <>
              <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 [scrollbar-width:thin]">
                {stamps.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {t('pdfStampWidth')} {s.widthPct}% · {s.rotation}° ·{' '}
                      {Math.round(s.opacity * 100)}%
                      {[s.crop.left, s.crop.right, s.crop.top, s.crop.bottom].some((v) => v > 0)
                        ? ` · ${t('pdfStampCrop')}`
                        : ''}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {tf('pdfPageN', { n: s.pageIndex + 1 })}
                    </span>
                    <button
                      type="button"
                      aria-label={t('toolRemoveFile')}
                      onClick={() => setStamps((prev) => prev.filter((x) => x.id !== s.id))}
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
                  onClick={() => setStamps((prev) => prev.slice(0, -1))}
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                  {t('pdfEditUndoLast')}
                </Button>
                <Button variant="outline" className="h-10 flex-1" onClick={() => setStamps([])}>
                  {t('pdfEditClearAll')}
                </Button>
              </div>
            </>
          )}
        </ToolOptionsCard>
      )}

      {file && (
        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!imageFile || stamps.length === 0}>
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
