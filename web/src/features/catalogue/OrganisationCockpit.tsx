import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Tabs as RadixTabs } from 'radix-ui'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronRight,
  Clock3,
  PackageOpen,
  Pencil,
  ShieldCheck,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ListRow, ListRowIcon, ListRowLink } from '@/components/ui/list-row'
import { Page } from '@/components/ui/page'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useHeaderSlot } from '@/components/layout/header-slot'
import { LangThemeControls } from '@/components/layout/lang-theme-controls'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useOrgId } from '@/features/org/org-context'
import { db, type PartyRecord, type PartyRole, type ProductRecord } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { getPartyBranding, setPartySignatory } from '@/features/profile/pro-settings-repository'
import { syncProSettings } from '@/features/profile/pro-settings-sync'
import { useProSettingsSync } from '@/features/profile/use-pro-settings-sync'
import { OrgBrandingTab } from './OrgBrandingTab'
import { OrgDocAddButton } from './OrgDocAddButton'
import { PieceGrid } from './PieceGrid'
import { ProductIcon } from './product-icon'
import {
  adminDocTypesForPartyRoles,
  AMM_DOC_TYPE,
  categoryForDocType,
  docTypeLabel,
  INFO_DOC_TYPES,
  requiresExpiry,
} from './doc-types'
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
// Chrome du cockpit RIM (bandeau + méta + onglets soulignés, haut figé) — PARTAGÉE avec la fiche
// produit : même UX/UI pleine largeur, seuls les onglets diffèrent (décision CEO, mockup validé).
import './product-cockpit.css'

/** Date ISO → jour lisible (22/04/2028). Vide/invalide → tiret, jamais « Invalid Date ». */
function formatDay(iso: string | null | undefined, lang: 'fr' | 'en'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')
}

const ROLE_LABEL: Record<PartyRole, Translatable> = {
  titulaire: { fr: "Titulaire d'AMM", en: 'MA holder' },
  fabricant: { fr: 'Fabricant', en: 'Manufacturer' },
  distributeur: { fr: 'Distributeur', en: 'Distributor' },
  // ≠ « Agence réglementaire » (= l'AUTORITÉ nationale, référentiel Autorités) — précision CEO.
  agent: { fr: 'Agence locale / Représentant', en: 'Local agent / Representative' },
}

