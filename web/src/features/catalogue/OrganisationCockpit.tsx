import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertCircle,
  Building2,
  ChevronRight,
  Clock3,
  PackageOpen,
  Pencil,
  ShieldCheck,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ListRow, ListRowIcon, ListRowLink } from '@/components/ui/list-row'
import { Page } from '@/components/ui/page'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTopbar } from '@/components/layout/topbar'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useOrgId } from '@/features/org/org-context'
import { db, type PartyRecord, type PartyRole, type ProductRecord } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { PieceGrid } from './PieceGrid'
import { ProductIcon } from './product-icon'
import { categoryForDocType, docTypeLabel, requiresExpiry } from './doc-types'
import {
  buildOrgCockpitVm,
  orgJustificatifCards,
  orgTypeCards,
  sortRoles,
  type AmmCountryStat,
  type OrgCockpitVm,
  type OrgTypeCard,
} from './parties-data'
import { updateParty } from './parties-repository'
import { syncParties } from './parties-sync'

const ROLE_LABEL: Record<PartyRole, Translatable> = {
  titulaire: { fr: "Titulaire d'AMM", en: 'MA holder' },
  fabricant: { fr: 'Fabricant', en: 'Manufacturer' },
  distributeur: { fr: 'Distributeur', en: 'Distributor' },
}

