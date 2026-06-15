import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useI18n } from '@/lib/i18n-context'

import { adminApi } from './admin-api'
import { useAsync } from './use-async'

const ROLE_LABEL: Record<string, { fr: string; en: string }> = {
  admin: { fr: 'Admin', en: 'Admin' },
  ra_officer: { fr: 'Éditeur', en: 'Editor' },
  reviewer: { fr: 'Lecteur', en: 'Reader' },
}

export function AdminUsers() {
  const { t } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.users)

  if (loading && !data) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t({ fr: 'Chargement…', en: 'Loading…' })}
      </p>
    )
  }
  if (error || !data) {
    return (
      <div className="flex items-center gap-3 p-4 text-sm">
        <span className="text-muted-foreground">
          {t({ fr: 'Erreur de chargement.', en: 'Failed to load.' })}
        </span>
        <Button size="sm" variant="outline" onClick={reload}>
          {t({ fr: 'Réessayer', en: 'Retry' })}
        </Button>
      </div>
    )
  }

  return (
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
          {data.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span className="truncate">{u.email}</span>
                  {u.is_platform_admin ? (
                    <Badge variant="default" className="shrink-0">
                      {t({ fr: 'Super-admin', en: 'Super-admin' })}
                    </Badge>
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
                {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
