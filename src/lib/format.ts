/** Small formatting helpers shared across the app. */

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  const d = i === 0 ? 0 : value >= 100 ? 0 : digits
  return `${value.toFixed(d)} ${units[i]}`
}

export function formatDate(ts: number, lang: 'bn' | 'en'): string {
  try {
    return new Date(ts).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return new Date(ts).toLocaleDateString()
  }
}
