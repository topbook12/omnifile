'use client'

/**
 * E-sign workflow — a local-first, multi-step signing tracker.
 *
 * Requests (document name, signers, status, note) are persisted in
 * localStorage under 'omnifile.esign.requests'. The PDF file itself is
 * NEVER persisted (privacy) — to sign, the user re-picks the file, draws a
 * signature on the inline pad and taps the page where it should go; the
 * signed copy is produced on-device with signPdf() and downloaded directly.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  PenTool,
  Plus,
  ShieldCheck,
  Signature,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { OnDeviceBadge, ToolShell } from '@/components/tools/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { openFilesWithInput, saveOrDownloadBlob } from '@/lib/fsa'
import { useI18n } from '@/lib/i18n'
import {
  canvasToBlob,
  closePdfDoc,
  cropSignatureCanvas,
  errMessage,
  pdfResultName,
  pdfjsDoc,
  renderPdfPage,
  signPdf,
} from '@/lib/tools/pdf-tools-advanced'

const STORAGE_KEY = 'omnifile.esign.requests'
const PAD_W = 600
const PAD_H = 160
const PREVIEW_TARGET_W = 560

interface EsignSigner {
  name: string
  status: 'pending' | 'signed'
  at?: string
}

interface EsignRequest {
  id: string
  fileName: string
  createdAt: string
  signers: EsignSigner[]
  status: 'draft' | 'in-progress' | 'completed'
  note: string
}

const STATUS_BADGE: Record<EsignRequest['status'], string> = {
  draft: 'border-border bg-muted/40 text-muted-foreground',
  'in-progress': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

export default function PdfEsignFlowTool() {
  const { t, tf } = useI18n()

  /* ------------------------------ persistence ------------------------------ */

  const [requests, setRequests] = useState<EsignRequest[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? (JSON.parse(raw) as EsignRequest[]) : []
      if (Array.isArray(parsed)) setRequests(parsed.filter((r) => r && typeof r.id === 'string'))
    } catch {
      /* ignore corrupted storage */
    }
    // One-time mount sync from localStorage.
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
    } catch {
      /* storage full / private mode — workflow still works in memory */
    }
  }, [requests, loaded])

  /* ---------------------------- create-request form ------------------------- */

  const [newName, setNewName] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newSigners, setNewSigners] = useState<string[]>([''])

  const saveRequest = () => {
    const fileName = newName.trim()
    if (!fileName) {
      toast.error(t('pdfEsignRequireName'))
      return
    }
    const signers = newSigners
      .map((s) => s.trim())
      .filter(Boolean)
      .map<EsignSigner>((name) => ({ name, status: 'pending' }))
    if (signers.length === 0) {
      toast.error(t('pdfEsignRequireSigner'))
      return
    }
    const request: EsignRequest = {
      id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`,
      fileName,
      createdAt: new Date().toISOString(),
      signers,
      status: 'draft',
      note: newNote.trim(),
    }
    setRequests((prev) => [request, ...prev])
    setNewName('')
    setNewNote('')
    setNewSigners([''])
    toast.success(t('pdfEsignSaved'))
  }

  const pickNameFile = async () => {
    const [picked] = await openFilesWithInput('application/pdf', false)
    if (picked) setNewName(picked.name.replace(/\.[^.]+$/, ''))
  }

  /* -------------------------------- mutations ------------------------------- */

  const setStatusFor = (signers: EsignSigner[]): EsignRequest['status'] => {
    if (signers.length > 0 && signers.every((s) => s.status === 'signed')) return 'completed'
    if (signers.some((s) => s.status === 'signed')) return 'in-progress'
    return 'draft'
  }

  const markSigned = (reqId: string, signerIndex: number) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== reqId) return r
        const signers = r.signers.map((s, i) =>
          i === signerIndex ? { ...s, status: 'signed' as const, at: new Date().toISOString() } : s
        )
        return { ...r, signers, status: setStatusFor(signers) }
      })
    )
    const req = requests.find((r) => r.id === reqId)
    const willComplete =
      req !== undefined && req.signers.every((s, i) => i === signerIndex || s.status === 'signed')
    if (willComplete) toast.success(t('pdfEsignAllSigned'))
  }

  const deleteRequest = (reqId: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== reqId))
    if (signing?.reqId === reqId) setSigning(null)
  }

  /* ----------------------------- signing session ---------------------------- */

  const [signing, setSigning] = useState<{ reqId: string; signer: number } | null>(null)
  const [signFile, setSignFile] = useState<File | null>(null)
  const [signPageCount, setSignPageCount] = useState(1)
  const [signPageIndex, setSignPageIndex] = useState(0)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [showPad, setShowPad] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [sigBlob, setSigBlob] = useState<Blob | null>(null)
  const [placement, setPlacement] = useState<{ x: number; y: number } | null>(null)
  const [widthNorm, setWidthNorm] = useState(0.2)
  const [signingBusy, setSigningBusy] = useState(false)

  const signDocRef = useRef<Awaited<ReturnType<typeof pdfjsDoc>> | null>(null)
  const signDocFileRef = useRef<File | null>(null)
  const signCanvasRef = useRef<HTMLCanvasElement>(null)
  const padCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  const openSigning = (reqId: string, signer: number) => {
    setSigning({ reqId, signer })
    setSignFile(null)
    setSigBlob(null)
    setHasInk(false)
    setShowPad(false)
    setPlacement(null)
    setSignPageIndex(0)
    if (signDocRef.current) void closePdfDoc(signDocRef.current)
    signDocRef.current = null
    signDocFileRef.current = null
  }

  const closeSigning = () => {
    setSigning(null)
    setSignFile(null)
    setSigBlob(null)
    if (signDocRef.current) void closePdfDoc(signDocRef.current)
    signDocRef.current = null
    signDocFileRef.current = null
  }

  useEffect(() => {
    return () => {
      if (signDocRef.current) void closePdfDoc(signDocRef.current)
      signDocRef.current = null
    }
  }, [])

  /* Preview of the file being signed (rendered only while a signer is open). */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!signing || !signFile) return
      try {
        setPreviewBusy(true)
        if (!signDocRef.current || signDocFileRef.current !== signFile) {
          if (signDocRef.current) void closePdfDoc(signDocRef.current)
          signDocRef.current = await pdfjsDoc(signFile)
          signDocFileRef.current = signFile
          setSignPageCount(signDocRef.current.numPages)
          setSignPageIndex(0)
        }
        const doc = signDocRef.current
        if (!doc || cancelled) return
        const page = await doc.getPage(Math.min(signPageIndex + 1, doc.numPages))
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(3, Math.max(0.4, PREVIEW_TARGET_W / base.width))
        const offscreen = await renderPdfPage(page, scale)
        if (cancelled) {
          offscreen.width = 0
          return
        }
        const vis = signCanvasRef.current
        if (vis) {
          vis.width = offscreen.width
          vis.height = offscreen.height
          vis.getContext('2d')?.drawImage(offscreen, 0, 0)
        }
        offscreen.width = 0
      } catch (err) {
        if (!cancelled) {
          toast.error(errMessage(err, t))
          setSignFile(null)
        }
      } finally {
        if (!cancelled) setPreviewBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signing, signFile, signPageIndex, t])

  /* ------------------------------ signature pad ----------------------------- */

  const padCtx = () => {
    const ctx = padCanvasRef.current?.getContext('2d') ?? null
    if (ctx) {
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111111'
    }
    return ctx
  }

  const padPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = padCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const ctx = padCtx()
    if (!ctx) return
    padCanvasRef.current?.setPointerCapture(e.pointerId)
    const { x, y } = padPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
    drawingRef.current = true
    setHasInk(true)
  }

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = padCtx()
    if (!ctx) return
    const { x, y } = padPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = () => {
    drawingRef.current = false
  }

  const clearPad = () => {
    const canvas = padCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const applySignature = async () => {
    const canvas = padCanvasRef.current
    if (!canvas) return
    const cropped = cropSignatureCanvas(canvas)
    if (!cropped) {
      toast.error(t('pdfSignNoSig'))
      return
    }
    const blob = await canvasToBlob(cropped, 'image/png')
    setSigBlob(blob)
    setShowPad(false)
  }

  /* ------------------------------- place + sign ------------------------------ */

  const onPreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setPlacement({ x, y })
  }

  const signAndDownload = async () => {
    if (!signFile || !sigBlob || !placement || !signing || signingBusy) return
    setSigningBusy(true)
    try {
      const blob = await signPdf(signFile, sigBlob, {
        pageIndex: signPageIndex,
        xNorm: placement.x,
        yNorm: placement.y,
        widthNorm,
      })
      await saveOrDownloadBlob(blob, pdfResultName.signed(signFile.name))
      toast.success(t('pdfEsignDone'))
      markSigned(signing.reqId, signing.signer)
      closeSigning()
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setSigningBusy(false)
    }
  }

  /* ----------------------------------- UI ----------------------------------- */

  const signingReq = signing ? requests.find((r) => r.id === signing.reqId) : undefined
  const signingSigner = signingReq && signing ? signingReq.signers[signing.signer] : undefined

  return (
    <ToolShell icon={<Signature />} title={t('toolPdfEsignFlow')} desc={t('toolPdfEsignFlowDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      {/* Create request */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" aria-hidden />
            {t('pdfEsignNew')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">{t('pdfEsignFileName')}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-11 flex-1"
              />
              <Button
                variant="outline"
                className="h-11 gap-2"
                onClick={() => void pickNameFile()}
              >
                <PenTool className="h-4 w-4" aria-hidden />
                {t('pdfEsignPickName')}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t('pdfEsignSigners')}</Label>
            <div className="space-y-2">
              {newSigners.map((signer, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={signer}
                    onChange={(e) =>
                      setNewSigners((prev) => prev.map((s, j) => (j === i ? e.target.value : s)))
                    }
                    placeholder={t('pdfEsignSignerName')}
                    className="h-11"
                    aria-label={`${t('pdfEsignSigners')} ${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    disabled={newSigners.length <= 1}
                    aria-label={t('delete')}
                    onClick={() => setNewSigners((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="h-10 gap-2"
              onClick={() => setNewSigners((prev) => [...prev, ''])}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('pdfEsignAddSigner')}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t('pdfEsignNote')}</Label>
            <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} />
          </div>

          <Button className="h-11 w-full gap-2" onClick={saveRequest}>
            <Check className="h-4 w-4" aria-hidden />
            {t('pdfEsignSave')}
          </Button>

          <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('pdfEsignPrivacy')}
          </p>
        </CardContent>
      </Card>

      {/* Request list */}
      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <PenTool className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('pdfEsignEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const done = req.signers.filter((s) => s.status === 'signed').length
            return (
              <Card key={req.id} className="border-border/70">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{req.fileName}</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString()} ·{' '}
                        {tf('pdfEsignProgress', { done, total: req.signers.length })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={STATUS_BADGE[req.status]}>
                        {req.status === 'draft'
                          ? t('pdfEsignStatusDraft')
                          : req.status === 'in-progress'
                            ? t('pdfEsignStatusInProgress')
                            : t('pdfEsignStatusCompleted')}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('delete')}
                        onClick={() => deleteRequest(req.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {req.note && <p className="text-xs text-muted-foreground">{req.note}</p>}
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {req.signers.map((signer, i) => {
                    const isSigningThis =
                      signing?.reqId === req.id && signing?.signer === i
                    return (
                      <div key={i} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm">{signer.name}</span>
                          {signer.status === 'signed' ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-emerald-500/40 text-[11px] font-normal text-emerald-600 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden />
                              {t('pdfEsignSigned')}
                            </Badge>
                          ) : (
                            <>
                              <Badge
                                variant="outline"
                                className="text-[11px] font-normal text-muted-foreground"
                              >
                                {t('pdfEsignPending')}
                              </Badge>
                              <Button
                                size="sm"
                                className="h-9 gap-1.5"
                                onClick={() => openSigning(req.id, i)}
                              >
                                <PenTool className="h-3.5 w-3.5" aria-hidden />
                                {t('pdfEsignSignNow')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9"
                                onClick={() => markSigned(req.id, i)}
                              >
                                {t('pdfEsignMarkSigned')}
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Inline signing panel for this signer */}
                        {isSigningThis && (
                          <div className="space-y-3 rounded-xl border bg-card p-3">
                            <p className="text-sm font-medium">{signingSigner?.name}</p>

                            {!signFile ? (
                              <Button
                                variant="outline"
                                className="h-11 w-full"
                                onClick={() => void openFilesWithInput('application/pdf', false).then((picked) => {
                                  if (picked[0]) setSignFile(picked[0])
                                })}
                              >
                                {t('pdfEsignSignerFile')}
                              </Button>
                            ) : (
                              <>
                                <div className="relative mx-auto w-fit max-w-full">
                                  <canvas
                                    ref={signCanvasRef}
                                    onClick={onPreviewClick}
                                    className="block h-auto max-h-[60dvh] w-auto max-w-full cursor-crosshair rounded-lg border bg-white shadow-sm"
                                    aria-label={t('preview')}
                                  />
                                  {placement && (
                                    <div
                                      className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/30"
                                      style={{
                                        left: `${placement.x * 100}%`,
                                        top: `${placement.y * 100}%`,
                                      }}
                                      aria-hidden
                                    />
                                  )}
                                  {previewBusy && (
                                    <div
                                      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60"
                                      role="status"
                                    >
                                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                                    </div>
                                  )}
                                </div>

                                {/* Page navigation */}
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10"
                                    disabled={signPageIndex <= 0 || previewBusy}
                                    onClick={() => setSignPageIndex((p) => Math.max(0, p - 1))}
                                    aria-label={t('pdfPrev')}
                                  >
                                    <ChevronLeft className="h-4 w-4" aria-hidden />
                                  </Button>
                                  <span className="min-w-20 text-center text-sm tabular-nums">
                                    {tf('pdfPage', {
                                      page: signPageIndex + 1,
                                      total: signPageCount,
                                    })}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10"
                                    disabled={signPageIndex >= signPageCount - 1 || previewBusy}
                                    onClick={() =>
                                      setSignPageIndex((p) => Math.min(signPageCount - 1, p + 1))
                                    }
                                    aria-label={t('pdfNext')}
                                  >
                                    <ChevronRight className="h-4 w-4" aria-hidden />
                                  </Button>
                                </div>

                                <p className="text-center text-xs text-muted-foreground">
                                  {t('pdfSignPlaceHint')}
                                </p>
                              </>
                            )}

                            {/* Signature pad */}
                            {signFile && (
                              <div className="space-y-2.5">
                                {sigBlob && (
                                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
                                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                    <span className="text-xs text-muted-foreground">
                                      {t('pdfSignUse')}
                                    </span>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    className="h-10 flex-1 gap-2"
                                    onClick={() => setShowPad((v) => !v)}
                                  >
                                    <PenTool className="h-4 w-4" aria-hidden />
                                    {showPad ? t('close') : t('pdfSignDraw')}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-10 flex-1 gap-2"
                                    onClick={() => void applySignature()}
                                    disabled={!hasInk}
                                  >
                                    <Check className="h-4 w-4" aria-hidden />
                                    {t('pdfSignUse')}
                                  </Button>
                                </div>
                                {showPad && (
                                  <div className="space-y-2">
                                    <div className="rounded-xl border bg-white p-1">
                                      <canvas
                                        ref={padCanvasRef}
                                        width={PAD_W}
                                        height={PAD_H}
                                        className="block h-32 w-full cursor-crosshair rounded-lg"
                                        style={{ touchAction: 'none' }}
                                        onPointerDown={startDraw}
                                        onPointerMove={moveDraw}
                                        onPointerUp={endDraw}
                                        onPointerLeave={endDraw}
                                        onPointerCancel={endDraw}
                                        aria-label={t('pdfSignDraw')}
                                      />
                                    </div>
                                    <Button
                                      variant="outline"
                                      className="h-10 w-full gap-2"
                                      onClick={clearPad}
                                    >
                                      <Eraser className="h-4 w-4" aria-hidden />
                                      {t('pdfSignClear')}
                                    </Button>
                                  </div>
                                )}

                                <Label className="text-sm">
                                  {`${t('pdfSignWidth')}: ${Math.round(widthNorm * 100)}%`}
                                </Label>
                                <Slider
                                  value={[Math.round(widthNorm * 100)]}
                                  min={10}
                                  max={40}
                                  step={1}
                                  onValueChange={(v) => setWidthNorm((v[0] ?? 20) / 100)}
                                  aria-label={t('pdfSignWidth')}
                                />

                                <Button
                                  className="h-12 w-full gap-2 text-base"
                                  disabled={signingBusy || !sigBlob || !placement}
                                  onClick={() => void signAndDownload()}
                                >
                                  <PenTool className="h-5 w-5" aria-hidden />
                                  {t('pdfEsignSignNow')}
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="h-9 w-full"
                                  onClick={closeSigning}
                                >
                                  {t('close')}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </ToolShell>
  )
}
