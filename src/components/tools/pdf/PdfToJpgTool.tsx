'use client'

/**
 * PDF → JPG/PNG — render every page with pdf.js and export one image file
 * per page. Capped at 100 pages (see PDF_TO_IMAGES_MAX_PAGES).
 */

import { useState } from 'react'
import { FileImage } from 'lucide-react'
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
import {
  errMessage,
  pdfToImages,
  PDF_TO_IMAGES_MAX_PAGES,
} from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'

type ImgFormat = 'image/jpeg' | 'image/png'
type ImgScale = '1' | '2' | '3'

export default function PdfToJpgTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [format, setFormat] = useState<ImgFormat>('image/jpeg')
  const [scale, setScale] = useState<ImgScale>('2')
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
      const out = await pdfToImages(
        file,
        { format, scale: Number(scale) },
        (done, total) => {
          setProgress(done / Math.max(1, total))
          setProgressLabel(tf('pdfPageN', { n: done }) + ` / ${total}`)
        }
      )
      setResults(out)
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<FileImage />} title={t('toolPdfToJpg')} desc={t('toolPdfToJpgDesc')}>
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
        <ToolField label={t('pdfJpgFormat')}>
          <RadioGroup
            value={format}
            onValueChange={(v) => setFormat(v as ImgFormat)}
            className="gap-3"
          >
            {(
              [
                ['image/jpeg', 'JPG'],
                ['image/png', 'PNG'],
              ] as Array<[ImgFormat, string]>
            ).map(([value, key]) => (
              <Label
                key={value}
                htmlFor={`pdf-jpg-${value}`}
                className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`pdf-jpg-${value}`} value={value} />
                {key}
              </Label>
            ))}
          </RadioGroup>
        </ToolField>

        <ToolField label={t('pdfJpgScale')}>
          <RadioGroup
            value={scale}
            onValueChange={(v) => setScale(v as ImgScale)}
            className="gap-3"
          >
            {(
              [
                ['1', 'pdfJpgScale1'],
                ['2', 'pdfJpgScale2'],
                ['3', 'pdfJpgScale3'],
              ] as Array<[ImgScale, string]>
            ).map(([value, key]) => (
              <Label
                key={value}
                htmlFor={`pdf-jpg-scale-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`pdf-jpg-scale-${value}`} value={value} />
                {t(key)}
              </Label>
            ))}
          </RadioGroup>
        </ToolField>

        <p className="text-xs text-muted-foreground">{t('pdfJpgCap')}</p>

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
        zipName="pdf-pages.zip"
      />
    </ToolShell>
  )
}
