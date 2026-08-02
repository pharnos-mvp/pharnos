import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Tabs as RadixTabs } from 'radix-ui'
import {
  ArrowLeft,
  FileStack,
  FileText,
  Landmark,
  PackageOpen,
  Receipt,
  ShieldCheck,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ListRow, ListRowIcon, ListRowLink } from '@/components/ui/list-row'
import { Page } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/status-badge'
import { useHeaderSlot } from '@/components/layout/header-slot'
import { LangThemeControls } from '@/components/layout/lang-theme-controls'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
// Index GÉNÉRÉ par `build:landing-modeles` — même source que la bibliothèque publique. Léger
// (~4 Ko) là où le manifeste complet en pèse 140 : on n'a besoin ici que de noms et de pays.
import { MODELES_INDEX } from '../../../../landing/checking/modeles-index.js'
import { anyActivityLabel, countryLabel, formatLabel } from '@/features/workspace/dossier-constants'
import {
  lifecycleStatusLabel,
  type LifecycleStatus,
} from '@/features/workspace/lifecycle-constants'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { authorityDetail } from './authorities-data'
import { ProductIcon } from './product-icon'
import {
  FEE_LABEL,
  FEE_NOTE_LABEL,
  resolvedAuthorityDetail,
  type RefProvenance,
} from './ref-content'
import { RefOverrideDialog, type OverrideField } from './RefOverrideDialog'
import type { OverridePath } from './ref-overrides'
import { RefUpdateBanner } from './RefUpdateBanner'
// Chrome du cockpit RIM (bandeau + méta + onglets soulignés, haut figé) — la MÊME que les fiches
// produit et organisation. Une fiche d'autorité qui se lirait autrement obligerait l'expert à
// réapprendre une page qu'il ouvre entre deux autres.
import './product-cockpit.css'

const LANG_FULL: Record<string, Translatable> = {
  fr: { fr: 'Français', en: 'French' },
  en: { fr: 'Anglais', en: 'English' },
  pt: { fr: 'Portugais', en: 'Portuguese' },
}

/** Date LISIBLE (22/04/2028), jamais l'ISO stockée — même règle que les autres cockpits. */
function formatDay(iso: string | null | undefined, lang: 'fr' | 'en'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')
}

