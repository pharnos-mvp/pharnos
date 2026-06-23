import { useMemo, type ReactNode } from 'react'

import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { VARIATION_FALLBACK, VARIATIONS, type Variation } from './variation-catalog'
import { OTHER_REF } from './variation-request'

/**
 * Sélecteur **deux colonnes** des natures de variation (Annexe N°2) : « Variation mineure » à
 * gauche, « Variation majeure » à droite, une case à cocher devant chaque nature. Compact, dense,
 * colonnes scrollables. Pur (lit le catalogue), FR/EN. Pilote l'arbre Module 1 + la lettre + le
 * tableau comparatif. Réutilisé par le CTD Workspace (création) et la Bibliothèque.
 */
export function VariationPicker({
  value,
  onChange,
}: {
  /** n° des variations cochées (Annexe N°2). */
  value: number[]
  onChange: (refs: number[]) => void
}) {
  const { t } = useI18n()
  const mineures = useMemo(() => VARIATIONS.filter((v) => v.class === 'mineure'), [])
  const majeures = useMemo(() => VARIATIONS.filter((v) => v.class === 'majeure'), [])
  const toggle = (n: number) =>
    onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n])

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Column
          title={t({ fr: 'Variation mineure', en: 'Minor variation' })}
          tone="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          items={mineures}
          value={value}
          onToggle={toggle}
          label={(v) => t(v.nature)}
        />
        <Column
          title={t({ fr: 'Variation majeure', en: 'Major variation' })}
          tone="bg-amber-500/10 text-amber-800 dark:text-amber-300"
          items={majeures}
          value={value}
          onToggle={toggle}
          label={(v) => t(v.nature)}
        />
      </div>
      {/* « Autre » — variation non répertoriée (l'annexe est non exhaustive). */}
      <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-2 rounded-xl border border-dashed p-3 text-sm transition">
        <input
          type="checkbox"
          checked={value.includes(OTHER_REF)}
          onChange={() => toggle(OTHER_REF)}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="font-medium">{t({ fr: 'Autre', en: 'Other' })}</span>
          <span className="text-muted-foreground"> — {t(VARIATION_FALLBACK.nature)}</span>
        </span>
      </label>
    </div>
  )
}

function Column({
  title,
  tone,
  items,
  value,
  onToggle,
  label,
}: {
  title: string
  tone: string
  items: Variation[]
  value: number[]
  onToggle: (n: number) => void
  label: (v: Variation) => string
}): ReactNode {
  const selected = items.filter((v) => value.includes(v.n!)).length
  return (
    <div className="flex min-w-0 flex-col rounded-xl border">
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-semibold',
          tone,
        )}
      >
        <span>{title}</span>
        <span className="text-xs font-normal tabular-nums opacity-70">
          {selected}/{items.length}
        </span>
      </div>
      <ul className="max-h-80 overflow-auto p-1">
        {items.map((v) => {
          const checked = value.includes(v.n!)
          const text = label(v)
          return (
            <li key={v.n}>
              <label
                title={text}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-snug transition',
                  checked ? 'bg-primary/5' : 'hover:bg-accent/50',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(v.n!)}
                  className="accent-primary mt-0.5 size-3.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="text-muted-foreground tabular-nums">{v.n}. </span>
                  {text}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
