import { useEffect, useState } from 'react'
import { Loader2, ScrollText } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Section } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/lib/i18n-context'

import { adminApi, auditActionLabel, auditTone, type AdminAuditEntry } from './admin-api'
import { useAsync } from './use-async'

const PAGE = 50

/**
 * Journal d'audit COMPLET (toutes les organisations) — pagination keyset « Charger plus »
 * (curseur = at+id de la dernière ligne, stable sous insertion) + filtre par organisation.
 * L'Overview n'affiche que les 25 derniers ; ici, tout audit_log est parcourable.
 * `initialOrgFilter` : point d'entrée de test du curseur filtré (le Select Radix ne se pilote
 * pas fiablement en jsdom) — la prod monte toujours sur « all ».
 */
export function AdminJournal({ initialOrgFilter = 'all' }: { initialOrgFilter?: string }) {
  const { t, lang } = useI18n()
  // Liste des orgs pour le filtre (action déjà existante de l'Edge — volume pilote, appel léger).
  const orgs = useAsync(adminApi.orgs)

  const [orgFilter, setOrgFilter] = useState<string>(initialOrgFilter)
  // `null` = première page en cours de chargement (skeleton).
  const [entries, setEntries] = useState<AdminAuditEntry[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true
    adminApi
      .audit({ limit: PAGE, orgId: orgFilter === 'all' ? undefined : orgFilter })
      .then((rows) => {
        if (!active) return
        setEntries(rows)
        setHasMore(rows.length === PAGE)
      })
      .catch((e: Error) => {
        if (active) setError(e)
      })
    return () => {
      active = false
    }
  }, [orgFilter, nonce])

  // Reset via gestionnaires d'évènements (jamais de setState synchrone dans l'effet).
  function changeFilter(v: string) {
    setEntries(null)
    setError(null)
    setOrgFilter(v)
  }
  function retry() {
    setEntries(null)
    setError(null)
    setNonce((n) => n + 1)
  }

  async function loadMore() {
    if (!entries || loadingMore) return
    const last = entries.at(-1)
    if (!last) return
    setLoadingMore(true)
    try {
      const rows = await adminApi.audit({
        limit: PAGE,
        beforeAt: last.at,
        beforeId: last.id,
        orgId: orgFilter === 'all' ? undefined : orgFilter,
      })
      setEntries((prev) => [...(prev ?? []), ...rows])
      setHasMore(rows.length === PAGE)
    } catch {
      toast.error(t({ fr: 'Chargement de la suite échoué', en: 'Failed to load more' }))
    } finally {
      setLoadingMore(false)
    }
  }

  if (error) {
    return (
      <ErrorState
        title={t({ fr: 'Journal indisponible', en: 'Audit log unavailable' })}
        reason={t({
          fr: 'Le serveur est injoignable ou la requête a échoué.',
          en: 'The server is unreachable or the request failed.',
        })}
        action={
          <Button size="sm" variant="outline" onClick={retry}>
            {t({ fr: 'Réessayer', en: 'Retry' })}
          </Button>
        }
      />
    )
  }

  return (
    <Section
      title={t({ fr: "Journal d'audit complet", en: 'Full audit log' })}
      description={t({
        fr: `Toutes les actions, toutes les organisations — par pages de ${PAGE}, du plus récent au plus ancien.`,
        en: `Every action across all organizations — pages of ${PAGE}, newest first.`,
      })}
      actions={
        <Select value={orgFilter} onValueChange={changeFilter}>
          <SelectTrigger
            size="sm"
            className="w-56"
            aria-label={t({ fr: 'Filtrer par organisation', en: 'Filter by organization' })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t({ fr: 'Toutes les organisations', en: 'All organizations' })}
            </SelectItem>
            {(orgs.data ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {entries === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={t({ fr: 'Aucune entrée', en: 'No entries' })}
          description={t({
            fr: 'Aucune action enregistrée pour ce périmètre.',
            en: 'No recorded actions for this scope.',
          })}
        />
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {entries.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 text-sm">
                <StatusBadge tone={auditTone(a.action)}>
                  {t(auditActionLabel(a.action))}
                </StatusBadge>
                <span className="min-w-0 flex-1 truncate" title={a.label || a.action}>
                  {a.label || a.action}
                </span>
                <span className="text-muted-foreground hidden max-w-40 shrink-0 truncate text-xs lg:inline">
                  {a.org_name ?? '—'}
                </span>
                <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                  {a.actor_email}
                </span>
                <time className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {new Date(a.at).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}
                </time>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-center pt-1">
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                {t({ fr: 'Charger plus', en: 'Load more' })}
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">
                {t({ fr: 'Fin du journal.', en: 'End of log.' })}
              </span>
            )}
          </div>
        </>
      )}
    </Section>
  )
}
