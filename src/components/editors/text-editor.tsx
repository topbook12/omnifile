'use client'

/**
 * Text / Markdown editor — Task 2-b.
 * CodeMirror 6 editing (@uiw/react-codemirror) + live markdown preview
 * (react-markdown). JSON files get json() syntax highlighting; markdown files
 * get fenced-code highlighting via @codemirror/language-data. Everything is
 * client-side; the blob comes from IndexedDB via the shared viewer contract.
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
import { Eye, FileCode, Loader2, Pencil, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n'
import { getExt } from '@/lib/file-types'
import type { ViewerEditorProps } from '@/lib/viewer-types'

type EditorTab = 'edit' | 'preview'

/**
 * Module-level constant (stable identity) — @uiw/react-codemirror includes
 * basicSetup in its reconfigure effect deps, so a fresh object literal on
 * every parent re-render (dirty flag flips per keystroke) would rebuild the
 * setup and reset undo history.
 */
const BASIC_SETUP = { foldGutter: false } as const

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

        <div className="flex shrink-0 items-center gap-2">
          {isLoaded && !isLoadError && (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {tf('chars', { n: value.length })}
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
