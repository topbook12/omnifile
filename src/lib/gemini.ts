/**
 * Bring-Your-Own-Key (BYOK) Gemini client for OmniFile AI features.
 *
 * PRIVACY / COST MODEL (deliberate design):
 *  - The API key is entered by the user and stored ONLY in this device's
 *    localStorage. It is never sent anywhere except directly to Google.
 *  - Requests go browser → Google (generativelanguage.googleapis.com).
 *    There is no OmniFile backend in the loop, so the developer pays
 *    nothing and the user's own quota/billing applies.
 *
 * Used by: AI background remover, AI image enhancer, AI OCR.
 */

const KEY_STORAGE = 'omnifile.gemini.key'
const MODEL_STORAGE = 'omnifile.gemini.models'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Default models (overridable in the AI settings dialog). */
export const DEFAULT_VISION_MODEL = 'gemini-2.5-flash'
export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image'

export class GeminiError extends Error {
  /** Machine-readable code used by the UI to show a friendly message. */
  code: 'NO_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NO_IMAGE' | 'NETWORK' | 'API'
  /** Optional raw API detail (English) for power users. */
  detail?: string

  constructor(code: GeminiError['code'], message?: string) {
    super(message ?? code)
    this.name = 'GeminiError'
    this.code = code
    this.detail = message
  }
}

/* ----------------------------- key + model store ---------------------------- */

export function getGeminiKey(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(KEY_STORAGE)?.trim() || null
  } catch {
    return null
  }
}

export function setGeminiKey(key: string | null): void {
  try {
    if (key && key.trim()) window.localStorage.setItem(KEY_STORAGE, key.trim())
    else window.localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* storage unavailable (private mode) — features will just not persist */
  }
}

export interface GeminiModels {
  vision: string
  image: string
}

export function getGeminiModels(): GeminiModels {
  if (typeof window === 'undefined') {
    return { vision: DEFAULT_VISION_MODEL, image: DEFAULT_IMAGE_MODEL }
  }
  try {
    const raw = window.localStorage.getItem(MODEL_STORAGE)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GeminiModels>
      return {
        vision: parsed.vision?.trim() || DEFAULT_VISION_MODEL,
        image: parsed.image?.trim() || DEFAULT_IMAGE_MODEL,
      }
    }
  } catch {
    /* ignore */
  }
  return { vision: DEFAULT_VISION_MODEL, image: DEFAULT_IMAGE_MODEL }
}

export function setGeminiModels(models: GeminiModels): void {
  try {
    window.localStorage.setItem(MODEL_STORAGE, JSON.stringify(models))
  } catch {
    /* ignore */
  }
}

/* --------------------------------- plumbing --------------------------------- */

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function callGemini(model: string, key: string, body: unknown): Promise<Record<string, any>> {
  let res: Response
  try {
    res = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
  } catch {
    throw new GeminiError('NETWORK')
  }

  if (!res.ok) {
    let detail = ''
    try {
      const json = await res.json()
      detail = json?.error?.message ?? ''
    } catch {
      /* ignore */
    }
    if (res.status === 400 && /api[_ ]?key/i.test(detail)) throw new GeminiError('INVALID_KEY', detail)
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new GeminiError('INVALID_KEY', detail)
    }
    if (res.status === 429) throw new GeminiError('RATE_LIMIT', detail)
    throw new GeminiError('API', detail || `HTTP ${res.status}`)
  }

  return res.json()
}

