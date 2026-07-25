import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  CalendarClock,
  ClipboardList,
  Clock,
  FolderOpen,
  Globe,
  History,
  Mail,
  Package,
  PauseCircle,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'

import { useAuditSync } from '@/features/audit/use-audit-sync'
import { useAuth } from '@/features/auth/auth-context'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import { pendingRefUpdate } from '@/features/catalogue/ref-state'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { useOrgId } from '@/features/org/org-context'
import { useMemberScope } from '@/features/org/use-current-org'
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import { useDossierSync } from '@/features/workspace/use-dossier-sync'
import { db } from '@/lib/db'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { CountryFlag } from './CountryFlag'
import {
  buildActions,
  complianceRate,
  conformityTone,
  countryStats,
  expiringDocs,
  expiryTone,
  KPI_BADGE_TONE,
  openCorrespondences,
  portfolio,
  recentActivity,
  type ActionKind,
  type CorrSubState,
  type CountryStat,
  type KpiTone,
  type UrgencyLevel,
} from './dashboard-data'
import { statCls, urgencyCls } from './dashboard-ui'
import './dashboard-mockup.css'

const SYNE = "'Syne Variable', 'Syne', sans-serif"
const PREVIEW = 5

// Couverture pays : UEMOA (8) + Nigeria + Ghana (choix CEO), dans l'ordre source.
const DASHBOARD_COUNTRY_CODES = ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG', 'NG', 'GH']
const DASHBOARD_COUNTRIES = COUNTRIES.filter((c) => DASHBOARD_COUNTRY_CODES.includes(c.code))

