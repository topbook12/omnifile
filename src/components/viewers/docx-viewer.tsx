'use client'

/**
 * DOCX viewer — read-only rendering via mammoth.js (docx → HTML), sanitized
 * with DOMPurify. Editing is out of scope; dirty/onSave are ignored.
 * Task 2-d additions: export toolbar — standalone HTML download, Markdown
 * download (mammoth.convertToMarkdown) and Print / Save-as-PDF. These are
 * conversions of the read-only content, never edits.
 */
import { useCallback, useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { toast } from 'sonner'
import { Download, FileCode, FileText, Loader2, Printer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadBlob } from '@/lib/fsa'
import { useI18n } from '@/lib/i18n'
import type { ViewerEditorProps } from '@/lib/viewer-types'

/** Minimal shape we need from either mammoth entry point. */
interface MammothLike {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  convertToMarkdown: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
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
    if (m && typeof m.convertToHtml === 'function' && typeof m.convertToMarkdown === 'function')
      return m
    throw new Error('mammoth: convertToHtml / convertToMarkdown are unavailable')
  }

  try {
    return normalize(await import('mammoth'))
  } catch {
    // Prebuilt browser bundle — ships without type declarations.
    return normalize(await import('mammoth/mammoth.browser.js'))
  }
}

/** Filename without its final extension (dotfiles like .gitignore kept). */
function baseFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Full standalone HTML document embedding the (sanitized) converted body.
 * Inline base styles: system font stack, headings, bordered tables,
 * images capped at 100% width, teal links, dark-friendly color-scheme.
 */
function buildDocxHtmlDoc(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem 1.25rem; background: #ffffff; color: #18181b;
    font-family: ui-serif, Georgia, 'Times New Roman', serif; line-height: 1.65; }
  main { max-width: 780px; margin: 0 auto; overflow-wrap: break-word; }
  h1, h2, h3, h4, h5, h6 { font-family: ui-sans-serif, system-ui, -apple-system,
    'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.25; margin: 1.5em 0 0.6em; }
  h1 { font-size: 1.9rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.2rem; }
  p { margin: 0.8em 0; }
  a { color: #0d9488; }
  blockquote { margin: 1em 0; padding: 0.2em 0 0.2em 1em;
    border-left: 4px solid rgba(127, 127, 127, 0.4); color: #52525b; font-style: italic; }
  ul, ol { padding-left: 1.5rem; margin: 0.8em 0; }
  li { margin: 0.3em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid rgba(127, 127, 127, 0.5); padding: 0.45em 0.7em; text-align: left; }
  th { background: rgba(127, 127, 127, 0.12); font-weight: 600; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  hr { border: none; border-top: 1px solid rgba(127, 127, 127, 0.35); margin: 2em 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #101014; color: #e4e4e7; }
    blockquote { color: #a1a1aa; }
  }
  @media print { body { background: #ffffff; color: #000000; padding: 0; } }
</style>
</head>
<body>
<main>${bodyHtml}</main>
</body>
</html>`
}

type DocxState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; html: string }

export default function DocxViewer({ file, blob }: ViewerEditorProps) {
  const { t } = useI18n()
  const [state, setState] = useState<DocxState>({ status: 'loading' })
  const [loadedFor, setLoadedFor] = useState<Blob | null>(null)
  const [exportingMd, setExportingMd] = useState(false)

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

  /* --- Task 2-d export actions (conversions, not edits) --------------- */

  const handleExportHtml = useCallback(() => {
    if (state.status !== 'ready') return
    try {
      // state.html is already DOMPurify-sanitized above.
      const html = buildDocxHtmlDoc(state.html, file.name)
      downloadBlob(
        new Blob([html], { type: 'text/html;charset=utf-8' }),
        `${baseFileName(file.name)}.html`
      )
      toast.success(t('docxConverted'))
    } catch {
      toast.error(t('errGeneric'))
    }
  }, [file.name, state, t])

  const handleExportMd = useCallback(async () => {
    if (exportingMd) return
    setExportingMd(true)
    try {
      const mammoth = await loadMammoth()
      const arrayBuffer = await blob.arrayBuffer()
      const { value } = await mammoth.convertToMarkdown({ arrayBuffer })
      downloadBlob(
        new Blob([value], { type: 'text/markdown;charset=utf-8' }),
        `${baseFileName(file.name)}.md`
      )
      toast.success(t('docxConverted'))
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setExportingMd(false)
    }
  }, [blob, exportingMd, file.name, t])

  const handlePrint = useCallback(() => {
    if (state.status !== 'ready') return
    const win = window.open('', '_blank')
    if (!win) {
      toast.error(t('errGeneric')) // popup blocked
      return
    }
    let printed = false
    const fire = () => {
      if (printed) return
      printed = true
      window.setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch {
          /* print may be unavailable in some embedded contexts */
        }
      }, 250)
    }
    try {
      win.document.open()
      win.document.write(buildDocxHtmlDoc(state.html, file.name))
      win.document.close()
    } catch {
      /* ignore write errors — the window still opens */
    }
    win.addEventListener('load', fire, { once: true })
    window.setTimeout(fire, 600) // fallback if the load event already fired
  }, [file.name, state, t])

  const isReady = state.status === 'ready'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-background/95 px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Badge variant="secondary">{t('readOnly')}</Badge>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {t('docxNote')}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                title={t('download')}
                aria-label={t('download')}
                disabled={!isReady}
              >
                <Download aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('tools')}</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportHtml} className="gap-2">
                <FileCode className="size-4" aria-hidden />
                {t('docxExportHtml')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportMd()} className="gap-2" disabled={exportingMd}>
                {exportingMd ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileText className="size-4" aria-hidden />
                )}
                {t('docxExportMd')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            title={t('docxPrintPdf')}
            aria-label={t('docxPrintPdf')}
            disabled={!isReady}
            onClick={handlePrint}
          >
            <Printer aria-hidden />
          </Button>
        </div>
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
