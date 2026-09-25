'use client'

/**
 * Share & cloud sync (Task 2-f) — three independent cards around the
 * working PDF:
 *   1. Share        → Web Share API (with download fallback).
 *   2. Bundle       → portable .omnibundle (fflate zip: meta.json + PDF).
 *   3. Cloud sync   → upload / list / download on Google Drive or Dropbox
 *                     using the user's OWN access token (BYO token).
 *
 * Network requests go straight from the browser to the provider's public
 * CORS-enabled APIs. The token lives only in this tab (optionally in
 * localStorage on this device) — OmniFile has no server in the loop.
 */

import { useState } from 'react'
import {
  CheckCircle2,
  CloudUpload,
  Download,
  FileArchive,
  List,
  Loader2,
  PackageOpen,
  Share2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  OnDeviceBadge,
  ToolDropzone,
  ToolField,
  ToolOptionsCard,
  ToolResults,
  ToolShell,
} from '@/components/tools/shared'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'
import { formatBytes } from '@/lib/format'
import { baseName } from '@/lib/tools/batch'
import { errMessage, ToolError } from '@/lib/tools/pdf-tools-advanced'
import type { ToolResultFile } from '@/lib/tools/types'

type Provider = 'drive' | 'dropbox'

const TOKEN_KEYS: Record<Provider, string> = {
  drive: 'omnifile.cloud.token.drive',
  dropbox: 'omnifile.cloud.token.dropbox',
}

const PROVIDER_NAME: Record<Provider, string> = {
  drive: 'Google Drive',
  dropbox: 'Dropbox',
}

/** One row of the "recent files" listing. */
interface CloudRow {
  id: string
  name: string
  size: number
  /** Dropbox path (Drive downloads go by id). */
  path: string
  provider: Provider
}

const SCROLLBAR =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30'

const RADIO_ROW =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'

/** Map a failed provider response onto the shared ToolError i18n keys. */
function cloudErr(status: number): ToolError {
  if (status === 401 || status === 403) return new ToolError('pdfErrCloudAuth')
  if (status === 429) return new ToolError('pdfErrCloudRate')
  return new ToolError('pdfErrCloudNetwork', `HTTP ${status}`)
}

function networkErr(): ToolError {
  return new ToolError('pdfErrCloudNetwork')
}

