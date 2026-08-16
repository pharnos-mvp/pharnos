import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTheme } from 'next-themes'
import {
  Building2,
  Check,
  ClipboardList,
  CreditCard,
  Loader2,
  Lock,
  LogOut,
  Settings2,
  ShieldAlert,
  UserCircle2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/ui/page'
import { pillVariants } from '@/components/ui/pill'
import { Section } from '@/components/ui/section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAuth } from '@/features/auth/auth-context'
import { choosePlan } from '@/features/org/org-repository'
import { useOrgId } from '@/features/org/org-context'
import { useCurrentOrg, useMemberScope } from '@/features/org/use-current-org'
import { PLAN_CATALOG } from '@/features/org/plan-catalog'
import { TeamSection } from '@/features/team/TeamSection'
import {
  PLAN_LABEL,
  PLAN_ORDER,
  setOrgSync,
  useOrgPlan,
  type PlanTier,
} from '@/features/org/use-org-plan'
import { featureState, FEATURES } from '@/features/org/feature-state'
import { db } from '@/lib/db'
import { formatBytes } from '@/lib/format-bytes'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { imageFileToAvatarDataUrl, MAX_IMAGE_BYTES } from '@/lib/image-utils'
import { initials } from '@/lib/initials'
import { zoneFcfa } from '@/lib/money'
import { setSyncEnabledCache } from '@/lib/sync-prefs'
import { cn } from '@/lib/utils'
import { purgeLocalData, updatePassword, updateProfileMetadata } from './account-repository'
import { ImageField } from './ImageField'
import { InfoProSection } from './InfoProSection'

type SectionKey = 'perso' | 'pro' | 'abonnement' | 'team' | 'prefs' | 'logs' | 'danger'

export function AccountPage() {
  const { user, signOut } = useAuth()
  const orgId = useOrgId()
  const { t, lang, setLang } = useI18n()
  const location = useLocation()
  const [section, setSection] = useState<SectionKey>(
    (location.state as { section?: SectionKey } | null)?.section ?? 'perso',
  )
  // Même query (clé partagée) que le shell — badge de plan de la carte identité, 0 requête en plus.
  const { data: plan } = useOrgPlan()

  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>
  // « Nom d'admin » : le nom d'utilisateur choisi prime sur prénom+nom (recette CEO).
  const displayName =
    meta.username || [meta.prenom, meta.nom].filter(Boolean).join(' ') || user?.email || 'Pharnos'
  // Même query (clé partagée) que useCurrentOrg/useMemberScope — pas de double cache.
  const { memberships } = useCurrentOrg()
  const orgName = memberships.find((m) => m.orgId === orgId)?.orgName ?? ''
  // CS1 : membre scopé (couche suivi) — les sections ORG de l'hôte (abonnement/usage, équipe,
  // branding pro, journal d'audit) ne le concernent pas ; la RLS (0048) les viderait de toute
  // façon. Restent : infos perso, préférences, zone rouge (son propre compte).
  const { scoped } = useMemberScope()
  const orgOnlySections: SectionKey[] = ['pro', 'abonnement', 'team', 'logs']

  const allNav: { key: SectionKey; label: string; icon: typeof UserCircle2 }[] = [
    {
      key: 'perso',
      label: t({ fr: 'Infos personnelles', en: 'Personal info' }),
      icon: UserCircle2,
    },
    {
      key: 'pro',
      label: t({ fr: 'Informations professionnelles', en: 'Professional information' }),
      icon: Building2,
    },
    { key: 'abonnement', label: t({ fr: 'Abonnement', en: 'Subscription' }), icon: CreditCard },
    { key: 'team', label: t({ fr: 'Équipe', en: 'Team' }), icon: Users },
    { key: 'prefs', label: t({ fr: 'Préférences', en: 'Preferences' }), icon: Settings2 },
    {
      key: 'logs',
      label: t({ fr: 'Logs & historiques', en: 'Logs & history' }),
      icon: ClipboardList,
    },
    { key: 'danger', label: t({ fr: 'Zone rouge', en: 'Danger zone' }), icon: ShieldAlert },
  ]
  const nav = scoped ? allNav.filter(({ key }) => !orgOnlySections.includes(key)) : allNav
  // Une section org atteinte par état de navigation (ex. state {section:'abonnement'}) retombe
  // sur les infos personnelles pour un membre scopé.
  const activeSection = scoped && orgOnlySections.includes(section) ? 'perso' : section

  return (
    <Page>
      {/* Carte identité — l'h1 de la page (pattern fiche/cockpit du DS) */}
      <header className="bg-card rounded-xl border p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold">
            {meta.photo ? (
              <img src={meta.photo} alt="" className="size-full object-cover" />
            ) : (
              initials(displayName)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="font-display truncate text-xl font-bold tracking-tight"
              title={displayName}
            >
              {displayName}
            </h1>
            <p className="text-muted-foreground truncate text-sm">
              {user?.email}
              {user?.email && orgName ? ' · ' : ''}
              {orgName}
            </p>
          </div>
          {plan && !scoped ? (
            <span className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-sm font-semibold">
              {t(PLAN_LABEL[plan.plan])}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav
          aria-label={t({ fr: 'Sections du compte', en: 'Account sections' })}
          className="flex shrink-0 flex-row flex-wrap gap-1.5 lg:sticky lg:top-6 lg:w-52 lg:flex-col lg:self-start"
        >
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              aria-current={activeSection === key ? 'page' : undefined}
              className={cn(pillVariants({ active: activeSection === key }), 'lg:w-full')}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
          <Button
            variant="ghost"
            className="text-muted-foreground justify-start lg:mt-2"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> {t({ fr: 'Déconnexion', en: 'Sign out' })}
          </Button>
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {activeSection === 'perso' && <PersonalSection key={user?.id ?? 'local'} />}
          {activeSection === 'pro' && <InfoProSection />}
          {activeSection === 'abonnement' && <AbonnementSection />}
          {activeSection === 'team' && (
            <TeamSection orgId={orgId} onUpgrade={() => setSection('abonnement')} />
          )}
          {activeSection === 'prefs' && <PreferencesSection lang={lang} setLang={setLang} />}
          {activeSection === 'logs' && <LogsSection orgId={orgId} />}
          {activeSection === 'danger' && <DangerSection onDeleted={() => void signOut()} />}
        </div>
      </div>
    </Page>
  )
}

/* ----------------------------- Infos personnelles ----------------------------- */

function PersonalSection() {
  const { user } = useAuth()
  const { t } = useI18n()
  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>

  const [nom, setNom] = useState(meta.nom ?? '')
  const [prenom, setPrenom] = useState(meta.prenom ?? '')
  const [username, setUsername] = useState(meta.username ?? '')
  // Baseline pour l'état « modifié » (dirty) — réinitialisée après chaque enregistrement.
  const [saved, setSaved] = useState({
    nom: meta.nom ?? '',
    prenom: meta.prenom ?? '',
    username: meta.username ?? '',
  })
  const [photo, setPhoto] = useState<string | null>(meta.photo ?? null)
  const [saving, setSaving] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')

  if (!user) {
    return (
      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Connexion requise pour gérer le profil.',
          en: 'Sign in required to manage profile.',
        })}
      </p>
    )
  }

  async function handlePhoto(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t({ fr: 'Choisissez une image (PNG/JPG).', en: 'Choose an image (PNG/JPG).' }))
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t({ fr: 'Image trop lourde (max 3 Mo).', en: 'Image too large (max 3 MB).' }))
      return
    }
    const dataUrl = await imageFileToAvatarDataUrl(file)
    setPhoto(dataUrl)
    await save({ photo: dataUrl })
  }

  // `extra.photo === undefined` = appelant n'a pas touché la photo (garde l'état courant) ;
  // `null` = retrait explicite. Les deux appelants qui modifient la photo passent `extra.photo`.
  async function save(extra?: { photo?: string | null }) {
    setSaving(true)
    try {
      await updateProfileMetadata({
        nom,
        prenom,
        username,
        photo: extra?.photo === undefined ? (photo ?? '') : (extra.photo ?? ''),
      })
      setSaved({ nom, prenom, username })
      toast.success(t({ fr: 'Profil enregistré', en: 'Profile saved' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t({ fr: 'Erreur', en: 'Error' }))
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (pw1.length < 8) {
      toast.error(
        t({ fr: 'Mot de passe : 8 caractères minimum.', en: 'Password: 8 characters minimum.' }),
      )
      return
    }
    if (pw1 !== pw2) {
      toast.error(
        t({ fr: 'Les mots de passe ne correspondent pas.', en: 'Passwords do not match.' }),
      )
      return
    }
    try {
      await updatePassword(pw1)
      setPw1('')
      setPw2('')
      toast.success(t({ fr: 'Mot de passe mis à jour', en: 'Password updated' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t({ fr: 'Erreur', en: 'Error' }))
    }
  }

  const dirty = nom !== saved.nom || prenom !== saved.prenom || username !== saved.username

  return (
    <div className="space-y-6">
      <Section
        title={t({ fr: 'Infos personnelles', en: 'Personal info' })}
        description={t({
          fr: 'Nom, nom d’utilisateur et photo de votre compte.',
          en: 'Your account name, username and photo.',
        })}
        actions={
          <Button size="sm" disabled={saving || !dirty} onClick={() => void save()}>
            {t({ fr: 'Enregistrer', en: 'Save' })}
          </Button>
        }
      >
        <ImageField
          label={t({ fr: 'Photo', en: 'Photo' })}
          value={photo}
          uploadLabel={t({ fr: 'Téléverser', en: 'Upload' })}
          onPick={(f) => void handlePhoto(f)}
          onRemove={() => {
            setPhoto(null)
            void save({ photo: null })
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t({ fr: 'Nom', en: 'Last name' })}>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} />
          </Field>
          <Field label={t({ fr: 'Prénom(s)', en: 'First name(s)' })}>
            <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </Field>
          <Field label={t({ fr: "Nom d'utilisateur", en: 'Username' })}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={user.email ?? ''} disabled />
          </Field>
        </div>
      </Section>

      <Section
        title={t({ fr: 'Mot de passe', en: 'Password' })}
        description={t({ fr: '8 caractères minimum.', en: '8 characters minimum.' })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t({ fr: 'Nouveau mot de passe', en: 'New password' })}>
            <Input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
          </Field>
          <Field label={t({ fr: 'Confirmer', en: 'Confirm' })}>
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
        </div>
        <Button variant="outline" onClick={() => void changePassword()}>
          {t({ fr: 'Changer le mot de passe', en: 'Change password' })}
        </Button>
      </Section>
    </div>
  )
}

/* ----------------------------- Préférences ----------------------------- */

function PreferencesSection({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const orgId = useOrgId()
  const { data: plan } = useOrgPlan()
  const qc = useQueryClient()
  const [savingSync, setSavingSync] = useState(false)

  async function onSyncChange(v: string) {
    const enabled = v === 'on'
    setSavingSync(true)
    try {
      await setOrgSync(enabled)
      if (orgId) setSyncEnabledCache(orgId, enabled)
      await qc.invalidateQueries({ queryKey: ['my-org-plan'] })
      toast.success(
        enabled
          ? t({ fr: 'Synchronisation cloud activée', en: 'Cloud sync enabled' })
          : t({
              fr: 'Mode local activé — vos données restent sur cet appareil',
              en: 'Local mode enabled — your data stays on this device',
            }),
      )
    } catch (e) {
      toast.error(
        (e as Error).message === 'forbidden'
          ? t({ fr: 'Réservé aux administrateurs', en: 'Admins only' })
          : t({ fr: 'Échec de la mise à jour', en: 'Update failed' }),
      )
    } finally {
      setSavingSync(false)
    }
  }

  return (
    <Section
      title={t({ fr: 'Préférences', en: 'Preferences' })}
      description={t({
        fr: 'Langue de l’interface, thème et synchronisation.',
        en: 'Interface language, theme and sync.',
      })}
    >
      <Field label={t({ fr: 'Langue', en: 'Language' })}>
        <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label={t({ fr: 'Thème', en: 'Theme' })}>
        <Select value={theme ?? 'system'} onValueChange={setTheme}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">{t({ fr: 'Clair', en: 'Light' })}</SelectItem>
            <SelectItem value="dark">{t({ fr: 'Sombre', en: 'Dark' })}</SelectItem>
            <SelectItem value="system">{t({ fr: 'Système', en: 'System' })}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label={t({ fr: 'Synchronisation cloud', en: 'Cloud sync' })}>
        <div className="space-y-1.5">
          <Select
            value={plan?.sync_enabled === false ? 'off' : 'on'}
            onValueChange={onSyncChange}
            disabled={savingSync || !plan}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">
                {t({ fr: 'Activée (sauvegarde + équipe)', en: 'Enabled (backup + team)' })}
              </SelectItem>
              <SelectItem value="off">
                {t({
                  fr: 'Mode local (privé, cet appareil)',
                  en: 'Local mode (private, this device)',
                })}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground max-w-md text-xs">
            {t({
              fr: 'En mode local, vos dossiers restent sur cet appareil — non synchronisés, non sauvegardés en ligne, partage agence indisponible. Réservé aux administrateurs.',
              en: 'In local mode, your dossiers stay on this device — not synced, no online backup, agency sharing unavailable. Admins only.',
            })}
          </p>
        </div>
      </Field>
    </Section>
  )
}

/* ----------------------------- Logs & historiques ----------------------------- */

function LogsSection({ orgId }: { orgId: string }) {
  const { t } = useI18n()
  const entries = useLiveQuery(async () => {
    const all = await db.auditLog.where('orgId').equals(orgId).sortBy('at')
    return all.reverse().slice(0, 50)
  }, [orgId])

  const actionLabel = (a: string) =>
    a === 'create'
      ? t({ fr: 'Créé', en: 'Created' })
      : a === 'delete'
        ? t({ fr: 'Supprimé', en: 'Deleted' })
        : t({ fr: 'Modifié', en: 'Updated' })

  const entityLabel = (e: string) =>
    ({
      product: t({ fr: 'Produit', en: 'Product' }),
      document: t({ fr: 'Document', en: 'Document' }),
      dossier: t({ fr: 'Dossier', en: 'Dossier' }),
      generated_doc: t({ fr: 'Document généré', en: 'Generated doc' }),
      dossier_attachment: t({ fr: 'Pièce jointe', en: 'Attachment' }),
    })[e] ?? e

  // Statut sémantique (tokens light/dark AA) — plus de couleurs Tailwind en dur.
  const actionTone = (a: string) =>
    a === 'delete'
      ? ('danger' as const)
      : a === 'create'
        ? ('success' as const)
        : ('warning' as const)

  return (
    <Section
      title={t({ fr: 'Journal d’audit', en: 'Audit log' })}
      description={t({
        fr: 'Les 50 dernières actions sur les données de l’organisation.',
        en: 'The 50 most recent actions on organization data.',
      })}
    >
      {entries === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={t({ fr: 'Aucune action enregistrée', en: 'No recorded actions' })}
          description={t({
            fr: 'Les créations, modifications et suppressions apparaîtront ici.',
            en: 'Creations, updates and deletions will appear here.',
          })}
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
              <StatusBadge tone={actionTone(e.action)}>{actionLabel(e.action)}</StatusBadge>
              <span className="text-muted-foreground text-xs">{entityLabel(e.entity)}</span>
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{e.actorEmail}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {new Date(e.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/* ----------------------------- Zone rouge ----------------------------- */

function DangerSection({ onDeleted }: { onDeleted: () => void }) {
  const { t } = useI18n()
  async function handleDelete() {
    await purgeLocalData()
    toast.success(
      t({
        fr: 'Données locales effacées. Déconnexion…',
        en: 'Local data cleared. Signing out…',
      }),
    )
    onDeleted()
  }
  return (
    <Section
      className="border-destructive/40"
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert className="text-destructive size-4 shrink-0" aria-hidden="true" />
          {t({ fr: 'Suppression de compte', en: 'Delete account' })}
        </span>
      }
      description={t({
        fr: 'Efface vos données locales et vous déconnecte. La suppression définitive côté serveur sera traitée ensuite.',
        en: 'Clears your local data and signs you out. Permanent server-side deletion is processed afterwards.',
      })}
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            {t({ fr: 'Supprimer mon compte', en: 'Delete my account' })}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t({ fr: 'Confirmer la suppression', en: 'Confirm deletion' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t({
                fr: 'Cette action efface vos données locales et vous déconnecte. Continuer ?',
                en: 'This clears your local data and signs you out. Continue?',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t({ fr: 'Annuler', en: 'Cancel' })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              {t({ fr: 'Supprimer', en: 'Delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}

/* ----------------------------- Abonnement (plan + usage + barème) ----------------------------- */

/** Exportée pour le test composant (fixture de plan — le mode local n'a pas de plan serveur). */
export function AbonnementSection() {
  const { t, lang } = useI18n()
  const { data: plan, isLoading, refetch } = useOrgPlan()
  const qc = useQueryClient()
  const [upgrading, setUpgrading] = useState<PlanTier | null>(null)
  const nf = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR')
  const fmt = (n: number) => nf.format(n)

  async function upgrade(tier: PlanTier) {
    setUpgrading(tier)
    try {
      await choosePlan(tier)
      await qc.invalidateQueries({ queryKey: ['my-org-plan'] })
      toast.success(
        t({
          fr: `Plan ${t(PLAN_LABEL[tier])} activé`,
          en: `${t(PLAN_LABEL[tier])} plan activated`,
        }),
      )
    } catch (e) {
      toast.error(t({ fr: 'Échec de la mise à niveau', en: 'Upgrade failed' }), {
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setUpgrading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (!plan) {
    return (
      <ErrorState
        title={t({ fr: 'Abonnement indisponible', en: 'Subscription unavailable' })}
        reason={t({
          fr: 'Vous êtes hors ligne ou le serveur est injoignable. Vos limites restent appliquées côté serveur.',
          en: 'You are offline or the server is unreachable. Your limits still apply server-side.',
        })}
        action={
          <Button variant="outline" onClick={() => void refetch()}>
            {t({ fr: 'Réessayer', en: 'Retry' })}
          </Button>
        }
      />
    )
  }

  const currentIdx = PLAN_ORDER.indexOf(plan.plan)

  return (
    <div className="space-y-6">
      <Section
        title={t({ fr: 'Votre abonnement', en: 'Your subscription' })}
        description={t({
          fr: 'Utilisation ce mois-ci — mode pilote, activation immédiate sans paiement.',
          en: 'Usage this month — pilot mode, immediate activation without payment.',
        })}
        actions={
          <span className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-sm font-semibold">
            {t(PLAN_LABEL[plan.plan])}
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <UsageMeter
            label={t({ fr: 'Dépôts (compilations)', en: 'Submissions (compilations)' })}
            used={plan.compilations_used}
            capValue={plan.max_compilations}
            format={fmt}
            detail={t({ fr: 'brouillons illimités', en: 'unlimited drafts' })}
          />
          <UsageMeter
            label={t({ fr: 'Tokens IA', en: 'AI tokens' })}
            used={plan.tokens_used}
            capValue={plan.monthly_ai_tokens}
            format={fmt}
            detail={t({ fr: 'Regafy & traduction', en: 'Regafy & translation' })}
          />
          <UsageMeter
            label={t({ fr: 'Stockage', en: 'Storage' })}
            used={plan.storage_used}
            capValue={plan.max_storage_bytes}
            format={(n) => formatBytes(n, lang)}
            detail={t({ fr: 'documents synchronisés', en: 'synced documents' })}
          />
        </div>
      </Section>

      <Section
        title={t({ fr: 'Fonctionnalités', en: 'Features' })}
        description={t({
          fr: 'Ce que votre plan inclut — le reste arrive avec la mise à niveau.',
          en: 'What your plan includes — the rest comes with an upgrade.',
        })}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const st = featureState(plan.features, f.key)
            if (st === 'hidden') return null // Masquée : invisible
            const on = st === 'enabled'
            const planName = t(PLAN_LABEL[f.minPlan])
            return (
              <li key={f.key} className="flex items-center gap-2 text-sm">
                {on ? (
                  <Check className="text-success size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Lock className="text-muted-foreground/70 size-4 shrink-0" aria-hidden="true" />
                )}
                <span className={on ? '' : 'text-muted-foreground'}>{t(f.label)}</span>
                {st === 'teaser' ? (
                  <StatusBadge tone="info">
                    {t({ fr: `dès ${planName}`, en: `from ${planName}` })}
                  </StatusBadge>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section
        title={t({ fr: 'Tous les plans', en: 'All plans' })}
        description={t({
          fr: 'Changement immédiat en mode pilote — contrats et facturation à la signature.',
          en: 'Immediate change in pilot mode — contracts and billing at signature.',
        })}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PLAN_CATALOG.map((p) => {
            const idx = PLAN_ORDER.indexOf(p.tier)
            const isCurrent = p.tier === plan.plan
            const isUpgrade = idx > currentIdx
            return (
              <div
                key={p.tier}
                className={cn(
                  'flex flex-col rounded-xl border p-4',
                  isCurrent && 'border-info ring-info/30 ring-1',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold">
                    {t(PLAN_LABEL[p.tier])}
                  </span>
                  {isCurrent ? (
                    <StatusBadge tone="info">
                      {t({ fr: 'Votre plan', en: 'Your plan' })}
                    </StatusBadge>
                  ) : p.recommended ? (
                    <StatusBadge tone="neutral">
                      {t({ fr: 'Recommandé', en: 'Recommended' })}
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">{t(p.tagline)}</p>
                {p.price ? (
                  <div className="font-display mt-2 text-lg font-semibold">
                    {t(zoneFcfa() && p.priceXof ? p.priceXof : p.price)}
                  </div>
                ) : null}
                <ul className="mt-3 space-y-1.5">
                  {p.highlights.map((h, i) => (
                    <li key={i} className="text-muted-foreground flex items-start gap-1.5 text-xs">
                      <Check className="text-success mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      <span>{t(h)}</span>
                    </li>
                  ))}
                </ul>
                {isUpgrade ? (
                  <div className="mt-auto pt-3">
                    <Button
                      variant={idx === currentIdx + 1 ? 'primary' : 'outline'}
                      size="sm"
                      className="w-full"
                      disabled={upgrading !== null}
                      onClick={() => void upgrade(p.tier)}
                    >
                      {upgrading === p.tier ? <Loader2 className="size-4 animate-spin" /> : null}
                      {t({ fr: 'Passer à', en: 'Switch to' })} {t(PLAN_LABEL[p.tier])}
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          {t({ fr: 'Besoin d’un devis sur-mesure ? ', en: 'Need a tailored quote? ' })}
          <a className="underline" href="mailto:contact@pharnos.com?subject=Pharnos">
            contact@pharnos.com
          </a>
        </p>
      </Section>
    </div>
  )
}

/**
 * Tuile d'usage avec jauge : valeur/cap + barre de progression sémantique (info < 80 %,
 * warning ≥ 80 %, danger à saturation). Cap `null` = illimité (∞, pas de jauge) ; cap 0 = pas
 * de jauge non plus (rien à consommer — l'upsell s'en charge).
 */
function UsageMeter({
  label,
  used,
  capValue,
  format,
  detail,
}: {
  label: string
  used: number
  capValue: number | null
  format: (n: number) => string
  detail?: string
}) {
  const pct =
    capValue === null || capValue === 0 ? null : Math.min(100, Math.round((used / capValue) * 100))
  const barClass =
    pct === null ? '' : pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-info'
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {format(used)}{' '}
        <span className="text-muted-foreground text-sm font-normal">
          / {capValue === null ? '∞' : format(capValue)}
        </span>
      </div>
      {pct !== null && capValue !== null ? (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={capValue}
          aria-valuenow={Math.min(used, capValue)}
          className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
        >
          <div className={cn('h-full rounded-full', barClass)} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {detail ? <div className="text-muted-foreground mt-1.5 text-xs">{detail}</div> : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
