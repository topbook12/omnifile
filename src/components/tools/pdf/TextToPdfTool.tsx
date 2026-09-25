'use client'

/**
 * Text → PDF — pasted text or a .txt/.md/.csv file (both converge into the
 * same textarea state) becomes a single PDF. Two rendering modes:
 *  - image (default): canvas-drawn pages → full Unicode incl. Bengali
 *  - selectable: real text via pdf-lib standard fonts (Latin-only, WinAnsi)
 */

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolDropzone,
  ToolField,
  ToolOptionsCard,
  ToolResults,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { textToPdf } from '@/lib/tools/pdf-convert'
import { baseName, errMessage } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
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
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

type InputMode = 'paste' | 'file'
type PageSize = 'a4' | 'letter'
type RenderMode = 'image' | 'text'

export default function TextToPdfTool() {
  const { t } = useI18n()
  const [inputMode, setInputMode] = useState<InputMode>('paste')
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState<PageSize>('a4')
  const [renderMode, setRenderMode] = useState<RenderMode>('image')
  const [fontSize, setFontSize] = useState(14)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  /* ------------------------------- file input ------------------------------- */

  const onFileSelected = (incoming: File[]) => {
    const picked = incoming[0]
    if (!picked) return
    picked
      .text()
      .then((content) => {
        setText(content)
        setSourceName(baseName(picked.name))
        setResults([])
        setFailed([])
        toast.info(t('pdfT2pFileLoaded'))
      })
      .catch(() => toast.error(t('pdfT2pFileReadFail')))
  }

  /* ---------------------------------- run ----------------------------------- */

  const run = async () => {
    if (busy) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      const blob = await textToPdf(text, {
        pageSize,
        mode: renderMode,
        fontSize,
        title: title.trim() || undefined,
      })
      setResults([{ name: `${sourceName ?? 'text'}.pdf`, blob }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<FileText />} title={t('toolTextToPdf')} desc={t('toolTextToPdfDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolOptionsCard title={t('pdfT2pInput')}>
        <RadioGroup
          value={inputMode}
          onValueChange={(v) => setInputMode(v as InputMode)}
          className="gap-3"
        >
          {(
            [
              ['paste', 'pdfT2pPaste'],
              ['file', 'pdfT2pFile'],
            ] as Array<[InputMode, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-t2p-input-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-t2p-input-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>

        {inputMode === 'file' && (
          <ToolDropzone
            accept=".txt,.md,.csv,text/plain"
            multiple={false}
            files={[]}
            onFiles={onFileSelected}
            onRemove={() => {}}
          />
        )}

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={t('pdfT2pPlaceholder')}
          aria-label={t('pdfT2pInput')}
          className="max-h-96 min-h-40 resize-y overflow-y-auto text-sm [scrollbar-width:thin]"
        />
      </ToolOptionsCard>

      <ToolOptionsCard title={t('pdfT2pMode')}>
        <RadioGroup
          value={renderMode}
          onValueChange={(v) => setRenderMode(v as RenderMode)}
          className="gap-3"
        >
          {(
            [
              ['image', 'pdfT2pImage'],
              ['text', 'pdfT2pText'],
            ] as Array<[RenderMode, string]>
          ).map(([value, key]) => (
            <Label
              key={value}
              htmlFor={`pdf-t2p-mode-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-t2p-mode-${value}`} value={value} />
              {t(key)}
            </Label>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {renderMode === 'image' ? t('pdfT2pImageHint') : t('pdfT2pTextHint')}
        </p>

        <ToolField label={t('pdfT2pPageSize')}>
          <Select value={pageSize} onValueChange={(v) => setPageSize(v as PageSize)}>
            <SelectTrigger className="h-11 w-full" aria-label={t('pdfT2pPageSize')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">{t('pdfT2pA4')}</SelectItem>
              <SelectItem value="letter">{t('pdfT2pLetter')}</SelectItem>
            </SelectContent>
          </Select>
        </ToolField>

        <ToolField label={`${t('pdfT2pFontSize')} — ${fontSize}`}>
          <Slider
            value={[fontSize]}
            onValueChange={(v) => setFontSize(v[0] ?? 14)}
            min={10}
            max={28}
            step={1}
            aria-label={t('pdfT2pFontSize')}
          />
        </ToolField>

        <ToolField label={t('pdfT2pTitle')}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('pdfT2pTitlePlaceholder')}
            aria-label={t('pdfT2pTitle')}
            className="h-11"
          />
        </ToolField>

        <ToolRunButton onClick={() => void run()} busy={busy}>
          {t('toolRun')}
        </ToolRunButton>
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
