'use client'

/**
 * PDF Rotate (Task 2-b) — turn all pages or the pages of a range string
 * ("1-3, 5, 8-") by 90° CW / 90° CCW / 180°, relative to each page's
 * current rotation. 100% on-device via rotatePdf (pdf-pages.ts).
 */

import { useState } from 'react'
import { RotateCw } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { errMessage, rotatePdf, type RotateDelta } from '@/lib/tools/pdf-pages'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { resultName } from '@/lib/tools/batch'
import { useI18n } from '@/lib/i18n'

type Scope = 'all' | 'ranges'
type Angle = '90' | '-90' | '180'

const ANGLES: Array<[Angle, string]> = [
  ['90', 'pdfRot90cw'],
  ['-90', 'pdfRot90ccw'],
  ['180', 'pdfRot180'],
]

export default function PdfRotateTool() {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [scope, setScope] = useState<Scope>('all')
  const [ranges, setRanges] = useState('')
  const [angle, setAngle] = useState<Angle>('90')
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

  const rangesValid = ranges.trim().length > 0
  const ready = Boolean(file) && !busy && (scope === 'all' || rangesValid)

  const run = async () => {
    if (!file) return
    setBusy(true)
    setProgress(0.15)
    setResults([])
    setFailed([])
    try {
      const delta = Number(angle) as RotateDelta
      const blob = await rotatePdf(file, scope === 'all' ? 'all' : ranges, delta)
      setResults([{ name: resultName(file.name, '-rotated', 'pdf'), blob }])
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<RotateCw />} title={t('toolPdfRotate')} desc={t('toolPdfRotateDesc')}>
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
        <ToolField label={t('pdfRotScope')}>
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as Scope)}
            className="gap-3"
          >
            {(
              [
                ['all', 'pdfRotAll'],
                ['ranges', 'pdfRotRanges'],
              ] as Array<[Scope, string]>
            ).map(([value, key]) => (
              <Label
                key={value}
                htmlFor={`pdf-rot-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`pdf-rot-${value}`} value={value} />
                {t(key)}
              </Label>
            ))}
          </RadioGroup>
        </ToolField>

        {scope === 'ranges' && (
          <ToolField label={t('pdfRotRangesLabel')} hint={t('pdfSplitRangesHint')}>
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

        <ToolField label={t('pdfRotAngle')}>
          <RadioGroup
            value={angle}
            onValueChange={(v) => setAngle(v as Angle)}
            className="gap-3"
          >
            {ANGLES.map(([value, key]) => (
              <Label
                key={value}
                htmlFor={`pdf-rot-angle-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`pdf-rot-angle-${value}`} value={value} />
                {t(key)}
              </Label>
            ))}
          </RadioGroup>
        </ToolField>

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!ready}>
          {t('toolRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={progress} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}