/** Verify a key by listing one model. Throws GeminiError on failure. */
export async function geminiTestKey(key: string): Promise<void> {
  if (!key.trim()) throw new GeminiError('INVALID_KEY')
  let res: Response
  try {
    res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key.trim())}&pageSize=1`)
  } catch {
    throw new GeminiError('NETWORK')
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiError('INVALID_KEY')
    if (res.status === 429) throw new GeminiError('RATE_LIMIT')
    throw new GeminiError('API', `HTTP ${res.status}`)
  }
}

/* ------------------------------- image editing ------------------------------ */

export interface GeminiImageOptions {
  prompt: string
  /** Defaults to the stored key. */
  key?: string
  /** Defaults to the stored image model. */
  model?: string
  mimeType?: string
}

/**
 * Send an image + prompt to the Gemini image-editing model and get the
 * edited image back as a Blob (PNG with transparency when the prompt asks).
 */
export async function geminiEditImage(blob: Blob, opts: GeminiImageOptions): Promise<Blob> {
  const key = opts.key ?? getGeminiKey()
  if (!key) throw new GeminiError('NO_KEY')
  const model = opts.model || getGeminiModels().image

  const body = {
    contents: [
      {
        parts: [
          { text: opts.prompt },
          {
            inlineData: {
              mimeType: opts.mimeType || blob.type || 'image/png',
              data: await blobToBase64(blob),
            },
          },
        ],
      },
    ],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }

  const json = await callGemini(model, key, body)
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data
    if (inline?.data) {
      const mime = inline.mimeType ?? inline.mime_type ?? 'image/png'
      const bytes = Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0))
      return new Blob([bytes], { type: mime })
    }
  }
  throw new GeminiError('NO_IMAGE')
}

/* ----------------------------------- OCR ----------------------------------- */

export interface GeminiOcrOptions {
  key?: string
  model?: string
  mimeType?: string
  /** ISO hint like "bn", "en", "bn+en" or "auto". */
  language?: string
}

/**
 * Extract ALL text from an image (or a rendered page) with the Gemini
 * vision model. Far better than classic OCR engines for Bengali.
 */
export async function geminiExtractText(blob: Blob, opts: GeminiOcrOptions = {}): Promise<string> {
  const key = opts.key ?? getGeminiKey()
  if (!key) throw new GeminiError('NO_KEY')
  const model = opts.model || getGeminiModels().vision

  const lang =
    opts.language && opts.language !== 'auto'
      ? ` The text is most likely in ${opts.language.replace('+', ' and ')} — transcribe in the original script.`
      : ''

  const body = {
    contents: [
      {
        parts: [
          {
            text:
              'Transcribe ALL text visible in this image exactly as written. ' +
              'Preserve the reading order and line breaks. Do not add commentary, ' +
              'labels or markdown — output the transcription only.' +
              lang,
          },
          {
            inlineData: {
              mimeType: opts.mimeType || blob.type || 'image/png',
              data: await blobToBase64(blob),
            },
          },
        ],
      },
    ],
  }

  const json = await callGemini(model, key, body)
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('\n')
    .trim()
  if (!text) throw new GeminiError('NO_IMAGE', 'No text detected')
  return text
}

/* --------------------------- image enhancement ----------------------------- */

/**
 * Prompt used by the AI Image Enhancer (upscale / denoise / sharpen while
 * keeping the original content identical).
 */
export const ENHANCE_PROMPT =
  'Enhance this image: increase the resolution, sharpen fine details, remove ' +
  'noise and compression artifacts, and restore natural colours and lighting. ' +
  'Keep the subject, composition, text and identity exactly the same. ' +
  'Output only the enhanced image.'

/* -------------------------------- text chat -------------------------------- */
/* Added by Task 2-f (PDF Copilot): single-shot / multi-turn text chat with    */
/* the user's own Gemini vision/text model. Same BYOK model as above.          */

export interface GeminiChatTurn {
  role: 'user' | 'model'
  text: string
}

export interface GeminiChatOptions {
  prompt: string
  /** Prior conversation turns (oldest first). */
  history?: GeminiChatTurn[]
  /** Optional system instruction shown to the model before the conversation. */
  systemPrompt?: string
  /** Defaults to the stored key. */
  key?: string
  /** Defaults to the stored vision/text model. */
  model?: string
}

/** Single-shot text chat with the user's Gemini vision/text model. */
export async function geminiChat(opts: GeminiChatOptions): Promise<string> {
  const key = opts.key ?? getGeminiKey()
  if (!key) throw new GeminiError('NO_KEY')
  const model = opts.model || getGeminiModels().vision

  const history = (opts.history ?? [])
    .filter((turn) => turn.text.trim())
    .map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }))

  const body: Record<string, unknown> = {
    contents: [...history, { role: 'user', parts: [{ text: opts.prompt }] }],
  }
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] }
  }

  const json = await callGemini(model, key, body)
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('\n')
    .trim()
  if (!text) throw new GeminiError('API', 'Empty response')
  return text
}
