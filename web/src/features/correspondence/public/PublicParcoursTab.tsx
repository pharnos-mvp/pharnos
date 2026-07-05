import { useMemo, useState } from 'react'
import {
  Bell,
  Building2,
  Check,
  CircleCheck,
  CircleDashed,
  Landmark,
  Loader2,
  Paperclip,
  ScrollText,
  Send,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CONDITION_TITLES,
  deriveSubmissionConditions,
} from '@/features/workspace/lifecycle-conditions'
import { lifecycleConfigFor, submissionModeLabel } from '@/features/workspace/lifecycle-config'
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STATUS_TONE,
  journalDetail,
  journalLabel,
  lifecycleStatusLabel,
  type LifecycleJournalEntry,
} from '@/features/workspace/lifecycle-constants'
import { agencyFor } from '@/features/workspace/roadmap-data'
import { countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

import { eventsFromBlock, lifecycleStateFromBlock } from './parcours-data'
import type { LifecycleBlock, ReviewCorrespondence } from './review-api'

const MAX_FILE_BYTES = 4 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx'
const JOURNAL_PREVIEW = 8

const TONE_BADGE: Record<string, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  info: 'bg-blue-100 text-blue-800 border-transparent dark:bg-blue-950 dark:text-blue-300',
  success:
    'bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 border-transparent dark:bg-red-950 dark:text-red-300',
}

const dtLocale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'fr')
const fmtDate = (iso: string | null, lang: Lang): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(dtLocale(lang), { dateStyle: 'medium' }).format(d)
}

