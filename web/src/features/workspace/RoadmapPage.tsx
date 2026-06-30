import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BellRing,
  BookOpen,
  Building2,
  ClipboardCheck,
  Clock,
  Coins,
  FlaskConical,
  History,
  Landmark,
  Languages,
  type LucideIcon,
  Package,
  Receipt,
  Route,
  Send,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Page } from '@/components/ui/page'
import { StatusBadge } from '@/components/ui/status-badge'
import { CountryFlag } from '@/features/dashboard/CountryFlag'
import { listByDossier } from '@/features/correspondence/correspondence-repository'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { lookupVariation } from '@/features/variations/variation-request'
import { activityLabel, countryLabel } from './dossier-constants'
import { getDossier } from './dossier-repository'
import {
  deriveLifecycle,
  journalLabel,
  LIFECYCLE_STAGES,
  LIFECYCLE_STATUS_TONE,
  lifecycleStatusLabel,
  stageOutcomeLabel,
  type LifecycleStage,
  type LifecycleStageId,
  type StageStatus,
} from './lifecycle-constants'
import { lifecycleConfigFor, submissionModeLabel } from './lifecycle-config'
import { listLifecycleEvents } from './lifecycle-repository'
import { agencyFor, officialLanguage, regulatoryProfileFor } from './roadmap-data'
import type { ReactNode } from 'react'

/** Icône Tabler du mockup → équivalent lucide, par étape. */
const STAGE_ICON: Record<LifecycleStageId, LucideIcon> = {
  montage: Package,
  revue: Send,
  decision: ClipboardCheck,
  depot: Landmark,
  soumission: Receipt,
  notifications: BellRing,
  amm: Award,
}

const LANG_LABELS: Record<string, Translatable> = {
  fr: { fr: 'Français', en: 'French' },
  en: { fr: 'Anglais', en: 'English' },
  pt: { fr: 'Portugais', en: 'Portuguese' },
}

/** Définition (titre + acteur) par étape — lookup direct (évite un find répété + un non-null). */
const STAGE_DEF = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s.id, s])) as Record<
  LifecycleStageId,
  (typeof LIFECYCLE_STAGES)[number]
>

