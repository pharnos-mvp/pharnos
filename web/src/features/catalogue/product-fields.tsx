import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PghtCurrency, PghtEntry } from '@/lib/db'
import { eurStringToFcfa, parseAmount } from '@/lib/money'
import { useI18n } from '@/lib/i18n-context'
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import { AUTRE_FORME, isKnownForm, PHARMA_FORMS } from './pharma-forms'

/** Style d'un `<select>` natif — aligné sur les autres sélecteurs du catalogue (cf. DocTypeCards). */
export const SELECT_CLASS =
  'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]'

/**
 * Champ « Forme pharmaceutique » : liste déroulante des formes courantes + option « Autre » en fin.
 * Choisir « Autre » (ou éditer un produit dont la forme est hors catalogue) bascule le champ en
 * SAISIE LIBRE in-place, sans champ séparé. La valeur (forme choisie OU texte libre) part telle
 * quelle dans `product.forme` — déjà propagée aux lettres cover/PGHT.
 */
export function FormeControl({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { t } = useI18n()
  // Saisie libre si la valeur existante n'est pas une forme du catalogue (produit « Autre » édité).
  // NB : état initialisé UNE fois → suppose un remontage par produit (ProductForm est monté
  // `key={p.id}` ; le wizard est neuf à chaque création). Ne pas retirer ces clés sans revoir ceci.
  const [freeText, setFreeText] = useState(() => value !== '' && !isKnownForm(value))

  if (freeText) {
    return (
      <div className="space-y-1.5">
        <Input
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          onClick={() => {
            setFreeText(false)
            onChange('')
          }}
        >
          {t({ fr: '← Choisir dans la liste', en: '← Pick from the list' })}
        </button>
      </div>
    )
  }

  return (
    <select
      className={SELECT_CLASS}
      // Valeur inconnue (rare, ex. donnée héritée) → on retombe sur « Sélectionner… ».
      value={isKnownForm(value) ? value : ''}
      onChange={(e) => {
        const v = e.target.value
        if (v === AUTRE_FORME) {
          setFreeText(true)
          onChange('')
        } else {
          onChange(v)
        }
      }}
    >
      <option value="">{t({ fr: 'Sélectionner…', en: 'Select…' })}</option>
      {PHARMA_FORMS.map((f) => (
        <option key={f.value} value={f.value}>
          {t(f.label)}
        </option>
      ))}
      <option value={AUTRE_FORME}>{t({ fr: 'Autre (préciser)', en: 'Other (specify)' })}</option>
    </select>
  )
}

/**
 * Champ « PGHT » (Prix Grossiste Hors Taxe) — table de prix multi-pays : une ligne = Pays + Devise +
 * Montant, bouton « + » pour en ajouter. Devise en euros → conversion FCFA affichée à côté (parité
 * fixe BCEAO). Composant CONTRÔLÉ (value/onChange) branché sur react-hook-form via un `FormField`.
 */
export function PghtField({
  value,
  onChange,
}: {
  value: PghtEntry[]
  onChange: (v: PghtEntry[]) => void
}) {
  const { t, lang } = useI18n()
  // Un pays déjà choisi est désactivé dans les autres lignes : pas de doublon (sinon la lettre PGHT
  // — mono-pays, premier match — pourrait émettre un prix erroné sur un document réglementaire).
  const usedCountries = new Set(value.map((r) => r.country).filter(Boolean))

  const update = (i: number, patch: Partial<PghtEntry>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const add = () => onChange([...value, { country: '', currency: 'XOF', amount: '' }])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">
          {t({ fr: 'Prix Grossiste Hors Taxe (PGHT)', en: 'Wholesale price excl. tax (PGHT)' })}
        </p>
        <p className="text-muted-foreground text-xs">
          {t({
            fr: 'Un prix par pays. Saisi en euros → conversion FCFA automatique (parité fixe BCEAO).',
            en: 'One price per country. Entered in euros → automatic FCFA conversion (fixed BCEAO parity).',
          })}
        </p>
      </div>

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((row, i) => {
            const fcfa = row.currency === 'EUR' ? eurStringToFcfa(row.amount, lang) : ''
            const amountInvalid = row.amount.trim() !== '' && parseAmount(row.amount) === null
            return (
              <li
                key={i}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)_auto] sm:items-center"
              >
                <select
                  className={SELECT_CLASS}
                  value={row.country}
                  aria-label={t({ fr: 'Pays', en: 'Country' })}
                  onChange={(e) => update(i, { country: e.target.value })}
                >
                  <option value="">{t({ fr: 'Pays…', en: 'Country…' })}</option>
                  {COUNTRIES.map((c) => (
                    <option
                      key={c.code}
                      value={c.code}
                      disabled={c.code !== row.country && usedCountries.has(c.code)}
                    >
                      {countryLabel(c.code, lang)}
                    </option>
                  ))}
                </select>

                <select
                  className={SELECT_CLASS + ' sm:w-24'}
                  value={row.currency}
                  aria-label={t({ fr: 'Devise', en: 'Currency' })}
                  onChange={(e) => update(i, { currency: e.target.value as PghtCurrency })}
                >
                  <option value="XOF">FCFA</option>
                  <option value="EUR">Euro</option>
                </select>

                <div className="flex items-center gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder={t({ fr: 'Montant', en: 'Amount' })}
                    value={row.amount}
                    aria-label={t({ fr: 'Montant', en: 'Amount' })}
                    onChange={(e) => update(i, { amount: e.target.value })}
                  />
                  {amountInvalid ? (
                    <span className="text-destructive text-xs whitespace-nowrap">
                      {t({ fr: 'Montant invalide', en: 'Invalid amount' })}
                    </span>
                  ) : row.currency === 'EUR' && fcfa ? (
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      = {fcfa} FCFA
                    </span>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t({ fr: 'Retirer la ligne', en: 'Remove row' })}
                  onClick={() => remove(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus /> {t({ fr: 'Ajouter un pays', en: 'Add a country' })}
      </Button>
    </div>
  )
}
