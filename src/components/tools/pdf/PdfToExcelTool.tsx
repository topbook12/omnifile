'use client'

/**
 * PDF → Excel — extracts the text layer (pdf.js) and rebuilds it as an
 * .xlsx workbook (xlsx lib), one sheet per page with a cheap column-split
 * heuristic per line. Scanned PDFs (no text layer) get a pointer to the
 * OCR tool via the shared pdfErrNoText error.
 */

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
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
import { pdfToXlsx } from '@/lib/tools/pdf-convert'
import { errMessage, replaceExt } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

export default function PdfToExcelTool() {
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
      const blob = await pdfToXlsx(file, (done, total) => {
        setProgress(done / Math.max(1, total))
        setProgressLabel(tf('pdfPageN', { n: done }) + ` / ${total}`)
      })
      setResults([{ name: replaceExt(file.name, 'xlsx'), blob }])
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<FileSpreadsheet />} title={t('toolPdfToExcel')} desc={t('toolPdfToExcelDesc')}>
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
        <p className="text-xs text-muted-foreground">{t('pdfXlsxHint')}</p>

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
