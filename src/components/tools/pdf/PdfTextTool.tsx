'use client'

/**
 * Add text to PDF — pick a page (pdf.js preview + nav), type the text, choose
 * font/size/colour, then tap the page to drop a text block. Multiple blocks
 * are supported; "Process" burns them into the PDF with @cantoo/pdf-lib.
 *
 * Latin text becomes real, selectable text; non-Latin (Bengali…) is stamped
 * as a transparent PNG rendered by the browser fonts (see pdf-edit.ts).
 * Everything happens on-device.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Type, Undo2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import {
  addTextBlocks,
  renderPageToCanvas,
  type EditTextBlock,
  type EditTextFont,
} from '@/lib/tools/pdf-edit'
import { errMessage, resultName } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

const PREVIEW_W = 600

const FONTS: Array<[EditTextFont, string]> = [
  ['helvetica', 'pdfEditFontHelv'],
  ['helveticaBold', 'pdfEditFontHelvBold'],
  ['timesRoman', 'pdfEditFontTimes'],
  ['timesRomanBold', 'pdfEditFontTimesBold'],
  ['courier', 'pdfEditFontCourier'],
  ['courierOblique', 'pdfEditFontCourierOblique'],
]

type PlacedBlock = EditTextBlock & { id: number }

export default function PdfTextTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [text, setText] = useState('')
  const [font, setFont] = useState<EditTextFont>('helvetica')
  const [size, setSize] = useState(18)
  const [color, setColor] = useState('#111111')
  const [blocks, setBlocks] = useState<PlacedBlock[]>([])
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const previewRef = useRef<HTMLCanvasElement>(null)
  /* Geometry of the currently rendered preview (PDF points + preview scale). */
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

  /* -------------------------------- edits ---------------------------------- */

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setBlocks([])
    setPageIndex(0)
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
    setBlocks([])
    setPageIndex(0)
  }

  /** Click → canvas px → PDF points (y-up). The click is the block's top-left. */
  const onPreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { scale, width, height } = metaRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = ((e.clientX - rect.left) * e.currentTarget.width) / rect.width
    const clickY = ((e.clientY - rect.top) * e.currentTarget.height) / rect.height
    const pdfX = clickX / scale
    const pdfY = (e.currentTarget.height - clickY) / scale
    if (text.trim().length === 0) {
      toast.error(t('pdfEditNoText'))
      return
    }
    setBlocks((prev) => [
      ...prev,
      {
        id: nextId.current++,
        pageIndex,
        x: Math.min(Math.max(0, pdfX), width),
        y: Math.min(Math.max(0, pdfY), height),
        text,
        font,
        size,
        color,
      },
    ])
  }

  const run = async () => {
    if (!file || busy) return
    if (blocks.length === 0) {
      toast.error(t('pdfErrNoEdits'))
      return
    }
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const blob = await addTextBlocks(file, blocks)
      setResults([{ name: resultName(file.name, '-text', 'pdf'), blob }])
      toast.success(t('pdfEditDone'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------- UI ----------------------------------- */

  return (
    <ToolShell icon={<Type />} title={t('toolPdfAddText')} desc={t('toolPdfAddTextDesc')}>
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
              onClick={onPreviewClick}
              className="block h-auto max-h-[70dvh] w-auto max-w-full cursor-crosshair rounded-lg border bg-white shadow-sm"
              style={{ touchAction: 'manipulation' }}
              aria-label={t('preview')}
            />
            {blocks.map((b, i) =>
              b.pageIndex === pageIndex ? (
                <div
                  key={b.id}
                  className="pointer-events-none absolute -translate-y-full rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground shadow"
                  style={{
                    left: `${(b.x / metaRef.current.width) * 100}%`,
                    top: `${(1 - b.y / metaRef.current.height) * 100}%`,
                  }}
                  aria-hidden
                >
                  {i + 1}
                </div>
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
          <p className="text-center text-xs text-muted-foreground">{t('pdfEditTextHint')}</p>

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
        <ToolOptionsCard title={t('pdfEditText')}>
          <ToolField label={t('pdfEditText')}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('pdfEditTextPlaceholder')}
              rows={3}
              className="min-h-11 resize-y"
            />
          </ToolField>

          <div className="grid gap-4 sm:grid-cols-2">
            <ToolField label={t('pdfEditFont')}>
              <Select value={font} onValueChange={(v) => setFont(v as EditTextFont)}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map(([value, key]) => (
                    <SelectItem key={value} value={value}>
                      {t(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ToolField>
            <ToolField label={t('pdfEditColor')}>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 cursor-pointer p-1"
                aria-label={t('pdfEditColor')}
              />
            </ToolField>
          </div>

          <ToolField label={`${t('pdfEditSize')}: ${size} pt`}>
            <Slider
              value={[size]}
              min={8}
              max={72}
              step={1}
              onValueChange={(v) => setSize(v[0] ?? 18)}
              aria-label={t('pdfEditSize')}
            />
          </ToolField>
        </ToolOptionsCard>
      )}

      {file && blocks.length > 0 && (
        <ToolOptionsCard title={`${t('pdfEditBlocks')} (${blocks.length})`}>
          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 [scrollbar-width:thin]">
            {blocks.map((b, i) => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {b.text.split('\n')[0] || t('pdfEditBlockEmpty')}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {tf('pdfPageN', { n: b.pageIndex + 1 })}
                </span>
                <button
                  type="button"
                  aria-label={t('toolRemoveFile')}
                  onClick={() => setBlocks((prev) => prev.filter((x) => x.id !== b.id))}
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
              onClick={() => setBlocks((prev) => prev.slice(0, -1))}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              {t('pdfEditUndoLast')}
            </Button>
            <Button
              variant="outline"
              className="h-10 flex-1"
              onClick={() => setBlocks([])}
            >
              {t('pdfEditClearAll')}
            </Button>
          </div>
        </ToolOptionsCard>
      )}

      {file && (
        <ToolRunButton onClick={() => void run()} busy={busy} disabled={blocks.length === 0}>
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
