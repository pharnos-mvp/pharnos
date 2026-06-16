import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUpCircle,
  FlaskConical,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from 'lucide-react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HeaderSlotContext } from '@/components/layout/header-slot'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuditSync } from '@/features/audit/use-audit-sync'
import { useAuth } from '@/features/auth/auth-context'
import { useCorrespondenceRealtime } from '@/features/correspondence/use-correspondence-realtime'
import { useOrgId } from '@/features/org/org-context'
import { fetchMyMemberships } from '@/features/org/org-repository'
import { PLAN_LABEL, useOrgPlan } from '@/features/org/use-org-plan'
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
  const { user, signOut } = useAuth()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { t, lang, setLang } = useI18n()
  const { data: plan } = useOrgPlan()
  useAuditSync(orgId)
  // Reviews et messages du correspondant en quasi temps réel, où qu'on soit dans l'app.
  useCorrespondenceRealtime(orgId)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const expanded = !collapsed

  // Page de montage d'un dossier : la barre latérale passe en RAIL d'icônes (mockup CEO —
  // place maximale pour la feuille). Réouverture manuelle possible ; en quittant le montage,
  // retour à la préférence enregistrée.
  const inMontage = /^\/workspace\/[^/]+$/.test(location.pathname)
  useEffect(() => {
    // Synchronisation pilotée par la route — exception légitime à set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(inMontage ? true : localStorage.getItem(SIDEBAR_KEY) === '1')
  }, [inMontage])
  // Contenu injecté par la page courante dans le bandeau (titre du dossier, façon Google Docs).
  const [headerSlot, setHeaderSlot] = useState<ReactNode>(null)

  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>
  // « Nom d'admin » : le nom d'utilisateur choisi prime sur prénom+nom (recette CEO).
  const displayName =
    meta.username || [meta.prenom, meta.nom].filter(Boolean).join(' ') || user?.email || 'Pharnos'
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
    // Hauteur viewport fixe → c'est <main> qui défile (sa scrollbar = scroll global de droite),
    // pendant que la barre latérale et l'en-tête restent figés (modèle « Google Docs »).
    <div className="bg-background text-foreground flex h-svh overflow-hidden">
      <aside
        className={cn(
          'bg-sidebar flex w-16 shrink-0 flex-col border-r p-2 md:p-3',
          expanded && 'md:w-60',
        )}
      >
        <div className="flex items-center gap-2 px-1 py-3 md:px-2">
          <img
            src="/brand/pharnos-logo.svg"
            alt="Pharnos"
            className="size-8 shrink-0 dark:hidden"
          />
          <img
            src="/brand/pharnos-logo-dark.svg"
            alt=""
            aria-hidden="true"
            className="hidden size-8 shrink-0 dark:block"
          />
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

        <div className="mt-auto flex flex-col gap-1.5">
          {expanded ? (
            <div className="text-muted-foreground hidden px-2 py-1 text-xs md:block">
              {env.isSupabaseConfigured
                ? t({ fr: 'Backend connecté', en: 'Backend connected' })
                : t({ fr: 'Backend non configuré', en: 'Backend not configured' })}
            </div>
          ) : null}
          {/* Profil + statut réseau en BAS de la barre (mockup CEO) : pastille de statut sur
              l'avatar en rail ; nom + organisation quand la barre est étendue. */}
          {/* Profil = menu rapide du compte (mockup CEO, façon Claude) : avatar + nom + plan, puis
              Paramètres / Langue / Mettre à niveau / Se déconnecter. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={`${displayName}${orgName ? ` — ${orgName}` : ''} · ${online ? t({ fr: 'En ligne', en: 'Online' }) : t({ fr: 'Hors ligne', en: 'Offline' })}`}
                aria-label={t({ fr: 'Mon compte', en: 'My account' })}
                className="hover:bg-accent flex w-full items-center justify-center gap-2 rounded-md p-1 md:justify-start"
              >
                <span className="relative shrink-0">
                  <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
                    {photo ? (
                      <img src={photo} alt="" className="size-full object-cover" />
                    ) : (
                      initials(displayName)
                    )}
                  </span>
                  <span
                    role="status"
                    aria-label={
                      online
                        ? t({ fr: 'En ligne', en: 'Online' })
                        : t({ fr: 'Hors ligne', en: 'Offline' })
                    }
                    className={cn(
                      'border-sidebar absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2',
                      online ? 'bg-emerald-500' : 'bg-muted-foreground',
                    )}
                  />
                </span>
                {expanded ? (
                  <span className="hidden min-w-0 flex-1 text-left leading-tight md:block">
                    <span className="flex items-center gap-1.5">
                      <span className="max-w-[100px] truncate text-sm font-medium">
                        {displayName}
                      </span>
                      {plan ? (
                        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                          {t(PLAN_LABEL[plan.plan])}
                        </span>
                      ) : null}
                    </span>
                    {orgName ? (
                      <span className="text-muted-foreground block max-w-[150px] truncate text-xs">
                        {orgName}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              {user?.email ? (
                <DropdownMenuLabel className="text-muted-foreground truncate text-xs font-normal">
                  {user.email}
                </DropdownMenuLabel>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/compte')}>
                <Settings2 className="size-4" /> {t({ fr: 'Paramètres', en: 'Settings' })}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Globe className="size-4" /> {t({ fr: 'Langue', en: 'Language' })}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setLang('fr')}>
                    Français {lang === 'fr' ? '✓' : ''}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLang('en')}>
                    English {lang === 'en' ? '✓' : ''}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {plan && plan.plan !== 'enterprise' ? (
                <DropdownMenuItem
                  onClick={() => navigate('/compte', { state: { section: 'abonnement' } })}
                >
                  <ArrowUpCircle className="size-4" />{' '}
                  {t({ fr: "Mettre à niveau l'abonnement", en: 'Upgrade plan' })}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOut className="size-4" /> {t({ fr: 'Se déconnecter', en: 'Sign out' })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        {/* Le bandeau ne porte que le slot de la page (titre + actions — mockup CEO) ; le
            profil et le statut réseau vivent en bas de la barre latérale. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          {headerSlot ? <div className="min-w-0 flex-1">{headerSlot}</div> : null}
        </header>

        {/* tabIndex={0} : la région défilable doit être accessible au clavier (axe
            scrollable-region-focusable) — surtout quand le contenu n'a pas d'élément focusable. */}
        <main tabIndex={0} className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
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
