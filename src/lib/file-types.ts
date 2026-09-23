/**
 * File type detection — routes each file to the correct viewer/editor
 * based on its MIME type and extension.
 */

export type FileKind =
  | 'pdf'
  | 'image'
  | 'text'
  | 'markdown'
  | 'csv'
  | 'excel'
  | 'docx'
  | 'video'
  | 'audio'
  | 'unsupported'

export type FilterGroup = 'all' | 'pdf' | 'image' | 'text' | 'sheets' | 'docs' | 'media'

const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'json', 'xml', 'yml', 'yaml', 'ini', 'conf', 'env', 'toml',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less', 'html', 'htm', 'svg',
  'py', 'rb', 'php', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'swift', 'kt',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'sql', 'graphql', 'srt', 'vtt', 'tex', 'gitignore',
])

const CSV_EXTENSIONS = new Set(['csv', 'tsv'])
const EXCEL_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'fods'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus', 'weba'])

export function getExt(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx < 0 || idx === name.length - 1) return ''
  return name.slice(idx + 1).toLowerCase()
}

export function detectKind(name: string, mime: string): FileKind {
  const ext = getExt(name)
  const m = (mime || '').toLowerCase()

  // PDF
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'

  // Images
  if (m.startsWith('image/')) return 'image'

  // Video / audio
  if (m.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (m.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio'

  // Excel / spreadsheets
  if (
    m.includes('spreadsheetml') ||
    m === 'application/vnd.ms-excel' ||
    m.includes('opendocument.spreadsheet') ||
    EXCEL_EXTENSIONS.has(ext)
  ) {
    return 'excel'
  }

  // CSV / TSV
  if (m === 'text/csv' || CSV_EXTENSIONS.has(ext)) return 'csv'

  // Word documents
  if (
    m.includes('wordprocessingml') ||
    m === 'application/vnd.ms-word' ||
    ext === 'docx'
  ) {
    return 'docx'
  }

  // Markdown
  if (m === 'text/markdown' || MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'

  // Plain text / code
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'application/javascript' ||
    m === 'application/typescript' ||
    m === 'application/x-sh' ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return 'text'
  }

  return 'unsupported'
}

export function kindToGroup(kind: FileKind): FilterGroup | null {
  switch (kind) {
    case 'pdf':
      return 'pdf'
    case 'image':
      return 'image'
    case 'text':
    case 'markdown':
      return 'text'
    case 'csv':
    case 'excel':
      return 'sheets'
    case 'docx':
      return 'docs'
    case 'video':
    case 'audio':
      return 'media'
    default:
      return null
  }
}

/** Translation key for a file kind label (kindPdf, kindImage, …). */
export function kindLabelKey(kind: FileKind): string {
  switch (kind) {
    case 'pdf':
      return 'kindPdf'
    case 'image':
      return 'kindImage'
    case 'text':
      return 'kindText'
    case 'markdown':
      return 'kindMarkdown'
    case 'csv':
      return 'kindCsv'
    case 'excel':
      return 'kindExcel'
    case 'docx':
      return 'kindDocs'
    case 'video':
      return 'kindVideo'
    case 'audio':
      return 'kindAudio'
    default:
      return 'kindOther'
  }
}

export const FILTER_GROUPS: FilterGroup[] = [
  'all', 'pdf', 'image', 'text', 'sheets', 'docs', 'media',
]

export function filterGroupLabelKey(g: FilterGroup): string {
  switch (g) {
    case 'all':
      return 'filterAll'
    case 'pdf':
      return 'filterPdf'
    case 'image':
      return 'filterImage'
    case 'text':
      return 'filterText'
    case 'sheets':
      return 'filterSheets'
    case 'docs':
      return 'filterDocs'
    case 'media':
      return 'filterMedia'
  }
}