const formatDate = (iso: string, lang: Lang): string =>
  new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export function RoadmapPage() {
  const { t, lang } = useI18n()
  const { dossierId } = useParams()
  const navigate = useNavigate()

  const data = useLiveQuery(async () => {
    if (!dossierId) return null
    const dossier = (await getDossier(dossierId)) ?? null
    if (!dossier) return { dossier: null }
    const [events, correspondences] = await Promise.all([
      listLifecycleEvents(dossierId),
      listByDossier(dossierId),
    ])
    return { dossier, events, correspondences }
  }, [dossierId])

  if (data === undefined) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t({ fr: 'Chargement…', en: 'Loading…' })}
      </p>
    )
  }
  if (!data || data.dossier === null) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">
          {t({ fr: 'Dossier introuvable.', en: 'Dossier not found.' })}
        </p>
        <Button variant="ghost" className="mt-2 -ml-2" onClick={() => navigate('/workspace')}>
          <ArrowLeft /> {t({ fr: 'Retour aux dossiers', en: 'Back to dossiers' })}
        </Button>
      </div>
    )
  }

  const { dossier, events, correspondences } = data
  const lifecycle = deriveLifecycle({
    dossierId: dossier.id,
    dossierCreatedAt: dossier.createdAt,
    events,
    correspondences,
  })

  const agency = agencyFor(dossier.country)
  const profile = regulatoryProfileFor(dossier.country)
  const config = lifecycleConfigFor(dossier.country)
  const activity = dossier.activity
  const officialLang = officialLanguage(dossier.country)
  const opRef =
    dossier.opYear != null && dossier.opNumber != null
      ? `OP-${dossier.opYear}-${String(dossier.opNumber).padStart(4, '0')}`
      : t({ fr: 'N° en attente', en: 'Pending number' })

  // Variation : décompte mineures / majeures pour le total de redevance.
  const refs = dossier.variations ?? []
  const minorCount = refs.filter((r) => lookupVariation(r)?.class === 'mineure').length
  const majorCount = refs.length - minorCount
  const money = (n: number) =>
    `${n.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} ${profile?.currency ?? ''}`.trim()

  const feeNode = (): ReactNode => {
    if (!profile) {
      return (
        <div className="text-muted-foreground text-xs">
          {t({
            fr: `Selon le barème de l'${agency.name} — à confirmer.`,
            en: `According to ${agency.name}'s fee schedule — to be confirmed.`,
          })}
        </div>
      )
    }
    const f = profile.fees
    if (activity === 'new_ma' && f.new_ma != null) {
      return <div className="text-foreground font-medium">{money(f.new_ma)}</div>
    }
    if (activity === 'renewal' && f.renewal != null) {
      return <div className="text-foreground font-medium">{money(f.renewal)}</div>
    }
    if (activity === 'variation' && f.variation_minor != null && f.variation_major != null) {
      const total = minorCount * f.variation_minor + majorCount * f.variation_major
      return (
        <div className="space-y-0.5 text-xs">
          <div>
            <span className="font-medium">{t({ fr: 'Mineure', en: 'Minor' })}</span> :{' '}
            {money(f.variation_minor)}
          </div>
          <div>
            <span className="font-medium">{t({ fr: 'Majeure', en: 'Major' })}</span> :{' '}
            {money(f.variation_major)}
          </div>
          {refs.length ? (
            <div className="text-muted-foreground pt-1">
              {t({ fr: 'Total estimé', en: 'Estimated total' })} :{' '}
              <span className="text-foreground font-medium">{money(total)}</span>{' '}
              {t({
                fr: `(${minorCount} mineure(s), ${majorCount} majeure(s)).`,
                en: `(${minorCount} minor, ${majorCount} major).`,
              })}
            </div>
          ) : null}
        </div>
      )
    }
    return (
      <div className="text-muted-foreground text-xs">
        {t({ fr: 'À confirmer auprès de l’agence.', en: 'To be confirmed with the agency.' })}
      </div>
    )
  }

  const sampleLines: Translatable[] | undefined =
    activity === 'new_ma' ? profile?.samples.new_ma : profile?.samples.renewal_variation
  const samplesNode = (): ReactNode => {
    if (!profile || !sampleLines) {
      return (
        <div className="text-muted-foreground text-xs">
          {config.sampleImportAuthRequired
            ? t({
                fr: `Modèles-vente + autorisation d'importation (nombre fixé par l'${agency.name}).`,
                en: `Sales samples + import authorisation (number set by ${agency.name}).`,
              })
            : t({
                fr: `Modèles-vente (nombre fixé par l'${agency.name}).`,
                en: `Sales samples (number set by ${agency.name}).`,
              })}
        </div>
      )
    }
    return (
      <div className="text-xs">
        <ul className="text-muted-foreground list-inside list-disc space-y-1">
          {sampleLines.map((line, i) => (
            <li key={i}>{t(line)}</li>
          ))}
        </ul>
        {profile.samples.reserve ? (
          <p className="text-muted-foreground/80 mt-2 italic">{t(profile.samples.reserve)}</p>
        ) : null}
      </div>
    )
  }

  const delaiNode = (): ReactNode =>
    profile?.processingDays != null ? (
      <div className="text-foreground text-sm font-medium">
        {t({ fr: `≈ ${profile.processingDays} jours`, en: `≈ ${profile.processingDays} days` })}
      </div>
    ) : (
      <div className="text-muted-foreground text-xs">
        {t({
          fr: `À confirmer auprès de l'${agency.name}.`,
          en: `To be confirmed with ${agency.name}.`,
        })}
      </div>
    )

  // Journal : événements passés (réels) + la suite (étape courante « en cours » + à venir).
  const upcoming = lifecycle.stages.filter((s) => s.status !== 'done')

  return (
    <Page className="max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        className="-mb-2 -ml-2"
        onClick={() => navigate('/workspace')}
      >
        <ArrowLeft /> {t({ fr: 'Dossiers', en: 'Dossiers' })}
      </Button>

      {/* ── En-tête dossier ───────────────────────────────────────────── */}
      <div className="bg-card flex flex-wrap items-center gap-4 rounded-xl border p-5">
        <span className="bg-info-subtle text-info flex size-11 shrink-0 items-center justify-center rounded-xl">
          <Package className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{dossier.productName}</h1>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-mono">{opRef}</span>
            <Dot />
            <CountryFlag code={dossier.country} size={15} />
            <span>
              {countryLabel(dossier.country, lang)} · {agency.name}
            </span>
            <Dot />
            <span>{activityLabel(activity, lang)}</span>
          </div>
        </div>
        <StatusBadge tone={LIFECYCLE_STATUS_TONE[lifecycle.status]}>
          {lifecycleStatusLabel(lifecycle.status, lang)}
        </StatusBadge>
      </div>

      {/* ── Le parcours (pipeline live) ───────────────────────────────── */}
      <section>
        <SectionTag
          icon={Route}
          label={t({ fr: 'Le parcours · suivi en temps réel', en: 'The path · live tracking' })}
        />
        <div className="bg-card rounded-xl border p-4 sm:p-5">
          {/* 7 étapes : scroll horizontal sous sm (sinon labels coupés), flex-1 qui remplit dès sm. */}
          <div className="overflow-x-auto pb-1">
            <div className="relative flex min-w-max sm:min-w-0">
              <div className="bg-border absolute top-[18px] right-[7%] left-[7%] h-0.5" />
              {lifecycle.stages.map((stage) => (
                <StageNode key={stage.id} stage={stage} lang={lang} t={t} />
              ))}
            </div>
          </div>
          <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <LegendSwatch className="bg-success" label={t({ fr: 'Fait', en: 'Done' })} />
            <LegendSwatch className="bg-warning" label={t({ fr: 'En cours', en: 'In progress' })} />
            <LegendSwatch
              className="bg-muted border-border border"
              label={t({ fr: 'À venir', en: 'Upcoming' })}
            />
            <span className="ml-auto font-medium">
              {t({
                fr: `Avancement ${lifecycle.progress.done} / ${lifecycle.progress.total} étapes`,
                en: `Progress ${lifecycle.progress.done} / ${lifecycle.progress.total} stages`,
              })}
            </span>
          </div>
        </div>
      </section>

      {/* ── Référence réglementaire ───────────────────────────────────── */}
      <section>
        <SectionTag
          icon={BookOpen}
          label={t({
            fr: `Référence réglementaire · ${activityLabel(activity, lang)} × ${countryLabel(dossier.country, lang)}`,
            en: `Regulatory reference · ${activityLabel(activity, lang)} × ${countryLabel(dossier.country, lang)}`,
          })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <RefCard icon={Building2} title={t({ fr: 'Agence nationale', en: 'National agency' })}>
            <div className="font-medium">{agency.name}</div>
            <div className="text-muted-foreground text-xs">{agency.full}</div>
          </RefCard>
          <RefCard
            icon={Languages}
            title={t({ fr: 'Langue de soumission', en: 'Submission language' })}
          >
            <div className="font-medium">
              {t(LANG_LABELS[officialLang] ?? { fr: 'Français', en: 'French' })}
            </div>
            <div className="text-muted-foreground text-xs">
              {t({ fr: 'Dossier & correspondance', en: 'Dossier & correspondence' })}
            </div>
          </RefCard>
          <RefCard icon={Send} title={t({ fr: 'Mode de soumission', en: 'Submission mode' })}>
            <div className="font-medium">{submissionModeLabel(config.submissionMode, lang)}</div>
            <div className="text-muted-foreground text-xs">
              {config.localAgentRequired
                ? t({ fr: 'Agent local requis', en: 'Local agent required' })
                : t({ fr: 'Sans agent local', en: 'No local agent' })}
              {config.unconfirmed ? t({ fr: ' · à confirmer', en: ' · to be confirmed' }) : ''}
            </div>
          </RefCard>
          <RefCard
            icon={FlaskConical}
            title={t({ fr: 'Échantillons', en: 'Samples' })}
            subtitle={activityLabel(activity, lang)}
          >
            {samplesNode()}
          </RefCard>
          <RefCard icon={Clock} title={t({ fr: 'Délai indicatif', en: 'Indicative timeline' })}>
            {delaiNode()}
          </RefCard>
          <RefCard
            icon={Coins}
            title={t({ fr: 'Frais / barème', en: 'Fees' })}
            subtitle={activityLabel(activity, lang)}
          >
            {feeNode()}
          </RefCard>
        </div>
        <p className="text-muted-foreground mt-3 text-xs italic">
          {t({
            fr: `Référence ${agency.name} (${countryLabel(dossier.country, lang)}) — à valider auprès de l'agence avant dépôt.`,
            en: `${agency.name} reference (${countryLabel(dossier.country, lang)}) — to be validated with the agency before submission.`,
          })}
        </p>
      </section>

      {/* ── Journal ───────────────────────────────────────────────────── */}
      <section>
        <SectionTag
          icon={History}
          label={t({
            fr: 'Journal · chaque partie suit en temps réel',
            en: 'Journal · every party tracks live',
          })}
        />
        <div className="bg-card rounded-xl border p-5">
          <div className="relative pl-6">
            <div className="bg-border absolute top-1 bottom-1 left-[9px] w-0.5" />
            {lifecycle.journal.map((entry, i) => (
              <JournalRow
                key={`past-${i}`}
                state="done"
                label={journalLabel(entry, lang)}
                date={formatDate(entry.at, lang)}
              />
            ))}
            {upcoming.map((stage) => (
              <JournalRow
                key={`next-${stage.id}`}
                state={stage.status === 'current' ? 'current' : 'future'}
                label={t(STAGE_DEF[stage.id].label)}
                date={
                  stage.status === 'current'
                    ? t({ fr: 'en cours', en: 'in progress' })
                    : t({ fr: 'à venir', en: 'upcoming' })
                }
              />
            ))}
          </div>
        </div>
      </section>

      <Button className="w-fit" onClick={() => navigate(`/workspace/${dossier.id}`)}>
        {t({ fr: "Accéder à l'espace de montage", en: 'Go to the workspace' })} <ArrowRight />
      </Button>
    </Page>
  )
}

