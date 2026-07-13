import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, Building2, FlaskConical, Info, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/ui/page'
import { Section } from '@/components/ui/section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { statusLabel } from '@/features/correspondence/correspondence-constants'
import {
  listCorrespondences,
  updateCorrespondenceRecipient,
} from '@/features/correspondence/correspondence-repository'
import { officialLang } from '@/features/correspondence/recipient-lang'
import { syncCorrespondences } from '@/features/correspondence/correspondence-sync'
import { getActiveOrgId } from '@/features/org/active-org'
import { useCurrentOrg } from '@/features/org/use-current-org'
import { canManageSubmission } from '@/features/team/team-api'
import { countryLabel } from '@/features/workspace/dossier-constants'
import type { CorrespondenceRecord } from '@/lib/db'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import {
  DEFAULT_LEAD_DAYS,
  MONITORING_LEAD_FLOOR,
  MONITORING_LEAD_MAX,
  MONITORING_PIECE_TYPES,
  REMINDER_DAYS_MAX,
  REMINDER_DAYS_MIN,
  REMINDER_DEFAULTS,
  saveReminderSettings,
  useReminderSettings,
  type LeadDaysMap,
  type MonitoringPieceType,
  type ReminderSettings,
} from './reminder-settings'

/** Libellés courts des pièces à préavis (domaine B). */
const PIECE_LABEL: Record<MonitoringPieceType, Translatable> = {
  gmp: { fr: 'GMP — Bonnes pratiques de fabrication', en: 'GMP — Good Manufacturing Practice' },
  copp: {
    fr: 'COPP — Certificat de produit pharmaceutique',
    en: 'CPP — Certificate of Pharma Product',
  },
  fsc: { fr: 'FSC — Free Sale Certificate', en: 'FSC — Free Sale Certificate' },
  ml: { fr: "ML — Licence d'établissement", en: 'ML — Establishment Licence' },
  amm: { fr: 'AMM — Autorisation de mise sur le marché', en: 'MA — Marketing Authorization' },
  coa: { fr: "COA — Certificat d'analyse", en: 'CoA — Certificate of Analysis' },
}

export function RemindersPage() {
  const { t } = useI18n()
  const { data, isLoading, refetch } = useReminderSettings()

  return (
    <Page>
      <header className="bg-card rounded-xl border p-5">
        <div className="flex items-center gap-4">
          <span className="bg-info-subtle text-info flex size-12 shrink-0 items-center justify-center rounded-xl">
            <Bell className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-display truncate text-xl font-bold tracking-tight">
              {t({ fr: 'Relances', en: 'Reminders' })}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t({
                fr: 'Règle tes rappels automatiques et manuels pour les deux flux.',
                en: 'Set your automatic and manual reminders for both flows.',
              })}
            </p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : !data ? (
        <ErrorState
          title={t({ fr: 'Configuration indisponible', en: 'Settings unavailable' })}
          reason={t({
            fr: 'Vous êtes hors ligne ou le serveur est injoignable. Les valeurs par défaut restent appliquées.',
            en: 'You are offline or the server is unreachable. Defaults still apply.',
          })}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              {t({ fr: 'Réessayer', en: 'Retry' })}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <RemindersForm initial={data} />
          <RecipientsSection />
        </div>
      )}
    </Page>
  )
}

/* ----------------------------- Formulaire (brouillon en chaînes) ----------------------------- */

interface Draft {
  roadmap_auto_enabled: boolean
  roadmap_agent_days: string
  roadmap_agency_days: string
  roadmap_email_enabled: boolean
  monitoring_auto_enabled: boolean
  lead: Record<MonitoringPieceType, string>
}

