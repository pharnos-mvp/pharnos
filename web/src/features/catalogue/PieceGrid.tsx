import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownAZ,
  CalendarClock,
  Clock3,
  PackageOpen,
  Search,
  SearchX,
} from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatBytes } from '@/lib/format-bytes'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { DocPreviewDialog, type PreviewableDoc } from './DocPreviewDialog'
import { DocThumb } from './DocThumb'
import type { OrgPieceCard } from './parties-data'

/** Sans accents ni casse — recherche tolérante (« cote » trouve « Côté »). */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Étiquette COMPACTE : elle partage la ligne du nom de produit, elle doit rester discrète. */
const BADGE_SM = 'shrink-0 gap-0.5 px-1.5 py-0 text-[10px] [&>svg]:size-2.5'

type Sort = 'default' | 'date' | 'az'

/**
 * Grille de cartes de pièces (vignette + nom + état) avec **recherche** et **tri** (date / A-Z) —
 * la surface FINALE d'une page dédiée (type de pièce, AMM d'un pays, justificatifs). La barre de
 * recherche reprend l'UX de la page d'accueil Organisations (icône à gauche, `type=search`,
 * compteur « X sur Y » à droite, état vide `SearchX`). `default` = l'ordre reçu (urgence), que les
 * deux boutons de tri remplacent puis rétablissent quand on les re-clique.
 */
export function PieceGrid({
  cards,
  emptyText,
  query,
  onQueryChange,
}: {
  cards: OrgPieceCard[]
  emptyText?: string
  /**
   * Recherche CONTRÔLÉE par la page (champ porté par la barre supérieure). Non fournie ⇒ la grille
   * gère la sienne (cas d'un onglet, p. ex. Justificatifs, où il n'y a pas de barre dédiée).
   */
  query?: string
  onQueryChange?: (value: string) => void
}) {
  const { t } = useI18n()
  const [internalQ, setInternalQ] = useState('')
  const controlled = query !== undefined
  const q = controlled ? query : internalQ
  const setQ = controlled ? (onQueryChange ?? (() => {})) : setInternalQ
  const [sort, setSort] = useState<Sort>('default')
  const [preview, setPreview] = useState<PreviewableDoc | null>(null)

  const shown = useMemo(() => {
    const needle = norm(q.trim())
    let list = cards
    if (needle) list = cards.filter((c) => norm(`${c.fileName} ${c.productName}`).includes(needle))
    if (sort === 'az') list = [...list].sort((a, b) => a.fileName.localeCompare(b.fileName))
    // Plus récent d'abord (date de dépôt). Tri STABLE : on ne réordonne pas hors de ce critère.
    else if (sort === 'date')
      list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return list
  }, [cards, q, sort])

  const toggle = (s: Sort) => setSort((cur) => (cur === s ? 'default' : s))

  // Aucune pièce du tout (≠ « aucun résultat de recherche ») → message propre à la page.
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen />}
        title={emptyText ?? t({ fr: 'Aucune pièce', en: 'No document' })}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Contrôlée : le champ vit dans la barre supérieure (≥ md) → ici on ne garde que le repli
            petit écran, où la barre n'a pas la place de l'afficher. */}
        <div className={cn('relative min-w-0 flex-1 sm:max-w-xs', controlled && 'md:hidden')}>
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={100}
            placeholder={t({ fr: 'Rechercher (nom, produit…)', en: 'Search (name, product…)' })}
            aria-label={t({ fr: 'Rechercher une pièce', en: 'Search a document' })}
            className="pl-9"
          />
        </div>
        <SortButton active={sort === 'date'} onClick={() => toggle('date')} Icon={CalendarClock}>
          {t({ fr: 'Date', en: 'Date' })}
        </SortButton>
        <SortButton active={sort === 'az'} onClick={() => toggle('az')} Icon={ArrowDownAZ}>
          {t({ fr: 'A-Z', en: 'A-Z' })}
        </SortButton>
        <span className="text-muted-foreground ml-auto text-sm" aria-live="polite">
          {q.trim()
            ? t({
                fr: `${shown.length} sur ${cards.length}`,
                en: `${shown.length} of ${cards.length}`,
              })
            : t({
                fr: `${cards.length} pièce${cards.length > 1 ? 's' : ''}`,
                en: `${cards.length} document${cards.length > 1 ? 's' : ''}`,
              })}
        </span>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={t({ fr: 'Aucun résultat', en: 'No result' })}
          description={t({
            fr: 'Aucune pièce ne correspond à votre recherche.',
            en: 'No document matches your search.',
          })}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((c) => (
            <PieceCard
              key={c.id}
              card={c}
              onOpen={() => setPreview({ id: c.id, filePath: c.filePath, fileName: c.fileName })}
            />
          ))}
        </ul>
      )}

      <DocPreviewDialog doc={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </div>
  )
}

function SortButton({
  active,
  onClick,
  Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  Icon: typeof CalendarClock
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-visible:ring-ring/50 flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px]',
        active
          ? 'border-info bg-info-subtle text-info-subtle-foreground'
          : 'bg-card hover:border-muted-foreground/25',
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  )
}

function PieceCard({ card, onOpen }: { card: OrgPieceCard; onOpen: () => void }) {
  const { t, lang } = useI18n()
  const [pageCount, setPageCount] = useState<number>()

  const stateText =
    card.state === 'expired'
      ? t({ fr: 'Périmée', en: 'Expired' })
      : card.state === 'expiring'
        ? t({ fr: 'À renouveler', en: 'Renew' })
        : t({ fr: 'Valide', en: 'Valid' })

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
    // `h-full` : la carte remplit sa cellule de grille → hauteur IDENTIQUE avec ou sans étiquette.
    <li className="h-full">
      <button
        type="button"
        onClick={onOpen}
        title={tip}
        className="bg-card hover:border-muted-foreground/25 focus-visible:ring-ring/50 flex h-full w-full flex-col gap-2 rounded-xl border p-2.5 text-left transition-all duration-150 outline-none hover:-translate-y-px hover:shadow-md focus-visible:ring-[3px] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <DocThumb doc={card} onPages={setPageCount} />
        <div className="w-full min-w-0">
          {/* Nom tronqué + `title` souris uniquement → détail complet porté en sr-only. */}
          <span className="sr-only">
            {`${card.fileName} · ${stateText} · ${formatBytes(card.size, lang)}`}
          </span>
          <div className="truncate text-xs font-medium" aria-hidden>
            {card.fileName}
          </div>
          {/* Produit + étiquette sur la MÊME ligne. `min-h-5` réserve la hauteur de la ligne même
              quand il n'y a PAS d'étiquette (pièce valide) → aucune carte plus courte qu'une autre. */}
          <div className="mt-0.5 flex min-h-5 items-center gap-1.5">
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
              {card.productName}
            </span>
            {/* Valide → aucune étiquette (choix CEO) : seules les pièces à action se signalent. */}
            {card.state === 'expired' ? (
              <StatusBadge tone="danger" className={BADGE_SM}>
                <AlertCircle />
                {t({ fr: 'Périmée', en: 'Expired' })}
              </StatusBadge>
            ) : card.state === 'expiring' ? (
              <StatusBadge tone="warning" className={BADGE_SM}>
                <Clock3 />
                {t({ fr: 'À renouveler', en: 'Renew' })}
              </StatusBadge>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  )
}
