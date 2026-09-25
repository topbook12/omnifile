'use client'

/**
 * Form builder — draw rectangles on a rendered page preview and turn them
 * into real, fillable AcroForm fields (text, multiline text, checkbox,
 * radio option, dropdown, push button) via @cantoo/pdf-lib.
 * The PDF itself is never uploaded; the preview is rendered with pdf.js.
 *
 * Coordinate handling: the preview is rendered at scale S over the page
 * viewport; drag positions (screen px) are converted to PDF points with the
 * page BOTTOM as origin, matching pdf-lib's addToPage bounds.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlignLeft,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleDot,
  FormInput,
  RectangleHorizontal,
  Trash2,
  Type,
} from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { buildForm, type FormPlacement } from '@/lib/tools/pdf-forms'
import {
  closePdfDoc,
  errMessage,
  pdfjsDoc,
  renderPdfPage,
  resultName,
} from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

type FormKind = FormPlacement['kind']

const PREVIEW_TARGET_W = 760
const MIN_SIZE_PT = 8

interface KindMeta {
  value: FormKind
  labelKey: string
  icon: ReactNode
  /** Auto-suggested name prefix for this kind. */
  defaultName: string
}

const KINDS: KindMeta[] = [
  { value: 'text', labelKey: 'pdfFormKindText', icon: <Type className="h-4 w-4" aria-hidden />, defaultName: 'text' },
  { value: 'multiline', labelKey: 'pdfFormKindMultiline', icon: <AlignLeft className="h-4 w-4" aria-hidden />, defaultName: 'notes' },
  { value: 'checkbox', labelKey: 'pdfFormKindCheckbox', icon: <CheckSquare className="h-4 w-4" aria-hidden />, defaultName: 'agree' },
  { value: 'radio', labelKey: 'pdfFormKindRadio', icon: <CircleDot className="h-4 w-4" aria-hidden />, defaultName: 'choice' },
  { value: 'dropdown', labelKey: 'pdfFormKindDropdown', icon: <ChevronsUpDown className="h-4 w-4" aria-hidden />, defaultName: 'select' },
  { value: 'button', labelKey: 'pdfFormKindButton', icon: <RectangleHorizontal className="h-4 w-4" aria-hidden />, defaultName: 'submit' },
]

