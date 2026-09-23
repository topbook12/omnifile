/**
 * Local-first storage layer — IndexedDB via the `idb` library.
 * Files NEVER leave the device: metadata lives in the `meta` store,
 * raw bytes in the `blobs` store (kept separate so listing stays fast
 * and blobs are loaded lazily only when a file is opened).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { detectKind, type FileKind } from '@/lib/file-types'

export interface StoredFileMeta {
  id: string
  name: string
  mime: string
  size: number
  kind: FileKind
  addedAt: number
  updatedAt: number
  starred: boolean
}

interface FileVaultDB extends DBSchema {
  meta: {
    key: string
    value: StoredFileMeta
  }
  blobs: {
    key: string
    value: Blob
  }
}

const DB_NAME = 'omnifile-db'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<FileVaultDB>> | null = null

function getDB(): Promise<IDBPDatabase<FileVaultDB>> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in the browser'))
  }
  if (!dbPromise) {
    dbPromise = openDB<FileVaultDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
      },
    })
  }
  return dbPromise
}

function toMeta(file: File): StoredFileMeta {
  const now = Date.now()
  const mime = file.type || 'application/octet-stream'
  return {
    id: crypto.randomUUID(),
    name: file.name || `file-${now}`,
    mime,
    size: file.size,
    kind: detectKind(file.name, mime),
    addedAt: now,
    updatedAt: now,
    starred: false,
  }
}

/** Store new files. Returns their metadata. */
export async function addFiles(files: File[]): Promise<StoredFileMeta[]> {
  const db = await getDB()
  const metas: StoredFileMeta[] = []
  for (const file of files) {
    const meta = toMeta(file)
    const tx = db.transaction(['meta', 'blobs'], 'readwrite')
    await Promise.all([
      tx.objectStore('meta').put(meta),
      tx.objectStore('blobs').put(file, meta.id),
      tx.done,
    ])
    metas.push(meta)
  }
  return metas
}

/** List all file metadata (no blobs — cheap). Newest first. */
export async function listFiles(): Promise<StoredFileMeta[]> {
  const db = await getDB()
  const all = await db.getAll('meta')
  return all.sort((a, b) => b.addedAt - a.addedAt)
}

/** Lazily load the raw bytes of one file. */
export async function getFileBlob(id: string): Promise<Blob | null> {
  const db = await getDB()
  const blob = await db.get('blobs', id)
  return blob ?? null
}

/** Overwrite a file's content (edits stay in the library). */
export async function updateFileBlob(id: string, blob: Blob): Promise<StoredFileMeta | null> {
  const db = await getDB()
  const meta = await db.get('meta', id)
  if (!meta) return null
  const updated: StoredFileMeta = {
    ...meta,
    mime: blob.type || meta.mime,
    size: blob.size,
    updatedAt: Date.now(),
  }
  const tx = db.transaction(['meta', 'blobs'], 'readwrite')
  await Promise.all([
    tx.objectStore('meta').put(updated),
    tx.objectStore('blobs').put(blob, id),
    tx.done,
  ])
  return updated
}

export async function renameFile(id: string, name: string): Promise<StoredFileMeta | null> {
  const db = await getDB()
  const meta = await db.get('meta', id)
  if (!meta) return null
  const updated: StoredFileMeta = {
    ...meta,
    name: name.trim() || meta.name,
    kind: detectKind(name.trim() || meta.name, meta.mime),
  }
  await db.put('meta', updated)
  return updated
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['meta', 'blobs'], 'readwrite')
  await Promise.all([
    tx.objectStore('meta').delete(id),
    tx.objectStore('blobs').delete(id),
    tx.done,
  ])
}

/** Ask the browser to make our storage persistent (never auto-evicted). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
    const already = await navigator.storage.persisted()
    if (already) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const est = await navigator.storage.estimate()
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  } catch {
    return null
  }
}
