'use client'

/**
 * Media viewer / editor — video & audio playback plus on-device tools.
 *
 * Video tools (browser APIs only: MediaRecorder + captureStream, no ffmpeg):
 *   • Trim       — re-records [start, end] in real time into WebM, saves to library
 *   • Compress   — re-records the full length at the Low bitrate
 *   • Save frame — draws the current frame to an offscreen canvas → PNG download
 * Audio tools:
 *   • Trim       — decodeAudioData + OfflineAudioContext slice → 16-bit PCM WAV
 *
 * The blob is exposed through a short-lived object URL (revoked on cleanup and
 * on every blob change). Exports go through onSave(), so the parent persists
 * the new bytes and the regenerated blob prop rebuilds the URL automatically.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react'
import {
  Camera,
  ChevronDown,
  Download,
  Loader2,
  Minimize2,
  Music,
  Scissors,
  VolumeX,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { downloadBlob } from '@/lib/fsa'
import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import {
  audioBufferToWav,
  decodeAudioBlob,
  formatTime,
  sliceAudioBuffer,
} from '@/lib/media-tools'
import type { ViewerEditorProps } from '@/lib/viewer-types'
import { cn } from '@/lib/utils'

/** videoBitsPerSecond targets for the quality selector. */
const QUALITY_BITRATE = { low: 500_000, medium: 1_500_000, high: 4_000_000 } as const
type Quality = keyof typeof QUALITY_BITRATE

/** First WebM recording mime the browser supports ('' → re-encoding unavailable). */
function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? ''
}

/** MediaRecorder + HTMLMediaElement.captureStream feature detection. */
function canReencode(): boolean {
  return (
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    typeof (HTMLMediaElement.prototype as any).captureStream === 'function'
  )
}

