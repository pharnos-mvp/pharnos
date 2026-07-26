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
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { adminApi, type RefVersionSummary } from './admin-api'
import { fromServerEntry, SECTION_LABEL, type DraftEntry } from './ref-draft'

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

/** Lignes lisibles d'une entrée — miroir d'affichage des sections, jamais du JSON brut. */
function describe(e: DraftEntry, lang: Lang): { label: Translatable; value: string }[] {
  const out: { label: Translatable; value: string }[] = []
  const put = (label: Translatable, value: string) => {
    if (value.trim()) out.push({ label, value })
  }
  if (e.section === 'agency') {
    put({ fr: 'Sigle', en: 'Acronym' }, e.agName)
    put({ fr: 'Dénomination', en: 'Full name' }, e.agFull)
    put({ fr: 'Destinataire', en: 'Recipient' }, e.agDirecteur)
    put({ fr: 'Adresse', en: 'Address' }, e.agAdresse)
    put({ fr: 'Téléphone', en: 'Phone' }, e.agTel)
    put({ fr: 'E-mail', en: 'Email' }, e.agEmail)
  } else if (e.section === 'fees') {
    const cur = e.currency || 'FCFA'
    put({ fr: 'Nouvelle AMM', en: 'New MA' }, e.feeNewMa && `${e.feeNewMa} ${cur}`)
    put({ fr: 'Renouvellement', en: 'Renewal' }, e.feeRenewal && `${e.feeRenewal} ${cur}`)
    put({ fr: 'Variation mineure', en: 'Minor variation' }, e.feeVarMin && `${e.feeVarMin} ${cur}`)
    put({ fr: 'Variation majeure', en: 'Major variation' }, e.feeVarMaj && `${e.feeVarMaj} ${cur}`)
    put({ fr: 'Délai indicatif', en: 'Indicative timeline' }, e.processingDays)
  } else if (e.section === 'submission') {
    put({ fr: 'Modalités de dépôt', en: 'Filing procedure' }, lang === 'en' ? e.subEn : e.subFr)
  } else if (e.section === 'samples') {
    put(
      { fr: 'Échantillons', en: 'Samples' },
      (lang === 'en' ? e.samplesNewMaEn : e.samplesNewMaFr).split('\n').filter(Boolean).join(' · '),
    )
    put({ fr: 'Réserve', en: 'Reservation' }, lang === 'en' ? e.reserveEn : e.reserveFr)
  } else if (e.section === 'ctd_structure') {
    if (e.structureReset) {
      put(
        { fr: 'Structure', en: 'Structure' },
        lang === 'en'
          ? 'Back to the reference tree (all national deltas repealed)'
          : 'Retour à l’arborescence de référence (tous les écarts nationaux abrogés)',
      )
    }
    for (const d of e.deltas) {
      const kind =
        d.kind === 'remove'
          ? { fr: 'plus exigé', en: 'no longer required' }
          : d.kind === 'add'
            ? { fr: 'nouveau', en: 'new' }
            : { fr: 'intitulé', en: 'title' }
      put(
        { fr: `Nœud ${d.number}`, en: `Node ${d.number}` },
        `${lang === 'en' ? kind.en : kind.fr}${d.label ? ` — ${d.label}` : ''}`,
      )
    }
  }
  return out
}

export function RefVersionDialog({
  version,
  activeOrgs,
  onClose,
  onRestore,
}: {
  version: RefVersionSummary
  activeOrgs: number
  onClose: () => void
  /** Ouvre un brouillon prérempli du contenu de cette version (point 3). */
  onRestore: (version: RefVersionSummary, entries: DraftEntry[]) => void
}) {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState<DraftEntry[] | null>(null)

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
          setEntries([])
        }
      })
    return () => {
      alive = false
    }
  }, [version.id, t])

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
          {entries === null ? (
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
                  {describe(e, lang).map((r, j) => (
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t({ fr: 'Fermer', en: 'Close' })}
          </Button>
          {/* On ne « revient » jamais en arrière : on PUBLIE l'état à rétablir. Le bouton ouvre un
              brouillon prérempli — disponible sur toute version publiée, pas que les abrogations. */}
          <Button
            onClick={() => entries && onRestore(version, entries)}
            disabled={!entries || entries.length === 0}
          >
            <RotateCcw />
            {t({ fr: 'Restaurer ce contenu', en: 'Restore this content' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
