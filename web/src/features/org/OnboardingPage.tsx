import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setOrgProfile } from '@/features/profile/pro-settings-repository'
import { syncProSettings } from '@/features/profile/pro-settings-sync'
import { ROLE_LABEL, teamApi, type OrgRole } from '@/features/team/team-api'
import { COUNTRIES } from '@/features/workspace/dossier-constants'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { createOrgOnboarding } from './org-repository'
import { PLAN_CATALOG, planHasTeam } from './plan-catalog'
import { PLAN_LABEL, type PlanTier } from './use-org-plan'

type Step = 'org' | 'plan' | 'invite'
const STEPS: Step[] = ['org', 'plan', 'invite']
const INVITE_ROLES: OrgRole[] = [
  'admin',
  'ra_officer',
  'reviewer',
  'agence_locale',
  'agence_representation',
  'expert_ra',
]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface InviteDraft {
  email: string
  role: OrgRole
}

/**
 * Onboarding minimal (3 étapes) :
 *  1. **Organisation** — nom + poste + pays (l'identité pro tient en une étape ; le nom de l'org
 *     sert d'« entreprise » pour l'en-tête des documents → plus d'étape « Informations pro »).
 *  2. **Plan** — accordé immédiatement (mode pilote, sans paiement). **Aucun plan choisi = Free.**
 *  3. **Équipe** — invitations (si le plan inclut l'Équipe, sinon teaser).
 * Le bouton **Passer** saute les étapes optionnelles (plan, équipe) → un utilisateur qui passe
 * jusqu'au bout sans rien choisir est classé **Free**. Seul le nom de l'organisation est requis.
 */