const KIND_BADGE: Record<ActionKind, { cls: string; Icon: LucideIcon; fr: string; en: string }> = {
  doc_expired: { cls: 'badge-red', Icon: AlertTriangle, fr: 'Expirant', en: 'Expiring' },
  non_conform: { cls: 'badge-red', Icon: AlertCircle, fr: 'Non conforme', en: 'Non-compliant' },
  doc_expiring: { cls: 'badge-amber', Icon: RefreshCw, fr: 'Renouvellement', en: 'Renewal' },
  dossier_suspended: {
    cls: 'badge-amber',
    Icon: PauseCircle,
    fr: 'Complément requis',
    en: 'Additional info required',
  },
  unread_reply: { cls: 'badge-blue', Icon: Mail, fr: 'Réponse agence', en: 'Agency reply' },
  agency_pending: { cls: 'badge-blue', Icon: Clock, fr: 'En attente', en: 'Pending' },
  ref_update: {
    cls: 'badge-blue',
    Icon: ScrollText,
    fr: 'Référentiel à adopter',
    en: 'Reference data to adopt',
  },
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

/** Ce que dit la COULEUR du panneau (barème CEO) — repris en infobulle : jamais la couleur seule. */
const URGENCY_LABEL: Record<UrgencyLevel, Translatable> = {
  danger: { fr: 'AMM expirée', en: 'MA expired' },
  warning: { fr: 'pièce administrative expirée', en: 'administrative document expired' },
  caution: { fr: 'pièce sous préavis de renouvellement', en: 'document within renewal notice' },
  none: { fr: 'aucune échéance', en: 'no deadline' },
}

export function DashboardPage() {
  const orgId = useOrgId()
  const { scoped } = useMemberScope()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  useCorrespondenceSync(orgId)
  useAuditSync(orgId)

  const [showAll, setShowAll] = useState({ alerts: false, subs: false, activity: false })

  const data = useLiveQuery(async () => {
    const [
      products,
      documents,
      dossiers,
      correspondences,
      messages,
      reads,
      docAnalysis,
      auditLog,
      parties,
      pendingRef,
    ] = await Promise.all([
      db.products.where('orgId').equals(orgId).toArray(),
      db.documents.where('orgId').equals(orgId).toArray(),
      db.dossiers.where('orgId').equals(orgId).toArray(),
      db.correspondences.where('orgId').equals(orgId).toArray(),
      db.correspondenceMessages.where('orgId').equals(orgId).toArray(),
      db.correspondenceReads.toArray(),
      db.docAnalysis.toArray(),
      db.auditLog.where('orgId').equals(orgId).toArray(),
      // Nomme/route les alertes des documents ORG-scopés (pièces propres d'un MAH/fabricant, 0069).
      db.parties.where('orgId').equals(orgId).toArray(),
      // Référentiel publié en attente d'adoption par l'org (0072) → alerte « à adopter ». Jamais
      // pour un membre SCOPÉ : il ne lit pas les adoptions (CS1) et le catalogue lui est fermé.
      scoped ? Promise.resolve(null) : pendingRefUpdate(orgId),
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
      parties,
      pendingRef,
    }
  }, [orgId, scoped])

  const {
    products = [],
    documents = [],
    dossiers = [],
    correspondences = [],
    messages = [],
    reads = [],
    docAnalysis = [],
    auditLog = [],
    parties = [],
    pendingRef = null,
  } = data ?? {}

  const vm = useMemo(() => {
    const now = new Date()
    const input = {
      products,
      documents,
      dossiers,
      correspondences,
      messages,
      reads,
      docAnalysis,
      parties,
      refUpdate: pendingRef
        ? { label: pendingRef.target.label, publishedAt: pendingRef.target.publishedAt ?? '' }
        : undefined,
    }
    return {
      actions: buildActions(input, now),
      corrItems: openCorrespondences(correspondences, messages, reads),
      activity: recentActivity(auditLog, 50),
      echeances: expiringDocs(documents, products, now),
      portfolio: portfolio(products, dossiers),
      /** Taux de conformité = dossiers À JOUR / dossiers (barème CEO, sans pondération). */
      compliance: complianceRate(dossiers, documents, now),
      /** Stats par pays des tuiles de couverture (dossiers · urgences · conformité · messages). */
      countries: countryStats(input, now),
    }
  }, [
    products,
    documents,
    dossiers,
    correspondences,
    messages,
    reads,
    docAnalysis,
    auditLog,
    parties,
    pendingRef,
  ])

  const derived = useMemo(() => {
    const open = vm.corrItems.filter((c) => c.state !== 'decided')
    return {
      submissionsOpen: open.length,
      submissionsCountries: new Set(open.map((c) => c.country)).size,
      compliance: vm.compliance.pct,
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
    href?: string
  }[] = [
    {
      Ico: Package,
      tone: 'neutral',
      href: '/catalogue',
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
      href: '/catalogue?filter=expiring',
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
      href: '/catalogue?filter=expiring',
      label: t({ fr: 'Taux de Conformité', en: 'Compliance rate' }),
      val: derived.compliance == null ? '—' : `${derived.compliance}%`,
      sub: t({
        fr: `${vm.compliance.upToDate}/${vm.compliance.total} à jour`,
        en: `${vm.compliance.upToDate}/${vm.compliance.total} up to date`,
      }),
      bar: conformityBar,
    },
  ]

  const alerts = showAll.alerts ? vm.actions : vm.actions.slice(0, PREVIEW)
  const subs = showAll.subs ? vm.corrItems : vm.corrItems.slice(0, PREVIEW)
  const activity = showAll.activity ? vm.activity : vm.activity.slice(0, PREVIEW)

  /**
   * Corps de carte. Déplié = la carte NE GRANDIT PAS : le corps est plafonné et défile (barre à
   * droite) — retour CEO. `total > PREVIEW` suit la condition du bouton : si la liste rétrécit, le
   * bouton disparaît ET le mode défilement avec (sinon la gouttière resterait réservée à vie).
   * `tabIndex` : Timeline/Activité n'ont aucun élément focusable → zone inatteignable au clavier sans.
   */
  const bodyProps = (key: 'alerts' | 'subs' | 'activity', total: number, label: string) => {
    const scroll = showAll[key] && total > PREVIEW
    return {
      className: `card-body${scroll ? ' is-scroll' : ''}`,
      ...(scroll ? { tabIndex: 0, 'aria-label': label } : {}),
    }
  }

  /** Résumé textuel des stats d'un pays (aria-label de la tuile — la couleur ne porte jamais l'info). */
  const countrySummary = (st: CountryStat) =>
    t({
      fr: `${st.dossiers} dossier(s), ${st.urgent} urgent(s), conformité ${st.conformity} % (${st.upToDate}/${st.dossiers} à jour), ${t(URGENCY_LABEL[st.urgency])}, ${st.messages} message(s) non lu(s)`,
      en: `${st.dossiers} dossier(s), ${st.urgent} urgent, compliance ${st.conformity}% (${st.upToDate}/${st.dossiers} up to date), ${t(URGENCY_LABEL[st.urgency])}, ${st.messages} unread message(s)`,
    })

  /**
   * Micro-stats d'une tuile pays : dossiers · urgences · conformité · messages. Seuls les
   * indicateurs ACTIONNABLES se colorent — les zéros restent gris (lisible, jamais touffu).
   * `aria-hidden` : le résumé complet est déjà porté par l'`aria-label` de la tuile.
   */
  const countryStatRow = (st: CountryStat) => {
    const conf = st.conformity
    // Barème de conformité : SOURCE UNIQUE `conformityTone` + `KPI_BADGE_TONE` (même échelle que
    // le KPI « Taux de Conformité ») — jamais un second barème dupliqué par surface.
    const confCls = `ctry-stat is-${KPI_BADGE_TONE[conformityTone(conf)]}`
    return (
      <div className="ctry-stats" aria-hidden>
        <span
          className="ctry-stat"
          title={t({ fr: `${st.dossiers} dossier(s)`, en: `${st.dossiers} dossier(s)` })}
        >
          <FolderOpen size={11} strokeWidth={2} />
          {st.dossiers}
        </span>
        <span
          className={urgencyCls(st.urgency)}
          title={`${t({ fr: `${st.urgent} point(s) urgent(s)`, en: `${st.urgent} urgent item(s)` })} — ${t(URGENCY_LABEL[st.urgency])}`}
        >
          <AlertTriangle size={11} strokeWidth={2} />
          {st.urgent}
        </span>
        <span
          className={confCls}
          title={t({
            fr: `Conformité ${conf} % — ${st.upToDate}/${st.dossiers} dossier(s) à jour`,
            en: `Compliance ${conf}% — ${st.upToDate}/${st.dossiers} dossier(s) up to date`,
          })}
        >
          <ShieldCheck size={11} strokeWidth={2} />
          {`${conf}%`}
        </span>
        <span
          className={statCls(st.messages > 0, 'info')}
          title={t({
            fr: `${st.messages} message(s) non lu(s)`,
            en: `${st.messages} unread message(s)`,
          })}
        >
          <Mail size={11} strokeWidth={2} />
          {st.messages}
        </span>
      </div>
    )
  }

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
            const inner = (
              <>
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
              </>
            )
            const style = { '--kpi-accent': accent } as CSSProperties
            return k.href ? (
              <Link className="kpi" key={i} to={k.href} style={style}>
                {inner}
              </Link>
            ) : (
              <div className="kpi" key={i} style={style}>
                {inner}
              </div>
            )
          })}
        </div>

        {/* Couverture pays — remontée au-dessus des 3 cartes (retour CEO). UEMOA + Nigeria + Ghana. */}
        <div className="card card-block" role="region" aria-labelledby="dash-coverage">
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
                const st = vm.countries.get(c.code)
                const name = countryLabel(c.code, lang)
                const inner = (
                  <>
                    <div className="ctry-flag">
                      <CountryFlag code={c.code} size={30} />
                    </div>
                    <div className="ctry-name">{name}</div>
                    {st ? (
                      countryStatRow(st)
                    ) : (
                      <div className="ctry-cnt">{t({ fr: 'Aucun dossier', en: 'No dossier' })}</div>
                    )}
                  </>
                )
                // Tuile cliquable seulement si elle a des dossiers → filtre le catalogue par ce pays.
                return st ? (
                  <Link
                    className="ctry-tile"
                    key={c.code}
                    to={`/catalogue?country=${c.code}`}
                    title={name}
                    aria-label={t({
                      fr: `${name} — ${countrySummary(st)} — voir le catalogue`,
                      en: `${name} — ${countrySummary(st)} — view catalogue`,
                    })}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="ctry-tile" key={c.code} title={name}>
                    {inner}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Alertes | Timeline | Activité — descendues sous la couverture pays (retour CEO). */}
        <div className="grid-3">
          <div className="card" role="region" aria-labelledby="dash-alerts">
            <div className="card-hd">
              <h2 className="card-title" id="dash-alerts">
                <AlertTriangle size={15} color="var(--danger)" aria-hidden />
                {t({ fr: 'Alertes Réglementaires', en: 'Regulatory Alerts' })}
              </h2>
              {seeAll('alerts', vm.actions.length)}
            </div>
            <div
              {...bodyProps(
                'alerts',
                vm.actions.length,
                t({ fr: 'Alertes, liste défilante', en: 'Alerts, scrollable list' }),
              )}
              style={{ padding: '8px 20px' }}
            >
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
            <div
              {...bodyProps(
                'subs',
                vm.corrItems.length,
                t({ fr: 'Soumissions, liste défilante', en: 'Submissions, scrollable list' }),
              )}
            >
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
            <div
              {...bodyProps(
                'activity',
                vm.activity.length,
                t({ fr: 'Activité, liste défilante', en: 'Activity, scrollable list' }),
              )}
              style={{ padding: '8px 20px' }}
            >
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
      </div>
    </>
  )
}
