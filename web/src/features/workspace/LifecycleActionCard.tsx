import { useState, type ReactNode } from 'react'
import { CheckCircle2, Info, Loader2, Lock, PlayCircle, XCircle } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-context'
import { useCurrentOrg } from '@/features/org/use-current-org'
import { useOrgId } from '@/features/org/org-context'
import { canManageSubmission } from '@/features/team/team-api'
import { useI18n } from '@/lib/i18n-context'
import { reportError } from '@/lib/sentry'
import {
  lifecycleConfigFor,
  submissionModeLabel,
  SUBMISSION_MODE_LABELS,
  type SubmissionMode,
} from './lifecycle-config'
import {
  LIFECYCLE_STAGES,
  type LifecycleStageId,
  type LifecycleStatus,
} from './lifecycle-constants'
import { nextLifecycleActions, type LifecycleAction } from './lifecycle-actions'
import { appendLifecycleEvent } from './lifecycle-repository'
import { syncLifecycle } from './lifecycle-sync'

const STAGE_LABEL = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s.id, s.label])) as Record<
  LifecycleStageId,
  (typeof LIFECYCLE_STAGES)[number]['label']
>

const TODAY = () => new Date().toISOString().slice(0, 10)

/** Convertit une date `YYYY-MM-DD` (facultative) en horodatage ISO à midi UTC (évite le décalage de jour). */
function toOccurredAt(day: string): string | undefined {
  if (!day) return undefined
  const ts = Date.parse(`${day}T12:00:00.000Z`)
  return Number.isNaN(ts) ? undefined : new Date(ts).toISOString()
}

/**
 * Carte « étape en cours » actionnable (jalon M2) — permet à un gestionnaire de soumission de FAIRE
 * AVANCER le dossier en journalisant un `lifecycle_event`. Gating UI = `canManageSubmission(role)` de
 * l'org courante (miroir de la RLS 0047 `current_user_submission_org_ids`) ; la RLS reste la vraie
 * barrière (le gating évite seulement d'afficher une action qui renverrait 42501). L'append
 * est offline-first (Dexie + outbox), puis poussé par `syncLifecycle`. L'étape courante se recalcule
 * seule (le parent lit Dexie en live) — rien n'est stocké.
 */
