'use client'

/**
 * Image compressor — quality mode (slider + JPEG/WebP) or target-size mode
 * (binary-searched via compressToTarget with automatic downscaling).
 */

import { useState } from 'react'
import { Minimize2 } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

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
import { resultName, runToolBatch } from '@/lib/tools/batch'
import { compressImageQuality } from '@/lib/tools/image-tools-advanced'
import { compressToTarget } from '@/lib/image-tools'
import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

type Mode = 'quality' | 'target'
type OutFormat = 'jpeg' | 'webp'

/** Selectable option card styled around a RadioGroupItem. */
function ModeCard({
  id,
  value,
  label,
}: {
  id: string
  value: Mode
  label: string
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-input p-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10">
      <RadioGroupItem value={value} id={id} />
      <label htmlFor={id} className="cursor-pointer text-sm">
        {label}
      </label>
    </div>
  )
}

export default function ImageCompressTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Options
  const [mode, setMode] = useState<Mode>('quality')
  const [quality, setQuality] = useState(80)
  const [fmt, setFmt] = useState<OutFormat>('jpeg')
  const [target, setTarget] = useState('200')
  const [unit, setUnit] = useState<'kb' | 'mb'>('kb')

  const ext = fmt === 'jpeg' ? 'jpg' : 'webp'
  const mime = fmt === 'jpeg' ? 'image/jpeg' : 'image/webp'
  const targetBytes =
    Math.max(0, Number(target) || 0) * (unit === 'kb' ? 1024 : 1024 * 1024)

  const run = async () => {
    if (files.length === 0) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const outcome = await runToolBatch(
        files,
        async (file) => {
          if (mode === 'quality') {
            // Fixed-quality re-encode via canvas (decodes anything Canvas can read).
            const blob = await compressImageQuality(file, fmt, quality / 100)
            return [{ name: resultName(file.name, '-compressed', ext), blob }]
          }
          // Target-size mode: binary search + auto downscale.
          const res = await compressToTarget(file, targetBytes, mime)
          toast.success(tf('imgCompressedTo', { size: formatBytes(res.blob.size) }))
          if (res.blob.size > targetBytes) toast.warning(t('imgCompressFailed'))
          return [{ name: resultName(file.name, '-compressed', ext), blob: res.blob }]
        },
        (p) =>
          setProgress({
            value: p.total ? p.done / p.total : 0,
            label: p.current ?? '',
          })
      )
      setResults(outcome.results)
      setFailed(outcome.failed)
      if (outcome.results.length) {
        toast.success(tf('imgProcessed', { n: outcome.results.length }))
      }
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <ToolShell
      icon={<Minimize2 />}
      title={t('toolImageCompress')}
      desc={t('toolImageCompressDesc')}
    >
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="image/*"
        files={files}
        onFiles={setFiles}
        onRemove={(i) => setFiles(files.filter((_, j) => j !== i))}
        disabled={busy}
      />

      <ToolOptionsCard title={t('imgOptionsLabel')}>
        <ToolField label={t('imgModeLabel')}>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ModeCard id="compress-mode-quality" value="quality" label={t('imgModeQuality')} />
            <ModeCard id="compress-mode-target" value="target" label={t('imgModeTarget')} />
          </RadioGroup>
        </ToolField>

        {mode === 'quality' ? (
          <ToolField label={tf('imgQualityLabel', { q: quality })}>
            <Slider
              value={[quality]}
              min={10}
              max={100}
              step={1}
              onValueChange={(v) => setQuality(v[0] ?? quality)}
              disabled={busy}
              aria-label={tf('imgQualityLabel', { q: quality })}
            />
          </ToolField>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <ToolField label={t('imgTargetLabel')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={busy}
                className="h-11"
              />
            </ToolField>
            <ToolField label={t('imgUnitLabel')}>
              <Select value={unit} onValueChange={(v) => setUnit(v as 'kb' | 'mb')} disabled={busy}>
                <SelectTrigger className="h-11 w-full" aria-label={t('imgUnitLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kb">{t('imgUnitKb')}</SelectItem>
                  <SelectItem value="mb">{t('imgUnitMb')}</SelectItem>
                </SelectContent>
              </Select>
            </ToolField>
          </div>
        )}

        <ToolField label={t('imgFormatLabel')}>
          <Select value={fmt} onValueChange={(v) => setFmt(v as OutFormat)} disabled={busy}>
            <SelectTrigger className="h-11 w-full" aria-label={t('imgFormatLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jpeg">JPEG</SelectItem>
              <SelectItem value="webp">WebP</SelectItem>
            </SelectContent>
          </Select>
        </ToolField>
      </ToolOptionsCard>

      {progress && <ToolProgressBar value={progress.value} label={progress.label} />}

      <ToolRunButton
        busy={busy}
        disabled={files.length === 0 || (mode === 'target' && targetBytes <= 0)}
        onClick={run}
      >
        {t('toolRun')}
      </ToolRunButton>

      <ToolResults
        results={results}
        failed={failed}
        onClear={() => {
          setResults([])
          setFailed([])
        }}
        zipName="omnifile-images.zip"
      />
    </ToolShell>
  )
}
