/**
 * Batch runner + ZIP export for the advanced tools suite (Task 3).
 *
 * Tools receive a list of `File`s and process them one at a time so the UI
 * can show per-file progress without saturating memory. Results can be
 * downloaded individually or bundled into a single .zip archive.
 */

import { zipSync, type Zippable } from 'fflate'

import { downloadBlob } from '@/lib/fsa'

import type { BatchFailure, BatchOutcome, BatchProgress, ToolResultFile } from './types'

/**
 * Run `process` over every file sequentially.
 *
 * A thrown error for one file is captured into `outcome.failed` — the batch
 * keeps going. `onProgress` is called before each file starts and once more
 * when everything is done.
 */
export async function runToolBatch(
  files: File[],
  process: (file: File, index: number) => Promise<ToolResultFile[]>,
  onProgress?: (p: BatchProgress) => void
): Promise<BatchOutcome> {
  const results: ToolResultFile[] = []
  const failed: BatchFailure[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.({ done: i, total: files.length, current: file.name })
    try {
      const out = await process(file, i)
      results.push(...out)
    } catch (err) {
      failed.push({
        name: file.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    // Let the UI paint between files (spinners, progress, toasts).
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  onProgress?.({ done: files.length, total: files.length, current: null })
  return { results, failed }
}

/** "photo.old.jpg" → "photo.old" */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** "photo.jpg" + "png" → "photo.png" */
export function replaceExt(name: string, ext: string): string {
  return `${baseName(name)}.${ext.replace(/^\./, '')}`
}

/** "photo.jpg" + "-compressed" + "webp" → "photo-compressed.webp" */
export function resultName(source: string, suffix: string, ext: string): string {
  return `${baseName(source)}${suffix}.${ext.replace(/^\./, '')}`
}

const ZIP_STORE_THRESHOLD = 25 * 1024 * 1024 // store-mode above 25 MB total

/**
 * Bundle every result into one .zip and start a download.
 * Media payloads (JPEG/MP4/…) barely compress, so large batches use
 * store mode (level 0) which is dramatically faster.
 */
export async function downloadAllAsZip(
  results: ToolResultFile[],
  zipName: string
): Promise<void> {
  if (results.length === 0) return

  const total = results.reduce((sum, r) => sum + r.blob.size, 0)
  const level = total > ZIP_STORE_THRESHOLD ? 0 : 6

  const entries: Zippable = {}
  const seen = new Map<string, number>()
  for (const r of results) {
    let name = r.name
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count > 0) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      name = `${stem} (${count + 1})${ext}`
    }
    entries[name] = new Uint8Array(await r.blob.arrayBuffer())
  }

  const zipped = zipSync(entries, { level })
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), zipName)
}