const clampNum = (raw: string, min: number, max: number, fallback: number): number => {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function toDraft(s: ReminderSettings): Draft {
  const lead = {} as Record<MonitoringPieceType, string>
  for (const k of MONITORING_PIECE_TYPES) {
    lead[k] = String(s.monitoring_lead_days[k] ?? DEFAULT_LEAD_DAYS[k])
  }
  return {
    roadmap_auto_enabled: s.roadmap_auto_enabled,
    roadmap_agent_days: String(s.roadmap_agent_days),
    roadmap_agency_days: String(s.roadmap_agency_days),
    roadmap_email_enabled: s.roadmap_email_enabled,
    monitoring_auto_enabled: s.monitoring_auto_enabled,
    lead,
  }
}

function toSettings(d: Draft): ReminderSettings {
  const lead: LeadDaysMap = {}
  for (const k of MONITORING_PIECE_TYPES) {
    lead[k] = clampNum(d.lead[k], MONITORING_LEAD_FLOOR, MONITORING_LEAD_MAX, DEFAULT_LEAD_DAYS[k])
  }
  return {
    roadmap_auto_enabled: d.roadmap_auto_enabled,
    roadmap_agent_days: clampNum(
      d.roadmap_agent_days,
      REMINDER_DAYS_MIN,
      REMINDER_DAYS_MAX,
      REMINDER_DEFAULTS.roadmap_agent_days,
    ),
    roadmap_agency_days: clampNum(
      d.roadmap_agency_days,
      REMINDER_DAYS_MIN,
      REMINDER_DAYS_MAX,
      REMINDER_DEFAULTS.roadmap_agency_days,
    ),
    roadmap_email_enabled: d.roadmap_email_enabled,
    monitoring_auto_enabled: d.monitoring_auto_enabled,
    monitoring_lead_days: lead,
  }
}

function RemindersForm({ initial }: { initial: ReminderSettings }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [saved, setSaved] = useState<ReminderSettings>(initial)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(toSettings(draft)) !== JSON.stringify(saved)

  async function save() {
    const next = toSettings(draft)
    setSaving(true)
    try {
      await saveReminderSettings(next)
      setSaved(next)
      setDraft(toDraft(next)) // reflète les valeurs bornées (ex. préavis remonté au plancher 90 j)
      await qc.invalidateQueries({ queryKey: ['reminder-settings'] })
      toast.success(t({ fr: 'Réglages enregistrés', en: 'Settings saved' }))
    } catch (e) {
      const msg = (e as Error).message
      toast.error(
        msg === 'forbidden'
          ? t({ fr: 'Réservé aux administrateurs', en: 'Admins only' })
          : msg === 'offline'
            ? t({ fr: 'Indisponible hors-ligne', en: 'Unavailable offline' })
            : t({ fr: 'Échec de l’enregistrement', en: 'Save failed' }),
      )
    } finally {
      setSaving(false)
    }
  }

  const setLead = (k: MonitoringPieceType, v: string) =>
    setDraft((d) => ({ ...d, lead: { ...d.lead, [k]: v } }))

  return (
    <div className="space-y-6">
      {/* ── Domaine A — Roadmap (dossiers · MAH ↔ agence) ── */}
      <Section
        title={
          <span className="flex items-center gap-2">
            <FlaskConical className="text-info size-4 shrink-0" aria-hidden />
            {t({ fr: 'Roadmap · dossiers', en: 'Roadmap · dossiers' })}
          </span>
        }
        description={t({
          fr: 'MAH ↔ agence locale — relance après une période d’inactivité.',
          en: 'MAH ↔ local agency — reminder after a period of inactivity.',
        })}
      >
        <BoolField
          label={t({ fr: 'Relances automatiques', en: 'Automatic reminders' })}
          value={draft.roadmap_auto_enabled}
          onChange={(v) => setDraft((d) => ({ ...d, roadmap_auto_enabled: v }))}
        />
        <DayField
          label={t({ fr: 'Agent local', en: 'Local agent' })}
          hint={t({
            fr: 'revue · finalisation · soumission',
            en: 'review · finalisation · submission',
          })}
          value={draft.roadmap_agent_days}
          onChange={(v) => setDraft((d) => ({ ...d, roadmap_agent_days: v }))}
        />
        <DayField
          label={t({ fr: 'Agence nationale', en: 'National agency' })}
          hint={t({ fr: 'instruction · délai AMM ≈ 6 mois', en: 'review · MA delay ≈ 6 months' })}
          value={draft.roadmap_agency_days}
          onChange={(v) => setDraft((d) => ({ ...d, roadmap_agency_days: v }))}
        />
        <BoolField
          label={t({ fr: 'Notification e-mail', en: 'Email notification' })}
          hint={t({
            fr: 'l’affichage in-app reste toujours actif',
            en: 'in-app display always stays on',
          })}
          value={draft.roadmap_email_enabled}
          onChange={(v) => setDraft((d) => ({ ...d, roadmap_email_enabled: v }))}
        />
        <Note>
          {t({
            fr: 'Rappels plafonnés à 3 sans nouvelle activité. La relance manuelle « Relancer » reste disponible sur chaque dossier.',
            en: 'Reminders capped at 3 without new activity. The manual “Remind” action stays available on each dossier.',
          })}
        </Note>
      </Section>

      {/* ── Domaine B — Monitoring des pièces (MAH ↔ fabricant) ── */}
      <Section
        title={
          <span className="flex items-center gap-2">
            <Building2 className="text-info size-4 shrink-0" aria-hidden />
            {t({ fr: 'Monitoring des pièces', en: 'Document monitoring' })}
          </span>
        }
        description={t({
          fr: 'MAH ↔ fabricant — relance anticipée avant l’expiration des pièces admin.',
          en: 'MAH ↔ manufacturer — early reminder before administrative documents expire.',
        })}
      >
        <BoolField
          label={t({ fr: 'Relance auto du fabricant', en: 'Automatic manufacturer reminder' })}
          hint={t({
            fr: 'e-mail au fabricant (contact renseigné sur sa fiche Organisation) quand une pièce entre dans sa fenêtre de renouvellement',
            en: 'emails the manufacturer (contact set on its Organization page) when a document enters its renewal window',
          })}
          value={draft.monitoring_auto_enabled}
          onChange={(v) => setDraft((d) => ({ ...d, monitoring_auto_enabled: v }))}
        />
        <div className="space-y-1.5">
          <Label>
            {t({ fr: 'Préavis avant expiration (jours)', en: 'Lead time before expiry (days)' })}
          </Label>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {MONITORING_PIECE_TYPES.map((k) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 border-t py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
              >
                <span className="min-w-0 truncate text-sm" title={t(PIECE_LABEL[k])}>
                  {t(PIECE_LABEL[k])}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MONITORING_LEAD_FLOOR}
                    max={MONITORING_LEAD_MAX}
                    aria-label={t(PIECE_LABEL[k])}
                    value={draft.lead[k]}
                    onChange={(e) => setLead(k, e.target.value)}
                    className="w-20 text-center"
                  />
                  <span className="text-muted-foreground text-sm">{t({ fr: 'j', en: 'd' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Note>
          {t({
            fr: 'Minimum légal : lancer un renouvellement au moins 90 j avant l’expiration. Ces préavis pilotent les alertes « expire bientôt » du tableau de bord et du cockpit organisation.',
            en: 'Legal minimum: start a renewal at least 90 days before expiry. These lead times drive the “expiring soon” alerts on the dashboard and organization cockpit.',
          })}
        </Note>
      </Section>

      <div className="flex items-center justify-end gap-3">
        {dirty ? (
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Modifications non enregistrées', en: 'Unsaved changes' })}
          </span>
        ) : null}
        <Button variant="primary" disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t({ fr: 'Enregistrer', en: 'Save' })}
        </Button>
      </div>
    </div>
  )
}

/* ----------------------------- Destinataires (Slice 1b) ----------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Destinataires des relances — adresse + langue de la relance automatique, par envoi ACTIF (lien
 * non révoqué). La relance s'adresse au destinataire du dernier envoi actif d'un dossier ; on l'édite
 * ici (offline-first : Dexie + outbox, cf. `updateCorrespondenceRecipient`). Lecture seule pour les
 * membres non-gestionnaires de soumission (la RLS reste la vraie barrière).
 */
function RecipientsSection() {
  const { t } = useI18n()
  const orgId = getActiveOrgId()
  const { memberships } = useCurrentOrg()
  const canManage = canManageSubmission(memberships.find((m) => m.orgId === orgId)?.role)

  // Rafraîchit depuis le serveur à l'ouverture (best-effort ; `syncCorrespondences` no-op hors-ligne).
  useEffect(() => {
    if (orgId) void syncCorrespondences(orgId)
  }, [orgId])

  const correspondences = useLiveQuery(
    () => (orgId ? listCorrespondences(orgId) : Promise.resolve([])),
    [orgId],
  )
  // Envois ACTIFS (lien non révoqué) = cibles potentielles des relances auto.
  const active = (correspondences ?? []).filter((c) => c.revokedAt === null)

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Users className="text-info size-4 shrink-0" aria-hidden />
          {t({ fr: 'Destinataires', en: 'Recipients' })}
        </span>
      }
      description={t({
        fr: 'Adresse et langue de la relance automatique, par envoi actif.',
        en: 'Address and language of the automatic reminder, per active send.',
      })}
    >
      {correspondences === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : !orgId || active.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Aucun envoi actif. Les destinataires apparaîtront ici après l’envoi d’un dossier.',
            en: 'No active send. Recipients will appear here once a dossier has been sent.',
          })}
        </p>
      ) : (
        <ul className="divide-y">
          {active.map((c) => (
            <RecipientRow key={c.id} correspondence={c} orgId={orgId} canManage={canManage} />
          ))}
        </ul>
      )}
      <Note>
        {t({
          fr: 'La relance s’adresse au destinataire du dernier envoi actif de chaque dossier. Changer l’adresse redirige les relances et notifications futures ; l’historique du fil reste inchangé.',
          en: 'The reminder targets the recipient of each dossier’s latest active send. Changing the address redirects future reminders and notifications; the thread history stays unchanged.',
        })}
      </Note>
    </Section>
  )
}