/** Drag rectangle in PDF points, y measured from the TOP of the preview. */
interface DragRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export default function PdfFormBuilderTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [pageCount, setPageCount] = useState(1)
  const [pageIndex, setPageIndex] = useState(0)
  const [previewBusy, setPreviewBusy] = useState(false)

  const [kind, setKind] = useState<FormKind>('text')
  const [name, setName] = useState('text_1')
  const [nameTouched, setNameTouched] = useState(false)
  const [defaultValue, setDefaultValue] = useState('')
  const [dropdownOptions, setDropdownOptions] = useState('')
  const [radioValue, setRadioValue] = useState('')
  const [buttonLabel, setButtonLabel] = useState('')

  const [placements, setPlacements] = useState<FormPlacement[]>([])
  const [drag, setDrag] = useState<DragRect | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const docRef = useRef<Awaited<ReturnType<typeof pdfjsDoc>> | null>(null)
  const docFileRef = useRef<File | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Render scale + page size in points (updated on every preview render). */
  const geoRef = useRef({ scale: 1, pageW: 595, pageH: 842 })
  const draggingRef = useRef(false)
  const dragRef = useRef<DragRect | null>(null)
  const idRef = useRef(0)
  const radioOptionRef = useRef(0)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const file = files[0] ?? null
  const kindMeta = KINDS.find((k) => k.value === kind) ?? KINDS[0]!

  /* ------------------------------- preview -------------------------------- */

  useEffect(() => {
    return () => {
      if (docRef.current) void closePdfDoc(docRef.current)
      docRef.current = null
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    }
  }, [])

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
          setPageIndex(0)
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
        const vis = canvasRef.current
        if (vis) {
          vis.width = offscreen.width
          vis.height = offscreen.height
          vis.getContext('2d')?.drawImage(offscreen, 0, 0)
        }
        offscreen.width = 0
        geoRef.current = {
          scale,
          pageW: base.width,
          pageH: base.height,
        }
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

  /* ---------------------------- file management ---------------------------- */

  const resetState = () => {
    setPlacements([])
    setDrag(null)
    setResults([])
    setFailed([])
    setPageIndex(0)
  }

  const addFiles = (incoming: File[]) => {
    setNameTouched(false)
    setName('text_1')
    resetState()
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    resetState()
  }

  /* ------------------------- drag-to-place on preview ----------------------- */

  const ptFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const { scale, pageW, pageH } = geoRef.current
    const r = canvas.getBoundingClientRect()
    const x = ((e.clientX - r.left) * (canvas.width / r.width)) / scale
    const yTop = ((e.clientY - r.top) * (canvas.height / r.height)) / scale
    return {
      x: Math.min(Math.max(0, x), pageW),
      y: Math.min(Math.max(0, yTop), pageH),
    }
  }

  const onDragStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!file || previewBusy) return
    e.preventDefault()
    const pt = ptFromEvent(e)
    const rect = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }
    draggingRef.current = true
    dragRef.current = rect
    setDrag(rect)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  const onDragMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    e.preventDefault()
    const pt = ptFromEvent(e)
    const rect = { ...(dragRef.current ?? { x0: pt.x, y0: pt.y }), x1: pt.x, y1: pt.y }
    dragRef.current = rect
    setDrag(rect)
  }

  const suggestName = (target: FormKind) => {
    const meta = KINDS.find((k) => k.value === target) ?? KINDS[0]!
    const count = placements.filter((p) => p.kind === target).length + 1
    return `${meta.defaultName}_${count}`
  }

  const onDragEnd = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d || !file) return

    const w = Math.abs(d.x1 - d.x0)
    const h = Math.abs(d.y1 - d.y0)
    if (w < MIN_SIZE_PT || h < MIN_SIZE_PT) {
      toast.error(t('pdfFormDragHint'))
      return
    }

    const fieldName = name.trim()
    if (!fieldName) {
      toast.error(t('pdfErrFieldName'))
      return
    }

    const { pageH } = geoRef.current
    const trimmedOptions = dropdownOptions
      .split(/[,\n]/)
      .map((o) => o.trim())
      .filter(Boolean)

    if (kind === 'dropdown' && trimmedOptions.length === 0) {
      toast.error(t('pdfErrFieldOptions'))
      return
    }

    const placement: FormPlacement = {
      id: `f${++idRef.current}`,
      pageIndex,
      kind,
      name: fieldName,
      rect: { x: Math.min(d.x0, d.x1), y: 0, w, h: h },
      options: kind === 'dropdown' ? trimmedOptions : undefined,
      initialValue: kind === 'text' || kind === 'multiline' ? defaultValue.trim() || undefined : undefined,
      label: kind === 'button' ? buttonLabel.trim() || fieldName : undefined,
    }
    // y from the BOTTOM of the page (pdf-lib convention)
    placement.rect.y = pageH - Math.max(d.y0, d.y1)

    if (kind === 'radio') {
      const option = radioValue.trim() || `option_${++radioOptionRef.current}`
      placement.options = [option]
    }

    setPlacements((prev) => [...prev, placement])
    if (!nameTouched) setName(suggestName(kind))
  }

  const flashPlacement = (id: string) => {
    setHighlightId(id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1300)
  }

  const removePlacement = (id: string) => {
    setPlacements((prev) => prev.filter((p) => p.id !== id))
  }

  /* ---------------------------------- run ---------------------------------- */

  const run = async () => {
    if (!file || busy || placements.length === 0) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const blob = await buildForm(file, placements)
      setResults([{ name: resultName(file.name, '-form', 'pdf'), blob }])
      toast.success(t('pdfFormBuildDone'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ----------------------------------- UI ---------------------------------- */

  const rectStyle = (r: { x: number; y: number; w: number; h: number }) => {
    const { pageW, pageH } = geoRef.current
    return {
      left: `${(r.x / pageW) * 100}%`,
      top: `${((pageH - r.y - r.h) / pageH) * 100}%`,
      width: `${(r.w / pageW) * 100}%`,
      height: `${(r.h / pageH) * 100}%`,
    }
  }

  return (
    <ToolShell icon={<FormInput />} title={t('toolPdfFormBuilder')} desc={t('toolPdfFormFillable')}>
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
          {/* Page preview with drag-to-place + field overlays */}
          <div className="relative mx-auto w-fit max-w-full">
            <canvas
              ref={canvasRef}
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              className="block h-auto max-h-[70dvh] w-auto max-w-full cursor-crosshair rounded-lg border bg-white shadow-sm"
              style={{ touchAction: 'none' }}
              aria-label={t('preview')}
            />

            {/* Already-placed fields on this page */}
            {placements
              .filter((p) => p.pageIndex === pageIndex)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => flashPlacement(p.id)}
                  className={`absolute overflow-hidden border-2 border-dashed border-primary bg-primary/10 transition-shadow hover:bg-primary/20 ${
                    highlightId === p.id ? 'animate-pulse ring-2 ring-primary' : ''
                  }`}
                  style={rectStyle(p.rect)}
                  aria-label={p.name}
                >
                  <span className="block max-w-full truncate bg-primary px-1 text-left text-[10px] leading-4 text-primary-foreground">
                    {p.kind === 'radio' && p.options?.[0] ? `${p.name}: ${p.options[0]}` : p.name}
                  </span>
                </button>
              ))}

            {/* Live drag rectangle */}
            {drag && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/20"
                style={rectStyle({
                  x: Math.min(drag.x0, drag.x1),
                  y: geoRef.current.pageH - Math.max(drag.y0, drag.y1),
                  w: Math.abs(drag.x1 - drag.x0),
                  h: Math.abs(drag.y1 - drag.y0),
                })}
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
          <p className="text-center text-xs text-muted-foreground">{t('pdfFormDragHint')}</p>

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

      <ToolOptionsCard title={t('pdfFormPalette')}>
        <RadioGroup
          value={kind}
          onValueChange={(v) => {
            const next = v as FormKind
            setKind(next)
            if (!nameTouched) setName(suggestName(next))
          }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {KINDS.map((meta) => (
            <Label
              key={meta.value}
              htmlFor={`pdf-form-kind-${meta.value}`}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-form-kind-${meta.value}`} value={meta.value} />
              <span className="flex min-w-0 items-center gap-1.5">
                {meta.icon}
                <span className="truncate">{t(meta.labelKey)}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        <ToolField
          label={kind === 'radio' ? t('pdfFormRadioGroup') : t('pdfFormFieldName')}
          hint={t('pdfFormFieldNameHint')}
        >
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
            }}
            className="h-11"
          />
        </ToolField>

        {kind === 'radio' && (
          <ToolField label={t('pdfFormRadioValue')}>
            <Input
              value={radioValue}
              onChange={(e) => setRadioValue(e.target.value)}
              placeholder="yes"
              className="h-11"
            />
          </ToolField>
        )}

        {kind === 'dropdown' && (
          <ToolField label={t('pdfFormOptions')}>
            <Textarea
              value={dropdownOptions}
              onChange={(e) => setDropdownOptions(e.target.value)}
              rows={3}
              placeholder="Dhaka, Chattogram, Khulna"
            />
          </ToolField>
        )}

        {(kind === 'text' || kind === 'multiline') && (
          <ToolField label={`${t('pdfFormDefaultValue')} (${t('pdfFormKindText').toLowerCase()})`}>
            <Input
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              className="h-11"
            />
          </ToolField>
        )}

        {kind === 'button' && (
          <ToolField label={t('pdfFormBtnLabel')}>
            <Input
              value={buttonLabel}
              onChange={(e) => setButtonLabel(e.target.value)}
              className="h-11"
            />
          </ToolField>
        )}

        <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <FormInput className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('pdfFormNote')}
        </p>
        <p className="text-xs text-muted-foreground">{t('pdfFormLatinHint')}</p>
      </ToolOptionsCard>

      {placements.length > 0 && (
        <ToolOptionsCard title={`${t('pdfFormPlacements')} (${placements.length})`}>
          <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 [scrollbar-width:thin]">
            {placements.map((p) => {
              const meta = KINDS.find((k) => k.value === p.kind) ?? KINDS[0]!
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
                >
                  <span className="shrink-0 text-muted-foreground">{meta.icon}</span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:text-primary"
                    onClick={() => {
                      setPageIndex(p.pageIndex)
                      flashPlacement(p.id)
                    }}
                  >
                    {p.name}
                    {p.kind === 'radio' && p.options?.[0] ? ` → ${p.options[0]}` : ''}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {tf('pdfPageN', { n: p.pageIndex + 1 })}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={t('pdfFormRemove')}
                    onClick={() => removePlacement(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              )
            })}
          </div>
        </ToolOptionsCard>
      )}

      {file && (
        <ToolRunButton onClick={() => void run()} busy={busy} disabled={placements.length === 0}>
          {t('toolRun')}
        </ToolRunButton>
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
