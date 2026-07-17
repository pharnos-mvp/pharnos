import { useState, type ReactNode } from 'react'
import {
  Building2,
  ClipboardList,
  Cpu,
  FolderKanban,
  LayoutDashboard,
  ScrollText,
  SlidersHorizontal,
  UserPlus,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { pillVariants } from '@/components/ui/pill'
import { Section } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { LangThemeControls } from '@/components/layout/lang-theme-controls'
import { formatBytes } from '@/lib/format-bytes'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

import {
  AdminForbiddenError,
  adminApi,
  auditActionLabel,
  auditTone,
  formatInt,
  pct,
  trend,
} from './admin-api'
import type { AdminOverview } from './admin-api'
import { AdminAcquisition } from './AdminAcquisition'
import { AdminJournal } from './AdminJournal'
import { AdminOrgs } from './AdminOrgs'
import { AdminPlans } from './AdminPlans'
import { AdminUsers } from './AdminUsers'
import { useAsync } from './use-async'

type AdminSection = 'overview' | 'orgs' | 'users' | 'acquisition' | 'plans' | 'journal'

/**
 * Jauge de santé plateforme : seuils sémantiques alignés sur la politique stockage
 * (`docs/STORAGE-DATA-POLICY.md` — bascule R2 envisagée à 70 %) : info < 70 %, warning ≥ 70 %,
 * danger ≥ 90 %. Même grammaire visuelle que `UsageMeter` du Compte (LOT 7).
 */
function HealthGauge({
  value,
  cap,
  label,
  lang,
}: {
  value: number
  cap: number
  label: string
  lang: Lang
}) {
  const p = pct(value, cap)
  const barClass = p >= 90 ? 'bg-danger' : p >= 70 ? 'bg-warning' : 'bg-info'
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground min-w-0 truncate">{label}</span>
        <span className="font-medium tabular-nums">{p} %</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Math.min(value, cap)}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div className={cn('h-full rounded-full', barClass)} style={{ width: `${p}%` }} />
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {formatBytes(value, lang)} / {formatBytes(cap, lang)}
      </div>
    </div>
  )
}

