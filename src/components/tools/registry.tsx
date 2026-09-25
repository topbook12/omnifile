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
  BadgeCheck,
  Bot,
  Camera,
  Clapperboard,
  ClipboardList,
  CloudUpload,
  Code,
  Combine,
  Crop,
  Droplet,
  Eraser,
  EyeOff,
  FileImage,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Film,
  GitCompare,
  Hash,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  Link2,
  Lock,
  Minimize2,
  PanelTop,
  PenLine,
  Presentation,
  Repeat,
  RotateCw,
  ScanText,
  Scaling,
  Scissors,
  Signature,
  Sparkles,
  Type,
  WandSparkles,
  Workflow,
  PenTool,
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

/* ── PDF tools (complete suite) ── */
const PdfMergeTool = load(() => import('@/components/tools/pdf/PdfMergeTool'))
const PdfSplitTool = load(() => import('@/components/tools/pdf/PdfSplitTool'))
const PdfCompressTool = load(() => import('@/components/tools/pdf/PdfCompressTool'))
const ImagesToPdfTool = load(() => import('@/components/tools/pdf/ImagesToPdfTool'))
const PdfToJpgTool = load(() => import('@/components/tools/pdf/PdfToJpgTool'))
const PdfToWordTool = load(() => import('@/components/tools/pdf/PdfToWordTool'))
const PdfOcrTool = load(() => import('@/components/tools/pdf/PdfOcrTool'))
const PdfSignTool = load(() => import('@/components/tools/pdf/PdfSignTool'))
const PdfProtectTool = load(() => import('@/components/tools/pdf/PdfProtectTool'))
const PdfTextTool = load(() => import('@/components/tools/pdf/PdfTextTool'))
const PdfImageStampTool = load(() => import('@/components/tools/pdf/PdfImageStampTool'))
const PdfHyperlinkTool = load(() => import('@/components/tools/pdf/PdfHyperlinkTool'))
const PdfWatermarkTool = load(() => import('@/components/tools/pdf/PdfWatermarkTool'))
const PdfOrganizerTool = load(() => import('@/components/tools/pdf/PdfOrganizerTool'))
const PdfExtractCropTool = load(() => import('@/components/tools/pdf/PdfExtractCropTool'))
const PdfRotateTool = load(() => import('@/components/tools/pdf/PdfRotateTool'))
const PdfHeaderFooterTool = load(() => import('@/components/tools/pdf/PdfHeaderFooterTool'))
const PdfBatesTool = load(() => import('@/components/tools/pdf/PdfBatesTool'))
const PdfToExcelTool = load(() => import('@/components/tools/pdf/PdfToExcelTool'))
const PdfToPptTool = load(() => import('@/components/tools/pdf/PdfToPptTool'))
const PdfToHtmlTool = load(() => import('@/components/tools/pdf/PdfToHtmlTool'))
const TextToPdfTool = load(() => import('@/components/tools/pdf/TextToPdfTool'))
const PdfScannerTool = load(() => import('@/components/tools/pdf/PdfScannerTool'))
const PdfAnnotateTool = load(() => import('@/components/tools/pdf/PdfAnnotateTool'))
const PdfFormBuilderTool = load(() => import('@/components/tools/pdf/PdfFormBuilderTool'))
const PdfFormExtractTool = load(() => import('@/components/tools/pdf/PdfFormExtractTool'))
const PdfEsignFlowTool = load(() => import('@/components/tools/pdf/PdfEsignFlowTool'))
const PdfRedactTool = load(() => import('@/components/tools/pdf/PdfRedactTool'))
const PdfCertifyTool = load(() => import('@/components/tools/pdf/PdfCertifyTool'))
const PdfCompareTool = load(() => import('@/components/tools/pdf/PdfCompareTool'))
const PdfCopilotTool = load(() => import('@/components/tools/pdf/PdfCopilotTool'))
const PdfCloudTool = load(() => import('@/components/tools/pdf/PdfCloudTool'))

/* ── Media tools ── */
const MediaConvertTool = load(() => import('@/components/tools/media/MediaConvertTool'))
const VideoCompressTool = load(() => import('@/components/tools/media/VideoCompressTool'))
const AudioExtractTool = load(() => import('@/components/tools/media/AudioExtractTool'))
const VideoGifTool = load(() => import('@/components/tools/media/VideoGifTool'))

export type ToolCategory = 'image' | 'pdf' | 'media'

/** Sub-sections inside the PDF category (rendered as small headers). */
export type ToolSubgroup =
  | 'edit'
  | 'pages'
  | 'convert'
  | 'annotate'
  | 'forms'
  | 'secure'
  | 'optimize'

export interface ToolMeta {
  id: string
  category: ToolCategory
  /** Optional sub-section inside the category (PDF suite). */
  subgroup?: ToolSubgroup
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

