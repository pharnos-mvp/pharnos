import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { VARIATION_FALLBACK, VARIATIONS, type VariationClass } from './variation-catalog'
import { OTHER_REF } from './variation-request'

/**
 * Sélecteur de natures de variation **segmenté + recherche** (mockup validé CEO pour l'assistant de
 * création) : un onglet Mineures | Majeures filtre la liste (Annexe N°2), une recherche affine, des
 * cases à cocher pilotent `value` (refs). Compact, scrollable, « Autre » toujours visible. Pur, FR/EN.
 * Distinct du `VariationPicker` deux-colonnes (réutilisé par la Bibliothèque / tableau comparatif).
 */
export function VariationNaturesPicker({
  value,
  onChange,
}: {
  /** n° des variations cochées (Annexe N°2). */
  value: number[]
  onChange: (refs: number[]) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<VariationClass>('mineure')
  const [query, setQuery] = useState('')

  const mineures = useMemo(() => VARIATIONS.filter((v) => v.class === 'mineure'), [])
  const majeures = useMemo(() => VARIATIONS.filter((v) => v.class === 'majeure'), [])
  const selMin = mineures.filter((v) => value.includes(v.n!)).length
  const selMaj = majeures.filter((v) => value.includes(v.n!)).length

  const q = query.trim().toLowerCase()
  const matches = (list: typeof VARIATIONS) =>
    q ? list.filter((v) => t(v.nature).toLowerCase().includes(q) || String(v.n).includes(q)) : list
  const active = tab === 'mineure' ? mineures : majeures
  const rows = matches(active)
  // Recherche sans résultat dans l'onglet actif : combien dans l'AUTRE classe ? (évite l'angle mort « 0
  // résultat » alors qu'une nature existe ailleurs — l'utilisateur ne connaît pas a priori sa classe.)
  const otherClass: VariationClass = tab === 'mineure' ? 'majeure' : 'mineure'
  const otherHits = q && !rows.length ? matches(tab === 'mineure' ? majeures : mineures).length : 0

  const toggle = (n: number) =>
    onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n])

  const tabs: { c: VariationClass; label: string; sel: number }[] = [
    { c: 'mineure', label: t({ fr: 'Mineures', en: 'Minor' }), sel: selMin },
    { c: 'majeure', label: t({ fr: 'Majeures', en: 'Major' }), sel: selMaj },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Segmenté Mineures | Majeures (filtre la liste). */}
        <div
          role="group"
          aria-label={t({ fr: 'Classe de variation', en: 'Variation class' })}
          className="bg-muted inline-flex rounded-lg p-0.5"
        >
          {tabs.map(({ c, label, sel }) => {
            const on = tab === c
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => setTab(c)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                {label}
                {sel > 0 ? <span className="text-info ml-1 tabular-nums">{sel}</span> : null}
              </button>
            )
          })}
        </div>
        {/* Recherche (dans la classe active). */}
        <div className="relative min-w-[150px] flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t({ fr: 'Rechercher une nature…', en: 'Search a type…' })}
            aria-label={t({
              fr: 'Rechercher une nature de variation',
              en: 'Search a variation type',
            })}
            className="bg-muted focus-visible:ring-ring w-full rounded-lg py-1.5 pr-3 pl-8 text-xs outline-none focus-visible:ring-2"
          />
        </div>
      </div>

      {/* Liste des natures (classe active, filtrée). */}
      <ul className="max-h-64 overflow-auto rounded-lg border p-1">
        {rows.length ? (
          rows.map((v) => {
            const checked = value.includes(v.n!)
            const text = t(v.nature)
            return (
              <li key={v.n}>
                <label
                  title={text}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-snug transition',
                    checked ? 'bg-info-subtle' : 'hover:bg-accent/50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(v.n!)}
                    className="accent-primary mt-0.5 size-3.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="text-muted-foreground tabular-nums">{v.n}. </span>
                    {text}
                  </span>
                </label>
              </li>
            )
          })
        ) : (
          <li className="text-muted-foreground px-2 py-4 text-center text-xs">
            {t({ fr: 'Aucune nature ne correspond.', en: 'No matching type.' })}
            {otherHits > 0 ? (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setTab(otherClass)}
                  className="text-info font-medium underline"
                >
                  {t({
                    fr: `${otherHits} dans ${otherClass === 'majeure' ? 'Majeures' : 'Mineures'}`,
                    en: `${otherHits} in ${otherClass === 'majeure' ? 'Major' : 'Minor'}`,
                  })}
                </button>
              </>
            ) : null}
          </li>
        )}
      </ul>

      {/* « Autre » — variation non répertoriée (l'annexe est non exhaustive), toujours accessible. */}
      <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-2 rounded-lg border border-dashed p-2.5 text-xs transition">
        <input
          type="checkbox"
          checked={value.includes(OTHER_REF)}
          onChange={() => toggle(OTHER_REF)}
          className="accent-primary mt-0.5 size-3.5 shrink-0"
        />
        <span className="min-w-0">
          <span className="font-medium">{t({ fr: 'Autre', en: 'Other' })}</span>
          <span className="text-muted-foreground"> — {t(VARIATION_FALLBACK.nature)}</span>
        </span>
      </label>

      {value.length ? (
        <p className="text-muted-foreground text-xs">
          {t({
            fr: `${value.length} nature${value.length > 1 ? 's' : ''} sélectionnée${value.length > 1 ? 's' : ''}`,
            en: `${value.length} type${value.length > 1 ? 's' : ''} selected`,
          })}
        </p>
      ) : null}
    </div>
  )
}
