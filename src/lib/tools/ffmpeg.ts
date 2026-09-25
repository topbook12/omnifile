/**
 * ffmpeg.wasm loader/wrapper (Task 4-c) — same-origin ESM approach.
 *
 * HISTORY LESSON (why this is not the "obvious" CDN/blob setup):
 *  - The UMD build hardcodes its publicPath to unpkg and always spawns
 *    `{ type: 'module' }` workers; its fallback path then goes through a
 *    webpack stub that throws "Cannot find module" for external core URLs.
 *  - Blob URLs for classWorkerURL are unreliable across browsers.
 * The proven working chain (verified in-browser, WAV→MP3 OK):
 *   1. <script type="module"> import('/ffmpeg/esm/index.js') → window handle
 *   2. new FFmpeg() → load({
 *        classWorkerURL: <abs>/ffmpeg/esm/worker.js   (module worker)
 *        coreURL:        <abs>/ffmpeg/core-esm/ffmpeg-core.js (ESM core)
 *        wasmURL:        <abs>/ffmpeg/core-esm/ffmpeg-core.wasm
 *      })
 *      Inside the module worker, `import(coreURL)` is native → works.
 * All assets ship from OUR origin (public/ffmpeg/), so no CDN is needed
 * and the service worker can cache them for offline use.
 */

const ESM_INDEX = '/ffmpeg/esm/index.js'
const ESM_WORKER = '/ffmpeg/esm/worker.js'
const CORE_JS = '/ffmpeg/core-esm/ffmpeg-core.js'
const CORE_WASM = '/ffmpeg/core-esm/ffmpeg-core.wasm'

import { mimeForExt } from './media-tools-advanced'

/** Hard cap for inputs — wasm runs in-memory, bigger files blow the 2 GB heap. */
export const MAX_MEDIA_BYTES = 250 * 1024 * 1024

/* ------------------------------ minimal type ------------------------------ */

export interface FFmpegLogEvent {
  message: string
}

export interface FFmpegProgressEvent {
  /** 0..1 ratio for the running exec job. */
  progress: number
}

/** Structural type of the FFmpeg instance we actually use. */
export interface FFmpegLike {
  load(config: {
    classWorkerURL: string
    coreURL: string
    wasmURL: string
  }): Promise<boolean>
  writeFile(path: string, data: Uint8Array): Promise<boolean>
  readFile(path: string): Promise<Uint8Array | string>
  deleteFile(path: string): Promise<boolean>
  /** Resolves with the process exit code (0 = success). */
  exec(args: string[], timeout?: number): Promise<number>
  on(event: 'log', callback: (event: FFmpegLogEvent) => void): void
  on(event: 'progress', callback: (event: FFmpegProgressEvent) => void): void
  terminate(): void
}

interface FFmpegCtor {
  new (): FFmpegLike
}

/* ------------------------------ script loader ------------------------------ */

let windowFFmpeg: FFmpegCtor | null = null
let windowFFmpegPromise: Promise<FFmpegCtor> | null = null

/**
 * Import the ESM bundle once via a module script and expose it on window.
 * (A plain dynamic `import()` from app code would be rewritten by the
 * bundler; a runtime-injected module script performs a true native import.)
 */
function loadESMBundle(): Promise<FFmpegCtor> {
  if (windowFFmpeg) return Promise.resolve(windowFFmpeg)
  if (windowFFmpegPromise) return windowFFmpegPromise

  windowFFmpegPromise = new Promise<FFmpegCtor>((resolve, reject) => {
    const handler = () => {
      const mod = (window as unknown as { __omnifileFFmpeg?: { FFmpeg: FFmpegCtor } })
        .__omnifileFFmpeg
      if (mod?.FFmpeg) {
        windowFFmpeg = mod.FFmpeg
        resolve(mod.FFmpeg)
      } else {
        windowFFmpegPromise = null
        reject(new Error('FFmpeg ESM bundle loaded but class is missing'))
      }
    }
    const script = document.createElement('script')
    script.type = 'module'
    script.textContent = `import * as m from '${ESM_INDEX}'; window.__omnifileFFmpeg = m;`
    script.onerror = () => {
      windowFFmpegPromise = null
      reject(new Error('Failed to load ffmpeg ESM bundle'))
    }
    // Module scripts execute asynchronously — poll for the export.
    const poll = setInterval(() => {
      if ((window as unknown as { __omnifileFFmpeg?: unknown }).__omnifileFFmpeg) {
        clearInterval(poll)
        handler()
      }
    }, 60)
    setTimeout(() => {
      clearInterval(poll)
      if (!windowFFmpeg) {
        windowFFmpegPromise = null
        reject(new Error('Timed out loading the ffmpeg engine bundle'))
      }
    }, 15_000)
    document.head.appendChild(script)
  })

  return windowFFmpegPromise
}

