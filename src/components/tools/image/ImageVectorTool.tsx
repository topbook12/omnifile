'use client'

/**
 * Vector converter — traces JPG/PNG into scalable SVG with imagetracerjs.
 * Four presets map to tracer option sets tuned for logos, sketches,
 * posters and photos. Work is capped at 1200px for speed (see lib).
 */

import { useState } from 'react'
import { PenTool } from 'lucide-react'
import { toast } from 'sonner'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

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
import { replaceExt, runToolBatch } from '@/lib/tools/batch'
import { vectorizeImage, type VectorPreset } from '@/lib/tools/image-tools-advanced'
import { useI18n } from '@/lib/i18n'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

const PRESETS: { value: VectorPreset; labelKey: string }[] = [
  { value: 'logo', labelKey: 'imgPresetLogo' },
  { value: 'sketch', labelKey: 'imgPresetSketch' },
  { value: 'poster', labelKey: 'imgPresetPoster' },
  { value: 'photo', labelKey: 'imgPresetPhoto' },
]

export default function ImageVectorTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Options
  const [preset, setPreset] = useState<VectorPreset>('logo')

  const run = async () => {
    if (files.length === 0) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const outcome = await runToolBatch(
        files,
        async (file) => {
          const blob = await vectorizeImage(file, preset)
          return [{ name: replaceExt(file.name, 'svg'), blob }]
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
      icon={<PenTool />}
      title={t('toolImageVector')}
      desc={t('toolImageVectorDesc')}
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
        <ToolField label={t('imgPresetLabel')} hint={t('imgVectorNote')}>
          <RadioGroup
            value={preset}
            onValueChange={(v) => setPreset(v as VectorPreset)}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {PRESETS.map(({ value, labelKey }) => (
              <div
                key={value}
                className="flex min-h-11 items-center gap-2.5 rounded-xl border border-input p-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
              >
                <RadioGroupItem value={value} id={`vector-preset-${value}`} />
                <label htmlFor={`vector-preset-${value}`} className="cursor-pointer text-sm">
                  {t(labelKey)}
                </label>
              </div>
            ))}
          </RadioGroup>
        </ToolField>
      </ToolOptionsCard>

      {progress && <ToolProgressBar value={progress.value} label={progress.label} />}

      <ToolRunButton busy={busy} disabled={files.length === 0} onClick={run}>
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
