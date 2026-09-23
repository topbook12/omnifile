'use client'

/**
 * Shared UI kit for the advanced tools suite (Task 3).
 *
 * Every tool panel is composed from these pieces so all 18 tools feel
 * identical: a dropzone → options card → run button → progress → results
 * with per-file and ZIP download. Tools NEVER re-implement this chrome.
 */

import { useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Download,
  FileDown,
  KeyRound,
  Loader2,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'

import { useAiStore } from '@/lib/ai-store'
import { downloadAllAsZip } from '@/lib/tools/batch'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { saveOrDownloadBlob } from '@/lib/fsa'
import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'

/* --------------------------------- shell ---------------------------------- */

/** Outer layout of a tool panel: icon + title + description + badges. */
export function ToolShell({
  icon,
  title,
  desc,
  children,
}: {
  icon?: ReactNode
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 rounded-xl bg-primary/10 p-2.5 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

/** Small "everything happens on this device" badge. */
export function OnDeviceBadge() {
  const { t } = useI18n()
  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/40 text-[11px] font-normal text-emerald-600 dark:text-emerald-400"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      {t('toolOnDevice')}
    </Badge>
  )
}

/** Small badge marking tools that use the user's own Gemini key. */
export function GeminiBadge() {
  const { t } = useI18n()
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-500/40 text-[11px] font-normal text-amber-600 dark:text-amber-400"
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      {t('toolNeedsKey')}
    </Badge>
  )
}

/* -------------------------------- dropzone -------------------------------- */

/**
 * Drag & drop + tap-to-pick file input with selected-file chips.
 * Controlled: the tool owns `files` and appends/removes via callbacks.
 */
export function ToolDropzone({
  accept,
  multiple = true,
  files,
  onFiles,
  onRemove,
  disabled = false,
}: {
  accept?: string
  multiple?: boolean
  files: File[]
  onFiles: (files: File[]) => void
  onRemove: (index: number) => void
  disabled?: boolean
}) {
  const { t, tf } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const depth = useRef(0)

  const openPicker = () => {
    if (disabled) return
    inputRef.current?.click()
  }

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return
    onFiles(multiple ? [...files, ...incoming] : incoming.slice(0, 1))
  }

  return (
    <div className="space-y-2.5">
      <div
        role="button"
        tabIndex={0}
        aria-label={multiple ? t('toolDropAccept') : t('toolDropAcceptOne')}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (disabled) return
          depth.current += 1
          setDragActive(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          depth.current -= 1
          if (depth.current <= 0) {
            depth.current = 0
            setDragActive(false)
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          depth.current = 0
          setDragActive(false)
          if (disabled) return
          addFiles(Array.from(e.dataTransfer.files))
        }}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragActive
            ? 'border-primary bg-primary/10'
            : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-accent/40'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        <PackageOpen className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">
          {multiple ? t('toolDropAccept') : t('toolDropAcceptOne')}
        </p>
        {multiple && <p className="text-xs text-muted-foreground">{t('toolBatchHint')}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 [scrollbar-width:thin]">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                aria-label={t('toolRemoveFile')}
                disabled={disabled}
                onClick={() => onRemove(i)}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {multiple && (
            <button
              type="button"
              disabled={disabled}
              onClick={openPicker}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 rotate-180" aria-hidden />
              {t('toolAddMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* --------------------------------- options -------------------------------- */

/** Card wrapper around a tool's option controls. */
export function ToolOptionsCard({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <Card className="border-border/70">
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'space-y-4 pt-0' : 'space-y-4'}>{children}</CardContent>
    </Card>
  )
}

/** Label + control row with optional hint text. */
export function ToolField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/* ------------------------------ run + progress ----------------------------- */

/** Primary action button with busy spinner. */
export function ToolRunButton({
  onClick,
  busy = false,
  disabled = false,
  children,
}: {
  onClick: () => void
  busy?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Button
      size="lg"
      className="h-12 w-full text-base"
      disabled={busy || disabled}
      onClick={onClick}
    >
      {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {children}
    </Button>
  )
}

/** Overall progress display (0..1). */
export function ToolProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-1.5">
      <Progress value={Math.round(value * 100)} aria-label={label} />
      {label && <p className="truncate text-xs text-muted-foreground">{label}</p>}
    </div>
  )
}

/* --------------------------------- results -------------------------------- */

/**
 * Processed results list: per-file download, "download all as ZIP" and
 * clear. Also surfaces per-file failures from the batch runner.
 */
export function ToolResults({
  results,
  failed,
  onClear,
  zipName = 'omnifile-results.zip',
}: {
  results: ToolResultFile[]
  failed: BatchFailure[]
  onClear: () => void
  zipName?: string
}) {
  const { t, tf } = useI18n()
  const [zipping, setZipping] = useState(false)

  if (results.length === 0 && failed.length === 0) return null

  const downloadOne = async (r: ToolResultFile) => {
    await saveOrDownloadBlob(r.blob, r.name)
    toast.success(t('tDownloadStarted'))
  }

  const downloadZip = async () => {
    setZipping(true)
    try {
      await downloadAllAsZip(results, zipName)
      toast.success(t('tDownloadStarted'))
    } finally {
      setZipping(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <FileDown className="h-4 w-4" aria-hidden />
          {tf('toolResultsReady', { n: results.length })}
          {failed.length > 0 && (
            <span className="font-normal text-amber-600 dark:text-amber-400">
              · {failed.length === 1 ? t('toolFailedOne') : tf('toolFailedMany', { n: failed.length })}
            </span>
          )}
        </p>
      </div>

      {failed.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {failed.length === 1 ? t('toolFailedOne') : tf('toolFailedMany', { n: failed.length })}
          </p>
          <ul className="mt-1 max-h-20 list-inside list-disc space-y-0.5 overflow-y-auto">
            {failed.map((f, i) => (
              <li key={i} className="truncate">
                {f.name} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 [scrollbar-width:thin]">
            {results.map((r, i) => (
              <div
                key={`${r.name}-${i}`}
                className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBytes(r.blob.size)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={t('toolDownload')}
                  onClick={() => void downloadOne(r)}
                >
                  <Download className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11 flex-1 gap-2" disabled={zipping} onClick={() => void downloadZip()}>
              {zipping ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden />
              )}
              {t('toolDownloadAll')}
            </Button>
            <Button variant="outline" className="h-11 sm:w-36" onClick={onClear}>
              {t('toolClear')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------- AI key notice ----------------------------- */

/**
 * Shown by AI tools when no Gemini key is configured. Clicking opens the
 * shared AI settings dialog (rendered once by the Tools Hub).
 */
export function AiKeyNotice() {
  const { t } = useI18n()
  const openDialog = useAiStore((s) => s.openDialog)
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 sm:flex-row sm:items-center">
      <KeyRound className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="flex-1 text-sm text-amber-700 dark:text-amber-300">{t('aiKeyMissing')}</p>
      <Button size="sm" variant="outline" className="shrink-0" onClick={openDialog}>
        <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden />
        {t('aiKeySetBtn')}
      </Button>
    </div>
  )
}
