import { useState } from 'react'
import { FilePlus2, MinusCircle, PenLine, ShieldCheck } from 'lucide-react'

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
import { countryLabel } from './dossier-constants'
import type { RefProvenance } from '@/features/catalogue/ref-content'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { chosenCount, defaultChosen, mergeLineKey, type MergeLine } from './structure-merge'

/**
 * Écran de FUSION de structure (P4.5c, mockup ③ `docs/mockups/ctd-structure-fusion.html`).
 *
 * Le cœur de la confiance du chantier : une exigence nationale a changé, et l'utilisateur décide
 * LIGNE PAR LIGNE de ce qui entre dans SON dossier. Avant cet écran, le bandeau appliquait tout
 * d'un clic sans montrer quoi — sur une donnée opposable, c'était le seul endroit où une
 * approximation n'était pas acceptable.
 *
 * Les garanties affichées ne sont pas décoratives : elles sont calculées par `buildMergePlan`
 * (aucune section porteuse d'un document ou validée n'est proposée au retrait) et appliquées par
 * `applyMergePlan` (rien qui ne soit coché).
 */

const KIND_ICON = {
  add: FilePlus2,
  relabel: PenLine,
  drop: MinusCircle,
  keep: ShieldCheck,
} as const

const KEEP_REASON: Record<'documents' | 'validated', Translatable> = {
  documents: { fr: 'contient des pièces', en: 'holds documents' },
  validated: { fr: 'section validée', en: 'validated section' },
}

