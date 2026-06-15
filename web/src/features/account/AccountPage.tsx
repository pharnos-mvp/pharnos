import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTheme } from 'next-themes'
import {
  Building2,
  ClipboardList,
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
import { fetchMyMemberships } from '@/features/org/org-repository'
import { useOrgId } from '@/features/org/org-context'
import { TeamSection } from '@/features/team/TeamSection'
import { db } from '@/lib/db'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { imageFileToAvatarDataUrl, MAX_IMAGE_BYTES } from '@/lib/image-utils'
import { initials } from '@/lib/initials'
import { purgeLocalData, updatePassword, updateProfileMetadata } from './account-repository'
import { ImageField } from './ImageField'
import { InfoProSection } from './InfoProSection'

type Section = 'perso' | 'pro' | 'team' | 'prefs' | 'logs' | 'danger'

export function AccountPage() {
  const { user, signOut } = useAuth()
  const orgId = useOrgId()
  const { t, lang, setLang } = useI18n()
  const [section, setSection] = useState<Section>('perso')

  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>
  const displayName =
    [meta.prenom, meta.nom].filter(Boolean).join(' ') || meta.username || user?.email || 'Pharnos'
  const { data: memberships } = useQuery({
    queryKey: ['memberships'],
    queryFn: fetchMyMemberships,
    enabled: Boolean(user),
  })
  const orgName = memberships?.find((m) => m.orgId === orgId)?.orgName ?? ''

  const nav: { key: Section; label: string; icon: typeof UserCircle2 }[] = [
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
    { key: 'team', label: t({ fr: 'Équipe', en: 'Team' }), icon: Users },
    { key: 'prefs', label: t({ fr: 'Préférences', en: 'Preferences' }), icon: Settings2 },
    {
      key: 'logs',
      label: t({ fr: 'Logs & historiques', en: 'Logs & history' }),
      icon: ClipboardList,
    },
    { key: 'danger', label: t({ fr: 'Zone rouge', en: 'Danger zone' }), icon: ShieldAlert },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center gap-3 border-b pb-4">
        <div className="bg-primary text-primary-foreground flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold">
          {meta.photo ? (
            <img src={meta.photo} alt="" className="size-full object-cover" />
          ) : (
            initials(displayName)
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{displayName}</div>
          {user?.email ? (
            <div className="text-muted-foreground truncate text-sm">{user.email}</div>
          ) : null}
          {orgName ? <div className="text-muted-foreground truncate text-xs">{orgName}</div> : null}
        </div>
      </header>

      <div className="flex flex-col gap-6 md:h-[calc(100svh-12rem)] md:flex-row">
        <nav className="flex shrink-0 flex-row flex-wrap gap-1 md:w-56 md:flex-col md:overflow-auto">
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ' +
                (section === key
                  ? 'bg-accent font-medium'
                  : 'text-muted-foreground hover:bg-accent/50')
              }
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
          <Button
            variant="ghost"
            className="text-muted-foreground mt-1 justify-start"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> {t({ fr: 'Déconnexion', en: 'Sign out' })}
          </Button>
        </nav>

        <div className="min-w-0 flex-1 md:overflow-auto">
          {section === 'perso' && <PersonalSection key={user?.id ?? 'local'} />}
          {section === 'pro' && <InfoProSection />}
          {section === 'team' && <TeamSection orgId={orgId} />}
          {section === 'prefs' && <PreferencesSection lang={lang} setLang={setLang} />}
          {section === 'logs' && <LogsSection orgId={orgId} />}
          {section === 'danger' && <DangerSection onDeleted={() => void signOut()} />}
        </div>
      </div>
    </div>
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
      toast.error(e instanceof Error ? e.message : 'Erreur')
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
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const dirty = nom !== saved.nom || prenom !== saved.prenom || username !== saved.username

  return (
    <div className="space-y-6">
      <div className="bg-background sticky top-0 z-10 flex items-center justify-between gap-3 border-b pb-3">
        <h3 className="text-sm font-medium">
          {t({ fr: 'Infos personnelles', en: 'Personal info' })}
        </h3>
        <Button size="sm" disabled={saving || !dirty} onClick={() => void save()}>
          {t({ fr: 'Enregistrer', en: 'Save' })}
        </Button>
      </div>
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

      <div className="space-y-3 border-t pt-6">
        <h3 className="text-sm font-medium">{t({ fr: 'Mot de passe', en: 'Password' })}</h3>
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
      </div>
    </div>
  )
}

/* ----------------------------- Préférences ----------------------------- */

function PreferencesSection({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  return (
    <div className="space-y-6">
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
    </div>
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

  const actionColor = (a: string) =>
    a === 'delete'
      ? 'bg-red-100 text-red-700'
      : a === 'create'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-amber-100 text-amber-700'

  if (!entries || entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t({ fr: 'Aucune action enregistrée.', en: 'No recorded actions.' })}
      </p>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
          <span className={`rounded px-2 py-0.5 text-xs ${actionColor(e.action)}`}>
            {actionLabel(e.action)}
          </span>
          <span className="text-muted-foreground text-xs">{entityLabel(e.entity)}</span>
          <span className="min-w-0 flex-1 truncate">{e.label}</span>
          <span className="text-muted-foreground shrink-0 text-xs">{e.actorEmail}</span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {new Date(e.at).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
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
    <div className="border-destructive/40 space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="text-destructive size-5" />
        <h3 className="font-medium">{t({ fr: 'Suppression de compte', en: 'Delete account' })}</h3>
      </div>
      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Efface vos données locales et vous déconnecte. La suppression définitive côté serveur sera traitée ensuite.',
          en: 'Clears your local data and signs you out. Permanent server-side deletion is processed afterwards.',
        })}
      </p>
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
