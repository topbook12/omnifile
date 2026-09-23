'use client'

/**
 * PDF Split — every N pages / custom ranges ("1-3, 5, 8-") / one page each.
 * 100% on-device via @cantoo/pdf-lib (see pdf-tools-advanced.ts).
 */

import { useState } from 'react'
import { Scissors } from 'lucide-react'
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
import { errMessage, splitPdf, type SplitMode } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'

export default function PdfSplitTool() {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<SplitMode>('every')
  const [everyN, setEveryN] = useState('2')
  const [ranges, setRanges] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
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

  const everyNValid = Number.isInteger(Number(everyN)) && Number(everyN) >= 2 && Number(everyN) <= 100
  const rangesValid = ranges.trim().length > 0
  const ready = Boolean(file) && !busy && (mode === 'every' ? everyNValid : mode === 'ranges' ? rangesValid : true)

  const run = async () => {
    if (!file) return
    setBusy(true)
    setProgress(0.1)
    setResults([])
    setFailed([])
    try {
      const out = await splitPdf(file, {
        mode,
        everyN: Number(everyN),
        ranges,
      })
      setResults(out)
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<Scissors />} title={t('toolPdfSplit')} desc={t('toolPdfSplitDesc')}>
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

      <ToolOptionsCard title={t('pdfSplitMode')}>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as SplitMode)}
          className="gap-3"
        >
          {(
            [
              ['every', 'pdfSplitEvery'],
              ['ranges', 'pdfSplitRanges'],
              ['single', 'pdfSplitSingle'],
            ] as Array<[SplitMode, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-split-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-split-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>

        {mode === 'every' && (
          <ToolField label={t('pdfSplitEveryLabel')} hint="2–100">
            <Input
              type="number"
              inputMode="numeric"
              min={2}
              max={100}
              value={everyN}
              onChange={(e) => setEveryN(e.target.value)}
              className="h-11 max-w-32"
            />
          </ToolField>
        )}

        {mode === 'ranges' && (
          <ToolField label={t('pdfSplitRangesLabel')} hint={t('pdfSplitRangesHint')}>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="1-3, 5, 8-"
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              className="h-11"
            />
          </ToolField>
        )}

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!ready}>
          {t('toolRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={progress} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}
