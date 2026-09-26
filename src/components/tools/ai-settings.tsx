'use client'

/**
 * AI settings dialog (Task 3) — Bring-Your-Own-Key management.
 *
 * The user pastes their personal Google Gemini API key. It is stored in
 * localStorage on THIS device only and every AI request goes directly from
 * the browser to Google — OmniFile has no backend in the loop, so the
 * developer incurs zero cost and never sees user data.
 */

import { useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useAiStore } from '@/lib/ai-store'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VISION_MODEL,
  geminiTestKey,
  getGeminiKey,
  getGeminiModels,
  setGeminiKey,
  setGeminiModels,
} from '@/lib/gemini'
import { useI18n } from '@/lib/i18n'
import { toast } from 'sonner'

type TestState = 'idle' | 'testing' | 'valid' | 'invalid'

export function AiSettingsDialog() {
  const open = useAiStore((s) => s.dialogOpen)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && useAiStore.getState().closeDialog()}>
      {open && <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md"><AiKeyForm /></DialogContent>}
    </Dialog>
  )
}

/**
 * Inner form — mounted only while the dialog is open, so its state
 * initializers read the stored key fresh on every open (no effects needed).
 */
function AiKeyForm() {
  const { t } = useI18n()
  const closeDialog = useAiStore((s) => s.closeDialog)

  const [key, setKey] = useState(() => getGeminiKey() ?? '')
  const [hasKey, setHasKey] = useState(() => !!getGeminiKey())
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<TestState>(() => (getGeminiKey() ? 'valid' : 'idle'))
  const [visionModel, setVisionModel] = useState(() => {
    const m = getGeminiModels()
    return m.vision === DEFAULT_VISION_MODEL ? '' : m.vision
  })
  const [imageModel, setImageModel] = useState(() => {
    const m = getGeminiModels()
    return m.image === DEFAULT_IMAGE_MODEL ? '' : m.image
  })

  const save = () => {
    const trimmed = key.trim()
    setGeminiKey(trimmed || null)
    setHasKey(!!trimmed)
    setTest(trimmed ? 'idle' : 'idle')
    toast.success(trimmed ? t('aiKeyAdded') : t('aiKeyRemoved'))
    if (trimmed) closeDialog()
  }

  const remove = () => {
    setGeminiKey(null)
    setKey('')
    setHasKey(false)
    setTest('idle')
    toast.success(t('aiKeyRemoved'))
  }

  const testKey = async () => {
    const trimmed = key.trim()
    if (!trimmed) return
    setTest('testing')
    try {
      await geminiTestKey(trimmed)
      setTest('valid')
    } catch {
      setTest('invalid')
    }
  }

  const saveModels = () => {
    setGeminiModels({
      vision: visionModel.trim() || DEFAULT_VISION_MODEL,
      image: imageModel.trim() || DEFAULT_IMAGE_MODEL,
    })
  }

  return (
    <>
      <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" aria-hidden />
            {t('aiSettingsTitle')}
          </DialogTitle>
          <DialogDescription className="pt-1 text-left">
            {t('aiSettingsDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Privacy reassurance */}
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{t('localFirstNote')}</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gemini-key" className="flex items-center gap-2">
              {t('aiKeyLabel')}
              {hasKey && test === 'valid' && (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  {t('aiKeyValid')}
                </Badge>
              )}
            </Label>
            {/* Stacks vertically on narrow phones so the input keeps usable width. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  id="gemini-key"
                  type={showKey ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value)
                    setTest('idle')
                  }}
                  placeholder={t('aiKeyPlaceholder')}
                  autoComplete="off"
                  className="pr-9"
                />
                <button
                  type="button"
                  aria-label={showKey ? 'Hide' : 'Show'}
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
              <Button
                variant="outline"
                className="shrink-0 sm:w-24"
                disabled={!key.trim() || test === 'testing'}
                onClick={() => void testKey()}
              >
                {test === 'testing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  t('aiKeyTest')
                )}
              </Button>
            </div>
            {test === 'invalid' && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <XCircle className="h-3.5 w-3.5" aria-hidden />
                {t('aiKeyInvalid')}
              </p>
            )}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t('aiKeyHow')}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>

          {/* Optional model overrides */}
          <details className="rounded-xl border bg-muted/30 px-3 py-2.5">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Advanced — {t('aiModelVision')} / {t('aiModelImage')}
            </summary>
            <div className="mt-3 space-y-3" onChange={saveModels}>
              <div className="space-y-1">
                <Label htmlFor="gemini-vision-model" className="text-xs">
                  {t('aiModelVision')}
                </Label>
                <Input
                  id="gemini-vision-model"
                  value={visionModel}
                  onChange={(e) => setVisionModel(e.target.value)}
                  onBlur={saveModels}
                  placeholder={DEFAULT_VISION_MODEL}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gemini-image-model" className="text-xs">
                  {t('aiModelImage')}
                </Label>
                <Input
                  id="gemini-image-model"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  onBlur={saveModels}
                  placeholder={DEFAULT_IMAGE_MODEL}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">{t('aiModelHint')}</p>
              </div>
            </div>
          </details>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={save} disabled={!key.trim()}>
              {t('aiKeySave')}
            </Button>
            {hasKey && (
              <Button variant="outline" className="gap-1.5 sm:w-40" onClick={remove}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('aiKeyRemove')}
              </Button>
            )}
          </div>
        </div>
    </>
  )
}
