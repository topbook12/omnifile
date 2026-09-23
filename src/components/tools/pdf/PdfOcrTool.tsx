'use client'

/**
 * OCR — read text from images or PDFs. Two engines:
 *  - Gemini AI (BYOK): excellent for Bengali; needs the user's API key.
 *  - On-device tesseract.js: free, offline, downloads language data once.
 *
 * PDFs with a real text layer are extracted directly; scanned PDFs are
 * rasterised (max 10 pages) and sent through the selected engine.
 */

import { useState } from 'react'
import { Copy, Download, ScanText } from 'lucide-react'
import { toast } from 'sonner'

import {
  AiKeyNotice,
  GeminiBadge,
  OnDeviceBadge,
  ToolDropzone,
  ToolField,
  ToolOptionsCard,
  ToolProgressBar,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { getGeminiKey, geminiExtractText } from '@/lib/gemini'
import { saveOrDownloadBlob } from '@/lib/fsa'
import { useI18n } from '@/lib/i18n'
import {
  canvasToBlob,
  closePdfDoc,
  errMessage,
  OCR_MAX_PAGES,
  ocrWithTesseract,
  pdfExtractText,
  pdfHasTextLayer,
  pdfjsDoc,
  renderPdfPage,
  replaceExt,
} from '@/lib/tools/pdf-tools-advanced'

type Engine = 'gemini' | 'ondevice'
type GeminiLang = 'auto' | 'bn' | 'en' | 'bn+en'
type TessLang = 'ben' | 'eng' | 'both'

const TEXT_LAYER_THRESHOLD = 50

export default function PdfOcrTool() {
  const { t, tf } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [engine, setEngine] = useState<Engine>('gemini')
  const [geminiLang, setGeminiLang] = useState<GeminiLang>('auto')
  const [tessLang, setTessLang] = useState<TessLang>('ben')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [text, setText] = useState('')

  const file = files[0] ?? null
  const hasKey = Boolean(getGeminiKey())
  const isPdf = Boolean(file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)))

  const addFiles = (incoming: File[]) => {
    setFiles(incoming.slice(0, 1))
    setText('')
  }
  const removeFile = () => {
    setFiles([])
    setText('')
  }

  /* ------------------------------- OCR pipeline ------------------------------ */

  const ocrPdfPagesGemini = async (pdfFile: File): Promise<string> => {
    const doc = await pdfjsDoc(pdfFile)
    const total = Math.min(doc.numPages, OCR_MAX_PAGES)
    const parts: string[] = []
    try {
      for (let i = 1; i <= total; i++) {
        setProgressLabel(tf('pdfPageN', { n: i }) + ` / ${total}`)
        const page = await doc.getPage(i)
        const canvas = await renderPdfPage(page, 2)
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9)
        canvas.width = 0
        canvas.height = 0
        const pageText = await geminiExtractText(jpeg, {
          language: geminiLang,
          mimeType: 'image/jpeg',
        })
        parts.push(`----- ${tf('pdfPageN', { n: i })} -----\n\n${pageText}`)
        setProgress(i / total)
      }
    } finally {
      await closePdfDoc(doc)
    }
    return parts.join('\n\n')
  }

  const ocrPdfPagesTesseract = async (pdfFile: File, langs: string[]): Promise<string> => {
    const doc = await pdfjsDoc(pdfFile)
    const total = Math.min(doc.numPages, OCR_MAX_PAGES)
    const parts: string[] = []
    try {
      for (let i = 1; i <= total; i++) {
        setProgressLabel(tf('pdfPageN', { n: i }) + ` / ${total}`)
        const page = await doc.getPage(i)
        const canvas = await renderPdfPage(page, 2)
        const pageText = await ocrWithTesseract(canvas, langs, (p) =>
          setProgress((i - 1 + p) / total)
        )
        canvas.width = 0
        canvas.height = 0
        if (pageText) parts.push(`----- ${tf('pdfPageN', { n: i })} -----\n\n${pageText}`)
        setProgress(i / total)
      }
    } finally {
      await closePdfDoc(doc)
    }
    return parts.join('\n\n')
  }

  const run = async () => {
    if (!file || busy) return
    setBusy(true)
    setProgress(0)
    setProgressLabel(t('toolProcessing'))
    setText('')
    try {
      let result = ''

      if (engine === 'gemini') {
        if (!hasKey) {
          toast.error(t('aiErrNoKey'))
          return
        }
        if (!isPdf) {
          result = await geminiExtractText(file, { language: geminiLang })
        } else {
          // Try the embedded text layer first — far cheaper than vision OCR.
          const pages = await pdfExtractText(file, (done, total) =>
            setProgress((done / Math.max(1, total)) * 0.5)
          )
          const joined = pages.filter(Boolean).join('\n')
          if (joined.trim().length > TEXT_LAYER_THRESHOLD) {
            result = joined
          } else {
            result = await ocrPdfPagesGemini(file)
          }
        }
      } else {
        const langs =
          tessLang === 'both' ? ['ben', 'eng'] : ([tessLang] as string[])
        if (!isPdf) {
          result = await ocrWithTesseract(file, langs, (p) => setProgress(p))
        } else if (await pdfHasTextLayer(file)) {
          // The PDF is not actually scanned — skip recognition entirely.
          const pages = await pdfExtractText(file)
          toast.info(t('pdfOcrHasText'))
          result = pages.filter(Boolean).join('\n')
        } else {
          result = await ocrPdfPagesTesseract(file, langs)
        }
      }

      setText(result)
      setProgress(1)
      setProgressLabel('')
      if (!result.trim()) toast.error(t('errGeneric'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* --------------------------------- actions --------------------------------- */

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('textCopied'))
    } catch {
      // Clipboard API blocked → select + legacy fallback
      const el = document.getElementById('pdf-ocr-text') as HTMLTextAreaElement | null
      if (el) {
        el.select()
        document.execCommand('copy')
        toast.success(t('textCopied'))
      }
    }
  }

  const downloadTxt = async () => {
    const name = file ? replaceExt(file.name, 'txt') : 'ocr.txt'
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    await saveOrDownloadBlob(blob, name)
    toast.success(t('tDownloadStarted'))
  }

  /* ----------------------------------- UI ------------------------------------ */

  return (
    <ToolShell icon={<ScanText />} title={t('toolPdfOcr')} desc={t('toolPdfOcrDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
        <GeminiBadge />
      </div>

      <ToolDropzone
        accept="image/*,application/pdf"
        multiple={false}
        files={file ? [file] : []}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy}
      />

      <ToolOptionsCard title={t('pdfOcrEngine')}>
        <RadioGroup
          value={engine}
          onValueChange={(v) => setEngine(v as Engine)}
          className="gap-3"
        >
          {(
            [
              ['gemini', 'aiModeGemini'],
              ['ondevice', 'aiModeOnDevice'],
            ] as Array<[Engine, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-ocr-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-ocr-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>

        {engine === 'gemini' ? (
          <ToolField label={t('pdfOcrLanguage')}>
            <Select value={geminiLang} onValueChange={(v) => setGeminiLang(v as GeminiLang)}>
              <SelectTrigger className="h-11 w-full" aria-label={t('pdfOcrLanguage')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('pdfOcrLangAuto')}</SelectItem>
                <SelectItem value="bn">{t('pdfOcrLangBn')}</SelectItem>
                <SelectItem value="en">{t('pdfOcrLangEn')}</SelectItem>
                <SelectItem value="bn+en">{t('pdfOcrLangBnEn')}</SelectItem>
              </SelectContent>
            </Select>
          </ToolField>
        ) : (
          <ToolField label={t('pdfOcrLanguage')} hint={t('pdfOcrTessHint')}>
            <RadioGroup
              value={tessLang}
              onValueChange={(v) => setTessLang(v as TessLang)}
              className="gap-3"
            >
              {(
                [
                  ['ben', 'pdfOcrLangBn'],
                  ['eng', 'pdfOcrLangEn'],
                  ['both', 'pdfOcrLangBnEn'],
                ] as Array<[TessLang, string]>
              ).map(([value, key]) => (
                <Label
                  key={value}
                  htmlFor={`pdf-ocr-lang-${value}`}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem id={`pdf-ocr-lang-${value}`} value={value} />
                  {t(key)}
                </Label>
              ))}
            </RadioGroup>
          </ToolField>
        )}

        {engine === 'gemini' && !hasKey && <AiKeyNotice />}

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!file}>
          {t('toolRun')}
        </ToolRunButton>
        {busy && <ToolProgressBar value={Math.max(0.03, progress)} label={progressLabel} />}
      </ToolOptionsCard>

      {text && (
        <ToolOptionsCard title={t('pdfOcrExtracted')}>
          <Textarea
            id="pdf-ocr-text"
            readOnly
            value={text}
            aria-label={t('pdfOcrExtracted')}
            className="max-h-96 min-h-56 resize-y overflow-y-auto font-mono text-sm [scrollbar-width:thin]"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11 flex-1 gap-2" onClick={() => void copyAll()}>
              <Copy className="h-4 w-4" aria-hidden />
              {t('textCopy')}
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 gap-2"
              onClick={() => void downloadTxt()}
            >
              <Download className="h-4 w-4" aria-hidden />
              {t('pdfOcrDownloadTxt')}
            </Button>
          </div>
        </ToolOptionsCard>
      )}
    </ToolShell>
  )
}