export function OnboardingPage({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const { t, lang } = useI18n()
  const [step, setStep] = useState<Step>('org')
  const [orgName, setOrgName] = useState('')
  // Aucun plan présélectionné : tant que l'utilisateur ne choisit pas explicitement une carte,
  // l'org est créée en Free (exigence : « Passer jusqu'au bout sans choisir → Free »).
  const [plan, setPlan] = useState<PlanTier>('free')
  const [planChosen, setPlanChosen] = useState(false)
  const [poste, setPoste] = useState('')
  const [pays, setPays] = useState('')
  const [invites, setInvites] = useState<InviteDraft[]>([{ email: '', role: 'ra_officer' }])
  const [submitting, setSubmitting] = useState(false)

  const teamEnabled = planHasTeam(plan)
  const stepIndex = STEPS.indexOf(step)
  const orgValid = orgName.trim().length >= 2

  function goNext() {
    if (step === 'org') {
      if (!orgValid) return
      setStep('plan')
    } else if (step === 'plan') {
      setStep('invite')
    }
  }
  function goBack() {
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev)
  }
  /** « Passer » : saute une étape optionnelle. Sur le plan, équivaut à rester en Free. */
  function skip() {
    if (step === 'plan') {
      setPlan('free')
      setPlanChosen(false)
      setStep('invite')
    } else if (step === 'invite') {
      void finish()
    }
  }

  function choosePlanCard(tier: PlanTier) {
    setPlan(tier)
    setPlanChosen(true)
  }

  function updateInvite(i: number, patch: Partial<InviteDraft>) {
    setInvites((list) => list.map((inv, idx) => (idx === i ? { ...inv, ...patch } : inv)))
  }

  async function finish() {
    if (!orgValid) return
    setSubmitting(true)
    try {
      // Plan non choisi → Free (jamais bloquant, jamais facturé sans choix explicite).
      const orgId = await createOrgOnboarding(orgName.trim(), planChosen ? plan : 'free')
      // Identité pro → pro_settings (Dexie + outbox, push immédiat) : le nom de l'org tient lieu
      // d'« entreprise » en tête des documents ; poste/pays facultatifs.
      await setOrgProfile(orgId, {
        entreprise: orgName.trim(),
        poste: poste.trim() || null,
        signataire: null,
        pays: pays.trim() || null,
      })
      void syncProSettings(orgId)

      // Invitations (best-effort) — uniquement si le plan inclut l'Équipe.
      if (teamEnabled) {
        const valid = invites.filter((i) => EMAIL_RE.test(i.email.trim()))
        let sent = 0
        for (const inv of valid) {
          try {
            await teamApi.invite(orgId, inv.email.trim().toLowerCase(), inv.role)
            sent++
          } catch {
            toast.error(
              t({ fr: `Invitation à ${inv.email} échouée`, en: `Invite to ${inv.email} failed` }),
            )
          }
        }
        if (sent > 0) {
          toast.success(
            t({ fr: `${sent} invitation(s) envoyée(s)`, en: `${sent} invitation(s) sent` }),
          )
        }
      }
      toast.success(t({ fr: 'Organisation créée', en: 'Organization created' }))
      await onCreated()
    } catch (error) {
      toast.error(t({ fr: 'Échec de la création', en: 'Creation failed' }), {
        description:
          error instanceof Error
            ? error.message
            : t({ fr: 'Erreur inconnue', en: 'Unknown error' }),
      })
      setSubmitting(false)
    }
  }

  const titles: Record<Step, { title: string; desc: string }> = {
    org: {
      title: t({ fr: 'Créer votre organisation', en: 'Create your organization' }),
      desc: t({
        fr: "Laboratoire, agence ou cabinet d'affaires réglementaires.",
        en: 'Laboratory, agency or regulatory affairs firm.',
      }),
    },
    plan: {
      title: t({ fr: 'Choisissez votre plan', en: 'Choose your plan' }),
      desc: t({
        fr: 'Accordé immédiatement — modifiable à tout moment. « Passer » = plan Free.',
        en: 'Granted immediately — change anytime. “Skip” = Free plan.',
      }),
    },
    invite: {
      title: t({ fr: 'Invitez votre équipe', en: 'Invite your team' }),
      desc: t({ fr: 'Optionnel — par adresse e-mail.', en: 'Optional — by email address.' }),
    },
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className={cn('w-full', step === 'plan' ? 'max-w-3xl' : 'max-w-md')}>
        <CardHeader>
          <div className="text-muted-foreground mb-2 flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= stepIndex ? 'bg-primary' : 'bg-border',
                )}
              />
            ))}
          </div>
          <CardTitle>{titles[step].title}</CardTitle>
          <CardDescription>{titles[step].desc}</CardDescription>
        </CardHeader>

        <CardContent>
          {step === 'org' ? (
            <div className="mx-auto w-full max-w-md space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ob-name">
                  {t({ fr: "Nom de l'organisation", en: 'Organization name' })}
                </Label>
                <Input
                  id="ob-name"
                  autoFocus
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') goNext()
                  }}
                  placeholder={t({
                    fr: 'Ex. Laboratoire Sahel Pharma',
                    en: 'E.g. Sahel Pharma Laboratory',
                  })}
                />
                {orgName.length > 0 && !orgValid ? (
                  <p className="text-destructive text-xs">
                    {t({ fr: 'Au moins 2 caractères', en: 'At least 2 characters' })}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-poste">{t({ fr: 'Poste', en: 'Position' })}</Label>
                <Input
                  id="ob-poste"
                  value={poste}
                  onChange={(e) => setPoste(e.target.value)}
                  placeholder={t({ fr: 'Ex. Responsable RA', en: 'E.g. RA Manager' })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-pays">{t({ fr: 'Pays', en: 'Country' })}</Label>
                <Select value={pays} onValueChange={setPays}>
                  <SelectTrigger id="ob-pays" className="w-full">
                    <SelectValue placeholder={t({ fr: 'Sélectionner…', en: 'Select…' })} />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.label}>
                        {lang === 'en' && c.en ? c.en : c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {step === 'plan' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PLAN_CATALOG.map((p) => {
                const selected = planChosen && plan === p.tier
                return (
                  <button
                    key={p.tier}
                    type="button"
                    onClick={() => choosePlanCard(p.tier)}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col rounded-lg border p-3 text-left transition',
                      selected
                        ? 'border-primary ring-primary/40 ring-2'
                        : 'hover:border-foreground/30',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{t(PLAN_LABEL[p.tier])}</span>
                      {selected ? (
                        <Check className="text-primary size-4 shrink-0" />
                      ) : p.recommended ? (
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
                          {t({ fr: 'Recommandé', en: 'Recommended' })}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">{t(p.tagline)}</p>
                    <ul className="mt-2 space-y-1">
                      {p.highlights.map((h, i) => (
                        <li
                          key={i}
                          className="text-muted-foreground flex items-start gap-1.5 text-xs"
                        >
                          <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                          <span>{t(h)}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          ) : null}

          {step === 'invite' ? (
            <div className="mx-auto w-full max-w-md space-y-3">
              {teamEnabled ? (
                <>
                  {invites.map((inv, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        {i === 0 ? (
                          <Label className="text-muted-foreground text-xs">
                            {t({ fr: 'Adresse e-mail', en: 'Email address' })}
                          </Label>
                        ) : null}
                        <Input
                          type="email"
                          value={inv.email}
                          onChange={(e) => updateInvite(i, { email: e.target.value })}
                          placeholder="collegue@labo.com"
                        />
                      </div>
                      <div className="w-40 space-y-1.5">
                        {i === 0 ? (
                          <Label className="text-muted-foreground text-xs">
                            {t({ fr: 'Rôle', en: 'Role' })}
                          </Label>
                        ) : null}
                        <Select
                          value={inv.role}
                          onValueChange={(v) => updateInvite(i, { role: v as OrgRole })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {t(ROLE_LABEL[r])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {invites.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t({ fr: 'Retirer', en: 'Remove' })}
                          onClick={() => setInvites((l) => l.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setInvites((l) => [...l, { email: '', role: 'ra_officer' }])}
                  >
                    <Plus className="size-4" /> {t({ fr: 'Ajouter', en: 'Add' })}
                  </Button>
                  <p className="text-muted-foreground text-xs">
                    {t({
                      fr: 'Optionnel : vous pourrez aussi inviter depuis votre compte.',
                      en: 'Optional: you can also invite from your account later.',
                    })}
                  </p>
                </>
              ) : (
                <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border p-4 text-sm">
                  <Lock className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {t({
                      fr: 'La fonction Équipe est incluse à partir du plan Team. Vous pourrez inviter vos coéquipiers en passant à un plan supérieur depuis votre compte.',
                      en: 'Team features are included from the Team plan. You can invite teammates after upgrading from your account.',
                    })}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2">
          {stepIndex > 0 ? (
            <Button type="button" variant="ghost" onClick={goBack} disabled={submitting}>
              <ArrowLeft className="size-4" /> {t({ fr: 'Retour', en: 'Back' })}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {/* « Passer » : étapes optionnelles uniquement (plan ; équipe si elle est proposée). */}
            {step === 'plan' || (step === 'invite' && teamEnabled) ? (
              <Button type="button" variant="ghost" onClick={skip} disabled={submitting}>
                {t({ fr: 'Passer', en: 'Skip' })}
              </Button>
            ) : null}
            {step === 'invite' ? (
              <Button
                type="button"
                onClick={() => void finish()}
                disabled={submitting || !orgValid}
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {t({ fr: 'Terminer', en: 'Finish' })}
              </Button>
            ) : (
              <Button type="button" onClick={goNext} disabled={step === 'org' && !orgValid}>
                {t({ fr: 'Continuer', en: 'Continue' })} <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
