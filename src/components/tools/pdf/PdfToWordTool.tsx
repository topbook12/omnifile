'use client'

/**
 * PDF → Word / TXT — extracts the text layer (pdf.js) and rebuilds it as a
 * .docx (docx lib, one heading + paragraphs per page) or plain .txt.
 * Scanned PDFs (no text layer) get a pointer to the OCR tool.
 */

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'

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
import {
  errMessage,
  pdfExtractText,
  pdfToDocx,
  replaceExt,
  totalTextLength,
} from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'

type WordFormat = 'docx' | 'txt'

export default function PdfToWordTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [format, setFormat] = useState<WordFormat>('docx')
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
      const onProgress = (done: number, total: number) => {
        setProgress(done / Math.max(1, total))
        setProgressLabel(tf('pdfPageN', { n: done }) + ` / ${total}`)
      }

      if (format === 'docx') {
        const blob = await pdfToDocx(file, {
          onProgress,
          pageLabel: (n) => tf('pdfPageN', { n }),
        })
        setResults([{ name: replaceExt(file.name, 'docx'), blob }])
      } else {
        const pages = await pdfExtractText(file, onProgress)
        if (totalTextLength(pages) < 5) throw new Error('pdfToWordNoText')
        const text = pages.filter(Boolean).join('\n\n')
        setResults([
          {
            name: replaceExt(file.name, 'txt'),
            blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
          },
        ])
      }
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<FileText />} title={t('toolPdfToWord')} desc={t('toolPdfToWordDesc')}>
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

      <ToolOptionsCard title={t('pdfWordFormat')}>
        <RadioGroup
          value={format}
          onValueChange={(v) => setFormat(v as WordFormat)}
          className="gap-3"
        >
          {(
            [
              ['docx', 'pdfWordDocx'],
              ['txt', 'pdfWordTxt'],
            ] as Array<[WordFormat, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-word-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-word-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>

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