export function LifecycleActionCard({
  dossierId,
  country,
  currentStageId,
  status,
  hasAuthorityQuery = false,
}: {
  dossierId: string
  country: string
  currentStageId: LifecycleStageId
  status: LifecycleStatus
  /** Une notification (`authority_query`) a-t-elle déjà été journalisée ? (débloque « Réponse ».) */
  hasAuthorityQuery?: boolean
}) {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const { user } = useAuth()
  // Rôle « gestionnaire de soumission » lié à l'org COURANTE (miroir RLS 0047, comme CorrespondencePanel) ;
  // `loading` évite d'afficher le message « lecture seule » avant que les rôles soient chargés.
  const { loading: orgLoading, memberships } = useCurrentOrg()
  const canManage = canManageSubmission(memberships.find((m) => m.orgId === orgId)?.role)
  const config = lifecycleConfigFor(country)

  const actions = nextLifecycleActions(currentStageId, { hasAuthorityQuery })
  const [active, setActive] = useState<LifecycleAction | null>(null)
  const [busy, setBusy] = useState(false)
  // Champs de saisie (réinitialisés à l'ouverture d'une action).
  const [mode, setMode] = useState<SubmissionMode>(config.submissionMode)
  const [reference, setReference] = useState('')
  const [ammNumber, setAmmNumber] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [note, setNote] = useState('')
  const [occurredOn, setOccurredOn] = useState('')

  function openAction(a: LifecycleAction) {
    setMode(config.submissionMode)
    setReference('')
    setAmmNumber('')
    setValidUntil('')
    setNote('')
    setOccurredOn('')
    setActive(a)
  }

  const missingRequired = active?.form === 'amm_granted' && ammNumber.trim() === ''

  function buildPayload(a: LifecycleAction): Record<string, unknown> {
    switch (a.form) {
      case 'submit': {
        const p: Record<string, unknown> = { mode }
        const ref = reference.trim()
        if (ref) p.reference = ref
        return p
      }
      case 'amm_granted': {
        const p: Record<string, unknown> = { amm_number: ammNumber.trim() }
        // Normalisé ISO à midi UTC (comme occurred_at) : un consommateur en fuseau ≠ UTC ne décale
        // pas la date d'expiration d'un jour (`new Date("2027-06-30")` = minuit UTC = veille en UTC−X).
        const vu = toOccurredAt(validUntil)
        if (vu) p.valid_until = vu
        return p
      }
      case 'amm_refused': {
        const reason = note.trim()
        return reason ? { reason } : {}
      }
      case 'note': {
        const n = note.trim()
        return n ? { note: n } : {}
      }
      default:
        return {}
    }
  }

  async function confirm() {
    if (!active || busy || missingRequired) return
    setBusy(true)
    try {
      await appendLifecycleEvent(orgId, {
        dossierId,
        type: active.type,
        actorId: user?.id ?? 'local',
        actorEmail: user?.email ?? '',
        occurredAt: toOccurredAt(occurredOn),
        payload: buildPayload(active),
      })
      // Push best-effort (no-op hors-ligne : l'outbox rejouera à la reconnexion).
      void syncLifecycle(orgId)
      toast.success(t({ fr: 'Étape enregistrée.', en: 'Milestone recorded.' }))
      setActive(null)
    } catch (error) {
      reportError(error, { op: 'appendLifecycleEvent', type: active.type })
      toast.error(t({ fr: 'Échec de l’enregistrement.', en: 'Failed to record.' }))
    } finally {
      setBusy(false)
    }
  }

  const stageLabel = t(STAGE_LABEL[currentStageId])

  // ── Terminal (AMM rendue) : parcours clôturé, aucune action ──────────────────────────────────────
  if (status === 'amm_granted' || status === 'amm_refused') {
    const granted = status === 'amm_granted'
    return (
      <ActionShell
        tone={granted ? 'success' : 'danger'}
        icon={granted ? CheckCircle2 : XCircle}
        title={t({ fr: 'Parcours terminé', en: 'Journey complete' })}
        body={
          granted
            ? t({
                fr: 'AMM accordée — le dossier est clôturé.',
                en: 'MA granted — the dossier is closed.',
              })
            : t({
                fr: 'AMM refusée — le dossier est clôturé.',
                en: 'MA refused — the dossier is closed.',
              })
        }
      />
    )
  }

  // ── Étapes amont (correspondance) : pas d'action journal, on renvoie au bon endroit ─────────────
  if (actions.length === 0) {
    return (
      <ActionShell
        tone="info"
        icon={Info}
        title={t({ fr: `Étape en cours · ${stageLabel}`, en: `Current stage · ${stageLabel}` })}
        body={upstreamHint(currentStageId, status, t)}
      />
    )
  }

  // ── Lecture seule (pas gestionnaire de soumission) — tant que les rôles chargent, on n'affiche
  //    PAS le message trompeur : un gestionnaire verrait « lecture seule » clignoter avant ses boutons.
  if (!canManage) {
    if (orgLoading) {
      return (
        <ActionShell
          tone="info"
          icon={Info}
          title={t({ fr: `Étape en cours · ${stageLabel}`, en: `Current stage · ${stageLabel}` })}
          body={t({ fr: 'Chargement…', en: 'Loading…' })}
        />
      )
    }
    return (
      <ActionShell
        tone="info"
        icon={Lock}
        title={t({ fr: `Étape en cours · ${stageLabel}`, en: `Current stage · ${stageLabel}` })}
        body={t({
          fr: 'Seul un gestionnaire de soumission (Admin, agence ou expert RA) peut faire avancer le dossier.',
          en: 'Only a submission manager (Admin, agency or RA expert) can advance the dossier.',
        })}
      />
    )
  }

  return (
    <section>
      <div className="bg-card rounded-xl border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="bg-warning-subtle text-warning flex size-9 shrink-0 items-center justify-center rounded-xl">
            <PlayCircle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">
              {t({ fr: `Étape en cours · ${stageLabel}`, en: `Current stage · ${stageLabel}` })}
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {stageDescription(currentStageId, config.submissionMode, lang, t)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a.id} size="sm" variant={a.variant} onClick={() => openAction(a)}>
                  {t(a.label)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active ? t(active.label) : ''}</DialogTitle>
            <DialogDescription>{active ? t(active.prompt) : ''}</DialogDescription>
          </DialogHeader>

          {active ? (
            <div className="grid gap-4">
              {active.form === 'submit' ? (
                <>
                  <Field
                    label={t({ fr: 'Mode de soumission', en: 'Submission mode' })}
                    htmlFor="lc-mode"
                  >
                    <Select value={mode} onValueChange={(v) => setMode(v as SubmissionMode)}>
                      <SelectTrigger id="lc-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SUBMISSION_MODE_LABELS) as SubmissionMode[]).map((m) => (
                          <SelectItem key={m} value={m}>
                            {submissionModeLabel(m, lang)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label={t({
                      fr: 'Référence / récépissé (facultatif)',
                      en: 'Reference / receipt (optional)',
                    })}
                    htmlFor="lc-ref"
                  >
                    <Input
                      id="lc-ref"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      maxLength={120}
                      placeholder={t({ fr: 'N° de dépôt…', en: 'Filing no.…' })}
                    />
                  </Field>
                </>
              ) : null}

              {active.form === 'amm_granted' ? (
                <>
                  <Field label={t({ fr: 'Numéro d’AMM', en: 'MA number' })} htmlFor="lc-amm">
                    <Input
                      id="lc-amm"
                      value={ammNumber}
                      onChange={(e) => setAmmNumber(e.target.value)}
                      maxLength={80}
                      required
                      placeholder={t({ fr: 'ex. AMM-2026-0123', en: 'e.g. MA-2026-0123' })}
                    />
                  </Field>
                  <Field
                    label={t({ fr: 'Valide jusqu’au (facultatif)', en: 'Valid until (optional)' })}
                    htmlFor="lc-valid"
                  >
                    <Input
                      id="lc-valid"
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                    />
                  </Field>
                </>
              ) : null}

              {active.form === 'amm_refused' ? (
                <Field
                  label={t({ fr: 'Motif (facultatif)', en: 'Reason (optional)' })}
                  htmlFor="lc-reason"
                >
                  <Input
                    id="lc-reason"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                  />
                </Field>
              ) : null}

              {active.form === 'note' ? (
                <Field
                  label={t({ fr: 'Note (facultatif)', en: 'Note (optional)' })}
                  htmlFor="lc-note"
                >
                  <Input
                    id="lc-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                  />
                </Field>
              ) : null}

              {active.form !== 'confirm' ? (
                <Field
                  label={t({ fr: 'Date de l’événement (facultatif)', en: 'Event date (optional)' })}
                  htmlFor="lc-date"
                >
                  <Input
                    id="lc-date"
                    type="date"
                    value={occurredOn}
                    max={TODAY()}
                    onChange={(e) => setOccurredOn(e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setActive(null)} disabled={busy}>
              {t({ fr: 'Annuler', en: 'Cancel' })}
            </Button>
            <Button
              variant={active?.variant === 'destructive' ? 'destructive' : 'primary'}
              size="sm"
              onClick={confirm}
              disabled={busy || missingRequired}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t({ fr: 'Confirmer', en: 'Confirm' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ── Sous-composants de présentation ────────────────────────────────────────────────────────────────
const SHELL_TONE: Record<'info' | 'success' | 'danger', string> = {
  info: 'bg-info-subtle text-info',
  success: 'bg-success-subtle text-success',
  danger: 'bg-danger-subtle text-danger',
}

function ActionShell({
  tone,
  icon: Icon,
  title,
  body,
}: {
  tone: 'info' | 'success' | 'danger'
  icon: typeof Info
  title: string
  body: string
}) {
  return (
    <section>
      <div className="bg-card rounded-xl border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${SHELL_TONE[tone]}`}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">{body}</p>
          </div>
        </div>
      </div>
    </section>
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

// ── Copies contextuelles ─────────────────────────────────────────────────────────────────────────
type TFn = (v: { fr: string; en: string }) => string

function stageDescription(
  stage: LifecycleStageId,
  mode: SubmissionMode,
  lang: 'fr' | 'en',
  t: TFn,
): string {
  switch (stage) {
    case 'depot':
      return t({
        fr: 'Le dossier est accepté. Transmettez-le à l’agence nationale pour dépôt.',
        en: 'The dossier is accepted. Forward it to the national agency for filing.',
      })
    case 'soumission':
      return t({
        fr: `Dossier déposé. Enregistrez la soumission à l’autorité (mode : ${submissionModeLabel(mode, lang)}).`,
        en: `Dossier deposited. Record the submission to the authority (mode: ${submissionModeLabel(mode, lang)}).`,
      })
    case 'notifications':
      return t({
        fr: 'Dossier soumis. Journalisez les échanges avec l’agence, puis la décision d’AMM.',
        en: 'Dossier submitted. Log exchanges with the agency, then the MA decision.',
      })
    default:
      return ''
  }
}

function upstreamHint(stage: LifecycleStageId, status: LifecycleStatus, t: TFn): string {
  if (stage === 'decision' && (status === 'suspended' || status === 'rejected')) {
    return t({
      fr: 'L’agent local a rendu une décision. Répondez et renvoyez le dossier depuis la correspondance.',
      en: 'The local agent issued a decision. Respond and resubmit from the correspondence panel.',
    })
  }
  if (stage === 'revue') {
    return t({
      fr: 'Le dossier est en revue chez l’agent local. La décision arrivera par la correspondance.',
      en: 'The dossier is under review by the local agent. The decision will arrive via correspondence.',
    })
  }
  return t({
    fr: 'Terminez le montage dans l’espace de travail, puis envoyez le dossier en revue.',
    en: 'Finish assembly in the workspace, then send the dossier for review.',
  })
}
