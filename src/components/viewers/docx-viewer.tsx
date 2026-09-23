'use client'

/**
 * DOCX viewer — read-only rendering via mammoth.js (docx → HTML), sanitized
 * with DOMPurify. Editing is out of scope; dirty/onSave are ignored.
 */
import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/lib/i18n'
import type { ViewerEditorProps } from '@/lib/viewer-types'

/** Minimal shape we need from either mammoth entry point. */
interface MammothLike {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
}

/**
 * Load mammoth in the browser. The plain package entry is tried first —
 * bundlers apply mammoth's "browser" field mapping (lib/unzip.js and
 * lib/docx/files.js are swapped for browser-safe versions), so it usually
 * works. If Node built-ins leak through and the import fails at runtime,
 * fall back to the self-contained prebuilt UMD bundle (mammoth's
 * package.json has no "exports" map, so the deep import is allowed).
 */
async function loadMammoth(): Promise<MammothLike> {
  const normalize = (mod: unknown): MammothLike => {
    const m = ((mod as { default?: unknown }).default ?? mod) as
      | MammothLike
      | undefined
    if (m && typeof m.convertToHtml === 'function') return m
    throw new Error('mammoth: convertToHtml is unavailable')
  }

  try {
    return normalize(await import('mammoth'))
  } catch {
    // Prebuilt browser bundle — ships without type declarations.
    return normalize(await import('mammoth/mammoth.browser.js'))
  }
}

type DocxState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; html: string }

export default function DocxViewer({ blob }: ViewerEditorProps) {
  const { t } = useI18n()
  const [state, setState] = useState<DocxState>({ status: 'loading' })
  const [loadedFor, setLoadedFor] = useState<Blob | null>(null)

  // Show the spinner whenever the current blob has not finished converting yet.
  const converting = loadedFor !== blob

  useEffect(() => {
    let cancelled = false

    async function convert() {
      try {
        const mammoth = await loadMammoth()
        const arrayBuffer = await blob.arrayBuffer()
        const { value } = await mammoth.convertToHtml({ arrayBuffer })
        if (cancelled) return
        setState({ status: 'ready', html: DOMPurify.sanitize(value) })
        setLoadedFor(blob)
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
        setLoadedFor(blob)
      }
    }

    void convert()
    return () => {
      cancelled = true
    }
  }, [blob])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-background/95 px-3 py-1.5">
        <Badge variant="secondary">{t('readOnly')}</Badge>
        <span className="truncate text-xs text-muted-foreground">{t('docxNote')}</span>
      </div>

      {converting && state.status !== 'error' && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
          <Skeleton className="h-4 w-3/4 max-w-md" />
          <Skeleton className="h-4 w-2/3 max-w-sm" />
          <Skeleton className="h-4 w-1/2 max-w-xs" />
          <span className="text-xs text-muted-foreground">{t('loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-md gap-2 p-6">
            <p className="text-sm font-medium">{t('errGeneric')}</p>
            <p className="truncate text-xs text-muted-foreground">{state.message}</p>
          </Card>
        </div>
      )}

      {!converting && state.status === 'ready' && (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4 dark:bg-muted/10">
          <div
            className="docx-preview mx-auto max-w-3xl rounded-xl bg-card p-6 shadow-sm
              [&_>:first-child]:mt-0
              [&_a]:text-primary [&_a]:underline
              [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4
              [&_blockquote]:italic [&_blockquote]:text-muted-foreground
              [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight
              [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight
              [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold
              [&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:text-base [&_h4]:font-semibold
              [&_hr]:my-6 [&_hr]:border-border
              [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg
              [&_li]:my-1
              [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-6
              [&_p]:my-2.5 [&_p]:leading-relaxed
              [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
              [&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5
              [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2.5
              [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold
              [&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-6
              sm:p-10"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        </div>
      )}
    </div>
  )
}
