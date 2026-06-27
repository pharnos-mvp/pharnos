import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  CalendarClock,
  ClipboardList,
  Clock,
  Globe,
  History,
  Mail,
  Package,
  PauseCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { useAuditSync } from '@/features/audit/use-audit-sync'
import { useAuth } from '@/features/auth/auth-context'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { useOrgId } from '@/features/org/org-context'
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import { useDossierSync } from '@/features/workspace/use-dossier-sync'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { CountryFlag } from './CountryFlag'
import { VeilleCard } from './components/VeilleCard'
import {
  buildActions,
  conformityPct,
  conformitySummary,
  conformityTone,
  expiringDocs,
  expiryTone,
  openCorrespondences,
  portfolio,
  recentActivity,
  type ActionKind,
  type CorrSubState,
  type KpiTone,
} from './dashboard-data'
import './dashboard-mockup.css'

const SYNE = "'Syne Variable', 'Syne', sans-serif"
const TONE_RANK: Record<'info' | 'warning' | 'danger', number> = { info: 1, warning: 2, danger: 3 }
const PREVIEW = 5

// Couverture pays : UEMOA (8) + Nigeria + Ghana (choix CEO), dans l'ordre source.
const DASHBOARD_COUNTRY_CODES = ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG', 'NG', 'GH']
const DASHBOARD_COUNTRIES = COUNTRIES.filter((c) => DASHBOARD_COUNTRY_CODES.includes(c.code))

const KIND_BADGE: Record<ActionKind, { cls: string; Icon: LucideIcon; fr: string; en: string }> = {
  doc_expired: { cls: 'badge-red', Icon: AlertTriangle, fr: 'Expirant', en: 'Expiring' },
  non_conform: { cls: 'badge-red', Icon: AlertCircle, fr: 'Non conforme', en: 'Non-compliant' },
  doc_expiring: { cls: 'badge-amber', Icon: RefreshCw, fr: 'Renouvellement', en: 'Renewal' },
  dossier_suspended: { cls: 'badge-amber', Icon: PauseCircle, fr: 'En suspens', en: 'Suspended' },
  unread_reply: { cls: 'badge-blue', Icon: Mail, fr: 'Réponse agence', en: 'Agency reply' },
  agency_pending: { cls: 'badge-blue', Icon: Clock, fr: 'En attente', en: 'Pending' },
}

const STATE_DOT: Record<CorrSubState, string> = {
  unread: 'var(--info)',
  awaiting_agency: 'var(--warning)',
  decided: 'var(--success)',
}
const STATE_TEXT: Record<CorrSubState, string> = {
  unread: 'var(--info-subtle-foreground)',
  awaiting_agency: 'var(--warning-subtle-foreground)',
  decided: 'var(--success-subtle-foreground)',
}
const DOT_COLOR: Record<'neutral' | 'success' | 'warning' | 'danger' | 'info', string> = {
  neutral: 'var(--pd-muted)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
}

const emptyStyle = {
  padding: '24px 0',
  textAlign: 'center' as const,
  fontSize: 13,
  color: 'var(--pd-muted)',
}

// Tonalité de KPI → tokens de statut. Une seule source : pilote coin + pastille + barre.
// neutral = bleu calme (volumes/croissance, non notés bon/mauvais — choix CEO).
const TONE_VAR: Record<KpiTone, string> = {
  good: 'var(--success)',
  fair: 'var(--info)',
  passable: 'var(--warning)',
  poor: 'var(--danger)',
  neutral: 'var(--info)',
}
const TONE_SUBTLE: Record<KpiTone, string> = {
  good: 'var(--success-subtle)',
  fair: 'var(--info-subtle)',
  passable: 'var(--warning-subtle)',
  poor: 'var(--danger-subtle)',
  neutral: 'var(--info-subtle)',
}
const TONE_SUBTLE_FG: Record<KpiTone, string> = {
  good: 'var(--success-subtle-foreground)',
  fair: 'var(--info-subtle-foreground)',
  passable: 'var(--warning-subtle-foreground)',
  poor: 'var(--danger-subtle-foreground)',
  neutral: 'var(--info-subtle-foreground)',
}
// Étiquette VISIBLE seulement sur les états qui appellent une action (retirable au besoin).
const GRADE_LABEL: Partial<Record<KpiTone, { fr: string; en: string }>> = {
  passable: { fr: 'À surveiller', en: 'Watch' },
  poor: { fr: 'Urgent', en: 'Urgent' },
}
const GRADE_ICON: Partial<Record<KpiTone, LucideIcon>> = {
  passable: Clock,
  poor: AlertTriangle,
}
// Grade complet pour lecteur d'écran — la couleur ne porte jamais l'info seule (WCAG 1.4.1).
const GRADE_SR: Record<KpiTone, { fr: string; en: string }> = {
  good: { fr: 'bon', en: 'good' },
  fair: { fr: 'assez bien', en: 'fair' },
  passable: { fr: 'à surveiller', en: 'watch' },
  poor: { fr: 'urgent', en: 'urgent' },
  neutral: { fr: '', en: '' },
}

