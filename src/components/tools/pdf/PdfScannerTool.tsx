'use client'

/**
 * Camera scanner — captures document photos from the device camera
 * (rear lens preferred), applies a scan filter at capture time (original /
 * grayscale / black & white) and assembles the shots into one PDF by
 * reusing imagesToPdf from pdf-tools-advanced.
 *
 * Camera lifecycle: started on user tap (permission-gated), stopped when
 * the panel unmounts, after the PDF is built, and before restarting.
 * getUserMedia needs a secure context (https) — iOS Safari blocks it on
 * http, surfaced via the pdfErrCameraSecure key.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ScanLine,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolField,
  ToolOptionsCard,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { applyScanFilter, captureVideoFrame, type ScanFilter } from '@/lib/tools/pdf-convert'
import {
  canvasToBlob,
  errMessage,
  imagesToPdf,
  type ImagesToPdfPageSize,
  ToolError,
} from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/lib/i18n'

/** Safety cap — a 30-page photo PDF is the sane mobile maximum. */
const SCAN_MAX_SHOTS = 30

interface ScanShot {
  id: number
  url: string
  blob: Blob
}

export default function PdfScannerTool() {
  const { t, tf } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const nextId = useRef(1)

  const [starting, setStarting] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [filter, setFilter] = useState<ScanFilter>('gray')
  const [shots, setShots] = useState<ScanShot[]>([])
  const [pageSize, setPageSize] = useState<ImagesToPdfPageSize>('fit')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Keep a ref in sync so the unmount cleanup can revoke every object URL.
  const shotsRef = useRef<ScanShot[]>(shots)
  useEffect(() => {
    shotsRef.current = shots
  }, [shots])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  // Strict cleanup: camera tracks + preview object URLs never leak.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url))
    }
  }, [])

  // Attach the stream to the <video> once it is rendered.
  useEffect(() => {
    if (!cameraOn) return
    const video = videoRef.current
    const stream = streamRef.current
    if (video && stream) {
      video.srcObject = stream
      video.play().catch(() => {
        /* autoplay with muted + playsInline always works; ignore */
      })
    }
    return () => {
      if (video) video.srcObject = null
    }
  }, [cameraOn])

  const startCamera = async () => {
    if (starting) return
    setStarting(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new ToolError('pdfErrCameraSecure')
      }
      stopCamera() // never hold two streams
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
    } catch (err) {
      if (err instanceof ToolError) {
        toast.error(errMessage(err, t))
      } else {
        const detail = err instanceof Error ? err.name : String(err)
        toast.error(errMessage(new ToolError('pdfErrCamera', detail), t))
      }
    } finally {
      setStarting(false)
    }
  }

  const capture = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    if (shots.length >= SCAN_MAX_SHOTS) {
      toast.error(errMessage(new ToolError('pdfErrMaxShots'), t))
      return
    }
    try {
      const canvas = captureVideoFrame(video)
      applyScanFilter(canvas, filter) // filter is fixed at capture time
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
      canvas.width = 0
      canvas.height = 0
      setShots((prev) => [
        ...prev,
        { id: nextId.current++, url: URL.createObjectURL(blob), blob },
      ])
    } catch (err) {
      toast.error(errMessage(err, t))
    }
  }

  const removeShot = (id: number) => {
    setShots((prev) => {
      const shot = prev.find((s) => s.id === id)
      if (shot) URL.revokeObjectURL(shot.url)
      return prev.filter((s) => s.id !== id)
    })
  }

  const moveShot = (index: number, dir: -1 | 1) => {
    setShots((prev) => {
      const j = index + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const a = next[index]!
      const b = next[j]!
      next[index] = b
      next[j] = a
      return next
    })
  }

  const build = async () => {
    if (shots.length === 0 || busy) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const files = shots.map(
        (shot, i) => new File([shot.blob], `scan-${i + 1}.jpg`, { type: 'image/jpeg' })
      )
      const blob = await imagesToPdf(files, { pageSize, margin: 0 })
      setResults([{ name: 'scan.pdf', blob }])
      stopCamera()
      toast.success(tf('pdfScanDone', { n: shots.length }))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const secureSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  return (
    <ToolShell icon={<Camera />} title={t('toolPdfScanner')} desc={t('toolPdfScannerDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      {/* ------------------------------ camera view ------------------------------ */}
      {cameraOn ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label={t('pdfScanShutter')}
            className="aspect-[3/4] w-full object-contain sm:aspect-video"
          />
          <button
            type="button"
            onClick={() => void capture()}
            aria-label={t('pdfScanShutter')}
            className="absolute bottom-4 left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white/90 bg-white/20 backdrop-blur transition-transform active:scale-95"
          >
            <span className="h-11 w-11 rounded-full bg-white" />
          </button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute right-3 top-3 h-9 gap-1.5"
            onClick={stopCamera}
          >
            <X className="h-4 w-4" aria-hidden />
            {t('pdfScanStop')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full gap-2 text-base"
            disabled={starting || !secureSupported}
            onClick={() => void startCamera()}
          >
            {starting ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-5 w-5" aria-hidden />
            )}
            {t('pdfScanStart')}
          </Button>
          {!secureSupported && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              {t('pdfErrCameraSecure')}
            </p>
          )}
        </div>
      )}

      {/* -------------------------------- options -------------------------------- */}
      <ToolOptionsCard title={t('pdfScanPageSize')}>
        <ToolField label={t('pdfScanFilter')} hint={t('pdfScanHint')}>
          <Select value={filter} onValueChange={(v) => setFilter(v as ScanFilter)}>
            <SelectTrigger className="h-11 w-full" aria-label={t('pdfScanFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('pdfScanFilterNone')}</SelectItem>
              <SelectItem value="gray">{t('pdfScanFilterGray')}</SelectItem>
              <SelectItem value="bw">{t('pdfScanFilterBw')}</SelectItem>
            </SelectContent>
          </Select>
        </ToolField>

        <RadioGroup
          value={pageSize}
          onValueChange={(v) => setPageSize(v as ImagesToPdfPageSize)}
          className="gap-3"
        >
          {(
            [
              ['fit', 'pdfScanFit'],
              ['a4', 'pdfScanA4'],
            ] as Array<[ImagesToPdfPageSize, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-scan-size-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-scan-size-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>

        <ToolRunButton onClick={() => void build()} busy={busy} disabled={shots.length === 0}>
          <ScanLine className="mr-1.5 h-5 w-5" aria-hidden />
          {t('pdfScanBuild')}
        </ToolRunButton>
      </ToolOptionsCard>

      {/* ------------------------------- thumbnails ------------------------------- */}
      {shots.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{tf('pdfScanCount', { n: shots.length })}</p>
          <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto rounded-xl border bg-card p-3 [scrollbar-width:thin] sm:grid-cols-3 md:grid-cols-4">
            {shots.map((shot, i) => (
              <div
                key={shot.id}
                className="group relative overflow-hidden rounded-lg border bg-muted/40"
              >
                <img
                  src={shot.url}
                  alt={tf('pdfPageN', { n: i + 1 })}
                  className="h-28 w-full object-cover sm:h-32"
                />
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {i + 1}
                </span>
                <button
                  type="button"
                  aria-label={t('pdfScanDelete')}
                  onClick={() => removeShot(shot.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-destructive"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
                <div className="flex items-center justify-between border-t bg-background/90 px-1 py-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t('pdfScanMoveLeft')}
                    disabled={i === 0}
                    onClick={() => moveShot(i, -1)}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t('pdfScanMoveRight')}
                    disabled={i === shots.length - 1}
                    onClick={() => moveShot(i, 1)}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ToolResults
        results={results}
        failed={failed}
        onClear={() => {
          setResults([])
          setFailed([])
        }}
      />
    </ToolShell>
  )
}
