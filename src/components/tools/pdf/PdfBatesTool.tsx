'use client'

/**
 * PDF Bates Numbering (Task 2-b) — unique sequential serial numbers
 * (`prefix + 000001 + suffix`) stamped on every page with position,
 * padding, font size, color and margin controls + live preview.
 * 100% on-device via stampBates (pdf-pages.ts).
 */

import { useState } from 'react'
import { Hash } from 'lucide-react'
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
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resultName } from '@/lib/tools/batch'
import {
  errMessage,
  stampBates,
  type BatesOptions,
  type BatesPosition,
} from '@/lib/tools/pdf-pages'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

const POSITIONS: Array<[BatesPosition, string]> = [
  ['bottom-right', 'pdfBatesPosBR'],
  ['bottom-center', 'pdfBatesPosBC'],
  ['bottom-left', 'pdfBatesPosBL'],
  ['top-right', 'pdfBatesPosTR'],
  ['top-center', 'pdfBatesPosTC'],
  ['top-left', 'pdfBatesPosTL'],
]

export default function PdfBatesTool() {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [start, setStart] = useState('1')
  const [padding, setPadding] = useState(4)
  const [position, setPosition] = useState<BatesPosition>('bottom-right')
  const [fontSize, setFontSize] = useState(10)
  const [color, setColor] = useState('#000000')
  const [margin, setMargin] = useState('36')
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

  const startNum =
    start.trim() !== '' && Number.isFinite(Number(start)) ? Math.max(0, Math.floor(Number(start))) : 1
  const marginNum = Math.max(0, Number(margin) || 0)

  /* Live preview of the first serial number. */
  const preview = `${prefix}${String(startNum).padStart(padding, '0')}${suffix}`

  const run = async () => {
    if (!file || busy) return
    setBusy(true)
    setProgress(0.15)
    setResults([])
    setFailed([])
    try {
      const opts: BatesOptions = {
        prefix,
        suffix,
        start: startNum,
        padding,
        fontSize,
        colorHex: color,
        position,
        margin: marginNum,
      }
      const blob = await stampBates(file, opts)
      setResults([{ name: resultName(file.name, '-bates', 'pdf'), blob }])
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<Hash />} title={t('toolPdfBates')} desc={t('toolPdfBatesDesc')}>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <ToolField label={t('pdfBatesPrefix')}>
            <Input
              type="text"
              placeholder="EXH-"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="h-11"
            />
          </ToolField>
          <ToolField label={t('pdfBatesSuffix')}>
            <Input
              type="text"
              placeholder="-25"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              className="h-11"
            />
          </ToolField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ToolField label={t('pdfBatesStart')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-11"
            />
          </ToolField>
          <ToolField label={t('pdfBatesMargin')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className="h-11"
            />
          </ToolField>
        </div>

        <ToolField label={`${t('pdfBatesPadding')}: ${padding}`}>
          <Slider
            value={[padding]}
            min={0}
            max={8}
            step={1}
            onValueChange={(v) => setPadding(v[0] ?? 4)}
            aria-label={t('pdfBatesPadding')}
          />
        </ToolField>

        <ToolField label={`${t('pdfBatesFontSize')}: ${fontSize} pt`}>
          <Slider
            value={[fontSize]}
            min={6}
            max={24}
            step={1}
            onValueChange={(v) => setFontSize(v[0] ?? 10)}
            aria-label={t('pdfBatesFontSize')}
          />
        </ToolField>

        <ToolField label={t('pdfBatesPosition')}>
          <Select value={position} onValueChange={(v) => setPosition(v as BatesPosition)}>
            <SelectTrigger className="h-11 w-full" aria-label={t('pdfBatesPosition')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITIONS.map(([value, key]) => (
                <SelectItem key={value} value={value}>
                  {t(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolField>

        <ToolField label={t('pdfBatesColor')}>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label={t('pdfBatesColor')}
            className="h-11 w-16 cursor-pointer rounded-md border border-input bg-card p-1"
          />
        </ToolField>

        <div className="rounded-lg bg-muted/60 p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">{t('pdfBatesPreview')}</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wide">{preview}</p>
        </div>

        <p className="text-xs text-muted-foreground">{t('pdfFontLatinHint')}</p>

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!file}>
          {t('pdfBatesRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={progress} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}
