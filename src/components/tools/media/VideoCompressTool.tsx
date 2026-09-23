'use client'

/**
 * Video compressor — re-encode any video to a smaller H.264/MP4 with
 * quality preset (CRF), resolution cap and audio bitrate (Task 4-c).
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, FileVideo, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { OnDeviceBadge, ToolDropzone, ToolField, ToolOptionsCard, ToolProgressBar, ToolResults, ToolRunButton, ToolShell } from '@/components/tools/shared'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { resultName, runToolBatch } from '@/lib/tools/batch'
import {
  MAX_MEDIA_BYTES,
  getFFmpeg,
  isWasmSupported,
  runFFmpeg,
  suggestedInputName,
} from '@/lib/tools/ffmpeg'
import {
  buildCompressArgs,
  probeKind,
  type CompressScale,
} from '@/lib/tools/media-tools-advanced'
import type { BatchFailure, BatchProgress, ToolResultFile } from '@/lib/tools/types'

type Preset = 'high' | 'medium' | 'small'

const PRESET_CRF: Record<Preset, number> = { high: 20, medium: 26, small: 32 }
const RESOLUTIONS: CompressScale[] = ['original', '1080', '720', '480']
const BITRATES = ['96k', '128k', '160k', '192k'] as const

export default function VideoCompressTool() {
  const { t, tf } = useI18n()
  const wasmOk = useMemo(() => isWasmSupported(), [])

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [engineLoading, setEngineLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState<string | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const [preset, setPreset] = useState<Preset>('medium')
  const [resolution, setResolution] = useState<CompressScale>('original')
  const [audioBitrate, setAudioBitrate] = useState<string>('128k')
  const [crf, setCrf] = useState(PRESET_CRF.medium)

  const engineReadyRef = useRef(false)
  const fileRatioRef = useRef(0)
  const countsRef = useRef({ done: 0, total: 1 })

  const applyProgress = useCallback(() => {
    const { done, total } = countsRef.current
    const combined = (done + fileRatioRef.current) / Math.max(1, total)
    setProgress(Math.max(0, Math.min(1, combined)))
  }, [])

  const onBatchProgress = useCallback(
    (p: BatchProgress) => {
      countsRef.current = { done: p.done, total: Math.max(1, p.total) }
      fileRatioRef.current = 0
      setLabel(
        p.current
          ? `${tf('mediaFileOf', { n: p.done + 1, total: p.total })} · ${p.current}`
          : null
      )
      applyProgress()
    },
    [applyProgress, tf]
  )

  const applyPreset = (p: string) => {
    const next = p as Preset
    setPreset(next)
    setCrf(PRESET_CRF[next])
  }

  const run = async () => {
    if (busy || files.length === 0) return
    if (!wasmOk) {
      toast.error(t('mediaWasmUnsupported'))
      return
    }
    if (files.every((f) => probeKind(f) !== 'video')) {
      toast.error(t('mediaVideoOnlyFile'))
      return
    }

    setBusy(true)
    setResults([])
    setFailed([])
    setProgress(0)
    setLabel(null)
    fileRatioRef.current = 0
    countsRef.current = { done: 0, total: files.length }

    try {
      if (!engineReadyRef.current) setEngineLoading(true)
      try {
        await getFFmpeg({
          onProgress: (r) => {
            fileRatioRef.current = Math.max(0, Math.min(1, r))
            applyProgress()
          },
        })
        engineReadyRef.current = true
      } finally {
        setEngineLoading(false)
      }
    } catch {
      toast.error(t('mediaEngineError'))
      setBusy(false)
      return
    }

    try {
      const outcome = await runToolBatch(
        files,
        async (file) => {
          if (file.size > MAX_MEDIA_BYTES) {
            throw new Error(tf('mediaTooLarge', { size: formatBytes(file.size) }))
          }
          if (probeKind(file) !== 'video') {
            throw new Error(t('mediaVideoOnlyFile'))
          }
          const inName = suggestedInputName(file.name)
          const outName = resultName(file.name, '-compressed', 'mp4')
          const args = buildCompressArgs(inName, outName, {
            crf,
            scale: resolution,
            audioBitrate,
          })
          const blob = await runFFmpeg(file, args, outName)
          toast.success(tf('mediaCompressed', { from: formatBytes(file.size), to: formatBytes(blob.size) }))
          return [{ name: outName, blob }]
        },
        onBatchProgress
      )
      setResults(outcome.results)
      setFailed(outcome.failed)
      if (outcome.failed.length === 0) toast.success(t('mediaDoneToast'))
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setBusy(false)
      setLabel(null)
    }
  }

  const presetLabel = (p: Preset) =>
    p === 'high' ? t('vidQualityHigh') : p === 'medium' ? t('vidQualityMedium') : t('mediaPresetSmall')

  const resolutionLabel = (r: CompressScale) =>
    r === 'original' ? t('mediaResOriginal') : `${r}p`

  return (
    <ToolShell
      icon={<FileVideo />}
      title={t('toolVideoCompress')}
      desc={t('toolVideoCompressDesc')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OnDeviceBadge />
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('mediaWasmTitle')}
        </p>
        <p className="mt-1">{t('mediaFirstUseHint')}</p>
        <p className="mt-1">{t('mediaSlowHint')}</p>
      </div>

      {!wasmOk && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive"
        >
          {t('mediaWasmUnsupported')}
        </div>
      )}

      <ToolDropzone
        accept="video/*"
        files={files}
        onFiles={(incoming) => setFiles((prev) => [...prev, ...incoming])}
        onRemove={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
        disabled={busy}
      />

      <ToolOptionsCard>
        <ToolField label={t('vidQuality')}>
          <RadioGroup
            value={preset}
            onValueChange={applyPreset}
            disabled={busy}
            className="grid grid-cols-3 gap-2"
          >
            {(['high', 'medium', 'small'] as const).map((p) => (
              <Label
                key={p}
                htmlFor={`vc-preset-${p}`}
                className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border/70 px-2 text-sm font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
              >
                <RadioGroupItem value={p} id={`vc-preset-${p}`} />
                {presetLabel(p)}
              </Label>
            ))}
          </RadioGroup>
        </ToolField>

        <ToolField label={t('mediaCrf')}>
          <div className="flex items-center gap-3">
            <Slider
              min={18}
              max={34}
              step={1}
              value={[crf]}
              onValueChange={(v) => setCrf(v[0] ?? 26)}
              disabled={busy}
              className="flex-1"
              aria-label={t('mediaCrf')}
            />
            <span className="w-9 text-right text-sm tabular-nums">{crf}</span>
          </div>
        </ToolField>

        <ToolField label={t('mediaResolution')}>
          <Select
            value={resolution}
            onValueChange={(v) => setResolution(v as CompressScale)}
            disabled={busy}
          >
            <SelectTrigger className="h-11 w-full" aria-label={t('mediaResolution')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {resolutionLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolField>

        <ToolField label={t('mediaAudioBitrate')}>
          <Select value={audioBitrate} onValueChange={setAudioBitrate} disabled={busy}>
            <SelectTrigger className="h-11 w-full" aria-label={t('mediaAudioBitrate')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BITRATES.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolField>
      </ToolOptionsCard>

      <ToolRunButton onClick={() => void run()} busy={busy} disabled={files.length === 0 || !wasmOk}>
        {t('toolRun')}
      </ToolRunButton>

      {engineLoading && (
        <div className="space-y-1.5" role="status">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {t('mediaEngineLoading')}
          </p>
        </div>
      )}

      {busy && !engineLoading && <ToolProgressBar value={progress} label={label ?? undefined} />}

      <ToolResults
        results={results}
        failed={failed}
        onClear={() => {
          setResults([])
          setFailed([])
        }}
        zipName="omnifile-compressed.zip"
      />
    </ToolShell>
  )
}
