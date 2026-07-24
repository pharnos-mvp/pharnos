import { type ComponentProps, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useOrgId } from '@/features/org/org-context'
import type { PghtCurrency, PghtEntry, PartyRole } from '@/lib/db'
import { eurStringToFcfa, parseAmount } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import { listParties } from './parties-repository'
import { AUTRE_FORME, isKnownForm, PHARMA_FORMS } from './pharma-forms'
import type { ProductFormValues, ProductInput } from './types'

/**
 * Classe d'un `<select>` — CALQUÉE sur le trigger du DS `Select` (bordure + fond + focus identiques)
 * pour que les sélecteurs se voient comme les autres champs. `appearance-none` retire le chevron
 * natif (peu visible / non thématisable) ; on en repose un clair via `NativeSelect` (`pr-9` = sa place).
 */
export const SELECT_CLASS =
  'border-input dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full appearance-none rounded-md border bg-transparent px-3 pr-9 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50'

/** `<select>` natif habillé DS + chevron visible (léger, sans le coût bundle de Radix Select). */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select className={cn(SELECT_CLASS, className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-60"
        aria-hidden
      />
    </div>
  )
}

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
  // `FormControl` (Radix Slot) injecte id / aria-describedby / aria-invalid sur cet élément : on les
  // FORWARD au vrai contrôle (select ou input) → le label reste cliquable et les erreurs liées.
  id,
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const { t } = useI18n()
  // Saisie libre si la valeur existante n'est pas une forme du catalogue (produit « Autre » édité).
  // NB : état initialisé UNE fois → suppose un remontage par produit (ProductForm est monté
  // `key={p.id}` ; le wizard est neuf à chaque création). Ne pas retirer ces clés sans revoir ceci.
  const [freeText, setFreeText] = useState(() => value !== '' && !isKnownForm(value))
  const a11y = { id, 'aria-describedby': ariaDescribedby, 'aria-invalid': ariaInvalid }

  if (freeText) {
    return (
      <div className="space-y-1.5">
        <Input
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...a11y}
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
    <NativeSelect
      {...a11y}
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
    </NativeSelect>
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
                className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.3fr)_auto] sm:items-center"
              >
                <NativeSelect
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
                </NativeSelect>

                <NativeSelect
                  value={row.currency}
                  aria-label={t({ fr: 'Devise', en: 'Currency' })}
                  onChange={(e) => update(i, { currency: e.target.value as PghtCurrency })}
                >
                  <option value="XOF">FCFA</option>
                  <option value="EUR">Euro</option>
                </NativeSelect>

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

/** Valeur sentinelle de l'option « Nouveau… » (caractère de contrôle → jamais un vrai nom d'org). */
const NEW_PARTY = ' new'

/**
 * Bloc apparié Titulaire d'AMM / Fabricant (nom + adresse) — PARTAGÉ par le wizard de création et le
 * cockpit d'édition pour que la session Identification soit identique des deux côtés.
 *
 * « CHOISIR OU CRÉER » : dès qu'une org du même rôle est déjà enregistrée, un sélecteur la propose
 * (0 ressaisie, 0 doublon par faute de frappe) ; « ＋ Nouveau » bascule en saisie libre. Aucune org
 * de ce rôle → saisie directe (comportement historique). L'org choisie remplit nom + adresse ; ces
 * champs restent la source consommée par le CTD/les lettres (`productToLetterFields`), donc le
 * pipeline de dérivation des parties (`deriveProductLinks`) est inchangé.
 */
export function OrgBlock({
  form,
  title,
  nameField,
  addressField,
}: {
  form: UseFormReturn<ProductInput, unknown, ProductFormValues>
  title: string
  nameField: 'titulaire' | 'fabricant'
  addressField: 'titulaireAdresse' | 'fabricantAdresse'
}) {
  const { t } = useI18n()
  const orgId = useOrgId()
  const role: PartyRole = nameField // 'titulaire' | 'fabricant' = rôle homonyme
  const parties = useLiveQuery(
    () => listParties(orgId).then((ps) => ps.filter((p) => p.roles.includes(role))),
    [orgId, role],
  )
  const name = (form.watch(nameField) ?? '') as string
  const hasParties = (parties?.length ?? 0) > 0
  const selected = parties?.find((p) => p.nom === name)
  const known = !!selected
  const [forcedNew, setForcedNew] = useState(false)
  // Saisie libre si : l'utilisateur a cliqué « Nouveau », OU aucune org de ce rôle n'existe, OU le
  // nom déjà saisi n'est PAS une org connue (édition d'un produit ancien, avant les parties).
  const creating = forcedNew || !hasParties || (!!name && parties !== undefined && !known)

  function pick(partyName: string) {
    const p = parties?.find((x) => x.nom === partyName)
    form.setValue(nameField, partyName, { shouldValidate: true, shouldDirty: true })
    if (p) form.setValue(addressField, p.adresse, { shouldDirty: true })
    setForcedNew(false)
  }
  function startNew() {
    form.setValue(nameField, '', { shouldValidate: true, shouldDirty: true })
    form.setValue(addressField, '', { shouldDirty: true })
    setForcedNew(true)
  }
  function backToPick() {
    // Le nom courant n'est pas une org connue → on le vide pour repartir du sélecteur.
    if (!known) form.setValue(nameField, '', { shouldValidate: true, shouldDirty: true })
    setForcedNew(false)
  }

  return (
    <Card className="gap-4 p-5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>

      {hasParties && !creating ? (
        // Sélecteur d'org existante (+ « Nouveau »). Le nom reste porté par le champ de formulaire.
        <FormField
          control={form.control}
          name={nameField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t({ fr: 'Nom', en: 'Name' })}</FormLabel>
              <FormControl>
                <NativeSelect
                  value={known ? (field.value ?? '') : ''}
                  aria-label={title}
                  onChange={(e) =>
                    e.target.value === NEW_PARTY ? startNew() : pick(e.target.value)
                  }
                >
                  <option value="">{t({ fr: 'Choisir…', en: 'Choose…' })}</option>
                  {parties!.map((p) => (
                    <option key={p.id} value={p.nom}>
                      {p.nom}
                    </option>
                  ))}
                  <option value={NEW_PARTY}>＋ {t({ fr: 'Nouveau', en: 'New' })}</option>
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={form.control}
          name={nameField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t({ fr: 'Nom', en: 'Name' })}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {known && !creating ? (
        // Org choisie : adresse en lecture (modifiable sur la fiche organisation).
        <div className="space-y-1">
          <FormLabel>{t({ fr: 'Adresse', en: 'Address' })}</FormLabel>
          <p className="text-muted-foreground text-sm break-words">{selected?.adresse || '—'}</p>
          <button type="button" onClick={startNew} className="text-info text-xs hover:underline">
            {t({ fr: 'Saisir une autre organisation', en: 'Enter another organization' })}
          </button>
        </div>
      ) : (
        <FormField
          control={form.control}
          name={addressField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t({ fr: 'Adresse', en: 'Address' })}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {creating && hasParties ? (
        <button
          type="button"
          onClick={backToPick}
          className="text-info self-start text-xs hover:underline"
        >
          ← {t({ fr: 'Choisir une organisation existante', en: 'Choose an existing organization' })}
        </button>
      ) : null}
    </Card>
  )
}
