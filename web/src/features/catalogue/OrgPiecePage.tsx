import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, Clock3, PackageOpen } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { EmptyState } from '@/components/ui/empty-state'
import { Page } from '@/components/ui/page'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useTopbar } from '@/components/layout/topbar'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { formatBytes } from '@/lib/format-bytes'
import { useI18n } from '@/lib/i18n-context'
import { DocPreviewDialog, type PreviewableDoc } from './DocPreviewDialog'
import { DocThumb } from './DocThumb'
import { docTypeLabel } from './doc-types'
import { orgPieceCards, type OrgPieceCard } from './parties-data'

/**
 * Page dédiée à UN type de pièce (AMM, CoA, GMP…) d'UNE organisation : les pièces en cartes
 * verticales (vignette de la page 1, nom du fichier à la base), cliquables pour l'aperçu.
 *
 * L'état de chaque pièce vient du même sélecteur que le panneau « Validité des pièces » d'où l'on
 * arrive (`orgPieceCards` → `expiringDocs`) : la page ne peut pas contredire la carte cliquée.
 */
export function OrgPiecePage() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const { partyId = '', docType = '' } = useParams()
  const [preview, setPreview] = useState<PreviewableDoc | null>(null)

  const data = useLiveQuery(async () => {
    const [party, products, documents] = await Promise.all([
      db.parties.get(partyId),
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
    ])
    // Même garde que le cockpit : une org d'une AUTRE org active, ou supprimée, n'existe pas ici.
    const visible = party && party.orgId === orgId && party.deletedAt === null ? party : undefined
    return { party: visible, products, documents }
  }, [partyId, orgId])

  const typeLabel = docTypeLabel(docType, lang)
  useTopbar({
    title: data?.party ? `${data.party.nom} · ${typeLabel}` : typeLabel,
    backTo: `/catalogue/organisations/${partyId}`,
    searchHidden: true,
  })

  const cards = useMemo(
    () =>
      data?.party
        ? orgPieceCards(data.party, data.products, data.documents, docType, new Date())
        : [],
    [data, docType],
  )

  if (data === undefined) {
    return (
      <Page>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </Page>
    )
  }

  if (!data.party) {
    return (
      <Page>
        <EmptyState
          icon={<PackageOpen />}
          title={t({ fr: 'Organisation introuvable', en: 'Organization not found' })}
          description={t({
            fr: 'Cette organisation n’existe pas ou a été supprimée.',
            en: 'This organization does not exist or has been deleted.',
          })}
        />
      </Page>
    )
  }

  return (
    <Page>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-base font-semibold">{typeLabel}</h1>
        <span className="text-muted-foreground text-xs">
          {t({ fr: `${cards.length} pièce(s)`, en: `${cards.length} document(s)` })}
        </span>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title={t({ fr: 'Aucune pièce de ce type', en: 'No document of this type' })}
          description={t({
            fr: 'Les pièces déposées pour cette organisation apparaîtront ici.',
            en: 'Documents filed for this organization will appear here.',
          })}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((c) => (
            <PieceCard
              key={c.id}
              card={c}
              onOpen={() => setPreview({ id: c.id, filePath: c.filePath, fileName: c.fileName })}
            />
          ))}
        </ul>
      )}

      <DocPreviewDialog doc={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </Page>
  )
}

function PieceCard({ card, onOpen }: { card: OrgPieceCard; onOpen: () => void }) {
  const { t, lang } = useI18n()
  // État LOCAL : remonter le compteur au parent re-rendrait les N cartes à chaque vignette peinte.
  // `setPageCount` a une identité stable → l'effet de la vignette ne se relance pas.
  const [pageCount, setPageCount] = useState<number>()

  const stateText =
    card.state === 'expired'
      ? t({ fr: 'Périmée', en: 'Expired' })
      : card.state === 'expiring'
        ? t({ fr: 'À renouveler', en: 'Renew' })
        : t({ fr: 'Valide', en: 'Valid' })

  // Infobulle : nom COMPLET (celui affiché est tronqué par la carte) + pages + taille + échéance.
  const tip = [
    card.fileName,
    pageCount ? `${pageCount} p.` : null,
    formatBytes(card.size, lang),
    card.expiryDate
      ? t({ fr: `expire le ${card.expiryDate}`, en: `expires ${card.expiryDate}` })
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={tip}
        className="bg-card hover:border-muted-foreground/25 focus-visible:ring-ring/50 flex w-full flex-col gap-2 rounded-xl border p-2.5 text-left transition-all outline-none hover:shadow-sm focus-visible:ring-[3px]"
      >
        <DocThumb doc={card} onPages={setPageCount} />
        <div className="min-w-0">
          {/* Le nom affiché est tronqué et `title` ne sert qu'à la souris : on porte le détail
              complet (nom, état, taille) pour les lecteurs d'écran. */}
          <span className="sr-only">
            {`${card.fileName} · ${stateText} · ${formatBytes(card.size, lang)}`}
          </span>
          <div className="truncate text-xs font-medium" aria-hidden>
            {card.fileName}
          </div>
          <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
            {card.productName}
          </div>
        </div>
        {/* Valide → AUCUNE étiquette (choix CEO) : seules les pièces à action se signalent. */}
        {card.state === 'expired' ? (
          <StatusBadge tone="danger" className="self-start">
            <AlertCircle />
            {t({ fr: 'Périmée', en: 'Expired' })}
          </StatusBadge>
        ) : card.state === 'expiring' ? (
          <StatusBadge tone="warning" className="self-start">
            <Clock3 />
            {t({ fr: 'À renouveler', en: 'Renew' })}
          </StatusBadge>
        ) : null}
      </button>
    </li>
  )
}
