import { useMemo, useState } from 'react'
import { SearchX, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Section } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useI18n } from '@/lib/i18n-context'

import { adminApi, matchesSearch } from './admin-api'
import { useAsync } from './use-async'

const ROLE_LABEL: Record<string, { fr: string; en: string }> = {
  admin: { fr: 'Admin', en: 'Admin' },
  ra_officer: { fr: 'Éditeur', en: 'Editor' },
  reviewer: { fr: 'Lecteur', en: 'Reader' },
}

export function AdminUsers() {
  const { t, lang } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.users)
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () =>
      (data ?? []).filter((u) => matchesSearch(query, u.email, ...u.memberships.map((m) => m.org))),
    [data, query],
  )

  if (loading && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <ErrorState
        title={t({ fr: 'Utilisateurs indisponibles', en: 'Users unavailable' })}
        reason={t({
          fr: 'Le serveur est injoignable ou la requête a échoué.',
          en: 'The server is unreachable or the request failed.',
        })}
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            {t({ fr: 'Réessayer', en: 'Retry' })}
          </Button>
        }
      />
    )
  }

  return (
    <Section
      title={t({ fr: 'Utilisateurs', en: 'Users' })}
      description={t({
        fr: 'Tous les comptes de la plateforme et leurs organisations.',
        en: 'All platform accounts and their organizations.',
      })}
      actions={
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t({ fr: 'Rechercher (e-mail, organisation)…', en: 'Search (email, org)…' })}
          aria-label={t({ fr: 'Rechercher un utilisateur', en: 'Search users' })}
          className="h-8 w-64"
        />
      }
    >
      {/* Annonce du résultat de recherche aux lecteurs d'écran (le DOM bascule liste↔vide). */}
      <p role="status" className="sr-only">
        {t({
          fr: `${filtered.length} compte(s) affiché(s)`,
          en: `${filtered.length} account(s) shown`,
        })}
      </p>
      {data.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t({ fr: 'Aucun utilisateur', en: 'No users' })}
          description={t({
            fr: 'Les comptes créés apparaîtront ici.',
            en: 'Created accounts will appear here.',
          })}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={t({ fr: 'Aucun résultat', en: 'No results' })}
          description={t({
            fr: `Aucun compte ne correspond à « ${query.trim()} ».`,
            en: `No account matches “${query.trim()}”.`,
          })}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t({ fr: 'E-mail', en: 'Email' })}</TableHead>
                <TableHead>{t({ fr: 'Organisations', en: 'Organizations' })}</TableHead>
                <TableHead>{t({ fr: 'Dernière connexion', en: 'Last sign-in' })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{u.email}</span>
                      {u.is_platform_admin ? (
                        <StatusBadge tone="info">
                          {t({ fr: 'Super-admin', en: 'Super-admin' })}
                        </StatusBadge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.memberships.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        u.memberships.map((m) => (
                          <Badge key={m.org_id} variant="secondary" className="font-normal">
                            {m.org} · {t(ROLE_LABEL[m.role] ?? { fr: m.role, en: m.role })}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleDateString(
                          lang === 'en' ? 'en-US' : 'fr-FR',
                        )
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  )
}
