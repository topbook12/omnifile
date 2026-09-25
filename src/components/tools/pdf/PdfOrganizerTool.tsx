'use client'

/**
 * PDF Page Organizer (Task 2-b) — the flagship page-management panel.
 *
 * Drop a PDF → pdf.js thumbnails (progress) → a sortable card grid
 * (@dnd-kit, whole card = drag handle). Per-card buttons rotate (+90°),
 * remove and insert a blank page; toolbar shows the count, adds a blank
 * at the end and resets. Save builds the new document via organizePdf.
 *
 * Object URLs of thumbnails are revoked on reset / new file / unmount.
 */

import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FilePlus, FileStack, RefreshCcw, RotateCw, X } from 'lucide-react'
import { toast } from 'sonner'

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
import { resultName } from '@/lib/tools/batch'
import {
  errMessage,
  organizePdf,
  renderThumbnails,
  type OrganizerPlanItem,
  type PageThumbnail,
} from '@/lib/tools/pdf-pages'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

/* Panel-side plan item: lib fields + drag id + thumbnail data. */
type PlanItem =
  | {
      id: string
      kind: 'page'
      srcIndex: number
      rotation: 0 | 90 | 180 | 270
      url: string
      width: number
      height: number
    }
  | { id: string; kind: 'blank'; size: [number, number] }

const A4_W = 595.28
const A4_H = 841.89

/** Blank page size matches the aspect of the nearest page card (A4 width). */
function blankSizeNear(plan: PlanItem[], id: string | null): [number, number] {
  const idx = id === null ? plan.length : plan.findIndex((p) => p.id === id)
  const candidates = [...plan.slice(0, Math.max(0, idx)).reverse(), ...plan.slice(idx + 1)]
  for (const c of candidates) {
    if (c.kind === 'page' && c.width > 0 && c.height > 0) {
      return [A4_W, Math.round((A4_W * c.height) / c.width * 100) / 100]
    }
  }
  return [A4_W, A4_H]
}

