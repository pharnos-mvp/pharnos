import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, PackageOpen, Pencil } from 'lucide-react'
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
import { useOrgId } from '@/features/org/org-context'
import { db, type PartyRecord, type PartyRole } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { ProductIcon } from './product-icon'
import { sortRoles } from './parties-data'
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
    const [party, products] = await Promise.all([
      db.parties.get(partyId),
      db.products.where('orgId').equals(orgId).toArray(),
    ])
    return { party, products }
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