/** Tuile KPI du bandeau cockpit : libellé + pastille icône, valeur Syne, tendance + sous-ligne. */
function KpiCard({
  label,
  value,
  icon: Icon,
  trendNode,
  sub,
}: {
  label: string
  value: string
  icon: typeof Building2
  trendNode?: ReactNode
  sub?: string
}) {
  return (
    <div className="bg-card rounded-xl border p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
        <span
          className="bg-info-subtle text-info flex size-8 shrink-0 items-center justify-center rounded-lg"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="font-display mt-2 text-3xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
      {trendNode || sub ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {trendNode}
          {sub ? <span className="text-muted-foreground">{sub}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Delta 30 j vs 30 j précédents — statut sémantique (plus de couleurs Tailwind en dur). */
function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const { delta, up } = trend(current, previous)
  if (delta === 0) return <StatusBadge tone="neutral">±0</StatusBadge>
  return (
    <StatusBadge tone={up ? 'success' : 'danger'}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </StatusBadge>
  )
}

/** Ligne « part de » : libellé + valeur + barre de part (décorative — la valeur fait foi). */
function ShareRow({
  label,
  valueText,
  share,
}: {
  label: string
  valueText: string
  share: number
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{valueText}</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <div
          className="bg-info h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, share))}%` }}
        />
      </div>
    </div>
  )
}

function Overview({ data, onOpenJournal }: { data: AdminOverview; onOpenJournal: () => void }) {
  const { t, lang } = useI18n()
  const { totals, growth, health, ai_by_kind, recent_audit } = data
  const fmt = (n: number) => formatInt(n, lang)
  // Top consommateurs (coût variable = tokens) — l'action orgs existe déjà, volume pilote léger.
  const orgs = useAsync(adminApi.orgs)

  const healthPct = Math.max(
    pct(health.db_bytes, health.db_cap_bytes),
    pct(health.storage_bytes, health.storage_cap_bytes),
  )
  const healthTone = healthPct >= 90 ? 'danger' : healthPct >= 70 ? 'warning' : 'success'
  const healthLabel =
    healthPct >= 90
      ? t({ fr: 'Critique', en: 'Critical' })
      : healthPct >= 70
        ? t({ fr: 'À surveiller', en: 'Watch' })
        : t({ fr: 'Nominal', en: 'Nominal' })

  const kinds = Object.entries(ai_by_kind).sort((a, b) => b[1] - a[1])
  const topOrgs = (orgs.data ?? [])
    .filter((o) => o.ai_tokens_month > 0)
    .sort((a, b) => b.ai_tokens_month - a.ai_tokens_month)
    .slice(0, 5)

  return (
    <div className="space-y-4">
      {/* Bandeau KPI hero — croissance + coût variable, tendances 30 j réelles. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t({ fr: 'Organisations', en: 'Organizations' })}
          value={fmt(totals.orgs)}
          icon={Building2}
          trendNode={<TrendBadge current={growth.orgs_30d} previous={growth.orgs_prev_30d} />}
          sub={`${fmt(totals.orgs_active)} ${t({ fr: 'actives', en: 'active' })}`}
        />
        <KpiCard
          label={t({ fr: 'Utilisateurs', en: 'Users' })}
          value={fmt(totals.users)}
          icon={Users}
          trendNode={<TrendBadge current={growth.users_30d} previous={growth.users_prev_30d} />}
          sub={`+${fmt(growth.users_30d)} ${t({ fr: 'sur 30 j', en: 'in 30 d' })}`}
        />
        <KpiCard
          label={t({ fr: 'Dossiers', en: 'Dossiers' })}
          value={fmt(totals.dossiers)}
          icon={FolderKanban}
          trendNode={
            <TrendBadge current={growth.dossiers_30d} previous={growth.dossiers_prev_30d} />
          }
          sub={`${fmt(totals.products)} ${t({ fr: 'produits au catalogue', en: 'products in catalogue' })}`}
        />
        <KpiCard
          label={t({ fr: 'Tokens IA (mois)', en: 'AI tokens (month)' })}
          value={fmt(totals.ai_tokens_month)}
          icon={Cpu}
          sub={`${fmt(totals.ai_calls_month)} ${t({ fr: 'appels — seul coût variable', en: 'calls — the only variable cost' })}`}
        />
      </div>

      {/* Rangée cockpit : infra · répartition du coût IA · top consommateurs. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Section
          title={t({ fr: 'Santé plateforme', en: 'Platform health' })}
          description={t({
            fr: 'Ressources vs paliers du tier gratuit — bascule R2 à 70 %',
            en: 'Resources vs free-tier caps — R2 migration at 70%',
          })}
          actions={<StatusBadge tone={healthTone}>{healthLabel}</StatusBadge>}
        >
          <div className="space-y-4">
            <HealthGauge
              value={health.db_bytes}
              cap={health.db_cap_bytes}
              label={t({ fr: 'Base de données', en: 'Database' })}
              lang={lang}
            />
            <HealthGauge
              value={health.storage_bytes}
              cap={health.storage_cap_bytes}
              label={`${t({ fr: 'Stockage', en: 'Storage' })} · ${fmt(health.storage_objects)} ${t({ fr: 'fichiers', en: 'files' })}`}
              lang={lang}
            />
          </div>
        </Section>

        <Section
          title={t({ fr: 'IA par usage (mois)', en: 'AI by usage (month)' })}
          description={t({
            fr: 'Répartition des tokens Gemini par fonction',
            en: 'Gemini token split by feature',
          })}
        >
          {kinds.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t({ fr: 'Aucune consommation ce mois.', en: 'No usage this month.' })}
            </p>
          ) : (
            <div className="space-y-3">
              {kinds.map(([kind, toks]) => {
                const share = pct(toks, totals.ai_tokens_month)
                return (
                  <ShareRow
                    key={kind}
                    label={kind}
                    valueText={`${fmt(toks)} · ${share} %`}
                    share={share}
                  />
                )
              })}
            </div>
          )}
        </Section>

        <Section
          title={t({ fr: 'Top consommateurs', en: 'Top consumers' })}
          description={t({
            fr: 'Organisations par tokens IA ce mois',
            en: 'Organizations by AI tokens this month',
          })}
        >
          {orgs.loading && !orgs.data ? (
            <div className="space-y-2">
              <Skeleton className="h-8 rounded-lg" />
              <Skeleton className="h-8 rounded-lg" />
              <Skeleton className="h-8 rounded-lg" />
            </div>
          ) : orgs.error ? (
            <p className="text-muted-foreground text-sm">
              {t({ fr: 'Indisponible pour le moment.', en: 'Unavailable right now.' })}
            </p>
          ) : topOrgs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t({ fr: 'Aucune consommation ce mois.', en: 'No usage this month.' })}
            </p>
          ) : (
            <div className="space-y-3">
              {topOrgs.map((o) => (
                <ShareRow
                  key={o.id}
                  label={o.name}
                  valueText={fmt(o.ai_tokens_month)}
                  share={pct(o.ai_tokens_month, totals.ai_tokens_month)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section
        title={t({ fr: 'Activité récente', en: 'Recent activity' })}
        description={t({ fr: 'Les 25 dernières actions', en: 'The latest 25 actions' })}
        actions={
          <Button variant="ghost" size="sm" onClick={onOpenJournal}>
            {t({ fr: 'Journal complet', en: 'Full log' })} →
          </Button>
        }
      >
        {recent_audit.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title={t({ fr: 'Aucune activité', en: 'No activity' })}
            description={t({
              fr: 'Les actions des organisations apparaîtront ici.',
              en: 'Organization actions will appear here.',
            })}
          />
        ) : (
          <ul className="max-h-72 space-y-1 overflow-auto pr-1" tabIndex={0}>
            {recent_audit.map((a, i) => (
              <li
                key={`${a.org_id}-${a.at}-${i}`}
                className="flex items-center gap-x-3 border-b py-1.5 text-sm last:border-0"
              >
                <StatusBadge tone={auditTone(a.action)}>
                  {t(auditActionLabel(a.action))}
                </StatusBadge>
                <span className="min-w-0 flex-1 truncate" title={a.label || a.action}>
                  {a.label || a.action}
                </span>
                <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                  {a.actor_email}
                </span>
                <time className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {new Date(a.at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function AccessDenied() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-display text-xl font-semibold tracking-tight">
        {t({ fr: 'Accès refusé', en: 'Access denied' })}
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t({
          fr: 'Cette console est réservée aux administrateurs Pharnos.',
          en: 'This console is restricted to Pharnos administrators.',
        })}
      </p>
      <Button asChild variant="outline" size="sm">
        <a href="/">{t({ fr: "Retour à l'application", en: 'Back to the app' })}</a>
      </Button>
    </div>
  )
}

export function AdminConsole() {
  const { t } = useI18n()
  const overview = useAsync(adminApi.overview)
  const [section, setSection] = useState<AdminSection>('overview')

  if (overview.loading && !overview.data) {
    return (
      <div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
        {t({ fr: 'Chargement de la console…', en: 'Loading console…' })}
      </div>
    )
  }
  if (overview.error instanceof AdminForbiddenError) return <AccessDenied />
  if (overview.error || !overview.data) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        {/* h1 hors écran : l'ErrorState ouvre sur un h2 — l'ordre de titres reste valide. */}
        <h1 className="sr-only">{t({ fr: 'Console plateforme', en: 'Platform console' })}</h1>
        <ErrorState
          className="w-full max-w-md"
          title={t({ fr: 'Console indisponible', en: 'Console unavailable' })}
          reason={t({
            fr: 'Vous êtes hors ligne ou le serveur est injoignable — les données plateforme ne se chargent pas.',
            en: 'You are offline or the server is unreachable — platform data cannot load.',
          })}
          action={
            <Button variant="outline" size="sm" onClick={overview.reload}>
              {t({ fr: 'Réessayer', en: 'Retry' })}
            </Button>
          }
        />
      </div>
    )
  }

  const nav: { key: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
    {
      key: 'overview',
      label: t({ fr: "Vue d'ensemble", en: 'Overview' }),
      icon: LayoutDashboard,
    },
    { key: 'orgs', label: t({ fr: 'Organisations', en: 'Organizations' }), icon: Building2 },
    { key: 'users', label: t({ fr: 'Utilisateurs', en: 'Users' }), icon: Users },
    { key: 'acquisition', label: t({ fr: 'Acquisition', en: 'Acquisition' }), icon: UserPlus },
    {
      key: 'plans',
      label: t({ fr: 'Plans & quotas', en: 'Plans & quotas' }),
      icon: SlidersHorizontal,
    },
    { key: 'journal', label: t({ fr: 'Journal', en: 'Audit log' }), icon: ScrollText },
  ]

  return (
    <div className="bg-page min-h-svh">
      {/* Topbar autonome (console hors shell RA) — mêmes tokens que le chrome de l'app. */}
      <header className="bg-card/80 z-sticky sticky top-0 flex items-center justify-between gap-3 border-b px-4 py-2.5 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/brand/pharnos-logo.svg" alt="" className="size-8 shrink-0 dark:hidden" />
          <img
            src="/brand/pharnos-logo-dark.svg"
            alt=""
            className="hidden size-8 shrink-0 dark:block"
          />
          <div className="min-w-0 leading-tight">
            <div className="font-display truncate text-[15px] font-bold tracking-tight">
              Pharnos Admin
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {t({ fr: 'Console plateforme', en: 'Platform console' })}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LangThemeControls />
          <Button asChild variant="outline" size="sm">
            <a href="/">{t({ fr: 'Quitter', en: 'Exit' })}</a>
          </Button>
        </div>
      </header>

      <main className="px-4 pb-10 sm:px-6">
        <Page className="max-w-6xl">
          <PageHeader
            title={t({ fr: 'Console plateforme', en: 'Platform console' })}
            description={t({
              fr: 'Santé, organisations, utilisateurs et quotas — réservé aux super-admins Pharnos.',
              en: 'Health, organizations, users and quotas — restricted to Pharnos super-admins.',
            })}
          />

          <nav
            aria-label={t({ fr: 'Sections de la console', en: 'Console sections' })}
            className="flex flex-wrap items-center gap-1.5"
          >
            {nav.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                aria-current={section === key ? 'page' : undefined}
                className={pillVariants({ active: section === key })}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {section === 'overview' && (
            <Overview data={overview.data} onOpenJournal={() => setSection('journal')} />
          )}
          {section === 'orgs' && <AdminOrgs />}
          {section === 'users' && <AdminUsers />}
          {section === 'acquisition' && <AdminAcquisition />}
          {section === 'plans' && <AdminPlans />}
          {section === 'journal' && <AdminJournal />}
        </Page>
      </main>
    </div>
  )
}
