'use client'

/**
 * PDF Merge — combine several PDFs into one, in selection order.
 * 100% on-device via @cantoo/pdf-lib (see pdf-tools-advanced.ts).
 */

import { useState } from 'react'
import { Combine } from 'lucide-react'
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
import { errMessage, mergePdfs, pdfResultName } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

export default function PdfMergeTool() {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const addFiles = (incoming: File[]) => setFiles((prev) => [...prev, ...incoming])
  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index))

  const run = async () => {
    if (files.length < 2) {
      toast.error(t('pdfErrNeedTwo'))
      return
    }
    setBusy(true)
    setProgress(0)
    setResults([])
    setFailed([])
    try {
      const blob = await mergePdfs(files, (done, total) =>
        setProgress(done / Math.max(1, total))
      )
      setResults([{ name: pdfResultName.merged(), blob }])
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<Combine />} title={t('toolPdfMerge')} desc={t('toolPdfMergeDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="application/pdf"
        multiple
        files={files}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy}
      />
      {files.length > 1 && <p className="text-xs text-muted-foreground">{t('pdfMergeOrderHint')}</p>}

      <ToolOptionsCard>
        <ToolRunButton onClick={() => void run()} busy={busy} disabled={files.length < 2}>
          {t('toolRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={Math.max(0.05, progress)} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}
