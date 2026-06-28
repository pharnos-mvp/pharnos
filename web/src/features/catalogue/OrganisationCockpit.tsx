import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, Building2, Clock3, PackageOpen, Pencil, ShieldCheck } from 'lucide-react'
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
import { useTopbar } from '@/components/layout/topbar'
import { KPI_BADGE_TONE } from '@/features/dashboard/dashboard-data'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useOrgId } from '@/features/org/org-context'
import { db, type PartyRecord, type PartyRole } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { docTypeLabel } from './doc-types'
import { ProductIcon } from './product-icon'
import {
  buildOrgCockpitVm,
  sortRoles,
  type OrgCockpitVm,
  type PieceTypeValidity,
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
    const [party, products, documents] = await Promise.all([
      db.parties.get(partyId),
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
    ])
    return { party, products, documents }
  }, [orgId, partyId])

  const party = data?.party && data.party.deletedAt === null ? data.party : undefined

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
      party && data
        ? buildOrgCockpitVm(party, data.products, data.documents, new Date())
        : undefined,
    [party, data],
  )

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
          </dl>
        )}
      </div>

      {/* Portefeuille AMM — responsabilité du titulaire d'AMM. */}
      {vm && party.roles.includes('titulaire') && vm.amm.total > 0 ? <AmmPanel vm={vm} /> : null}

      {/* Validité des pièces — suivi des échéances (politique Monitor). */}
      {vm && vm.pieces.length > 0 ? <PiecesPanel pieces={vm.pieces} /> : null}

      {/* Produits liés */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold">
          {t({
            fr: `Produits liés (${linked.length})`,
            en: `Linked products (${linked.length})`,
          })}
        </h2>
        {linked.length === 0 ? (
          <EmptyState
            icon={<PackageOpen />}
            title={t({ fr: 'Aucun produit lié', en: 'No linked product' })}
            description={t({
              fr: 'Aucun produit ne désigne encore cette organisation comme titulaire ou fabricant.',
              en: 'No product yet names this organization as holder or manufacturer.',
            })}
          />
        ) : (
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
        )}
      </section>
    </Page>
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

/** Portefeuille d'AMM (rôle titulaire) : total / actives / à renouveler / périmées + ventilation pays. */
function AmmPanel({ vm }: { vm: OrgCockpitVm }) {
  const { t, lang } = useI18n()
  const { amm } = vm
  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold">
        {t({ fr: "Portefeuille d'AMM", en: 'MA portfolio' })}
      </h2>
      <div className="bg-card space-y-4 rounded-xl border p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AmmTile value={amm.total} label={t({ fr: 'Total', en: 'Total' })} tone="total" />
          <AmmTile value={amm.active} label={t({ fr: 'Actives', en: 'Active' })} tone="active" />
          <AmmTile
            value={amm.expiring}
            label={t({ fr: 'À renouveler', en: 'Renewals' })}
            tone="expiring"
          />
          <AmmTile
            value={amm.expired}
            label={t({ fr: 'Expirées', en: 'Expired' })}
            tone="expired"
          />
        </div>
        {amm.byCountry.length > 0 ? (
          <ul className="divide-border divide-y">
            {amm.byCountry.map((c) => (
              <li key={c.code} className="flex items-center gap-2 py-2 text-sm">
                {c.code === '—' ? (
                  <span className="text-muted-foreground w-4 text-center">—</span>
                ) : (
                  <CountryFlag code={c.code} size={16} />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {c.code === '—'
                    ? t({ fr: 'Pays non précisé', en: 'Unspecified country' })
                    : countryLabel(c.code, lang)}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t({ fr: `${c.total} AMM`, en: `${c.total} MA` })}
                </span>
                {c.expired > 0 ? <StatusBadge tone="danger">{c.expired}</StatusBadge> : null}
                {c.expiring > 0 ? <StatusBadge tone="warning">{c.expiring}</StatusBadge> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

/** Suivi de validité par type de pièce (GMP, ML, AMM, CoPP, FSC, CoA…) — politique Monitor. */
function PiecesPanel({ pieces }: { pieces: PieceTypeValidity[] }) {
  const { t, lang } = useI18n()
  const expiryText = (daysLeft: number) =>
    daysLeft < 0
      ? t({ fr: `Périmé depuis ${-daysLeft} j`, en: `${-daysLeft}d overdue` })
      : t({ fr: `Expire dans ${daysLeft} j`, en: `in ${daysLeft}d` })
  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-semibold">
        {t({ fr: 'Validité des pièces', en: 'Document validity' })}
      </h2>
      <div className="flex flex-col gap-2">
        {pieces.map((pv) => (
          <div
            key={pv.docType}
            className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="font-display truncate text-sm font-semibold">
                {docTypeLabel(pv.docType, lang)}
              </div>
              <div className="text-muted-foreground mt-0.5 truncate text-xs">
                {t({ fr: `${pv.valid}/${pv.total} à jour`, en: `${pv.valid}/${pv.total} valid` })}
                {pv.next ? ` · ${pv.next.productName}` : ''}
              </div>
            </div>
            {pv.next ? (
              <span className="text-muted-foreground hidden text-xs sm:inline">
                {expiryText(pv.next.daysLeft)}
              </span>
            ) : null}
            <PieceBadge pv={pv} />
          </div>
        ))}
      </div>
    </section>
  )
}

function PieceBadge({ pv }: { pv: PieceTypeValidity }) {
  const { t } = useI18n()
  if (pv.expired > 0)
    return (
      <StatusBadge tone="danger">
        <AlertCircle />
        {t({ fr: 'Périmée', en: 'Expired' })}
      </StatusBadge>
    )
  if (pv.expiring > 0)
    return (
      <StatusBadge tone={KPI_BADGE_TONE[pv.tone]}>
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
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await updateParty(party.id, {
        pays: pays.trim(),
        adresse: adresse.trim(),
        gmpCertificat: gmpCertificat.trim(),
        gmpExpiry: gmpExpiry || null,
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