export function AutoriteCockpit() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const setHeaderSlot = useHeaderSlot()
  const { code = '' } = useParams()
  const [tab, setTab] = useState('identification')
  // Rendu immédiat sur le socle code, remplacé par le référentiel publié (0071) dès que la
  // réplique locale répond — même contenu tant que seed == code, mais avec provenance + version.
  // `resolved` : undefined = chargement (useLiveQuery), null = pays inconnu des deux sources.
  const fallback = useMemo(() => authorityDetail(code), [code])

  // Modèles servis POUR CE PAYS.
  //
  // ⚠️ L'onglet liste EXACTEMENT ce que la bibliothèque sert sous ce drapeau, et se tait quand
  // elle ne sert rien. Le référentiel d'agences couvre aussi le Ghana, hors UEMOA : sans cela, sa
  // fiche annonçait « 4 modèles déjà réglés » et renvoyait vers une bibliothèque qui rejette `gh`.
  // Le Nigeria, lui, n'a qu'un modèle — le gabarit RCP de la NAFDAC — et n'en montre qu'un.
  const pays = countryLabel(code, lang)
  const k = code.toLowerCase()
  const modeles = useMemo(() => MODELES_INDEX.filter((m) => m.pays.includes(k)), [k])
  // Liens vers la bibliothèque PUBLIQUE, déjà réglée sur ce pays — l'expert n'y refait pas le
  // choix qu'il vient de faire en ouvrant cette fiche. Les pages EN existent : y envoyer un
  // utilisateur anglophone sur la version française serait un aller simple hors de sa langue.
  const PUBLIC = 'https://pharnos.com'
  const lienBibliotheque = () =>
    `${PUBLIC}${lang === 'en' ? '/en/regulatory-library' : '/bibliotheque-reglementaire'}?pays=${encodeURIComponent(k)}`
  const lienModele = (slug: string) =>
    `${PUBLIC}${lang === 'en' ? '/en/template' : '/modele'}?doc=${encodeURIComponent(slug)}&pays=${encodeURIComponent(k)}`
  const resolved = useLiveQuery(() => resolvedAuthorityDetail(code, orgId), [code, orgId])
  const detail = resolved?.detail ?? fallback
  const provenance = resolved?.provenance
  const versionLabel = resolved?.versionLabel ?? null
  // Adaptations locales (P4.3) : le résolveur les a déjà appliquées — ici on ne fait que les
  // SIGNALER (badge « Adapté ») et offrir l'édition. La valeur OFFICIELLE de repère du formulaire
  // vient du socle/version, donc du détail NON adapté.
  const adapted = resolved?.adapted ?? []
  const isAdapted = (path: OverridePath) => adapted.includes(path)
  const overrideFields: OverrideField[] = useMemo(() => {
    // Repère officiel : l'agence AVANT adaptations quand il y en a, sinon l'agence résolue.
    const off = resolved?.officialAgency ?? resolved?.detail.agency ?? fallback?.agency
    const cur = resolved?.detail.agency
    const a = resolved?.adapted ?? []
    const f = (path: OverridePath, officialValue: string, localValue: string): OverrideField => ({
      path,
      official: officialValue,
      local: a.includes(path) ? localValue : '',
      adapted: a.includes(path),
    })
    return [
      f('agency.directeur', off?.directeur ?? '', cur?.directeur ?? ''),
      f('agency.sexe', off?.sexe ?? '', cur?.sexe ?? ''),
      f('agency.adresse', off?.adresse ?? '', cur?.adresse ?? ''),
      f('agency.telephone', off?.telephone ?? '', cur?.telephone ?? ''),
      f('agency.email', off?.email ?? '', cur?.email ?? ''),
      f('notes.internal', '', resolved?.internalNote ?? ''),
    ]
  }, [resolved, fallback])

  // En-tête applicatif PLEIN (façon fiche produit/organisation) : retour + nom de l'agence ;
  // libéré au démontage. Le bandeau plein masquerait langue/thème → on réinjecte la primitive.
  const agencyName = detail?.agency.name
  useEffect(() => {
    if (!setHeaderSlot) return
    if (!agencyName) {
      setHeaderSlot(null)
      return
    }
    setHeaderSlot(
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Retour aux autorités', en: 'Back to authorities' })}
          onClick={() => navigate('/catalogue/autorites')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-display min-w-0 flex-1 truncate text-base font-bold">
          {agencyName}
        </span>
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <LangThemeControls />
        </div>
      </div>,
    )
    return () => setHeaderSlot(null)
  }, [setHeaderSlot, agencyName, navigate, t])

  /**
   * Mon empreinte DANS CE PAYS — dossiers, AMM, et les produits qui en découlent.
   *
   * Les produits ne sont pas interrogés « par pays » : aucun index ne porte cette question. Ils
   * sont DÉDUITS des AMM et des dossiers du pays, ce qui répond exactement à « quels produits
   * ai-je engagés devant cette agence ? » — la seule lecture que la fiche puisse promettre sans
   * mentir. Un produit du catalogue sans AMM ni dossier ici n'y a rien à faire.
   */
  const empreinte = useLiveQuery(async () => {
    const [dossiers, documents, produits] = await Promise.all([
      db.dossiers.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
      db.products.where('orgId').equals(orgId).toArray(),
    ])
    const mesDossiers = dossiers
      .filter((d) => d.deletedAt == null && d.country === code)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const mesAmm = documents
      .filter((d) => d.deletedAt == null && d.docType === 'amm' && d.country?.trim() === code)
      .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''))
    const nomDe = new Map(produits.map((p) => [p.id, p]))
    const idsEngages = new Set([
      ...mesAmm.map((d) => d.productId),
      ...mesDossiers.map((d) => d.productId),
    ])
    const mesProduits = produits
      .filter((p) => p.deletedAt == null && idsEngages.has(p.id))
      .sort((a, b) => a.nomCommercial.localeCompare(b.nomCommercial))
    return { dossiers: mesDossiers, amm: mesAmm, produits: mesProduits, nomDe }
  }, [orgId, code])

  // Pays absent du socle code mais potentiellement servi par le référentiel (raison d'être de
  // P4) : pendant la résolution, ne pas flasher « introuvable » — page vide un frame.
  if (resolved === undefined && !fallback) return <Page />

  if (!detail) {
    return (
      <Page>
        <EmptyState
          icon={<Landmark />}
          title={t({ fr: 'Autorité introuvable', en: 'Authority not found' })}
          description={t({
            fr: 'Cette autorité n’est pas encore référencée.',
            en: 'This authority is not referenced yet.',
          })}
          action={
            <Button asChild variant="outline">
              <Link to="/catalogue/autorites">
                {t({ fr: 'Retour aux autorités', en: 'Back to authorities' })}
              </Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const { agency, profile } = detail

  // Sous-titre : la même densité d'information que les fiches produit et organisation.
  const subtitle = [
    agency.full,
    t({
      fr: `${empreinte?.dossiers.length ?? 0} dossier${(empreinte?.dossiers.length ?? 0) > 1 ? 's' : ''}`,
      en: `${empreinte?.dossiers.length ?? 0} submission${(empreinte?.dossiers.length ?? 0) > 1 ? 's' : ''}`,
    }),
    t({
      fr: `${empreinte?.amm.length ?? 0} AMM`,
      en: `${empreinte?.amm.length ?? 0} MA${(empreinte?.amm.length ?? 0) > 1 ? 's' : ''}`,
    }),
  ]
    .filter(Boolean)
    .join(' · ')

  // Bande méta : ce dont on a besoin pour ADRESSER un courrier — la question qu'on vient poser à
  // cette fiche. Le reste (langue, référentiel) tient dans les badges.
  const meta: { label: string; value: string }[] = [
    {
      label: t({ fr: 'Destinataire des lettres', en: 'Letter recipient' }),
      value: [detail.civilite, agency.directeur].filter(Boolean).join(' — ') || '—',
    },
    { label: t({ fr: 'Adresse', en: 'Address' }), value: agency.adresse || '—' },
    { label: t({ fr: 'Téléphone', en: 'Phone' }), value: agency.telephone || '—' },
    { label: t({ fr: 'E-mail', en: 'Email' }), value: agency.email || '—' },
  ]

  return (
    // `-mx-*` : le cockpit déborde le padding du <main> → bandeau/onglets PLEINE LARGEUR, comme
    // les fiches produit et organisation.
    <div className="rim-cockpit -mx-4 md:-mx-6">
      <RadixTabs.Root value={tab} onValueChange={setTab}>
        {/* ── HAUT FIGÉ : header + méta + onglets (ne bouge pas au scroll) ── */}
        <div className="rim-top">
          {/* Mise à jour publiée mais pas encore adoptée par l'org (P4.2) — consentement explicite. */}
          <RefUpdateBanner country={code} />

          <header className="prod-header">
            <span className="prod-ico" aria-hidden>
              <Landmark className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="prod-name truncate" title={agency.name}>
                {agency.name}
              </h1>
              {subtitle ? (
                <div className="prod-sub truncate" title={subtitle}>
                  {subtitle}
                </div>
              ) : null}
              <div className="prod-tags">
                <span className="inline-flex items-center gap-1">
                  <CountryFlag code={code} size={16} />
                  <span className="text-sm">{pays}</span>
                </span>
                <StatusBadge tone="neutral">
                  {t({ fr: 'Soumission en', en: 'Submission in' })}{' '}
                  {t(
                    LANG_FULL[detail.officialLang] ?? {
                      fr: detail.officialLang,
                      en: detail.officialLang,
                    },
                  )}
                </StatusBadge>
                {versionLabel ? (
                  <StatusBadge tone="info">
                    {t({ fr: 'Référentiel', en: 'Reference data' })} {versionLabel}
                  </StatusBadge>
                ) : null}
                {adapted.length > 0 ? (
                  <StatusBadge tone="warning">
                    {t({ fr: 'Adapté', en: 'Adapted' })} · {adapted.length}
                  </StatusBadge>
                ) : null}
              </div>
            </div>
            {/* Adapter = admin d'org seul (le dialog se masque de lui-même sinon). */}
            <div className="prod-actions">
              <RefOverrideDialog
                country={code}
                orgId={orgId}
                fields={overrideFields}
                onDone={() => undefined}
              />
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

          {/* Six onglets, dans l'ordre où la question se pose : QUI est l'agence, CE QU'ELLE EXIGE,
              AVEC QUOI on y répond — puis ce que j'ai déjà engagé devant elle.

              « Dossiers » plutôt qu'« Activités » : dans Pharnos, une ACTIVITÉ est l'acte
              réglementaire (enregistrement / renouvellement / variation) — c'est le mot du
              sélecteur du builder et des lettres. Un onglet « Activités » aurait nommé deux choses
              différentes avec le même mot, sur une page que lisent des experts RA. */}
          <RadixTabs.List className="tabs-bar">
            <RadixTabs.Trigger value="identification" className="tab">
              {t({ fr: 'Identification', en: 'Identification' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="exigences" className="tab">
              {t({ fr: 'Exigences', en: 'Requirements' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="modeles" className="tab">
              {t({ fr: 'Modèles', en: 'Templates' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="produits" className="tab">
              {t({ fr: 'Produits', en: 'Products' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="amm" className="tab">
              {t({ fr: 'AMM', en: 'MA' })}
            </RadixTabs.Trigger>
            <RadixTabs.Trigger value="dossiers" className="tab">
              {t({ fr: 'Dossiers', en: 'Submissions' })}
            </RadixTabs.Trigger>
          </RadixTabs.List>
        </div>

        {/* ── CONTENU DÉFILANT ── */}
        <div className="rim-content">
          <RadixTabs.Content value="identification" className="outline-none">
            <section className="rim-card p-5">
              <h2 className="rim-section-title">{t({ fr: 'L’agence', en: 'The authority' })}</h2>
              <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label={t({ fr: 'Nom complet', en: 'Full name' })} value={agency.full} />
                <Field
                  label={t({ fr: 'Destinataire des lettres', en: 'Letter recipient' })}
                  value={[detail.civilite, agency.directeur].filter(Boolean).join(' — ')}
                  adapted={isAdapted('agency.directeur') || isAdapted('agency.sexe')}
                />
                <Field
                  label={t({ fr: 'Adresse', en: 'Address' })}
                  value={agency.adresse}
                  adapted={isAdapted('agency.adresse')}
                />
                <Field
                  label={t({ fr: 'Téléphone', en: 'Phone' })}
                  value={agency.telephone ?? ''}
                  adapted={isAdapted('agency.telephone')}
                />
                <Field
                  label={t({ fr: 'E-mail', en: 'Email' })}
                  value={agency.email ?? ''}
                  adapted={isAdapted('agency.email')}
                />
                <Field
                  label={t({ fr: 'Langue de soumission', en: 'Submission language' })}
                  value={t(
                    LANG_FULL[detail.officialLang] ?? {
                      fr: detail.officialLang,
                      en: detail.officialLang,
                    },
                  )}
                />
              </dl>
              <SourceLine provenance={provenance?.agency} />
              {adapted.length > 0 ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t({
                    fr: 'Valeurs adaptées par votre organisation — une mise à jour du référentiel ne les écrasera pas',
                    en: 'Values adapted by your organisation — a reference-data update will not overwrite them',
                  })}
                  {resolved?.adaptedByEmail ? ` · ${resolved.adaptedByEmail}` : ''}
                </p>
              ) : null}
              {resolved?.internalNote ? (
                <p className="border-info/30 bg-info-subtle/50 mt-3 rounded-lg border p-2.5 text-sm">
                  <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {t({ fr: 'Note interne', en: 'Internal note' })}
                  </span>
                  <br />
                  {resolved.internalNote}
                </p>
              ) : null}
            </section>
          </RadixTabs.Content>

          <RadixTabs.Content value="exigences" className="outline-none">
            {profile ? (
              <section className="rim-card space-y-4 p-5">
                <div>
                  <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                    <Receipt className="size-3.5" /> {t({ fr: 'Redevances', en: 'Fees' })}
                  </div>
                  <ul className="divide-border divide-y">
                    {(['new_ma', 'renewal', 'variation_minor', 'variation_major'] as const)
                      .filter((f) => profile.fees[f] != null)
                      .map((f) => (
                        <li key={f} className="flex items-center justify-between py-1.5 text-sm">
                          <span>{t(FEE_LABEL[f])}</span>
                          <span className="font-medium tabular-nums">
                            {profile.fees[f]?.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}{' '}
                            {profile.currency}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {profile.fees.notes ? (
                    <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                      {(['new_ma', 'renewal', 'variation'] as const)
                        .filter((f) => profile.fees.notes?.[f] != null)
                        .map((f) => (
                          <li key={f}>
                            <span className="font-medium">{t(FEE_NOTE_LABEL[f])}</span> —{' '}
                            {t(profile.fees.notes![f]!)}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>

                {profile.submissionNote ? (
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      {t({ fr: 'Dépôt : ', en: 'Filing: ' })}
                    </span>
                    {t(profile.submissionNote)}
                  </div>
                ) : null}

                {profile.processingDays ? (
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      {t({ fr: 'Délai indicatif : ', en: 'Indicative timeline: ' })}
                    </span>
                    <span className="font-medium">
                      {t({
                        fr: `${profile.processingDays} jours`,
                        en: `${profile.processingDays} days`,
                      })}
                    </span>
                  </div>
                ) : null}

                {profile.samples.new_ma || profile.samples.renewal_variation ? (
                  <div>
                    <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                      {t({ fr: 'Échantillons', en: 'Samples' })}
                    </div>
                    <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                      {[
                        ...(profile.samples.new_ma ?? []),
                        ...(profile.samples.renewal_variation ?? []),
                      ].map((s, i) => (
                        <li key={i}>{t(s)}</li>
                      ))}
                    </ul>
                    {profile.samples.reserve ? (
                      <p className="text-muted-foreground mt-2 text-xs italic">
                        {t(profile.samples.reserve)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <SourceLine
                  provenance={provenance?.fees ?? provenance?.submission ?? provenance?.samples}
                />
              </section>
            ) : (
              <EmptyState
                icon={<Receipt />}
                title={t({ fr: 'Barème non renseigné', en: 'Fee schedule not provided' })}
                description={t({
                  fr: 'Le barème officiel de ce pays n’est pas encore au référentiel. Le montage applique le barème générique.',
                  en: 'This country’s official fee schedule is not in the reference data yet. Submissions use the generic schedule.',
                })}
              />
            )}
          </RadixTabs.Content>

          <RadixTabs.Content value="modeles" className="outline-none">
            {modeles.length > 0 ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground text-sm">
                    {t({
                      fr: `${modeles.length} modèle${modeles.length > 1 ? 's' : ''} officiel${modeles.length > 1 ? 's' : ''} — ceux qui varient d’un pays à l’autre sont réglés pour ${pays}. Gratuits, sans inscription.`,
                      en: `${modeles.length} official template${modeles.length > 1 ? 's' : ''} — those that vary by country are set for ${pays}. Free, no sign-up.`,
                    })}
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <a href={lienBibliotheque()} target="_blank" rel="noreferrer">
                      <FileText className="size-4" />
                      {t({ fr: 'Ouvrir la bibliothèque', en: 'Open the library' })}
                    </a>
                  </Button>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {modeles.map((m) => (
                    <li key={m.slug}>
                      <ListRow>
                        <ListRowIcon>
                          <FileText className="size-4" />
                        </ListRowIcon>
                        <span className="min-w-0 flex-1">
                          {/* `to` absolu : react-router laisse le navigateur suivre une URL d'une
                              AUTRE origine. La bibliothèque est un site public, hors application. */}
                          <ListRowLink to={lienModele(m.slug)} target="_blank" rel="noreferrer">
                            {lang === 'en' ? m.nom[1] : m.nom[0]}
                          </ListRowLink>
                          <span className="text-muted-foreground block truncate text-xs">
                            {m.activites
                              ? t({ fr: 'Selon l’activité', en: 'Depends on the activity' })
                              : t({ fr: 'Prêt à télécharger', en: 'Ready to download' })}
                          </span>
                        </span>
                      </ListRow>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <EmptyState
                icon={<FileText />}
                title={t({ fr: 'Aucun modèle pour ce pays', en: 'No template for this country' })}
                description={t({
                  fr: 'La bibliothèque ne sert encore aucun gabarit officiel sous ce drapeau.',
                  en: 'The library does not serve any official template for this country yet.',
                })}
              />
            )}
          </RadixTabs.Content>

          <RadixTabs.Content value="produits" className="outline-none">
            {empreinte && empreinte.produits.length > 0 ? (
              <ul className="grid gap-2">
                {empreinte.produits.map((p) => (
                  <li key={p.id}>
                    <ListRow>
                      <ListRowIcon>
                        <ProductIcon forme={p.forme} className="size-4" />
                      </ListRowIcon>
                      <span className="min-w-0 flex-1">
                        <ListRowLink to={`/catalogue/${p.id}`}>{p.nomCommercial}</ListRowLink>
                        <span className="text-muted-foreground block truncate text-xs">
                          {[p.dci, p.dosage, p.forme].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </ListRow>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<PackageOpen />}
                title={t({ fr: 'Aucun produit engagé ici', en: 'No product engaged here' })}
                description={t({
                  fr: `Les produits qui portent une AMM ou un dossier ${pays ? `pour ${pays}` : 'dans ce pays'} apparaîtront ici.`,
                  en: `Products holding an MA or a submission in this country will appear here.`,
                })}
              />
            )}
          </RadixTabs.Content>

          <RadixTabs.Content value="amm" className="outline-none">
            {empreinte && empreinte.amm.length > 0 ? (
              <ul className="grid gap-2">
                {empreinte.amm.map((d) => {
                  const p = empreinte.nomDe.get(d.productId)
                  return (
                    <li key={d.id}>
                      <ListRow>
                        <ListRowIcon>
                          <ShieldCheck className="size-4" />
                        </ListRowIcon>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {p?.nomCommercial ?? d.fileName}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {[
                              d.reference,
                              d.issueDate
                                ? `${t({ fr: 'octroyée le', en: 'granted' })} ${formatDay(d.issueDate, lang)}`
                                : '',
                              d.expiryDate
                                ? `${t({ fr: 'échéance', en: 'expiry' })} ${formatDay(d.expiryDate, lang)}`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ') || t({ fr: 'Sans référence', en: 'No reference' })}
                          </span>
                        </span>
                      </ListRow>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                icon={<ShieldCheck />}
                title={t({ fr: 'Aucune AMM enregistrée', en: 'No registered MA' })}
                description={t({
                  fr: 'Les AMM que vous saisissez avec ce pays apparaîtront ici, avec leur numéro et leur échéance.',
                  en: 'MAs you record for this country will appear here, with their number and expiry.',
                })}
              />
            )}
          </RadixTabs.Content>

          <RadixTabs.Content value="dossiers" className="outline-none">
            {empreinte && empreinte.dossiers.length > 0 ? (
              <ul className="grid gap-2">
                {empreinte.dossiers.map((d) => (
                  <li key={d.id}>
                    <ListRow>
                      <ListRowIcon>
                        <FileStack className="size-4" />
                      </ListRowIcon>
                      <span className="min-w-0 flex-1">
                        <ListRowLink to={`/workspace/${d.id}`}>{d.productName}</ListRowLink>
                        <span className="text-muted-foreground block truncate text-xs">
                          {[
                            anyActivityLabel(d.activity, lang),
                            formatLabel(d.format),
                            lifecycleStatusLabel(d.status as LifecycleStatus, lang),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </ListRow>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<FileStack />}
                title={t({
                  fr: 'Aucun dossier pour ce pays',
                  en: 'No submission for this country',
                })}
                description={t({
                  fr: 'Les montages CTD que vous ouvrez sur ce pays apparaîtront ici.',
                  en: 'CTD submissions you open for this country will appear here.',
                })}
              />
            )}
          </RadixTabs.Content>
        </div>
      </RadixTabs.Root>
    </div>
  )
}

/**
 * Ligne de provenance d'une section — la source officielle citée par le référentiel versionné
 * (0071). Rien n'est rendu sur le socle code (pas de provenance structurée) : l'affichage
 * apparaît dès que la réplique locale est peuplée.
 */
function SourceLine({ provenance }: { provenance?: RefProvenance }) {
  const { t } = useI18n()
  if (!provenance?.texte) return null
  const parts = [provenance.texte, provenance.jo, provenance.complements].filter(Boolean)
  return (
    <p className="text-muted-foreground mt-3 text-xs">
      <span aria-hidden className="text-info font-semibold">
        §
      </span>{' '}
      <span className="font-medium">{t({ fr: 'Source : ', en: 'Source: ' })}</span>
      {parts.join(' — ')}
    </p>
  )
}

function Field({
  label,
  value,
  adapted = false,
}: {
  label: string
  value: string
  /** Champ dont la valeur vient de l'ORG, pas du référentiel officiel (P4.3). */
  adapted?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
        {label}
        {adapted ? (
          <span className="text-warning-subtle-foreground normal-case">
            · {t({ fr: 'adapté', en: 'adapted' })}
          </span>
        ) : null}
      </dt>
      <dd className="mt-0.5 text-sm break-words">
        {value || <span className="text-muted-foreground/60">—</span>}
      </dd>
    </div>
  )
}

// Le composant `Stat` a disparu avec l'ancienne section « Mon activité » : deux compteurs muets
// (« 3 dossiers », « 1 AMM ») que rien ne permettait d'ouvrir. Les onglets Dossiers, AMM et
// Produits montrent désormais les LIGNES elles-mêmes, cliquables — la question suivante de
// l'expert (« lesquels ? ») ne l'oblige plus à quitter la fiche pour aller les chercher.