export function OrganisationCockpit() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const setHeaderSlot = useHeaderSlot()
  const { partyId = '' } = useParams()
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState('identification')
  // Hydrate le branding party (signataire + images) au montage de la FICHE : sans ça, après un
  // logout (cache purgé) l'onglet Identification lirait un branding vide et l'afficherait « — » —
  // et une édition écraserait le record réel côté serveur. Cf. garde `dirty` dans OrgEditForm.
  useProSettingsSync(orgId)

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

  // En-tête applicatif PLEIN (façon fiche produit) : retour + nom de l'organisation ; libéré au
  // démontage. Le bandeau plein masquerait langue/thème → on réinjecte la primitive partagée.
  const partyName = party?.nom
  useEffect(() => {
    if (!setHeaderSlot) return
    if (!partyName) {
      setHeaderSlot(null)
      return
    }
    setHeaderSlot(
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Retour aux organisations', en: 'Back to organizations' })}
          onClick={() => navigate('/catalogue/organisations')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-display min-w-0 flex-1 truncate text-base font-bold">
          {partyName}
        </span>
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <LangThemeControls />
        </div>
      </div>,
    )
    return () => setHeaderSlot(null)
  }, [setHeaderSlot, partyName, navigate, t])

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
    // Matrice par rôle (PLAN-ORG-REFERENTIEL §1) : elle ne contraint QUE les pièces portées EN
    // PROPRE par l'org (org-scopées) — un MAH pur n'a que le contrat (amendement CEO). Les pièces
    // des PRODUITS liés (portefeuille GMP/CoA…) restent visibles : c'est le suivi de validité,
    // la raison d'être du cockpit RA (retour revue : les filtrer créait des cartes fantômes).
    const allowedAdmin = new Set(adminDocTypesForPartyRoles(party.roles).map((d) => d.code))
    return {
      adminTypes: orgTypeCards(
        party,
        data.products,
        data.documents,
        now,
        (d) =>
          d.docType !== 'amm' &&
          categoryForDocType(d.docType, d.category) === 'admin' &&
          (d.partyId !== party.id || allowedAdmin.has(d.docType)),
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
  // Onglets CONTRÔLÉS : « Modifier » depuis le bandeau doit BASCULER sur Identification (sinon le
  // formulaire s'ouvre dans un panneau non affiché et le bouton paraît mort). `activeTab` garde le
  // cas où les rôles changent en direct (isMah → false pendant qu'on est sur Produits) : sans lui,
  // le trigger ET le contenu disparaissent et il ne reste qu'une zone vide sans onglet actif.
  const visibleTabs = isMah
    ? ['identification', 'marque', 'produits', 'amm', 'admin', 'info', 'justif']
    : ['identification', 'admin', 'justif']
  const activeTab = visibleTabs.includes(tab) ? tab : 'identification'
  const startEdit = () => {
    setTab('identification')
    setEditing(true)
  }

  // Sous-titre : la même densité d'information que la fiche produit (pays + volume rattaché).
  const subtitle = [
    party.pays,
    t({
      fr: `${linked.length} produit${linked.length > 1 ? 's' : ''} lié${linked.length > 1 ? 's' : ''}`,
      en: `${linked.length} linked product${linked.length > 1 ? 's' : ''}`,
    }),
    t({
      fr: `${vm?.docCount ?? 0} document${(vm?.docCount ?? 0) > 1 ? 's' : ''}`,
      en: `${vm?.docCount ?? 0} document${(vm?.docCount ?? 0) > 1 ? 's' : ''}`,
    }),
  ]
    .filter(Boolean)
    .join(' · ')

  // Bande méta : 4 emplacements (validés CEO sur le mockup) — identité + conformité GMP.
  const meta: { label: string; value: string }[] = [
    { label: t({ fr: 'Pays', en: 'Country' }), value: party.pays || '—' },
    { label: t({ fr: 'Adresse', en: 'Address' }), value: party.adresse || '—' },
    {
      label: t({ fr: 'N° certificat GMP', en: 'GMP certificate no.' }),
      value: party.gmpCertificat || '—',
    },
    {
      label: t({ fr: 'Échéance GMP', en: 'GMP expiry' }),
      // Date LISIBLE (22/04/2028), pas l'ISO stockée — conforme au mockup validé.
      value: formatDay(party.gmpExpiry, lang),
    },
  ]

  return (
    // `-mx-*` : le cockpit déborde le padding du <main> → bandeau/onglets PLEINE LARGEUR, comme la
    // fiche produit. Les classes `rim-*`/`prod-*` viennent de la feuille partagée importée plus haut.
    <div className="rim-cockpit -mx-4 md:-mx-6">
      <RadixTabs.Root value={activeTab} onValueChange={setTab}>
        {/* ── HAUT FIGÉ : header + méta + onglets (ne bouge pas au scroll) ── */}
        <div className="rim-top">
          <header className="prod-header">
            <span className="prod-ico" aria-hidden>
              <Building2 className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              {/* `h1` : la fiche doit garder un titre de niveau 1 (la classe porte tout le style,
                  la preflight Tailwind neutralise la taille/marge par défaut → rendu identique). */}
              <h1 className="prod-name truncate" title={party.nom}>
                {party.nom}
              </h1>
              {subtitle ? <div className="prod-sub truncate">{subtitle}</div> : null}
              <div className="prod-tags">
                {sortRoles(party.roles).map((r) => (
                  <StatusBadge key={r} tone="info">
                    {t(ROLE_LABEL[r])}
                  </StatusBadge>
                ))}
                {vm && vm.expiredCount > 0 ? (
                  <StatusBadge tone="danger">
                    <AlertCircle />
                    {t({
                      fr: `${vm.expiredCount} expirée${vm.expiredCount > 1 ? 's' : ''}`,
                      en: `${vm.expiredCount} expired`,
                    })}
                  </StatusBadge>
                ) : null}
                {vm && vm.expiringCount > 0 ? (
                  <StatusBadge tone="warning">
                    <Clock3 />
                    {t({
                      fr: `${vm.expiringCount} à renouveler`,
                      en: `${vm.expiringCount} to renew`,
                    })}
                  </StatusBadge>
                ) : null}
                {vm && vm.countries.length > 0 ? (
                  // `role="img"` + noms de pays : `CountryFlag` est aria-hidden, un aria-label sur un
                  // span générique serait IGNORÉ → sans ça, l'info pays n'a aucun équivalent textuel.
                  <span
                    role="img"
                    className="ml-1 flex items-center gap-1"
                    aria-label={vm.countries.map((c) => countryLabel(c, lang)).join(', ')}
                  >
                    {vm.countries.slice(0, 8).map((c) => (
                      <CountryFlag key={c} code={c} size={16} />
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="prod-actions">
              {!editing ? (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil /> {t({ fr: 'Modifier', en: 'Edit' })}
                </Button>
              ) : null}
            </div>
          </header>

          <div className="prod-meta">
            {meta.map((m) => (
              <div key={m.label} className="min-w-0">
                <div className="meta-key">{m.label}</div>
                <div className="meta-val truncate" title={m.value}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Onglets ADAPTÉS AU RÔLE : le titulaire d'AMM détient produits/AMM/docs d'info ; un
              fabricant (ou distributeur) pur n'a que ses pièces admin + les justificatifs. */}
          <RadixTabs.List className="tabs-bar">
            <RadixTabs.Trigger value="identification" className="tab">
              {t({ fr: 'Identification', en: 'Identification' })}
            </RadixTabs.Trigger>
            {isMah ? (
              <RadixTabs.Trigger value="marque" className="tab">
                {t({ fr: 'Marque', en: 'Brand' })}
              </RadixTabs.Trigger>
            ) : null}
            {isMah ? (
              <RadixTabs.Trigger value="produits" className="tab">
                {t({ fr: 'Produits', en: 'Products' })}
              </RadixTabs.Trigger>
            ) : null}
            {isMah ? (
              <RadixTabs.Trigger value="amm" className="tab">
                {t({ fr: 'AMM', en: 'MA' })}
              </RadixTabs.Trigger>
            ) : null}
            <RadixTabs.Trigger value="admin" className="tab">
              {t({ fr: 'Pièces admin', en: 'Admin docs' })}
            </RadixTabs.Trigger>
            {isMah ? (
              <RadixTabs.Trigger value="info" className="tab">
                {t({ fr: 'Documents d’information', en: 'Product information' })}
              </RadixTabs.Trigger>
            ) : null}
            <RadixTabs.Trigger value="justif" className="tab">
              {t({ fr: 'Justificatifs', en: 'Supporting docs' })}
            </RadixTabs.Trigger>
          </RadixTabs.List>
        </div>

        {/* ── CONTENU DÉFILANT ── */}
        <div className="rim-content">
          {/* `forceMount` : Radix DÉMONTE le panneau inactif. Sans ça, ouvrir « Modifier », aller
              voir un autre onglet puis revenir REMET le formulaire à zéro — saisie perdue en
              silence. On le garde monté et simplement masqué (non focusable, invisible aux AT). */}
          <RadixTabs.Content
            value="identification"
            forceMount
            className="outline-none data-[state=inactive]:hidden"
          >
            <OrgIdentification
              party={party}
              orgId={orgId}
              isMah={isMah}
              editing={editing}
              onEdit={startEdit}
              onDone={() => setEditing(false)}
            />
          </RadixTabs.Content>

          {isMah ? (
            <RadixTabs.Content value="marque" className="outline-none">
              <OrgBrandingTab orgId={orgId} partyId={party.id} />
            </RadixTabs.Content>
          ) : null}

          {isMah ? (
            <RadixTabs.Content value="produits" className="outline-none">
              <ProductsList linked={linked} partyId={partyId} />
            </RadixTabs.Content>
          ) : null}

          {/* Upload §3 : chaque onglet documentaire porte son « Ajouter » (types = matrice §1) —
              tout dépôt entre dans la base PROPRE de l'org et devient piochable des produits (§2). */}
          {isMah ? (
            <RadixTabs.Content value="amm" className="space-y-4 outline-none">
              <OrgDocAddButton orgId={orgId} party={party} types={AMM_DOC_TYPE} category="admin" />
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
            </RadixTabs.Content>
          ) : null}

          <RadixTabs.Content value="admin" className="space-y-4 outline-none">
            <OrgDocAddButton
              orgId={orgId}
              party={party}
              types={adminDocTypesForPartyRoles(party.roles)}
              category="admin"
            />
            <TypeCards
              cards={cards.adminTypes}
              partyId={partyId}
              emptyText={t({ fr: 'Aucune pièce administrative', en: 'No administrative document' })}
            />
          </RadixTabs.Content>

          {isMah ? (
            <RadixTabs.Content value="info" className="space-y-4 outline-none">
              <OrgDocAddButton orgId={orgId} party={party} types={INFO_DOC_TYPES} category="info" />
              <TypeCards
                cards={cards.infoTypes}
                partyId={partyId}
                emptyText={t({ fr: 'Aucun document d’information', en: 'No product information' })}
              />
            </RadixTabs.Content>
          ) : null}

          <RadixTabs.Content value="justif" className="outline-none">
            <PieceGrid
              cards={cards.justif}
              emptyText={t({
                fr: 'Aucun justificatif échangé en correspondance',
                en: 'No supporting document exchanged',
              })}
            />
          </RadixTabs.Content>
        </div>
      </RadixTabs.Root>
    </div>
  )
}

/**
 * Onglet « Identification » — miroir de la fiche produit : fiche en lecture seule, le bouton
 * « Modifier » (bandeau OU carte) révèle le formulaire. Porte les champs que la bande méta ne
 * montre pas (e-mail de contact, adresse complète).
 */
function OrgIdentification({
  party,
  orgId,
  isMah,
  editing,
  onEdit,
  onDone,
}: {
  party: PartyRecord
  orgId: string
  /** MAH → le signataire (nom + rôle) des lettres est édité ici (stocké dans le branding party). */
  isMah: boolean
  editing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  const { t, lang } = useI18n()
  // Signataire du MAH : store SÉPARÉ du record `parties` (pro_settings partyBranding) → chargé ici,
  // affiché en lecture et repassé au formulaire d'édition. Non pertinent pour un fabricant pur.
  const branding = useLiveQuery(
    () => (isMah ? getPartyBranding(party.id) : Promise.resolve(undefined)),
    [isMah, party.id],
  )
  return (
    // Primitives PARTAGÉES de la chrome cockpit (`rim-card`, `rim-section-title`, `meta-*`) : un
    // seul chemin de style avec la fiche produit — pas de second jeu de rayons/typos à maintenir.
    <div className="rim-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="rim-section-title">{t({ fr: 'Identification', en: 'Identification' })}</h2>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> {t({ fr: 'Modifier', en: 'Edit' })}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <OrgEditForm
          party={party}
          orgId={orgId}
          isMah={isMah}
          initialSignatory={{
            signataire: branding?.signataire ?? '',
            poste: branding?.poste ?? '',
          }}
          onDone={onDone}
        />
      ) : (
        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t({ fr: 'Nom', en: 'Name' })} value={party.nom} />
          <Field
            label={t({ fr: 'Rôles', en: 'Roles' })}
            value={sortRoles(party.roles)
              .map((r) => t(ROLE_LABEL[r]))
              .join(' · ')}
          />
          <Field label={t({ fr: 'Pays', en: 'Country' })} value={party.pays} />
          <Field label={t({ fr: 'Adresse', en: 'Address' })} value={party.adresse} />
          <Field
            label={t({ fr: 'E-mail de contact', en: 'Contact e-mail' })}
            value={party.contactEmail ?? ''}
          />
          <Field
            label={t({ fr: 'N° certificat GMP', en: 'GMP certificate no.' })}
            value={party.gmpCertificat}
          />
          <Field
            label={t({ fr: 'Échéance GMP', en: 'GMP expiry' })}
            value={formatDay(party.gmpExpiry, lang)}
          />
          {/* Signataire porté sur les lettres où cette org est MAH (bloc signature). */}
          {isMah ? (
            <Field
              label={t({ fr: 'Signataire (lettres)', en: 'Signatory (letters)' })}
              value={branding?.signataire ?? ''}
            />
          ) : null}
          {isMah ? (
            <Field
              label={t({ fr: 'Rôle du signataire', en: 'Signatory role' })}
              value={branding?.poste ?? ''}
            />
          ) : null}
        </dl>
      )}
    </div>
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
  // Types à validité (AMM/GMP/COPP/FSC/ML/CoA) → état. Documents d'info (sans date) → simple
  // décompte, pas de badge. MAIS un type admin hors barème (contract/other_admin) peut recevoir une
  // date d'expiration via DocDatesDialog : s'il a une pièce réellement en défaut, on ne masque pas
  // le signal (retour revue — parité avec l'ancienne grille).
  const hasValidity = requiresExpiry(card.docType) || card.expired > 0 || card.expiring > 0
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

/** Champ en lecture seule — MÊME typographie que la bande méta du cockpit (`meta-key`/`meta-val`). */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="meta-key">{label}</dt>
      <dd className="meta-val break-words">{value || '—'}</dd>
    </div>
  )
}

function OrgEditForm({
  party,
  orgId,
  isMah,
  initialSignatory,
  onDone,
}: {
  party: PartyRecord
  orgId: string
  isMah: boolean
  /** Signataire (nom + rôle) du MAH, chargé du branding party (store ≠ record `parties`). */
  initialSignatory: { signataire: string; poste: string }
  onDone: () => void
}) {
  const { t } = useI18n()
  const [pays, setPays] = useState(party.pays)
  const [adresse, setAdresse] = useState(party.adresse)
  const [gmpCertificat, setGmpCertificat] = useState(party.gmpCertificat)
  const [gmpExpiry, setGmpExpiry] = useState(party.gmpExpiry ?? '')
  const [contactEmail, setContactEmail] = useState(party.contactEmail ?? '')
  const [signataire, setSignataire] = useState(initialSignatory.signataire)
  const [poste, setPoste] = useState(initialSignatory.poste)
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
      // Signataire du MAH → store SÉPARÉ (branding party). GARDE DIRTY OBLIGATOIRE : sans elle, une
      // édition qui NE touche PAS le signataire (ex. corriger l'adresse) réécrirait quand même le
      // record branding — et si le branding n'a pas encore été tiré localement (post-logout, cache
      // purgé), `upsert` repart d'un template tout-à-null → efface logo/en-tête/pied côté serveur
      // (push avant pull). On n'écrit donc QUE si le signataire a réellement changé.
      const signatoryDirty =
        signataire.trim() !== initialSignatory.signataire.trim() ||
        poste.trim() !== initialSignatory.poste.trim()
      if (isMah && signatoryDirty) {
        await setPartySignatory(orgId, party.id, {
          signataire: signataire.trim() || null,
          poste: poste.trim() || null,
        })
        void syncProSettings(orgId)
      }
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
      {/* Signataire des lettres où cette org est MAH — persisté dans le branding party. Le fabricant
          pur ne signe pas de lettre d'AMM → champs masqués. */}
      {isMah ? (
        <div className="space-y-1.5">
          <Label htmlFor="org-signataire">
            {t({ fr: 'Signataire (lettres)', en: 'Signatory (letters)' })}
          </Label>
          <Input
            id="org-signataire"
            value={signataire}
            maxLength={120}
            placeholder={t({ fr: 'Ex. Dr Aïcha Koné', en: 'e.g. Dr Aïcha Koné' })}
            onChange={(e) => setSignataire(e.target.value)}
          />
        </div>
      ) : null}
      {isMah ? (
        <div className="space-y-1.5">
          <Label htmlFor="org-poste">{t({ fr: 'Rôle du signataire', en: 'Signatory role' })}</Label>
          <Input
            id="org-poste"
            value={poste}
            maxLength={120}
            placeholder={t({ fr: 'Ex. Pharmacien responsable', en: 'e.g. Responsible pharmacist' })}
            onChange={(e) => setPoste(e.target.value)}
          />
        </div>
      ) : null}
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
