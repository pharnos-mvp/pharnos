import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2 } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { EmptyState } from '@/components/ui/empty-state'
import { Page } from '@/components/ui/page'
import { Skeleton } from '@/components/ui/skeleton'
import { useTopbar } from '@/components/layout/topbar'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useOrgId } from '@/features/org/org-context'
import { db, type DocumentRecord, type PartyRecord, type ProductRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { PieceGrid } from './PieceGrid'
import { docTypeLabel } from './doc-types'
import { orgDocCards } from './parties-data'

interface OrgDocs {
  party: PartyRecord | undefined
  products: ProductRecord[]
  documents: DocumentRecord[]
}

/** Charge une organisation + ses produits + documents (périmètre org), avec la MÊME garde que le
 *  cockpit : une organisation d'une autre org active, ou supprimée, n'existe pas ici. */
function useOrgDocs(partyId: string): OrgDocs | undefined {
  const orgId = useOrgId()
  return useLiveQuery(async () => {
    const [party, products, documents] = await Promise.all([
      db.parties.get(partyId),
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
    ])
    const visible = party && party.orgId === orgId && party.deletedAt === null ? party : undefined
    return { party: visible, products, documents }
  }, [partyId, orgId])
}

/**
 * Page dédiée à UNE collection de pièces d'UNE organisation (un type de pièce, ou les AMM d'un pays)
 * : les pièces en cartes verticales, avec **recherche + tri** (`PieceGrid`). L'état de chaque pièce
 * vient du même sélecteur que les cartes de type d'où l'on arrive (`orgDocCards`) → la page ne peut
 * pas contredire la carte cliquée.
 */
function OrgPieceListView({
  partyId,
  title,
  keep,
  emptyText,
}: {
  partyId: string
  /** Suffixe de titre (type de pièce ou pays) — l'organisation est préfixée si connue. */
  title: string
  /** Prédicat MÉMOÏSÉ par l'appelant (`useCallback` sur docType/pays) : re-navigation
   *  `/pieces/coa` → `/pieces/gmp` ne remonte PAS le composant → `keep` DOIT rester une dépendance
   *  du mémo, sinon les cartes resteraient filtrées sur l'ancien type. */
  keep: (d: DocumentRecord) => boolean
  emptyText: string
}) {
  const { t } = useI18n()
  const data = useOrgDocs(partyId)
  const now = useMemo(() => new Date(), [])

  useTopbar({
    title: data?.party ? `${data.party.nom} · ${title}` : title,
    backTo: `/catalogue/organisations/${partyId}`,
    searchHidden: true,
  })

  const cards = useMemo(
    () => (data?.party ? orgDocCards(data.party, data.products, data.documents, now, keep) : []),
    [data, now, keep],
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
          icon={<Building2 />}
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
      <h1 className="font-display text-base font-semibold">{title}</h1>
      <PieceGrid cards={cards} emptyText={emptyText} />
    </Page>
  )
}

/** Page dédiée à UN type de pièce (AMM, CoA, GMP, RCP…) d'une organisation. */
export function OrgPiecePage() {
  const { t, lang } = useI18n()
  const { partyId = '', docType = '' } = useParams()
  // Mémoïsé sur `docType` : identité stable tant que le type d'URL ne change pas (voir OrgPieceListView).
  const keep = useCallback((d: DocumentRecord) => d.docType === docType, [docType])
  return (
    <OrgPieceListView
      partyId={partyId}
      title={docTypeLabel(docType, lang)}
      keep={keep}
      emptyText={t({ fr: 'Aucune pièce de ce type', en: 'No document of this type' })}
    />
  )
}

/** Page dédiée aux AMM d'UN pays d'une organisation (`none` = pays non précisé). */
export function OrgAmmCountryPage() {
  const { t, lang } = useI18n()
  const { partyId = '', country = '' } = useParams()
  const wanted = country === 'none' ? '' : country
  const title =
    country === 'none'
      ? t({ fr: 'AMM · pays non précisé', en: 'MA · unspecified country' })
      : `AMM · ${countryLabel(country, lang)}`
  const keep = useCallback(
    (d: DocumentRecord) => d.docType === 'amm' && (d.country?.trim() || '') === wanted,
    [wanted],
  )
  return (
    <OrgPieceListView
      partyId={partyId}
      title={title}
      keep={keep}
      emptyText={t({ fr: 'Aucune AMM pour ce pays', en: 'No MA for this country' })}
    />
  )
}
