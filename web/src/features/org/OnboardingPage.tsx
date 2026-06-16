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

type Step = 'org' | 'plan' | 'info' | 'invite'
const STEPS: Step[] = ['org', 'plan', 'info', 'invite']
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
 * Onboarding multi-étapes (jalon S3) : organisation → plan → infos pro → invitation.
 * - Le plan choisi est accordé immédiatement (mode pilote, sans paiement) via create_org_onboarding.
 * - Les infos pro sont écrites dans pro_settings (offline-first) → corrige « entreprise vide ».
 * - L'invitation d'équipe n'est proposée que si le plan inclut la fonction Équipe (sinon teaser).
 */
export function OnboardingPage({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const { t, lang } = useI18n()
  const [step, setStep] = useState<Step>('org')
  const [orgName, setOrgName] = useState('')
  const [plan, setPlan] = useState<PlanTier>('pro')
  const [entreprise, setEntreprise] = useState('')
  const [poste, setPoste] = useState('')
  const [pays, setPays] = useState('')
  const [invites, setInvites] = useState<InviteDraft[]>([{ email: '', role: 'ra_officer' }])
  const [submitting, setSubmitting] = useState(false)

  const teamEnabled = planHasTeam(plan)
  const stepIndex = STEPS.indexOf(step)
  const orgValid = orgName.trim().length >= 2
  const infoValid = entreprise.trim().length >= 2

  function goNext() {
    if (step === 'org') {
      if (!orgValid) return
      // Préremplir l'entreprise avec le nom de l'org (corrige « entreprise vide »).
      if (!entreprise.trim()) setEntreprise(orgName.trim())
      setStep('plan')
    } else if (step === 'plan') {
      setStep('info')
    } else if (step === 'info') {
      if (!infoValid) return
      setStep('invite')
    }
  }
  function goBack() {
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev)
  }

  function updateInvite(i: number, patch: Partial<InviteDraft>) {
    setInvites((list) => list.map((inv, idx) => (idx === i ? { ...inv, ...patch } : inv)))
  }

  async function finish() {
    if (!orgValid || !infoValid) return
    setSubmitting(true)
    try {
      const orgId = await createOrgOnboarding(orgName.trim(), plan)
      // Infos pro → pro_settings (Dexie + outbox, push immédiat). Lu ensuite par « Informations
      // professionnelles » du compte → la case entreprise n'est plus vide.
      await setOrgProfile(orgId, {
        entreprise: entreprise.trim() || orgName.trim(),
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
        fr: 'Accordé immédiatement — modifiable à tout moment.',
        en: 'Granted immediately — change anytime.',
      }),
    },
    info: {
      title: t({ fr: 'Informations professionnelles', en: 'Professional information' }),
      desc: t({
        fr: 'Affichées en tête de vos documents.',
        en: 'Shown at the top of your documents.',
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
            <div className="mx-auto w-full max-w-md space-y-1.5">
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
          ) : null}

          {step === 'plan' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PLAN_CATALOG.map((p) => {
                const selected = plan === p.tier
                return (
                  <button
                    key={p.tier}
                    type="button"
                    onClick={() => setPlan(p.tier)}
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

          {step === 'info' ? (
            <div className="mx-auto w-full max-w-md space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ob-entreprise">
                  {t({ fr: "Nom de l'entreprise", en: 'Company name' })}
                </Label>
                <Input
                  id="ob-entreprise"
                  value={entreprise}
                  onChange={(e) => setEntreprise(e.target.value)}
                />
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
          {step === 'invite' ? (
            <Button type="button" onClick={() => void finish()} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t({ fr: 'Terminer', en: 'Finish' })}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              disabled={(step === 'org' && !orgValid) || (step === 'info' && !infoValid)}
            >
              {t({ fr: 'Continuer', en: 'Continue' })} <ArrowRight className="size-4" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