  // ── PDF · Core editing ──
  {
    id: 'pdf-add-text',
    category: 'pdf',
    subgroup: 'edit',
    icon: Type,
    titleKey: 'toolPdfAddText',
    descKey: 'toolPdfAddTextDesc',
    Component: PdfTextTool,
  },
  {
    id: 'pdf-add-image',
    category: 'pdf',
    subgroup: 'edit',
    icon: ImagePlus,
    titleKey: 'toolPdfAddImage',
    descKey: 'toolPdfAddImageDesc',
    Component: PdfImageStampTool,
  },
  {
    id: 'pdf-hyperlink',
    category: 'pdf',
    subgroup: 'edit',
    icon: Link2,
    titleKey: 'toolPdfHyperlink',
    descKey: 'toolPdfHyperlinkDesc',
    Component: PdfHyperlinkTool,
  },
  {
    id: 'pdf-watermark',
    category: 'pdf',
    subgroup: 'edit',
    icon: Droplet,
    titleKey: 'toolPdfWatermark',
    descKey: 'toolPdfWatermarkDesc',
    Component: PdfWatermarkTool,
  },

  // ── PDF · Page management ──
  {
    id: 'pdf-merge',
    category: 'pdf',
    subgroup: 'pages',
    icon: Combine,
    titleKey: 'toolPdfMerge',
    descKey: 'toolPdfMergeDesc',
    Component: PdfMergeTool,
  },
  {
    id: 'pdf-split',
    category: 'pdf',
    subgroup: 'pages',
    icon: Scissors,
    titleKey: 'toolPdfSplit',
    descKey: 'toolPdfSplitDesc',
    Component: PdfSplitTool,
  },
  {
    id: 'pdf-organizer',
    category: 'pdf',
    subgroup: 'pages',
    icon: LayoutGrid,
    titleKey: 'toolPdfOrganizer',
    descKey: 'toolPdfOrganizerDesc',
    Component: PdfOrganizerTool,
  },
  {
    id: 'pdf-extract',
    category: 'pdf',
    subgroup: 'pages',
    icon: Crop,
    titleKey: 'toolPdfExtract',
    descKey: 'toolPdfExtractDesc',
    Component: PdfExtractCropTool,
  },
  {
    id: 'pdf-rotate',
    category: 'pdf',
    subgroup: 'pages',
    icon: RotateCw,
    titleKey: 'toolPdfRotate',
    descKey: 'toolPdfRotateDesc',
    Component: PdfRotateTool,
  },
  {
    id: 'pdf-header-footer',
    category: 'pdf',
    subgroup: 'pages',
    icon: PanelTop,
    titleKey: 'toolPdfHeaderFooter',
    descKey: 'toolPdfHeaderFooterDesc',
    Component: PdfHeaderFooterTool,
  },
  {
    id: 'pdf-bates',
    category: 'pdf',
    subgroup: 'pages',
    icon: Hash,
    titleKey: 'toolPdfBates',
    descKey: 'toolPdfBatesDesc',
    Component: PdfBatesTool,
  },

  // ── PDF · Convert & OCR ──
  {
    id: 'pdf-from-images',
    category: 'pdf',
    subgroup: 'convert',
    icon: ImageIcon,
    titleKey: 'toolImagesToPdf',
    descKey: 'toolImagesToPdfDesc',
    Component: ImagesToPdfTool,
  },
  {
    id: 'text-to-pdf',
    category: 'pdf',
    subgroup: 'convert',
    icon: FileText,
    titleKey: 'toolTextToPdf',
    descKey: 'toolTextToPdfDesc',
    Component: TextToPdfTool,
  },
  {
    id: 'pdf-scanner',
    category: 'pdf',
    subgroup: 'convert',
    icon: Camera,
    titleKey: 'toolPdfScanner',
    descKey: 'toolPdfScannerDesc',
    Component: PdfScannerTool,
  },
  {
    id: 'pdf-to-jpg',
    category: 'pdf',
    subgroup: 'convert',
    icon: FileImage,
    titleKey: 'toolPdfToJpg',
    descKey: 'toolPdfToJpgDesc',
    Component: PdfToJpgTool,
  },
  {
    id: 'pdf-to-word',
    category: 'pdf',
    subgroup: 'convert',
    icon: FileText,
    titleKey: 'toolPdfToWord',
    descKey: 'toolPdfToWordDesc',
    Component: PdfToWordTool,
  },
  {
    id: 'pdf-to-excel',
    category: 'pdf',
    subgroup: 'convert',
    icon: FileSpreadsheet,
    titleKey: 'toolPdfToExcel',
    descKey: 'toolPdfToExcelDesc',
    Component: PdfToExcelTool,
  },
  {
    id: 'pdf-to-ppt',
    category: 'pdf',
    subgroup: 'convert',
    icon: Presentation,
    titleKey: 'toolPdfToPpt',
    descKey: 'toolPdfToPptDesc',
    Component: PdfToPptTool,
  },
  {
    id: 'pdf-to-html',
    category: 'pdf',
    subgroup: 'convert',
    icon: Code,
    titleKey: 'toolPdfToHtml',
    descKey: 'toolPdfToHtmlDesc',
    Component: PdfToHtmlTool,
  },
  {
    id: 'pdf-ocr',
    category: 'pdf',
    subgroup: 'convert',
    icon: ScanText,
    titleKey: 'toolPdfOcr',
    descKey: 'toolPdfOcrDesc',
    Component: PdfOcrTool,
    ai: true,
  },

