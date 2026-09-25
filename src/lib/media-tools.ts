/**
 * Media helper utilities — pure browser APIs, zero dependencies.
 *
 * Used by the media viewer / editor:
 *  - formatTime:       compact m:ss clock for trim labels & readouts
 *  - decodeAudioBlob:  Blob → AudioBuffer (AudioContext, webkit fallback)
 *  - sliceAudioBuffer: cut the [start, end] seconds range via OfflineAudioContext
 *  - audioBufferToWav: AudioBuffer → 16-bit PCM RIFF/WAVE Blob (manual encoder)
 */

/** m:ss clock formatting ("75.4" → "1:15"). */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00'
  const total = Math.floor(totalSeconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Decode a media Blob into an AudioBuffer.
 * Returns null when the Web Audio API is unavailable or the bytes are
 * undecodable — callers show the "unsupported" toast in that case.
 */
export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  const Ctor = window.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  const ctx = new Ctor()
  try {
    // decodeAudioData detaches the ArrayBuffer it receives — always hand it a
    // COPY of the file bytes (blob.arrayBuffer() allocates a fresh one).
    const bytes = await blob.arrayBuffer()
    return await ctx.decodeAudioData(bytes)
  } catch {
    return null
  } finally {
    try {
      void ctx.close().catch(() => undefined)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Render the [start, end] (seconds) slice of an AudioBuffer at its native
 * sample rate and channel count. The source buffer itself is not modified.
 */
export async function sliceAudioBuffer(
  buffer: AudioBuffer,
  start: number,
  end: number
): Promise<AudioBuffer> {
  const w = window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }
  const Ctor = window.OfflineAudioContext ?? w.webkitOfflineAudioContext
  if (!Ctor) throw new Error('OfflineAudioContext is not supported')

  const sampleRate = buffer.sampleRate
  const startIdx = Math.max(0, Math.min(buffer.length, Math.floor(start * sampleRate)))
  const endIdx = Math.max(startIdx + 1, Math.min(buffer.length, Math.ceil(end * sampleRate)))
  const length = endIdx - startIdx

  const offline = new Ctor(buffer.numberOfChannels, length, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start(0, startIdx / sampleRate, length / sampleRate)
  return offline.startRendering()
}

/** Encode an AudioBuffer as 16-bit PCM RIFF/WAVE (standard 44-byte header). */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const blockAlign = numChannels * 2 // 16-bit → 2 bytes per sample
  const dataSize = numFrames * blockAlign

  const out = new ArrayBuffer(44 + dataSize)
  const view = new DataView(out)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  // ── RIFF / WAVE header ──
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true) // file size - 8
  writeAscii(8, 'WAVE')
  // ── fmt chunk ──
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size (PCM)
  view.setUint16(20, 1, true) // audio format: PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  // ── data chunk ──
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))

  // Interleave + clamp + quantise to signed 16-bit little-endian.
  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([out], { type: 'audio/wav' })
}
