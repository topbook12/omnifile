'use client'

/**
 * Tools Hub (Task 3) — the gallery of all advanced tools.
 * Renders category sections with tool cards; clicking a card swaps the
 * view for that tool's panel (lazily loaded via the registry). Also hosts
 * the shared AI (BYOK) settings dialog and the privacy strip.
 */

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AiSettingsDialog } from '@/components/tools/ai-settings'
import {
  CATEGORY_ICONS,
  CATEGORY_LABEL_KEYS,
  SUBGROUP_LABEL_KEYS,
  SUBGROUP_ORDER,
  TOOLS,
  ToolKindBadge,
  type ToolCategory,
  type ToolSubgroup,
} from '@/components/tools/registry'

import { useAiStore } from '@/lib/ai-store'
import { getGeminiKey } from '@/lib/gemini'
import { useI18n } from '@/lib/i18n'

const CATEGORY_ORDER: ToolCategory[] = ['image', 'pdf', 'media']

/** One clickable tool card in the hub gallery. */
function ToolCard({
  tool,
  index,
  onOpen,
}: {
  tool: (typeof TOOLS)[number]
  index: number
  onOpen: (id: string) => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={() => onOpen(tool.id)}
      style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
      className="group animate-fade-up relative rounded-2xl border border-border/80 bg-card p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-premium focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.99]"
    >
      <ArrowUpRight
        aria-hidden
        className="absolute right-3.5 top-3.5 h-4 w-4 text-muted-foreground/0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
      />
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-gradient-to-b from-primary/15 to-primary/6 p-2.5 text-primary ring-1 ring-inset ring-primary/15 transition-transform duration-200 group-hover:scale-105 [&_svg]:h-5 [&_svg]:w-5">
          <tool.icon aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="font-semibold leading-snug tracking-tight">{t(tool.titleKey)}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t(tool.descKey)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ToolKindBadge ai={tool.ai} />
          </div>
        </div>
      </div>
    </button>
  )
}

export function ToolsHub({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [keyVersion, setKeyVersion] = useState(0)

  const dialogOpen = useAiStore((s) => s.dialogOpen)
  useEffect(() => {
    // Re-read the key after the settings dialog closes.
    if (!dialogOpen) setKeyVersion((v) => v + 1)
  }, [dialogOpen])

  const hasKey = (() => {
    void keyVersion
    return !!getGeminiKey()
  })()

  const active = TOOLS.find((tool) => tool.id === activeId) ?? null

  /* ── Active tool panel ── */
  if (active) {
    const Component = active.Component
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-12 pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 gap-1.5 text-muted-foreground"
          onClick={() => setActiveId(null)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('toolBack')}
        </Button>
        <div className="animate-fade-up">
          <Component />
        </div>
      </div>
    )
  }

  /* ── Hub gallery ── */
  return (
    <div className="page-glow mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 pb-12 pt-6">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            {t('toolsHubTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('toolsHubDesc')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className={`h-10 shrink-0 gap-2 ${hasKey ? 'border-emerald-500/40' : 'border-amber-500/50'}`}
          onClick={useAiStore.getState().openDialog}
          aria-label={t('aiSettingsTitle')}
        >
          {hasKey ? (
            <KeyRound className="h-4 w-4 text-emerald-500" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
          )}
          <span className="text-xs">{hasKey ? 'Gemini' : t('aiKeySetBtn')}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${hasKey ? 'bg-emerald-500' : 'bg-amber-500'}`}
            aria-hidden
          />
        </Button>
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map((category) => {
        const Icon = CATEGORY_ICONS[category]
        const tools = TOOLS.filter((tool) => tool.category === category)
        const hasSubgroups = tools.some((tool) => tool.subgroup)
        return (
          <section key={category} className="mt-8" aria-labelledby={`cat-${category}`}>
            <div className="mb-3 flex items-center gap-3">
              <h2
                id={`cat-${category}`}
                className="flex shrink-0 items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground/80"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {t(CATEGORY_LABEL_KEYS[category])}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {tools.length}
                </span>
              </h2>
              <div aria-hidden className="hairline-gradient h-px flex-1 opacity-50" />
            </div>
            {hasSubgroups ? (
              /* PDF suite: render sub-sections in fixed order */
              SUBGROUP_ORDER.map((subgroup: ToolSubgroup) => {
                const groupTools = tools.filter((tool) => tool.subgroup === subgroup)
                if (groupTools.length === 0) return null
                return (
                  <div key={subgroup} className="mt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {t(SUBGROUP_LABEL_KEYS[subgroup])}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {groupTools.map((tool, i) => (
                        <ToolCard key={tool.id} tool={tool} index={i} onOpen={setActiveId} />
                      ))}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool, i) => (
                  <ToolCard key={tool.id} tool={tool} index={i} onOpen={setActiveId} />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Privacy strip */}
      <div className="mt-9 flex items-start gap-2.5 rounded-2xl border border-border/70 bg-muted/40 p-4 text-xs text-muted-foreground shadow-xs animate-fade-up">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/12">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
        </span>
        <p>
          {t('localFirstNote')} {t('aiSettingsDesc')}
        </p>
      </div>

      <AiSettingsDialog />
    </div>
  )
}
