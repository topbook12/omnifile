'use client'

/**
 * Protect / unlock PDF — AES-256 encryption via @cantoo/pdf-lib.
 * Protect: user password (+ confirm); owner password defaults to it.
 * Unlock: load with the current password, save without security.
 * Everything happens on-device; the file is never uploaded.
 */

import { useState } from 'react'
import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { errMessage, pdfResultName, protectPdf, unlockPdf } from '@/lib/tools/pdf-tools-advanced'
import type { BatchFailure, ToolResultFile } from '@/lib/tools/types'
import { useI18n } from '@/lib/i18n'

type ProtectMode = 'protect' | 'unlock'
type ProtectAlgorithm = 'AES-256' | 'AES-128'
type ProtectPerms = {
  printing: boolean
  copying: boolean
  modifying: boolean
  annotating: boolean
  fillForms: boolean
}

const DEFAULT_PERMS: ProtectPerms = {
  printing: true,
  copying: true,
  modifying: true,
  annotating: true,
  fillForms: true,
}

export default function PdfProtectTool() {
  const { t } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<ProtectMode>('protect')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [algorithm, setAlgorithm] = useState<ProtectAlgorithm>('AES-256')
  const [perms, setPerms] = useState<ProtectPerms>(DEFAULT_PERMS)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ToolResultFile[]>([])
  const [failed, setFailed] = useState<BatchFailure[]>([])

  const file = files[0] ?? null

  const addFiles = (incoming: File[]) => {
    setResults([])
    setFailed([])
    setFiles(incoming.slice(0, 1))
  }
  const removeFile = () => {
    setFiles([])
    setResults([])
    setFailed([])
  }

  const run = async () => {
    if (!file || busy) return
    const pw = password.trim()
    if (mode === 'protect' && pw.length < 4) {
      toast.error(t('pdfErrShortPassword'))
      return
    }
    if (mode === 'protect' && pw !== confirm.trim()) {
      toast.error(t('pdfProtectMismatch'))
      return
    }
    if (mode === 'unlock' && pw.length === 0) {
      toast.error(t('pdfErrWrongPassword'))
      return
    }

    setBusy(true)
    setResults([])
    setFailed([])
    try {
      if (mode === 'protect') {
        const blob = await protectPdf(file, {
          userPassword: pw,
          ownerPassword: pw,
          algorithm,
          permissions: perms,
        })
        setResults([{ name: pdfResultName.protected(file.name), blob }])
        toast.success(t('pdfProtectDone'))
      } else {
        const blob = await unlockPdf(file, pw)
        setResults([{ name: pdfResultName.unlocked(file.name), blob }])
        toast.success(t('pdfUnlockDone'))
      }
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell icon={<Lock />} title={t('toolPdfProtect')} desc={t('toolPdfProtectDesc')}>
      <div className="flex flex-wrap gap-2">
        <OnDeviceBadge />
      </div>

      <ToolDropzone
        accept="application/pdf"
        multiple={false}
        files={file ? [file] : []}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={busy}
      />

      <ToolOptionsCard title={t('pdfProtectMode')}>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as ProtectMode)}
          className="gap-3"
        >
          {(
            [
              ['protect', 'pdfProtectAdd', <Lock key="i-p" className="h-4 w-4" aria-hidden />],
              ['unlock', 'pdfProtectRemove', <LockOpen key="i-u" className="h-4 w-4" aria-hidden />],
            ] as Array<[ProtectMode, string, React.ReactNode]>
          ).map(([value, key, icon]) => (
            <Label
              key={value}
              htmlFor={`pdf-protect-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={`pdf-protect-${value}`} value={value} />
              <span className="flex items-center gap-2">
                {icon}
                {t(key)}
              </span>
            </Label>
          ))}
        </RadioGroup>

        {mode === 'protect' ? (
          <>
            <ToolField label={t('pdfProtectPassword')}>
              <Input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="h-11"
              />
            </ToolField>
            <ToolField label={t('pdfProtectConfirm')}>
              <Input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="h-11"
              />
            </ToolField>

            {/* Encryption strength (Task 2-e) */}
            <ToolField label={t('pdfProtectAlgo')}>
              <RadioGroup
                value={algorithm}
                onValueChange={(v) => setAlgorithm(v as ProtectAlgorithm)}
                className="flex flex-col gap-2 sm:flex-row"
              >
                {(
                  [
                    ['AES-256', 'pdfProtectAes256'],
                    ['AES-128', 'pdfProtectAes128'],
                  ] as Array<[ProtectAlgorithm, string]>
                ).map(([value, key]) => (
                  <Label
                    key={value}
                    htmlFor={`pdf-protect-algo-${value}`}
                    className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem id={`pdf-protect-algo-${value}`} value={value} />
                    {t(key)}
                  </Label>
                ))}
              </RadioGroup>
            </ToolField>

            {/* Reader permissions granted by the owner password (Task 2-e) */}
            <div className="space-y-1.5">
              <Label className="text-sm">{t('pdfProtectPerms')}</Label>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                {(
                  [
                    ['printing', 'pdfPermPrinting'],
                    ['copying', 'pdfPermCopying'],
                    ['modifying', 'pdfPermModifying'],
                    ['annotating', 'pdfPermAnnotating'],
                    ['fillForms', 'pdfPermFillForms'],
                  ] as Array<[keyof ProtectPerms, string]>
                ).map(([permKey, labelKey]) => (
                  <Label
                    key={permKey}
                    htmlFor={`pdf-protect-perm-${permKey}`}
                    className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-normal"
                  >
                    <Checkbox
                      id={`pdf-protect-perm-${permKey}`}
                      checked={perms[permKey]}
                      onCheckedChange={(v) =>
                        setPerms((prev) => ({ ...prev, [permKey]: v === true }))
                      }
                    />
                    {t(labelKey)}
                  </Label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <ToolField label={t('pdfProtectPassword')} hint={t('pdfProtectUnlockHint')}>
            <Input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-11"
            />
          </ToolField>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 self-start text-muted-foreground"
          onClick={() => setShowPw((v) => !v)}
          aria-label={t('pdfProtectPassword')}
        >
          {showPw ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </Button>

        <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('pdfProtectNote')}
        </p>

        <ToolRunButton onClick={() => void run()} busy={busy} disabled={!file}>
          {t('toolRun')}
        </ToolRunButton>
      </ToolOptionsCard>

      <ToolResults
        results={results}
        failed={failed}
        onClear={() => {
          setResults([])
          setFailed([])
        }}
      />
    </ToolShell>
  )
}
