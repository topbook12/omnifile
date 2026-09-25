'use client'

/**
 * PDF Compressor — rasterises pages (pdf.js) and rebuilds the PDF from
 * JPEGs (@cantoo/pdf-lib). Batch friendly; presets map to render scale +
 * JPEG quality. If a file cannot be made smaller its original is kept.
 */

import { useRef, useState } from 'react'
import { Archive } from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolDropzone,
  ToolOptionsCard,
  ToolProgressBar,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import {
  COMPRESS_PRESETS,
  compressPdf,
  errMessage,
  pdfResultName,
} from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { runToolBatch } from '@/lib/tools/batch'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'

type PresetKey = keyof typeof COMPRESS_PRESETS

export default function PdfCompressTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [preset, setPreset] = useState<PresetKey>('balanced')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])
  const unchangedRef = useRef(0)

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setFiles((prev) => [...prev, ...incoming])
  }
  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setResults([])
    setFailed([])
  }

  const run = async () => {
    if (files.length === 0 || busy) return
    setBusy(true)
    setProgress(0)
    setProgressLabel('')
    setResults([])
    setFailed([])
    unchangedRef.current = 0

    try {
      const outcome = await runToolBatch(
        files,
        async (file, index) => {
          try {
            const blob = await compressPdf(file, COMPRESS_PRESETS[preset], (done, total) => {
              setProgress((index + done / Math.max(1, total)) / files.length)
              setProgressLabel(
                `${file.name} · ${tf('pdfPageN', { n: done })}/${total}`
              )
            })
            // compressPdf returns the ORIGINAL blob (identical size) when it
            // could not shrink the file.
            if (blob.size === file.size) unchangedRef.current += 1
            return [{ name: pdfResultName.compressed(file.name), blob }]
          } catch (err) {
            // Translate so the failures list shows a human-readable message.
            throw new Error(errMessage(err, t))
          }
        },
        (p) => {
          if (!p.current) setProgress(p.total > 0 ? p.done / p.total : 1)
        }
      )
      setResults(outcome.results)
      setFailed(outcome.failed)
      setProgress(1)
      if (unchangedRef.current > 0) toast.info(t('pdfCompressUnchanged'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<Archive />} title={t('toolPdfCompress')} desc={t('toolPdfCompressDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="application/pdf"
        multiple
        files={files}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy}
      />

      <ToolOptionsCard title={t('pdfCompressPreset')}>
        <RadioGroup value={preset} onValueChange={(v) => setPreset(v as PresetKey)} className="gap-3">
          {(
            [
              ['small', 'pdfCompressSmall'],
              ['balanced', 'pdfCompressBalanced'],
              ['high', 'pdfCompressHigh'],
            ] as Array<[PresetKey, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-compress-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-compress-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">{t('pdfCompressHint')}</p>

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={files.length === 0}>
          {t('toolRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={Math.max(0.03, progress)} label={progressLabel} />}
      </ToolOptionsCard>

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
