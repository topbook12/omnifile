'use client'

/**
 * PDF Extract & Crop (Task 2-b) — pick pages by tapping thumbnails, then
 * pull them into a new PDF. Optional crop margins (pt) inset each page's
 * crop box. 100% on-device via extractPdf (pdf-pages.ts).
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Crop } from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolDropzone,
  ToolField,
  ToolOptionsCard,
  ToolProgressBar,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { Input } from '@/components/ui/input'
import { resultName } from '@/lib/tools/batch'
import { errMessage, extractPdf, renderThumbnails, type PdfCropMargins } from '@/lib/tools/pdf-pages'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

export default function PdfExtractCropTool() {
  const { t, tf } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [thumbs, setThumbs] = useState<{ index: number; url: string; width: number; height: number }[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [renderTotal, setRenderTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Crop margins as strings (empty = 0).
  const [cropTop, setCropTop] = useState('0')
  const [cropRight, setCropRight] = useState('0')
  const [cropBottom, setCropBottom] = useState('0')
  const [cropLeft, setCropLeft] = useState('0')

  const reqRef = useRef(0)
  const urlsRef = useRef<string[]>([])

  /* Keep the current object URLs reachable for the unmount cleanup. */
  useEffect(() => {
    urlsRef.current = thumbs.map((th) => th.url)
  }, [thumbs])

  /* Invalidate in-flight renders and revoke all URLs on unmount. */
  useEffect(() => {
    const req = reqRef
    const urls = urlsRef
    return () => {
      req.current += 1
      for (const u of urls.current) URL.revokeObjectURL(u)
    }
  }, [])

  const revokeThumbs = () => {
    for (const th of thumbs) URL.revokeObjectURL(th.url)
  }

  const loadThumbs = async (f: File) => {
    const reqId = ++reqRef.current
    setBusy(true)
    setProgress(0)
    setProgressLabel(t('pdfOrgRendering'))
    setRenderTotal(0)
    try {
      const rendered = await renderThumbnails(f, {
        onProgress: (done, total, realTotal) => {
          if (reqRef.current !== reqId) return
          setProgress(total > 0 ? done / total : 1)
          setProgressLabel(`${t('pdfOrgRendering')} ${done}/${total}`)
          setRenderTotal(realTotal)
        },
      })
      if (reqRef.current !== reqId) {
        for (const th of rendered) URL.revokeObjectURL(th.url)
        return
      }
      setThumbs(rendered)
      setSelected(new Set(rendered.map((th) => th.index)))
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
    reqRef.current += 1
    revokeThumbs()
    setThumbs([])
    setSelected(new Set())
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
    setThumbs([])
    setSelected(new Set())
    setResults([])
    setFailed([])
  }

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const capped = renderTotal > 0 && thumbs.length > 0 && renderTotal > thumbs.length
  const cropValues: PdfCropMargins = {
    top: Math.max(0, Number(cropTop) || 0),
    right: Math.max(0, Number(cropRight) || 0),
    bottom: Math.max(0, Number(cropBottom) || 0),
    left: Math.max(0, Number(cropLeft) || 0),
  }
  const hasCrop = cropValues.top > 0 || cropValues.right > 0 || cropValues.bottom > 0 || cropValues.left > 0

  const save = async () => {
    if (!file || saving || busy) return
    setSaving(true)
    setResults([])
    setFailed([])
    try {
      const indices = [...selected].sort((a, b) => a - b)
      const blob = await extractPdf(file, indices, hasCrop ? cropValues : undefined)
      setResults([{ name: resultName(file.name, '-extract', 'pdf'), blob }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ToolShell icon={<Crop />} title={t('toolPdfExtract')} desc={t('toolPdfExtractDesc')}>
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

      {thumbs.length > 0 && (
        <div className="space-y-2">
          {capped && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {tf('pdfPagesThumbCap', { n: thumbs.length })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {tf('pdfExtractSelected', { n: selected.size })}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set(thumbs.map((th) => th.index)))}
            >
              {t('pdfExtractAll')}
            </button>
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              {t('pdfExtractNone')}
            </button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
              {t('pdfExtractSelectHint')}
            </span>
          </div>

          <div className="max-h-[30rem] overflow-y-auto rounded-xl border bg-muted/20 p-2 [scrollbar-width:thin]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {thumbs.map((th) => {
                const isOn = selected.has(th.index)
                return (
                  <button
                    key={th.index}
                    type="button"
                    aria-pressed={isOn}
                    aria-label={`${tf('pdfPageN', { n: th.index + 1 })}`}
                    onClick={() => toggle(th.index)}
                    className={`relative overflow-hidden rounded-xl border bg-card p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                      isOn ? 'border-primary ring-2 ring-primary' : 'hover:border-primary/50'
                    }`}
                  >
                    <img
                      src={th.url}
                      alt={tf('pdfPageN', { n: th.index + 1 })}
                      draggable={false}
                      className="h-auto w-full rounded-lg border bg-white"
                    />
                    {isOn && (
                      <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground shadow">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                    )}
                    <span className="mt-1 block text-center text-[11px] text-muted-foreground">
                      {th.index + 1}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <ToolOptionsCard title={t('pdfExtractCrop')}>
        <div className="grid grid-cols-2 gap-3">
          <ToolField label={t('pdfCropTop')}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={cropTop}
              onChange={(e) => setCropTop(e.target.value)}
              className="h-11"
            />
          </ToolField>
          <ToolField label={t('pdfCropRight')}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={cropRight}
              onChange={(e) => setCropRight(e.target.value)}
              className="h-11"
            />
          </ToolField>
          <ToolField label={t('pdfCropBottom')}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={cropBottom}
              onChange={(e) => setCropBottom(e.target.value)}
              className="h-11"
            />
          </ToolField>
          <ToolField label={t('pdfCropLeft')}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={cropLeft}
              onChange={(e) => setCropLeft(e.target.value)}
              className="h-11"
            />
          </ToolField>
        </div>
        <p className="text-xs text-muted-foreground">{t('pdfExtractCropHint')}</p>

        <ToolRunButton
          onClick={() => void save()}
          busy={saving}
          disabled={!file || busy || selected.size === 0}
        >
          {t('pdfExtractSave')}
        </ToolRunButton>
        {saving && <ToolProgressBar value={0.5} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}
