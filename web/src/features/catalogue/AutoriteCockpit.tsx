import { useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileStack, FileText, Landmark, Receipt, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Page } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/status-badge'
import { useTopbar } from '@/components/layout/topbar'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
// Index GÉNÉRÉ par `build:landing-modeles` — même source que la bibliothèque publique. Léger
// (~4 Ko) là où le manifeste complet en pèse 140 : on n'a besoin ici que de noms et de pays.
import { MODELES_INDEX } from '../../../../landing/checking/modeles-index.js'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { authorityDetail } from './authorities-data'
import {
  FEE_LABEL,
  FEE_NOTE_LABEL,
  resolvedAuthorityDetail,
  type RefProvenance,
} from './ref-content'
import { RefOverrideDialog, type OverrideField } from './RefOverrideDialog'
import type { OverridePath } from './ref-overrides'
import { RefUpdateBanner } from './RefUpdateBanner'

const LANG_FULL: Record<string, Translatable> = {
  fr: { fr: 'Français', en: 'French' },
  en: { fr: 'Anglais', en: 'English' },
  pt: { fr: 'Portugais', en: 'Portuguese' },
}

export function AutoriteCockpit() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const { code = '' } = useParams()
  // Rendu immédiat sur le socle code, remplacé par le référentiel publié (0071) dès que la
  // réplique locale répond — même contenu tant que seed == code, mais avec provenance + version.
  // `resolved` : undefined = chargement (useLiveQuery), null = pays inconnu des deux sources.
  const fallback = useMemo(() => authorityDetail(code), [code])

  // Modèles servis POUR CE PAYS.
  //
  // ⚠️ La section liste EXACTEMENT ce que la bibliothèque sert sous ce drapeau, et se tait quand
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

  useTopbar({
    title: detail?.agency.name,
    backTo: '/catalogue/autorites',
    searchHidden: true,
  })

  const counts = useLiveQuery(async () => {
    const [dossiers, documents] = await Promise.all([
      db.dossiers.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
    ])
    return {
      dossiers: dossiers.filter((d) => d.deletedAt == null && d.country === code).length,
      amm: documents.filter(
        (d) => d.deletedAt == null && d.docType === 'amm' && d.country?.trim() === code,
      ).length,
    }
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

  return (
    <Page>
      {/* Mise à jour publiée mais pas encore adoptée par l'org (P4.2) — consentement explicite. */}
      <RefUpdateBanner country={code} />

      {/* En-tête */}
      <div className="bg-card rounded-xl border p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 dark:from-[#241b3b] dark:to-[#33245e] dark:text-violet-300"
          >
            <Landmark className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold tracking-tight">{agency.name}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">{agency.full}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1">
                <CountryFlag code={code} size={16} />
                <span className="text-sm">{countryLabel(code, lang)}</span>
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
          <RefOverrideDialog
            country={code}
            orgId={orgId}
            fields={overrideFields}
            onDone={() => undefined}
          />
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
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
          {agency.telephone ? (
            <Field
              label={t({ fr: 'Téléphone', en: 'Phone' })}
              value={agency.telephone}
              adapted={isAdapted('agency.telephone')}
            />
          ) : null}
          {agency.email ? (
            <Field
              label={t({ fr: 'E-mail', en: 'Email' })}
              value={agency.email}
              adapted={isAdapted('agency.email')}
            />
          ) : null}
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
      </div>

      {/* Exigences nationales (barème) */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold">
          {t({ fr: 'Exigences nationales', en: 'National requirements' })}
        </h2>
        {profile ? (
          <div className="bg-card space-y-4 rounded-xl border p-4">
            <div>
              <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                <Receipt className="size-3.5" /> {t({ fr: 'Redevances', en: 'Fees' })}
              </div>
              <ul className="divide-border divide-y">
                {(['new_ma', 'renewal', 'variation_minor', 'variation_major'] as const)
                  .filter((k) => profile.fees[k] != null)
                  .map((k) => (
                    <li key={k} className="flex items-center justify-between py-1.5 text-sm">
                      <span>{t(FEE_LABEL[k])}</span>
                      <span className="font-medium tabular-nums">
                        {profile.fees[k]?.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}{' '}
                        {profile.currency}
                      </span>
                    </li>
                  ))}
              </ul>
              {profile.fees.notes ? (
                <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                  {(['new_ma', 'renewal', 'variation'] as const)
                    .filter((k) => profile.fees.notes?.[k] != null)
                    .map((k) => (
                      <li key={k}>
                        <span className="font-medium">{t(FEE_NOTE_LABEL[k])}</span> —{' '}
                        {t(profile.fees.notes![k]!)}
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
          </div>
        ) : (
          <div className="bg-card text-muted-foreground rounded-xl border p-4 text-sm">
            {t({
              fr: 'Barème officiel non renseigné pour ce pays. Le montage applique le barème générique.',
              en: 'Official fee schedule not provided for this country. Submissions use the generic schedule.',
            })}
          </div>
        )}
      </section>

      {/* Modèles réglementaires — le pont vers la bibliothèque publique, DÉJÀ réglée sur ce pays.
          Les fiches Autorité sont l'endroit où l'expert vient se rappeler ce que l'agence attend ;
          y lister les modèles disponibles évite de ressortir de l'application pour les chercher. */}
      {modeles.length > 0 ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">
              {t({ fr: 'Modèles réglementaires', en: 'Regulatory templates' })}
            </h2>
            <Button asChild size="sm" variant="outline">
              <a href={lienBibliotheque()} target="_blank" rel="noreferrer">
                <FileText className="size-4" />
                {t({ fr: 'Ouvrir la bibliothèque', en: 'Open the library' })}
              </a>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {t({
              fr: `${modeles.length} modèles officiels — ceux qui varient d’un pays à l’autre sont réglés pour ${pays}. Gratuits, sans inscription.`,
              en: `${modeles.length} official templates — those that vary by country are set for ${pays}. Free, no sign-up.`,
            })}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {modeles.map((m) => (
              <li key={m.slug}>
                <a
                  className="bg-card hover:border-muted-foreground/40 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
                  href={lienModele(m.slug)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span
                    aria-hidden
                    className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
                  >
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {lang === 'en' ? m.nom[1] : m.nom[0]}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {m.activites
                        ? t({ fr: 'Selon l’activité', en: 'Depends on the activity' })
                        : t({ fr: 'Prêt à télécharger', en: 'Ready to download' })}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Mon empreinte */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold">
          {t({ fr: 'Mon activité dans ce pays', en: 'My activity in this country' })}
        </h2>
        {/* Statistiques (non cliquables) : aucun filtre n'indexe l'empreinte par PAYS d'AMM côté
            produits (le filtre catalogue est par pays de DOSSIER) ni côté workspace → un lien
            mènerait à un résultat incohérent avec le compteur. On affiche des stats honnêtes. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Stat
            icon={<FileStack className="size-5" />}
            value={counts?.dossiers ?? 0}
            label={t({ fr: 'Dossiers (montages CTD)', en: 'Submissions (CTD)' })}
          />
          <Stat
            icon={<ShieldCheck className="size-5" />}
            value={counts?.amm ?? 0}
            label={t({ fr: 'AMM enregistrées', en: 'Registered MAs' })}
          />
        </div>
      </section>
    </Page>
  )
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3">
      <span
        aria-hidden
        className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl"
      >
        {icon}
      </span>
      <div>
        <div className="font-display text-lg font-bold tabular-nums">{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </div>
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
    <p className="text-muted-foreground text-xs">
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
        {value || <span className="text-muted-foreground/60">{t({ fr: '—', en: '—' })}</span>}
      </dd>
    </div>
  )
}
