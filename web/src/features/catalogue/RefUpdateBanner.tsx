import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ScrollText } from 'lucide-react'
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
import { StatusBadge } from '@/components/ui/status-badge'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { useIsOrgAdmin } from '@/features/org/use-current-org'
import { useOrgId } from '@/features/org/org-context'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { reportError } from '@/lib/sentry'
import { useI18n } from '@/lib/i18n-context'
import { pendingRefUpdate } from './ref-state'
import { refUpdatePreview } from './ref-diff'
import { adoptRefVersion } from './ref-repository'

/**
 * Bannière « une mise à jour du référentiel est disponible » + dialog de CONSENTEMENT (P4.2).
 *
 * Modèle du briefing SaaS : le contenu officiel se PROPOSE (publication globale, 0071), l'org
 * l'APPLIQUE par une adoption explicite et tracée (0072). La bannière ne s'affiche donc jamais
 * comme un fait accompli, et seul l'**Administrateur** peut adopter (décision CEO) — les autres
 * membres voient la mise à jour et son détail, sans bouton.
 *
 * `country` cible la bannière sur une fiche Autorité (une mise à jour Togo n'alerte pas la fiche
 * Sénégal) ; sans `country`, la bannière couvre toute mise à jour en attente.
 */
export function RefUpdateBanner({ country }: { country?: string }) {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const isAdmin = useIsOrgAdmin()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const pending = useLiveQuery(() => pendingRefUpdate(orgId, country), [orgId, country])
  const preview = useLiveQuery(
    () =>
      open && pending ? refUpdatePreview(orgId, pending.target.id, lang) : Promise.resolve(null),
    [open, orgId, pending?.target.id, lang],
  )

  if (!pending) return null
  const { target, countries } = pending

  const adopt = async () => {
    setBusy(true)
    try {
      await adoptRefVersion(orgId, target.id)
      toast.success(
        t({
          fr: `Référentiel ${target.label} adopté pour votre organisation.`,
          en: `Reference data ${target.label} adopted for your organisation.`,
        }),
      )
      setOpen(false)
    } catch (error) {
      reportError(error, { op: 'adopt', entity: 'ref_version' })
      toast.error(
        t({
          fr: "L'adoption a échoué — vérifiez votre connexion, puis réessayez.",
          en: 'Adoption failed — check your connection, then try again.',
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="bg-info-subtle border-info/40 flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <span
          aria-hidden
          className="bg-info/15 text-info-subtle-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
        >
          <ScrollText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-info-subtle-foreground text-sm font-semibold">
            {t({
              fr: `Mise à jour du référentiel disponible — ${target.label}`,
              en: `Reference data update available — ${target.label}`,
            })}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {target.releaseNote ||
              t({
                fr: 'Le contenu réglementaire officiel a évolué.',
                en: 'The official regulatory content has changed.',
              })}
            {!isAdmin
              ? t({
                  fr: " — l'adoption est réservée à l'administrateur de l'organisation.",
                  en: ' — adoption is reserved to the organisation administrator.',
                })
              : ''}
          </p>
          {!country && countries.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {countries.map((c) => (
                <StatusBadge key={c} tone="neutral">
                  <CountryFlag code={c} size={12} />
                  {countryLabel(c, lang)}
                </StatusBadge>
              ))}
            </div>
          ) : null}
        </div>
        <Button size="sm" variant={isAdmin ? 'default' : 'outline'} onClick={() => setOpen(true)}>
          {isAdmin
            ? t({ fr: 'Examiner', en: 'Review' })
            : t({ fr: 'Voir les changements', en: 'View changes' })}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t({
                fr: `Mise à jour ${target.label}`,
                en: `Update ${target.label}`,
              })}
            </DialogTitle>
            <DialogDescription>
              {target.effectiveDate
                ? t({
                    fr: `Prend effet au ${target.effectiveDate}`,
                    en: `Effective from ${target.effectiveDate}`,
                  })
                : t({ fr: 'Effet immédiat après adoption', en: 'Effective once adopted' })}
              {preview?.ceilingLabel
                ? t({
                    fr: ` · version appliquée aujourd’hui : ${preview.ceilingLabel}`,
                    en: ` · currently applied version: ${preview.ceilingLabel}`,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          {/* Sources officielles : la confiance vient de la citation du texte, pas du montant. */}
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

          {/* Diff avant/après */}
          {preview === undefined ? (
            <p className="text-muted-foreground text-sm">
              {t({ fr: 'Calcul…', en: 'Computing…' })}
            </p>
          ) : preview && preview.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-left text-[11px] tracking-wide uppercase">
                    <th className="py-1.5 pr-3 font-semibold">{t({ fr: 'Champ', en: 'Field' })}</th>
                    <th className="py-1.5 pr-3 font-semibold">
                      {t({ fr: 'Avant', en: 'Before' })}
                    </th>
                    <th className="py-1.5 font-semibold">{t({ fr: 'Après', en: 'After' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-border border-b align-top">
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1.5">
                          <CountryFlag code={r.country} size={12} />
                          {t(r.field)}
                        </span>
                      </td>
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
          ) : (
            <p className="text-muted-foreground text-sm">
              {t({
                fr: 'Cette version ne modifie aucune valeur que vous affichez aujourd’hui.',
                en: 'This version changes none of the values you currently display.',
              })}
            </p>
          )}

          {/* Garanties — ce que l'adoption ne fait PAS (le cœur de la confiance) */}
          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>
              {t({
                fr: '✔ Vos dossiers existants restent épinglés sur leur version — aucun n’est modifié.',
                en: '✔ Your existing submissions stay pinned to their version — none is modified.',
              })}
            </li>
            <li>
              {t({
                fr: '✔ Les nouveaux dossiers utiliseront cette version.',
                en: '✔ New submissions will use this version.',
              })}
            </li>
            <li>
              {t({
                fr: '✔ L’adoption est journalisée (qui, quand, quelle version) — traçabilité d’audit.',
                en: '✔ Adoption is logged (who, when, which version) — audit traceability.',
              })}
            </li>
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {isAdmin ? t({ fr: 'Plus tard', en: 'Later' }) : t({ fr: 'Fermer', en: 'Close' })}
            </Button>
            {isAdmin ? (
              <Button onClick={adopt} disabled={busy}>
                {busy
                  ? t({ fr: 'Adoption…', en: 'Adopting…' })
                  : t({
                      fr: `Adopter ${target.label} pour mon organisation`,
                      en: `Adopt ${target.label} for my organisation`,
                    })}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
