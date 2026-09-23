'use client'

/**
 * Format converter — JPEG / PNG / WebP output. HEIC/HEIF (iPhone) inputs
 * are transcoded via heic2any before the canvas encode. JPEG output is
 * flattened onto white first (no alpha support).
 */

import { useState } from 'react'
import { Repeat } from 'lucide-react'
import { toast } from 'sonner'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
import { replaceExt, runToolBatch } from '@/lib/tools/batch'
import { convertImage, IMAGE_EXT } from '@/lib/tools/image-tools-advanced'
import { useI18n } from '@/lib/i18n'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import type { ImageOutFormat } from '@/lib/tools/image-tools-advanced'

export default function ImageConvertTool() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const [fmt, setFmt] = useState<ImageOutFormat>('jpeg')

  const run = async () => {
    if (files.length === 0) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const outcome = await runToolBatch(
        files,
        async (file) => {
          const blob = await convertImage(file, fmt)
          return [{ name: replaceExt(file.name, IMAGE_EXT[fmt]), blob }]
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
      icon={<Repeat />}
      title={t('toolImageConvert')}
      desc={t('toolImageConvertDesc')}
    >
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="image/*,.heic,.heif"
        files={files}
        onFiles={setFiles}
        onRemove={(i) => setFiles(files.filter((_, j) => j !== i))}
        disabled={busy}
      />

      <ToolOptionsCard title={t('imgOptionsLabel')}>
        <ToolField label={t('imgConvertTo')} hint={t('imgHeicNote')}>
          <Select value={fmt} onValueChange={(v) => setFmt(v as ImageOutFormat)} disabled={busy}>
            <SelectTrigger className="h-11 w-full" aria-label={t('imgConvertTo')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jpeg">JPEG</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="webp">WebP</SelectItem>
            </SelectContent>
          </Select>
        </ToolField>
      </ToolOptionsCard>

      {progress && <ToolProgressBar value={progress.value} label={progress.label} />}

      <ToolRunButton busy={busy} disabled={files.length === 0} onClick={run}>
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