/** Sélecteur de pièce UNIQUE (récépissé / preuve) — bornes identiques au fil (4 Mo, whitelist). */
function ProofPicker({
  file,
  onPick,
  label,
}: {
  file: File | null
  onPick: (f: File | null) => void
  label: string
}) {
  const { t } = useI18n()
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold">{label}</span>
      {file ? (
        <span className="bg-muted/40 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
          <span className="flex min-w-0 items-center gap-1">
            <Paperclip className="size-3 shrink-0" />
            <span className="truncate">{file.name}</span>
          </span>
          <button
            type="button"
            className="cursor-pointer"
            aria-label={t({ fr: `Retirer ${file.name}`, en: `Remove ${file.name}` })}
            onClick={() => onPick(null)}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <label className="border-input text-muted-foreground hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
          <Paperclip className="size-3.5" />
          {t({ fr: 'Joindre (PDF, image — 4 Mo max)', en: 'Attach (PDF, image — 4 MB max)' })}
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              if (f && f.size > MAX_FILE_BYTES) {
                toast.error(
                  t({ fr: `« ${f.name} » dépasse 4 Mo.`, en: `“${f.name}” exceeds 4 MB.` }),
                )
                return
              }
              onPick(f)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

/**
 * Onglet « Parcours du dossier » de la page tokenisée (M7, LOT 10b — mockup validé CEO) :
 * timeline PARTAGÉE (même dérivateur que la Roadmap du labo) + actions de l'AGENT par étape
 * (confirmer réception / dépôt agence + récépissé / relayer notification / transmettre l'AMM) +
 * conditions et référence pays en LECTURE (pilotées labo, M3) + journal (relances Système
 * comprises). Chaque action = un événement append-only écrit par l'Edge après validation token.
 */
export function PublicParcoursTab({
  block,
  correspondence,
  busy,
  onEvent,
}: {
  block: LifecycleBlock
  correspondence: ReviewCorrespondence
  /** Une écriture est en cours (verrouille tous les boutons d'action). */
  busy: boolean
  /** Journalise l'événement via l'Edge ; résout `true` si accepté (le payload est rafraîchi). */
  onEvent: (type: string, payload: Record<string, unknown>, file: File | null) => Promise<boolean>
}) {
  const { t, lang } = useI18n()
  const state = useMemo(() => lifecycleStateFromBlock(block), [block])
  const config = lifecycleConfigFor(correspondence.country)
  const agency = agencyFor(correspondence.country)
  const conditions = useMemo(
    () =>
      deriveSubmissionConditions({
        dossierId: block.dossier.id,
        events: eventsFromBlock(block),
        sampleImportAuthRequired: config.sampleImportAuthRequired,
      }),
    [block, config.sampleImportAuthRequired],
  )

  // Formulaires locaux (réinitialisés après succès).
  const [confirmDeposit, setConfirmDeposit] = useState(false)
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [note, setNote] = useState('')
  const [notifFile, setNotifFile] = useState<File | null>(null)
  const [ammOpen, setAmmOpen] = useState(false)
  const [ammOutcome, setAmmOutcome] = useState<'granted' | 'refused'>('granted')
  const [ammNumber, setAmmNumber] = useState('')
  const [ammValidUntil, setAmmValidUntil] = useState('')
  const [ammReason, setAmmReason] = useState('')
  const [ammFile, setAmmFile] = useState<File | null>(null)

  async function fire(type: string, payload: Record<string, unknown>, file: File | null) {
    const ok = await onEvent(type, payload, file)
    if (!ok) return
    setConfirmDeposit(false)
    setReference('')
    setReceipt(null)
    setNotifOpen(false)
    setNote('')
    setNotifFile(null)
    setAmmOpen(false)
    setAmmNumber('')
    setAmmValidUntil('')
    setAmmReason('')
    setAmmFile(null)
  }

  const [showAllJournal, setShowAllJournal] = useState(false)
  const journal = state.journal
  const visibleJournal = showAllJournal ? journal : journal.slice(-JOURNAL_PREVIEW)

  const terminal = state.status === 'amm_granted' || state.status === 'amm_refused'
  // Étapes amont (revue en cours après renvoi, etc.) : les actions vivent dans l'onglet Revue.
  const upstream = ['montage', 'revue', 'decision'].includes(state.currentStageId) && !terminal

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5">
      {/* En-tête dossier + statut dérivé */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {correspondence.productName} — {countryLabel(correspondence.country, lang)}
          </h2>
          <p className="text-muted-foreground text-xs">
            {agency.name} · {submissionModeLabel(config.submissionMode, lang)} ·{' '}
            {t({ fr: 'timeline partagée avec', en: 'timeline shared with' })}{' '}
            {correspondence.senderEmail}
          </p>
        </div>
        <Badge className={cn('px-2.5 py-0.5', TONE_BADGE[LIFECYCLE_STATUS_TONE[state.status]])}>
          {lifecycleStatusLabel(state.status, lang)} · {state.progress.done}/{state.progress.total}
        </Badge>
      </div>

      {/* Pipeline 7 étapes (miroir Roadmap labo) */}
      <div className="rounded-xl border p-4">
        <ol
          className="flex min-w-[560px] gap-1 overflow-x-auto sm:min-w-0"
          aria-label={t({ fr: 'Parcours du dossier', en: 'Dossier journey' })}
        >
          {LIFECYCLE_STAGES.map((stage) => {
            const s = state.stages.find((x) => x.id === stage.id)
            const status = s?.status ?? 'todo'
            return (
              <li key={stage.id} className="flex flex-1 flex-col items-center gap-1 text-center">
                <span
                  className={cn(
                    'grid size-8 place-items-center rounded-full text-xs',
                    status === 'done' && 'bg-emerald-600 text-white',
                    status === 'current' &&
                      'bg-amber-500 text-white ring-4 ring-amber-100 dark:ring-amber-950',
                    status === 'todo' && 'bg-muted text-muted-foreground border',
                  )}
                  aria-hidden
                >
                  {status === 'done' ? (
                    <Check className="size-4" />
                  ) : (
                    <CircleDashed className="size-4" />
                  )}
                </span>
                <span className="text-[11px] leading-tight font-semibold">{t(stage.label)}</span>
                <span className="text-muted-foreground text-[10px]">{t(stage.actor)}</span>
                {status === 'current' ? (
                  <span className="rounded-full bg-amber-100 px-2 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {t({ fr: 'vous êtes ici', en: 'you are here' })}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
        {/* Colonne actions AGENT */}
        <section className="space-y-3" aria-label={t({ fr: 'Vos actions', en: 'Your actions' })}>
          {terminal ? (
            <div className="rounded-xl border p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <CircleCheck className="size-4 text-emerald-600" />
                {t({ fr: 'Parcours clôturé', en: 'Journey closed' })} —{' '}
                {lifecycleStatusLabel(state.status, lang)}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {t({
                  fr: 'Le journal ci-dessous fait foi. Merci pour votre accompagnement.',
                  en: 'The journal below is the source of truth. Thank you for your support.',
                })}
              </p>
            </div>
          ) : upstream ? (
            <div className="rounded-xl border p-4 text-sm">
              <div className="font-semibold">
                {t({ fr: 'La revue est en cours', en: 'Review in progress' })}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {t({
                  fr: 'Rendez votre décision depuis l’onglet « Revue & fil » — le parcours reprendra après acceptation.',
                  en: 'Record your decision from the “Review & thread” tab — the journey resumes after acceptance.',
                })}
              </p>
            </div>
          ) : null}

          {/* Étape Dépôt : confirmer la réception */}
          {state.status === 'accepted' ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="size-4" />
                {t({
                  fr: 'Confirmer la réception du dossier',
                  en: 'Confirm receipt of the dossier',
                })}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {t({
                  fr: 'Vous confirmez avoir reçu le dossier en vue du dépôt. Action journalisée, visible du labo en temps réel.',
                  en: 'You confirm you received the dossier ahead of filing. Logged and visible to the lab in real time.',
                })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirmDeposit ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void fire('deposited', {}, null)}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      {t({ fr: 'Oui, je confirme', en: 'Yes, I confirm' })}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmDeposit(false)}
                    >
                      {t({ fr: 'Annuler', en: 'Cancel' })}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setConfirmDeposit(true)}>
                    <Check className="size-4" />{' '}
                    {t({ fr: 'Confirmer la réception', en: 'Confirm receipt' })}
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {/* Étape Soumission : confirmer le dépôt à l'agence */}
          {state.status === 'submitting' ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Landmark className="size-4" />
                {t({
                  fr: `Confirmer le dépôt à l’agence (${agency.name})`,
                  en: `Confirm filing with the agency (${agency.name})`,
                })}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {t({ fr: 'Mode du pays :', en: 'Country mode:' })}{' '}
                <span className="text-foreground font-medium">
                  {submissionModeLabel(config.submissionMode, lang)}
                </span>
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold" htmlFor="parcours-ref">
                    {t({
                      fr: 'Référence de dépôt (optionnelle)',
                      en: 'Filing reference (optional)',
                    })}
                  </label>
                  <Input
                    id="parcours-ref"
                    value={reference}
                    maxLength={120}
                    placeholder={t({ fr: 'ex. ABMed-2026-0784', en: 'e.g. ABMed-2026-0784' })}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
                <ProofPicker
                  file={receipt}
                  onPick={setReceipt}
                  label={t({
                    fr: 'Récépissé / preuve de dépôt (recommandé, jamais obligatoire)',
                    en: 'Receipt / proof of filing (recommended, never required)',
                  })}
                />
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void fire(
                      'submitted',
                      {
                        mode: config.submissionMode,
                        ...(reference.trim() ? { reference: reference.trim() } : {}),
                      },
                      receipt,
                    )
                  }
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {t({ fr: 'Confirmer le dépôt', en: 'Confirm filing' })}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Étape Notifications : relayer / transmettre l'AMM */}
          {state.status === 'in_notification' ? (
            <div className="space-y-3">
              <div className="rounded-xl border p-4">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 text-left text-sm font-semibold"
                  aria-expanded={notifOpen}
                  onClick={() => setNotifOpen((v) => !v)}
                >
                  <Bell className="size-4" />
                  {t({
                    fr: 'Relayer une notification de l’agence',
                    en: 'Relay an agency notification',
                  })}
                </button>
                {notifOpen ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold" htmlFor="parcours-note">
                        {t({
                          fr: 'Objet / résumé (optionnel)',
                          en: 'Subject / summary (optional)',
                        })}
                      </label>
                      <textarea
                        id="parcours-note"
                        rows={3}
                        maxLength={2000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                        placeholder={t({
                          fr: 'ex. Demande de complément CMC — module 3',
                          en: 'e.g. CMC additional-info request — module 3',
                        })}
                      />
                    </div>
                    <ProofPicker
                      file={notifFile}
                      onPick={setNotifFile}
                      label={t({
                        fr: 'Courrier de l’agence (optionnel)',
                        en: 'Agency letter (optional)',
                      })}
                    />
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void fire(
                          'authority_query',
                          { ...(note.trim() ? { note: note.trim() } : {}) },
                          notifFile,
                        )
                      }
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      {t({ fr: 'Relayer la notification', en: 'Relay the notification' })}
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border p-4">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 text-left text-sm font-semibold"
                  aria-expanded={ammOpen}
                  onClick={() => setAmmOpen((v) => !v)}
                >
                  <ScrollText className="size-4" />
                  {t({ fr: 'Transmettre la décision d’AMM', en: 'Forward the MA decision' })}
                </button>
                {ammOpen ? (
                  <div className="mt-3 space-y-3">
                    <div
                      className="flex gap-2"
                      role="radiogroup"
                      aria-label={t({ fr: 'Issue', en: 'Outcome' })}
                    >
                      {(
                        [
                          { v: 'granted', fr: 'AMM délivrée', en: 'MA issued' },
                          { v: 'refused', fr: 'AMM refusée', en: 'MA refused' },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          role="radio"
                          aria-checked={ammOutcome === o.v}
                          onClick={() => setAmmOutcome(o.v)}
                          className={cn(
                            'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium',
                            ammOutcome === o.v
                              ? o.v === 'granted'
                                ? TONE_BADGE.success
                                : TONE_BADGE.danger
                              : 'hover:bg-muted',
                          )}
                        >
                          {t({ fr: o.fr, en: o.en })}
                        </button>
                      ))}
                    </div>
                    {ammOutcome === 'granted' ? (
                      <>
                        <div>
                          <label
                            className="mb-1 block text-xs font-semibold"
                            htmlFor="parcours-amm"
                          >
                            {t({ fr: 'N° d’AMM (requis)', en: 'MA number (required)' })}
                          </label>
                          <Input
                            id="parcours-amm"
                            value={ammNumber}
                            maxLength={80}
                            onChange={(e) => setAmmNumber(e.target.value)}
                          />
                        </div>
                        <div>
                          <label
                            className="mb-1 block text-xs font-semibold"
                            htmlFor="parcours-amm-date"
                          >
                            {t({ fr: 'Valide jusqu’au (optionnel)', en: 'Valid until (optional)' })}
                          </label>
                          <Input
                            id="parcours-amm-date"
                            type="date"
                            value={ammValidUntil}
                            onChange={(e) => setAmmValidUntil(e.target.value)}
                          />
                        </div>
                        <ProofPicker
                          file={ammFile}
                          onPick={setAmmFile}
                          label={t({ fr: 'Preuve d’AMM (optionnelle)', en: 'MA proof (optional)' })}
                        />
                      </>
                    ) : (
                      <div>
                        <label
                          className="mb-1 block text-xs font-semibold"
                          htmlFor="parcours-motif"
                        >
                          {t({ fr: 'Motif (optionnel)', en: 'Reason (optional)' })}
                        </label>
                        <Input
                          id="parcours-motif"
                          value={ammReason}
                          maxLength={500}
                          onChange={(e) => setAmmReason(e.target.value)}
                        />
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant={ammOutcome === 'refused' ? 'destructive' : 'default'}
                      disabled={busy || (ammOutcome === 'granted' && !ammNumber.trim())}
                      onClick={() =>
                        void fire(
                          ammOutcome === 'granted' ? 'amm_granted' : 'amm_refused',
                          ammOutcome === 'granted'
                            ? {
                                amm_number: ammNumber.trim(),
                                ...(ammValidUntil ? { valid_until: ammValidUntil } : {}),
                              }
                            : { ...(ammReason.trim() ? { reason: ammReason.trim() } : {}) },
                          ammOutcome === 'granted' ? ammFile : null,
                        )
                      }
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      {t({ fr: 'Transmettre', en: 'Forward' })}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Journal partagé */}
          <div className="rounded-xl border p-4">
            <h3 className="text-sm font-semibold">
              {t({ fr: 'Journal partagé', en: 'Shared journal' })}
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                {t({ fr: 'qui a fait quoi, et quand', en: 'who did what, and when' })}
              </span>
            </h3>
            <ol className="mt-2 space-y-2">
              {visibleJournal.map((entry: LifecycleJournalEntry) => (
                <li key={entry.id} className="flex items-baseline gap-2 text-xs">
                  <span className="text-muted-foreground w-20 shrink-0">
                    {fmtDate(entry.at, lang)}
                  </span>
                  <span className="min-w-0">
                    <span className="text-foreground font-medium">{journalLabel(entry, lang)}</span>
                    {journalDetail(entry, lang) ? (
                      <span className="text-muted-foreground"> · {journalDetail(entry, lang)}</span>
                    ) : null}
                    {entry.docs && entry.docs.length > 0 ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · <Paperclip className="inline size-3" />{' '}
                        {entry.docs.map((d) => d.name).join(', ')}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground block text-[11px]">
                      {t(entry.actor)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {journal.length > JOURNAL_PREVIEW && !showAllJournal ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setShowAllJournal(true)}
              >
                {t({
                  fr: `Afficher tout (${journal.length})`,
                  en: `Show all (${journal.length})`,
                })}
              </Button>
            ) : null}
          </div>
        </section>

        {/* Colonne lecture : conditions + référence pays */}
        <aside className="space-y-3" aria-label={t({ fr: 'Contexte', en: 'Context' })}>
          <div className="rounded-xl border p-4">
            <h3 className="text-sm font-semibold">
              {t({ fr: 'Conditions de soumission', en: 'Submission conditions' })}
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                {state ? `${conditions.done}/${conditions.total}` : ''}
              </span>
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs">
              {conditions.conditions.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      'px-2 py-0.5',
                      c.status === 'done'
                        ? TONE_BADGE.success
                        : c.status === 'in_progress'
                          ? TONE_BADGE.warning
                          : TONE_BADGE.neutral,
                    )}
                  >
                    {t(CONDITION_TITLES[c.id])}
                  </Badge>
                  <span className="text-muted-foreground">
                    {c.status === 'done'
                      ? t({ fr: 'remplie', en: 'met' })
                      : c.status === 'in_progress'
                        ? t({ fr: 'en cours', en: 'in progress' })
                        : t({ fr: 'à venir', en: 'upcoming' })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-[11px]">
              {t({
                fr: 'Pilotées par le labo — visibles ici pour le contexte.',
                en: 'Managed by the lab — shown here for context.',
              })}
            </p>
          </div>

          <div className="rounded-xl border p-4 text-xs">
            <h3 className="text-sm font-semibold">
              {t({ fr: 'Référence pays', en: 'Country reference' })} —{' '}
              {countryLabel(correspondence.country, lang)}
            </h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">{t({ fr: 'Agence', en: 'Agency' })}</dt>
              <dd>
                {agency.name} — {agency.full}
              </dd>
              <dt className="text-muted-foreground">{t({ fr: 'Mode', en: 'Mode' })}</dt>
              <dd>{submissionModeLabel(config.submissionMode, lang)}</dd>
              <dt className="text-muted-foreground">{t({ fr: 'Échantillons', en: 'Samples' })}</dt>
              <dd>
                {config.sampleImportAuthRequired
                  ? t({ fr: 'autorisation d’import requise', en: 'import authorisation required' })
                  : t({ fr: 'sans autorisation d’import', en: 'no import authorisation' })}
              </dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
