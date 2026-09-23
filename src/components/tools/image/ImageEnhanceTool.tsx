'use client'

/**
 * Image enhancer — two engines:
 *  • Gemini AI (best quality: real super-resolution + restoration, uses
 *    the user's own key & quota).
 *  • On-device (free/offline): progressive canvas upscale (2×/4×) with an
 *    unsharp mask and a subtle saturation/contrast lift.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Cpu, Sparkles, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  AiKeyNotice,
  GeminiBadge,
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
import { enhanceImageLocal } from '@/lib/tools/image-tools-advanced'
import { ENHANCE_PROMPT, geminiEditImage, getGeminiKey } from '@/lib/gemini'
import { useAiStore } from '@/lib/ai-store'
import { useI18n } from '@/lib/i18n'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

type Engine = 'gemini' | 'device'

function EngineCard({
  id,
  value,
  label,
  icon,
}: {
  id: string
  value: Engine
  label: string
  icon: ReactNode
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-input p-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10">
      <RadioGroupItem value={value} id={id} />
      <label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
        <span className="text-primary [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {label}
      </label>
    </div>
  )
}

export default function ImageEnhanceTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Options
  const [engine, setEngine] = useState<Engine>('gemini')
  const [scale, setScale] = useState<2 | 4>(2)

  // Re-evaluate the stored key whenever the AI settings dialog closes.
  const dialogOpen = useAiStore((s) => s.dialogOpen)
  const hasKey = useMemo(() => !!getGeminiKey(), [dialogOpen])

  const geminiUnavailable = engine === 'gemini' && !hasKey

  const run = async () => {
    if (files.length === 0) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const outcome = await runToolBatch(
        files,
        async (file) => {
          const blob =
            engine === 'gemini'
              ? await geminiEditImage(file, { prompt: ENHANCE_PROMPT })
              : await enhanceImageLocal(file, scale)
          return [{ name: resultName(file.name, '-enhanced', 'png'), blob }]
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
      icon={<WandSparkles />}
      title={t('toolImageEnhance')}
      desc={t('toolImageEnhanceDesc')}
    >
      <div className="flex flex-wrap gap-2">
        <GeminiBadge />
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
        <ToolField label={t('imgEngineLabel')} hint={engine === 'gemini' ? undefined : t('imgEnhanceHint')}>
          <RadioGroup
            value={engine}
            onValueChange={(v) => setEngine(v as Engine)}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <EngineCard id="enh-engine-gemini" value="gemini" label={t('aiModeGemini')} icon={<Sparkles />} />
            <EngineCard id="enh-engine-device" value="device" label={t('aiModeOnDevice')} icon={<Cpu />} />
          </RadioGroup>
        </ToolField>

        {engine === 'gemini' && !hasKey && <AiKeyNotice />}

        {engine === 'device' && (
          <ToolField label={t('imgScaleLabel')}>
            <Select value={String(scale)} onValueChange={(v) => setScale(Number(v) as 2 | 4)} disabled={busy}>
              <SelectTrigger className="h-11 w-full" aria-label={t('imgScaleLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">{t('imgScale2x')}</SelectItem>
                <SelectItem value="4">{t('imgScale4x')}</SelectItem>
              </SelectContent>
            </Select>
          </ToolField>
        )}
      </ToolOptionsCard>

      {progress && <ToolProgressBar value={progress.value} label={progress.label} />}

      <ToolRunButton busy={busy} disabled={files.length === 0 || geminiUnavailable} onClick={run}>
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