function Dot() {
  return <span className="text-muted-foreground/50">·</span>
}

function SectionTag({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <h2 className="text-primary mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
      <Icon className="size-3.5" /> {label}
    </h2>
  )
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-full', className)} /> {label}
    </span>
  )
}

function RefCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="text-muted-foreground size-4" />
        {title}
        {subtitle ? (
          <span className="text-muted-foreground ml-auto text-[11px] font-normal">{subtitle}</span>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  )
}

const DOT_CLASS: Record<StageStatus, string> = {
  done: 'bg-success text-white',
  current: 'bg-warning text-white ring-4 ring-warning-subtle',
  todo: 'bg-muted text-muted-foreground border-border border',
}

function StageNode({
  stage,
  lang,
  t,
}: {
  stage: LifecycleStage
  lang: Lang
  t: (v: Translatable) => string
}) {
  const def = STAGE_DEF[stage.id]
  const Icon = STAGE_ICON[stage.id]
  return (
    <div className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 px-0.5 text-center sm:w-auto sm:flex-1">
      <div className="flex h-4 items-end">
        {stage.status === 'current' ? (
          <span className="bg-warning-subtle text-warning-subtle-foreground rounded-full px-1.5 py-px text-[9px] font-semibold whitespace-nowrap">
            {t({ fr: 'vous êtes ici', en: 'you are here' })}
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-full',
          DOT_CLASS[stage.status],
        )}
      >
        <Icon className="size-4" />
      </span>
      <span
        className={cn(
          'text-[11px] leading-tight font-semibold',
          stage.status === 'todo' && 'text-muted-foreground',
        )}
      >
        {t(def.label)}
      </span>
      {stage.outcome ? (
        <span
          className={cn(
            'text-[10px] font-medium',
            stage.outcome === 'accepted' || stage.outcome === 'granted'
              ? 'text-success'
              : stage.outcome === 'rejected' || stage.outcome === 'refused'
                ? 'text-danger'
                : 'text-warning',
          )}
        >
          {stageOutcomeLabel(stage.outcome, lang)}
        </span>
      ) : null}
      <span className="text-muted-foreground text-[10px] leading-tight">{t(def.actor)}</span>
    </div>
  )
}

const JOURNAL_DOT: Record<'done' | 'current' | 'future', string> = {
  done: 'bg-success border-success',
  current: 'bg-warning border-warning',
  future: 'bg-card border-border',
}

function JournalRow({
  state,
  label,
  date,
}: {
  state: 'done' | 'current' | 'future'
  label: string
  date: string
}) {
  return (
    <div className="relative pb-4 text-sm last:pb-0">
      <span
        className={cn(
          'absolute top-1 -left-[18px] size-3 rounded-full border-2',
          JOURNAL_DOT[state],
        )}
      />
      <div className={cn(state === 'future' && 'text-muted-foreground')}>{label}</div>
      <div className="text-muted-foreground text-[11px]">{date}</div>
    </div>
  )
}
