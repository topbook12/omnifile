'use client'

/**
 * Audio extractor — pull the soundtrack out of a video into MP3/M4A/WAV/
 * FLAC/OGG via ffmpeg.wasm `-vn` extraction (Task 4-c).
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileAudio, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { OnDeviceBadge, ToolDropzone, ToolField, ToolOptionsCard, ToolProgressBar, ToolResults, ToolRunButton, ToolShell } from '@/components/tools/shared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { replaceExt, runToolBatch } from '@/lib/tools/batch'
import {
  MAX_MEDIA_BYTES,
  getFFmpeg,
  isWasmSupported,
  runFFmpeg,
  suggestedInputName,
} from '@/lib/tools/ffmpeg'
import {
  AUDIO_FORMATS,
  buildAudioExtractArgs,
  probeKind,
  type AudioFormat,
} from '@/lib/tools/media-tools-advanced'
import type { BatchFailure, BatchProgress, ToolResultFile } from '@/lib/tools/types'

const AUDIO_LABELS: Record<AudioFormat, string> = {
  mp3: 'MP3',
  wav: 'WAV (PCM)',
  m4a: 'M4A (AAC)',
  flac: 'FLAC (lossless)',
  ogg: 'OGG (Vorbis)',
}

const BITRATES = ['128k', '192k', '320k'] as const
const LOSSY: AudioFormat[] = ['mp3', 'm4a', 'ogg']

export default function AudioExtractTool() {
  const { t, tf } = useI18n()
  const wasmOk = useMemo(() => isWasmSupported(), [])

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [engineLoading, setEngineLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState<string | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const [fmt, setFmt] = useState<AudioFormat>('mp3')
  const [bitrate, setBitrate] = useState<string>('192k')

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
          const outName = replaceExt(file.name, fmt)
          const args = buildAudioExtractArgs(inName, outName, {
            format: fmt,
            bitrate: LOSSY.includes(fmt) ? bitrate : undefined,
          })
          const blob = await runFFmpeg(file, args, outName)
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

  return (
    <ToolShell
      icon={<FileAudio />}
      title={t('toolAudioExtract')}
      desc={t('toolAudioExtractDesc')}
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
        <ToolField label={t('mediaAudioFormat')}>
          <Select value={fmt} onValueChange={(v) => setFmt(v as AudioFormat)} disabled={busy}>
            <SelectTrigger className="h-11 w-full" aria-label={t('mediaAudioFormat')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {AUDIO_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolField>

        {LOSSY.includes(fmt) && (
          <ToolField label={t('mediaAudioBitrate')}>
            <Select value={bitrate} onValueChange={setBitrate} disabled={busy}>
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
        )}

        {!LOSSY.includes(fmt) && (
          <p className="text-xs text-muted-foreground">{t('mediaBitrateLossyHint')}</p>
        )}
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
        zipName="omnifile-audio.zip"
      />
    </ToolShell>
  )
}
