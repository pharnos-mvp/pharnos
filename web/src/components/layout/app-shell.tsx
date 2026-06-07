import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  FlaskConical,
  FolderTree,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/catalogue', label: 'Catalogue', icon: FlaskConical },
  { to: '/workspace', label: 'CTD Workspace', icon: FolderTree },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/profil-pro', label: 'Profil pro', icon: UserCog },
] as const

const SIDEBAR_KEY = 'pharnos.sidebarCollapsed'

export function AppShell() {
  const online = useOnlineStatus()
  const { user, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const expanded = !collapsed

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return next
    })
  }

  async function handleSignOut() {
    await signOut()
    toast.success('Déconnecté')
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
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
                  expanded ? 'justify-center md:justify-start' : 'justify-center',
                )
              }
            >
              <Icon className="size-4" />
              {expanded ? <span className="hidden md:inline">{label}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          {expanded ? (
            <div className="text-muted-foreground hidden px-2 py-1 text-xs md:block">
              {env.isSupabaseConfigured ? 'Backend connecté' : 'Backend non configuré'}
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={expanded ? 'Replier le menu' : 'Déplier le menu'}
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
        <header className="flex h-14 shrink-0 items-center border-b px-4">
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span
              role="status"
              aria-live="polite"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                online ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              {online ? 'En ligne' : 'Hors ligne'}
            </span>

            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground hidden max-w-[180px] truncate sm:inline">
                  {user.email}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Se déconnecter"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <Suspense fallback={<div className="text-muted-foreground p-2 text-sm">Chargement…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
