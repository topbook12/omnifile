'use client'

/**
 * AI Copilot for PDF (Task 2-f) — summarize, translate and chat with the
 * document using the user's own Gemini key (BYOK).
 *
 * The text layer is extracted on-device with pdf.js; only plain text is
 * sent to Google through `geminiChat`. Without a key the panel shows the
 * shared AiKeyNotice (dialog rendered once by the Tools Hub).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignLeft,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AiKeyNotice,
  GeminiBadge,
  ToolDropzone,
  ToolField,
  ToolOptionsCard,
  ToolProgressBar,
  ToolRunButton,
  ToolShell,
} from '@/components/tools/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getGeminiKey, type GeminiChatTurn } from '@/lib/gemini'
import { useI18n } from '@/lib/i18n'
import {
  askDoc,
  buildDocContext,
  summarizeDoc,
  translateDoc,
  type SummaryLang,
  type SummaryMode,
  type TranslateTarget,
} from '@/lib/tools/pdf-copilot'
import {
  errMessage,
  pdfExtractText,
  ToolError,
  totalTextLength,
} from '@/lib/tools/pdf-tools-advanced'

type Tab = 'summarize' | 'translate' | 'chat'

/** Chat history sent to the API is capped at the last 12 turns. */
const CHAT_HISTORY_LIMIT = 12

const SCROLLBAR =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30'

const RADIO_ROW =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'

