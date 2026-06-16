import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useI18n } from '@/lib/i18n-context'

import { ROLE_HINT, ROLE_LABEL, teamApi, type OrgRole } from './team-api'

const ROLES: OrgRole[] = [
  'admin',
  'ra_officer',
  'reviewer',
  'agence_locale',
  'agence_representation',
  'expert_ra',
]

export function TeamSection({ orgId }: { orgId: string }) {
  const { t } = useI18n()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['team', orgId],
    queryFn: () => teamApi.list(orgId),
    enabled: Boolean(orgId),
  })
  const isAdmin = data?.members.find((m) => m.is_you)?.role === 'admin'
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('ra_officer')
  const [busy, setBusy] = useState(false)

  async function invite() {
    const e = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error(t({ fr: 'Adresse e-mail invalide', en: 'Invalid email address' }))
      return
    }
    setBusy(true)
    try {
      const r = await teamApi.invite(orgId, e, role)
      toast.success(
        r.emailSent
          ? t({ fr: 'Invitation envoyée', en: 'Invitation sent' })
          : t({
              fr: 'Invitation créée (e-mail indisponible)',
              en: 'Invitation created (email unavailable)',
            }),
      )
      setEmail('')
      void refetch()
    } catch (err) {
      toast.error(
        (err as Error).message === 'forbidden'
          ? t({ fr: 'Réservé aux administrateurs', en: 'Admins only' })
          : t({ fr: 'Échec de l’invitation', en: 'Invite failed' }),
      )
    } finally {
      setBusy(false)
    }
  }

  async function act(fn: () => Promise<{ ok: boolean; reason?: string }>) {
    try {
      const r = await fn()
      if (!r.ok) {
        toast.error(
          r.reason === 'last_admin'
            ? t({
                fr: 'Impossible : c’est le dernier administrateur.',
                en: 'Cannot: this is the last administrator.',
              })
            : t({ fr: 'Action refusée', en: 'Action denied' }),
        )
        return
      }
      void refetch()
    } catch (err) {
      toast.error((err as Error).message || t({ fr: 'Erreur', en: 'Error' }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-background sticky top-0 z-10 border-b pb-3">
        <h3 className="text-sm font-medium">{t({ fr: 'Équipe', en: 'Team' })}</h3>
        <p className="text-muted-foreground text-xs">
          {t({
            fr: 'Invitez des coéquipiers et gérez leurs rôles. Le Lecteur est en lecture seule.',
            en: 'Invite teammates and manage their roles. Reader is read-only.',
          })}
        </p>
      </div>

      {isAdmin ? (
        <div className="bg-card flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground text-xs">
              {t({ fr: 'E-mail à inviter', en: 'Email to invite' })}
            </span>
            <Input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="collegue@labo.com"
              className="w-64"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground text-xs">{t({ fr: 'Rôle', en: 'Role' })}</span>
            <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(ROLE_LABEL[r])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button onClick={invite} disabled={busy}>
            {busy ? t({ fr: 'Envoi…', en: 'Sending…' }) : t({ fr: 'Inviter', en: 'Invite' })}
          </Button>
        </div>
      ) : null}

      {/* Membres */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ fr: 'Membre', en: 'Member' })}</TableHead>
              <TableHead>{t({ fr: 'Rôle', en: 'Role' })}</TableHead>
              {isAdmin ? (
                <TableHead className="text-right">{t({ fr: 'Actions', en: 'Actions' })}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground text-sm">
                  {t({ fr: 'Chargement…', en: 'Loading…' })}
                </TableCell>
              </TableRow>
            ) : (
              data?.members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="font-medium">
                    <span className="truncate">{m.email}</span>
                    {m.is_you ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        {t({ fr: '(vous)', en: '(you)' })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {isAdmin && !m.is_you ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) =>
                          act(() => teamApi.setRole(orgId, m.user_id, v as OrgRole))
                        }
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {t(ROLE_LABEL[r])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">
                        {t(ROLE_LABEL[m.role])}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {t(ROLE_HINT[m.role])}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  {isAdmin ? (
                    <TableCell className="text-right">
                      {!m.is_you ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">
                              {t({ fr: 'Retirer', en: 'Remove' })}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t({ fr: 'Retirer ce membre ?', en: 'Remove this member?' })}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t({
                                  fr: `${m.email} perdra l'accès à l'organisation. Réversible par une nouvelle invitation.`,
                                  en: `${m.email} will lose access to the organization. Reversible via a new invitation.`,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t({ fr: 'Annuler', en: 'Cancel' })}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => act(() => teamApi.removeMember(orgId, m.user_id))}
                              >
                                {t({ fr: 'Retirer', en: 'Remove' })}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invitations en attente */}
      {data && data.pending.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            {t({ fr: 'Invitations en attente', en: 'Pending invitations' })}
          </h4>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t({ fr: 'E-mail', en: 'Email' })}</TableHead>
                  <TableHead>{t({ fr: 'Rôle', en: 'Role' })}</TableHead>
                  <TableHead>{t({ fr: 'Expire le', en: 'Expires' })}</TableHead>
                  {isAdmin ? (
                    <TableHead className="text-right">
                      {t({ fr: 'Actions', en: 'Actions' })}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {t(ROLE_LABEL[p.role])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {new Date(p.expires_at).toLocaleDateString()}
                    </TableCell>
                    {isAdmin ? (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(() => teamApi.revokeInvite(p.id))}
                        >
                          {t({ fr: 'Révoquer', en: 'Revoke' })}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
