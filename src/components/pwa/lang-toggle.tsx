'use client'

import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

/** Small header button that switches between বাংলা and English. */
export function LangToggle() {
  const { lang, setLang } = useI18n()
  const next = lang === 'bn' ? 'en' : 'bn'

  return (
    <Button
      variant="ghost"
      className="h-10 min-w-10 px-2 text-sm font-semibold"
      aria-label="Switch language"
      title="বাংলা / English"
      onClick={() => setLang(next)}
    >
      {lang === 'bn' ? 'বাং' : 'EN'}
    </Button>
  )
}