export default function PdfCloudTool() {
  const { t, tf } = useI18n()

  // Working file + shared results
  const [file, setFile] = useState<File | null>(null)
  const [results, setResults] = useState<ToolResultFile[]>([])

  // Card 1 — share
  const [shareBusy, setShareBusy] = useState(false)
  const [canShareFiles] = useState<boolean>(() => {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
    try {
      const probe = new File([new Uint8Array([0])], 'probe.pdf', { type: 'application/pdf' })
      return navigator.canShare({ files: [probe] })
    } catch {
      return false
    }
  })

  // Card 2 — bundle
  const [bundleFile, setBundleFile] = useState<File | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)

  // Card 3 — cloud sync
  const [provider, setProvider] = useState<Provider>('drive')
  const [token, setToken] = useState<string>(() => {
    try {
      return window.localStorage.getItem(TOKEN_KEYS.drive) ?? ''
    } catch {
      return ''
    }
  })
  const [remember, setRemember] = useState<boolean>(() => {
    try {
      return Boolean(window.localStorage.getItem(TOKEN_KEYS.drive))
    } catch {
      return false
    }
  })
  const [uploadBusy, setUploadBusy] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [uploadedId, setUploadedId] = useState<string | null>(null)
  const [rows, setRows] = useState<CloudRow[]>([])
  const [listed, setListed] = useState(false)

  /* ------------------------------ token storage ----------------------------- */

  const storeToken = (p: Provider, value: string) => {
    try {
      window.localStorage.setItem(TOKEN_KEYS[p], value)
    } catch {
      /* storage unavailable — token stays in memory only */
    }
  }

  const clearToken = (p: Provider) => {
    try {
      window.localStorage.removeItem(TOKEN_KEYS[p])
    } catch {
      /* ignore */
    }
  }

  const switchProvider = (p: Provider) => {
    if (p === provider) return
    setProvider(p)
    setUploadedId(null)
    setRows([])
    setListed(false)
    let stored = ''
    try {
      stored = window.localStorage.getItem(TOKEN_KEYS[p]) ?? ''
    } catch {
      /* ignore */
    }
    setToken(stored)
    setRemember(Boolean(stored))
  }

  const onTokenChange = (value: string) => {
    setToken(value)
    if (remember) {
      const trimmed = value.trim()
      if (trimmed) storeToken(provider, trimmed)
      else clearToken(provider)
    }
  }

  const onRememberChange = (checked: boolean) => {
    setRemember(checked)
    const trimmed = token.trim()
    if (checked && trimmed) storeToken(provider, trimmed)
    if (!checked) clearToken(provider)
  }

  /* --------------------------------- actions -------------------------------- */

  const addFile = (incoming: File[]) => {
    setFile(incoming[0] ?? null)
    setUploadedId(null)
  }

  const sharePdf = async () => {
    if (!file || shareBusy) return
    setShareBusy(true)
    try {
      const shareFile = new File([await file.arrayBuffer()], file.name, {
        type: 'application/pdf',
      })
      if (typeof navigator.share === 'function' && navigator.canShare({ files: [shareFile] })) {
        await navigator.share({ files: [shareFile], title: file.name })
        toast.success(t('pdfCloudShared'))
      } else {
        throw new ToolError('pdfCloudShareUnsupported')
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        /* user cancelled the share sheet — not an error */
      } else {
        toast.error(errMessage(err, t))
      }
    } finally {
      setShareBusy(false)
    }
  }

  const downloadWorking = async () => {
    if (!file) return
    try {
      const { saveOrDownloadBlob } = await import('@/lib/fsa')
      await saveOrDownloadBlob(file, file.name)
      toast.success(t('tDownloadStarted'))
    } catch (err) {
      toast.error(errMessage(err, t))
    }
  }

  const exportBundle = async () => {
    if (!file || exportBusy) return
    setExportBusy(true)
    try {
      const { zipSync } = await import('fflate')
      const meta = {
        name: file.name,
        size: file.size,
        exportedAt: new Date().toISOString(),
        app: 'omnifile',
      }
      const zipped = zipSync({
        'meta.json': new TextEncoder().encode(JSON.stringify(meta, null, 2)),
        'document.pdf': new Uint8Array(await file.arrayBuffer()),
      })
      setResults((prev) => [
        ...prev,
        {
          name: `${baseName(file.name)}.omnibundle`,
          blob: new Blob([zipped], { type: 'application/octet-stream' }),
        },
      ])
      toast.success(t('tExportDone'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setExportBusy(false)
    }
  }

  const importBundle = async () => {
    if (!bundleFile || importBusy) return
    setImportBusy(true)
    try {
      const { unzipSync } = await import('fflate')
      const entries = unzipSync(new Uint8Array(await bundleFile.arrayBuffer()))

      const metaRaw = entries['meta.json']
      const pdfBytes = entries['document.pdf']
      if (!metaRaw || !pdfBytes) throw new ToolError('pdfErrBundleBad')

      let pdfName = 'document.pdf'
      try {
        const meta = JSON.parse(new TextDecoder().decode(metaRaw)) as {
          app?: string
          name?: string
        }
        if (meta.app !== 'omnifile') throw new Error('bad app')
        if (meta.name && meta.name.trim()) pdfName = meta.name.trim()
      } catch {
        throw new ToolError('pdfErrBundleBad')
      }

      setResults((prev) => [
        ...prev,
        { name: pdfName, blob: new Blob([pdfBytes], { type: 'application/pdf' }) },
      ])
      setBundleFile(null)
      toast.success(t('pdfCloudImportDone'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setImportBusy(false)
    }
  }

  /* ------------------------------ cloud requests ----------------------------- */

  const upload = async () => {
    const f = file
    const tk = token.trim()
    if (!f || uploadBusy) return
    if (!tk) {
      toast.error(t('pdfErrCloudNoToken'))
      return
    }
    setUploadBusy(true)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      let res: Response
      if (provider === 'drive') {
        const boundary = `omnifile${Date.now()}`
        const meta = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: f.name })}\r\n`
        const part = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
        const end = `\r\n--${boundary}--`
        res = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tk}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: new Blob([meta, part, bytes, end]),
          }
        )
      } else {
        res = await fetch('https://content.dropboxapi.com/2/files/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tk}`,
            'Dropbox-API-Arg': JSON.stringify({ path: `/${f.name}`, mode: 'overwrite' }),
            'Content-Type': 'application/octet-stream',
          },
          body: bytes,
        })
      }
      if (!res.ok) throw cloudErr(res.status)
      const json = (await res.json()) as { id?: string }
      setUploadedId(json.id ?? null)
      toast.success(tf('pdfCloudUploaded', { provider: PROVIDER_NAME[provider] }))
    } catch (err) {
      toast.error(errMessage(err instanceof ToolError ? err : networkErr(), t))
    } finally {
      setUploadBusy(false)
    }
  }

  const listRecent = async () => {
    const tk = token.trim()
    if (listBusy) return
    if (!tk) {
      toast.error(t('pdfErrCloudNoToken'))
      return
    }
    setListBusy(true)
    try {
      if (provider === 'drive') {
        const qs = new URLSearchParams({
          orderBy: 'createdTime desc',
          pageSize: '8',
          fields: 'files(id,name,size,mimeType)',
        })
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${tk}` },
        })
        if (!res.ok) throw cloudErr(res.status)
        const json = (await res.json()) as {
          files?: Array<{ id?: string; name?: string; size?: string }>
        }
        setRows(
          (json.files ?? [])
            .filter((f): f is { id: string; name: string; size?: string } =>
              Boolean(f.id && f.name)
            )
            .map((f) => ({
              id: f.id,
              name: f.name,
              size: Number(f.size ?? 0),
              path: '',
              provider: 'drive' as const,
            }))
        )
      } else {
        const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: '', limit: 8 }),
        })
        if (!res.ok) throw cloudErr(res.status)
        const json = (await res.json()) as {
          entries?: Array<{ '.tag'?: string; id?: string; name?: string; size?: number; path_display?: string }>
        }
        setRows(
          (json.entries ?? [])
            .filter((e) => e['.tag'] === 'file' && e.id && e.name)
            .map((e) => ({
              id: e.id!,
              name: e.name!,
              size: Number(e.size ?? 0),
              path: e.path_display ?? `/${e.name}`,
              provider: 'dropbox' as const,
            }))
        )
      }
      setListed(true)
    } catch (err) {
      toast.error(errMessage(err instanceof ToolError ? err : networkErr(), t))
    } finally {
      setListBusy(false)
    }
  }

  const downloadRow = async (row: CloudRow) => {
    const tk = token.trim()
    if (!tk || downloading) return
    setDownloading(row.id)
    try {
      let blob: Blob
      if (row.provider === 'drive') {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.id)}?alt=media`,
          { headers: { Authorization: `Bearer ${tk}` } }
        )
        if (!res.ok) throw cloudErr(res.status)
        blob = await res.blob()
      } else {
        const res = await fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tk}`,
            'Dropbox-API-Arg': JSON.stringify({ path: row.path }),
          },
        })
        if (!res.ok) throw cloudErr(res.status)
        blob = await res.blob()
      }
      setResults((prev) => [...prev, { name: row.name, blob }])
    } catch (err) {
      toast.error(errMessage(err instanceof ToolError ? err : networkErr(), t))
    } finally {
      setDownloading(null)
    }
  }

  /* ----------------------------------- UI ------------------------------------ */

  return (
    <ToolShell icon={<CloudUpload />} title={t('toolPdfCloud')} desc={t('toolPdfCloudDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>
      <p className="text-xs text-muted-foreground">{t('pdfCloudPrivacyNote')}</p>

      <ToolDropzone
        accept="application/pdf"
        multiple={false}
        files={file ? [file] : []}
        onFiles={addFile}
        onRemove={() => setFile(null)}
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* ── Card 1: Share ── */}
        <ToolOptionsCard title={t('pdfCloudShareTitle')}>
          <p className="text-sm text-muted-foreground">{t('pdfCloudShareDesc')}</p>
          {canShareFiles ? (
            <Button
              className="h-11 w-full gap-2"
              disabled={!file || shareBusy}
              onClick={() => void sharePdf()}
            >
              {shareBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Share2 className="h-4 w-4" aria-hidden />
              )}
              {t('pdfCloudShare')}
            </Button>
          ) : (
            <>
              <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                {t('pdfCloudShareUnsupported')}
              </p>
              <Button
                variant="outline"
                className="h-11 w-full gap-2"
                disabled={!file}
                onClick={() => void downloadWorking()}
              >
                <Download className="h-4 w-4" aria-hidden />
                {t('toolDownload')}
              </Button>
            </>
          )}
          {!file && <p className="text-xs text-muted-foreground">{t('pdfCloudPickFirst')}</p>}
        </ToolOptionsCard>

        {/* ── Card 2: Portable bundle ── */}
        <ToolOptionsCard title={t('pdfCloudBundleTitle')}>
          <p className="text-sm text-muted-foreground">{t('pdfCloudBundleHint')}</p>
          <Button
            className="h-11 w-full gap-2"
            disabled={!file || exportBusy}
            onClick={() => void exportBundle()}
          >
            {exportBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileArchive className="h-4 w-4" aria-hidden />
            )}
            {t('pdfCloudExportBundle')}
          </Button>

          <div className="space-y-2">
            <ToolDropzone
              accept=".omnibundle"
              multiple={false}
              files={bundleFile ? [bundleFile] : []}
              onFiles={(incoming) => setBundleFile(incoming[0] ?? null)}
              onRemove={() => setBundleFile(null)}
              disabled={importBusy}
            />
            <Button
              variant="outline"
              className="h-11 w-full gap-2"
              disabled={!bundleFile || importBusy}
              onClick={() => void importBundle()}
            >
              {importBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <PackageOpen className="h-4 w-4" aria-hidden />
              )}
              {t('pdfCloudImportBundle')}
            </Button>
          </div>
        </ToolOptionsCard>

        {/* ── Card 3: Cloud sync (BYO token) ── */}
        <ToolOptionsCard title={t('pdfCloudCloudTitle')}>
          <ToolField label={t('pdfCloudProvider')}>
            <RadioGroup
              value={provider}
              onValueChange={(v) => switchProvider(v as Provider)}
              className="gap-3"
            >
              {(
                [
                  ['drive', 'pdfCloudDrive'],
                  ['dropbox', 'pdfCloudDropbox'],
                ] as Array<[Provider, string]>
              ).map(([value, key]) => (
                <Label key={value} htmlFor={`pdf-cloud-${value}`} className={RADIO_ROW}>
                  <RadioGroupItem id={`pdf-cloud-${value}`} value={value} />
                  {t(key)}
                </Label>
              ))}
            </RadioGroup>
          </ToolField>

          <ToolField
            label={t('pdfCloudToken')}
            hint={provider === 'drive' ? t('pdfCloudTokenHelpDrive') : t('pdfCloudTokenHelpDropbox')}
          >
            <Input
              type="password"
              value={token}
              onChange={(e) => onTokenChange(e.target.value)}
              placeholder={t('pdfCloudTokenPlaceholder')}
              aria-label={t('pdfCloudToken')}
              autoComplete="off"
              className="h-11"
            />
            <Label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-0.5 text-sm font-normal">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => onRememberChange(v === true)}
                aria-label={t('pdfCloudSaveToken')}
              />
              {t('pdfCloudSaveToken')}
            </Label>
          </ToolField>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="h-11 gap-2"
              disabled={!file || uploadBusy}
              onClick={() => void upload()}
            >
              {uploadBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {t('pdfCloudUpload')}
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-2"
              disabled={listBusy}
              onClick={() => void listRecent()}
            >
              {listBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <List className="h-4 w-4" aria-hidden />
              )}
              {t('pdfCloudList')}
            </Button>
          </div>

          {uploadedId && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('pdfCloudFileId')}:
              <code className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono">
                {uploadedId}
              </code>
            </p>
          )}

          {rows.length > 0 && (
            <div
              className={`max-h-64 space-y-1.5 overflow-y-auto rounded-xl border bg-card p-2 ${SCROLLBAR}`}
              aria-label={t('pdfCloudList')}
            >
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(row.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={t('toolDownload')}
                    disabled={downloading === row.id}
                    onClick={() => void downloadRow(row)}
                  >
                    {downloading === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {rows.length === 0 && listed && (
            <p className="text-center text-xs text-muted-foreground">{t('pdfCloudNothing')}</p>
          )}
        </ToolOptionsCard>
      </div>

      {/* Shared results area (bundles, imported PDFs, cloud downloads) */}
      <ToolResults results={results} failed={[]} onClear={() => setResults([])} />
    </ToolShell>
  )
}
