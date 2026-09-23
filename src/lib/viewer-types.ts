import type { StoredFileMeta } from '@/lib/idb'

/**
 * Uniform contract for every viewer / editor component.
 * The parent (page.tsx) loads the file blob from IndexedDB once and passes it in,
 * so heavy components stay lazy and decoupled from the storage layer.
 */
export interface ViewerEditorProps {
  file: StoredFileMeta
  /** Original (or last saved) file bytes. */
  blob: Blob
  /** True when the user has unsaved edits. */
  dirty: boolean
  onDirtyChange: (dirty: boolean) => void
  /** Persist a new version of this file into the local library (IndexedDB). */
  onSave: (newBlob: Blob) => Promise<void>
}
