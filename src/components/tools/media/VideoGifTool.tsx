'use client'

/**
 * Video → GIF — clip a time range and encode an animated GIF via the
 * classic two-pass palettegen/paletteuse flow in ffmpeg.wasm (Task 4-c).
 * Both execs run on one shared input file; progress is split 45/55 across
 * the two phases.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, Film, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { OnDeviceBadge, ToolDropzone, ToolField, ToolOptionsCard, ToolProgressBar, ToolResults, ToolRunButton, ToolShell } from '@/components/tools/shared'
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
  bytesToBlob,
  ffmpegError,
  getFFmpeg,
  isWasmSupported,
  suggestedInputName,
} from '@/lib/tools/ffmpeg'
import {
  buildGifPass1,
  buildGifPass2,
  mimeForExt,
  probeKind,
} from '@/lib/tools/media-tools-advanced'
import type { BatchFailure, BatchProgress, ToolResultFile } from '@/lib/tools/types'

const WIDTHS = [240, 360, 480] as const
const MAX_GIF_SECONDS = 60

export default function VideoGifTool() {
  const { t, tf } = useI18n()
  const wasmOk = useMemo(() => isWasmSupported(), [])

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [engineLoading, setEngineLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState<string | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const [startSec, setStartSec] = useState(0)
  const [durationSec, setDurationSec] = useState(5)
  const [fps, setFps] = useState(12)
  const [width, setWidth] = useState<number>(360)

  const engineReadyRef = useRef(false)
  const fileRatioRef = useRef(0)
  const countsRef = useRef({ done: 0, total: 1 })
  const phaseRef = useRef<1 | 2>(1)

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
            const ratio = Math.max(0, Math.min(1, r))
            fileRatioRef.current =
              phaseRef.current === 1 ? ratio * 0.45 : 0.45 + ratio * 0.55
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

    const start = Math.max(0, Number.isFinite(startSec) ? startSec : 0)
    const dur = Math.min(MAX_GIF_SECONDS, Math.max(1, Number.isFinite(durationSec) ? durationSec : 5))

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

          const ff = await getFFmpeg()
          const inName = suggestedInputName(file.name)
          const outName = resultName(file.name, '', 'gif')
          const rm = async (name: string) => {
            try {
              await ff.deleteFile(name)
            } catch {
              /* ignore */
            }
          }

          await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()))
          try {
            // Pass 1 — sample the clip and build the optimal palette.
            phaseRef.current = 1
            fileRatioRef.current = 0
            setLabel(t('mediaPalettePhase'))
            applyProgress()
            const code1 = await ff.exec(buildGifPass1(inName, start, dur, fps, width))
            if (code1 !== 0) {
              throw ffmpegError(`palette generation failed (exit code ${code1})`)
            }

            // Pass 2 — re-decode with the palette applied and encode the GIF.
            phaseRef.current = 2
            fileRatioRef.current = 0.45
            setLabel(t('mediaGifPhase'))
            applyProgress()
            const code2 = await ff.exec(buildGifPass2(inName, outName, start, dur, fps, width))
            if (code2 !== 0) {
              throw ffmpegError(`GIF encoding failed (exit code ${code2})`)
            }

            const data = await ff.readFile(outName)
            const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
            if (!bytes || bytes.length === 0) {
              throw ffmpegError('ffmpeg produced an empty GIF')
            }
            return [{ name: outName, blob: bytesToBlob(bytes, mimeForExt('gif')) }]
          } finally {
            await rm(inName)
            await rm('palette.png')
            await rm(outName)
          }
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
      icon={<Film />}
      title={t('toolVideoGif')}
      desc={t('toolVideoGifDesc')}
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

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('mediaGifOneHint')}
      </p>

      <ToolOptionsCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <ToolField label={t('mediaTrimStart')}>
            <input
              type="number"
              min={0}
              step="0.1"
              value={Number.isFinite(startSec) ? startSec : ''}
              onChange={(e) => setStartSec(e.target.valueAsNumber)}
              disabled={busy}
              aria-label={t('mediaTrimStart')}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
            />
          </ToolField>
          <ToolField label={t('mediaTrimDuration')} hint={t('mediaDurationHint')}>
            <input
              type="number"
              min={1}
              max={MAX_GIF_SECONDS}
              step="0.1"
              value={Number.isFinite(durationSec) ? durationSec : ''}
              onChange={(e) => setDurationSec(e.target.valueAsNumber)}
              disabled={busy}
              aria-label={t('mediaTrimDuration')}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
            />
          </ToolField>
        </div>

        <ToolField label={`${t('mediaFps')} · ${fps}`}>
          <Slider
            min={8}
            max={20}
            step={1}
            value={[fps]}
            onValueChange={(v) => setFps(v[0] ?? 12)}
            disabled={busy}
            aria-label={t('mediaFps')}
          />
        </ToolField>

        <ToolField label={t('imgWidth')}>
          <Select
            value={String(width)}
            onValueChange={(v) => setWidth(Number(v))}
            disabled={busy}
          >
            <SelectTrigger className="h-11 w-full" aria-label={t('imgWidth')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WIDTHS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolField>

        <details className="group rounded-xl border border-border/70 bg-muted/30">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {t('mediaOutputFormat')} · GIF
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="px-3.5 py-3 text-xs text-muted-foreground">
            GIF · {width} px · {fps} fps · {Math.max(0, Number.isFinite(startSec) ? startSec : 0)}s +
            {Math.min(MAX_GIF_SECONDS, Math.max(1, Number.isFinite(durationSec) ? durationSec : 5))}s
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
        zipName="omnifile-gifs.zip"
      />
    </ToolShell>
  )
}
