import { useMemo, useState, type ReactNode } from 'react'
import { ClipboardList, FileText, Info, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import {
  GENERAL_REQUIREMENTS,
  GROUPING_FEE_NOTE,
  GROUPING_RULES,
  PIECE_LABEL,
  PRIOR_APPROVAL_NOTE,
  VARIATION_COUNTS,
  VARIATION_FALLBACK,
  VARIATIONS,
  type Variation,
  type VariationClass,
} from './variation-catalog'

type ClassFilter = 'all' | VariationClass

/**
 * Module « Variations » — **encyclopédie de référence** des 42 variations (Annexe N°2, Règlement
 * 04/2020 UEMOA) : classe mineure/majeure + pièces exigées + exigences générales + regroupement.
 * La COMPOSITION d'une demande se fait dans le **CTD Workspace** (activité Variation → arbre Module 1
 * + lettre au nœud 1.1.1 + tableau comparatif au nœud 1.4.1) et dans la **Bibliothèque** (carte
 * « Lettre de variation »).
 */
export function VariationsPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClassFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string>('1')

  const list = useMemo<{ key: string; v: Variation }[]>(() => {
    const all = [
      ...VARIATIONS.map((v) => ({ key: String(v.n), v })),
      { key: 'autre', v: VARIATION_FALLBACK },
    ]
    const q = query.trim().toLowerCase()
    return all.filter(({ v }) => {
      if (filter !== 'all' && v.class !== filter) return false
      if (!q) return true
      return (
        (v.n ? String(v.n) : '') === q ||
        (v.nature.fr + ' ' + v.nature.en).toLowerCase().includes(q)
      )
    })
  }, [query, filter])

  const selected = list.find((e) => e.key === selectedKey)?.v ?? list[0]?.v ?? VARIATIONS[0]

  const filters: { key: ClassFilter; label: string; count: number }[] = [
    { key: 'all', label: t({ fr: 'Toutes', en: 'All' }), count: VARIATION_COUNTS.total },
    { key: 'mineure', label: t({ fr: 'Mineures', en: 'Minor' }), count: VARIATION_COUNTS.mineure },
    { key: 'majeure', label: t({ fr: 'Majeures', en: 'Major' }), count: VARIATION_COUNTS.majeure },
  ]

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <h1 className="text-xl font-semibold">{t({ fr: 'Variations', en: 'Variations' })}</h1>
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Encyclopédie des 42 variations : classement mineure/majeure et pièces exigées (Annexe N°2, Règlement 04/2020 UEMOA). Composez une demande dans le CTD Workspace (activité Variation) ou la Bibliothèque (« Lettre de variation »).',
            en: 'Encyclopedia of the 42 variations: minor/major classification and required documents (Annex No. 2, UEMOA Regulation 04/2020). Compose a request in the CTD Workspace (Variation activity) or the Library (“Variation Letter”).',
          })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t({ fr: 'Rechercher une variation…', en: 'Search a variation…' })}
            className="pl-8"
            aria-label={t({ fr: 'Rechercher', en: 'Search' })}
          />
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t({ fr: 'Classe', en: 'Class' })}
        >
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                filter === f.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent text-foreground',
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col gap-2">
          {list.map(({ key, v }) => {
            const active = selected === v
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                aria-pressed={active}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 text-left transition',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/50 hover:bg-accent/40',
                  !v.n && 'border-dashed',
                )}
              >
                <span className="bg-muted text-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold">
                  {v.n ?? '+'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">{t(v.nature)}</span>
                  <ClassBadge value={v.class} className="mt-1" t={t} />
                </span>
              </button>
            )
          })}
          {list.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t({ fr: 'Aucune variation ne correspond.', en: 'No variation matches.' })}
            </p>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          {selected ? <Detail v={selected} /> : null}
        </div>
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <InfoCard title={t({ fr: 'Exigences générales', en: 'General requirements' })}>
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            {GENERAL_REQUIREMENTS.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{t(r)}</span>
              </li>
            ))}
          </ul>
          <p className="text-foreground/80 mt-3 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs">
            {t(PRIOR_APPROVAL_NOTE)}
          </p>
        </InfoCard>
        <InfoCard title={t({ fr: 'Regroupement de variations', en: 'Grouping of variations' })}>
          <ol className="text-muted-foreground space-y-1.5 text-sm">
            {GROUPING_RULES.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground/70 mt-px tabular-nums">{i + 1}.</span>
                <span>{t(r)}</span>
              </li>
            ))}
          </ol>
          <p className="bg-muted text-foreground/80 mt-3 rounded-md px-2.5 py-2 text-xs font-medium">
            {t(GROUPING_FEE_NOTE)}
          </p>
        </InfoCard>
      </div>
    </div>
  )
}

function Detail({ v }: { v: Variation }) {
  const { t } = useI18n()
  const needsModule1 = v.pieces.includes('module1')
  const needsTable = v.pieces.includes('tableauComparatif')
  return (
    <div className="bg-card rounded-2xl border p-5">
      <div className="flex items-center gap-2">
        {v.n ? (
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
            {v.n}
          </span>
        ) : (
          <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <ClipboardList className="size-4" />
          </span>
        )}
        <ClassBadge value={v.class} t={t} />
      </div>

      <h2 className="mt-3 text-base leading-snug font-medium">{t(v.nature)}</h2>

      {v.note ? (
        <p className="text-foreground/80 mt-3 flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs">
          <Info className="mt-px size-3.5 shrink-0 text-amber-600" />
          <span>{t(v.note)}</span>
        </p>
      ) : null}

      <div className="mt-4">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t({ fr: 'Pièces à fournir', en: 'Documents to provide' })}
        </h3>
        <ul className="mt-2 space-y-1.5">
          {v.pieces.map((p) => (
            <li key={p} className="flex items-center gap-2.5 text-sm">
              <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-md">
                <FileText className="size-3.5" />
              </span>
              <span>{t(PIECE_LABEL[p])}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {needsModule1 ? (
          <Tag tone="primary">{t({ fr: 'Module 1 requis', en: 'Module 1 required' })}</Tag>
        ) : (
          <Tag tone="muted">{t({ fr: 'Sans Module 1', en: 'No Module 1' })}</Tag>
        )}
        {needsTable ? (
          <Tag tone="muted">
            {t({ fr: 'Tableau comparatif requis', en: 'Comparison table required' })}
          </Tag>
        ) : null}
      </div>

      <p className="text-muted-foreground/80 mt-4 border-t pt-3 text-xs">
        {t({
          fr: 'Composez la demande dans le CTD Workspace (activité Variation) ou via la Bibliothèque (« Lettre de variation »).',
          en: 'Compose the request in the CTD Workspace (Variation activity) or via the Library (“Variation Letter”).',
        })}
      </p>
    </div>
  )
}

function ClassBadge({
  value,
  className,
  t,
}: {
  value: VariationClass
  className?: string
  t: (v: { fr: string; en: string }) => string
}) {
  const major = value === 'majeure'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        major
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        className,
      )}
    >
      {major ? t({ fr: 'Majeure', en: 'Major' }) : t({ fr: 'Mineure', en: 'Minor' })}
    </span>
  )
}

function Tag({ tone, children }: { tone: 'primary' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
        tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}
