/**
 * Pure logic for the AI PDF Copilot (Task 2-f) — 100% client-side, BYOK.
 *
 * The panel extracts the text layer with pdf.js (pdfExtractText, READ-ONLY
 * helper in pdf-tools-advanced.ts) and this module shapes the prompts that
 * go to the user's own Gemini key through `geminiChat` (src/lib/gemini.ts).
 * Only text is ever sent to Google — the PDF file itself never leaves the
 * device.
 *
 * ERROR CONTRACT: same as pdf-tools-advanced.ts — expected failures are
 * thrown as ToolError('pdfErr…') and panels surface them via
 * errMessage(err, t), which also maps GeminiError codes onto aiErr* keys.
 */

import { geminiChat, type GeminiChatTurn } from '@/lib/gemini'
import { ToolError } from '@/lib/tools/pdf-tools-advanced'

/** Hard cap on the document context string sent to the model (characters). */
const CONTEXT_CAP = 600_000

/** Max characters of source text per translation request. */
const TRANSLATE_CHUNK_CHARS = 25_000

export type SummaryMode = 'brief' | 'detailed' | 'bullets'
export type SummaryLang = 'auto' | 'bn' | 'en'
export type TranslateTarget = 'bn' | 'en' | 'ar' | 'hi' | 'es' | 'fr'

/* ------------------------------ document context ---------------------------- */

/**
 * Join the extracted per-page texts into one context string with explicit
 * `[[Page n]]` markers so the model can cite page numbers. When the joined
 * text exceeds `maxChars` it is truncated and a notice is appended.
 */
export function buildDocContext(pages: string[], maxChars = CONTEXT_CAP): string {
  const joined = pages
    .map((page, i) => `\n\n[[Page ${i + 1}]]\n${page}`)
    .join('')
    .trim()
  if (joined.length <= maxChars) return joined
  return (
    joined.slice(0, maxChars) +
    `\n\n[[Note: the document was truncated after ${maxChars} characters to fit the model's context window.]]`
  )
}

/* --------------------------------- summarize -------------------------------- */

const SUMMARY_SYSTEM =
  'You are a precise document assistant. Ground every statement in the ' +
  'provided document, never invent facts, and keep numbers, names and dates ' +
  'exactly as written.'

const SUMMARY_MODE_PROMPT: Record<SummaryMode, string> = {
  brief:
    'Summarize this document in 3–5 sentences. Capture the core topic and the most important points.',
  detailed:
    'Summarize this document in detail: main topic, key points of each section, important numbers, names, dates, and any conclusions or action items.',
  bullets:
    'Summarize this document as a concise bulleted list (6–12 bullets, one idea per bullet, each starting with "- ").',
}

const SUMMARY_LANG_PROMPT: Record<SummaryLang, string> = {
  auto: "Answer in the document's own language.",
  bn: 'উত্তর অবশ্যই বাংলায় দিতে হবে।',
  en: 'Answer in English.',
}

/** Ask Gemini for a summary of the document context. */
export async function summarizeDoc(
  context: string,
  mode: SummaryMode,
  outLang: SummaryLang
): Promise<string> {
  return geminiChat({
    systemPrompt: SUMMARY_SYSTEM,
    prompt: `${SUMMARY_MODE_PROMPT[mode]}\n${SUMMARY_LANG_PROMPT[outLang]}\n\n=== DOCUMENT ===${context}`,
  })
}

/* --------------------------------- translate -------------------------------- */

const TRANSLATE_SYSTEM =
  'You are a professional document translator. You translate accurately and ' +
  'completely, preserving the document structure.'

const TARGET_LANGUAGE: Record<TranslateTarget, string> = {
  bn: 'Bengali (বাংলা)',
  en: 'English',
  ar: 'Arabic',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
}

/**
 * Translate the whole document, chunking pages into groups whose joined
 * text stays ≤ 25k characters and translating the chunks sequentially.
 * Every `[[Page n]]` marker must survive into the translation so pages can
 * be told apart in the output.
 */
export async function translateDoc(
  pages: string[],
  target: TranslateTarget,
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  if (totalTextLengthOf(pages) < 5) throw new ToolError('pdfErrNoText')

  // Group page indices into chunks within the character budget. A single
  // oversized page still becomes its own chunk (never dropped).
  const chunks: number[][] = []
  let current: number[] = []
  let size = 0
  for (let i = 0; i < pages.length; i++) {
    const marker = `[[Page ${i + 1}]]\n`
    const page = pages[i] ?? ''
    if (current.length > 0 && size + marker.length + page.length > TRANSLATE_CHUNK_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(i)
    size += marker.length + page.length
  }
  if (current.length > 0) chunks.push(current)

  const out: string[] = []
  for (let c = 0; c < chunks.length; c++) {
    const body = chunks[c]!
      .map((idx) => `[[Page ${idx + 1}]]\n${pages[idx]}`)
      .join('\n\n')
    const translated = await geminiChat({
      systemPrompt: TRANSLATE_SYSTEM,
      prompt:
        `Translate the text below into ${TARGET_LANGUAGE[target]}. Rules:\n` +
        '- Keep every [[Page n]] marker exactly as written, on its own line, in its original position.\n' +
        '- Translate faithfully and completely — never summarize, skip or add content.\n' +
        '- Keep numbers, proper names, code and URLs unchanged.\n' +
        '- Output the translation only, without notes or commentary.\n\n' +
        body,
    })
    out.push(translated.trim())
    onProgress?.(c + 1, chunks.length)
  }
  return out.join('\n\n')
}

/* ----------------------------------- chat ----------------------------------- */

const CHAT_SYSTEM_BASE =
  'You answer questions about the document given below. ' +
  'Answer ONLY from the document — do not add facts from outside knowledge. ' +
  'Cite the page numbers you used, like (p. 3). ' +
  'If the answer is not in the document, say so clearly. ' +
  'Reply in the same language the user writes in.'

/** Ask a question about the document with the prior conversation as history. */
export async function askDoc(
  context: string,
  history: GeminiChatTurn[],
  question: string
): Promise<string> {
  return geminiChat({
    systemPrompt: `${CHAT_SYSTEM_BASE}\n\n=== DOCUMENT ===${context}`,
    history,
    prompt: question,
  })
}

/* --------------------------------- internals -------------------------------- */

function totalTextLengthOf(pages: string[]): number {
  return pages.reduce((sum, p) => sum + p.length, 0)
}
