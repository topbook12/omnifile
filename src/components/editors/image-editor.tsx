'use client'

/**
 * Image editor — Task 2-c (canvas editing) + Task 2-b (advanced tools).
 * Canvas editing: rotate / flip / crop / resize (destructive, undoable)
 * + non-destructive color filters baked in at save/export time (Web Worker).
 * Task 2-b adds: compress-to-target-size, format conversion and background
 * tools (remove / colour / image), all via pure Canvas APIs (image-tools.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  Crop,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Loader2,
  Minimize2,
  Pipette,
  RefreshCw,
  Repeat,
  RotateCcw,
  RotateCw,
  Save,
  Scaling,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { formatBytes } from '@/lib/format'
import { openFilesWithInput } from '@/lib/fsa'
import { useI18n } from '@/lib/i18n'
import {
  blobToCanvas,
  compressToTarget,
  decodeImageFile,
  flattenOnColour,
  flattenOnImage,
  removeBackground,
} from '@/lib/image-tools'
import type { ViewerEditorProps } from '@/lib/viewer-types'

/* ---------------------------------- consts --------------------------------- */

const UNDO_LIMIT = 15
const MIN_CROP_PX = 8 // minimum crop size in image pixels
const MIN_DIM = 16
const MAX_DIM = 8000

/* ------------------------- task 2-b: advanced tools ------------------------ */

/** Pause long enough for the busy spinner to paint before heavy work. */
const yieldFrame = (): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, 40))

/** Transparency checkerboard (visible in light & dark themes). */
const CHECKERBOARD = 'repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%)'

const BG_COLOURS = ['#ffffff', '#000000', '#0d9488', '#ef4444', '#3b82f6', '#eab308', '#22c55e']

type CompressMime = 'image/jpeg' | 'image/webp'

const COMPRESS_MIMES: { mime: CompressMime; labelKey: string }[] = [
  { mime: 'image/jpeg', labelKey: 'imgFormatJpeg' },
  { mime: 'image/webp', labelKey: 'imgFormatWebp' },
]

const CONVERT_FORMATS: { mime: 'image/jpeg' | 'image/png' | 'image/webp'; labelKey: string }[] = [
  { mime: 'image/jpeg', labelKey: 'imgFormatJpeg' },
  { mime: 'image/png', labelKey: 'imgFormatPng' },
  { mime: 'image/webp', labelKey: 'imgFormatWebp' },
]

const SCALE_PCTS = [25, 50, 75, 100, 200]

interface Filters {
  brightness: number // 50–150, default 100
  contrast: number // 50–150, default 100
  saturation: number // 0–200, default 100
  grayscale: number // 0–100, default 0
  sepia: number // 0–100, default 0
  blur: number // 0–20 px, default 0
}

const DEFAULT_FILTERS: Filters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
}

const SLIDERS: {
  key: keyof Filters
  labelKey: string
  min: number
  max: number
  unit: '%' | 'px'
}[] = [
  { key: 'brightness', labelKey: 'imgBrightness', min: 50, max: 150, unit: '%' },
  { key: 'contrast', labelKey: 'imgContrast', min: 50, max: 150, unit: '%' },
  { key: 'saturation', labelKey: 'imgSaturation', min: 0, max: 200, unit: '%' },
  { key: 'grayscale', labelKey: 'imgGrayscale', min: 0, max: 100, unit: '%' },
  { key: 'sepia', labelKey: 'imgSepia', min: 0, max: 100, unit: '%' },
  { key: 'blur', labelKey: 'imgBlur', min: 0, max: 20, unit: 'px' },
]

const PRESETS: { id: string; labelKey: string; values: Filters }[] = [
  { id: 'none', labelKey: 'imgPresetNone', values: { ...DEFAULT_FILTERS } },
  { id: 'bw', labelKey: 'imgPresetBW', values: { ...DEFAULT_FILTERS, grayscale: 100 } },
  {
    id: 'vintage',
    labelKey: 'imgPresetSepia',
    values: { ...DEFAULT_FILTERS, sepia: 55, contrast: 108, brightness: 105 },
  },
  {
    id: 'vivid',
    labelKey: 'imgPresetVivid',
    values: { ...DEFAULT_FILTERS, saturation: 150, contrast: 110 },
  },
  {
    id: 'cool',
    labelKey: 'imgPresetCool',
    values: { ...DEFAULT_FILTERS, saturation: 115, brightness: 106 },
  },
  {
    id: 'warm',
    labelKey: 'imgPresetWarm',
    values: { ...DEFAULT_FILTERS, sepia: 28, saturation: 125 },
  },
]

