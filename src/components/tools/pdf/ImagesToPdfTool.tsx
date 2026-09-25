'use client'

/**
 * Images → PDF — pack JPG/PNG/WebP/… photos into one document, in selection
 * order. Page size: match each image, or fixed A4/Letter with margins.
 * 100% on-device via @cantoo/pdf-lib (see pdf-tools-advanced.ts).
 */

import { useState } from 'react'
import { ImagePlus } from 'lucide-react'
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
  imagesToPdf,
  pdfResultName,
  type ImagesToPdfPageSize,
} from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { useI18n } from '@/lib/i18n'

export default function ImagesToPdfTool() {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [pageSize, setPageSize] = useState<ImagesToPdfPageSize>('a4')
  const [margin, setMargin] = useState(10)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

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
    try {
      const blob = await imagesToPdf(files, { pageSize, margin })
      setResults([{ name: pdfResultName.images('images.pdf'), blob }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell
      icon={<ImagePlus />}
      title={t('toolImagesToPdf')}
      desc={t('toolImagesToPdfDesc')}
    >
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="image/*"
        multiple
        files={files}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy}
      />

      <ToolOptionsCard title={t('pdfI2pPageSize')}>
        <RadioGroup
          value={pageSize}
          onValueChange={(v) => setPageSize(v as ImagesToPdfPageSize)}
          className="gap-3"
        >
          {(
            [
              ['a4', 'pdfI2pA4'],
              ['letter', 'pdfI2pLetter'],
              ['fit', 'pdfI2pFit'],
            ] as Array<[ImagesToPdfPageSize, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-i2p-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-i2p-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>

        {pageSize !== 'fit' && (
          <ToolField label={`${t('pdfI2pMargin')}: ${margin}`}>
            <Slider
              value={[margin]}
              min={0}
              max={20}
              step={1}
              onValueChange={(v) => setMargin(v[0] ?? 10)}
              aria-label={t('pdfI2pMargin')}
            />
          </ToolField>
        )}

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={files.length === 0}>
          {t('toolRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={0.4} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}