export default function PdfOrganizerTool() {
  const { t, tf } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [busy, setBusy] = useState(false) // rendering thumbnails
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [renderTotal, setRenderTotal] = useState(0)
  const [thumbsLen, setThumbsLen] = useState(0)
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const thumbsRef = useRef<PageThumbnail[]>([])
  const reqRef = useRef(0)
  const blankIdRef = useRef(0)

  /* Revoke every thumbnail object URL when the panel unmounts. */
  useEffect(() => {
    const thumbs = thumbsRef
    return () => {
      for (const th of thumbs.current) URL.revokeObjectURL(th.url)
    }
  }, [])

  const revokeThumbs = () => {
    for (const th of thumbsRef.current) URL.revokeObjectURL(th.url)
    thumbsRef.current = []
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const loadThumbs = async (f: File) => {
    const reqId = ++reqRef.current
    setBusy(true)
    setProgress(0)
    setProgressLabel(t('pdfOrgRendering'))
    setRenderTotal(0)
    try {
      const thumbs = await renderThumbnails(f, {
        onProgress: (done, total, realTotal) => {
          if (reqRef.current !== reqId) return
          setProgress(total > 0 ? done / total : 1)
          setProgressLabel(`${t('pdfOrgRendering')} ${done}/${total}`)
          setRenderTotal(realTotal)
        },
      })
      if (reqRef.current !== reqId) {
        for (const th of thumbs) URL.revokeObjectURL(th.url)
        return
      }
      thumbsRef.current = thumbs
      setThumbsLen(thumbs.length)
      setPlan(
        thumbs.map((th) => ({
          id: `p${th.index}`,
          kind: 'page' as const,
          srcIndex: th.index,
          rotation: 0 as const,
          url: th.url,
          width: th.width,
          height: th.height,
        }))
      )
    } catch (err) {
      if (reqRef.current !== reqId) return
      toast.error(errMessage(err, t))
      setFile(null)
    } finally {
      if (reqRef.current === reqId) setBusy(false)
    }
  }

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return
    reqRef.current += 1 // invalidate any in-flight render
    revokeThumbs()
    setPlan([])
    setThumbsLen(0)
    setResults([])
    setFailed([])
    const f = incoming[0]!
    setFile(f)
    void loadThumbs(f)
  }

  const removeFile = () => {
    reqRef.current += 1
    revokeThumbs()
    setFile(null)
    setPlan([])
    setThumbsLen(0)
    setResults([])
    setFailed([])
  }

  const resetPlan = () => {
    setResults([])
    setFailed([])
    setPlan(
      thumbsRef.current.map((th) => ({
        id: `p${th.index}`,
        kind: 'page' as const,
        srcIndex: th.index,
        rotation: 0 as const,
        url: th.url,
        width: th.width,
        height: th.height,
      }))
    )
  }

  const rotateCard = (id: string) => {
    setPlan((items) =>
      items.map((it) =>
        it.id === id && it.kind === 'page'
          ? { ...it, rotation: ((it.rotation + 90) % 360) as 0 | 90 | 180 | 270 }
          : it
      )
    )
  }

  const deleteCard = (id: string) => {
    setPlan((items) => items.filter((it) => it.id !== id))
  }

  const insertBlankAfter = (id: string | null) => {
    setPlan((items) => {
      const size = blankSizeNear(items, id)
      const idx = id === null ? items.length : items.findIndex((p) => p.id === id)
      const at = idx < 0 ? items.length : idx + 1
      blankIdRef.current += 1
      const next = [...items]
      next.splice(at, 0, { id: `b${blankIdRef.current}`, kind: 'blank', size })
      return next
    })
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setPlan((items) => {
      const from = items.findIndex((it) => it.id === active.id)
      const to = items.findIndex((it) => it.id === over.id)
      return from < 0 || to < 0 ? items : arrayMove(items, from, to)
    })
  }

  const pageCount = plan.filter((it) => it.kind === 'page').length
  const capped = renderTotal > 0 && thumbsLen > 0 && renderTotal > thumbsLen

  const save = async () => {
    if (!file || saving || busy) return
    setSaving(true)
    setResults([])
    setFailed([])
    try {
      const planArg: OrganizerPlanItem[] = plan.map((it) =>
        it.kind === 'page'
          ? { kind: 'page', srcIndex: it.srcIndex, rotation: it.rotation }
          : { kind: 'blank', size: it.size }
      )
      const blob = await organizePdf(file, planArg)
      setResults([{ name: resultName(file.name, '-organized', 'pdf'), blob }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ToolShell icon={<FileStack />} title={t('toolPdfOrganizer')} desc={t('toolPdfOrganizerDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="application/pdf"
        multiple={false}
        files={file ? [file] : []}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy || saving}
      />

      {busy && <ToolProgressBar value={progress} label={progressLabel} />}

      {plan.length > 0 && (
        <div className="space-y-2">
          {capped && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {tf('pdfPagesThumbCap', { n: thumbsLen })}
            </p>
          )}
          <div className="max-h-[34rem] overflow-y-auto rounded-xl border bg-muted/20 p-2 [scrollbar-width:thin]">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={plan.map((it) => it.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {plan.map((item) => (
                    <PlanCard
                      key={item.id}
                      item={item}
                      pageLabel={item.kind === 'page' ? tf('pdfPageN', { n: item.srcIndex + 1 }) : ''}
                      labels={{
                        rotate: t('pdfOrgRotate'),
                        remove: t('pdfOrgDelete'),
                        insert: t('pdfOrgInsert'),
                        blank: t('pdfOrgBlank'),
                      }}
                      onRotate={rotateCard}
                      onDelete={deleteCard}
                      onInsert={insertBlankAfter}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      <ToolOptionsCard>
        <p className="text-xs text-muted-foreground">{t('pdfOrgHint')}</p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {tf('pdfOrgCount', { n: pageCount })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={busy || saving}
            onClick={() => insertBlankAfter(null)}
          >
            <FilePlus className="h-3.5 w-3.5" aria-hidden />
            {t('pdfOrgAddBlankEnd')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={busy || saving || plan.length === 0}
            onClick={resetPlan}
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            {t('pdfOrgReset')}
          </Button>
        </div>

        <ToolRunButton
          onClick={() => void save()}
          busy={saving}
          disabled={!file || busy || pageCount === 0}
        >
          {t('pdfOrgSave')}
        </ToolRunButton>
        {saving && <ToolProgressBar value={0.5} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}

/* -------------------------------- plan card -------------------------------- */

function PlanCard({
  item,
  pageLabel,
  labels,
  onRotate,
  onDelete,
  onInsert,
}: {
  item: PlanItem
  pageLabel: string
  labels: { rotate: string; remove: string; insert: string; blank: string }
  onRotate: (id: string) => void
  onDelete: (id: string) => void
  onInsert: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex touch-none select-none flex-col gap-1.5 rounded-xl border bg-card p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isDragging ? 'z-10 border-primary opacity-40 shadow-lg' : 'cursor-grab hover:border-primary/50'
      } active:cursor-grabbing`}
    >
      {item.kind === 'page' ? (
        <div className="relative overflow-hidden rounded-lg border bg-white">
          <img
            src={item.url}
            alt={pageLabel}
            draggable={false}
            className="h-auto w-full"
          />
          {item.rotation !== 0 && (
            <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {item.rotation}°
            </span>
          )}
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs text-muted-foreground">
          <FilePlus className="h-4 w-4" aria-hidden />
          {labels.blank}
        </div>
      )}

      <div className="flex items-center justify-center gap-1">
        {item.kind === 'page' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={labels.rotate}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRotate(item.id)}
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:text-destructive"
          aria-label={labels.remove}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(item.id)}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={labels.insert}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onInsert(item.id)}
        >
          <FilePlus className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
