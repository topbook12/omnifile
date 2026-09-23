'use client'

import { useEffect, useState } from 'react'
import { Download, MonitorDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Header "Install app" button — uses beforeinstallprompt when available. */
export function InstallButton() {
  const { t } = useI18n()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const checkStandalone = () =>
      setIsStandalone(
        window.matchMedia('(display-mode: standalone)').matches ||
          // iOS Safari
          (navigator as Navigator & { standalone?: boolean }).standalone === true
      )
    checkStandalone()

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', checkStandalone)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', checkStandalone)
    }
  }, [])

  if (isStandalone) return null

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt()
      setDeferred(null)
    } else {
      setShowHelp(true)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-10 gap-1.5 border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-400/40 dark:text-emerald-300 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-200"
        onClick={handleClick}
      >
        {deferred ? <MonitorDown className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        <span className="hidden sm:inline">{t('install')}</span>
      </Button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('installTitle')}</DialogTitle>
            <DialogDescription>{t('installDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t('installSteps')}</p>
            <p>{t('installIos')}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