  // ── PDF · Annotate & review ──
  {
    id: 'pdf-annotate',
    category: 'pdf',
    subgroup: 'annotate',
    icon: PenLine,
    titleKey: 'toolPdfAnnotate',
    descKey: 'toolPdfAnnotateDesc',
    Component: PdfAnnotateTool,
  },

  // ── PDF · Forms & signatures ──
  {
    id: 'pdf-sign',
    category: 'pdf',
    subgroup: 'forms',
    icon: Signature,
    titleKey: 'toolPdfSign',
    descKey: 'toolPdfSignDesc',
    Component: PdfSignTool,
  },
  {
    id: 'pdf-form-builder',
    category: 'pdf',
    subgroup: 'forms',
    icon: ClipboardList,
    titleKey: 'toolPdfFormBuilder',
    descKey: 'toolPdfFormFillable',
    Component: PdfFormBuilderTool,
  },
  {
    id: 'pdf-form-extract',
    category: 'pdf',
    subgroup: 'forms',
    icon: FileSearch,
    titleKey: 'toolPdfFormExtract',
    descKey: 'toolPdfFormExtractDesc',
    Component: PdfFormExtractTool,
  },
  {
    id: 'pdf-esign-flow',
    category: 'pdf',
    subgroup: 'forms',
    icon: Workflow,
    titleKey: 'toolPdfEsignFlow',
    descKey: 'toolPdfEsignFlowDesc',
    Component: PdfEsignFlowTool,
  },

  // ── PDF · Security & privacy ──
  {
    id: 'pdf-protect',
    category: 'pdf',
    subgroup: 'secure',
    icon: Lock,
    titleKey: 'toolPdfProtect',
    descKey: 'toolPdfProtectDesc',
    Component: PdfProtectTool,
  },
  {
    id: 'pdf-redact',
    category: 'pdf',
    subgroup: 'secure',
    icon: EyeOff,
    titleKey: 'toolPdfRedact',
    descKey: 'toolPdfRedactDesc',
    Component: PdfRedactTool,
  },
  {
    id: 'pdf-certify',
    category: 'pdf',
    subgroup: 'secure',
    icon: BadgeCheck,
    titleKey: 'toolPdfCertify',
    descKey: 'toolPdfCertifyDesc',
    Component: PdfCertifyTool,
  },

  // ── PDF · Optimize & AI ──
  {
    id: 'pdf-compress',
    category: 'pdf',
    subgroup: 'optimize',
    icon: Archive,
    titleKey: 'toolPdfCompress',
    descKey: 'toolPdfCompressDesc',
    Component: PdfCompressTool,
  },
  {
    id: 'pdf-compare',
    category: 'pdf',
    subgroup: 'optimize',
    icon: GitCompare,
    titleKey: 'toolPdfCompare',
    descKey: 'toolPdfCompareDesc',
    Component: PdfCompareTool,
  },
  {
    id: 'pdf-copilot',
    category: 'pdf',
    subgroup: 'optimize',
    icon: Bot,
    titleKey: 'toolPdfCopilot',
    descKey: 'toolPdfCopilotDesc',
    Component: PdfCopilotTool,
    ai: true,
  },
  {
    id: 'pdf-cloud',
    category: 'pdf',
    subgroup: 'optimize',
    icon: CloudUpload,
    titleKey: 'toolPdfCloud',
    descKey: 'toolPdfCloudDesc',
    Component: PdfCloudTool,
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

/** Render order of PDF sub-sections in the hub. */
export const SUBGROUP_ORDER: ToolSubgroup[] = [
  'edit',
  'pages',
  'convert',
  'annotate',
  'forms',
  'secure',
  'optimize',
]

export const SUBGROUP_LABEL_KEYS: Record<ToolSubgroup, string> = {
  edit: 'toolsSubEdit',
  pages: 'toolsSubPages',
  convert: 'toolsSubConvert',
  annotate: 'toolsSubAnnotate',
  forms: 'toolsSubForms',
  secure: 'toolsSubSecure',
  optimize: 'toolsSubOptimize',
}

/** Small badge pair used on hub cards. */
export function ToolKindBadge({ ai }: { ai?: boolean }) {
  return ai ? <GeminiBadge /> : <OnDeviceBadge />
}

export { Sparkles }
