import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n-context'

import { AdminForbiddenError, adminApi, formatBytes, formatInt, pct, trend } from './admin-api'
import type { AdminOverview } from './admin-api'
import { AdminOrgs } from './AdminOrgs'
import { AdminPlans } from './AdminPlans'
import { AdminUsers } from './AdminUsers'
import { useAsync } from './use-async'

function Gauge({ value, cap, label }: { value: number; cap: number; label: string }) {
  const p = pct(value, cap)
  const hot = p >= 70
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{p}%</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${hot ? 'bg-destructive' : 'bg-foreground/70'}`}
          style={{ width: `${p}%` }}
        />
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {formatBytes(value)} / {formatBytes(cap)}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
    </div>
  )
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const { delta, up } = trend(current, previous)
  if (delta === 0) return <span className="text-muted-foreground text-xs">±0</span>
  return (
    <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-destructive'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}

function Overview({ data }: { data: AdminOverview }) {
  const { t } = useI18n()
  const { totals, growth, health, ai_by_kind, recent_audit } = data
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Santé */}
      <Card>
        <CardHeader>
          <CardTitle>{t({ fr: 'Santé', en: 'Health' })}</CardTitle>
          <CardDescription>
            {t({ fr: 'Ressources vs paliers du tier gratuit', en: 'Resources vs free-tier caps' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Gauge
            value={health.db_bytes}
            cap={health.db_cap_bytes}
            label={t({ fr: 'Base de données', en: 'Database' })}
          />
          <Gauge
            value={health.storage_bytes}
            cap={health.storage_cap_bytes}
            label={`${t({ fr: 'Stockage', en: 'Storage' })} · ${formatInt(health.storage_objects)} ${t({ fr: 'fichiers', en: 'files' })}`}
          />
        </CardContent>
      </Card>

      {/* Growth */}
      <Card>
        <CardHeader>
          <CardTitle>{t({ fr: 'Croissance', en: 'Growth' })}</CardTitle>
          <CardDescription>
            {t({ fr: '30 derniers jours vs précédents', en: 'Last 30 days vs prior' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="space-y-0.5">
            <Kpi
              label={t({ fr: 'Organisations', en: 'Organizations' })}
              value={formatInt(totals.orgs)}
            />
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">+{growth.orgs_30d}</span>
              <TrendBadge current={growth.orgs_30d} previous={growth.orgs_prev_30d} />
            </div>
          </div>
          <div className="space-y-0.5">
            <Kpi label={t({ fr: 'Utilisateurs', en: 'Users' })} value={formatInt(totals.users)} />
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">+{growth.users_30d}</span>
              <TrendBadge current={growth.users_30d} previous={growth.users_prev_30d} />
            </div>
          </div>
          <div className="space-y-0.5">
            <Kpi label={t({ fr: 'Dossiers', en: 'Dossiers' })} value={formatInt(totals.dossiers)} />
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">+{growth.dossiers_30d}</span>
              <TrendBadge current={growth.dossiers_30d} previous={growth.dossiers_prev_30d} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consommation IA */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t({ fr: 'Consommation IA (ce mois)', en: 'AI usage (this month)' })}
          </CardTitle>
          <CardDescription>
            {t({
              fr: 'Tokens Gemini — le seul coût variable',
              en: 'Gemini tokens — the only variable cost',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-6">
            <Kpi
              label={t({ fr: 'Tokens', en: 'Tokens' })}
              value={formatInt(totals.ai_tokens_month)}
            />
            <Kpi
              label={t({ fr: 'Appels', en: 'Calls' })}
              value={formatInt(totals.ai_calls_month)}
            />
            <Kpi label={t({ fr: 'Produits', en: 'Products' })} value={formatInt(totals.products)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ai_by_kind).length === 0 ? (
              <span className="text-muted-foreground text-xs">
                {t({ fr: 'Aucune consommation ce mois.', en: 'No usage this month.' })}
              </span>
            ) : (
              Object.entries(ai_by_kind).map(([kind, toks]) => (
                <Badge key={kind} variant="secondary" className="tabular-nums">
                  {kind}: {formatInt(toks)}
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monitoring — flux d'audit */}
      <Card>
        <CardHeader>
          <CardTitle>{t({ fr: 'Activité récente', en: 'Recent activity' })}</CardTitle>
          <CardDescription>
            {t({ fr: "Journal d'audit (25 derniers)", en: 'Audit log (latest 25)' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent_audit.length === 0 ? (
            <span className="text-muted-foreground text-xs">
              {t({ fr: 'Aucune activité.', en: 'No activity.' })}
            </span>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-auto text-sm" tabIndex={0}>
              {recent_audit.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 border-b pb-1.5 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.label || a.action}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {a.action} · {a.actor_email}
                    </div>
                  </div>
                  <time className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {new Date(a.at).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AccessDenied() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">{t({ fr: 'Accès refusé', en: 'Access denied' })}</h1>
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
  const { t, lang, setLang } = useI18n()
  const overview = useAsync(adminApi.overview)

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
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground text-sm">
          {t({ fr: 'Impossible de charger la console.', en: 'Could not load the console.' })}
        </p>
        <Button variant="outline" size="sm" onClick={overview.reload}>
          {t({ fr: 'Réessayer', en: 'Retry' })}
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-svh">
      <header className="bg-card/80 sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <span className="bg-foreground text-background grid size-7 place-items-center rounded-md text-sm font-bold">
            P
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Pharnos Admin</div>
            <div className="text-muted-foreground text-xs">
              {t({ fr: 'Console plateforme', en: 'Platform console' })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            aria-label="Language"
          >
            {lang === 'fr' ? 'EN' : 'FR'}
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/">{t({ fr: 'Quitter', en: 'Exit' })}</a>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6" tabIndex={0}>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              {t({ fr: "Vue d'ensemble", en: 'Overview' })}
            </TabsTrigger>
            <TabsTrigger value="orgs">
              {t({ fr: 'Organisations', en: 'Organizations' })}
            </TabsTrigger>
            <TabsTrigger value="users">{t({ fr: 'Utilisateurs', en: 'Users' })}</TabsTrigger>
            <TabsTrigger value="plans">
              {t({ fr: 'Plans & quotas', en: 'Plans & quotas' })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <Overview data={overview.data} />
          </TabsContent>
          <TabsContent value="orgs" className="mt-4">
            <AdminOrgs />
          </TabsContent>
          <TabsContent value="users" className="mt-4">
            <AdminUsers />
          </TabsContent>
          <TabsContent value="plans" className="mt-4">
            <AdminPlans />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