/* --------------------------- singleton + handlers --------------------------- */

// Module-level mutable handlers: the instance's event listeners are wired
// once at creation and simply invoke whatever is currently stored, so
// callers can pass fresh handlers on every call without re-subscribing.
let logHandler: ((msg: string) => void) | null = null
let progressHandler: ((ratio: number) => void) | null = null

let loadPromise: Promise<FFmpegLike> | null = null

/**
 * Ring buffer of recent ffmpeg log lines — used to build useful error
 * messages when an exec fails.
 */
const logRing: string[] = []
const LOG_RING_MAX = 200

function pushLog(msg: string): void {
  logRing.push(msg)
  if (logRing.length > LOG_RING_MAX) logRing.splice(0, logRing.length - LOG_RING_MAX)
}

/** Last `n` ffmpeg log lines joined with newlines (for error reporting). */
export function lastFFmpegLogs(n = 20): string {
  return logRing.slice(-n).join('\n')
}

/** Build an Error whose message carries the last ~20 ffmpeg log lines. */
export function ffmpegError(base: string): Error {
  const logs = lastFFmpegLogs(20)
  return new Error(logs ? `${base}\n${logs}` : base)
}

export function isWasmSupported(): boolean {
  return typeof WebAssembly !== 'undefined'
}

/**
 * Get (or create) the shared ffmpeg instance. Safe to call repeatedly —
 * handlers passed in `opts` replace the previous ones on every call.
 * First call compiles the ~31 MB wasm core (a few seconds, cached by the
 * browser and service worker afterwards).
 */
export async function getFFmpeg(opts?: {
  onLog?: (msg: string) => void
  onProgress?: (ratio: number) => void
}): Promise<FFmpegLike> {
  if (typeof window === 'undefined') {
    throw new Error('ffmpeg.wasm can only run in the browser')
  }
  if (!isWasmSupported()) {
    throw new Error('WebAssembly is not supported by this browser')
  }
  if (opts?.onLog) logHandler = opts.onLog
  if (opts?.onProgress) progressHandler = opts.onProgress

  if (!loadPromise) {
    loadPromise = createInstance().catch((err) => {
      // Allow a retry after a failed load.
      loadPromise = null
      throw err
    })
  }
  return loadPromise
}

async function createInstance(): Promise<FFmpegLike> {
  const FFmpegCtor = await loadESMBundle()
  const instance = new FFmpegCtor()
  instance.on('log', (e) => {
    pushLog(e.message)
    logHandler?.(e.message)
  })
  instance.on('progress', (e) => {
    progressHandler?.(e.progress)
  })

  // Absolute same-origin URLs (workers resolve relative URLs against odd
  // bases, so be explicit).
  const base = window.location.origin
  await instance.load({
    classWorkerURL: `${base}${ESM_WORKER}`,
    coreURL: `${base}${CORE_JS}`,
    wasmURL: `${base}${CORE_WASM}`,
  })

  logRing.length = 0
  return instance
}

/* -------------------------------- job runner ------------------------------- */

/** Convert raw bytes to a typed Blob (BlobPart variance-safe across TS libs). */
export function bytesToBlob(bytes: Uint8Array, mime: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: mime })
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
}

async function safeDelete(ffmpeg: FFmpegLike, name: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(name)
  } catch {
    /* file may not exist — ignore */
  }
}

/**
 * Write `file` into the ffmpeg FS, run one exec (args must reference the
 * input via `-i <name>` and end with `outName`), read the output back and
 * clean up. Throws with the last ~20 log lines on failure.
 */
export async function runFFmpeg(file: File, args: string[], outName: string): Promise<Blob> {
  const ffmpeg = await getFFmpeg()

  const iFlag = args.indexOf('-i')
  if (iFlag < 0 || !args[iFlag + 1]) {
    throw new Error('ffmpeg args must reference the input file via -i <name>')
  }
  const inName = args[iFlag + 1]

  try {
    await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()))
    logRing.length = 0

    const code = await ffmpeg.exec(args)
    if (typeof code === 'number' && code !== 0) {
      throw ffmpegError(`ffmpeg exited with code ${code}`)
    }

    const data = await ffmpeg.readFile(outName)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    if (!bytes || bytes.length === 0) {
      throw ffmpegError('ffmpeg produced an empty output file')
    }
    return bytesToBlob(bytes, mimeForExt(extOf(outName)))
  } finally {
    await safeDelete(ffmpeg, inName)
    await safeDelete(ffmpeg, outName)
  }
}

/** Suggested input filename for args builders: "input.<ext>" (ASCII-safe). */
export function suggestedInputName(fileName: string): string {
  const ext = extOf(fileName)
  return `input.${/^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin'}`
}
