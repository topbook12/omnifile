'use client'

import {
  Download,
  FileAudio,
  FileCode,
  FileImage,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderOpen,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDate, formatBytes } from '@/lib/format'
import { kindLabelKey } from '@/lib/file-types'
import { useI18n } from '@/lib/i18n'
import type { StoredFileMeta } from '@/lib/idb'

function KindIcon({ kind, className }: { kind: StoredFileMeta['kind']; className?: string }) {
  switch (kind) {
    case 'pdf':
      return <FileText className={`${className} text-red-500`} />
    case 'image':
      return <FileImage className={`${className} text-emerald-500`} />
    case 'markdown':
    case 'text':
      return <FileCode className={`${className} text-amber-500`} />
    case 'csv':
    case 'excel':
      return <FileSpreadsheet className={`${className} text-teal-500`} />
    case 'docx':
      return <FileText className={`${className} text-orange-500`} />
    case 'video':
      return <FileVideo className={`${className} text-fuchsia-500`} />
    case 'audio':
      return <FileAudio className={`${className} text-pink-500`} />
    default:
      return <FileQuestion className={`${className} text-muted-foreground`} />
  }
}

const ICON_BG: Record<StoredFileMeta['kind'], string> = {
  pdf: 'bg-red-500/10',
  image: 'bg-emerald-500/10',
  text: 'bg-amber-500/10',
  markdown: 'bg-amber-500/10',
  csv: 'bg-teal-500/10',
  excel: 'bg-teal-500/10',
  docx: 'bg-orange-500/10',
  video: 'bg-fuchsia-500/10',
  audio: 'bg-pink-500/10',
  unsupported: 'bg-muted',
}

interface FileCardProps {
  file: StoredFileMeta
  onOpen: (file: StoredFileMeta) => void
  onDownload: (file: StoredFileMeta) => void
  onDelete: (file: StoredFileMeta) => void
  onRename: (file: StoredFileMeta) => void
}

export function FileCard({ file, onOpen, onDownload, onDelete, onRename }: FileCardProps) {
  const { t, lang } = useI18n()

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={file.name}
      onClick={() => onOpen(file)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(file)
        }
      }}
      className="group flex min-h-[92px] cursor-pointer flex-row items-center gap-3 p-4 transition-all hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${ICON_BG[file.kind]}`}
      >
        <KindIcon kind={file.kind} className="h-6 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatBytes(file.size)} · {formatDate(file.addedAt, lang)}
        </p>
        <Badge variant="secondary" className="mt-1.5 h-5 px-1.5 text-[11px] font-normal">
          {t(kindLabelKey(file.kind))}
        </Badge>
      </div>

      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground"
              aria-label={`${t('open')} ${file.name}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onOpen(file)}>
              <FolderOpen className="mr-2 h-4 w-4" /> {t('open')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownload(file)}>
              <Download className="mr-2 h-4 w-4" /> {t('download')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(file)}>
              <Pencil className="mr-2 h-4 w-4" /> {t('rename')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(file)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}
