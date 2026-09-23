/**
 * Media conversion helpers for the ffmpeg.wasm tools (Task 4-c).
 *
 * Pure arg-array builders + small classification helpers — no ffmpeg
 * imports here (only ffmpeg.ts may import from this file to keep the
 * dependency direction one-way).
 *
 * Codec availability: @ffmpeg/core 0.12.6 ships libx264, libvpx (VP8/VP9),
 * libmp3lame, libopus, libvorbis and the native aac/flac encoders.
 */

export type VideoFormat = 'mp4' | 'webm' | 'mkv' | 'avi' | 'mov'
export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'flac' | 'ogg'

export const VIDEO_FORMATS: VideoFormat[] = ['mp4', 'webm', 'mkv', 'avi', 'mov']
export const AUDIO_FORMATS: AudioFormat[] = ['mp3', 'wav', 'm4a', 'flac', 'ogg']

export function isVideoFormat(f: string): f is VideoFormat {
  return (VIDEO_FORMATS as string[]).includes(f)
}

export function isAudioFormat(f: string): f is AudioFormat {
  return (AUDIO_FORMATS as string[]).includes(f)
}

/* ------------------------------ video convert ------------------------------ */

/** Build the full arg list for a video → video conversion. */
export function buildVideoConvertArgs(
  input: string,
  output: string,
  fmt: VideoFormat,
  opts: { crf?: number } = {}
): string[] {
  switch (fmt) {
    case 'mp4':
    case 'mov':
      return [
        '-i', input,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', String(opts.crf ?? 23),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-movflags', '+faststart',
        '-y', output,
      ]
    case 'webm':
      return [
        '-i', input,
        '-c:v', 'libvpx-vp9',
        '-crf', String(opts.crf ?? 34),
        '-b:v', '0',
        '-row-mt', '1',
        '-c:a', 'libopus',
        '-b:a', '128k',
        '-y', output,
      ]
    case 'mkv':
      // Same codecs as mp4 but matroska muxer (no -movflags).
      return [
        '-i', input,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', String(opts.crf ?? 23),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-y', output,
      ]
    case 'avi':
      return [
        '-i', input,
        '-c:v', 'mpeg4',
        '-qscale:v', '5',
        '-c:a', 'libmp3lame',
        '-q:a', '4',
        '-y', output,
      ]
  }
}

/* ------------------------------ audio convert ------------------------------ */

/** Build the full arg list for an audio conversion (always drops video). */
export function buildAudioConvertArgs(
  input: string,
  output: string,
  fmt: AudioFormat,
  opts: { bitrate?: string } = {}
): string[] {
  const base = ['-i', input, '-vn']
  switch (fmt) {
    case 'mp3':
      return [...base, '-c:a', 'libmp3lame', '-b:a', opts.bitrate ?? '192k', '-y', output]
    case 'wav':
      return [...base, '-c:a', 'pcm_s16le', '-y', output]
    case 'm4a':
      return [...base, '-c:a', 'aac', '-b:a', opts.bitrate ?? '192k', '-y', output]
    case 'flac':
      return [...base, '-c:a', 'flac', '-y', output]
    case 'ogg':
      return [...base, '-c:a', 'libvorbis', '-q:a', '5', '-y', output]
  }
}

/* --------------------------------- compress -------------------------------- */

export type CompressScale = 'original' | '1080' | '720' | '480'

/** libx264/MP4 compression with optional vertical resolution cap. */
export function buildCompressArgs(
  input: string,
  output: string,
  opts: { crf: number; scale?: CompressScale; audioBitrate?: string }
): string[] {
  const args = ['-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(opts.crf)]
  if (opts.scale && opts.scale !== 'original') {
    args.push('-vf', `scale=-2:${opts.scale}`)
  }
  args.push(
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', opts.audioBitrate ?? '128k',
    '-movflags', '+faststart',
    '-y', output
  )
  return args
}

/* ------------------------------- audio extract ------------------------------ */

/** Extract the audio track of a video into a standalone audio file. */
export function buildAudioExtractArgs(
  input: string,
  output: string,
  opts: { format: AudioFormat; bitrate?: string }
): string[] {
  return buildAudioConvertArgs(input, output, opts.format, { bitrate: opts.bitrate })
}

/* ----------------------------------- GIF ----------------------------------- */

/**
 * GIF export needs TWO execs (palettegen → paletteuse cannot be fused into
 * one pass with -lavfi across two inputs). Pass 1 produces `palette.png`;
 * pass 2 references it by name.
 */
export function buildGifPass1(
  input: string,
  startSec: number,
  durationSec: number,
  fps: number,
  width: number
): string[] {
  return [
    '-ss', String(startSec),
    '-t', String(durationSec),
    '-i', input,
    '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`,
    '-y', 'palette.png',
  ]
}

export function buildGifPass2(
  input: string,
  output: string,
  startSec: number,
  durationSec: number,
  fps: number,
  width: number
): string[] {
  return [
    '-ss', String(startSec),
    '-t', String(durationSec),
    '-i', input,
    '-i', 'palette.png',
    '-lavfi', `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
    '-y', output,
  ]
}

/* --------------------------------- helpers --------------------------------- */

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  gif: 'image/gif',
}

/** Best-effort mime type for an output extension. */
export function mimeForExt(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, '')
  return MIME_MAP[clean] ?? 'application/octet-stream'
}

const VIDEO_EXTS = new Set([
  'mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ogv', 'ts', 'mts',
])
const AUDIO_EXTS = new Set([
  'mp3', 'wav', 'm4a', 'flac', 'ogg', 'oga', 'opus', 'aac', 'wma', 'aiff', 'aif', 'amr', 'm4b',
])

/** Rough video/audio classification from extension + mime type. */
export function probeKind(file: { name: string; type?: string }): 'video' | 'audio' | 'unknown' {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  const mime = file.type ?? ''
  if (VIDEO_EXTS.has(ext) || mime.startsWith('video/')) return 'video'
  if (AUDIO_EXTS.has(ext) || mime.startsWith('audio/')) return 'audio'
  return 'unknown'
}
