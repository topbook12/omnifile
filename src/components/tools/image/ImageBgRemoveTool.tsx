'use client'

/**
 * Background remover — two engines:
 *  • On-device (@imgly/background-removal): free, offline, downloads an AI
 *    model (~40–80 MB) on first use, then cached by the browser.
 *  • Gemini AI (BYOK): better edge quality, uses the user's own key.
 * Optional post-step: keep transparency, or flatten on white / a custom
 * colour via flattenOnColour from the existing image-tools lib.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Cpu, Eraser, Info, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Label } from '@/components/ui/label'
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
import {
  BG_REMOVE_PROMPT,
  decodeImageToCanvas,
  encodeCanvas,
} from '@/lib/tools/image-tools-advanced'
import { flattenOnColour } from '@/lib/image-tools'
import { geminiEditImage, getGeminiKey } from '@/lib/gemini'
import { useAiStore } from '@/lib/ai-store'
import { useI18n } from '@/lib/i18n'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

type Engine = 'device' | 'gemini'
type After = 'transparent' | 'white' | 'color'

/** Selectable engine card built around a RadioGroupItem. */
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

export default function ImageBgRemoveTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Options
  const [engine, setEngine] = useState<Engine>('device')
  const [after, setAfter] = useState<After>('transparent')
  const [colour, setColour] = useState('#ffffff')

  // Re-evaluate the stored key whenever the AI settings dialog closes.
  const dialogOpen = useAiStore((s) => s.dialogOpen)
  const hasKey = useMemo(() => !!getGeminiKey(), [dialogOpen])

  // Throttle imgly's very chatty progress callback.
  const lastFrac = useRef(-1)

  const geminiUnavailable = engine === 'gemini' && !hasKey

  const run = async () => {
    if (files.length === 0) return
    setBusy(true)
    setResults([])
    setFailed([])
    lastFrac.current = -1
    try {
      const outcome = await runToolBatch(
        files,
        async (file, i) => {
          let out: Blob

          if (engine === 'device') {
            const { removeBackground: imglyRemove } = await import('@imgly/background-removal')
            out = await imglyRemove(file, {
              progress: (_key: string, current: number, total: number) => {
                const frac = total > 0 ? current / total : 0
                if (frac - lastFrac.current > 0.01 || frac >= 1) {
                  lastFrac.current = frac
                  setProgress({
                    value: (i + frac) / files.length,
                    label: file.name,
                  })
                }
              },
            })
          } else {
            out = await geminiEditImage(file, { prompt: BG_REMOVE_PROMPT })
          }

          // Optional flatten step (only meaningful when alpha exists).
          let final = out
          if (after !== 'transparent') {
            const canvas = await decodeImageToCanvas(out)
            const flat = flattenOnColour(canvas, after === 'white' ? '#ffffff' : colour)
            final = await encodeCanvas(flat, 'image/png')
          }

          return [{ name: resultName(file.name, '-no-bg', 'png'), blob: final }]
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
      icon={<Eraser />}
      title={t('toolImageBgRemove')}
      desc={t('toolImageBgRemoveDesc')}
    >
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
        <GeminiBadge />
      </div>

      <ToolDropzone
        accept="image/*"
        files={files}
        onFiles={setFiles}
        onRemove={(i) => setFiles(files.filter((_, j) => j !== i))}
        disabled={busy}
      />

      <ToolOptionsCard title={t('imgOptionsLabel')}>
        <ToolField label={t('imgEngineLabel')}>
          <RadioGroup
            value={engine}
            onValueChange={(v) => setEngine(v as Engine)}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <EngineCard id="bg-engine-device" value="device" label={t('aiModeOnDevice')} icon={<Cpu />} />
            <EngineCard id="bg-engine-gemini" value="gemini" label={t('aiModeGemini')} icon={<Sparkles />} />
          </RadioGroup>
          {engine === 'device' && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('imgModelHint')}
            </p>
          )}
        </ToolField>

        {engine === 'gemini' && !hasKey && <AiKeyNotice />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ToolField label={t('imgAfterLabel')}>
            <Select value={after} onValueChange={(v) => setAfter(v as After)} disabled={busy}>
              <SelectTrigger className="h-11 w-full" aria-label={t('imgAfterLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transparent">{t('imgAfterTransparent')}</SelectItem>
                <SelectItem value="white">{t('imgAfterWhite')}</SelectItem>
                <SelectItem value="color">{t('imgAfterColour')}</SelectItem>
              </SelectContent>
            </Select>
          </ToolField>
          {after === 'color' && (
            <ToolField label={t('imgColourLabel')}>
              <label className="flex h-11 items-center gap-3 rounded-xl border border-input px-3">
                <input
                  type="color"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  disabled={busy}
                  aria-label={t('imgColourLabel')}
                  className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="font-mono text-sm text-muted-foreground">{colour}</span>
              </label>
            </ToolField>
          )}
        </div>
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
