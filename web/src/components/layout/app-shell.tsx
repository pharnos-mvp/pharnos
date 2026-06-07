import { Suspense, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  FlaskConical,
  FolderTree,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
  WifiOff,
} from 'lucide-react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HeaderSlotContext } from '@/components/layout/header-slot'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuditSync } from '@/features/audit/use-audit-sync'
import { useAuth } from '@/features/auth/auth-context'
import { useOrgId } from '@/features/org/org-context'
import { fetchMyMemberships } from '@/features/org/org-repository'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { env } from '@/lib/env'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

const navItems: { to: string; label: Translatable; icon: typeof FlaskConical }[] = [
  { to: '/catalogue', label: { fr: 'Catalogue', en: 'Catalogue' }, icon: FlaskConical },
  { to: '/workspace', label: { fr: 'CTD Workspace', en: 'CTD Workspace' }, icon: FolderTree },
  { to: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' }, icon: LayoutDashboard },
]

const SIDEBAR_KEY = 'pharnos.sidebarCollapsed'

export function AppShell() {
  const online = useOnlineStatus()
  const location = useLocation()
  const { user } = useAuth()
  const orgId = useOrgId()
  const { t } = useI18n()
  useAuditSync(orgId)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const expanded = !collapsed
  // Contenu injecté par la page courante dans le bandeau (titre du dossier, façon Google Docs).
  const [headerSlot, setHeaderSlot] = useState<ReactNode>(null)

  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>
  const displayName =
    [meta.prenom, meta.nom].filter(Boolean).join(' ') || meta.username || user?.email || 'Pharnos'
  const photo = meta.photo
  const { data: memberships } = useQuery({
    queryKey: ['memberships'],
    queryFn: fetchMyMemberships,
    enabled: Boolean(user),
  })
  const orgName = memberships?.find((m) => m.orgId === orgId)?.orgName ?? ''

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <div className="bg-background text-foreground flex min-h-svh">
      <aside
        className={cn(
          'bg-sidebar flex w-16 shrink-0 flex-col border-r p-2 md:p-3',
          expanded && 'md:w-60',
        )}
      >
        <div className="flex items-center gap-2 px-1 py-3 md:px-2">
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md font-bold">
            P
          </div>
          {expanded ? (
            <div className="hidden leading-tight md:block">
              <div className="text-sm font-semibold">Pharnos</div>
              <div className="text-muted-foreground text-xs">RA UEMOA/CEDEAO</div>
            </div>
          ) : null}
        </div>

        <nav className="mt-2 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const text = t(label)
            return (
              <NavLink
                key={to}
                to={to}
                aria-label={text}
                title={text}
                className={({ isActive }) =>
                  cn(
                    buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
                    expanded ? 'justify-center md:justify-start' : 'justify-center',
                  )
                }
              >
                <Icon className="size-4" />
                {expanded ? <span className="hidden md:inline">{text}</span> : null}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          {expanded ? (
            <div className="text-muted-foreground hidden px-2 py-1 text-xs md:block">
              {env.isSupabaseConfigured
                ? t({ fr: 'Backend connecté', en: 'Backend connected' })
                : t({ fr: 'Backend non configuré', en: 'Backend not configured' })}
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={
              expanded ? t({ fr: 'Replier', en: 'Collapse' }) : t({ fr: 'Déplier', en: 'Expand' })
            }
            onClick={toggleSidebar}
          >
            {expanded ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          {headerSlot ? <div className="mr-auto min-w-0 flex-1">{headerSlot}</div> : null}
          <span
            role="status"
            aria-live="polite"
            className={cn(
              'ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
              online ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {online ? t({ fr: 'En ligne', en: 'Online' }) : t({ fr: 'Hors ligne', en: 'Offline' })}
          </span>

          <NavLink
            to="/compte"
            title={t({ fr: 'Mon compte', en: 'My account' })}
            className="hover:bg-accent flex items-center gap-2 rounded-md p-1"
          >
            <div className="hidden text-right leading-tight sm:block">
              <div className="max-w-[160px] truncate text-sm font-medium">{displayName}</div>
              {orgName ? (
                <div className="text-muted-foreground max-w-[160px] truncate text-xs">
                  {orgName}
                </div>
              ) : null}
            </div>
            <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
              {photo ? (
                <img src={photo} alt="" className="size-full object-cover" />
              ) : (
                initials(displayName)
              )}
            </div>
          </NavLink>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <HeaderSlotContext.Provider value={setHeaderSlot}>
            <ErrorBoundary key={location.pathname}>
              <Suspense
                fallback={
                  <div className="text-muted-foreground p-2 text-sm">
                    {t({ fr: 'Chargement…', en: 'Loading…' })}
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </HeaderSlotContext.Provider>
        </main>
      </div>
    </div>
  )
}
