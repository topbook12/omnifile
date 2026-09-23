'use client'

/**
 * Media viewer — video / audio playback via native controls. Read-only;
 * dirty/onSave are ignored. The blob is exposed through a short-lived
 * object URL that is revoked on cleanup and on every blob change.
 */
import { useEffect, useMemo, useState } from 'react'
import { Music } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { formatBytes } from '@/lib/format'
import type { ViewerEditorProps } from '@/lib/viewer-types'

export default function MediaViewer({ file, blob }: ViewerEditorProps) {
  const { t } = useI18n()

  // Object URL derived per blob; revoked by the effect below on change/unmount.
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])

  const isVideo = file.mime.startsWith('video/') || file.kind === 'video'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isVideo ? (
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/90 p-3">
          <Badge
            variant="secondary"
            className="pointer-events-none absolute right-3 top-3"
          >
            {t('mediaHint')}
          </Badge>
          {!failed ? (
            <video
              key={url}
              src={url}
              controls
              playsInline
              className="max-h-full max-w-full"
              onError={() => setFailed(true)}
            />
          ) : (
            <Card className="w-full max-w-md p-6">
              <p className="text-sm font-medium">{t('errGeneric')}</p>
            </Card>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-6">
          <Card className="relative w-full max-w-md p-6">
            <Badge
              variant="secondary"
              className="pointer-events-none absolute right-3 top-3"
            >
              {t('mediaHint')}
            </Badge>
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-primary/10 p-5">
                <Music className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <div className="flex w-full flex-col items-center gap-1">
                <p className="w-full truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </p>
              </div>
              {!failed ? (
                <audio
                  key={url}
                  src={url}
                  controls
                  className="mt-2 w-full"
                  onError={() => setFailed(true)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t('errGeneric')}</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
