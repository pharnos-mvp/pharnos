import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileStack, Landmark, Receipt, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Page } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/status-badge'
import { useTopbar } from '@/components/layout/topbar'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useOrgId } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { authorityDetail } from './authorities-data'

const LANG_FULL: Record<string, Translatable> = {
  fr: { fr: 'Français', en: 'French' },
  en: { fr: 'Anglais', en: 'English' },
  pt: { fr: 'Portugais', en: 'Portuguese' },
}

type FeeKey = 'new_ma' | 'renewal' | 'variation_minor' | 'variation_major'
const FEE_LABEL: Record<FeeKey, Translatable> = {
  new_ma: { fr: 'Nouvelle AMM', en: 'New MA' },
  renewal: { fr: 'Renouvellement', en: 'Renewal' },
  variation_minor: { fr: 'Variation mineure', en: 'Minor variation' },
  variation_major: { fr: 'Variation majeure', en: 'Major variation' },
}

export function AutoriteCockpit() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const { code = '' } = useParams()
  const detail = useMemo(() => authorityDetail(code), [code])

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
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Field
            label={t({ fr: 'Destinataire des lettres', en: 'Letter recipient' })}
            value={[detail.civilite, agency.directeur].filter(Boolean).join(' — ')}
          />
          <Field label={t({ fr: 'Adresse', en: 'Address' })} value={agency.adresse} />
        </dl>
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
            </div>

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

      {/* Mon empreinte */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold">
          {t({ fr: 'Mon activité dans ce pays', en: 'My activity in this country' })}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            to={`/workspace`}
            className="bg-card hover:border-muted-foreground/25 flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:shadow-md"
          >
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
              <FileStack className="size-5" />
            </span>
            <div>
              <div className="font-display text-lg font-bold tabular-nums">
                {counts?.dossiers ?? 0}
              </div>
              <div className="text-muted-foreground text-xs">
                {t({ fr: 'Dossiers (montages CTD)', en: 'Submissions (CTD)' })}
              </div>
            </div>
          </Link>
          <Link
            to={`/catalogue?country=${code}`}
            className="bg-card hover:border-muted-foreground/25 flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:shadow-md"
          >
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <div className="font-display text-lg font-bold tabular-nums">{counts?.amm ?? 0}</div>
              <div className="text-muted-foreground text-xs">
                {t({ fr: 'AMM enregistrées', en: 'Registered MAs' })}
              </div>
            </div>
          </Link>
        </div>
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
