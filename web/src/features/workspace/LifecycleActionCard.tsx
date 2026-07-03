import { useState, type ReactNode } from 'react'
import {
  BellRing,
  CheckCircle2,
  CircleAlert,
  Clock,
  Info,
  Loader2,
  Lock,
  PlayCircle,
  RotateCcw,
  XCircle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-context'
import { reopenCorrespondenceForReview } from '@/features/correspondence/correspondence-repository'
import { syncCorrespondences } from '@/features/correspondence/correspondence-sync'
import { useCurrentOrg } from '@/features/org/use-current-org'
import { useOrgId } from '@/features/org/org-context'
import { canManageSubmission } from '@/features/team/team-api'
import type { CorrespondenceRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { reportError } from '@/lib/sentry'
import { cn } from '@/lib/utils'
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
import { nextLifecycleActions, REMINDER_ACTION, type LifecycleAction } from './lifecycle-actions'
import type { StageWaiting } from './lifecycle-waiting'
import { CONDITION_TITLES, type SubmissionConditionsState } from './lifecycle-conditions'
import { removeLifecycleDocs, uploadLifecycleDoc, type LifecycleDocRef } from './lifecycle-docs'
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
  conditions,
  decidedCorrespondence = null,
  waiting = null,
}: {
  dossierId: string
  country: string
  currentStageId: LifecycleStageId
  status: LifecycleStatus
  /** Une notification (`authority_query`) a-t-elle déjà été journalisée ? (débloque « Réponse ».) */
  hasAuthorityQuery?: boolean
  /** État des 3 conditions (M3) — récap NON BLOQUANT dans la modale « Marquer comme soumis ». */
  conditions?: SubmissionConditionsState
  /** Correspondance DÉCIDÉE (Complément requis / Rejeté) — cible du « Renvoyer en revue » (M4). */
  decidedCorrespondence?: CorrespondenceRecord | null
  /** Ancienneté de l'attente d'un TIERS (M5, `deriveStageWaiting`) — badge + bouton Relancer. */
  waiting?: StageWaiting | null
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
  // T4 : preuve d'AMM (pièce recommandée, jamais obligatoire — pattern M3, upload en ligne only).
  const [proofFile, setProofFile] = useState<File | null>(null)
  // T4 : canal de la notification (cas CI : l'agence notifie le labo EN DIRECT, sans agent local).
  const [via, setVia] = useState<'agent' | 'direct'>('agent')
  // Boucle Décision (M4) : modale de confirmation du « Renvoyer en revue ».
  const [reopenOpen, setReopenOpen] = useState(false)

  function openAction(a: LifecycleAction) {
    setMode(config.submissionMode)
    setReference('')
    setAmmNumber('')
    setValidUntil('')
    setNote('')
    setOccurredOn('')
    setProofFile(null)
    setVia('agent')
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
        const p: Record<string, unknown> = {}
        const n = note.trim()
        if (n) p.note = n
        // Canal de la notification (T4) : `via` sur authority_query uniquement (cas CI = direct).
        if (a.id === 'authority_query') p.via = via
        return p
      }
      default:
        return {}
    }
  }

  async function confirm() {
    if (!active || busy || missingRequired) return
    setBusy(true)
    let uploaded: LifecycleDocRef[] = []
    try {
      // Preuve d'AMM (T4, pattern M3) : upload EN LIGNE seulement — hors-ligne, on invite à
      // retirer la pièce (l'événement se journalise sans pièce, offline-first préservé).
      if (active.form === 'amm_granted' && proofFile) {
        if (!navigator.onLine) {
          toast.error(
            t({
              fr: 'Pièce impossible hors-ligne — retirez-la (l’AMM se journalise sans pièce) ou repassez en ligne.',
              en: 'Attachment unavailable offline — remove it (the MA can be logged without it) or go back online.',
            }),
          )
          return
        }
        uploaded = [await uploadLifecycleDoc(orgId, dossierId, proofFile)]
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
      // Push best-effort (no-op hors-ligne : l'outbox rejouera à la reconnexion).
      void syncLifecycle(orgId)
      toast.success(t({ fr: 'Étape enregistrée.', en: 'Milestone recorded.' }))
      setActive(null)
    } catch (error) {
      // Append échoué après upload → on retire la pièce orpheline (best-effort, pattern M3).
      if (uploaded.length > 0) void removeLifecycleDocs(uploaded)
      reportError(error, { op: 'appendLifecycleEvent', type: active.type })
      const message = error instanceof Error ? error.message : ''
      toast.error(message || t({ fr: 'Échec de l’enregistrement.', en: 'Failed to record.' }))
    } finally {
      setBusy(false)
    }
  }

  // Boucle Décision (M4) : rouvre la revue (status → in_review, lien ré-armé, fil intact) —
  // offline-first (Dexie + outbox), la dérivation ramène le dossier à l'étape Revue toute seule.
  async function confirmReopen() {
    if (busy || !decidedCorrespondence) return
    setBusy(true)
    try {
      await reopenCorrespondenceForReview(decidedCorrespondence.id, user?.email ?? '')
      void syncCorrespondences(orgId)
      toast.success(t({ fr: 'Dossier renvoyé en revue.', en: 'Dossier sent back for review.' }))
      setReopenOpen(false)
    } catch (error) {
      reportError(error, { op: 'reopenCorrespondenceForReview' })
      toast.error(t({ fr: 'Échec du renvoi en revue.', en: 'Failed to send back for review.' }))
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

  // ── Boucle Décision (M4) : Complément requis / Rejeté → « Renvoyer en revue » (gestionnaires) ───
  if (
    currentStageId === 'decision' &&
    (status === 'suspended' || status === 'rejected') &&
    decidedCorrespondence &&
    canManage
  ) {
    return (
      <>
        <ActionShell
          tone={status === 'rejected' ? 'danger' : 'info'}
          icon={RotateCcw}
          title={t({ fr: 'Étape en cours · Décision', en: 'Current stage · Decision' })}
          body={
            status === 'suspended'
              ? t({
                  fr: 'L’agent local demande un complément. Répondez dans la correspondance, puis renvoyez le dossier en revue.',
                  en: 'The local agent requests additional info. Respond in the correspondence, then send the dossier back for review.',
                })
              : t({
                  fr: 'L’agent local a rejeté le dossier. Après correction, vous pouvez le renvoyer en revue.',
                  en: 'The local agent rejected the dossier. Once corrected, you can send it back for review.',
                })
          }
        >
          <Button size="sm" variant="primary" onClick={() => setReopenOpen(true)}>
            <RotateCcw /> {t({ fr: 'Renvoyer en revue', en: 'Send back for review' })}
          </Button>
        </ActionShell>

        <Dialog open={reopenOpen} onOpenChange={(o) => !o && setReopenOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t({ fr: 'Renvoyer en revue', en: 'Send back for review' })}
              </DialogTitle>
              <DialogDescription>
                {t({
                  fr: 'Le dossier repart en revue chez l’agent local : le même lien de revue est réactivé et la décision précédente reste tracée dans le fil de la correspondance.',
                  en: 'The dossier goes back for review with the local agent: the same review link is re-armed and the previous decision stays traced in the correspondence thread.',
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={busy}>
                {t({ fr: 'Annuler', en: 'Cancel' })}
              </Button>
              <Button variant="primary" onClick={() => void confirmReopen()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {t({ fr: 'Confirmer', en: 'Confirm' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // ── Étapes amont (correspondance) : pas d'action journal, on renvoie au bon endroit.
  //    En revue, le dossier attend l'agent local → badge d'attente + Relancer (M5).
  if (actions.length === 0) {
    return (
      <ActionShell
        tone="info"
        icon={Info}
        title={t({ fr: `Étape en cours · ${stageLabel}`, en: `Current stage · ${stageLabel}` })}
        body={upstreamHint(currentStageId, status, t)}
      >
        {waiting ? (
          <ReminderControl
            orgId={orgId}
            dossierId={dossierId}
            currentStageId={currentStageId}
            waiting={waiting}
            canManage={canManage}
            actorId={user?.id ?? 'local'}
            actorEmail={user?.email ?? ''}
          />
        ) : null}
      </ActionShell>
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
      >
        {waiting ? (
          <ReminderControl
            orgId={orgId}
            dossierId={dossierId}
            currentStageId={currentStageId}
            waiting={waiting}
            canManage={false}
            actorId={user?.id ?? 'local'}
            actorEmail={user?.email ?? ''}
          />
        ) : null}
      </ActionShell>
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
            {waiting ? (
              <div className="mt-3">
                <ReminderControl
                  orgId={orgId}
                  dossierId={dossierId}
                  currentStageId={currentStageId}
                  waiting={waiting}
                  canManage={canManage}
                  actorId={user?.id ?? 'local'}
                  actorEmail={user?.email ?? ''}
                />
              </div>
            ) : null}
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
              {active.form === 'submit' && conditions ? (
                <ConditionsRecap conditions={conditions} t={t} />
              ) : null}
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
                      min={occurredOn || TODAY()}
                      onChange={(e) => setValidUntil(e.target.value)}
                    />
                  </Field>
                  <Field
                    label={t({
                      fr: 'Preuve d’AMM (facultatif — certificat, notification officielle)',
                      en: 'MA proof (optional — certificate, official notification)',
                    })}
                    htmlFor="lc-proof"
                  >
                    <Input
                      id="lc-proof"
                      type="file"
                      onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
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
                <>
                  {active.id === 'authority_query' ? (
                    <Field
                      label={t({ fr: 'Notification reçue', en: 'Notification received' })}
                      htmlFor="lc-via"
                    >
                      <Select value={via} onValueChange={(v) => setVia(v as 'agent' | 'direct')}>
                        <SelectTrigger id="lc-via" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agent">
                            {t({ fr: 'Via l’agent local', en: 'Via the local agent' })}
                          </SelectItem>
                          <SelectItem value="direct">
                            {t({
                              fr: 'En direct de l’agence (ex. Côte d’Ivoire)',
                              en: 'Directly from the agency (e.g. Côte d’Ivoire)',
                            })}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
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
                </>
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
  children,
}: {
  tone: 'info' | 'success' | 'danger'
  icon: typeof Info
  title: string
  body: string
  /** Zone d'action facultative (boutons) sous le descriptif. */
  children?: ReactNode
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
            {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
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

/** Seuil VISUEL (jours) au-delà duquel l'attente passe en ton « warning » — purement indicatif
 *  (aucun blocage) ; les seuils RÉELS par pays arrivent avec la relance auto (LOT 10). */
const WAITING_WARN_DAYS = 7

/**
 * Badge « en attente depuis N jours » + bouton Relancer (M5, relance MANUELLE). Autonome
 * (badge + dialog + append) pour s'insérer dans chaque branche de la carte, y compris les
 * coquilles amont (Revue). La relance journalise un `reminder_sent` `{stage, waiting_days}` :
 * le canal réel (téléphone/e-mail) reste hors produit en phase 1 — Pharnos trace l'acte et le
 * compteur repart (la relance est la nouvelle dernière activité du journal).
 */
function ReminderControl({
  orgId,
  dossierId,
  currentStageId,
  waiting,
  canManage,
  actorId,
  actorEmail,
}: {
  orgId: string
  dossierId: string
  currentStageId: LifecycleStageId
  waiting: StageWaiting
  canManage: boolean
  actorId: string
  actorEmail: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // « → Agence nat. » (étiquette d'étape) se lit mal en phrase — on retire la flèche.
  const actor = t(waiting.actor).replace(/^→\s*/, '')
  const overdue = waiting.days >= WAITING_WARN_DAYS && !waiting.lastIsReminder
  const label = waiting.lastIsReminder
    ? waiting.days === 0
      ? t({ fr: 'Relancé aujourd’hui', en: 'Reminded today' })
      : t({ fr: `Relancé il y a ${waiting.days} j`, en: `Reminded ${waiting.days} d ago` })
    : waiting.days === 0
      ? t({ fr: `En attente de ${actor} · aujourd’hui`, en: `Waiting on ${actor} · today` })
      : t({
          fr: `En attente de ${actor} depuis ${waiting.days} j`,
          en: `Waiting on ${actor} for ${waiting.days} d`,
        })

  async function confirmReminder() {
    if (busy) return
    setBusy(true)
    try {
      await appendLifecycleEvent(orgId, {
        dossierId,
        type: REMINDER_ACTION.type,
        actorId,
        actorEmail,
        payload: { stage: currentStageId, waiting_days: waiting.days },
      })
      // Push best-effort (no-op hors-ligne : l'outbox rejouera à la reconnexion).
      void syncLifecycle(orgId)
      toast.success(t({ fr: 'Relance journalisée.', en: 'Reminder logged.' }))
      setOpen(false)
    } catch (error) {
      reportError(error, { op: 'appendLifecycleEvent', type: REMINDER_ACTION.type })
      toast.error(t({ fr: 'Échec de la relance.', en: 'Failed to log the reminder.' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
          overdue ? 'bg-warning-subtle text-warning' : 'bg-muted text-muted-foreground',
        )}
      >
        <Clock className="size-3.5 shrink-0" />
        {label}
      </span>
      {canManage ? (
        <>
          <Button size="sm" variant={REMINDER_ACTION.variant} onClick={() => setOpen(true)}>
            <BellRing /> {t(REMINDER_ACTION.label)}
          </Button>
          <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t(REMINDER_ACTION.label)}</DialogTitle>
                <DialogDescription>{t(REMINDER_ACTION.prompt)}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                  {t({ fr: 'Annuler', en: 'Cancel' })}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void confirmReminder()}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {t({ fr: 'Confirmer', en: 'Confirm' })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  )
}

/**
 * Récap des 3 conditions dans la modale « Marquer comme soumis » (M3) — INFORMATIF, JAMAIS BLOQUANT
 * (décision CEO) : le journal garde la trace de l'ordre réel des faits, on n'empêche pas de confirmer.
 */
function ConditionsRecap({
  conditions,
  t,
}: {
  conditions: SubmissionConditionsState
  t: (v: { fr: string; en: string }) => string
}) {
  const pending = conditions.total - conditions.done
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {t({
          fr: `Conditions de soumission — ${conditions.done} / ${conditions.total}`,
          en: `Submission conditions — ${conditions.done} / ${conditions.total}`,
        })}
      </p>
      <div className="mt-2 space-y-1.5">
        {conditions.conditions.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-xs">
            {c.status === 'done' ? (
              <CheckCircle2 className="text-success size-3.5 shrink-0" />
            ) : (
              <Clock className="text-warning size-3.5 shrink-0" />
            )}
            {t(CONDITION_TITLES[c.id])}
          </div>
        ))}
      </div>
      {pending > 0 ? (
        <p className="text-warning mt-2.5 flex items-start gap-1.5 text-xs">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t({
            fr: `${pending} condition(s) non confirmée(s). Vous pouvez tout de même confirmer — le journal gardera la trace de l'ordre réel des faits.`,
            en: `${pending} condition(s) not confirmed. You can still confirm — the journal keeps the real order of events.`,
          })}
        </p>
      ) : null}
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
        fr: 'Le dossier est accepté. Confirmez sa réception par l’agent local.',
        en: 'The dossier is accepted. Confirm the local agent received it.',
      })
    case 'soumission':
      return t({
        fr: `Dossier reçu par l’agent. Enregistrez le dépôt à l’agence nationale (mode : ${submissionModeLabel(mode, lang)}).`,
        en: `Dossier received by the agent. Record the filing with the national agency (mode: ${submissionModeLabel(mode, lang)}).`,
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
