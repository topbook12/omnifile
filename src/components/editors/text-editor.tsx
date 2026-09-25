'use client'

/**
 * Text / Markdown editor — Task 2-b (+ advanced tools, Task 2-d).
 * CodeMirror 6 editing (@uiw/react-codemirror) + live markdown preview
 * (react-markdown). JSON files get json() syntax highlighting; markdown files
 * get fenced-code highlighting via @codemirror/language-data. Everything is
 * client-side; the blob comes from IndexedDB via the shared viewer contract.
 * Task 2-d additions: word count, copy-all, .md/.txt download, standalone
 * HTML export (local markdownToHtml) and print / save-as-PDF.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { languages } from '@codemirror/language-data'
import ReactMarkdown from 'react-markdown'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Copy, Download, Eye, FileCode, Globe, Loader2, Pencil, Printer, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n'
import { getExt } from '@/lib/file-types'
import { downloadBlob } from '@/lib/fsa'
import type { ViewerEditorProps } from '@/lib/viewer-types'

type EditorTab = 'edit' | 'preview'

/**
 * Module-level constant (stable identity) — @uiw/react-codemirror includes
 * basicSetup in its reconfigure effect deps, so a fresh object literal on
 * every parent re-render (dirty flag flips per keystroke) would rebuild the
 * setup and reset undo history.
 */
const BASIC_SETUP = { foldGutter: false } as const

/* ------------------------------------------------------------------ */
/* Export helpers (Task 2-d) — local, dependency-free                  */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Inline markdown → HTML. Input MUST already be HTML-escaped. */
function inlineMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (_m, label: string, href: string) =>
      `<a href="${href}" rel="noopener">${label}</a>`
    )
}

/**
 * Compact markdown → HTML converter (headings, bold/italic, inline code,
 * fenced blocks, ul/ol lists, blockquotes, hr, links, blank-line paragraphs).
 * Raw HTML in the source is escaped first, so output contains no scripts.
 */
