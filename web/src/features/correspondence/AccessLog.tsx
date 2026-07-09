import { useEffect, useState } from 'react'

import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'

const fmtAccess = (d: Date, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)

const ACCESS_LABELS: Record<string, Translatable> = {
  open: { fr: 'Ouverture du dossier', en: 'Dossier opened' },
  decide: { fr: 'Décision rendue', en: 'Decision returned' },
  reply: { fr: 'Message envoyé', en: 'Message sent' },
}

interface AccessRow {
  action: string
  ip_hash: string
  user_agent: string | null
  at: string
}

/**
 * Journal d'accès du lien (L1) — qui a consulté/agi, quand, depuis où (IP hashée). Lecture
 * seule via RLS org ; écrit exclusivement par l'Edge `share`. Online-only (traçabilité).
 */
export function AccessLog({ correspondenceId }: { correspondenceId: string }) {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState<AccessRow[] | 'loading' | 'error'>('loading')
  useEffect(() => {
    let cancelled = false
    // Chargement async (fetch on mount) : setState uniquement post-await — exception légitime.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows('loading')
    void (async () => {
      const supabase = await getSupabase()
      if (!supabase) {
        if (!cancelled) setRows('error')
        return
      }
      const { data, error } = await supabase
        .from('share_access_log')
        .select('action, ip_hash, user_agent, at')
        .eq('correspondence_id', correspondenceId)
        .order('at', { ascending: false })
        .limit(50)
      if (!cancelled) setRows(error ? 'error' : ((data ?? []) as AccessRow[]))
    })()
    return () => {
      cancelled = true
    }
  }, [correspondenceId])

  if (rows === 'loading') {
    return (
      <p className="text-muted-foreground p-2 text-xs">
        {t({ fr: 'Chargement du journal…', en: 'Loading the log…' })}
      </p>
    )
  }
  if (rows === 'error') {
    return (
      <p className="text-muted-foreground p-2 text-xs">
        {t({ fr: 'Journal indisponible hors-ligne.', en: 'Log unavailable offline.' })}
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground p-2 text-xs">
        {t({ fr: 'Aucun accès enregistré.', en: 'No access recorded.' })}
      </p>
    )
  }
  return (
    <ul
      className="max-h-40 space-y-1 overflow-auto p-2"
      aria-label={t({ fr: 'Journal d’accès', en: 'Access log' })}
    >
      {rows.map((r, i) => (
        <li key={i} className="text-muted-foreground flex items-baseline gap-2 text-xs">
          <span className="text-foreground shrink-0 font-medium">
            {ACCESS_LABELS[r.action] ? t(ACCESS_LABELS[r.action]!) : r.action}
          </span>
          <span className="shrink-0">{fmtAccess(new Date(r.at), lang)}</span>
          <span className="truncate">
            IP {r.ip_hash}
            {r.user_agent ? ` · ${r.user_agent.split(' ')[0]}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
