'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileQuestion,
  FolderOpen,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'

import { InstallButton } from '@/components/pwa/install-button'
import { LangToggle } from '@/components/pwa/lang-toggle'
import { ThemeToggle } from '@/components/pwa/theme-toggle'
import { FileCard } from '@/components/library/file-card'
import { ToolsHub } from '@/components/tools/tools-hub'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

import {
  estimateStorage,
  addFiles,
  deleteFile,
  getFileBlob,
  listFiles,
  renameFile,
  requestPersistentStorage,
  updateFileBlob,
  type StoredFileMeta,
} from '@/lib/idb'
import {
  FILTER_GROUPS,
  filterGroupLabelKey,
  getExt,
  kindLabelKey,
  kindToGroup,
  type FilterGroup,
} from '@/lib/file-types'
import { downloadBlob, openFilesWithPicker, saveOrDownloadBlob } from '@/lib/fsa'
import { formatBytes } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { ViewerEditorProps } from '@/lib/viewer-types'

/* ------------------------------------------------------------------ */
/* Lazy-loaded viewers & editors (one chunk per format)                */
/* ------------------------------------------------------------------ */

const VIEWER_LOADING = (
  <div className="flex h-full min-h-[60vh] items-center justify-center">
    <div className="flex flex-col items-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm">…</p>
    </div>
  </div>
)

