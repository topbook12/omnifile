/**
 * File System Access API helpers with graceful <input type="file"> /
 * anchor-download fallbacks for iOS & Firefox.
 */

type WindowWithFSA = Window & {
  showOpenFilePicker?: (options?: any) => Promise<any[]>
  showSaveFilePicker?: (options?: any) => Promise<any>
}

export function supportsOpenPicker(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

export function supportsSavePicker(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

/** Hidden <input type="file"> fallback — works everywhere incl. iOS Safari. */
export function openFilesWithInput(accept?: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve([])
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    if (accept) input.accept = accept
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)

    const cleanup = () => input.remove()

    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : []
      cleanup()
      resolve(files)
    })
    input.addEventListener('cancel', () => {
      cleanup()
      resolve([])
    })
    input.click()
  })
}

/**
 * Open one or more files. Uses the File System Access picker (Chrome/Edge)
 * when available, otherwise falls back to <input type="file">.
 */
export async function openFilesWithPicker(): Promise<File[]> {
  const w = window as WindowWithFSA
  if (w.showOpenFilePicker) {
    try {
      const handles = await w.showOpenFilePicker({ multiple: true })
      const files = await Promise.all(handles.map((h: any) => h.getFile()))
      if (files.length > 0) return files
    } catch (err) {
      const name = (err as DOMException)?.name
      if (name === 'AbortError') return []
      // Any other error → fall through to the input fallback.
    }
  }
  return openFilesWithInput()
}

/** Plain anchor-download (always works). */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.position = 'fixed'
  a.style.left = '-9999px'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Save a blob to the device. Uses showSaveFilePicker (Chrome/Edge, lets the
 * user choose the location) and falls back to a normal download elsewhere.
 */
export async function saveOrDownloadBlob(
  blob: Blob,
  name: string
): Promise<'saved' | 'downloaded'> {
  const w = window as WindowWithFSA
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: name })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (err) {
      const name2 = (err as DOMException)?.name
      if (name2 === 'AbortError') return 'downloaded' // user cancelled
      // Otherwise fall through to the plain download path.
    }
  }
  downloadBlob(blob, name)
  return 'downloaded'
}
