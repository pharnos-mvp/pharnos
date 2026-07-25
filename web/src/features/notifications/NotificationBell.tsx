import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  Clock,
  FileText,
  Inbox,
  Mail,
  RefreshCw,
  ScrollText,
  Send,
  type LucideIcon,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { docTypeLabel } from '@/features/catalogue/doc-types'
import type { ActionItem, ActionKind } from '@/features/dashboard/dashboard-data'
import { useOrgId } from '@/features/org/org-context'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { formatRelative, type NotifEnvoye, type SentKind } from './notifications-data'
import { markNotificationsRead, useNotifications } from './use-notifications'

type Tone = 'danger' | 'warning' | 'info' | 'success'

const TONE_CLS: Record<Tone, string> = {
  danger: 'bg-danger-subtle text-danger-subtle-foreground',
  warning: 'bg-warning-subtle text-warning-subtle-foreground',
  info: 'bg-info-subtle text-info-subtle-foreground',
  success: 'bg-success-subtle text-success-subtle-foreground',
}

const RECU_META: Record<ActionKind, { icon: LucideIcon; tone: Tone; label: Translatable }> = {
  doc_expired: {
    icon: AlertTriangle,
    tone: 'danger',
    label: { fr: 'Pièce expirée', en: 'Document expired' },
  },
  doc_expiring: {
    icon: RefreshCw,
    tone: 'warning',
    label: { fr: 'Pièce à renouveler', en: 'Document to renew' },
  },
  dossier_suspended: {
    icon: FileText,
    tone: 'warning',
    label: { fr: 'Complément demandé', en: 'Additional info requested' },
  },
  unread_reply: {
    icon: Mail,
    tone: 'info',
    label: { fr: 'Réponse de l’agence', en: 'Agency reply' },
  },
  agency_pending: {
    icon: Clock,
    tone: 'info',
    label: { fr: 'En attente de l’agence', en: 'Awaiting agency' },
  },
  non_conform: {
    icon: AlertCircle,
    tone: 'danger',
    label: { fr: 'Document non conforme', en: 'Non-compliant' },
  },
  ref_update: {
    icon: ScrollText,
    tone: 'info',
    label: { fr: 'Référentiel à adopter', en: 'Reference data to adopt' },
  },
}

const SENT_META: Record<SentKind, { icon: LucideIcon; label: Translatable; tag?: Translatable }> = {
  reminder_auto: {
    icon: Send,
    label: { fr: 'Relance envoyée', en: 'Reminder sent' },
    tag: { fr: 'Auto', en: 'Auto' },
  },
  reminder_manual: {
    icon: Send,
    label: { fr: 'Relance envoyée', en: 'Reminder sent' },
    tag: { fr: 'Manuel', en: 'Manual' },
  },
  deposited: { icon: Check, label: { fr: 'Dossier finalisé', en: 'Dossier finalised' } },
  submitted: { icon: Send, label: { fr: 'Soumission effectuée', en: 'Submission done' } },
  authority_response: {
    icon: Mail,
    label: { fr: 'Réponse envoyée à l’agence', en: 'Response sent to agency' },
  },
}

