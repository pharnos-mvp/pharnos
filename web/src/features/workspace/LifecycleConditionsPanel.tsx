import { useState, type ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck,
  FlaskConical,
  Info,
  ListChecks,
  Loader2,
  Paperclip,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAuth } from '@/features/auth/auth-context'
import { useCurrentOrg } from '@/features/org/use-current-org'
import { useOrgId } from '@/features/org/org-context'
import { canManageSubmission } from '@/features/team/team-api'
import { UPLOAD_ACCEPT } from '@/lib/files'
import { useI18n } from '@/lib/i18n-context'
import { reportError } from '@/lib/sentry'
import { cn } from '@/lib/utils'
import {
  CONDITION_STEP_ACTIONS,
  CONDITION_STEP_LABELS,
  CONDITION_TITLES,
  type ConditionStepAction,
  type SubmissionCondition,
  type SubmissionConditionId,
  type SubmissionConditionsState,
} from './lifecycle-conditions'
import {
  openLifecycleDoc,
  removeLifecycleDocs,
  uploadLifecycleDoc,
  type LifecycleDocRef,
} from './lifecycle-docs'
import { appendLifecycleEvent } from './lifecycle-repository'
import { syncLifecycle } from './lifecycle-sync'

const TODAY = () => new Date().toISOString().slice(0, 10)

/** Date `YYYY-MM-DD` → ISO à midi UTC (même règle que LifecycleActionCard : pas de décalage de jour). */
function toOccurredAt(day: string): string | undefined {
  if (!day) return undefined
  const ts = Date.parse(`${day}T12:00:00.000Z`)
  return Number.isNaN(ts) ? undefined : new Date(ts).toISOString()
}

const CONDITION_ICON: Record<SubmissionConditionId, LucideIcon> = {
  ctd: FileCheck,
  samples: FlaskConical,
  fees: Receipt,
}

/**
 * Panneau « Conditions de soumission » (jalon M3) — les 3 conditions (CTD / échantillons / frais)
 * suivies en parallèle du parcours, JAMAIS bloquantes (décision CEO). Compact par design (demande
 * CEO « page pas trop longue ») : accordéon 1 ligne par condition, seule la première actionnable
 * s'ouvre par défaut ; après la Soumission confirmée le panneau se replie en récap d'une ligne.
 *
 * Chaque sous-étape journalise un `lifecycle_event` (append-only, offline-first) ; la pièce jointe
 * (autorisation d'import, LTA, SWIFT…) est recommandée, jamais obligatoire — upload en ligne
 * seulement, l'événement reste journalisable hors-ligne sans pièce. Gating UI = gestionnaires de
 * soumission (miroir RLS 0047) ; la RLS reste la vraie barrière.
 */