const PdfViewer = dynamic(() => import('@/components/viewers/pdf-viewer'), {
  ssr: false,
  loading: () => VIEWER_LOADING,
})
const TextEditor = dynamic(() => import('@/components/editors/text-editor'), {
  ssr: false,
  loading: () => VIEWER_LOADING,
})
const ImageEditor = dynamic(() => import('@/components/editors/image-editor'), {
  ssr: false,
  loading: () => VIEWER_LOADING,
})
const SheetEditor = dynamic(() => import('@/components/editors/sheet-editor'), {
  ssr: false,
  loading: () => VIEWER_LOADING,
})
const DocxViewer = dynamic(() => import('@/components/viewers/docx-viewer'), {
  ssr: false,
  loading: () => VIEWER_LOADING,
})
const MediaViewer = dynamic(() => import('@/components/viewers/media-viewer'), {
  ssr: false,
  loading: () => VIEWER_LOADING,
})

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const { t, tf } = useI18n()

  const [files, setFiles] = useState<StoredFileMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterGroup>('all')

  const [openId, setOpenId] = useState<string | null>(null)
  const [openBlob, setOpenBlob] = useState<Blob | null>(null)
  const [blobLoading, setBlobLoading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)

  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)

  const [deleteTarget, setDeleteTarget] = useState<StoredFileMeta | null>(null)
  const [renameTarget, setRenameTarget] = useState<StoredFileMeta | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)

  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [online, setOnline] = useState(true)

  const openFile = files.find((f) => f.id === openId) ?? null

  /* ------------------------- data loading ------------------------- */

  const refresh = useCallback(async () => {
    try {
      const [list, est] = await Promise.all([listFiles(), estimateStorage()])
      setFiles(list)
      setEstimate(est)
    } catch {
      toast.error(t('errGeneric'))
    }
  }, [t])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      await requestPersistentStorage() // keep browser from evicting saved files
      if (mounted) await refresh()
      if (mounted) setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [refresh])

  useEffect(() => {
    setOnline(navigator.onLine)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  /* Handle PWA shortcut /?action=open */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('action') === 'open') {
      openFilesWithPicker().then((picked) => {
        if (picked.length > 0) handleAddFiles(picked)
      })
    }
  }, [])

  /* ------------------------- file actions ------------------------- */

  const handleAddFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return
      try {
        await addFiles(incoming)
        await refresh()
        toast.success(tf('tFilesAdded', { n: incoming.length }))
      } catch {
        toast.error(t('tSaveFailed'))
      }
    },
    [refresh, t, tf]
  )

  const handleOpen = useCallback(async (file: StoredFileMeta) => {
    setOpenId(file.id)
    setDirty(false)
    setBlobLoading(true)
    try {
      const blob = await getFileBlob(file.id)
      setOpenBlob(blob)
    } catch {
      setOpenBlob(null)
      toast.error(t('tOpenFailed'))
    } finally {
      setBlobLoading(false)
    }
  }, [t])

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true)
    else {
      setOpenId(null)
      setOpenBlob(null)
      setDirty(false)
      setToolsOpen(false) // the brand button always returns to the library
    }
  }, [dirty])

  const doClose = useCallback(() => {
    setOpenId(null)
    setOpenBlob(null)
    setDirty(false)
    setConfirmClose(false)
  }, [])

  const handleSave = useCallback(
    async (newBlob: Blob) => {
      if (!openId) return
      try {
        await updateFileBlob(openId, newBlob)
        setOpenBlob(newBlob)
        setDirty(false)
        await refresh()
        // Success toast is shown by the calling editor (single-toast policy);
        // failures are surfaced here as the parent safety net.
      } catch {
        toast.error(t('tSaveFailed'))
      }
    },
    [openId, refresh, t]
  )

  const handleDownload = useCallback(
    async (file: StoredFileMeta, blob?: Blob | null) => {
      const target = blob ?? (await getFileBlob(file.id))
      if (!target) return
      await saveOrDownloadBlob(target, file.name)
      toast.success(t('tDownloadStarted'))
    },
    [t]
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteFile(deleteTarget.id)
      if (openId === deleteTarget.id) doClose()
      await refresh()
      toast.success(t('tFileDeleted'))
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, doClose, openId, refresh, t])

  const handleRename = useCallback(async () => {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name) return
    try {
      await renameFile(renameTarget.id, name)
      await refresh()
      toast.success(t('tRenamed'))
    } catch {
      toast.error(t('errGeneric'))
    } finally {
      setRenameTarget(null)
    }
  }, [renameTarget, renameValue, refresh, t])

  const pickFiles = useCallback(async () => {
    const picked = await openFilesWithPicker()
    await handleAddFiles(picked)
  }, [handleAddFiles])

  /* ------------------------- drag & drop ------------------------- */

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current += 1
    if (e.dataTransfer.types.includes('Files')) setDragActive(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }
  const onDragOver = (e: React.DragEvent) => e.preventDefault()
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const dropped = Array.from(e.dataTransfer.files)
    void handleAddFiles(dropped)
  }

  /* ------------------------- filtering ------------------------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((f) => {
      if (filter !== 'all' && kindToGroup(f.kind) !== filter) return false
      if (q && !f.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [files, filter, query])

  /* ------------------------- viewer routing ------------------------- */

  const viewerProps: ViewerEditorProps | null =
    openFile && openBlob
      ? {
          file: openFile,
          blob: openBlob,
          dirty,
          onDirtyChange: setDirty,
          onSave: handleSave,
        }
      : null

  function renderViewer() {
    if (!openFile) return null
    if (blobLoading || !viewerProps) return VIEWER_LOADING

    switch (openFile.kind) {
      case 'pdf':
        return <PdfViewer {...viewerProps} />
      case 'image':
        return <ImageEditor {...viewerProps} />
      case 'text':
      case 'markdown':
        return <TextEditor {...viewerProps} />
      case 'csv':
      case 'excel':
        return <SheetEditor {...viewerProps} />
      case 'docx':
        return <DocxViewer {...viewerProps} />
      case 'video':
      case 'audio':
        return <MediaViewer {...viewerProps} />
      default:
        return <UnsupportedView file={openFile} onDownload={() => handleDownload(openFile, openBlob)} />
    }
  }

  /* ------------------------- render ------------------------- */

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden"
      onDragEnter={openId || toolsOpen ? undefined : onDragEnter}
      onDragLeave={openId || toolsOpen ? undefined : onDragLeave}
      onDragOver={onDragOver}
      onDrop={openId || toolsOpen ? undefined : onDrop}
    >
      {/* ---------------- Header ---------------- */}
      <header
        className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
          <button
            className="group flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
            onClick={requestClose}
            aria-label={t('appName')}
          >
            <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10 transition-transform duration-200 group-hover:scale-105">
              <img src="/icons/icon-192.png" alt="" className="h-9 w-9" />
            </span>
            {/* Brand text hides on ultra-narrow phones so the action buttons fit. */}
            <span className="hidden min-[400px]:block min-[400px]:truncate min-[400px]:text-[17px] min-[400px]:font-extrabold min-[400px]:tracking-tight">
              Omni<span className="text-gradient">File</span>
            </span>
          </button>

          {openFile && (
            <>
              <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
              <div className="hidden min-w-0 items-center gap-2 sm:flex">
                <p className="max-w-[220px] truncate text-sm text-muted-foreground md:max-w-xs">
                  {openFile.name}
                </p>
                {dirty && (
                  <Badge variant="outline" className="gap-1 border-amber-500/50 text-[11px] text-amber-600 dark:text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {t('dirtyIndicator')}
                  </Badge>
                )}
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {openFile ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5"
                  onClick={requestClose}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('back')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5"
                  disabled={blobLoading || !openBlob}
                  onClick={() => handleDownload(openFile, openBlob)}
                  aria-label={t('download')}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('download')}</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant={toolsOpen ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 gap-1.5"
                  onClick={() => setToolsOpen((v) => !v)}
                >
                  <Wrench className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('toolsOpen')}</span>
                </Button>
                <InstallButton />
                {!toolsOpen && (
                  <Button size="sm" className="h-10 gap-1.5" onClick={pickFiles}>
                    <FolderOpen className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('openFiles')}</span>
                  </Button>
                )}
              </>
            )}
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>
      </header>

      {/* ---------------- Main ---------------- */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {openId ? (
          <div className="flex min-h-0 flex-1 flex-col">{renderViewer()}</div>
        ) : toolsOpen ? (
          <ToolsHub onBack={() => setToolsOpen(false)} />
        ) : (
          <div className="mx-auto h-full w-full max-w-6xl flex-1 overflow-y-auto px-4 pb-12 pt-6">
            {/* Drop zone hero */}
            <div
              role="button"
              tabIndex={0}
              aria-label={t('dropHere')}
              onClick={pickFiles}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  void pickFiles()
                }
              }}
              className="group relative flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-3xl border border-border/80 bg-card p-6 text-center shadow-premium transition-all duration-300 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.99] sm:min-h-[240px] sm:p-10 animate-fade-up"
            >
              {/* Aurora glow + engineering grid backdrop */}
              <div aria-hidden className="aurora-glow pointer-events-none absolute inset-0 opacity-80" />
              <div
                aria-hidden
                className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,black,transparent)]"
              />
              {/* Top shimmer sweep on hover */}
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
                <div className="animate-shimmer h-px w-1/3 bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              </div>

              <div className="relative flex flex-col items-center">
                <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {t('tagline')}
                </span>
                <div className="animate-float rounded-2xl bg-gradient-to-b from-primary/18 to-primary/8 p-3.5 text-primary shadow-inner ring-1 ring-inset ring-primary/20 transition-transform duration-300 group-hover:scale-105 sm:p-4">
                  <FolderOpen className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
                </div>
                <p className="mt-3.5 text-lg font-bold tracking-tight sm:text-xl">{t('dropHere')}</p>
                <p className="max-w-md text-sm text-muted-foreground">{t('dropHint')}</p>
                <div className="mt-3 flex max-w-lg flex-wrap items-center justify-center gap-1.5">
                  {t('supportedFormats')
                    .split('•')
                    .map((raw) => raw.trim())
                    .filter(Boolean)
                    .map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border/70 bg-background/70 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm transition-colors group-hover:border-primary/25 group-hover:text-foreground/80"
                      >
                        {label}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            {/* Search + filters */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('search')}
                  className="h-11 pl-9"
                />
              </div>
              <div
                className="flex gap-1.5 overflow-x-auto pb-1"
                role="tablist"
                aria-label={t('myFiles')}
              >
                {FILTER_GROUPS.map((g) => (
                  <Button
                    key={g}
                    role="tab"
                    aria-selected={filter === g}
                    variant={filter === g ? 'default' : 'secondary'}
                    size="sm"
                    className="h-9 shrink-0 rounded-full px-3.5 shadow-xs transition-all"
                    onClick={() => setFilter(g)}
                  >
                    {t(filterGroupLabelKey(g))}
                  </Button>
                ))}
              </div>
            </div>

            {/* Count + storage */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {loading ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  tf('filesCount', { n: filtered.length })
                )}
              </span>
              {estimate && estimate.quota > 0 && (
                <span className="flex items-center gap-2 text-xs">
                  <span
                    className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block"
                    role="progressbar"
                    aria-valuenow={Math.min(100, Math.round((estimate.usage / estimate.quota) * 100))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
                      style={{
                        width: `${Math.max(2, Math.min(100, (estimate.usage / estimate.quota) * 100))}%`,
                      }}
                    />
                  </span>
                  {tf('storageUsed', {
                    used: formatBytes(estimate.usage),
                    quota: formatBytes(estimate.quota),
                  })}
                </span>
              )}
            </div>

            {/* Grid */}
            {!loading && filtered.length === 0 ? (
              <div className="mt-10 flex flex-col items-center gap-2 py-10 text-center">
                <div className="rounded-2xl bg-muted/60 p-4">
                  <FileQuestion className="h-10 w-10 text-muted-foreground/60" aria-hidden />
                </div>
                <p className="mt-2 text-base font-semibold">
                  {files.length === 0 ? t('noFilesYet') : t('noResults')}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {files.length === 0 ? t('noFilesHint') : t('noResultsHint')}
                </p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-[92px] rounded-2xl" />
                    ))
                  : filtered.map((f, i) => (
                      <FileCard
                        key={f.id}
                        file={f}
                        style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                        onOpen={handleOpen}
                        onDownload={(file) => void handleDownload(file)}
                        onDelete={setDeleteTarget}
                        onRename={(file) => {
                          setRenameTarget(file)
                          setRenameValue(file.name)
                        }}
                      />
                    ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ---------------- Footer (always visible at the bottom) ---------------- */}
      <footer
        className="relative shrink-0 bg-background/70 py-3 backdrop-blur-sm"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div aria-hidden className="hairline-gradient absolute inset-x-0 top-0 h-px opacity-60" />
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1.5 px-4 text-xs text-muted-foreground sm:flex-row">
          <p className="flex items-center gap-1.5 text-center sm:text-left">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            {t('localFirstNote')}
          </p>
          <p className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/60' : 'bg-amber-500 shadow-[0_0_6px] shadow-amber-500/60'}`}
              aria-hidden
            />
            {online ? t('statusOnline') : t('offlineBadge')}
          </p>
        </div>
      </footer>

      {/* ---------------- Drag overlay ---------------- */}
      {dragActive && !openId && !toolsOpen && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="shadow-premium-lg rounded-3xl border-2 border-dashed border-primary/60 bg-background/95 px-12 py-10 text-center">
            <div className="animate-float rounded-2xl bg-primary/10 p-3">
              <FolderOpen className="mx-auto h-10 w-10 text-primary" aria-hidden />
            </div>
            <p className="mt-3 text-lg font-bold tracking-tight">{t('dropHere')}</p>
          </div>
        </div>
      )}

      {/* ---------------- Delete confirm ---------------- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? tf('deleteConfirmDesc', { name: deleteTarget.name })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------------- Rename dialog ---------------- */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('renameTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('renameTitle')}</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={t('namePlaceholder')}
            aria-label={t('renameTitle')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRename()
            }}
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleRename()} disabled={!renameValue.trim()}>
              {t('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Unsaved changes ---------------- */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
              {t('dirtyCloseTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('dirtyCloseDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dirtyCloseStay')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={doClose}
            >
              {t('dirtyCloseLeave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Unsupported file type                                               */
/* ------------------------------------------------------------------ */

function UnsupportedView({
  file,
  onDownload,
}: {
  file: StoredFileMeta
  onDownload: () => void
}) {
  const { t, tf } = useI18n()
  const ext = getExt(file.name)

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="rounded-full bg-muted p-4">
          <FileQuestion className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-lg font-semibold">{t('unsupportedTitle')}</p>
        <p className="text-sm text-muted-foreground">{tf('unsupportedDesc', { ext })}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" size="sm" className="h-10" onClick={onDownload}>
            <Download className="mr-1.5 h-4 w-4" />
            {t('download')}
          </Button>
        </div>
      </div>
    </div>
  )
}