function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: 'ul' | 'ol' | null = null
  let quote: string[] = []

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMd(escapeHtml(para.join(' ')))}</p>`)
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      out.push(list === 'ul' ? '</ul>' : '</ol>')
      list = null
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote><p>${inlineMd(escapeHtml(quote.join(' ')))}</p></blockquote>`)
      quote = []
    }
  }
  const flushAll = () => {
    flushPara()
    flushList()
    flushQuote()
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()

    if (line === '') {
      flushAll()
      i++
      continue
    }

    // Fenced code block.
    const fence = /^```(\w*)/.exec(line)
    if (fence) {
      flushAll()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      i++ // skip the closing fence (or EOF)
      const cls = fence[1] ? ` class="language-${fence[1]}"` : ''
      out.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }

    // ATX heading (# … ######).
    const h = /^(#{1,6})\s+(.+)$/.exec(line)
    if (h) {
      flushAll()
      out.push(`<h${h[1].length}>${inlineMd(escapeHtml(h[2]))}</h${h[1].length}>`)
      i++
      continue
    }

    // Horizontal rule.
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushAll()
      out.push('<hr />')
      i++
      continue
    }

    // Blockquote (consecutive '>' lines become one quote).
    if (line.startsWith('>')) {
      flushPara()
      flushList()
      quote.push(line.replace(/^>\s?/, ''))
      i++
      continue
    }

    // Unordered list ("- " or "* ").
    const ul = /^[-*]\s+(.*)$/.exec(line)
    if (ul) {
      flushPara()
      flushQuote()
      if (list !== 'ul') {
        flushList()
        out.push('<ul>')
        list = 'ul'
      }
      out.push(`<li>${inlineMd(escapeHtml(ul[1]))}</li>`)
      i++
      continue
    }

    // Ordered list ("1. " or "1) ").
    const ol = /^\d+[.)]\s+(.*)$/.exec(line)
    if (ol) {
      flushPara()
      flushQuote()
      if (list !== 'ol') {
        flushList()
        out.push('<ol>')
        list = 'ol'
      }
      out.push(`<li>${inlineMd(escapeHtml(ol[1]))}</li>`)
      i++
      continue
    }

    flushList()
    flushQuote()
    para.push(line)
    i++
  }
  flushAll()
  return out.join('\n')
}

/** Full standalone HTML document (system font stack, 720px column, dark-friendly). */
function buildStyledHtmlDoc(bodyHtml: string, title: string): string {
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
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
      'Helvetica Neue', Arial, sans-serif; line-height: 1.65; }
  main { max-width: 720px; margin: 0 auto; overflow-wrap: break-word; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.6em 0 0.6em; }
  h1 { font-size: 1.9rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.2rem; }
  h4, h5, h6 { font-size: 1.05rem; }
  p { margin: 0.8em 0; }
  a { color: #0d9488; }
  code { background: rgba(127, 127, 127, 0.14); border-radius: 4px; padding: 0.15em 0.35em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
  pre { background: #f4f4f5; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 8px;
    padding: 0.9rem 1rem; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1em 0; padding: 0.2em 0 0.2em 1em; border-left: 4px solid rgba(127, 127, 127, 0.4);
    color: #52525b; font-style: italic; }
  ul, ol { padding-left: 1.5rem; margin: 0.8em 0; }
  li { margin: 0.3em 0; }
  hr { border: none; border-top: 1px solid rgba(127, 127, 127, 0.35); margin: 2em 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid rgba(127, 127, 127, 0.4); padding: 0.45em 0.7em; text-align: left; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  .plain { white-space: pre-wrap; word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
  @media (prefers-color-scheme: dark) {
    body { background: #101014; color: #e4e4e7; }
    pre { background: #1b1b20; }
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

/**
 * Open a blank window, write the document and trigger print shortly after
 * load. Returns false when the popup was blocked.
 */
function openPrintWindow(html: string): boolean {
  const win = window.open('', '_blank')
  if (!win) return false
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
    win.document.write(html)
    win.document.close()
  } catch {
    /* ignore write errors — the window still opens */
  }
  win.addEventListener('load', fire, { once: true })
  window.setTimeout(fire, 600) // fallback if the load event already fired
  return true
}

/** Filename without its final extension (dotfiles like .gitignore kept). */
function baseFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export default function TextEditor(props: ViewerEditorProps) {
  const { file, blob, dirty, onDirtyChange, onSave } = props
  const { t, tf } = useI18n()
  const { resolvedTheme } = useTheme()

  const isMarkdown = file.kind === 'markdown'
  const isJson = getExt(file.name) === 'json'

  // value stays '' until the blob has been read — a Skeleton renders meanwhile.
  const [value, setValue] = useState('')
  const [originalText, setOriginalText] = useState('')
  // Which blob's text currently lives in `value` / which blob failed to load.
  // Tracked by blob identity so all state updates happen inside the async
  // callbacks (no synchronous setState-in-effect) and switching files shows
  // a fresh Skeleton instead of the previous file's content.
  const [loadedFor, setLoadedFor] = useState<Blob | null>(null)
  const [loadErrorFor, setLoadErrorFor] = useState<Blob | null>(null)
  const [tab, setTab] = useState<EditorTab>('edit')
  const [saving, setSaving] = useState(false)

  // Ref mirrors: the CodeMirror update listener is bound once by @uiw, so the
  // onChange handler must read the freshest original text / parent callback
  // through refs instead of relying on a closure that could go stale
  // (e.g. after a successful save resets originalText).
  const originalRef = useRef('')
  const onDirtyRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyRef.current = onDirtyChange
  }, [onDirtyChange])

  const applyOriginal = useCallback((text: string) => {
    originalRef.current = text
    setOriginalText(text)
  }, [])

  // Load the blob's text whenever a (new) blob arrives. The cancelled flag
  // guards against out-of-order resolves when switching files quickly.
  useEffect(() => {
    let cancelled = false
    blob
      .text()
      .then((text) => {
        if (cancelled) return
        setValue(text)
        applyOriginal(text)
        setLoadedFor(blob)
        setLoadErrorFor(null)
      })
      .catch(() => {
        if (cancelled) return
        setValue('')
        applyOriginal('')
        setLoadedFor(blob)
        setLoadErrorFor(blob)
      })
    return () => {
      cancelled = true
    }
  }, [blob, applyOriginal])

  const mode = isMarkdown ? 'markdown' : 'plain'

  // CodeMirror extensions — memoized so the view is not reconfigured on
  // every render. base: soft wrap; markdown: fenced-code languages; json:
  // JSON syntax; anything else: no language.
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      ...(mode === 'markdown' ? [markdown({ codeLanguages: languages })] : isJson ? [json()] : []),
    ],
    [mode, isJson],
  )

  const handleChange = useCallback(
    (newVal: string) => {
      setValue(newVal)
      onDirtyRef.current(newVal !== originalRef.current)
    },
    [],
  )

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(new Blob([value], { type: file.mime || 'text/plain;charset=utf-8' }))
      // Save succeeded: the stored copy now equals the editor content, so the
      // local baseline moves too (parent clears its own dirty flag).
      applyOriginal(value)
      toast.success(t('tSaved'))
    } catch {
      toast.error(t('tSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const isLoaded = loadedFor !== null && loadedFor === blob
  const isLoadError = loadErrorFor !== null && loadErrorFor === blob
  const saveDisabled =
    saving || !isLoaded || isLoadError || !dirty || value === originalText
  const showPreview = isMarkdown && tab === 'preview'

  /* --- Task 2-d tools ------------------------------------------------- */

  const words = useMemo(() => {
    const trimmed = value.trim()
    return trimmed === '' ? 0 : trimmed.split(/\s+/).length
  }, [value])

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        // Fallback for non-secure contexts / older browsers.
        const ta = document.createElement('textarea')
        ta.value = value
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        if (!ok) throw new Error('copy failed')
      }
      toast.success(t('textCopied'))
    } catch {
      toast.error(t('errGeneric'))
    }
  }, [t, value])

  const handleDownloadText = useCallback(() => {
    try {
      const ext = isMarkdown ? '.md' : '.txt'
      downloadBlob(
        new Blob([value], { type: 'text/plain;charset=utf-8' }),
        `${baseFileName(file.name)}${ext}`
      )
      toast.success(t('tExportDone'))
    } catch {
      toast.error(t('errGeneric'))
    }
  }, [file.name, isMarkdown, t, value])

  const handleExportHtml = useCallback(() => {
    if (!isMarkdown) return
    try {
      const html = buildStyledHtmlDoc(markdownToHtml(value), file.name)
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${baseFileName(file.name)}.html`)
      toast.success(t('tExportDone'))
    } catch {
      toast.error(t('errGeneric'))
    }
  }, [file.name, isMarkdown, t, value])

  const handlePrint = useCallback(() => {
    const body = isMarkdown
      ? markdownToHtml(value)
      : `<div class="plain">${escapeHtml(value)}</div>`
    const ok = openPrintWindow(buildStyledHtmlDoc(body, file.name))
    if (!ok) toast.error(t('errGeneric')) // popup blocked
  }, [file.name, isMarkdown, t, value])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="no-touch-callout flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-b bg-background/95 px-2 py-1.5">
        <div className="flex min-w-0 items-center">
          {isMarkdown ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as EditorTab)} className="shrink-0">
              <TabsList className="h-9 shrink-0">
                <TabsTrigger value="edit" className="gap-1.5 px-2.5">
                  <Pencil aria-hidden />
                  {t('editTab')}
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-1.5 px-2.5">
                  <Eye aria-hidden />
                  {t('previewTab')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <FileCode className="size-4 shrink-0" aria-hidden />
              <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{file.name}</span>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isLoaded && !isLoadError && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                title={t('textCopy')}
                aria-label={t('textCopy')}
                onClick={() => void handleCopy()}
              >
                <Copy aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                title={t('textExportMd')}
                aria-label={t('textExportMd')}
                onClick={handleDownloadText}
              >
                <Download aria-hidden />
              </Button>
              {isMarkdown && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  title={t('textExportHtml')}
                  aria-label={t('textExportHtml')}
                  onClick={handleExportHtml}
                >
                  <Globe aria-hidden />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                title={t('textExportPdf')}
                aria-label={t('textExportPdf')}
                onClick={handlePrint}
              >
                <Printer aria-hidden />
              </Button>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {tf('chars', { n: value.length })}
              </span>
              <span className="hidden text-xs text-muted-foreground md:inline">
                {tf('textWords', { n: words })}
              </span>
              <span className="text-xs text-muted-foreground">
                {tf('lines', { n: value ? value.split('\n').length : 1 })}
              </span>
            </>
          )}
          <Button size="sm" className="h-9 gap-1.5" onClick={handleSave} disabled={saveDisabled}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {t('save')}
          </Button>
        </div>
      </div>

      {/* Content area */}
      {!isLoaded ? (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden p-4" aria-busy="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : isLoadError ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">{t('errGeneric')}</p>
        </div>
      ) : showPreview ? (
        /* Markdown preview — react-markdown escapes raw HTML by default, so
           no sanitizer is needed. Prose styling done manually (no typography
           plugin) with arbitrary-variant classes. */
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className={[
              'docx-preview',
              'max-w-3xl mx-auto px-5 py-6',
              '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3',
              '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2.5',
              '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2',
              '[&_p]:my-2.5',
              '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2.5',
              '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2.5',
              '[&_li]:my-1',
              '[&_a]:text-primary [&_a]:underline',
              '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
              '[&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-3',
              '[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
              '[&_img]:max-w-full [&_img]:rounded-lg',
              '[&_table]:w-full [&_table]:text-sm',
              '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50',
              '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
              '[&_hr]:my-4',
            ].join(' ')}
          >
            <ReactMarkdown>{value}</ReactMarkdown>
          </div>
        </div>
      ) : (
        /* Editor — CodeMirror scrolls internally (globals.css forces
           .cm-editor height 100%); switching to Preview unmounts it and the
           controlled `value` is restored on return. */
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeMirror
            value={value}
            onChange={handleChange}
            extensions={extensions}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            className="h-full"
            style={{ height: '100%' }}
            basicSetup={BASIC_SETUP}
          />
        </div>
      )}
    </div>
  )
}
