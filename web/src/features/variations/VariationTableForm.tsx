import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import type { VariationItem } from './variation-request'

/**
 * Éditeur **inline** du tableau comparatif (lignes = variations choisies). Pour chaque item :
 * « ancien » (prérempli depuis la fiche produit) → « nouveau » + justification optionnelle (colonne
 * masquée sur le document final si vide). Présentationnel, piloté par le parent (`items`/`onChange`).
 * Réutilisé par la modale du Workspace et l'onglet « Tableau » de la Bibliothèque.
 */
export function VariationTableForm({
  items,
  onChange,
  emptyHint,
}: {
  items: VariationItem[]
  onChange: (items: VariationItem[]) => void
  emptyHint?: string
}) {
  const { t } = useI18n()
  const setItem = (i: number, patch: Partial<VariationItem>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {emptyHint ??
          t({
            fr: 'Choisissez d’abord une ou plusieurs variations.',
            en: 'Pick one or more variations first.',
          })}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        // Clé stable (ref unique ; « Autre » = ref null, n'apparaît qu'une fois) → pas de réutilisation
        // de textarea quand une ligne est retirée.
        <div key={it.ref ?? `other-${i}`} className="rounded-lg border p-3">
          <div className="mb-2 text-sm font-medium">
            <span className="text-muted-foreground tabular-nums">{it.ref ?? '—'}. </span>
            {it.nature}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Cell
              label={t({ fr: 'Situation actuelle (ancien)', en: 'Current (old)' })}
              value={it.before}
              onChange={(v) => setItem(i, { before: v })}
            />
            <Cell
              label={t({ fr: 'Situation proposée (nouveau)', en: 'Proposed (new)' })}
              value={it.after}
              onChange={(v) => setItem(i, { after: v })}
            />
          </div>
          <Cell
            className="mt-2"
            label={t({ fr: 'Justification (optionnelle)', en: 'Justification (optional)' })}
            value={it.justification}
            onChange={(v) => setItem(i, { justification: v })}
          />
        </div>
      ))}
    </div>
  )
}

function Cell({
  label,
  value,
  onChange,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="border-input bg-background focus-visible:ring-ring w-full resize-y rounded-md border px-2 py-1.5 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
      />
    </label>
  )
}
