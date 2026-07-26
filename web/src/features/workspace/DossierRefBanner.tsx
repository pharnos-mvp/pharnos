import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pin } from 'lucide-react'
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
import type { DossierRefStatus } from '@/features/catalogue/ref-state'
import {
  refUpdatePreview,
  structureRowLabel,
  structureRowsFor,
} from '@/features/catalogue/ref-diff'
import { reportError } from '@/lib/sentry'
import { useI18n } from '@/lib/i18n-context'
import type { DossierRecord } from '@/lib/db'
import { switchDossierRefVersion } from './dossier-repository'

/**
 * Bannière « ce dossier est épinglé sur la version X » de la Roadmap (P4.2b).
 *
 * Un dossier déposé est une **photographie opposable** : il garde le barème et les exigences de la
 * version sous laquelle il a été monté (exigence d'audit GxP). Quand l'org adopte plus récent, on
 * l'ANNONCE sans rien changer — la bascule est une action volontaire, confirmée sur un diff, et
 * tracée à l'audit (« référentiel vX → vY »).
 *
 * Ne s'affiche que si l'org applique une version plus récente ; sinon la Roadmap reste muette
 * (aucun bruit quand tout est aligné, cas nominal).
 */
export function DossierRefBanner({
  dossier,
  status,
  canEdit,
}: {
  dossier: DossierRecord
  status: DossierRefStatus
  canEdit: boolean
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const applied = status.applied

  const preview = useLiveQuery(
    () =>
      open && applied
        ? refUpdatePreview(dossier.orgId, applied.id, lang, {
            fromVersionId: dossier.refVersionId ?? null,
            country: dossier.country,
          })
        : Promise.resolve(null),
    [open, applied?.id, dossier.orgId, dossier.refVersionId, dossier.country, lang],
  )

  // Version épinglée INTROUVABLE localement (hors-ligne avant le 1er pull, version retirée, cap de
  // pull) : la Roadmap sert les valeurs de référence par défaut → on le DIT, et on ne propose
  // aucune bascule (on ne sait pas de quoi on partirait).
  if (status.pinnedMissing) {
    return (
      <div className="bg-muted border-border flex flex-wrap items-center gap-3 rounded-xl border p-3">
        <span
          aria-hidden
          className="bg-background text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg"
        >
          <Pin className="size-4" />
        </span>
        <p className="text-muted-foreground min-w-0 flex-1 text-xs">
          {t({
            fr: 'Le référentiel réglementaire de ce dossier n’est pas disponible sur cet appareil (hors-ligne, ou version retirée) : les montants et exigences affichés sont ceux du référentiel par défaut.',
            en: 'This submission’s reference data is unavailable on this device (offline, or version withdrawn): the amounts and requirements shown are the default reference ones.',
          })}
        </p>
      </div>
    )
  }

  // Changements de structure qui atteindront CE dossier (M4 : un delta non scopé n'entre pas dans
  // l'arbre de variation). Annoncer les autres promettrait un « mettre à jour » sans effet.
  const structureRows = structureRowsFor(preview?.structure ?? [], dossier.format, dossier.activity)

  if (!status.behind || !applied) return null

  const doSwitch = async () => {
    setBusy(true)
    try {
      const switched = await switchDossierRefVersion(dossier.id, applied.id, {
        from: status.pinnedLabel,
        to: applied.label,
      })
      // No-op (dossier supprimé entre-temps, déjà basculé) → pas de confirmation mensongère.
      toast[switched ? 'success' : 'info'](
        switched
          ? t({
              fr: `Ce dossier suit désormais le référentiel ${applied.label}.`,
              en: `This submission now follows reference data ${applied.label}.`,
            })
          : t({
              fr: 'Aucun changement à appliquer sur ce dossier.',
              en: 'No change to apply to this submission.',
            }),
      )
      setOpen(false)
    } catch (error) {
      reportError(error, { op: 'switch', entity: 'dossier_ref_version' })
      toast.error(t({ fr: 'La bascule a échoué.', en: 'The switch failed.' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="bg-warning-subtle border-warning/40 flex flex-wrap items-center gap-3 rounded-xl border p-3">
        <span
          aria-hidden
          className="bg-warning/15 text-warning-subtle-foreground flex size-8 shrink-0 items-center justify-center rounded-lg"
        >
          <Pin className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-warning-subtle-foreground text-sm font-semibold">
            {t({
              fr: `Dossier épinglé sur le référentiel ${status.pinnedLabel ?? '—'}`,
              en: `Submission pinned to reference data ${status.pinnedLabel ?? '—'}`,
            })}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t({
              fr: `Votre organisation applique ${applied.label}. Rien n’a été modifié : la mise à jour d’un dossier est une action volontaire et tracée.`,
              en: `Your organisation applies ${applied.label}. Nothing was changed: updating a submission is a deliberate, logged action.`,
            })}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {canEdit
            ? t({ fr: 'Voir / basculer', en: 'Review / switch' })
            : t({ fr: 'Voir les changements', en: 'View changes' })}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t({
                fr: `Basculer ce dossier sous ${applied.label} ?`,
                en: `Switch this submission to ${applied.label}?`,
              })}
            </DialogTitle>
            <DialogDescription>
              {t({
                fr: `Les redevances et exigences de la Roadmap seront recalculées sous ${applied.label}. Vos documents et votre arborescence CTD ne changent pas.`,
                en: `Fees and requirements in the Roadmap will be recomputed under ${applied.label}. Your documents and CTD tree are unchanged.`,
              })}
            </DialogDescription>
          </DialogHeader>

          {preview?.sources.length ? (
            <div className="bg-info-subtle border-info/30 space-y-1 rounded-xl border p-3 text-sm">
              <p className="text-info-subtle-foreground text-xs font-semibold tracking-wide uppercase">
                {t({ fr: 'Source officielle', en: 'Official source' })}
              </p>
              {preview.sources.map((s, i) => (
                <p key={i}>{[s.texte, s.jo, s.complements].filter(Boolean).join(' — ')}</p>
              ))}
            </div>
          ) : null}

          {preview === undefined ? (
            <p className="text-muted-foreground text-sm">
              {t({ fr: 'Calcul…', en: 'Computing…' })}
            </p>
          ) : preview && preview.rows.length > 0 ? (
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="group"
              aria-label={t({ fr: 'Tableau des changements', en: 'Table of changes' })}
            >
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-left text-[11px] tracking-wide uppercase">
                    <th className="py-1.5 pr-3 font-semibold">{t({ fr: 'Champ', en: 'Field' })}</th>
                    <th className="py-1.5 pr-3 font-semibold">
                      {t({ fr: 'Ce dossier', en: 'This submission' })}
                    </th>
                    <th className="py-1.5 font-semibold">
                      {t({ fr: 'Après bascule', en: 'After switch' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-border border-b align-top">
                      <td className="py-2 pr-3">{t(r.field)}</td>
                      <td className="text-danger-subtle-foreground py-2 pr-3 line-through">
                        {r.before || '—'}
                      </td>
                      <td className="text-success-subtle-foreground py-2 font-medium">
                        {r.after || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !structureRows.length ? (
            <p className="text-muted-foreground text-sm">
              {t({
                fr: 'Aucune valeur de ce dossier ne change sous la nouvelle version.',
                en: 'No value of this submission changes under the new version.',
              })}
            </p>
          ) : null}

          {/* La structure du Module 1 peut changer sans qu'aucune VALEUR ne bouge : le dire, sinon
              le message ci-dessus contredirait la bannière « Nouvelle structure disponible ». */}
          {structureRows.length ? (
            <p className="border-info/30 bg-info-subtle/50 rounded-lg border p-2.5 text-xs">
              <span className="font-semibold">
                {t({ fr: 'Structure du Module 1 : ', en: 'Module 1 structure: ' })}
              </span>
              {structureRows.map((s) => `${s.number} ${structureRowLabel(s, t)}`).join(' · ')}
              <span className="text-muted-foreground block">
                {t({
                  fr: 'Rien ne s’applique tant que vous ne mettez pas à jour la structure de ce dossier — et aucun document déposé n’est jamais supprimé.',
                  en: 'Nothing applies until you update this submission’s structure — and no uploaded document is ever deleted.',
                })}
              </span>
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {canEdit
                ? t({ fr: 'Garder l’épinglage', en: 'Keep pinned' })
                : t({ fr: 'Fermer', en: 'Close' })}
            </Button>
            {canEdit ? (
              <Button onClick={doSwitch} disabled={busy}>
                {busy
                  ? t({ fr: 'Bascule…', en: 'Switching…' })
                  : t({ fr: `Basculer sous ${applied.label}`, en: `Switch to ${applied.label}` })}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