function filtersEqual(a: Filters, b: Filters): boolean {
  return (
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.saturation === b.saturation &&
    a.grayscale === b.grayscale &&
    a.sepia === b.sepia &&
    a.blur === b.blur
  )
}

/** CSS filter string from slider values; only non-default parts, '' if all default. */
function buildFilterString(f: Filters): string {
  const parts: string[] = []
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`)
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`)
  if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`)
  if (f.grayscale !== 0) parts.push(`grayscale(${f.grayscale}%)`)
  if (f.sepia !== 0) parts.push(`sepia(${f.sepia}%)`)
  if (f.blur !== 0) parts.push(`blur(${f.blur}px)`)
  return parts.join(' ')
}

/** jpeg → jpeg 0.92, webp → webp 0.92, everything else (incl. gif/avif/heic) → PNG. */
function exportFormat(mime: string): { type: string; quality?: number } {
  if (mime === 'image/jpeg') return { type: 'image/jpeg', quality: 0.92 }
  if (mime === 'image/webp') return { type: 'image/webp', quality: 0.92 }
  return { type: 'image/png' }
}

function clampDim(n: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : MIN_DIM
  return Math.min(MAX_DIM, Math.max(MIN_DIM, v))
}

/* --------------------------------- component -------------------------------- */

export default function ImageEditor({ file, blob, dirty, onDirtyChange, onSave }: ViewerEditorProps) {
  const { t, tf } = useI18n()

  /* ------------------------------- refs / state ------------------------------ */
  const workingRef = useRef<HTMLCanvasElement | null>(null)
  const sourceRef = useRef<ImageBitmap | null>(null)
  const undoStackRef = useRef<HTMLCanvasElement[]>([])
  const workerRef = useRef<Worker | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const geomDirtyRef = useRef(false)
  const dirtyMirrorRef = useRef(dirty)
  const onDirtyRef = useRef(onDirtyChange)
  const loadedIdRef = useRef<string | null>(null)
  const colourTimerRef = useRef<number | null>(null)

  const [decoding, setDecoding] = useState(true)
  const [decodeError, setDecodeError] = useState(false)
  const [workingVersion, setWorkingVersion] = useState(0)
  const [stackDepth, setStackDepth] = useState(0)
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [resizeW, setResizeW] = useState('0')
  const [resizeH, setResizeH] = useState('0')
  const [resizeRatio, setResizeRatio] = useState(1)
  const [keepAspect, setKeepAspect] = useState(true)
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const [dispSize, setDispSize] = useState({ w: 0, h: 0 })

  /* --------------------- task 2-b: advanced-tool state ---------------------- */
  const [busy, setBusy] = useState(false)
  const [compressOpen, setCompressOpen] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [sizeValue, setSizeValue] = useState('200')
  const [sizeUnit, setSizeUnit] = useState<'KB' | 'MB'>('KB')
  const [compressMime, setCompressMime] = useState<CompressMime>('image/jpeg')
  const [convertOpen, setConvertOpen] = useState(false)
  const [formatOverride, setFormatOverride] = useState<string | null>(null)
  const [qualityOverride, setQualityOverride] = useState<number | null>(null)
  const [bgOpen, setBgOpen] = useState(false)
  const [bgTolerance, setBgTolerance] = useState(28)
  const [customColour, setCustomColour] = useState('#ffffff')

  /* ------------------------------ dirty plumbing ----------------------------- */
  useEffect(() => {
    onDirtyRef.current = onDirtyChange
  })

  useEffect(() => {
    dirtyMirrorRef.current = dirty
  }, [dirty])

  const applyDirty = useCallback((d: boolean) => {
    if (dirtyMirrorRef.current === d) return
    dirtyMirrorRef.current = d
    onDirtyRef.current(d)
  }, [])

  /* ------------------------------ source decoding ----------------------------- */
  useEffect(() => {
    if (loadedIdRef.current === file.id) return
    loadedIdRef.current = file.id
    let cancelled = false

    setDecoding(true)
    setDecodeError(false)

    const decode = async () => {
      try {
        if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap unsupported')
        const bmp = await createImageBitmap(blob)
        if (cancelled) {
          try {
            bmp.close()
          } catch {
            /* ignore */
          }
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width
        canvas.height = bmp.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('2d context unavailable')
        ctx.drawImage(bmp, 0, 0)

        sourceRef.current = bmp
        workingRef.current = canvas
        undoStackRef.current = []
        geomDirtyRef.current = false
        setStackDepth(0)
        setFilters({ ...DEFAULT_FILTERS })
        setFormatOverride(null)
        setQualityOverride(null)
        setCropMode(false)
        setCropRect(null)
        setDispSize({ w: 0, h: 0 })
        setWorkingVersion((v) => v + 1)
        setDecoding(false)
        applyDirty(false)
      } catch {
        if (!cancelled) {
          setDecoding(false)
          setDecodeError(true)
        }
      }
    }

    void decode()
    return () => {
      cancelled = true
    }
  }, [file.id, blob, applyDirty])

  /* ------------------------- colour-input timer cleanup ----------------------- */
  useEffect(
    () => () => {
      if (colourTimerRef.current !== null) window.clearTimeout(colourTimerRef.current)
    },
    []
  )

  /* --------------------------- worker (lazy + cleanup) ------------------------ */
  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    []
  )

  const getWorker = (): Worker | null => {
    if (workerRef.current) return workerRef.current
    try {
      if (typeof Worker === 'undefined') return null
      workerRef.current = new Worker('/workers/image-worker.js')
      return workerRef.current
    } catch {
      workerRef.current = null
      return null
    }
  }

  const runWorkerExport = (
    worker: Worker,
    bitmap: ImageBitmap,
    filter: string,
    type: string,
    quality?: number
  ): Promise<Blob> =>
    new Promise<Blob>((resolve, reject) => {
      let settled = false
      const onMessage = (e: MessageEvent) => {
        if (settled) return
        settled = true
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
        const data = e.data as { ok?: boolean; blob?: Blob; error?: string } | null
        if (data && data.ok && data.blob) resolve(data.blob)
        else reject(new Error((data && data.error) || 'worker export failed'))
      }
      const onError = () => {
        if (settled) return
        settled = true
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
        reject(new Error('worker crashed'))
      }
      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)
      worker.postMessage({ bitmap, filter, type, quality }, [bitmap])
    })

  /** Worker export with main-thread fallback. */
  const exportImage = async (): Promise<Blob> => {
    const working = workingRef.current
    if (!working) throw new Error('nothing to export')
    const fallback = exportFormat(file.mime)
    const type = formatOverride ?? fallback.type
    const quality = formatOverride
      ? (qualityOverride ?? (type === 'image/png' ? undefined : 0.92))
      : fallback.quality
    const filter = buildFilterString(filters)

    // JPEG cannot store alpha — flatten onto white first (no-op for opaque pixels).
    const staged = type === 'image/jpeg' ? flattenOnColour(working, '#ffffff') : working

    const canWorker =
      typeof Worker !== 'undefined' &&
      typeof createImageBitmap === 'function' &&
      typeof OffscreenCanvas !== 'undefined'

    if (canWorker) {
      try {
        const bitmap = await createImageBitmap(staged)
        const worker = getWorker()
        if (!worker) throw new Error('worker unavailable')
        return await runWorkerExport(worker, bitmap, filter, type, quality)
      } catch {
        // Terminate the broken worker; it will be recreated on next attempt.
        workerRef.current?.terminate()
        workerRef.current = null
      }
    }

    const out = await new Promise<Blob | null>((resolve) => staged.toBlob(resolve, type, quality))
    if (!out) throw new Error('main-thread export failed')
    return out
  }

  const handleSave = async () => {
    if (saving || !dirty) return
    setSaving(true)
    try {
      const out = await exportImage()
      await onSave(out)
      geomDirtyRef.current = false
      applyDirty(false)
      toast.success(t('tSaved'))
    } catch {
      toast.error(t('tSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------ geometry engine ----------------------------- */
  const runGeometry = (make: (src: HTMLCanvasElement) => HTMLCanvasElement | null) => {
    const src = workingRef.current
    if (!src) return
    const next = make(src)
    if (!next) return

    // Snapshot the previous state for undo (cap 15).
    const snap = document.createElement('canvas')
    snap.width = src.width
    snap.height = src.height
    const sctx = snap.getContext('2d')
    if (!sctx) return
    sctx.drawImage(src, 0, 0)

    const stack = undoStackRef.current
    stack.push(snap)
    while (stack.length > UNDO_LIMIT) stack.shift()
    setStackDepth(stack.length)

    workingRef.current = next
    geomDirtyRef.current = true
    applyDirty(true)
    setWorkingVersion((v) => v + 1)
  }

  const rotate = (cw: boolean) =>
    runGeometry((src) => {
      const canvas = document.createElement('canvas')
      canvas.width = src.height
      canvas.height = src.width
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      if (cw) {
        ctx.translate(canvas.width, 0)
        ctx.rotate(Math.PI / 2)
      } else {
        ctx.translate(0, canvas.height)
        ctx.rotate(-Math.PI / 2)
      }
      ctx.drawImage(src, 0, 0)
      return canvas
    })

  const flip = (horizontal: boolean) =>
    runGeometry((src) => {
      const canvas = document.createElement('canvas')
      canvas.width = src.width
      canvas.height = src.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      if (horizontal) ctx.translate(canvas.width, 0)
      else ctx.translate(0, canvas.height)
      ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1)
      ctx.drawImage(src, 0, 0)
      return canvas
    })

  const handleUndo = () => {
    const stack = undoStackRef.current
    const prev = stack.pop()
    if (!prev) return
    workingRef.current = prev
    setStackDepth(stack.length)
    geomDirtyRef.current = true
    applyDirty(true)
    setWorkingVersion((v) => v + 1)
  }

  const handleReset = () => {
    const bmp = sourceRef.current
    if (!bmp) return
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(bmp, 0, 0)

    workingRef.current = canvas
    undoStackRef.current = []
    geomDirtyRef.current = false
    setStackDepth(0)
    setFilters({ ...DEFAULT_FILTERS })
    setFormatOverride(null)
    setQualityOverride(null)
    setCropMode(false)
    setCropRect(null)
    applyDirty(false)
    setWorkingVersion((v) => v + 1)
  }

  /* --------------------------------- filters --------------------------------- */
  const updateFilters = (next: Filters) => {
    setFilters(next)
    applyDirty(buildFilterString(next) !== '' || geomDirtyRef.current)
  }

  const setFilterValue = (key: keyof Filters, value: number) => {
    updateFilters({ ...filters, [key]: value })
  }

  const activePreset = PRESETS.find((p) => filtersEqual(p.values, filters))?.id ?? null

  /* ---------------------------------- stage ---------------------------------- */
  useEffect(() => {
    if (decoding || decodeError) return
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setStageSize((prev) =>
          Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
            ? prev
            : { w: width, h: height }
        )
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [decoding, decodeError])

  useEffect(() => {
    const working = workingRef.current
    if (!working || stageSize.w <= 0 || stageSize.h <= 0) return
    // Reserve a little vertical room for the crop hint/confirm row.
    const availH = Math.max(64, stageSize.h - (cropMode ? 84 : 0))
    const scale = Math.min(stageSize.w / working.width, availH / working.height, 1)
    const w = Math.max(1, Math.round(working.width * scale))
    const h = Math.max(1, Math.round(working.height * scale))
    setDispSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
  }, [stageSize, workingVersion, cropMode])

  // Repaint preview (working canvas + current filter string) whenever anything changes.
  useEffect(() => {
    const working = workingRef.current
    const preview = previewRef.current
    if (!working || !preview) return
    if (preview.width !== working.width) preview.width = working.width
    if (preview.height !== working.height) preview.height = working.height
    const ctx = preview.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, preview.width, preview.height)
    const fs = buildFilterString(filters)
    ctx.filter = fs || 'none'
    ctx.drawImage(working, 0, 0)
    ctx.filter = 'none'
  }, [filters, dispSize, workingVersion])

  /* ----------------------------------- crop ----------------------------------- */
  const toggleCrop = () => {
    if (cropMode) {
      setCropMode(false)
      setCropRect(null)
    } else {
      setCropRect(null)
      setCropMode(true)
    }
  }

  const cropPoint = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(Math.max(0, e.clientX - rect.left), rect.width),
      y: Math.min(Math.max(0, e.clientY - rect.top), rect.height),
    }
  }

  const onCropPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const p = cropPoint(e)
    dragStartRef.current = p
    setCropRect({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  const onCropPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start) return
    const p = cropPoint(e)
    setCropRect({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    })
  }

  const onCropPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const exitCrop = () => {
    setCropMode(false)
    setCropRect(null)
  }

  const applyCrop = () => {
    const working = workingRef.current
    if (!working || !cropRect) return
    // Ignore accidental taps: require a real drag on screen.
    if (cropRect.w < 2 || cropRect.h < 2) {
      exitCrop()
      return
    }
    const scale = dispSize.w > 0 ? working.width / dispSize.w : 1
    const sx = Math.round(cropRect.x * scale)
    const sy = Math.round(cropRect.y * scale)
    const sw = Math.round(cropRect.w * scale)
    const sh = Math.round(cropRect.h * scale)
    const cx = Math.min(Math.max(0, sx), Math.max(0, working.width - MIN_CROP_PX))
    const cy = Math.min(Math.max(0, sy), Math.max(0, working.height - MIN_CROP_PX))
    const cw = Math.min(Math.max(MIN_CROP_PX, sw), working.width - cx)
    const ch = Math.min(Math.max(MIN_CROP_PX, sh), working.height - cy)

    runGeometry((src) => {
      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch)
      return canvas
    })
    exitCrop()
  }

  /* ---------------------------------- resize ---------------------------------- */
  const openResize = () => {
    const working = workingRef.current
    if (!working) return
    setResizeW(String(working.width))
    setResizeH(String(working.height))
    setResizeRatio(working.height > 0 ? working.width / working.height : 1)
    setResizeOpen(true)
  }

  const handleResizeWidth = (value: string) => {
    setResizeW(value)
    if (!keepAspect || resizeRatio <= 0) return
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) setResizeH(String(Math.max(1, Math.round(n / resizeRatio))))
  }

  const handleResizeHeight = (value: string) => {
    setResizeH(value)
    if (!keepAspect || resizeRatio <= 0) return
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) setResizeW(String(Math.max(1, Math.round(n * resizeRatio))))
  }

  const applyResize = () => {
    const w = clampDim(Number(resizeW))
    const h = keepAspect && resizeRatio > 0 ? clampDim(w / resizeRatio) : clampDim(Number(resizeH))
    runGeometry((src) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(src, 0, 0, w, h)
      return canvas
    })
    setResizeOpen(false)
  }

  /** Quick-scale helper: preset the W/H fields from a percentage of the image. */
  const applyScalePct = (pct: number) => {
    const working = workingRef.current
    if (!working) return
    const w = clampDim(Math.round((working.width * pct) / 100))
    const h =
      keepAspect && resizeRatio > 0
        ? clampDim(w / resizeRatio)
        : clampDim(Math.round((working.height * pct) / 100))
    setResizeW(String(w))
    setResizeH(String(h))
  }

  /* ------------------------- task 2-b: advanced tools ------------------------- */
  const activeMime = formatOverride ?? exportFormat(file.mime).type

  /** Pure re-encode: pixels stay untouched, the export format/quality changes. */
  const convertTo = (mime: 'image/jpeg' | 'image/png' | 'image/webp') => {
    if (busy || compressing) return
    if (activeMime === mime) return
    setFormatOverride(mime)
    setQualityOverride(mime === 'image/png' ? null : 0.92)
    applyDirty(true)
  }

  const applyCompress = async () => {
    const working = workingRef.current
    if (!working || busy || compressing) return
    const sizeNum = Number(sizeValue)
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) return
    const targetBytes = Math.max(
      1024, // never ask for less than 1 KB
      Math.round(sizeNum * (sizeUnit === 'KB' ? 1024 : 1024 * 1024))
    )
    const mime = compressMime
    const opFileId = file.id

    setCompressing(true)
    setBusy(true)
    try {
      await yieldFrame()
      if (loadedIdRef.current !== opFileId) return
      // JPEG has no alpha channel — composite onto white before measuring.
      const srcCanvas = mime === 'image/jpeg' ? flattenOnColour(working, '#ffffff') : working
      const result = await compressToTarget(srcCanvas, targetBytes, mime)
      if (loadedIdRef.current !== opFileId) return
      const decoded = await blobToCanvas(result.blob)
      if (loadedIdRef.current !== opFileId) return

      setFormatOverride(mime)
      setQualityOverride(result.quality)
      runGeometry(() => decoded)
      if (result.blob.size <= targetBytes) {
        toast.success(tf('imgCompressedTo', { size: formatBytes(result.blob.size) }))
      } else {
        toast.info(t('imgCompressFailed'))
      }
      setCompressOpen(false)
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setCompressing(false)
      setBusy(false)
    }
  }

  const applyRemoveBg = async () => {
    if (busy) return
    const opFileId = file.id
    setBusy(true)
    try {
      await yieldFrame()
      if (loadedIdRef.current !== opFileId) return
      runGeometry((src) => {
        const ctx = src.getContext('2d', { willReadFrequently: true })
        if (!ctx) return null
        const imageData = ctx.getImageData(0, 0, src.width, src.height)
        const cleaned = removeBackground(imageData, bgTolerance)
        const out = document.createElement('canvas')
        out.width = cleaned.width
        out.height = cleaned.height
        const octx = out.getContext('2d')
        if (!octx) return null
        octx.putImageData(cleaned, 0, 0)
        return out
      })
      toast.success(t('imgBgApplied'))
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setBusy(false)
    }
  }

  const applyBgColour = (colour: string) => {
    if (busy) return
    runGeometry((src) => flattenOnColour(src, colour))
    toast.success(t('imgBgApplied'))
  }

  /** Native colour input fires continuously while dragging — debounce applies. */
  const onCustomColour = (value: string) => {
    setCustomColour(value)
    if (colourTimerRef.current !== null) window.clearTimeout(colourTimerRef.current)
    colourTimerRef.current = window.setTimeout(() => {
      colourTimerRef.current = null
      applyBgColour(value)
    }, 350)
  }

  const applyBgImage = async () => {
    if (busy) return
    const opFileId = file.id
    setBusy(true)
    try {
      const [picked] = await openFilesWithInput('image/*', false)
      if (!picked) return
      if (loadedIdRef.current !== opFileId) return
      const background = await decodeImageFile(picked)
      if (loadedIdRef.current !== opFileId) return
      runGeometry((src) => flattenOnImage(src, background))
      if (!(background instanceof HTMLImageElement)) {
        try {
          background.close()
        } catch {
          /* ignore */
        }
      }
      toast.success(t('imgBgApplied'))
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setBusy(false)
    }
  }

  /* --------------------------------- renders --------------------------------- */
  if (decodeError) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center p-6">
        <Card className="w-full max-w-xs text-center text-sm text-muted-foreground">
          {t('errGeneric')}
        </Card>
      </div>
    )
  }

  if (decoding) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6">
        <Skeleton className="h-44 w-44 rounded-md" />
        <p className="text-xs text-muted-foreground">{t('imgProcessing')}</p>
      </div>
    )
  }

  const hasSelection = !!cropRect && cropRect.w > 0 && cropRect.h > 0

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar — geometry */}
      <div className="no-touch-callout flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background/95 px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgRotateLeft')}
          aria-label={t('imgRotateLeft')}
          onClick={() => rotate(false)}
        >
          <RotateCcw />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgRotateRight')}
          aria-label={t('imgRotateRight')}
          onClick={() => rotate(true)}
        >
          <RotateCw />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgFlipH')}
          aria-label={t('imgFlipH')}
          onClick={() => flip(true)}
        >
          <FlipHorizontal2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgFlipV')}
          aria-label={t('imgFlipV')}
          onClick={() => flip(false)}
        >
          <FlipVertical2 />
        </Button>
        <Button
          variant={cropMode ? 'secondary' : 'ghost'}
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgCrop')}
          aria-label={t('imgCrop')}
          onClick={toggleCrop}
        >
          <Crop />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgResize')}
          aria-label={t('imgResize')}
          onClick={openResize}
        >
          <Scaling />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgCompress')}
          aria-label={t('imgCompress')}
          onClick={() => setCompressOpen(true)}
        >
          <Minimize2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgFormat')}
          aria-label={t('imgFormat')}
          onClick={() => setConvertOpen(true)}
        >
          <Repeat />
        </Button>
        <Button
          variant={bgOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgBackground')}
          aria-label={t('imgBackground')}
          onClick={() => setBgOpen((o) => !o)}
        >
          <Eraser />
        </Button>
        <Separator orientation="vertical" className="h-6 shrink-0" />
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgUndo')}
          aria-label={t('imgUndo')}
          disabled={stackDepth === 0}
          onClick={handleUndo}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('reset')}
          aria-label={t('reset')}
          onClick={handleReset}
        >
          <RefreshCw />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('save')}
          aria-label={t('save')}
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
        </Button>
        <Button
          variant={filtersOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="h-10 w-10 shrink-0"
          title={t('imgFilters')}
          aria-label={t('imgFilters')}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal />
        </Button>
      </div>

      {/* Filters panel (non-destructive; baked in on save) */}
      {filtersOpen && (
        <div className="shrink-0 space-y-3 border-b bg-card px-3 py-3">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">{t('imgPresets')}</Label>
            <div className="no-touch-callout flex flex-1 gap-1.5 overflow-x-auto pb-0.5">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant={activePreset === preset.id ? 'default' : 'secondary'}
                  size="sm"
                  className="h-8 shrink-0 rounded-full px-3"
                  onClick={() => updateFilters({ ...preset.values })}
                >
                  {t(preset.labelKey)}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {SLIDERS.map((slider) => (
              <div key={slider.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t(slider.labelKey)}</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {filters[slider.key]}
                    {slider.unit}
                  </span>
                </div>
                <Slider
                  min={slider.min}
                  max={slider.max}
                  step={1}
                  value={[filters[slider.key]]}
                  onValueChange={(value) =>
                    setFilterValue(
                      slider.key,
                      Array.isArray(value) && value.length > 0 ? value[0] : filters[slider.key]
                    )
                  }
                  aria-label={t(slider.labelKey)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Background tools panel (Task 2-b) */}
      {bgOpen && (
        <div className="shrink-0 space-y-3 border-b bg-card px-3 py-3">
          <p className="text-xs text-muted-foreground">{t('imgBgRemoveHint')}</p>
          <div className="flex items-center justify-between gap-3">
            <Label className="shrink-0 text-xs text-muted-foreground">{t('imgBgTolerance')}</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{bgTolerance}</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[bgTolerance]}
            onValueChange={(value) =>
              setBgTolerance(Array.isArray(value) && value.length > 0 ? value[0] : bgTolerance)
            }
            aria-label={t('imgBgTolerance')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-10 gap-2"
              onClick={applyRemoveBg}
              disabled={busy}
            >
              <Eraser className="h-4 w-4" />
              {t('imgBgRemove')}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="h-3.5 w-3.5 rounded-sm border border-border"
                style={{ backgroundImage: CHECKERBOARD, backgroundSize: '8px 8px' }}
              />
              {t('imgBgTransparent')}
            </span>
          </div>
          <Separator />
          <Label className="text-xs text-muted-foreground">{t('imgBgColor')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            {BG_COLOURS.map((colour) => (
              <Button
                key={colour}
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full border-border"
                style={{ backgroundColor: colour }}
                aria-label={colour}
                title={colour}
                disabled={busy}
                onClick={() => applyBgColour(colour)}
              />
            ))}
            <label
              className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border"
              title={t('imgBgColor')}
            >
              <Pipette className="h-4 w-4 text-muted-foreground" />
              <input
                type="color"
                value={customColour}
                aria-label={t('imgBgColor')}
                disabled={busy}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => onCustomColour(e.target.value)}
              />
            </label>
          </div>
          <Separator />
          <Label className="text-xs text-muted-foreground">{t('imgBgImage')}</Label>
          <div>
            <Button
              size="sm"
              variant="secondary"
              className="h-10 gap-2"
              onClick={applyBgImage}
              disabled={busy}
            >
              <ImagePlus className="h-4 w-4" />
              {t('imgBgPickImage')}
            </Button>
          </div>
        </div>
      )}

      {/* Canvas stage */}
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/40 p-3 dark:bg-muted/20"
      >
        <div className="flex flex-col items-center gap-2">
          {cropMode && <p className="text-xs text-muted-foreground">{t('imgCropHint')}</p>}
          <div
            className="relative inline-block overflow-hidden rounded-sm"
            style={{ backgroundImage: CHECKERBOARD, backgroundSize: '12px 12px' }}
          >
            {dispSize.w > 0 && (
              <canvas
                ref={previewRef}
                className="max-w-full rounded-sm shadow-md"
                style={{ width: dispSize.w, height: dispSize.h }}
              />
            )}
            {cropMode && (
              <div
                className="absolute inset-0 z-10 cursor-crosshair touch-none select-none"
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                onPointerCancel={onCropPointerUp}
              >
                {hasSelection && cropRect && (
                  <div
                    className="pointer-events-none absolute border-2 border-dashed border-white/90"
                    style={{
                      left: cropRect.x,
                      top: cropRect.y,
                      width: cropRect.w,
                      height: cropRect.h,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                    }}
                  />
                )}
              </div>
            )}
          </div>
          {cropMode && (
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" className="h-10 px-4" onClick={applyCrop} disabled={!hasSelection}>
                {t('imgCropApply')}
              </Button>
              <Button size="sm" variant="ghost" className="h-10 px-4" onClick={exitCrop}>
                {t('cancel')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Resize dialog */}
      <Dialog
        open={resizeOpen}
        onOpenChange={(open) => {
          if (!open) setResizeOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('imgResizeTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="img-resize-w">{t('imgWidth')}</Label>
              <Input
                id="img-resize-w"
                type="number"
                inputMode="numeric"
                min={MIN_DIM}
                max={MAX_DIM}
                value={resizeW}
                onChange={(e) => handleResizeWidth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="img-resize-h">{t('imgHeight')}</Label>
              <Input
                id="img-resize-h"
                type="number"
                inputMode="numeric"
                min={MIN_DIM}
                max={MAX_DIM}
                value={resizeH}
                onChange={(e) => handleResizeHeight(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="img-keep-aspect" checked={keepAspect} onCheckedChange={setKeepAspect} />
            <Label htmlFor="img-keep-aspect" className="text-sm font-normal">
              {t('imgKeepAspect')}
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('imgResizePct')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {SCALE_PCTS.map((pct) => (
                <Button
                  key={pct}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 min-w-12 rounded-full px-3 tabular-nums"
                  onClick={() => applyScalePct(pct)}
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResizeOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={applyResize}>{t('apply')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Format convert dialog (Task 2-b) — tap a format to re-encode */}
      <Dialog
        open={convertOpen}
        onOpenChange={(open) => {
          if (!open) setConvertOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-xs" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('imgFormat')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-1.5">
            {CONVERT_FORMATS.map((format) => (
              <Button
                key={format.mime}
                type="button"
                variant={activeMime === format.mime ? 'default' : 'secondary'}
                className="h-11 rounded-full"
                aria-pressed={activeMime === format.mime}
                disabled={busy || compressing}
                onClick={() => convertTo(format.mime)}
              >
                {t(format.labelKey)}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertOpen(false)}>
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compress-to-target dialog (Task 2-b) */}
      <Dialog
        open={compressOpen}
        onOpenChange={(open) => {
          if (!open) setCompressOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('imgCompressTitle')}</DialogTitle>
            <DialogDescription>{t('imgTargetSizeDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="img-target-size">{t('targetSize')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="img-target-size"
                type="number"
                inputMode="decimal"
                min={1}
                className="h-10 flex-1"
                value={sizeValue}
                onChange={(e) => setSizeValue(e.target.value)}
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={sizeUnit === 'KB' ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 px-3"
                  aria-pressed={sizeUnit === 'KB'}
                  onClick={() => setSizeUnit('KB')}
                >
                  {t('sizeKB')}
                </Button>
                <Button
                  type="button"
                  variant={sizeUnit === 'MB' ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 px-3"
                  aria-pressed={sizeUnit === 'MB'}
                  onClick={() => setSizeUnit('MB')}
                >
                  {t('sizeMB')}
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('imgFormat')}</Label>
            <div className="flex gap-1.5">
              {COMPRESS_MIMES.map((format) => (
                <Button
                  key={format.mime}
                  type="button"
                  variant={compressMime === format.mime ? 'default' : 'secondary'}
                  className="h-10 flex-1 rounded-full"
                  aria-pressed={compressMime === format.mime}
                  onClick={() => setCompressMime(format.mime)}
                >
                  {t(format.labelKey)}
                </Button>
              ))}
            </div>
            {/* PNG is lossless and cannot be size-targeted, so it is not offered here. */}
          </div>
          {compressing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('imgEstimating')}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompressOpen(false)} disabled={compressing}>
              {t('cancel')}
            </Button>
            <Button
              onClick={applyCompress}
              disabled={compressing || busy || !(Number(sizeValue) > 0)}
            >
              {compressing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Busy overlay (Task 2-b) — blocks interaction during heavy operations */}
      {busy && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">{t('imgProcessing')}</span>
        </div>
      )}
    </div>
  )
}