export function DashboardPage() {
  const orgId = useOrgId()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  useCorrespondenceSync(orgId)
  useAuditSync(orgId)

  const [showAll, setShowAll] = useState({ alerts: false, subs: false, activity: false })

  const data = useLiveQuery(async () => {
    const [products, documents, dossiers, correspondences, messages, reads, docAnalysis, auditLog] =
      await Promise.all([
        db.products.where('orgId').equals(orgId).toArray(),
        db.documents.where('orgId').equals(orgId).toArray(),
        db.dossiers.where('orgId').equals(orgId).toArray(),
        db.correspondences.where('orgId').equals(orgId).toArray(),
        db.correspondenceMessages.where('orgId').equals(orgId).toArray(),
        db.correspondenceReads.toArray(),
        db.docAnalysis.toArray(),
        db.auditLog.where('orgId').equals(orgId).toArray(),
      ])
    return {
      products,
      documents,
      dossiers,
      correspondences,
      messages,
      reads,
      docAnalysis,
      auditLog,
    }
  }, [orgId])

  const {
    products = [],
    documents = [],
    dossiers = [],
    correspondences = [],
    messages = [],
    reads = [],
    docAnalysis = [],
    auditLog = [],
  } = data ?? {}

  const vm = useMemo(() => {
    const now = new Date()
    return {
      actions: buildActions(
        { products, documents, dossiers, correspondences, messages, reads, docAnalysis },
        now,
      ),
      corrItems: openCorrespondences(correspondences, messages, reads),
      activity: recentActivity(auditLog, 50),
      echeances: expiringDocs(documents, products, now),
      portfolio: portfolio(products, dossiers),
      conformity: conformitySummary(documents, docAnalysis),
    }
  }, [products, documents, dossiers, correspondences, messages, reads, docAnalysis, auditLog])

  const derived = useMemo(() => {
    const open = vm.corrItems.filter((c) => c.state !== 'decided')
    const compliance = conformityPct(vm.conformity)
    const counts = new Map(vm.portfolio.byCountry.map((c) => [c.code, c.count]))
    const worst = new Map<string, 'info' | 'warning' | 'danger'>()
    for (const a of vm.actions) {
      if (!a.country) continue
      const tone =
        a.kind === 'doc_expired' || a.kind === 'non_conform'
          ? 'danger'
          : a.kind === 'doc_expiring' || a.kind === 'dossier_suspended'
            ? 'warning'
            : 'info'
      const cur = worst.get(a.country)
      if (!cur || TONE_RANK[tone] > TONE_RANK[cur]) worst.set(a.country, tone)
    }
    const countryTone = (code: string): keyof typeof DOT_COLOR => {
      const n = counts.get(code) ?? 0
      return n === 0 ? 'neutral' : (worst.get(code) ?? 'success')
    }
    return {
      submissionsOpen: open.length,
      submissionsCountries: new Set(open.map((c) => c.country)).size,
      compliance,
      counts,
      countryTone,
    }
  }, [vm])

  // Tendance « ↑ N ce mois » = produits actifs créés ce mois-ci (RÉEL via createdAt).
  const productsThisMonth = useMemo(() => {
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    return products.filter(
      (p) => p.deletedAt == null && p.createdAt && new Date(p.createdAt) >= start,
    ).length
  }, [products])

  // Chargement Dexie : squelette plutôt qu'un flash « tout à zéro ».
  if (data === undefined) {
    return (
      <div className="pharnos-dash pt-4 md:pt-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">
          {t({ fr: 'Chargement du tableau de bord', en: 'Loading dashboard' })}
        </span>
        <div className="pd-skel" style={{ height: 44, maxWidth: 280, marginBottom: 20 }} />
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skel" style={{ height: 128, borderRadius: 14 }} />
          ))}
        </div>
        <div className="grid-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pd-skel" style={{ height: 232, borderRadius: 14 }} />
          ))}
        </div>
        <div className="pd-skel" style={{ height: 156, borderRadius: 14 }} />
      </div>
    )
  }

  const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  const coverageBar = clampPct((vm.portfolio.byCountry.length / DASHBOARD_COUNTRIES.length) * 100)
  const submissionsBar =
    vm.portfolio.dossierCount > 0
      ? clampPct((derived.submissionsOpen / vm.portfolio.dossierCount) * 100)
      : 0
  const expiringBar =
    documents.length > 0 ? clampPct((vm.echeances.length / documents.length) * 100) : 0
  const conformityBar = derived.compliance ?? 0

  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>
  const firstName = meta.prenom || meta.username || ''
  const today = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB') : ''
  const actionLabel = (action: string) =>
    action === 'create'
      ? t({ fr: 'créé', en: 'created' })
      : action === 'delete'
        ? t({ fr: 'supprimé', en: 'deleted' })
        : t({ fr: 'modifié', en: 'updated' })

  const kpis: {
    Ico: LucideIcon
    tone: KpiTone
    label: string
    val: ReactNode
    sub: ReactNode
    bar: number
  }[] = [
    {
      Ico: Package,
      tone: 'neutral',
      label: t({ fr: 'Produits Actifs', en: 'Active Products' }),
      val: vm.portfolio.productCount,
      sub:
        productsThisMonth > 0 ? (
          <>
            <span className="up">
              <ArrowUp size={13} strokeWidth={2.5} />
              {productsThisMonth}
            </span>{' '}
            {t({ fr: 'ce mois', en: 'this month' })}
          </>
        ) : (
          t({
            fr: `${vm.portfolio.byCountry.length} pays couverts`,
            en: `${vm.portfolio.byCountry.length} countries`,
          })
        ),
      bar: coverageBar,
    },
    {
      Ico: Send,
      tone: 'neutral',
      label: t({ fr: 'Soumissions en cours', en: 'Pending submissions' }),
      val: derived.submissionsOpen,
      sub: t({
        fr: `${derived.submissionsCountries} pays`,
        en: `${derived.submissionsCountries} countries`,
      }),
      bar: submissionsBar,
    },
    {
      Ico: CalendarClock,
      tone: expiryTone(vm.echeances),
      label: t({ fr: 'À renouveler', en: 'Renewals due' }),
      val: vm.echeances.length,
      sub:
        vm.echeances.length > 0
          ? t({ fr: 'fenêtre de renouvellement', en: 'within renewal window' })
          : t({ fr: 'rien à renouveler', en: 'nothing due' }),
      bar: expiringBar,
    },
    {
      Ico: ShieldCheck,
      tone: conformityTone(derived.compliance),
      label: t({ fr: 'Taux de Conformité', en: 'Compliance rate' }),
      val: derived.compliance == null ? '—' : `${derived.compliance}%`,
      sub: t({
        fr: `${vm.conformity.analyzedDocs} analysés`,
        en: `${vm.conformity.analyzedDocs} analyzed`,
      }),
      bar: conformityBar,
    },
  ]

  const alerts = showAll.alerts ? vm.actions : vm.actions.slice(0, PREVIEW)
  const subs = showAll.subs ? vm.corrItems : vm.corrItems.slice(0, PREVIEW)
  const activity = showAll.activity ? vm.activity : vm.activity.slice(0, PREVIEW)

  const seeAll = (key: 'alerts' | 'subs' | 'activity', total: number) =>
    total > PREVIEW ? (
      <button
        type="button"
        className="card-action"
        onClick={() => setShowAll((s) => ({ ...s, [key]: !s[key] }))}
      >
        {showAll[key]
          ? t({ fr: 'Voir moins', en: 'Show less' })
          : t({ fr: `Voir tout (${total})`, en: `View all (${total})` })}
      </button>
    ) : null

  return (
    <>
      <div className="pharnos-dash fade-in pt-4 md:pt-6">
        {/* Greeting */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 19, color: 'var(--pd-strong)' }}
            >
              {firstName
                ? t({ fr: `Bonjour, ${firstName}`, en: `Hello, ${firstName}` })
                : t({ fr: 'Tableau de bord', en: 'Dashboard' })}
            </h1>
            <div style={{ fontSize: 14, color: 'var(--pd-muted)', marginTop: 3 }}>
              {t({
                fr: `Vue d'ensemble réglementaire — ${today}`,
                en: `Regulatory overview — ${today}`,
              })}
            </div>
          </div>
          <Link className="btn btn-primary" to="/catalogue/nouveau" style={{ flexShrink: 0 }}>
            + {t({ fr: 'Enregistrer un Produit', en: 'Register a Product' })}
          </Link>
        </div>

        {/* KPIs */}
        <div className="kpi-grid">
          {kpis.map((k, i) => {
            const accent = TONE_VAR[k.tone]
            const gradeLabel = GRADE_LABEL[k.tone]
            const GradeIcon = GRADE_ICON[k.tone]
            return (
              <div className="kpi" key={i} style={{ '--kpi-accent': accent } as CSSProperties}>
                <div
                  className="kpi-ico"
                  aria-hidden
                  style={{ background: TONE_SUBTLE[k.tone], color: accent }}
                >
                  <k.Ico size={16} strokeWidth={2} />
                </div>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-val">{k.val}</div>
                {gradeLabel && GradeIcon ? (
                  <div
                    className="kpi-grade"
                    style={{ background: TONE_SUBTLE[k.tone], color: TONE_SUBTLE_FG[k.tone] }}
                  >
                    <GradeIcon size={11} strokeWidth={2.5} aria-hidden />
                    {t(gradeLabel)}
                  </div>
                ) : null}
                {k.tone !== 'neutral' && !gradeLabel ? (
                  <span className="sr-only">{t(GRADE_SR[k.tone])}</span>
                ) : null}
                <div className="kpi-sub">{k.sub}</div>
                <div className="bar-wrap">
                  <div className="bar-fill" style={{ width: `${k.bar}%`, background: accent }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Alertes | Timeline | Activité — 5 items, « Voir tout » déplie sur place. */}
        <div className="grid-3">
          <div className="card" role="region" aria-labelledby="dash-alerts">
            <div className="card-hd">
              <h2 className="card-title" id="dash-alerts">
                <AlertTriangle size={15} color="var(--danger)" aria-hidden />
                {t({ fr: 'Alertes Réglementaires', en: 'Regulatory Alerts' })}
              </h2>
              {seeAll('alerts', vm.actions.length)}
            </div>
            <div className="card-body" style={{ padding: '8px 20px' }}>
              {alerts.length === 0 ? (
                <div style={emptyStyle}>
                  {t({ fr: 'Rien à signaler — tout est à jour.', en: 'Nothing to flag.' })}
                </div>
              ) : (
                alerts.map((a) => {
                  const b = KIND_BADGE[a.kind]
                  const BIcon = b.Icon
                  return (
                    <Link className="alert-row" to={a.href} key={a.id}>
                      <span className={`badge ${b.cls}`}>
                        <BIcon size={11} strokeWidth={2.5} aria-hidden />
                        {t({ fr: b.fr, en: b.en })}
                      </span>
                      <span className="alert-name">
                        {a.label}
                        {a.docType ? ` — ${docTypeLabel(a.docType, lang)}` : ''}
                      </span>
                      <span className="alert-meta">
                        {a.country ? (
                          <CountryFlag
                            code={a.country}
                            size={13}
                            style={{
                              display: 'inline-block',
                              verticalAlign: 'middle',
                              marginRight: 5,
                            }}
                          />
                        ) : null}
                        {fmtDate(a.date)}
                      </span>
                    </Link>
                  )
                })
              )}
            </div>
          </div>

          <div className="card" role="region" aria-labelledby="dash-timeline">
            <div className="card-hd">
              <h2 className="card-title" id="dash-timeline">
                <ClipboardList size={15} color="var(--info)" aria-hidden />
                {t({ fr: 'Timeline Soumissions', en: 'Submission Timeline' })}
              </h2>
              {seeAll('subs', vm.corrItems.length)}
            </div>
            <div className="card-body">
              {subs.length === 0 ? (
                <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--pd-muted)' }}>
                  {t({ fr: 'Aucune soumission en cours.', en: 'No submission in progress.' })}
                </div>
              ) : (
                subs.map((c, i, arr) => {
                  const statusLabel =
                    c.state === 'unread'
                      ? t({ fr: `${c.unread} non lu(s)`, en: `${c.unread} unread` })
                      : c.state === 'awaiting_agency'
                        ? t({ fr: 'En attente agence', en: 'Awaiting agency' })
                        : t({ fr: 'Décidé', en: 'Decided' })
                  return (
                    <div className="tl-row" key={c.id}>
                      <div className="tl-col">
                        <div className="tl-dot" style={{ background: STATE_DOT[c.state] }} />
                        {i < arr.length - 1 ? <div className="tl-line" /> : null}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="tl-name">
                          {c.productName}
                          {c.country ? ` — ${countryLabel(c.country, lang)}` : ''}
                        </div>
                        <div className="tl-st" style={{ color: STATE_TEXT[c.state] }}>
                          {statusLabel}
                        </div>
                        <div className="tl-date">{fmtDate(c.date)}</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="card" role="region" aria-labelledby="dash-activity">
            <div className="card-hd">
              <h2 className="card-title" id="dash-activity">
                <History size={15} color="var(--pd-muted)" aria-hidden />
                {t({ fr: 'Activité récente', en: 'Recent activity' })}
              </h2>
              {seeAll('activity', vm.activity.length)}
            </div>
            <div className="card-body" style={{ padding: '8px 20px' }}>
              {activity.length === 0 ? (
                <div style={emptyStyle}>
                  {t({ fr: 'Aucune activité récente.', en: 'No recent activity.' })}
                </div>
              ) : (
                activity.map((a) => (
                  <div className="alert-row" key={a.id} style={{ cursor: 'default' }}>
                    <span className="alert-name">
                      {a.label}{' '}
                      <span style={{ color: 'var(--pd-muted)' }}>— {actionLabel(a.action)}</span>
                    </span>
                    <span className="alert-meta">{fmtDate(a.at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Couverture pays — UEMOA + Nigeria + Ghana (10), 0 + pastille grise si vide. */}
        <div className="card" role="region" aria-labelledby="dash-coverage">
          <div className="card-hd">
            <h2 className="card-title" id="dash-coverage">
              <Globe size={15} color="var(--info)" aria-hidden />
              {t({ fr: 'Couverture Pays UEMOA/CEDEAO', en: 'UEMOA/ECOWAS country coverage' })}
            </h2>
            <span className="card-action" style={{ cursor: 'default', color: 'var(--pd-muted)' }}>
              {DASHBOARD_COUNTRIES.length} {t({ fr: 'pays', en: 'countries' })}
            </span>
          </div>
          <div className="card-body">
            <div className="grid-cc">
              {DASHBOARD_COUNTRIES.map((c) => {
                const n = derived.counts.get(c.code) ?? 0
                return (
                  <div className="ctry-tile" key={c.code} title={countryLabel(c.code, lang)}>
                    <div className="ctry-flag">
                      <CountryFlag code={c.code} size={30} />
                    </div>
                    <div className="ctry-name">{countryLabel(c.code, lang)}</div>
                    <div className="ctry-cnt">
                      <div
                        className="ctry-dot"
                        style={{ background: DOT_COLOR[derived.countryTone(c.code)] }}
                      />
                      {n} {t({ fr: 'dossier(s)', en: 'dossier(s)' })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Conservée hors mockup (décision CEO) : veille réglementaire. */}
      <div className="mt-5">
        <VeilleCard />
      </div>
    </>
  )
}