function RecipientRow({
  correspondence: c,
  orgId,
  canManage,
}: {
  correspondence: CorrespondenceRecord
  orgId: string
  canManage: boolean
}) {
  const { t, lang } = useI18n()
  const initialLang: Lang = c.recipientLang ?? officialLang(c.country)
  const [email, setEmail] = useState(c.recipientEmail)
  const [rLang, setRLang] = useState<Lang>(initialLang)
  const [saving, setSaving] = useState(false)

  const dirty = email.trim().toLowerCase() !== c.recipientEmail || rLang !== initialLang

  async function save() {
    const next = email.trim().toLowerCase()
    if (!EMAIL_RE.test(next)) {
      toast.error(t({ fr: 'Adresse e-mail invalide.', en: 'Invalid e-mail address.' }))
      return
    }
    setSaving(true)
    try {
      await updateCorrespondenceRecipient(c.id, { recipientEmail: next, recipientLang: rLang })
      void syncCorrespondences(orgId)
      toast.success(t({ fr: 'Destinataire mis à jour', en: 'Recipient updated' }))
    } catch {
      toast.error(t({ fr: 'Échec de l’enregistrement', en: 'Save failed' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{c.productName}</div>
        <div className="text-muted-foreground text-xs">
          {countryLabel(c.country, lang)} · {statusLabel(c.status, lang)}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canManage || saving}
          aria-label={t({ fr: 'E-mail du destinataire', en: 'Recipient e-mail' })}
          className="sm:flex-1"
        />
        <Select
          value={rLang}
          onValueChange={(v) => setRLang(v as Lang)}
          disabled={!canManage || saving}
        >
          <SelectTrigger className="sm:w-40" aria-label={t({ fr: 'Langue', en: 'Language' })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">{t({ fr: 'Français', en: 'French' })}</SelectItem>
            <SelectItem value="en">{t({ fr: 'Anglais', en: 'English' })}</SelectItem>
          </SelectContent>
        </Select>
        {canManage ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t({ fr: 'Enregistrer', en: 'Save' })}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/* ----------------------------- Sous-composants ----------------------------- */

function DayField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-3 border-t py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={REMINDER_DAYS_MIN}
          max={REMINDER_DAYS_MAX}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 text-center"
        />
        <span className="text-muted-foreground text-sm">{t({ fr: 'jours', en: 'days' })}</span>
      </div>
    </div>
  )
}

function BoolField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-3 border-t py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
      </div>
      <Select value={value ? 'on' : 'off'} onValueChange={(v) => onChange(v === 'on')}>
        <SelectTrigger className="w-40 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="on">{t({ fr: 'Activées', en: 'Enabled' })}</SelectItem>
          <SelectItem value="off">{t({ fr: 'Désactivées', en: 'Disabled' })}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