export function OrganisationCockpit() {
  const { t } = useI18n()
  const orgId = useOrgId()
  const { partyId = '' } = useParams()
  const [editing, setEditing] = useState(false)

  const data = useLiveQuery(async () => {
    const [party, products, documents, dossiers, correspondences, messages] = await Promise.all([
      db.parties.get(partyId),
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
      db.dossiers.where('orgId').equals(orgId).toArray(),
      db.correspondences.where('orgId').equals(orgId).toArray(),
      db.correspondenceMessages.where('orgId').equals(orgId).toArray(),
    ])
    return { party, products, documents, dossiers, correspondences, messages }
  }, [orgId, partyId])

  const party =
    data?.party && data.party.orgId === orgId && data.party.deletedAt === null
      ? data.party
      : undefined
  const now = useMemo(() => new Date(), [])

  useTopbar({
    title: party?.nom,
    backTo: '/catalogue/organisations',
    searchHidden: true,
  })

  const linked = useMemo(() => {
    if (!data) return []
    return data.products
      .filter(
        (p) => p.deletedAt === null && (p.titulaireId === partyId || p.fabricantId === partyId),
      )
      .sort((a, b) => a.nomCommercial.localeCompare(b.nomCommercial))
  }, [data, partyId])

  // Cockpit RA : portefeuille AMM + validité des pièces, dérivés des sélecteurs de validité uniques.
  const vm = useMemo<OrgCockpitVm | undefined>(
    () =>
      party && data ? buildOrgCockpitVm(party, data.products, data.documents, now) : undefined,
    [party, data, now],
  )

  // Cartes par onglet. Pièces admin / Documents d'info = cartes AGRÉGÉES par TYPE (une carte par
  // type → page dédiée), classées par `docType` CANONIQUE (une COA legacy `category:'info'` reste en
  // « Pièces admin »). AMM a son propre onglet (cartes par pays, dérivées du portefeuille `vm.amm`).
  // Justificatifs = pièces jointes des correspondances (grille à plat, sans sous-type).
  const cards = useMemo(() => {
    if (!party || !data) return { adminTypes: [], infoTypes: [], justif: [] }
    return {
      adminTypes: orgTypeCards(
        party,
        data.products,
        data.documents,
        now,
        (d) => d.docType !== 'amm' && categoryForDocType(d.docType, d.category) === 'admin',
      ),
      infoTypes: orgTypeCards(
        party,
        data.products,
        data.documents,
        now,
        (d) => categoryForDocType(d.docType, d.category) === 'info',
      ),
      justif: orgJustificatifCards(
        party,
        data.products,
        data.dossiers,
        data.correspondences,
        data.messages,
      ),
    }
  }, [party, data, now])

  if (data === undefined) return <FicheSkeleton />
  if (!party) {
    return (
      <Page>
        <EmptyState
          icon={<Building2 />}
          title={t({ fr: 'Organisation introuvable', en: 'Organization not found' })}
          description={t({
            fr: 'Cette organisation n’existe pas ou a été supprimée.',
            en: 'This organization does not exist or has been deleted.',
          })}
          action={
            <Button asChild variant="outline">
              <Link to="/catalogue/organisations">
                {t({ fr: 'Retour aux organisations', en: 'Back to organizations' })}
              </Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const isMah = party.roles.includes('titulaire')

  return (
    <Page>
      {/* En-tête fiche */}
      <div className="bg-card rounded-xl border p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700 dark:from-[#14233b] dark:to-[#1c3a5e] dark:text-sky-300"
          >
            <Building2 className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1
              className="font-display truncate text-xl font-bold tracking-tight"
              title={party.nom}
            >
              {party.nom}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {sortRoles(party.roles).map((r) => (
                <StatusBadge key={r} tone="info">
                  {t(ROLE_LABEL[r])}
                </StatusBadge>
              ))}
            </div>
          </div>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {t({ fr: 'Modifier', en: 'Edit' })}
            </Button>
          ) : null}
        </div>

        {editing ? (
          <OrgEditForm party={party} orgId={orgId} onDone={() => setEditing(false)} />
        ) : (
          <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label={t({ fr: 'Pays', en: 'Country' })} value={party.pays} />
            <Field label={t({ fr: 'Adresse', en: 'Address' })} value={party.adresse} />
            <Field
              label={t({ fr: 'N° certificat GMP', en: 'GMP certificate no.' })}
              value={party.gmpCertificat}
            />
            <Field
              label={t({ fr: 'Échéance GMP', en: 'GMP expiry' })}
              value={party.gmpExpiry ?? ''}
            />
            <Field
              label={t({ fr: 'E-mail de contact', en: 'Contact e-mail' })}
              value={party.contactEmail ?? ''}
            />
          </dl>
        )}
      </div>

      {/* Onglets ADAPTÉS AU RÔLE : le titulaire d'AMM détient produits/AMM/docs d'info ; un fabricant
          (ou distributeur) pur n'a que ses pièces admin + les justificatifs échangés. */}
      <Tabs defaultValue={isMah ? 'produits' : 'admin'} className="gap-4">
        <TabsList className="flex-wrap">
          {isMah ? (
            <TabsTrigger value="produits">{t({ fr: 'Produits', en: 'Products' })}</TabsTrigger>
          ) : null}
          {isMah ? <TabsTrigger value="amm">{t({ fr: 'AMM', en: 'MA' })}</TabsTrigger> : null}
          <TabsTrigger value="admin">{t({ fr: 'Pièces admin', en: 'Admin docs' })}</TabsTrigger>
          {isMah ? (
            <TabsTrigger value="info">
              {t({ fr: 'Documents d’information', en: 'Product information' })}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="justif">
            {t({ fr: 'Justificatifs', en: 'Supporting docs' })}
          </TabsTrigger>
        </TabsList>

        {isMah ? (
          <TabsContent value="produits">
            <ProductsList linked={linked} partyId={partyId} />
          </TabsContent>
        ) : null}
        {isMah ? (
          <TabsContent value="amm" className="space-y-4">
            {vm && vm.amm.total > 0 ? (
              <>
                <AmmSummary amm={vm.amm} />
                <AmmCountryCards byCountry={vm.amm.byCountry} partyId={partyId} />
              </>
            ) : (
              <EmptyState
                icon={<PackageOpen />}
                title={t({ fr: 'Aucune AMM déposée', en: 'No MA filed' })}
              />
            )}
          </TabsContent>
        ) : null}
        <TabsContent value="admin">
          <TypeCards
            cards={cards.adminTypes}
            partyId={partyId}
            emptyText={t({ fr: 'Aucune pièce administrative', en: 'No administrative document' })}
          />
        </TabsContent>
        {isMah ? (
          <TabsContent value="info">
            <TypeCards
              cards={cards.infoTypes}
              partyId={partyId}
              emptyText={t({ fr: 'Aucun document d’information', en: 'No product information' })}
            />
          </TabsContent>
        ) : null}
        <TabsContent value="justif">
          <PieceGrid
            cards={cards.justif}
            emptyText={t({
              fr: 'Aucun justificatif échangé en correspondance',
              en: 'No supporting document exchanged',
            })}
          />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

/** Produits liés à l'organisation (rôle titulaire et/ou fabricant), en lignes cliquables. */
function ProductsList({ linked, partyId }: { linked: ProductRecord[]; partyId: string }) {
  const { t } = useI18n()
  if (linked.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen />}
        title={t({ fr: 'Aucun produit lié', en: 'No linked product' })}
        description={t({
          fr: 'Aucun produit ne désigne encore cette organisation comme titulaire ou fabricant.',
          en: 'No product yet names this organization as holder or manufacturer.',
        })}
      />
    )
  }
  return (
    <div className="flex flex-col gap-2" role="list">
      {linked.map((p) => {
        const roles: PartyRole[] = []
        if (p.titulaireId === partyId) roles.push('titulaire')
        if (p.fabricantId === partyId) roles.push('fabricant')
        const sub = [p.dci, p.dosage, p.forme].filter(Boolean).join(' · ')
        return (
          <ListRow role="listitem" key={p.id}>
            <ListRowIcon>
              <ProductIcon forme={p.forme} className="size-5" />
            </ListRowIcon>
            <div className="min-w-0 flex-1">
              <ListRowLink to={`/catalogue/${p.id}`} title={p.nomCommercial}>
                {p.nomCommercial}
              </ListRowLink>
              {sub ? (
                <div className="text-muted-foreground mt-0.5 truncate text-xs">{sub}</div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {roles.map((r) => (
                <StatusBadge key={r} tone="neutral">
                  {t(ROLE_LABEL[r])}
                </StatusBadge>
              ))}
            </div>
          </ListRow>
        )
      })}
    </div>
  )
}

const AMM_TILE = {
  total: 'bg-muted text-foreground',
  active: 'bg-success-subtle text-success-subtle-foreground',
  expiring: 'bg-warning-subtle text-warning-subtle-foreground',
  expired: 'bg-danger-subtle text-danger-subtle-foreground',
} as const

function AmmTile({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: keyof typeof AMM_TILE
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 text-center ${AMM_TILE[tone]}`}>
      <div className="font-display text-xl leading-none font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-medium">{label}</div>
    </div>
  )
}

/** Synthèse du portefeuille d'AMM (rôle titulaire) : total / actives / à renouveler / périmées. */
function AmmSummary({ amm }: { amm: OrgCockpitVm['amm'] }) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <AmmTile value={amm.total} label={t({ fr: 'Total', en: 'Total' })} tone="total" />
      <AmmTile value={amm.active} label={t({ fr: 'Actives', en: 'Active' })} tone="active" />
      <AmmTile
        value={amm.expiring}
        label={t({ fr: 'À renouveler', en: 'Renewals' })}
        tone="expiring"
      />
      <AmmTile value={amm.expired} label={t({ fr: 'Expirées', en: 'Expired' })} tone="expired" />
    </div>
  )
}

/** Cartes des AMM par PAYS (cliquables → page dédiée du pays). `—` = pays non précisé (route `none`). */
function AmmCountryCards({ byCountry, partyId }: { byCountry: AmmCountryStat[]; partyId: string }) {
  const { t, lang } = useI18n()
  if (byCountry.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {byCountry.map((c) => {
        const unspecified = c.code === '—'
        return (
          <Link
            key={c.code}
            to={`/catalogue/organisations/${partyId}/amm/${unspecified ? 'none' : c.code}`}
            className="bg-card hover:border-muted-foreground/25 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border px-4 py-3 no-underline transition-all outline-none hover:shadow-sm focus-visible:ring-[3px]"
          >
            {unspecified ? (
              <span className="text-muted-foreground w-4 shrink-0 text-center">—</span>
            ) : (
              <CountryFlag code={c.code} size={16} />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-display truncate text-sm font-semibold">
                {unspecified
                  ? t({ fr: 'Pays non précisé', en: 'Unspecified country' })
                  : countryLabel(c.code, lang)}
              </div>
              <div className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                {t({ fr: `${c.total} AMM`, en: `${c.total} MA` })}
              </div>
            </div>
            {c.expired > 0 ? <StatusBadge tone="danger">{c.expired}</StatusBadge> : null}
            {c.expiring > 0 ? <StatusBadge tone="warning">{c.expiring}</StatusBadge> : null}
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        )
      })}
    </div>
  )
}

/** Cartes AGRÉGÉES par TYPE de pièce (onglets Pièces admin / Documents d'info) → page dédiée du type. */
function TypeCards({
  cards,
  partyId,
  emptyText,
}: {
  cards: OrgTypeCard[]
  partyId: string
  emptyText: string
}) {
  if (cards.length === 0) return <EmptyState icon={<PackageOpen />} title={emptyText} />
  return (
    <div className="flex flex-col gap-2">
      {cards.map((c) => (
        <TypeCard key={c.docType} card={c} partyId={partyId} />
      ))}
    </div>
  )
}

function TypeCard({ card, partyId }: { card: OrgTypeCard; partyId: string }) {
  const { t, lang } = useI18n()
  // Les types à validité (AMM/GMP/COPP/FSC/ML/CoA) portent l'état ; les documents d'info n'ont pas
  // de date → on n'affiche qu'un décompte, pas de badge (pas de « validité » à signaler).
  const hasValidity = requiresExpiry(card.docType)
  const expiryText = (d: number) =>
    d < 0
      ? t({ fr: `Périmé depuis ${-d} j`, en: `${-d}d overdue` })
      : t({ fr: `Expire dans ${d} j`, en: `in ${d}d` })
  return (
    <Link
      to={`/catalogue/organisations/${partyId}/pieces/${card.docType}`}
      className="bg-card hover:border-muted-foreground/25 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border px-4 py-3 no-underline transition-all outline-none hover:shadow-sm focus-visible:ring-[3px]"
    >
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-sm font-semibold">
          {docTypeLabel(card.docType, lang)}
        </div>
        <div className="text-muted-foreground mt-0.5 truncate text-xs">
          {hasValidity
            ? t({
                fr: `${card.valid}/${card.total} à jour`,
                en: `${card.valid}/${card.total} valid`,
              })
            : t({
                fr: `${card.total} document${card.total > 1 ? 's' : ''}`,
                en: `${card.total} document${card.total > 1 ? 's' : ''}`,
              })}
          {card.nextProductName ? ` · ${card.nextProductName}` : ''}
        </div>
      </div>
      {hasValidity && card.nextDaysLeft != null ? (
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {expiryText(card.nextDaysLeft)}
        </span>
      ) : null}
      {hasValidity ? <PieceBadge state={card.state} /> : null}
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </Link>
  )
}

function PieceBadge({ state }: { state: OrgTypeCard['state'] }) {
  const { t } = useI18n()
  if (state === 'expired')
    return (
      <StatusBadge tone="danger">
        <AlertCircle />
        {t({ fr: 'Périmée', en: 'Expired' })}
      </StatusBadge>
    )
  if (state === 'expiring')
    return (
      <StatusBadge tone="warning">
        <Clock3 />
        {t({ fr: 'À renouveler', en: 'Renew' })}
      </StatusBadge>
    )
  return (
    <StatusBadge tone="success">
      <ShieldCheck />
      {t({ fr: 'Valide', en: 'Valid' })}
    </StatusBadge>
  )
}

/** Validation e-mail légère du contact fabricant (même motif que ShareDialog). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Field({ label, value }: { label: string; value: string }) {
  const { t } = useI18n()
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words">
        {value || <span className="text-muted-foreground/60">{t({ fr: '—', en: '—' })}</span>}
      </dd>
    </div>
  )
}

function OrgEditForm({
  party,
  orgId,
  onDone,
}: {
  party: PartyRecord
  orgId: string
  onDone: () => void
}) {
  const { t } = useI18n()
  const [pays, setPays] = useState(party.pays)
  const [adresse, setAdresse] = useState(party.adresse)
  const [gmpCertificat, setGmpCertificat] = useState(party.gmpCertificat)
  const [gmpExpiry, setGmpExpiry] = useState(party.gmpExpiry ?? '')
  const [contactEmail, setContactEmail] = useState(party.contactEmail ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    // Contact facultatif ; s'il est renseigné, il doit être un e-mail valide (le moteur de relance
    // fabricant l'utilise comme destinataire — une adresse cassée = une relance qui ne part jamais).
    const email = contactEmail.trim()
    if (email && !EMAIL_RE.test(email)) {
      toast.error(t({ fr: 'E-mail de contact invalide.', en: 'Invalid contact e-mail.' }))
      return
    }
    setBusy(true)
    try {
      await updateParty(party.id, {
        pays: pays.trim(),
        adresse: adresse.trim(),
        gmpCertificat: gmpCertificat.trim(),
        gmpExpiry: gmpExpiry || null,
        contactEmail: email || null,
      })
      void syncParties(orgId)
      toast.success(t({ fr: 'Organisation enregistrée', en: 'Organization saved' }))
      onDone()
    } catch {
      toast.error(t({ fr: 'Échec de l’enregistrement', en: 'Save failed' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="org-pays">{t({ fr: 'Pays', en: 'Country' })}</Label>
        <Input
          id="org-pays"
          value={pays}
          maxLength={100}
          onChange={(e) => setPays(e.target.value)}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="org-adresse">{t({ fr: 'Adresse', en: 'Address' })}</Label>
        <textarea
          id="org-adresse"
          value={adresse}
          maxLength={300}
          rows={2}
          onChange={(e) => setAdresse(e.target.value)}
          className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-gmp">{t({ fr: 'N° certificat GMP', en: 'GMP certificate no.' })}</Label>
        <Input
          id="org-gmp"
          value={gmpCertificat}
          maxLength={100}
          onChange={(e) => setGmpCertificat(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-gmp-exp">{t({ fr: 'Échéance GMP', en: 'GMP expiry' })}</Label>
        <Input
          id="org-gmp-exp"
          type="date"
          value={gmpExpiry}
          onChange={(e) => setGmpExpiry(e.target.value)}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="org-contact">{t({ fr: 'E-mail de contact', en: 'Contact e-mail' })}</Label>
        <Input
          id="org-contact"
          type="email"
          value={contactEmail}
          maxLength={320}
          placeholder={t({ fr: 'contact@fabricant.com', en: 'contact@manufacturer.com' })}
          onChange={(e) => setContactEmail(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {t({
            fr: 'Destinataire des relances de renouvellement des pièces (GMP, COPP…) qui expirent.',
            en: 'Recipient of renewal reminders for expiring documents (GMP, CPP…).',
          })}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button variant="primary" onClick={() => void save()} disabled={busy}>
          {t({ fr: 'Enregistrer', en: 'Save' })}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          {t({ fr: 'Annuler', en: 'Cancel' })}
        </Button>
      </div>
    </div>
  )
}

function FicheSkeleton() {
  return (
    <Page>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </Page>
  )
}