export default function MediaViewer({ file, blob, onDirtyChange, onSave }: ViewerEditorProps) {
  const { t } = useI18n()

  const isVideo = file.mime.startsWith('video/') || file.kind === 'video'

  // Object URL derived per blob; revoked by the effect below on change/unmount.
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])

  // ── Media state ──
  const [failed, setFailed] = useState(false)
  const [duration, setDuration] = useState(0) // 0 until loadedmetadata
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [quality, setQuality] = useState<Quality>('medium')
  const [mute, setMute] = useState(false)

  // ── Export state ──
  const [recording, setRecording] = useState(false) // video: MediaRecorder running
  const [wavBusy, setWavBusy] = useState(false) // audio: decode + render in flight
  const [progress, setProgress] = useState(0)
  const busyRef = useRef(false) // double-click guard shared by both export paths

  // Refs needed to tear a recording down mid-flight (unmount / fatal error).
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const teardownRef = useRef<Array<() => void>>([])
  const abortedRef = useRef(false)

  /** Run + clear the teardown list, then stop the recorder if still active. */
  const teardownRecording = useCallback(() => {
    const cleanups = teardownRef.current
    teardownRef.current = []
    for (const fn of cleanups) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
  }, [])

  // Abort cleanly if the component unmounts mid-record (never save partials).
  useEffect(() => {
    return () => {
      abortedRef.current = true
      teardownRecording()
    }
  }, [teardownRecording])

  /**
   * Real-time re-encode via MediaRecorder: seek to `start`, record playback
   * until `end`, then hand the WebM blob to onSave. Shared by trim & compress.
   */
  const exportVideo = useCallback(
    async (start: number, end: number, bitrate: number, muted: boolean) => {
      const videoEl = videoRef.current
      if (!videoEl || busyRef.current) return
      if (!canReencode()) {
        toast.error(t('vidReencodeUnsupported'))
        return
      }
      const mime = pickRecorderMime()
      if (!mime) {
        toast.error(t('vidReencodeUnsupported'))
        return
      }
      const span = end - start
      if (!Number.isFinite(span) || span <= 0.2) return

      busyRef.current = true
      abortedRef.current = false
      setRecording(true)
      setProgress(0)
      onDirtyChange(true) // the parent guards navigation while dirty

      const chunks: BlobPart[] = []
      const cleanups: Array<() => void> = []
      teardownRef.current = cleanups

      let finished = false
      let started = false
      try {
        const raw = (videoEl as HTMLVideoElement & { captureStream(): MediaStream }).captureStream()
        // Mute audio → record video-only tracks.
        const stream = muted ? new MediaStream(raw.getVideoTracks()) : raw
        cleanups.push(() => {
          try {
            stream.getTracks().forEach((track) => track.stop())
          } catch {
            /* ignore */
          }
        })

        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate })
        recorderRef.current = rec

        rec.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) chunks.push(e.data)
        }

        // Resolves when the recorder stops; null when aborted / nothing captured.
        const stopped = new Promise<Blob | null>((resolve) => {
          rec.onstop = () => {
            recorderRef.current = null
            if (abortedRef.current || chunks.length === 0) resolve(null)
            else resolve(new Blob(chunks, { type: mime }))
          }
        })

        const finish = () => {
          if (finished) return
          finished = true
          try {
            videoEl.pause()
          } catch {
            /* ignore */
          }
          if (rec.state !== 'inactive') {
            try {
              rec.stop()
            } catch {
              /* ignore */
            }
          }
        }

        const onTimeUpdate = () => {
          if (!started || finished) return
          const cur = videoEl.currentTime
          setProgress(Math.min(100, Math.max(0, ((cur - start) / span) * 100)))
          if (cur >= end - 0.05) finish()
        }
        const onEnded = () => {
          if (started) finish()
        }
        videoEl.addEventListener('timeupdate', onTimeUpdate)
        videoEl.addEventListener('ended', onEnded)
        cleanups.push(() => videoEl.removeEventListener('timeupdate', onTimeUpdate))
        cleanups.push(() => videoEl.removeEventListener('ended', onEnded))

        // Seek to the trim start. 'seeked' may not fire when already there → race a timeout.
        await new Promise<void>((resolve) => {
          let settled = false
          const done = () => {
            if (settled) return
            settled = true
            videoEl.removeEventListener('seeked', onSeeked)
            resolve()
          }
          const onSeeked = () => done()
          videoEl.addEventListener('seeked', onSeeked)
          if (videoEl.readyState >= 1 && Math.abs(videoEl.currentTime - start) < 0.05) done()
          else videoEl.currentTime = start
          window.setTimeout(done, 2_500)
        })
        if (finished || abortedRef.current) return

        rec.start(250)
        started = true
        try {
          await videoEl.play()
        } catch {
          // Playback blocked → a recording would be a frozen frame; abort cleanly.
          toast.error(t('errGeneric'))
          finish()
          return
        }

        // Wall-clock safety net: never wedge the UI if timeupdate stalls.
        const watchdog = window.setTimeout(finish, span * 1000 + 10_000)
        cleanups.push(() => window.clearTimeout(watchdog))

        const out = await stopped
        if (!out || abortedRef.current) return
        await onSave(out)
        toast.success(t('tSaved'))
      } catch {
        toast.error(t('errGeneric'))
      } finally {
        teardownRecording()
        busyRef.current = false
        setRecording(false)
        setProgress(0)
        onDirtyChange(false)
      }
    },
    [onDirtyChange, onSave, t, teardownRecording]
  )

  /** Audio trim: decode → slice [start, end] → 16-bit PCM WAV → onSave. No re-encode. */
  const exportAudio = useCallback(async () => {
    if (busyRef.current) return
    if (duration <= 0 || trimEnd - trimStart <= 0.05) return

    busyRef.current = true
    setWavBusy(true)
    onDirtyChange(true)
    try {
      const buffer = await decodeAudioBlob(blob)
      if (!buffer) {
        toast.error(t('vidReencodeUnsupported'))
        return
      }
      const trimmed = await sliceAudioBuffer(buffer, trimStart, trimEnd)
      await onSave(audioBufferToWav(trimmed))
      toast.success(t('tSaved'))
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      busyRef.current = false
      setWavBusy(false)
      onDirtyChange(false)
    }
  }, [blob, duration, onDirtyChange, onSave, t, trimEnd, trimStart])

  /** Draw the current video frame to an offscreen canvas → PNG download. */
  const saveFrame = useCallback(async () => {
    const videoEl = videoRef.current
    const w = videoEl?.videoWidth ?? 0
    const h = videoEl?.videoHeight ?? 0
    if (!videoEl || !w || !h) {
      toast.error(t('errGeneric'))
      return
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context unavailable')
      ctx.drawImage(videoEl, 0, 0, w, h)
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!png) throw new Error('toBlob returned null')
      const base = file.name.replace(/\.[^.]+$/, '')
      downloadBlob(png, `${base}-frame.png`)
      toast.success(t('frameSaved'))
    } catch {
      toast.error(t('errGeneric'))
    }
  }, [file.name, t])

  /**
   * Duration → slider maxes. MediaRecorder-produced WebM files often report
   * duration = Infinity until a probe seek forces the browser to resolve it.
   */
  const handleLoadedMetadata = useCallback((e: SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget
    setFailed(false)
    const d = Number.isFinite(el.duration) ? el.duration : 0
    setDuration(d)
    setTrimStart(0)
    setTrimEnd(d)
    if (!d && el.seekable.length > 0) {
      const onSeeked = () => {
        el.removeEventListener('seeked', onSeeked)
        const real = Number.isFinite(el.duration) ? el.duration : 0
        setDuration(real)
        setTrimEnd(real)
        el.currentTime = 0
      }
      el.addEventListener('seeked', onSeeked)
      el.currentTime = 1e6
    }
  }, [])

  // Clamp: 0 ≤ start < end - 1s ≤ duration.
  const setStartClamped = (v: number) => setTrimStart(Math.max(0, Math.min(v, trimEnd - 1)))
  const setEndClamped = (v: number) => setTrimEnd(Math.min(duration, Math.max(v, trimStart + 1)))

  const toolDisabled = recording || wavBusy
  const sliderMax = Math.max(duration, 1) // radix needs max > min; disabled when duration = 0

  // Trim range sliders — shared by the video and audio tool sections.
  const trimSliders = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium">{t('start')}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTime(trimStart)}
          </span>
        </div>
        <Slider
          value={[trimStart]}
          min={0}
          max={sliderMax}
          step={0.1}
          disabled={duration <= 0 || toolDisabled}
          onValueChange={(vals) => setStartClamped(vals[0] ?? 0)}
          aria-label={t('start')}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium">{t('end')}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{formatTime(trimEnd)}</span>
        </div>
        <Slider
          value={[trimEnd]}
          min={0}
          max={sliderMax}
          step={0.1}
          disabled={duration <= 0 || toolDisabled}
          onValueChange={(vals) => setEndClamped(vals[0] ?? 0)}
          aria-label={t('end')}
        />
      </div>
    </div>
  )

  const videoTools = (
    <div className="space-y-4">
      {/* Trim */}
      <section className="space-y-3" aria-label={t('vidTrim')}>
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold">{t('vidTrim')}</h3>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {formatTime(Math.max(0, trimEnd - trimStart))} / {formatTime(duration)}
          </span>
        </div>
        {trimSliders}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t('vidQuality')}</Label>
            <Select
              value={quality}
              onValueChange={(v) => setQuality(v as Quality)}
              disabled={toolDisabled}
            >
              <SelectTrigger className="h-10 w-full" aria-label={t('vidQuality')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t('vidQualityLow')}</SelectItem>
                <SelectItem value="medium">{t('vidQualityMedium')}</SelectItem>
                <SelectItem value="high">{t('vidQualityHigh')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <VolumeX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Label htmlFor="vid-mute" className="text-xs font-medium">
              {t('vidMute')}
            </Label>
            <Switch
              id="vid-mute"
              checked={mute}
              onCheckedChange={setMute}
              disabled={toolDisabled}
              className="ml-auto"
            />
          </div>
        </div>
        <Button
          onClick={() => void exportVideo(trimStart, trimEnd, QUALITY_BITRATE[quality], mute)}
          disabled={duration <= 0 || toolDisabled}
          className="h-11 w-full gap-2"
        >
          <Download className="h-4 w-4" aria-hidden />
          {t('vidExport')}
        </Button>
      </section>

      <Separator />

      {/* Compress + frame extraction — big full-width touch targets */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          onClick={() => void exportVideo(0, duration, QUALITY_BITRATE.low, mute)}
          disabled={duration <= 0 || toolDisabled}
          className="h-11 w-full gap-2"
        >
          <Minimize2 className="h-4 w-4" aria-hidden />
          {t('vidCompress')}
        </Button>
        <Button
          variant="outline"
          onClick={() => void saveFrame()}
          disabled={toolDisabled}
          className="h-11 w-full gap-2"
        >
          <Camera className="h-4 w-4" aria-hidden />
          {t('vidExtractFrame')}
        </Button>
      </div>

      {recording && (
        <div className="space-y-1.5" role="status">
          <Progress value={progress} aria-label={t('vidProcessingHint')} />
          <p className="text-xs text-muted-foreground">{t('vidProcessingHint')}</p>
        </div>
      )}
    </div>
  )

  const audioTools = (
    <section className="space-y-3" aria-label={t('audTrim')}>
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">{t('audTrim')}</h3>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {formatTime(Math.max(0, trimEnd - trimStart))} / {formatTime(duration)}
        </span>
      </div>
      {trimSliders}
      <Button
        onClick={() => void exportAudio()}
        disabled={duration <= 0 || toolDisabled}
        className="h-11 w-full gap-2"
      >
        {wavBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {t('audExport')}
      </Button>
    </section>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Stage */}
      <div
        className={cn(
          'relative flex min-h-0 flex-1 items-center justify-center',
          isVideo ? 'bg-black/90 p-3' : 'bg-muted/30 p-6'
        )}
      >
        {isVideo ? (
          <>
            <Badge
              variant="secondary"
              className="pointer-events-none absolute right-3 top-3 z-20"
            >
              {t('mediaHint')}
            </Badge>
            {!failed ? (
              <video
                key={url}
                ref={videoRef}
                src={url}
                controls
                playsInline
                preload="metadata"
                className="max-h-full max-w-full"
                onError={() => setFailed(true)}
                onLoadedMetadata={handleLoadedMetadata}
              />
            ) : (
              <Card className="w-full max-w-md p-6">
                <p className="text-sm font-medium">{t('errGeneric')}</p>
              </Card>
            )}
            {/* Block player interaction while a real-time export is running */}
            {recording && (
              <div className="absolute inset-0 z-10 cursor-wait" aria-hidden>
                <Badge className="absolute left-3 top-3 gap-1.5 border-red-500/40 bg-red-600/90 text-white hover:bg-red-600/90">
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  REC
                </Badge>
              </div>
            )}
          </>
        ) : (
          <Card className="relative w-full max-w-md p-6">
            <Badge
              variant="secondary"
              className="pointer-events-none absolute right-3 top-3"
            >
              {t('mediaHint')}
            </Badge>
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-primary/10 p-5">
                <Music className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <div className="flex w-full flex-col items-center gap-1">
                <p className="w-full truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {!failed ? (
                <audio
                  key={url}
                  src={url}
                  controls
                  preload="metadata"
                  className="mt-2 w-full"
                  onError={() => setFailed(true)}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t('errGeneric')}</p>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Tools */}
      <Collapsible
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        className="shrink-0 border-t bg-background"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Wrench className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium leading-tight">{t('tools')}</span>
              <span className="truncate text-xs text-muted-foreground">{t('toolsHint')}</span>
            </span>
            <ChevronDown
              className={cn(
                'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                toolsOpen && 'rotate-180'
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto px-4 pb-5 pt-2">
            {isVideo ? videoTools : audioTools}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