export function LifecycleConditionsPanel({
  dossierId,
  conditions,
  defaultCurrency,
  submitted,
}: {
  dossierId: string
  conditions: SubmissionConditionsState
  /** Devise du barème pays (profil réglementaire) — préremplit le champ des frais. */
  defaultCurrency: string
  /** Soumission confirmée → le panneau se replie en récap d'une ligne (dépliable). */
  submitted: boolean
}) {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const { user } = useAuth()
  const { memberships } = useCurrentOrg()
  const canManage = canManageSubmission(memberships.find((m) => m.orgId === orgId)?.role)

  // Accordéon : ouvre par défaut la 1re condition actionnable non remplie (contexte immédiat).
  const [open, setOpen] = useState<SubmissionConditionId | null>(() => {
    if (submitted) return null
    return (
      conditions.conditions.find(
        (c) => c.status !== 'done' && c.nextType !== null && CONDITION_STEP_ACTIONS[c.nextType],
      )?.id ?? null
    )
  })
  // Post-soumission : récap 1 ligne, dépliable à la demande (les confirmations tardives restent saisissables).
  const [expandedAfterSubmit, setExpandedAfterSubmit] = useState(false)

  // ── Modale de sous-étape ────────────────────────────────────────────────────────────────────────
  const [active, setActive] = useState<ConditionStepAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [awb, setAwb] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [reference, setReference] = useState('')
  const [occurredOn, setOccurredOn] = useState('')
  const [file, setFile] = useState<File | null>(null)

  function openStep(action: ConditionStepAction) {
    setNote('')
    setAwb('')
    setReference('')
    setOccurredOn('')
    setFile(null)
    setCurrency(defaultCurrency)
    // Preuve de paiement : préremplit le montant notifié (dernier `fees_invoiced`).
    const fees = conditions.conditions.find((c) => c.id === 'fees')
    setAmount(action.form === 'payment' && fees?.amount ? String(fees.amount.value) : '')
    if (action.form === 'payment' && fees?.amount?.currency) setCurrency(fees.amount.currency)
    setActive(action)
  }

  function buildPayload(action: ConditionStepAction): Record<string, unknown> {
    const p: Record<string, unknown> = {}
    const put = (key: string, value: string) => {
      const v = value.trim()
      if (v) p[key] = v
    }
    switch (action.form) {
      case 'note':
        put('note', note)
        break
      case 'shipment':
        put('awb', awb)
        break
      case 'fees':
      case 'payment': {
        const n = Number(amount)
        if (amount.trim() !== '' && Number.isFinite(n) && n >= 0) {
          p.amount = n
          put('currency', currency)
        }
        put('reference', reference)
        break
      }
    }
    return p
  }

  async function confirm() {
    if (!active || busy) return
    setBusy(true)
    let uploaded: LifecycleDocRef[] = []
    try {
      if (file) {
        if (!navigator.onLine) {
          toast.error(
            t({
              fr: 'Pièce impossible hors-ligne — retirez-la (l’événement se journalise sans pièce) ou repassez en ligne.',
              en: 'Attachment unavailable offline — remove it (the event can be logged without it) or go back online.',
            }),
          )
          return
        }
        uploaded = [await uploadLifecycleDoc(orgId, dossierId, file)]
      }
      await appendLifecycleEvent(orgId, {
        dossierId,
        type: active.type,
        actorId: user?.id ?? 'local',
        actorEmail: user?.email ?? '',
        occurredAt: toOccurredAt(occurredOn),
        payload: buildPayload(active),
        docRefs: uploaded,
      })
      void syncLifecycle(orgId)
      toast.success(t({ fr: 'Étape enregistrée.', en: 'Step recorded.' }))
      setActive(null)
    } catch (error) {
      // Append échoué après upload → on retire la pièce orpheline (best-effort).
      if (uploaded.length > 0) void removeLifecycleDocs(uploaded)
      reportError(error, { op: 'appendLifecycleEvent', type: active.type })
      const message = error instanceof Error ? error.message : ''
      toast.error(message || t({ fr: 'Échec de l’enregistrement.', en: 'Failed to record.' }))
    } finally {
      setBusy(false)
    }
  }

  async function openDoc(doc: LifecycleDocRef) {
    const ok = await openLifecycleDoc(doc)
    if (!ok) {
      toast.error(
        t({ fr: 'Pièce indisponible (hors-ligne ?).', en: 'Attachment unavailable (offline?).' }),
      )
    }
  }

  const doneLabel = t({
    fr: `Conditions de soumission · ${conditions.done} / ${conditions.total}`,
    en: `Submission conditions · ${conditions.done} / ${conditions.total}`,
  })

  // ── Récap replié post-soumission (anti-page-longue) ───────────────────────────────────────────
  if (submitted && !expandedAfterSubmit) {
    const complete = conditions.done === conditions.total
    return (
      <section>
        <button
          type="button"
          onClick={() => setExpandedAfterSubmit(true)}
          aria-expanded={false}
          className="bg-card hover:bg-accent/50 flex w-full items-center gap-3 rounded-xl border p-4 text-left sm:p-5"
        >
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl',
              complete ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning',
            )}
          >
            {complete ? <Check className="size-5" /> : <Clock className="size-5" />}
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold">{doneLabel}</span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </button>
      </section>
    )
  }

  return (
    <section>
      <div className="bg-card rounded-xl border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="bg-info-subtle text-info flex size-9 shrink-0 items-center justify-center rounded-xl">
            <ListChecks className="size-5" />
          </span>
          <h3 className="min-w-0 flex-1 text-sm font-semibold">{doneLabel}</h3>
          {submitted ? (
            <button
              type="button"
              onClick={() => setExpandedAfterSubmit(false)}
              aria-label={t({ fr: 'Replier', en: 'Collapse' })}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="size-4" />
            </button>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1.5 text-xs">
          {t({
            fr: 'Suivies en parallèle du parcours — informatives, jamais bloquantes.',
            en: 'Tracked alongside the journey — informative, never blocking.',
          })}
        </p>

        <div className="mt-3 space-y-2">
          {conditions.conditions.map((c) => (
            <ConditionRow
              key={c.id}
              condition={c}
              open={open === c.id}
              onToggle={() => setOpen(open === c.id ? null : c.id)}
              canManage={canManage}
              onStep={openStep}
              onOpenDoc={openDoc}
              lang={lang}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* ── Modale de sous-étape ──────────────────────────────────────────────────────────────── */}
      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active ? t(active.label) : ''}</DialogTitle>
            <DialogDescription>{active ? t(active.prompt) : ''}</DialogDescription>
          </DialogHeader>

          {active ? (
            <div className="grid gap-4">
              {active.form === 'shipment' ? (
                <Field
                  label={t({ fr: 'N° LTA / AWB (facultatif)', en: 'Air waybill no. (optional)' })}
                  htmlFor="cd-awb"
                >
                  <Input
                    id="cd-awb"
                    value={awb}
                    onChange={(e) => setAwb(e.target.value)}
                    maxLength={60}
                    placeholder={t({ fr: 'ex. DHL-4523-8891', en: 'e.g. DHL-4523-8891' })}
                  />
                </Field>
              ) : null}

              {active.form === 'fees' || active.form === 'payment' ? (
                <>
                  <div className="grid grid-cols-[1fr_88px] gap-2">
                    <Field
                      label={t({ fr: 'Montant (facultatif)', en: 'Amount (optional)' })}
                      htmlFor="cd-amount"
                    >
                      <Input
                        id="cd-amount"
                        type="number"
                        min={0}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={t({ fr: 'ex. 850000', en: 'e.g. 850000' })}
                      />
                    </Field>
                    <Field label={t({ fr: 'Devise', en: 'Currency' })} htmlFor="cd-currency">
                      <Input
                        id="cd-currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        maxLength={8}
                      />
                    </Field>
                  </div>
                  <Field
                    label={
                      active.form === 'payment'
                        ? t({
                            fr: 'Référence du virement (facultatif)',
                            en: 'Transfer reference (optional)',
                          })
                        : t({ fr: 'Référence (facultatif)', en: 'Reference (optional)' })
                    }
                    htmlFor="cd-ref"
                  >
                    <Input
                      id="cd-ref"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      maxLength={120}
                      placeholder={
                        active.form === 'payment'
                          ? t({ fr: 'SWIFT / réf. banque…', en: 'SWIFT / bank ref.…' })
                          : t({ fr: 'N° de facture…', en: 'Invoice no.…' })
                      }
                    />
                  </Field>
                </>
              ) : null}

              {active.form === 'note' ? (
                <Field
                  label={t({ fr: 'Note (facultatif)', en: 'Note (optional)' })}
                  htmlFor="cd-note"
                >
                  <Input
                    id="cd-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                  />
                </Field>
              ) : null}

              <Field label={t(active.docLabel)} htmlFor="cd-file">
                <Input
                  id="cd-file"
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-muted-foreground text-xs">
                  {t({
                    fr: 'Stockée au dossier, consultable depuis le journal. Hors-ligne : journalisez sans pièce.',
                    en: 'Stored with the dossier, viewable from the journal. Offline: log without attachment.',
                  })}
                </p>
              </Field>

              <Field
                label={t({ fr: 'Date de l’événement (facultatif)', en: 'Event date (optional)' })}
                htmlFor="cd-date"
              >
                <Input
                  id="cd-date"
                  type="date"
                  value={occurredOn}
                  max={TODAY()}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setActive(null)} disabled={busy}>
              {t({ fr: 'Annuler', en: 'Cancel' })}
            </Button>
            <Button variant="primary" size="sm" onClick={confirm} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t({ fr: 'Journaliser', en: 'Log' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ── Ligne de condition (accordéon) ─────────────────────────────────────────────────────────────
type TFn = (v: { fr: string; en: string }) => string

function ConditionRow({
  condition,
  open,
  onToggle,
  canManage,
  onStep,
  onOpenDoc,
  lang,
  t,
}: {
  condition: SubmissionCondition
  open: boolean
  onToggle: () => void
  canManage: boolean
  onStep: (action: ConditionStepAction) => void
  onOpenDoc: (doc: LifecycleDocRef) => void
  lang: 'fr' | 'en'
  t: TFn
}) {
  const Icon = CONDITION_ICON[condition.id]
  const done = condition.status === 'done'
  const pill =
    condition.status === 'todo'
      ? t({ fr: 'À suivre', en: 'To do' })
      : t(
          CONDITION_STEP_LABELS[
            done
              ? (condition.steps[condition.steps.length - 1]?.type ?? 'deposited')
              : (condition.reachedType ?? 'deposited')
          ] ?? { fr: '—', en: '—' },
        )
  const docs = condition.steps.flatMap((s) => s.docs)
  const nextAction = condition.nextType ? CONDITION_STEP_ACTIONS[condition.nextType] : undefined
  const fees = condition.amount

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-accent/50 flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left"
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            done
              ? 'bg-success-subtle text-success'
              : condition.status === 'in_progress'
                ? 'bg-warning-subtle text-warning'
                : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {t(CONDITION_TITLES[condition.id])}
          {fees ? (
            <span className="text-muted-foreground font-normal">
              {' '}
              · {fees.value.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}
              {fees.currency ? ` ${fees.currency}` : ''}
            </span>
          ) : null}
        </span>
        <StatusBadge
          tone={done ? 'success' : condition.status === 'in_progress' ? 'warning' : 'neutral'}
        >
          {pill}
        </StatusBadge>
        {open ? (
          <ChevronUp className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        )}
      </button>

      {open ? (
        <div className="border-t px-3 pt-3 pb-3">
          {condition.id === 'ctd' ? (
            <p className="text-muted-foreground flex items-start gap-2 text-xs">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {t({
                fr: 'Condition dérivée automatiquement : elle passe au vert avec le jalon « Finalisation » — aucune saisie en plus.',
                en: 'Derived automatically: it turns green with the “Finalisation” milestone — nothing extra to enter.',
              })}
            </p>
          ) : (
            <ChainStepper
              condition={condition}
              canManage={canManage}
              onStep={onStep}
              lang={lang}
              t={t}
            />
          )}

          {(condition.id !== 'ctd' && canManage && nextAction) || docs.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {condition.id !== 'ctd' && canManage && nextAction ? (
                <Button size="sm" variant="primary" onClick={() => onStep(nextAction)}>
                  {t(nextAction.label)}
                </Button>
              ) : null}
              {docs.map((d) => (
                <button
                  key={d.path}
                  type="button"
                  onClick={() => onOpenDoc(d)}
                  title={d.name}
                  className="bg-muted text-muted-foreground hover:text-foreground flex max-w-44 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]"
                >
                  <Paperclip className="size-3 shrink-0" />
                  <span className="truncate">{d.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Mini-chaîne d'étapes. Saisie TOLÉRANTE (décision CEO) : chaque étape est cliquable pour un
 * gestionnaire — enregistrer une étape aval marque les amonts franchies ; ré-enregistrer une étape
 * déjà faite = correction (un nouvel événement, journal append-only).
 */
function ChainStepper({
  condition,
  canManage,
  onStep,
  lang,
  t,
}: {
  condition: SubmissionCondition
  canManage: boolean
  onStep: (action: ConditionStepAction) => void
  lang: 'fr' | 'en'
  t: TFn
}) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
    })
  return (
    <div className="flex items-start">
      {condition.steps.map((step, i) => {
        const action = CONDITION_STEP_ACTIONS[step.type]
        const clickable = canManage && action !== undefined
        const isNext = step.type === condition.nextType
        const dot = (
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-[11px]',
              step.done
                ? 'bg-success text-white'
                : isNext
                  ? 'bg-warning ring-warning-subtle text-white ring-4'
                  : 'bg-muted text-muted-foreground border-border border',
            )}
          >
            {step.done ? <Check className="size-3.5" /> : null}
          </span>
        )
        return (
          <div key={step.type} className="flex min-w-0 flex-1 items-start last:flex-none">
            <div className="flex min-w-16 flex-col items-center gap-1 text-center">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => action && onStep(action)}
                  aria-label={
                    action
                      ? t({
                          fr: `Journaliser « ${t(action.label)} »`,
                          en: `Log “${t(action.label)}”`,
                        })
                      : undefined
                  }
                  title={t({ fr: 'Journaliser cette étape', en: 'Log this step' })}
                  className="rounded-full"
                >
                  {dot}
                </button>
              ) : (
                dot
              )}
              <span
                className={cn(
                  'text-[10.5px] leading-tight font-semibold',
                  !step.done && !isNext && 'text-muted-foreground font-medium',
                )}
              >
                {t(CONDITION_STEP_LABELS[step.type] ?? { fr: '—', en: '—' })}
              </span>
              {step.at ? (
                <span className="text-muted-foreground text-[10px]">{fmt(step.at)}</span>
              ) : null}
            </div>
            {i < condition.steps.length - 1 ? (
              <div
                className={cn('mt-3 h-0.5 min-w-3 flex-1', step.done ? 'bg-success' : 'bg-border')}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
