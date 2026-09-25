'use client'

/**
 * Form data extractor — read every AcroForm field of a PDF (name / type /
 * value / options) into a preview table and export the data as CSV or XLSX.
 * 100% on-device.
 */

import { useState } from 'react'
import { FileSearch, FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolDropzone,
  ToolOptionsCard,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'
import { extractFormRows, rowsToXlsx, type FormFieldInfo } from '@/lib/tools/pdf-forms'
import { errMessage, resultName } from '@/lib/tools/pdf-tools-advanced'
import { saveOrDownloadBlob } from '@/lib/fsa'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

const TYPE_LABEL_KEYS: Record<FormFieldInfo['type'], string> = {
  text: 'pdfFormTypeText',
  checkbox: 'pdfFormTypeCheckbox',
  radio: 'pdfFormTypeRadio',
  dropdown: 'pdfFormTypeDropdown',
  button: 'pdfFormTypeButton',
  optionlist: 'pdfFormTypeOptionlist',
  signature: 'pdfFormTypeSignature',
}

export default function PdfFormExtractTool() {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [fields, setFields] = useState<FormFieldInfo[]>([])
  const [csv, setCsv] = useState('')
  const [xlsx, setXlsx] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const file = files[0] ?? null

  const addFiles = (incoming: File[]) => {
    setFields([])
    setCsv('')
    setXlsx(null)
    setResults([])
    setFailed([])
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setFields([])
    setCsv('')
    setXlsx(null)
    setResults([])
    setFailed([])
  }

  const downloadCsv = async () => {
    if (!csv || !file) return
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    await saveOrDownloadBlob(blob, resultName(file.name, '-form-data', 'csv'))
    toast.success(t('tDownloadStarted'))
  }
  const downloadXlsx = async () => {
    if (!xlsx || !file) return
    await saveOrDownloadBlob(xlsx, resultName(file.name, '-form-data', 'xlsx'))
    toast.success(t('tDownloadStarted'))
  }

  const run = async () => {
    if (!file || busy) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const extracted = await extractFormRows(file)
      const workbook = await rowsToXlsx(extracted.fields)
      setFields(extracted.fields)
      setCsv(extracted.csv)
      setXlsx(workbook)
      // XLSX first (primary export), CSV as the second result file.
      setResults([
        { name: resultName(file.name, '-form-data', 'xlsx'), blob: workbook },
        {
          name: resultName(file.name, '-form-data', 'csv'),
          blob: new Blob(['\uFEFF' + extracted.csv], { type: 'text/csv;charset=utf-8' }),
        },
      ])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<FileSearch />} title={t('toolPdfFormExtract')} desc={t('toolPdfFormExtractDesc')}>
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

      <ToolRunButton onClick={() => void run()} busy={busy} disabled={!file}>
        {t('toolRun')}
      </ToolRunButton>

      {fields.length > 0 && (
        <ToolOptionsCard title={`${t('toolPdfFormExtract')} — ${fields.length}`}>
          <div className="max-h-96 overflow-y-auto rounded-xl border [scrollbar-width:thin]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 bg-background">{t('pdfFormColName')}</TableHead>
                  <TableHead className="sticky top-0 bg-background">{t('pdfFormColType')}</TableHead>
                  <TableHead className="sticky top-0 bg-background">{t('pdfFormColValue')}</TableHead>
                  <TableHead className="sticky top-0 bg-background">{t('pdfFormColOptions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((f, i) => (
                  <TableRow key={`${f.name}-${i}`}>
                    <TableCell className="max-w-40 truncate font-medium">{f.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {t(TYPE_LABEL_KEYS[f.type])}
                    </TableCell>
                    <TableCell className="max-w-56 break-words whitespace-pre-wrap">
                      {f.value || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-40 break-words text-xs text-muted-foreground">
                      {(f.options ?? []).join(' | ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="h-11 flex-1 gap-2" onClick={() => void downloadCsv()}>
              <FileText className="h-4 w-4" aria-hidden />
              {t('pdfFormDownloadCsv')}
            </Button>
            <Button className="h-11 flex-1 gap-2" onClick={() => void downloadXlsx()}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              {t('pdfFormDownloadXlsx')}
            </Button>
          </div>
        </ToolOptionsCard>
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
