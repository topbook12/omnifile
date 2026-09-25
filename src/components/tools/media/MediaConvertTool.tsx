'use client'

/**
 * Media converter — video ⇄ video and audio ⇄ audio transcoding through
 * ffmpeg.wasm (Task 4-c). One grouped output-format select (Video / Audio);
 * audio inputs are blocked from video targets with a friendly toast.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { ToolDropzone, ToolField, ToolOptionsCard, ToolProgressBar, ToolResults, ToolRunButton, ToolShell, OnDeviceBadge } from '@/components/tools/shared'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { runToolBatch, replaceExt } from '@/lib/tools/batch'
import {
  MAX_MEDIA_BYTES,
  getFFmpeg,
  isWasmSupported,
  runFFmpeg,
  suggestedInputName,
} from '@/lib/tools/ffmpeg'
import {
  AUDIO_FORMATS,
  VIDEO_FORMATS,
  buildAudioConvertArgs,
  buildVideoConvertArgs,
  isAudioFormat,
  isVideoFormat,
  probeKind,
  type AudioFormat,
  type VideoFormat,
} from '@/lib/tools/media-tools-advanced'
import type { BatchFailure, BatchProgress, ToolResultFile } from '@/lib/tools/types'

const VIDEO_LABELS: Record<VideoFormat, string> = {
  mp4: 'MP4 (H.264 + AAC)',
  webm: 'WebM (VP9 + Opus)',
  mkv: 'MKV (H.264 + AAC)',
  avi: 'AVI (MPEG-4 + MP3)',
  mov: 'MOV (H.264 + AAC)',
}

const AUDIO_LABELS: Record<AudioFormat, string> = {
  mp3: 'Audio only (MP3)',
  wav: 'WAV (PCM)',
  m4a: 'M4A (AAC)',
  flac: 'FLAC (lossless)',
  ogg: 'OGG (Vorbis)',
}

const BITRATES = ['128k', '192k', '320k'] as const

export default function MediaConvertTool() {
  const { t, tf } = useI18n()
  const wasmOk = useMemo(() => isWasmSupported(), [])

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [engineLoading, setEngineLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState<string | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const [fmt, setFmt] = useState<VideoFormat | AudioFormat>('mp4')
  const [crf, setCrf] = useState(23)
  const [audioBitrate, setAudioBitrate] = useState<string>('192k')

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
    // Audio → video is impossible: friendly abort before starting.
    if (isVideoFormat(fmt) && files.some((f) => probeKind(f) === 'audio')) {
      toast.error(t('mediaAudioToVideo'))
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
          if (probeKind(file) === 'audio' && isVideoFormat(fmt)) {
            throw new Error(t('mediaAudioToVideo'))
          }
          const inName = suggestedInputName(file.name)
          const outName = replaceExt(file.name, fmt)
          const args = isAudioFormat(fmt)
            ? buildAudioConvertArgs(inName, outName, fmt, { bitrate: audioBitrate })
            : buildVideoConvertArgs(inName, outName, fmt, { crf })
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
      icon={<ArrowLeftRight />}
      title={t('toolMediaConvert')}
      desc={t('toolMediaConvertDesc')}
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
        accept="video/*,audio/*"
        files={files}
        onFiles={(incoming) => setFiles((prev) => [...prev, ...incoming])}
        onRemove={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
        disabled={busy}
      />

      <ToolOptionsCard title={t('mediaOutputFormat')}>
        <ToolField label={t('mediaOutputFormat')}>
          <Select value={fmt} onValueChange={(v) => setFmt(v as VideoFormat | AudioFormat)} disabled={busy}>
            <SelectTrigger className="h-11 w-full" aria-label={t('mediaOutputFormat')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t('kindVideo')}</SelectLabel>
                {VIDEO_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {VIDEO_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{t('kindAudio')}</SelectLabel>
                {AUDIO_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f === 'mp3' ? t('mediaAudioOnlyMp3') : AUDIO_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </ToolField>

        <details className="group rounded-xl border border-border/70 bg-muted/30">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {t('mediaAdvanced')}
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="space-y-4 border-t px-3.5 py-4">
            {isVideoFormat(fmt) && (
              <ToolField label={t('mediaCrf')} hint={t('mediaCrfHint')}>
                <div className="flex items-center gap-3">
                  <Slider
                    min={18}
                    max={34}
                    step={1}
                    value={[crf]}
                    onValueChange={(v) => setCrf(v[0] ?? 23)}
                    disabled={busy}
                    className="flex-1"
                    aria-label={t('mediaCrf')}
                  />
                  <span className="w-9 text-right text-sm tabular-nums">{crf}</span>
                </div>
              </ToolField>
            )}
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
          </div>
        </details>
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
        zipName="omnifile-converted.zip"
      />
    </ToolShell>
  )
}
