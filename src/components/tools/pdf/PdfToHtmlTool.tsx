'use client'

/**
 * PDF → HTML — extracts the text layer (pdf.js) and emits one standalone
 * .html file (inline CSS only, no external resources): a <section> per
 * page with an "Page N" heading and a pre-wrapped text block.
 */

import { useState } from 'react'
import { Globe } from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolDropzone,
  ToolOptionsCard,
  ToolProgressBar,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { pdfToHtml } from '@/lib/tools/pdf-convert'
import { errMessage, replaceExt } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

export default function PdfToHtmlTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const file = files[0] ?? null

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
  }

  const run = async () => {
    if (!file || busy) return
    setBusy(true)
    setProgress(0)
    setProgressLabel('')
    setResults([])
    setFailed([])
    try {
      const blob = await pdfToHtml(file, {
        onProgress: (done, total) => {
          setProgress(done / Math.max(1, total))
          setProgressLabel(tf('pdfPageN', { n: done }) + ` / ${total}`)
        },
        pageLabel: (n) => tf('pdfPageN', { n }),
      })
      setResults([{ name: replaceExt(file.name, 'html'), blob }])
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<Globe />} title={t('toolPdfToHtml')} desc={t('toolPdfToHtmlDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="application/pdf"
        multiple={false}
        files={file ? [file] : []}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy}
      />

      <ToolOptionsCard>
        <p className="text-xs text-muted-foreground">{t('pdfHtmlHint')}</p>

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!file}>
          {t('toolRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={Math.max(0.03, progress)} label={progressLabel} />}
      </ToolOptionsCard>

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
