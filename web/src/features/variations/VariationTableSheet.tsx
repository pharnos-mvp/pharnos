import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { ProductRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { seedVariationItems, type VariationItem } from './variation-request'

/**
 * Popup (Sheet) de remplissage du **tableau comparatif** ouverte juste après le choix des natures, à
 * la création d'un dossier de variation. Lignes = variations cochées (« ancien » prérempli depuis la
 * fiche produit) ; l'utilisateur saisit le « nouveau » et, optionnellement, la justification (colonne
 * masquée sur le document final si vide). « Valider » remonte les items au formulaire de création.
 */
export function VariationTableSheet({
  open,
  onOpenChange,
  refs,
  product,
  initialItems,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  refs: number[]
  product?: ProductRecord
  initialItems?: VariationItem[]
  onSave: (items: VariationItem[]) => void
}) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-2xl flex-col gap-3 overflow-y-auto">
        <SheetHeader className="px-0">
          <SheetTitle>{t({ fr: 'Tableau comparatif', en: 'Comparison table' })}</SheetTitle>
        </SheetHeader>
        {open ? (
          <Body
            refs={refs}
            product={product}
            initialItems={initialItems}
            onSave={(items) => {
              onSave(items)
              onOpenChange(false)
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function Body({
  refs,
  product,
  initialItems,
  onSave,
}: {
  refs: number[]
  product?: ProductRecord
  initialItems?: VariationItem[]
  onSave: (items: VariationItem[]) => void
}) {
  const { t } = useI18n()
  // Amorce depuis les natures cochées (ancien prérempli), en préservant les saisies déjà faites.
  const [items, setItems] = useState<VariationItem[]>(() =>
    seedVariationItems(refs, product, initialItems),
  )
  const setItem = (i: number, patch: Partial<VariationItem>) =>
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  if (refs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Cochez d’abord une ou plusieurs variations.',
          en: 'Tick one or more variations first.',
        })}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        {t({
          fr: 'Renseignez l’ancien et le nouveau pour chaque variation. La justification est optionnelle (colonne masquée sur le document si vide).',
          en: 'Fill the old and new values for each variation. Justification is optional (column hidden in the document if empty).',
        })}
      </p>
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border p-3">
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
      <Button className="self-end" onClick={() => onSave(items)}>
        {t({ fr: 'Valider le tableau', en: 'Save table' })}
      </Button>
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
