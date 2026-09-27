'use client'

/**
 * Global error boundary (App Router).
 *
 * Catches render-time and lazy-chunk (ChunkLoadError) failures and offers a
 * one-tap recovery instead of the framework's bare "Application error" page.
 * A deployment can change chunk hashes under a long-lived PWA session — the
 * reload button simply fetches the fresh shell.
 */

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    // Surface the failure for diagnostics; the user sees the friendly UI below.
    console.error(error)
  }, [error])

  const chunkError =
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically/i.test(error?.message ?? '')

  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-2xl"
        aria-hidden
      >
        ⚠️
      </div>
      <h1 className="text-lg font-semibold">
        {chunkError ? t('errChunkTitle') : t('errGeneric')}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {chunkError ? t('errChunkDesc') : t('errGenericDesc')}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()} className="h-11">
          {t('errTryAgain')}
        </Button>
        <Button variant="outline" className="h-11" onClick={() => window.location.reload()}>
          {t('errReload')}
        </Button>
      </div>
    </main>
  )
}
