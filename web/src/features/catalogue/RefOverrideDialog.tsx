import { useState } from 'react'
import { PencilLine, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useIsOrgAdmin } from '@/features/org/use-current-org'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { reportError } from '@/lib/sentry'
import { OVERRIDE_LABEL, removeOverride, setOverride, type OverridePath } from './ref-overrides'

/**
 * « Adapter à mon organisation » (P4.3) — la seconde moitié du contrat : la donnée officielle se
 * propose, la donnée LOCALE se respecte. On n'adapte QUE le destinataire, ses coordonnées et une
 * note interne : les montants officiels ne sont pas adaptables (décision CEO), et ce n'est pas
 * l'UI qui le garantit mais la contrainte serveur `org_ref_overrides_path_chk` (0077).
 *
 * Réservé à l'ADMIN d'org (même règle que l'adoption : ceci engage les courriers de l'organisation).
 * Chaque champ affiche la valeur OFFICIELLE en repère et un bouton « revenir à l'officiel ».
 */

/** Un champ du formulaire : valeur locale actuelle (ou '' ) + valeur officielle de référence. */
export interface OverrideField {
  path: OverridePath
  official: string
  local: string
  adapted: boolean
}

const SEXE_OPTIONS: { value: string; label: Translatable }[] = [
  { value: 'M', label: { fr: 'Monsieur le Directeur Général', en: 'Mr (Director General)' } },
  { value: 'F', label: { fr: 'Madame la Directrice Générale', en: 'Ms (Director General)' } },
]

export function RefOverrideDialog({
  country,
  orgId,
  fields,
  onDone,
}: {
  country: string
  orgId: string
  fields: OverrideField[]
  onDone: () => void
}) {
  const { t } = useI18n()
  const isAdmin = useIsOrgAdmin()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  /** Valeurs telles qu'elles étaient à L'OUVERTURE — base de comparaison de l'enregistrement. */
  const [seeded, setSeeded] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // Un non-admin ne voit pas le bouton : l'écriture serait refusée par la RLS (rejet PERMANENT
  // drainé + Sentry), donc mieux vaut ne rien promettre.
  if (!isAdmin) return null

  const start = () => {
    const initial = Object.fromEntries(fields.map((f) => [f.path, f.local]))
    setDraft(initial)
    setSeeded(initial)
    setOpen(true)
  }

  const save = async () => {
    setBusy(true)
    try {
      for (const f of fields) {
        const next = (draft[f.path] ?? '').trim()
        // Comparaison à la valeur SEMÉE à l'ouverture, pas au `fields` courant : celui-ci est
        // rafraîchi par la live-query, donc comparer à lui ferait ré-écrire une valeur périmée
        // par-dessus l'édition d'un autre admin arrivée entre-temps (garde « dirty », cf. #402).
        if (next === (seeded[f.path] ?? '').trim()) continue
        if (next === '') await removeOverride(orgId, country, f.path)
        else await setOverride(orgId, country, f.path, next)
      }
      toast.success(
        t({
          fr: 'Adaptations enregistrées — une publication ultérieure ne les écrasera pas.',
          en: 'Local values saved — a future publication will not overwrite them.',
        }),
      )
      setOpen(false)
      onDone()
    } catch (error) {
      reportError(error, { op: 'refOverride.save', country })
      toast.error(t({ fr: "L'enregistrement a échoué.", en: 'Save failed.' }))
    } finally {
      setBusy(false)
    }
  }

  const resetOne = (path: OverridePath) => setDraft((d) => ({ ...d, [path]: '' })) // vide = retour à la valeur officielle

  return (
    <>
      <Button variant="outline" size="sm" onClick={start}>
        <PencilLine /> {t({ fr: 'Adapter à mon organisation', en: 'Adapt to my organisation' })}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && !busy && setOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t({ fr: 'Adapter à mon organisation', en: 'Adapt to my organisation' })}
            </DialogTitle>
            <DialogDescription>
              {t({
                fr: 'Vos valeurs remplacent les valeurs officielles pour VOTRE organisation seule, et survivent aux mises à jour du référentiel. Laissez un champ vide pour revenir à la valeur officielle.',
                en: 'Your values replace the official ones for YOUR organisation only, and survive reference-data updates. Leave a field empty to revert to the official value.',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {fields.map((f) => (
              <label key={f.path} className="block">
                <span className="text-muted-foreground mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase">
                  {t(OVERRIDE_LABEL[f.path])}
                  {(draft[f.path] ?? '').trim() !== '' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] normal-case"
                      onClick={() => resetOne(f.path)}
                    >
                      <RotateCcw className="size-3" />
                      {t({ fr: 'valeur officielle', en: 'official value' })}
                    </Button>
                  ) : null}
                </span>
                {f.path === 'agency.sexe' ? (
                  <NativeSelect
                    value={draft[f.path] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
                  >
                    <option value="">
                      {t({ fr: '— valeur officielle —', en: '— official value —' })}
                    </option>
                    {SEXE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.label)}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    value={draft[f.path] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
                    placeholder={f.official || t({ fr: 'non renseigné', en: 'not set' })}
                  />
                )}
                {f.official ? (
                  <span className="text-muted-foreground mt-1 block text-[11px]">
                    {t({ fr: 'Officiel : ', en: 'Official: ' })}
                    {/* La civilité se lit, elle ne s'affiche pas en code brut (« M »). */}
                    {f.path === 'agency.sexe'
                      ? t(
                          SEXE_OPTIONS.find((o) => o.value === f.official)?.label ?? {
                            fr: f.official,
                            en: f.official,
                          },
                        )
                      : f.official}
                  </span>
                ) : null}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t({ fr: 'Annuler', en: 'Cancel' })}
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy
                ? t({ fr: 'Enregistrement…', en: 'Saving…' })
                : t({ fr: 'Enregistrer', en: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
