'use client'

/**
 * Compare PDF versions (Task 2-f) — word-level diff between two documents,
 * 100% on-device (pdf.js text extraction + LCS diff, see pdf-compare.ts).
 *
 * Two dropzones (Original / Revised) → extract both text layers → diff →
 * inline coloured view and an optional standalone HTML report download.
 */

import { useState } from 'react'
import { FileDiff, GitCompare } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n'
import { baseName } from '@/lib/tools/batch'
import { diffToHtml, diffWords, type DiffOutcome } from '@/lib/tools/pdf-compare'
import { errMessage, pdfExtractText } from '@/lib/tools/pdf-tools-advanced'
import type { ToolResultFile } from '@/lib/tools/types'

const SCROLLBAR =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30'

export default function PdfCompareTool() {
  const { t, tf } = useI18n()

  const [fileA, setFileA] = useState<File | null>(null)
  const [fileB, setFileB] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [diff, setDiff] = useState<DiffOutcome | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])

  const resetDiff = () => {
    setDiff(null)
    setResults([])
  }

  const addA = (incoming: File[]) => {
    setFileA(incoming[0] ?? null)
    resetDiff()
  }
  const addB = (incoming: File[]) => {
    setFileB(incoming[0] ?? null)
    resetDiff()
  }

  /* --------------------------------- pipeline -------------------------------- */

  const run = async () => {
    if (!fileA || !fileB || busy) return
    setBusy(true)
    resetDiff()
    setProgress(0)
    setProgressLabel(t('pdfCmpReading'))
    try {
      const pagesA = await pdfExtractText(fileA, (done, total) =>
        setProgress((done / Math.max(1, total)) * 0.5)
      )
      const pagesB = await pdfExtractText(fileB, (done, total) =>
        setProgress(0.5 + (done / Math.max(1, total)) * 0.5)
      )

      const outcome = diffWords(pagesA.join('\n'), pagesB.join('\n'))
      setDiff(outcome)

      const html = diffToHtml(outcome.segments, {
        nameA: fileA.name,
        nameB: fileB.name,
        added: outcome.added,
        removed: outcome.removed,
      })
      setResults([
        {
          name: `${baseName(fileA.name)}-vs-${baseName(fileB.name)}-diff.html`,
          blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
        },
      ])

      if (outcome.added === 0 && outcome.removed === 0) toast.info(t('pdfCmpNoDiff'))
      setProgress(1)
      setProgressLabel('')
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* ----------------------------------- UI ------------------------------------ */

  const sameCount = diff
    ? diff.segments
        .filter((s) => s.type === 'same')
        .reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0)
    : 0

  return (
    <ToolShell icon={<FileDiff />} title={t('toolPdfCompare')} desc={t('toolPdfCompareDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Badge variant="secondary" className="px-1.5 font-mono text-[11px]">
              A
            </Badge>
            {t('pdfCmpA')}
          </p>
          <ToolDropzone
            accept="application/pdf"
            multiple={false}
            files={fileA ? [fileA] : []}
            onFiles={addA}
            onRemove={() => {
              setFileA(null)
              resetDiff()
            }}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Badge variant="secondary" className="px-1.5 font-mono text-[11px]">
              B
            </Badge>
            {t('pdfCmpB')}
          </p>
          <ToolDropzone
            accept="application/pdf"
            multiple={false}
            files={fileB ? [fileB] : []}
            onFiles={addB}
            onRemove={() => {
              setFileB(null)
              resetDiff()
            }}
            disabled={busy}
          />
        </div>
      </div>

      <ToolOptionsCard>
        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!fileA || !fileB}>
          <span className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" aria-hidden />
            {t('pdfCmpRun')}
          </span>
        </ToolRunButton>
        {busy && (
          <ToolProgressBar value={Math.max(0.03, progress)} label={progressLabel || t('toolProcessing')} />
        )}
      </ToolOptionsCard>

      {diff && (
        <>
          <div className="flex flex-wrap gap-2" role="status">
            <Badge
              variant="outline"
              className="border-emerald-500/40 font-normal text-emerald-600 dark:text-emerald-400"
            >
              {tf('pdfCmpAdded', { n: diff.added })}
            </Badge>
            <Badge
              variant="outline"
              className="border-red-500/40 font-normal text-red-600 dark:text-red-400"
            >
              {tf('pdfCmpRemoved', { n: diff.removed })}
            </Badge>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {tf('pdfCmpSame', { n: sameCount })}
            </Badge>
          </div>

          <Tabs defaultValue="inline" className="gap-4">
            <TabsList className="h-11 w-full">
              <TabsTrigger value="inline" className="flex-1">
                {t('pdfCmpTabInline')}
              </TabsTrigger>
              <TabsTrigger value="report" className="flex-1">
                {t('pdfCmpTabReport')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inline" className="space-y-2">
              <div
                className={`max-h-96 overflow-y-auto rounded-xl border bg-card p-4 text-sm leading-relaxed ${SCROLLBAR}`}
              >
                <p className="whitespace-pre-wrap break-words">
                  {diff.segments.map((seg, i) =>
                    seg.type === 'same' ? (
                      <span key={i}>{seg.text}</span>
                    ) : seg.type === 'add' ? (
                      <span
                        key={i}
                        className="rounded-sm bg-emerald-500/20 px-0.5 text-emerald-800 dark:text-emerald-200"
                      >
                        {seg.text}
                      </span>
                    ) : (
                      <span
                        key={i}
                        className="rounded-sm bg-red-500/15 px-0.5 text-red-700 line-through dark:text-red-300"
                      >
                        {seg.text}
                      </span>
                    )
                  )}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{t('pdfCmpLegend')}</p>
            </TabsContent>

            <TabsContent value="report" className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('pdfCmpReportHint')}</p>
              <ToolResults results={results} failed={[]} onClear={() => setResults([])} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </ToolShell>
  )
}
