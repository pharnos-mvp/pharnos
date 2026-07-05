import { useState, type ReactNode } from 'react'
import { Building2, ClipboardList, LayoutDashboard, SlidersHorizontal, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { pillVariants } from '@/components/ui/pill'
import { Section } from '@/components/ui/section'
import { StatusBadge } from '@/components/ui/status-badge'
import { LangThemeControls } from '@/components/layout/lang-theme-controls'
import { formatBytes } from '@/lib/format-bytes'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

import { AdminForbiddenError, adminApi, formatInt, pct, trend } from './admin-api'
import type { AdminOverview } from './admin-api'
import { AdminOrgs } from './AdminOrgs'
import { AdminPlans } from './AdminPlans'
import { AdminUsers } from './AdminUsers'
import { useAsync } from './use-async'

type AdminSection = 'overview' | 'orgs' | 'users' | 'plans'

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

/** Valeur KPI premium (Syne, cf. DS « valeurs KPI ») + libellé mutée + sous-ligne optionnelle. */
function Kpi({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
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

function Overview({ data }: { data: AdminOverview }) {
  const { t, lang } = useI18n()
  const { totals, growth, health, ai_by_kind, recent_audit } = data
  const fmt = (n: number) => formatInt(n, lang)

  const actionTone = (a: string) =>
    a === 'delete'
      ? ('danger' as const)
      : a === 'create'
        ? ('success' as const)
        : ('warning' as const)
  const actionLabel = (a: string) =>
    a === 'create'
      ? t({ fr: 'Créé', en: 'Created' })
      : a === 'delete'
        ? t({ fr: 'Supprimé', en: 'Deleted' })
        : t({ fr: 'Modifié', en: 'Updated' })

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section
        title={t({ fr: 'Croissance', en: 'Growth' })}
        description={t({ fr: '30 derniers jours vs précédents', en: 'Last 30 days vs prior' })}
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Kpi label={t({ fr: 'Organisations', en: 'Organizations' })} value={fmt(totals.orgs)} />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground tabular-nums">+{growth.orgs_30d}</span>
              <TrendBadge current={growth.orgs_30d} previous={growth.orgs_prev_30d} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Kpi label={t({ fr: 'Utilisateurs', en: 'Users' })} value={fmt(totals.users)} />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground tabular-nums">+{growth.users_30d}</span>
              <TrendBadge current={growth.users_30d} previous={growth.users_prev_30d} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Kpi label={t({ fr: 'Dossiers', en: 'Dossiers' })} value={fmt(totals.dossiers)} />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground tabular-nums">+{growth.dossiers_30d}</span>
              <TrendBadge current={growth.dossiers_30d} previous={growth.dossiers_prev_30d} />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={t({ fr: 'Santé plateforme', en: 'Platform health' })}
        description={t({
          fr: 'Ressources vs paliers du tier gratuit — seuil de bascule R2 à 70 %',
          en: 'Resources vs free-tier caps — R2 migration threshold at 70%',
        })}
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
        title={t({ fr: 'Consommation IA (ce mois)', en: 'AI usage (this month)' })}
        description={t({
          fr: 'Tokens Gemini — le seul coût variable',
          en: 'Gemini tokens — the only variable cost',
        })}
      >
        <div className="flex flex-wrap gap-6">
          <Kpi label={t({ fr: 'Tokens', en: 'Tokens' })} value={fmt(totals.ai_tokens_month)} />
          <Kpi label={t({ fr: 'Appels', en: 'Calls' })} value={fmt(totals.ai_calls_month)} />
          <Kpi label={t({ fr: 'Produits', en: 'Products' })} value={fmt(totals.products)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ai_by_kind).length === 0 ? (
            <span className="text-muted-foreground text-xs">
              {t({ fr: 'Aucune consommation ce mois.', en: 'No usage this month.' })}
            </span>
          ) : (
            Object.entries(ai_by_kind).map(([kind, toks]) => (
              <Badge key={kind} variant="secondary" className="tabular-nums">
                {kind}: {fmt(toks)}
              </Badge>
            ))
          )}
        </div>
      </Section>

      <Section
        title={t({ fr: 'Activité récente', en: 'Recent activity' })}
        description={t({ fr: "Journal d'audit (25 derniers)", en: 'Audit log (latest 25)' })}
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
                key={i}
                className="flex items-center gap-x-3 border-b py-1.5 text-sm last:border-0"
              >
                <StatusBadge tone={actionTone(a.action)}>{actionLabel(a.action)}</StatusBadge>
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
    {
      key: 'plans',
      label: t({ fr: 'Plans & quotas', en: 'Plans & quotas' }),
      icon: SlidersHorizontal,
    },
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

          {section === 'overview' && <Overview data={overview.data} />}
          {section === 'orgs' && <AdminOrgs />}
          {section === 'users' && <AdminUsers />}
          {section === 'plans' && <AdminPlans />}
        </Page>
      </main>
    </div>
  )
}
