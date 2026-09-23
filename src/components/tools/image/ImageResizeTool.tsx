'use client'

/**
 * Resize & crop — by pixels (with keep-aspect), by percent (5–400), or
 * crop to a preset aspect ratio (1:1, 4:3, 16:9, …) with center/top
 * gravity. Output is always PNG to preserve quality.
 */

import { useState } from 'react'
import { Scaling } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
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
import { Switch } from '@/components/ui/switch'

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
import { resultName, runToolBatch } from '@/lib/tools/batch'
import { cropToRatio, resizeImage, type CropGravity } from '@/lib/tools/image-tools-advanced'
import { useI18n } from '@/lib/i18n'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

type Mode = 'pixels' | 'percent' | 'ratio'

const RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'] as const

export default function ImageResizeTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Options
  const [mode, setMode] = useState<Mode>('pixels')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [keepAspect, setKeepAspect] = useState(true)
  const [percent, setPercent] = useState(100)
  const [ratio, setRatio] = useState<string>('1:1')
  const [gravity, setGravity] = useState<CropGravity>('center')

  const widthNum = Math.max(0, Number(width) || 0)
  const heightNum = Math.max(0, Number(height) || 0)
  const pixelsInvalid = mode === 'pixels' && widthNum === 0 && heightNum === 0

  const run = async () => {
    if (files.length === 0 || pixelsInvalid) {
      if (pixelsInvalid) toast.error(t('imgNeedDimension'))
      return
    }
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const [rw, rh] = ratio.split(':').map(Number)
      const outcome = await runToolBatch(
        files,
        async (file) => {
          let blob: Blob
          let suffix: string
          if (mode === 'pixels') {
            blob = await resizeImage(file, {
              width: widthNum > 0 ? widthNum : undefined,
              height: heightNum > 0 ? heightNum : undefined,
              keepAspect,
            })
            suffix = '-resized'
          } else if (mode === 'percent') {
            blob = await resizeImage(file, { percent })
            suffix = '-resized'
          } else {
            blob = await cropToRatio(file, { w: rw, h: rh }, gravity)
            suffix = '-cropped'
          }
          return [{ name: resultName(file.name, suffix, 'png'), blob }]
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
      icon={<Scaling />}
      title={t('toolImageResize')}
      desc={t('toolImageResizeDesc')}
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
        <ToolField label={t('imgResizeMode')}>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {(
              [
                ['pixels', t('imgResizePixels')],
                ['percent', t('imgResizePercent')],
                ['ratio', t('imgResizeRatio')],
              ] as const
            ).map(([value, label]) => (
              <div
                key={value}
                className="flex min-h-11 items-center gap-2.5 rounded-xl border border-input p-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
              >
                <RadioGroupItem value={value} id={`resize-mode-${value}`} />
                <label htmlFor={`resize-mode-${value}`} className="cursor-pointer text-sm">
                  {label}
                </label>
              </div>
            ))}
          </RadioGroup>
        </ToolField>

        {mode === 'pixels' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ToolField label={t('imgWidth')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="1920"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  disabled={busy}
                  className="h-11"
                />
              </ToolField>
              <ToolField label={t('imgHeight')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="1080"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  disabled={busy}
                  className="h-11"
                />
              </ToolField>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-input p-3">
              <Label htmlFor="resize-keep-aspect" className="text-sm">
                {t('imgKeepAspect')}
              </Label>
              <Switch
                id="resize-keep-aspect"
                checked={keepAspect}
                onCheckedChange={setKeepAspect}
                disabled={busy}
              />
            </div>
          </>
        )}

        {mode === 'percent' && (
          <ToolField label={tf('imgScaleValue', { p: percent })}>
            <Slider
              value={[percent]}
              min={5}
              max={400}
              step={5}
              onValueChange={(v) => setPercent(v[0] ?? percent)}
              disabled={busy}
              aria-label={t('imgResizePercent')}
            />
          </ToolField>
        )}

        {mode === 'ratio' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToolField label={t('imgRatioLabel')}>
              <Select value={ratio} onValueChange={setRatio} disabled={busy}>
                <SelectTrigger className="h-11 w-full" aria-label={t('imgRatioLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIOS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ToolField>
            <ToolField label={t('imgGravityLabel')}>
              <Select
                value={gravity}
                onValueChange={(v) => setGravity(v as CropGravity)}
                disabled={busy}
              >
                <SelectTrigger className="h-11 w-full" aria-label={t('imgGravityLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="center">{t('imgGravityCenter')}</SelectItem>
                  <SelectItem value="top">{t('imgGravityTop')}</SelectItem>
                </SelectContent>
              </Select>
            </ToolField>
          </div>
        )}
      </ToolOptionsCard>

      {progress && <ToolProgressBar value={progress.value} label={progress.label} />}

      <ToolRunButton busy={busy} disabled={files.length === 0 || pixelsInvalid} onClick={run}>
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
