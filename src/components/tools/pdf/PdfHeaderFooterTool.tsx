'use client'

/**
 * PDF Header, Footer & Page Numbers (Task 2-b) — running headers/footers
 * with {n} {total} {title} {date} placeholders (live preview for page 1),
 * plus optional document metadata. One run applies both via
 * stampHeaderFooter + setPdfMetadata sequentially (pdf-pages.ts).
 */

import { useState } from 'react'
import { Type } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { baseName, resultName } from '@/lib/tools/batch'
import { applyPlaceholders, setPdfMetadata, stampHeaderFooter, type StampTexts } from '@/lib/tools/pdf-pages'
import { closePdfDoc, errMessage, pdfjsDoc } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

type BandKey = 'left' | 'center' | 'right'
const BAND_KEYS: Array<[BandKey, string]> = [
  ['left', 'pdfHfLeft'],
  ['center', 'pdfHfCenter'],
  ['right', 'pdfHfRight'],
]

export default function PdfHeaderFooterTool() {
  const { t, lang } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  // Header / footer bands.
  const [header, setHeader] = useState<StampTexts>({})
  const [footer, setFooter] = useState<StampTexts>({})
  const [fontSize, setFontSize] = useState(10)
  const [color, setColor] = useState('#000000')
  const [margin, setMargin] = useState('36')
  const [start, setStart] = useState('1')
  const [skipFirst, setSkipFirst] = useState(false)

  // Metadata (all optional).
  const [metaTitle, setMetaTitle] = useState('')
  const [metaAuthor, setMetaAuthor] = useState('')
  const [metaSubject, setMetaSubject] = useState('')
  const [metaKeywords, setMetaKeywords] = useState('')

  const file = files[0] ?? null

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    const f = incoming[0]
    setFiles(f ? [f] : [])
    setPageCount(null)
    if (f) void readPageCount(f)
  }

  const removeFile = () => {
    setFiles([])
    setPageCount(null)
    setResults([])
    setFailed([])
  }

  /** Quick pdf.js open — validates the file and reads {total} for the preview. */
  const readPageCount = async (f: File) => {
    try {
      const doc = await pdfjsDoc(f)
      setPageCount(doc.numPages)
      await closePdfDoc(doc)
    } catch (err) {
      toast.error(errMessage(err, t))
      setFiles([])
      setPageCount(null)
    }
  }

  const setBand = (band: 'header' | 'footer', key: BandKey, value: string) => {
    const setter = band === 'header' ? setHeader : setFooter
    setter((prev) => ({ ...prev, [key]: value }))
  }

  const marginNum = Math.max(0, Number(margin) || 0)
  const startNum = Number.isFinite(Number(start)) && start !== '' ? Math.max(0, Math.floor(Number(start))) : 1
  const hasHf = [...Object.values(header), ...Object.values(footer)].some((v) => v?.trim())
  const hasMeta = [metaTitle, metaAuthor, metaSubject, metaKeywords].some((v) => v.trim())
  const ready = Boolean(file) && !busy && (hasHf || hasMeta)

  /* Live preview: placeholders replaced the way page 1 will be stamped. */
  const previewVars = {
    n: startNum,
    total: pageCount ?? '—',
    title: metaTitle.trim() || (file ? baseName(file.name) : '—'),
    date: new Date().toLocaleDateString(lang),
  }
  const bandPreview = (band: StampTexts): string =>
    [band.left, band.center, band.right]
      .filter((s) => s?.trim())
      .map((s) => applyPlaceholders(s!, previewVars))
      .join('   ·   ')
  const headerPreview = bandPreview(header)
  const footerPreview = bandPreview(footer)

  const run = async () => {
    if (!file || busy) return
    setBusy(true)
    setProgress(0.2)
    setResults([])
    setFailed([])
    try {
      let blob: Blob = file
      if (hasHf) {
        blob = await stampHeaderFooter(blob, {
          header,
          footer,
          fontSize,
          colorHex: color,
          marginPoints: marginNum,
          startNumber: startNum,
          skipFirstPage: skipFirst,
          title: metaTitle.trim() || undefined,
          locale: lang,
        })
      }
      setProgress(0.6)
      if (hasMeta) {
        blob = await setPdfMetadata(blob, {
          title: metaTitle,
          author: metaAuthor,
          subject: metaSubject,
          keywords: metaKeywords,
        })
      }
      setResults([{ name: resultName(file.name, '-styled', 'pdf'), blob }])
      setProgress(1)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const bandInputs = (band: 'header' | 'footer') => {
    const current = band === 'header' ? header : footer
    const labelKey = band === 'header' ? 'pdfHfHeader' : 'pdfHfFooter'
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t(labelKey)}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {BAND_KEYS.map(([key, labelKey]) => (
            <ToolField key={key} label={t(labelKey)}>
              <Input
                type="text"
                value={current[key] ?? ''}
                onChange={(e) => setBand(band, key, e.target.value)}
                className="h-11"
              />
            </ToolField>
          ))}
        </div>
      </div>
    )
  }

  return (
    <ToolShell
      icon={<Type />}
      title={t('toolPdfHeaderFooter')}
      desc={t('toolPdfHeaderFooterDesc')}
    >
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

      <ToolOptionsCard title={t('pdfHfBand')}>
        {bandInputs('header')}
        {bandInputs('footer')}

        <p className="text-xs text-muted-foreground">{t('pdfHfPlaceholderHint')}</p>

        <ToolField label={`${t('pdfHfFontSize')}: ${fontSize} pt`}>
          <Slider
            value={[fontSize]}
            min={6}
            max={24}
            step={1}
            onValueChange={(v) => setFontSize(v[0] ?? 10)}
            aria-label={t('pdfHfFontSize')}
          />
        </ToolField>

        <div className="grid grid-cols-2 gap-3">
          <ToolField label={t('pdfHfMargin')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className="h-11"
            />
          </ToolField>
          <ToolField label={t('pdfHfStart')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-11"
            />
          </ToolField>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <ToolField label={t('pdfHfColor')}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label={t('pdfHfColor')}
              className="h-11 w-16 cursor-pointer rounded-md border border-input bg-card p-1"
            />
          </ToolField>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={skipFirst} onCheckedChange={(v) => setSkipFirst(v === true)} />
            {t('pdfHfSkipFirst')}
          </label>
        </div>

        <p className="text-xs text-muted-foreground">{t('pdfFontLatinHint')}</p>

        {hasHf && (headerPreview || footerPreview) && (
          <div className="space-y-1.5 rounded-lg bg-muted/60 p-3">
            <p className="text-xs font-medium text-muted-foreground">{t('pdfHfPreview')}</p>
            {headerPreview && (
              <p className="truncate font-mono text-xs">
                <span className="mr-2 text-[10px] uppercase text-muted-foreground">
                  {t('pdfHfHeader')}
                </span>
                {headerPreview}
              </p>
            )}
            {footerPreview && (
              <p className="truncate font-mono text-xs">
                <span className="mr-2 text-[10px] uppercase text-muted-foreground">
                  {t('pdfHfFooter')}
                </span>
                {footerPreview}
              </p>
            )}
          </div>
        )}
      </ToolOptionsCard>

      <ToolOptionsCard title={t('pdfHfMeta')}>
        <ToolField label={t('pdfHfMetaTitle')}>
          <Input
            type="text"
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
            className="h-11"
          />
        </ToolField>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToolField label={t('pdfHfMetaAuthor')}>
            <Input
              type="text"
              value={metaAuthor}
              onChange={(e) => setMetaAuthor(e.target.value)}
              className="h-11"
            />
          </ToolField>
          <ToolField label={t('pdfHfMetaSubject')}>
            <Input
              type="text"
              value={metaSubject}
              onChange={(e) => setMetaSubject(e.target.value)}
              className="h-11"
            />
          </ToolField>
        </div>
        <ToolField label={t('pdfHfMetaKeywords')} hint={t('pdfHfKeywordsHint')}>
          <Input
            type="text"
            value={metaKeywords}
            onChange={(e) => setMetaKeywords(e.target.value)}
            className="h-11"
          />
        </ToolField>

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!ready}>
          {t('pdfHfRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={progress} label={t('toolProcessing')} />}
      </ToolOptionsCard>

      <ToolResults results={results} failed={failed} onClear={() => setResults([])} />
    </ToolShell>
  )
}