/** Legacy clipboard fallback for browsers where the async API is blocked. */
function legacyCopy(text: string): void {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export default function PdfCopilotTool() {
  const { t, tf } = useI18n()

  // Document state
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(0)

  // Tab + per-tab state
  const [tab, setTab] = useState<Tab>('summarize')
  const [mode, setMode] = useState<SummaryMode>('brief')
  const [outLang, setOutLang] = useState<SummaryLang>('auto')
  const [summary, setSummary] = useState('')
  const [sumBusy, setSumBusy] = useState(false)
  const [target, setTarget] = useState<TranslateTarget>('bn')
  const [translation, setTranslation] = useState('')
  const [transBusy, setTransBusy] = useState(false)
  const [transProgress, setTransProgress] = useState<{ done: number; total: number } | null>(null)
  const [chat, setChat] = useState<GeminiChatTurn[]>([])
  const [question, setQuestion] = useState('')
  const [chatBusy, setChatBusy] = useState(false)

  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const hasKey = Boolean(getGeminiKey())
  const chars = totalTextLength(pages)
  const ready = pages.length > 0 && !extracting

  const context = useMemo(
    () => (pages.length > 0 ? buildDocContext(pages) : ''),
    [pages]
  )

  // Keep the newest message visible while chatting.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [chat, chatBusy])

  /* ------------------------------ file handling ----------------------------- */

  const resetWork = () => {
    setSummary('')
    setTranslation('')
    setChat([])
    setTransProgress(null)
  }

  const extract = async (f: File) => {
    setExtracting(true)
    setProgress(0)
    try {
      const extracted = await pdfExtractText(f, (done, total) =>
        setProgress(total > 0 ? done / total : 0)
      )
      if (totalTextLength(extracted) < 5) throw new ToolError('pdfErrNoText')
      setPages(extracted)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setExtracting(false)
    }
  }

  const addFiles = (incoming: File[]) => {
    const f = incoming[0] ?? null
    setFile(f)
    setPages([])
    resetWork()
    if (f) void extract(f)
  }

  const removeFile = () => {
    setFile(null)
    setPages([])
    resetWork()
  }

  /* ------------------------------ AI actions ------------------------------- */

  const runSummary = async () => {
    if (!context || sumBusy) return
    setSumBusy(true)
    setSummary('')
    try {
      setSummary(await summarizeDoc(context, mode, outLang))
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setSumBusy(false)
    }
  }

  const runTranslate = async () => {
    if (pages.length === 0 || transBusy) return
    setTransBusy(true)
    setTranslation('')
    setTransProgress(null)
    try {
      const result = await translateDoc(pages, target, (done, total) =>
        setTransProgress({ done, total })
      )
      setTranslation(result)
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setTransBusy(false)
      setTransProgress(null)
    }
  }

  const sendChat = async () => {
    const q = question.trim()
    if (!q || chatBusy || !context) return
    setQuestion('')
    const history = chat.slice(-CHAT_HISTORY_LIMIT)
    setChat((prev) => [...prev, { role: 'user', text: q }])
    setChatBusy(true)
    try {
      const answer = await askDoc(context, history, q)
      setChat((prev) => [...prev, { role: 'model', text: answer }])
    } catch (err) {
      toast.error(errMessage(err, t))
    } finally {
      setChatBusy(false)
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('textCopied'))
    } catch {
      try {
        legacyCopy(text)
        toast.success(t('textCopied'))
      } catch {
        toast.error(t('errGeneric'))
      }
    }
  }

  /* ----------------------------------- UI ----------------------------------- */

  return (
    <ToolShell icon={<Sparkles />} title={t('toolPdfCopilot')} desc={t('toolPdfCopilotDesc')}>
      <div className="flex flex-wrap gap-2">
        <GeminiBadge />
      </div>

      <ToolDropzone
        accept="application/pdf"
        multiple={false}
        files={file ? [file] : []}
        onFiles={addFiles}
        onRemove={removeFile}
        disabled={extracting}
      />

      {extracting && (
        <ToolProgressBar value={Math.max(0.03, progress)} label={t('toolProcessing')} />
      )}

      {ready && (
        <div className="flex flex-wrap gap-2" role="status">
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {tf('pdfCopPages', { n: pages.length })}
          </Badge>
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <AlignLeft className="h-3.5 w-3.5" aria-hidden />
            {tf('pdfCopChars', { n: chars.toLocaleString() })}
          </Badge>
          <Badge
            variant="outline"
            className="gap-1.5 border-emerald-500/40 font-normal text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {t('pdfCopReady')}
          </Badge>
        </div>
      )}

      {ready && !hasKey && <AiKeyNotice />}

      {ready && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="gap-4"
        >
          <TabsList className="h-11 w-full">
            <TabsTrigger value="summarize" className="flex-1">
              {t('pdfCopTabSum')}
            </TabsTrigger>
            <TabsTrigger value="translate" className="flex-1">
              {t('pdfCopTabTranslate')}
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex-1">
              {t('pdfCopTabChat')}
            </TabsTrigger>
          </TabsList>

          {/* ── Summarize ── */}
          <TabsContent value="summarize" className="space-y-4">
            <ToolOptionsCard title={t('pdfCopMode')}>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as SummaryMode)}
                className="gap-3"
              >
                {(
                  [
                    ['brief', 'pdfCopModeBrief'],
                    ['detailed', 'pdfCopModeDetailed'],
                    ['bullets', 'pdfCopModeBullets'],
                  ] as Array<[SummaryMode, string]>
                ).map(([value, key]) => (
                  <Label key={value} htmlFor={`pdf-cop-mode-${value}`} className={RADIO_ROW}>
                    <RadioGroupItem id={`pdf-cop-mode-${value}`} value={value} />
                    {t(key)}
                  </Label>
                ))}
              </RadioGroup>

              <ToolField label={t('pdfCopOutLang')}>
                <Select value={outLang} onValueChange={(v) => setOutLang(v as SummaryLang)}>
                  <SelectTrigger className="h-11 w-full" aria-label={t('pdfCopOutLang')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('pdfCopLangAuto')}</SelectItem>
                    <SelectItem value="bn">{t('pdfCopLangBn')}</SelectItem>
                    <SelectItem value="en">{t('pdfCopLangEn')}</SelectItem>
                  </SelectContent>
                </Select>
              </ToolField>

              <ToolRunButton
                onClick={() => void runSummary()}
                busy={sumBusy}
                disabled={!hasKey}
              >
                {t('pdfCopRunSummary')}
              </ToolRunButton>
            </ToolOptionsCard>

            {summary && (
              <ToolOptionsCard title={t('pdfCopResult')}>
                <div
                  className={`max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-3.5 text-sm leading-relaxed ${SCROLLBAR}`}
                >
                  {summary}
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full gap-2 sm:w-auto sm:px-6"
                  onClick={() => void copyText(summary)}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  {t('textCopy')}
                </Button>
              </ToolOptionsCard>
            )}
          </TabsContent>

          {/* ── Translate ── */}
          <TabsContent value="translate" className="space-y-4">
            <ToolOptionsCard title={t('pdfCopTarget')}>
              <ToolField label={t('pdfCopTarget')}>
                <Select value={target} onValueChange={(v) => setTarget(v as TranslateTarget)}>
                  <SelectTrigger className="h-11 w-full" aria-label={t('pdfCopTarget')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bn">{t('pdfCopTargetBn')}</SelectItem>
                    <SelectItem value="en">{t('pdfCopTargetEn')}</SelectItem>
                    <SelectItem value="ar">{t('pdfCopTargetAr')}</SelectItem>
                    <SelectItem value="hi">{t('pdfCopTargetHi')}</SelectItem>
                    <SelectItem value="es">{t('pdfCopTargetEs')}</SelectItem>
                    <SelectItem value="fr">{t('pdfCopTargetFr')}</SelectItem>
                  </SelectContent>
                </Select>
              </ToolField>

              <ToolRunButton
                onClick={() => void runTranslate()}
                busy={transBusy}
                disabled={!hasKey}
              >
                {t('pdfCopRunTranslate')}
              </ToolRunButton>

              {transBusy && (
                <ToolProgressBar
                  value={transProgress ? transProgress.done / Math.max(1, transProgress.total) : 0.05}
                  label={
                    transProgress
                      ? tf('pdfCopTranslateChunk', {
                          done: transProgress.done,
                          total: transProgress.total,
                        })
                      : t('pdfCopTranslating')
                  }
                />
              )}
            </ToolOptionsCard>

            {translation && (
              <ToolOptionsCard title={t('pdfCopResult')}>
                <div
                  className={`max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-3.5 text-sm leading-relaxed ${SCROLLBAR}`}
                >
                  {translation}
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full gap-2 sm:w-auto sm:px-6"
                  onClick={() => void copyText(translation)}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  {t('textCopy')}
                </Button>
              </ToolOptionsCard>
            )}
          </TabsContent>

          {/* ── Chat ── */}
          <TabsContent value="chat" className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t('pdfCopChatEmpty')}</p>
              {chat.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 text-muted-foreground"
                  onClick={() => setChat([])}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t('pdfCopChatClear')}
                </Button>
              )}
            </div>

            <div
              role="log"
              aria-live="polite"
              aria-label={t('pdfCopTabChat')}
              className={`max-h-96 min-h-44 space-y-3 overflow-y-auto rounded-xl border bg-muted/20 p-3.5 ${SCROLLBAR}`}
            >
              {chat.length === 0 && !chatBusy && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t('pdfCopChatEmpty')}
                </p>
              )}
              {chat.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-bl-sm border bg-card'
                    }`}
                  >
                    <span className="sr-only">
                      {msg.role === 'user' ? t('pdfCopChatYou') : t('pdfCopChatAi')}:{' '}
                    </span>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatBusy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t('pdfCopChatThinking')}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} aria-hidden />
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void sendChat()
              }}
            >
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t('pdfCopChatPlaceholder')}
                aria-label={t('pdfCopChatPlaceholder')}
                autoComplete="off"
                disabled={!hasKey || chatBusy}
                className="h-11 min-w-0 flex-1"
              />
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label={t('pdfCopChatSend')}
                disabled={!hasKey || chatBusy || question.trim().length === 0}
              >
                {chatBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      )}
    </ToolShell>
  )
}