export function NotificationBell() {
  const orgId = useOrgId()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const vm = useNotifications(orgId)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'recu' | 'envoye'>('recu')

  const unread = vm?.unread ?? 0
  const now = new Date()
  const fmtRel = (iso?: string) => (iso ? formatRelative(iso, now, lang) : '')

  function go(href: string) {
    setOpen(false)
    navigate(href)
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Ouvrir la cloche acquitte les items « à traiter » courants (badge → 0), par appareil.
        if (o && vm && vm.unread > 0) void markNotificationsRead(vm.recu)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0
              ? t({
                  fr: `Notifications, ${unread} à traiter`,
                  en: `Notifications, ${unread} to handle`,
                })
              : t({ fr: 'Notifications', en: 'Notifications' })
          }
          className="text-muted-foreground hover:bg-accent relative inline-flex size-9 items-center justify-center rounded-md border"
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="bg-danger absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        role="dialog"
        aria-label={t({ fr: 'Notifications', en: 'Notifications' })}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-[380px] max-w-[92vw] p-0"
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="font-display text-sm font-semibold">
            {t({ fr: 'Notifications', en: 'Notifications' })}
          </span>
          {tab === 'recu' && vm && vm.recu.length > 0 ? (
            <button
              type="button"
              onClick={() => void markNotificationsRead(vm.recu)}
              className="text-info text-xs hover:underline"
            >
              {t({ fr: 'Tout marquer lu', en: 'Mark all read' })}
            </button>
          ) : null}
        </div>

        <div className="flex gap-1 px-3 pb-2">
          <TabButton active={tab === 'recu'} onClick={() => setTab('recu')}>
            {t({ fr: 'Reçu', en: 'Received' })}
            {unread > 0 ? ` · ${unread}` : ''}
          </TabButton>
          <TabButton active={tab === 'envoye'} onClick={() => setTab('envoye')}>
            {t({ fr: 'Envoyé', en: 'Sent' })}
          </TabButton>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto border-t">
          {vm === undefined ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              {t({ fr: 'Chargement…', en: 'Loading…' })}
            </p>
          ) : tab === 'recu' ? (
            vm.recu.length === 0 ? (
              <EmptyRow
                icon={<Check />}
                text={t({ fr: 'Rien à traiter — tout est à jour.', en: 'Nothing to handle.' })}
              />
            ) : (
              vm.recu.map((it) => (
                <RecuRow key={it.id} item={it} lang={lang} t={t} onGo={go} fmtRel={fmtRel} />
              ))
            )
          ) : vm.envoye.length === 0 ? (
            <EmptyRow
              icon={<Inbox />}
              text={t({ fr: 'Aucun envoi récent.', en: 'No recent activity.' })}
            />
          ) : (
            vm.envoye.map((it) => (
              <EnvoyeRow key={it.id} item={it} t={t} onGo={go} fmtRel={fmtRel} />
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-muted-foreground text-xs">
            {t({
              fr: 'Relances e-mail : selon ta config',
              en: 'Email reminders: per your settings',
            })}
          </span>
          <button
            type="button"
            onClick={() => go('/relances')}
            className="text-info text-xs hover:underline"
          >
            {t({ fr: 'Gérer les relances →', en: 'Manage reminders →' })}
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
        active
          ? 'bg-info-subtle text-info-subtle-foreground'
          : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

function Row({
  icon,
  iconCls,
  title,
  sub,
  right,
  onClick,
}: {
  icon: LucideIcon
  iconCls: string
  title: ReactNode
  sub: ReactNode
  right?: ReactNode
  onClick: () => void
}) {
  const Icon = icon
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent flex w-full items-center gap-3 border-t px-4 py-2.5 text-left first:border-t-0"
    >
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', iconCls)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{title}</span>
        <span className="text-muted-foreground block truncate text-xs">{sub}</span>
      </span>
      {right ? <span className="shrink-0">{right}</span> : null}
    </button>
  )
}

function RecuRow({
  item,
  lang,
  t,
  onGo,
  fmtRel,
}: {
  item: ActionItem
  lang: 'fr' | 'en'
  t: (x: Translatable) => string
  onGo: (href: string) => void
  fmtRel: (iso?: string) => string
}) {
  const meta = RECU_META[item.kind]
  const title = item.docType ? `${item.label} · ${docTypeLabel(item.docType, lang)}` : item.label
  const parts = [t(meta.label), fmtRel(item.date)].filter(Boolean)
  return (
    <Row
      icon={meta.icon}
      iconCls={TONE_CLS[meta.tone]}
      title={title}
      sub={parts.join(' · ')}
      onClick={() => onGo(item.href)}
    />
  )
}

function EnvoyeRow({
  item,
  t,
  onGo,
  fmtRel,
}: {
  item: NotifEnvoye
  t: (x: Translatable) => string
  onGo: (href: string) => void
  fmtRel: (iso?: string) => string
}) {
  const meta = SENT_META[item.kind]
  return (
    <Row
      icon={meta.icon}
      iconCls="bg-muted text-muted-foreground"
      title={t(meta.label)}
      sub={[item.label, fmtRel(item.at)].filter(Boolean).join(' · ')}
      right={
        meta.tag ? (
          <span className="text-muted-foreground rounded-md border px-1.5 py-0.5 text-[10px]">
            {t(meta.tag)}
          </span>
        ) : null
      }
      onClick={() => onGo(item.href)}
    />
  )
}

function EmptyRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-8 text-center text-sm">
      <span className="[&_svg]:size-6">{icon}</span>
      {text}
    </div>
  )
}
