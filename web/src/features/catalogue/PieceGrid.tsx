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

type Sort = 'default' | 'date' | 'az'

/**
 * Grille de cartes de pièces (vignette + nom + état) avec **recherche** et **tri** (date / A-Z) —
 * la surface FINALE d'une page dédiée (type de pièce, AMM d'un pays, justificatifs). La barre de
 * recherche reprend l'UX de la page d'accueil Organisations (icône à gauche, `type=search`,
 * compteur « X sur Y » à droite, état vide `SearchX`). `default` = l'ordre reçu (urgence), que les
 * deux boutons de tri remplacent puis rétablissent quand on les re-clique.
 */
export function PieceGrid({ cards, emptyText }: { cards: OrgPieceCard[]; emptyText?: string }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
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
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
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
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={tip}
        className="bg-card hover:border-muted-foreground/25 focus-visible:ring-ring/50 flex w-full flex-col gap-2 rounded-xl border p-2.5 text-left transition-all duration-150 outline-none hover:-translate-y-px hover:shadow-md focus-visible:ring-[3px] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <DocThumb doc={card} onPages={setPageCount} />
        <div className="min-w-0">
          {/* Nom tronqué + `title` souris uniquement → détail complet porté en sr-only. */}
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
        {/* Valide → aucune étiquette (choix CEO) : seules les pièces à action se signalent. */}
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
