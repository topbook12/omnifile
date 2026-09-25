'use client'

/**
 * Digital certificate seal — generate a self-signed X.509 certificate
 * on-device (node-forge, RSA-2048), SHA-256-hash the original PDF, sign the
 * hash (RSA-SHA256) and draw a small visible seal onto the chosen page.
 * The `.omnisig.json` side-car carries the signature + certificate so the
 * document's integrity can be re-verified later — also fully offline.
 *
 * The signature covers the hash of the ORIGINAL file; the sealed copy
 * visually shows the seal block (its own bytes differ from the signed
 * original). Verification compares the recorded hash against the current
 * file bytes to detect any later modification.
 */

import { useState } from 'react'
import {
  BadgeCheck,
  FileSignature,
  Fingerprint,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/lib/i18n'
import {
  generateCertificate,
  sealPdf,
  verifySeal,
  type GeneratedCertificate,
  type SealVerifyResult,
} from '@/lib/tools/pdf-certify'
import { baseName, errMessage, resultName } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'

type CertifyMode = 'seal' | 'verify'

export default function PdfCertifyTool() {
  const { t } = useI18n()
  const [mode, setMode] = useState<CertifyMode>('seal')

  /* --------------------------------- seal ---------------------------------- */

  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [commonName, setCommonName] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [daysValid, setDaysValid] = useState('365')
  const [pageInput, setPageInput] = useState('')
  const [includeFiles, setIncludeFiles] = useState(false)
  const [cert, setCert] = useState<GeneratedCertificate | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const pdfFile = pdfFiles[0] ?? null

  const addPdf = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setPdfFiles(incoming.slice(0, 1))
  }
  const removePdf = () => {
    setPdfFiles([])
    setResults([])
    setFailed([])
  }

  const runSeal = async () => {
    if (!pdfFile || busy) return
    setBusy(true)
    setResults([])
    setFailed([])
    try {
      // Reuse the generated key pair across seals (generating is ~1–3s).
      const activeCert =
        cert ??
        (await generateCertificate({
          commonName,
          email,
          organization,
          daysValid: Number.parseInt(daysValid, 10) || 365,
        }))
      setCert(activeCert)

      // Seal page: empty → last page; a typed number is clamped inside sealPdf.
      const parsedPage = Number.parseInt(pageInput, 10)

      const { sealedPdf, sigJson } = await sealPdf(pdfFile, activeCert, {
        pageIndex: Number.isFinite(parsedPage) ? parsedPage - 1 : undefined,
      })

      const base = baseName(pdfFile.name)
      const files: ToolResultFile[] = [
        { name: resultName(pdfFile.name, '-sealed', 'pdf'), blob: sealedPdf },
        { name: `${base}.omnisig.json`, blob: sigJson },
      ]
      if (includeFiles) {
        files.push(
          { name: `${base}-certificate.pem`, blob: new Blob([activeCert.certPem], { type: 'application/x-pem-file' }) },
          { name: `${base}-private-key.pem`, blob: new Blob([activeCert.keyPem], { type: 'application/x-pem-file' }) }
        )
      }
      setResults(files)
      toast.success(t('pdfCertifySealed'))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  /* -------------------------------- verify --------------------------------- */

  const [verifyPdf, setVerifyPdf] = useState<File[]>([])
  const [sigFile, setSigFile] = useState<File[]>([])
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyResult, setVerifyResult] = useState<SealVerifyResult | null>(null)

  const verifyPdfFile = verifyPdf[0] ?? null
  const sigJsonFile = sigFile[0] ?? null

  const runVerify = async () => {
    if (!verifyPdfFile || !sigJsonFile || verifyBusy) return
    setVerifyBusy(true)
    setVerifyResult(null)
    try {
      setVerifyResult(await verifySeal(verifyPdfFile, sigJsonFile))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setVerifyBusy(false)
    }
  }

  /* ----------------------------------- UI ----------------------------------- */

  return (
    <ToolShell icon={<FileSignature />} title={t('toolPdfCertify')} desc={t('toolPdfCertifyDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolOptionsCard title={t('pdfCertifyMode')}>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as CertifyMode)}
          className="gap-3"
        >
          {(
            [
              ['seal', 'pdfCertifySeal', <FileSignature key="i-s" className="h-4 w-4" aria-hidden />],
              ['verify', 'pdfCertifyVerify', <BadgeCheck key="i-v" className="h-4 w-4" aria-hidden />],
            ] as Array<[CertifyMode, string, React.ReactNode]>
          ).map(([value, key, icon]) => (
            <Label
              key={value}
              htmlFor={`pdf-certify-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-certify-${value}`} value={value} />
              <span className="flex items-center gap-2">
                {icon}
                {t(key)}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </ToolOptionsCard>

      {mode === 'seal' ? (
        <>
          <ToolDropzone
            accept="application/pdf"
            multiple={false}
            files={pdfFile ? [pdfFile] : []}
            onFiles={addPdf}
            onRemove={removePdf}
            disabled={busy}
          />

          {cert && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {t('pdfCertifyCertReady')}
              </span>
              <Badge
                variant="outline"
                className="ml-auto max-w-full gap-1 font-mono text-[10px] font-normal"
              >
                <Fingerprint className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{cert.fingerprint}</span>
              </Badge>
            </div>
          )}

          <ToolOptionsCard>
            <ToolField label={t('pdfCertifyCN')}>
              <Input
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                className="h-11"
                autoComplete="off"
              />
            </ToolField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ToolField label={t('pdfCertifyEmail')}>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                  autoComplete="off"
                />
              </ToolField>
              <ToolField label={t('pdfCertifyOrg')}>
                <Input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="h-11"
                  autoComplete="off"
                />
              </ToolField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ToolField label={t('pdfCertifyDays')}>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={daysValid}
                  onChange={(e) => setDaysValid(e.target.value)}
                  className="h-11"
                />
              </ToolField>
              <ToolField label={t('pdfCertifyPage')} hint={t('pdfCertifyPageLast')}>
                <Input
                  type="number"
                  min={1}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  className="h-11"
                />
              </ToolField>
            </div>

            <Label
              htmlFor="pdf-certify-pem"
              className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-normal"
            >
              <Checkbox
                id="pdf-certify-pem"
                checked={includeFiles}
                onCheckedChange={(v) => setIncludeFiles(v === true)}
              />
              {t('pdfCertifyIncludeFiles')}
            </Label>

            <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('pdfCertifyKeyWarning')}
            </p>

            <ToolRunButton onClick={() => void runSeal()} busy={busy} disabled={!pdfFile}>
              {t('pdfCertifyGenerate')}
            </ToolRunButton>
          </ToolOptionsCard>
        </>
      ) : (
        <>
          <ToolDropzone
            accept="application/pdf"
            multiple={false}
            files={verifyPdfFile ? [verifyPdfFile] : []}
            onFiles={(f) => {
              setVerifyResult(null)
              setVerifyPdf(f.slice(0, 1))
            }}
            onRemove={() => {
              setVerifyPdf([])
              setVerifyResult(null)
            }}
            disabled={verifyBusy}
          />
          <ToolDropzone
            accept="application/json,.json"
            multiple={false}
            files={sigJsonFile ? [sigJsonFile] : []}
            onFiles={(f) => {
              setVerifyResult(null)
              setSigFile(f.slice(0, 1))
            }}
            onRemove={() => {
              setSigFile([])
              setVerifyResult(null)
            }}
            disabled={verifyBusy}
          />

          <ToolRunButton
            onClick={() => void runVerify()}
            busy={verifyBusy}
            disabled={!verifyPdfFile || !sigJsonFile}
          >
            {t('pdfCertifyVerifyBtn')}
          </ToolRunButton>

          <p className="text-center text-xs text-muted-foreground">{t('pdfCertifyVerifyHint')}</p>

          {verifyResult && (
            <div
              className={`space-y-2.5 rounded-xl border p-4 ${
                verifyResult.valid
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-destructive/40 bg-destructive/10'
              }`}
              role="status"
            >
              <p
                className={`flex items-center gap-2 text-sm font-semibold ${
                  verifyResult.valid
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-destructive'
                }`}
              >
                {verifyResult.valid ? (
                  <BadgeCheck className="h-5 w-5" aria-hidden />
                ) : (
                  <XCircle className="h-5 w-5" aria-hidden />
                )}
                {verifyResult.valid ? t('pdfCertifyValid') : t('pdfCertifyInvalid')}
              </p>

              {verifyResult.subject && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('pdfCertifySubject')}: </span>
                  <span className="font-medium">{verifyResult.subject}</span>
                </p>
              )}
              <p className="text-sm">
                <span className="text-muted-foreground">{t('pdfCertifyTime')}: </span>
                <span className="font-medium">
                  {new Date(verifyResult.timestamp).toLocaleString()}
                </span>
              </p>
              {verifyResult.fingerprint && (
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">{t('pdfCertifyFingerprint')}: </span>
                  <code className="break-all rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs">
                    {verifyResult.fingerprint}
                  </code>
                </p>
              )}

              <p
                className={`flex items-start gap-1.5 rounded-lg p-2.5 text-xs ${
                  verifyResult.hashMatches
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                }`}
              >
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {verifyResult.hashMatches ? t('pdfCertifyUnchanged') : t('pdfCertifyChanged')}
              </p>
            </div>
          )}
        </>
      )}

      {mode === 'seal' && (
        <ToolResults
          results={results}
          failed={failed}
          onClear={() => {
            setResults([])
            setFailed([])
          }}
        />
      )}
    </ToolShell>
  )
}
