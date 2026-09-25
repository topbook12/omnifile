'use client'

/**
 * PDF → PowerPoint — renders every page with pdf.js and builds a 16:9
 * full-slide .pptx deck (pptxgenjs v4, dynamically imported). Capped at
 * 50 pages to protect memory (PDF_TO_PPTX_MAX_PAGES).
 */

import { useState } from 'react'
import { Presentation } from 'lucide-react'
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
import { pdfToPptx, PDF_TO_PPTX_MAX_PAGES } from '@/lib/tools/pdf-convert'
import { errMessage, replaceExt } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'

type PptScale = '1' | '2'

export default function PdfToPptTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [scale, setScale] = useState<PptScale>('2')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const file = files[0] ?? null

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
  }

  const run = async () => {
    if (!file || busy) return
    setBusy(true)
    setProgress(0)
    setProgressLabel('')
    setResults([])
    setFailed([])
    try {
      const blob = await pdfToPptx(
        file,
        { scale: Number(scale), maxPages: PDF_TO_PPTX_MAX_PAGES },
        (done, total) => {
          setProgress(done / Math.max(1, total))
          setProgressLabel(tf('pdfPageN', { n: done }) + ` / ${total}`)
        }
      )
      setResults([{ name: replaceExt(file.name, 'pptx'), blob }])
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<Presentation />} title={t('toolPdfToPpt')} desc={t('toolPdfToPptDesc')}>
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

      <ToolOptionsCard>
        <ToolField label={t('pdfPptResolution')}>
          <RadioGroup value={scale} onValueChange={(v) => setScale(v as PptScale)} className="gap-3">
            {(
              [
                ['1', 'pdfPptScale1'],
                ['2', 'pdfPptScale2'],
              ] as Array<[PptScale, string]>
            ).map(([value, key]) => (
              <Label
                key={value}
                htmlFor={`pdf-ppt-scale-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`pdf-ppt-scale-${value}`} value={value} />
                {t(key)}
              </Label>
            ))}
          </RadioGroup>
        </ToolField>

        <p className="text-xs text-muted-foreground">{t('pdfPptCap')}</p>

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!file}>
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