export function StructureMergeDialog({
  open,
  onOpenChange,
  plan,
  productName,
  country,
  versionLabel,
  provenance,
  busy,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: MergeLine[]
  productName: string
  country: string
  /** Version du référentiel qui porte cette structure — null si aucune (socle code). */
  versionLabel: string | null
  /** Source officielle citée par l'entrée `ctd_structure` — la raison du changement. */
  provenance?: RefProvenance
  busy: boolean
  onApply: (chosen: Set<string>) => void
}) {
  const { t, lang } = useI18n()
  // Semé AU MONTAGE. Le parent ne monte ce composant que lorsque la boîte s'ouvre : chaque
  // ouverture repart donc du plan courant (une pièce déposée entre-temps est prise en compte), sans
  // effet qui déclencherait un rendu en cascade.
  const [chosen, setChosen] = useState<Set<string>>(() => defaultChosen(plan))

  const toggle = (key: string) =>
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const proposed = plan.filter((l) => l.kind !== 'keep')
  const keeps = plan.filter((l) => l.kind === 'keep')
  const count = chosenCount(plan, chosen)
  const sourceLine = [provenance?.texte, provenance?.jo, provenance?.complements]
    .filter(Boolean)
    .join(' — ')

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>
              {t({ fr: 'Mettre à jour la structure', en: 'Update the structure' })} — {productName}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-normal">
              {/* Le drapeau est décoratif (`aria-hidden`) : le pays doit être ANNONCÉ en texte. */}
              <CountryFlag code={country} size={14} />
              <span>{countryLabel(country, lang)}</span>
            </span>
            {versionLabel ? <StatusBadge tone="info">{versionLabel}</StatusBadge> : null}
          </DialogTitle>
          <DialogDescription>
            {t({
              fr: 'Chaque ligne est un choix. Rien ne s’applique avant votre confirmation, et aucun document déposé n’est jamais supprimé.',
              en: 'Every line is a choice. Nothing applies before you confirm, and no uploaded document is ever deleted.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {proposed.length > 0 ? (
            <section>
              <h3 className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
                {t({ fr: 'À appliquer', en: 'To apply' })} ({proposed.length})
              </h3>
              <ul className="divide-border divide-y">
                {proposed.map((l) => {
                  const key = mergeLineKey(l)
                  const Icon = KIND_ICON[l.kind]
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-start gap-2.5 py-2">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0"
                          checked={chosen.has(key)}
                          onChange={() => toggle(key)}
                          disabled={busy}
                        />
                        <Icon
                          aria-hidden
                          className="text-muted-foreground mt-0.5 size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="font-mono text-xs font-bold">{l.number}</span>{' '}
                          {l.kind === 'relabel' ? (
                            <>
                              <span className="text-muted-foreground line-through">
                                {l.currentLabel}
                              </span>{' '}
                              → <span>{l.label}</span>
                            </>
                          ) : (
                            <span className={l.kind === 'drop' ? 'text-muted-foreground' : ''}>
                              {l.label}
                            </span>
                          )}
                          <span className="text-muted-foreground mt-0.5 block text-xs">
                            {l.kind === 'add'
                              ? t({
                                  fr: `Nouvelle section — arrive vide${
                                    l.childCount ? `, avec ${l.childCount} sous-section(s)` : ''
                                  }`,
                                  en: `New section — arrives empty${
                                    l.childCount ? `, with ${l.childCount} sub-section(s)` : ''
                                  }`,
                                })
                              : l.kind === 'drop'
                                ? t({
                                    fr: 'Plus exigée et vide — retirée de votre plan de montage',
                                    en: 'No longer required and empty — removed from your build plan',
                                  })
                                : t({
                                    fr: 'Intitulé officiel mis à jour',
                                    en: 'Official title updated',
                                  })}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {keeps.length > 0 ? (
            <section>
              <h3 className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
                {t({ fr: 'Plus exigées, mais CONSERVÉES', en: 'No longer required, but KEPT' })} (
                {keeps.length})
              </h3>
              <ul className="border-warning/40 bg-warning-subtle divide-warning/20 divide-y rounded-lg border">
                {keeps.map((l) => (
                  <li key={mergeLineKey(l)} className="flex items-start gap-2.5 p-2.5">
                    <ShieldCheck
                      aria-hidden
                      className="text-warning-subtle-foreground mt-0.5 size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-mono text-xs font-bold">{l.number}</span> {l.label}
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {t({
                          fr: `Pharnos ne supprime jamais votre travail (${t(
                            KEEP_REASON[l.keepReason ?? 'validated'],
                          )}${l.docCount ? ` : ${l.docCount}` : ''}). La section reste en place dans votre dossier ; vous seul pouvez la retirer.`,
                          en: `Pharnos never deletes your work (${t(
                            KEEP_REASON[l.keepReason ?? 'validated'],
                          )}${l.docCount ? `: ${l.docCount}` : ''}). The section stays in your submission; only you can remove it.`,
                        })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {sourceLine ? (
            <p className="text-muted-foreground text-xs">
              <span aria-hidden className="text-info font-semibold">
                §
              </span>{' '}
              <span className="font-semibold">{t({ fr: 'Source', en: 'Source' })} — </span>
              {sourceLine}
            </p>
          ) : null}

          <ul className="text-muted-foreground space-y-0.5 text-xs">
            <li>
              {t({
                fr: '✔ Vos sections validées gardent leur validation.',
                en: '✔ Your validated sections keep their validation.',
              })}
            </li>
            <li>
              {t({
                fr: '✔ Vos documents restent en place, y compris dans une section devenue facultative.',
                en: '✔ Your documents stay in place, including in a section that became optional.',
              })}
            </li>
            <li>
              {t({
                fr: '✔ Aucune numérotation existante n’est renommée.',
                en: '✔ No existing numbering is renamed.',
              })}
            </li>
            <li>
              {t({
                fr: '✔ La mise à jour est tracée au journal d’audit.',
                en: '✔ The update is recorded in the audit log.',
              })}
            </li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t({ fr: 'Plus tard', en: 'Later' })}
          </Button>
          <Button onClick={() => onApply(chosen)} disabled={busy || count === 0}>
            {busy
              ? t({ fr: 'Application…', en: 'Applying…' })
              : count === 0
                ? t({ fr: 'Aucun changement retenu', en: 'No change selected' })
                : t({
                    fr: `Appliquer ${count} changement${count > 1 ? 's' : ''}`,
                    en: `Apply ${count} change${count > 1 ? 's' : ''}`,
                  })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
