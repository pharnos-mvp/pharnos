import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n } from '@/lib/i18n-context'
import { adminApi, type RefVersionSummary } from './admin-api'
import {
  describeEntry,
  entryIsInert,
  fromServerEntry,
  SECTION_LABEL,
  type CurrentMap,
  type DraftEntry,
} from './ref-draft'

/**
 * Fiche d'une version du référentiel — LECTURE SEULE (point 2 de la série UX CEO).
 *
 * Une version publiée est IMMUABLE : sa fiche se lit, elle ne s'édite jamais. On rend donc le
 * contenu EN CLAIR (jamais du JSON : le god doit relire ce qu'il a publié comme un lecteur, pas
 * comme un développeur), avec la source citée par entrée.
 *
 * Elle porte aussi l'action « Restaurer le contenu de cette version » (point 3). Dans cette
 * architecture on ne revient JAMAIS en arrière : on publie l'état qu'on veut rétablir. L'action
 * ouvre donc un BROUILLON prérempli du contenu de la version choisie — disponible sur n'importe
 * quelle version publiée, pas seulement une abrogation (on restaure aussi bien un barème qu'une
 * structure). Seule la SOURCE reste à saisir : c'est l'acte qui restaure qu'il faut citer, pas
 * celui d'origine.
 */

export function RefVersionDialog({
  version,
  activeOrgs,
  current,
  onClose,
  onRestore,
}: {
  version: RefVersionSummary
  activeOrgs: number
  /** Contenu EN VIGUEUR : restaurer ce qui l'est déjà publierait une mise à jour vide (M5). */
  current: CurrentMap
  onClose: () => void
  /** Ouvre un brouillon prérempli du contenu de cette version (point 3). */
  onRestore: (version: RefVersionSummary, entries: DraftEntry[]) => void
}) {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState<DraftEntry[] | null>(null)
  // M4 — une lecture ÉCHOUÉE tombait sur `[]`, c'est-à-dire sur le rendu « Aucune entrée ». Le god
  // lisait donc « cette version ne contient rien » alors que le réseau avait lâché : conclusion
  // fausse sur un registre opposable, et « Restaurer » grisé sans qu'il sache pourquoi. L'échec est
  // désormais un état À PART, avec de quoi réessayer.
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Le parent ne monte ce composant que pour la version ouverte : l'état repart donc de zéro à
  // chaque ouverture. Réutiliser une liste précédente afficherait le contenu d'une AUTRE version
  // sous le bon titre — sur un registre opposable, c'est inacceptable.
  useEffect(() => {
    let alive = true
    adminApi
      .refEntries(version.id)
      .then((rows) => {
        if (alive) setEntries(rows.map(fromServerEntry))
      })
      .catch(() => {
        if (alive) {
          toast.error(t({ fr: 'Contenu illisible.', en: 'Could not read content.' }))
          setFailed(true)
        }
      })
    return () => {
      alive = false
    }
  }, [version.id, t, attempt])

  /**
   * « Restaurer » est-il un geste QUI CHANGE QUELQUE CHOSE ? Deux refus (M5) :
   * - un BROUILLON n'a jamais été en vigueur, il n'y a rien à y restaurer — et il est déjà éditable ;
   * - une version dont TOUTES les entrées sont déjà en vigueur produirait un brouillon inerte, que
   *   `entryError` refuserait à l'enregistrement. Autant le dire ici plutôt que de laisser le god
   *   remplir une provenance de décret pour rien.
   */
  const allInForce =
    !!entries && entries.length > 0 && entries.every((e) => entryIsInert(e, current))
  const restorable =
    !!entries && entries.length > 0 && !failed && version.status !== 'draft' && !allInForce
  const restoreBlockedWhy =
    !entries || entries.length === 0 || failed
      ? null
      : version.status === 'draft'
        ? t({
            fr: 'Ce brouillon n’a jamais été en vigueur : il n’y a rien à restaurer, ouvrez-le pour l’éditer.',
            en: 'This draft was never in force: there is nothing to restore, open it to edit.',
          })
        : allInForce
          ? t({
              fr: 'Ce contenu est déjà celui en vigueur : le restaurer publierait une mise à jour sans effet.',
              en: 'This content is already the one in force: restoring it would publish an update with no effect.',
            })
          : null

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR') : '—'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{version.label}</span>
            {version.status === 'published' ? (
              <StatusBadge tone="success">
                {t({ fr: 'Publiée', en: 'Published' })} {fmt(version.published_at)} ·{' '}
                {version.adoption_count}/{activeOrgs}
              </StatusBadge>
            ) : (
              <StatusBadge tone="warning">{t({ fr: 'Brouillon', en: 'Draft' })}</StatusBadge>
            )}
            {version.is_baseline ? (
              <StatusBadge tone="neutral">{t({ fr: 'socle', en: 'baseline' })}</StatusBadge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {version.release_note ||
              t({ fr: 'Aucune note de publication.', en: 'No release note.' })}
            {version.effective_date
              ? ` · ${t({ fr: 'effet au', en: 'effective' })} ${fmt(version.effective_date)}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {failed ? (
            <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded-lg border p-3">
              <p className="text-sm font-semibold">
                {t({
                  fr: 'Le contenu de cette version n’a pas pu être lu.',
                  en: 'This version’s content could not be read.',
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t({
                  fr: 'Rien n’est perdu : la version reste publiée telle quelle. Ne concluez pas qu’elle est vide.',
                  en: 'Nothing is lost: the version stays published as is. Do not conclude it is empty.',
                })}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFailed(false)
                  setAttempt((n) => n + 1)
                }}
              >
                {t({ fr: 'Réessayer', en: 'Retry' })}
              </Button>
            </div>
          ) : entries === null ? (
            <Skeleton className="h-32 w-full" />
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t({ fr: 'Aucune entrée.', en: 'No entry.' })}
            </p>
          ) : (
            entries.map((e, i) => (
              <div key={i} className="bg-muted/30 rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <CountryFlag code={e.country} size={14} />
                  <span>{countryLabel(e.country, lang)}</span>
                  <span className="text-muted-foreground font-normal">
                    · {t(SECTION_LABEL[e.section])}
                  </span>
                </p>
                <dl className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {describeEntry(e, lang).map((r, j) => (
                    <div key={j} className="min-w-0">
                      <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                        {t(r.label)}
                      </dt>
                      <dd className="text-sm break-words">{r.value}</dd>
                    </div>
                  ))}
                </dl>
                {e.provTexte ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    <span aria-hidden className="text-info font-semibold">
                      §
                    </span>{' '}
                    {[e.provTexte, e.provJo, e.provComplements].filter(Boolean).join(' — ')}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>

        {restoreBlockedWhy ? (
          <p className="text-muted-foreground text-xs">{restoreBlockedWhy}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t({ fr: 'Fermer', en: 'Close' })}
          </Button>
          {/* On ne « revient » jamais en arrière : on PUBLIE l'état à rétablir. Le bouton ouvre un
              brouillon prérempli — disponible sur toute version publiée, pas que les abrogations. */}
          <Button onClick={() => entries && onRestore(version, entries)} disabled={!restorable}>
            <RotateCcw />
            {t({ fr: 'Restaurer ce contenu', en: 'Restore this content' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
