'use client'

/**
 * Tool registry (Task 3) — single source of truth for the Tools Hub.
 * Each entry pairs metadata (category, icon, i18n keys) with a lazily
 * loaded panel component. Tool panels live in
 *   src/components/tools/{image,pdf,media}/<Xxx>Tool.tsx
 * and are owned by their respective implementation tasks.
 */

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import {
  Archive,
  AudioLines,
  Clapperboard,
  Combine,
  Eraser,
  FileImage,
  FileText,
  FileVideo,
  Film,
  Image as ImageIcon,
  Lock,
  Minimize2,
  PenTool,
  Repeat,
  ScanText,
  Scaling,
  Scissors,
  Signature,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'

import { OnDeviceBadge, GeminiBadge } from './shared'

const TOOL_LOADING = (
  <div className="flex h-40 items-center justify-center text-muted-foreground">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
  </div>
)

const load = (loader: () => Promise<{ default: ComponentType }>): ComponentType =>
  dynamic(loader, { ssr: false, loading: () => TOOL_LOADING })

/* ── Image tools ── */
const ImageCompressTool = load(() => import('@/components/tools/image/ImageCompressTool'))
const ImageConvertTool = load(() => import('@/components/tools/image/ImageConvertTool'))
const ImageResizeTool = load(() => import('@/components/tools/image/ImageResizeTool'))
const ImageBgRemoveTool = load(() => import('@/components/tools/image/ImageBgRemoveTool'))
const ImageEnhanceTool = load(() => import('@/components/tools/image/ImageEnhanceTool'))
const ImageVectorTool = load(() => import('@/components/tools/image/ImageVectorTool'))

/* ── PDF tools ── */
const PdfMergeTool = load(() => import('@/components/tools/pdf/PdfMergeTool'))
const PdfSplitTool = load(() => import('@/components/tools/pdf/PdfSplitTool'))
const PdfCompressTool = load(() => import('@/components/tools/pdf/PdfCompressTool'))
const ImagesToPdfTool = load(() => import('@/components/tools/pdf/ImagesToPdfTool'))
const PdfToJpgTool = load(() => import('@/components/tools/pdf/PdfToJpgTool'))
const PdfToWordTool = load(() => import('@/components/tools/pdf/PdfToWordTool'))
const PdfOcrTool = load(() => import('@/components/tools/pdf/PdfOcrTool'))
const PdfSignTool = load(() => import('@/components/tools/pdf/PdfSignTool'))
const PdfProtectTool = load(() => import('@/components/tools/pdf/PdfProtectTool'))

/* ── Media tools ── */
const MediaConvertTool = load(() => import('@/components/tools/media/MediaConvertTool'))
const VideoCompressTool = load(() => import('@/components/tools/media/VideoCompressTool'))
const AudioExtractTool = load(() => import('@/components/tools/media/AudioExtractTool'))
const VideoGifTool = load(() => import('@/components/tools/media/VideoGifTool'))

export type ToolCategory = 'image' | 'pdf' | 'media'

export interface ToolMeta {
  id: string
  category: ToolCategory
  icon: LucideIcon
  titleKey: string
  descKey: string
  Component: ComponentType
  /** true → uses the user's own Gemini API key (BYOK). */
  ai?: boolean
}

export const TOOLS: ToolMeta[] = [
  // ── Images ──
  {
    id: 'img-compress',
    category: 'image',
    icon: Minimize2,
    titleKey: 'toolImageCompress',
    descKey: 'toolImageCompressDesc',
    Component: ImageCompressTool,
  },
  {
    id: 'img-convert',
    category: 'image',
    icon: Repeat,
    titleKey: 'toolImageConvert',
    descKey: 'toolImageConvertDesc',
    Component: ImageConvertTool,
  },
  {
    id: 'img-resize',
    category: 'image',
    icon: Scaling,
    titleKey: 'toolImageResize',
    descKey: 'toolImageResizeDesc',
    Component: ImageResizeTool,
  },
  {
    id: 'img-bgremove',
    category: 'image',
    icon: Eraser,
    titleKey: 'toolImageBgRemove',
    descKey: 'toolImageBgRemoveDesc',
    Component: ImageBgRemoveTool,
  },
  {
    id: 'img-enhance',
    category: 'image',
    icon: WandSparkles,
    titleKey: 'toolImageEnhance',
    descKey: 'toolImageEnhanceDesc',
    Component: ImageEnhanceTool,
    ai: true,
  },
  {
    id: 'img-vector',
    category: 'image',
    icon: PenTool,
    titleKey: 'toolImageVector',
    descKey: 'toolImageVectorDesc',
    Component: ImageVectorTool,
  },

  // ── PDF ──
  {
    id: 'pdf-merge',
    category: 'pdf',
    icon: Combine,
    titleKey: 'toolPdfMerge',
    descKey: 'toolPdfMergeDesc',
    Component: PdfMergeTool,
  },
  {
    id: 'pdf-split',
    category: 'pdf',
    icon: Scissors,
    titleKey: 'toolPdfSplit',
    descKey: 'toolPdfSplitDesc',
    Component: PdfSplitTool,
  },
  {
    id: 'pdf-compress',
    category: 'pdf',
    icon: Archive,
    titleKey: 'toolPdfCompress',
    descKey: 'toolPdfCompressDesc',
    Component: PdfCompressTool,
  },
  {
    id: 'pdf-from-images',
    category: 'pdf',
    icon: ImageIcon,
    titleKey: 'toolImagesToPdf',
    descKey: 'toolImagesToPdfDesc',
    Component: ImagesToPdfTool,
  },
  {
    id: 'pdf-to-jpg',
    category: 'pdf',
    icon: FileImage,
    titleKey: 'toolPdfToJpg',
    descKey: 'toolPdfToJpgDesc',
    Component: PdfToJpgTool,
  },
  {
    id: 'pdf-to-word',
    category: 'pdf',
    icon: FileText,
    titleKey: 'toolPdfToWord',
    descKey: 'toolPdfToWordDesc',
    Component: PdfToWordTool,
  },
  {
    id: 'pdf-ocr',
    category: 'pdf',
    icon: ScanText,
    titleKey: 'toolPdfOcr',
    descKey: 'toolPdfOcrDesc',
    Component: PdfOcrTool,
    ai: true,
  },
  {
    id: 'pdf-sign',
    category: 'pdf',
    icon: Signature,
    titleKey: 'toolPdfSign',
    descKey: 'toolPdfSignDesc',
    Component: PdfSignTool,
  },
  {
    id: 'pdf-protect',
    category: 'pdf',
    icon: Lock,
    titleKey: 'toolPdfProtect',
    descKey: 'toolPdfProtectDesc',
    Component: PdfProtectTool,
  },

  // ── Media ──
  {
    id: 'media-convert',
    category: 'media',
    icon: Repeat,
    titleKey: 'toolMediaConvert',
    descKey: 'toolMediaConvertDesc',
    Component: MediaConvertTool,
  },
  {
    id: 'video-compress',
    category: 'media',
    icon: FileVideo,
    titleKey: 'toolVideoCompress',
    descKey: 'toolVideoCompressDesc',
    Component: VideoCompressTool,
  },
  {
    id: 'audio-extract',
    category: 'media',
    icon: AudioLines,
    titleKey: 'toolAudioExtract',
    descKey: 'toolAudioExtractDesc',
    Component: AudioExtractTool,
  },
  {
    id: 'video-gif',
    category: 'media',
    icon: Clapperboard,
    titleKey: 'toolVideoGif',
    descKey: 'toolVideoGifDesc',
    Component: VideoGifTool,
  },
]

export const CATEGORY_ICONS: Record<ToolCategory, LucideIcon> = {
  image: ImageIcon,
  pdf: FileText,
  media: Film,
}

export const CATEGORY_LABEL_KEYS: Record<ToolCategory, string> = {
  image: 'toolsCatImage',
  pdf: 'toolsCatPdf',
  media: 'toolsCatMedia',
}

/** Small badge pair used on hub cards. */
export function ToolKindBadge({ ai }: { ai?: boolean }) {
  return ai ? <GeminiBadge /> : <OnDeviceBadge />
}

export { Sparkles }
