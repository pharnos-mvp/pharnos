import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpCircle,
  Bell,
  ClipboardList,
  FlaskConical,
  FolderTree,
  Globe,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sun,
  SunMoon,
} from 'lucide-react'
import { toast } from 'sonner'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AppFooter } from '@/components/layout/AppFooter'
import { HeaderSlotContext } from '@/components/layout/header-slot'
import { TopbarConfigContext, type TopbarConfig } from '@/components/layout/topbar'
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAuditSync } from '@/features/audit/use-audit-sync'
import { useAuth } from '@/features/auth/auth-context'
import { useCorrespondenceRealtime } from '@/features/correspondence/use-correspondence-realtime'
import { useOrgId } from '@/features/org/org-context'
import { fetchMyMemberships } from '@/features/org/org-repository'
import { PLAN_LABEL, useOrgPlan } from '@/features/org/use-org-plan'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { setSyncEnabledCache } from '@/lib/sync-prefs'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

const navItems: { to: string; label: Translatable; icon: typeof FlaskConical }[] = [
  { to: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' }, icon: LayoutDashboard },
  { to: '/catalogue', label: { fr: 'Catalogue', en: 'Catalogue' }, icon: FlaskConical },
  { to: '/workspace', label: { fr: 'CTD Workspace', en: 'CTD Workspace' }, icon: FolderTree },
  { to: '/templates', label: { fr: 'Bibliothèque', en: 'Templates' }, icon: Library },
  { to: '/variations', label: { fr: 'Variations', en: 'Variations' }, icon: ClipboardList },
]

// Titre de page affiché dans la topbar (mockup), par préfixe de route.
const PAGE_TITLES: { prefix: string; label: Translatable }[] = [
  { prefix: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
  { prefix: '/catalogue', label: { fr: 'Catalogue', en: 'Catalogue' } },
  { prefix: '/workspace', label: { fr: 'CTD Workspace', en: 'CTD Workspace' } },
  { prefix: '/templates', label: { fr: 'Bibliothèque', en: 'Templates' } },
  { prefix: '/variations', label: { fr: 'Variations', en: 'Variations' } },
  { prefix: '/compte', label: { fr: 'Compte', en: 'Account' } },
  { prefix: '/admin', label: { fr: 'Administration', en: 'Admin' } },
]

const SIDEBAR_KEY = 'pharnos.sidebarCollapsed'

// Accès défensifs : `localStorage` peut être indisponible (mode privé Safari, iframe sandbox,
// stockage désactivé) — comme `readLang` (i18n-context), on ne laisse jamais une lecture/écriture
// de préférence faire planter le shell.
function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}
function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  } catch {
    /* stockage indisponible — préférence non persistée, non bloquant */
  }
}

export function AppShell() {
  const online = useOnlineStatus()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { t, lang, setLang } = useI18n()
  // Thème clair/sombre (next-themes, `attribute="class"`). `resolvedTheme` = thème EFFECTIF (résout
  // « system ») → sert à marquer le bouton actif, même si le réglage est encore « system ».
  const { setTheme, resolvedTheme } = useTheme()
  const { data: plan } = useOrgPlan()
  useAuditSync(orgId)
  // Reviews et messages du correspondant en quasi temps réel, où qu'on soit dans l'app.
  useCorrespondenceRealtime(orgId)
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)
  const expanded = !collapsed
  // Menu PRINCIPAL en tiroir sous `lg` (refonte responsive tablette/mobile) : la barre latérale
  // est masquée < lg ; un ☰ dans l'en-tête ouvre la nav (navItems + compte) dans un Sheet gauche.
  const [navOpen, setNavOpen] = useState(false)
  // Ferme le tiroir à chaque changement de route (clic d'un lien, retour navigateur…).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavOpen(false)
  }, [location.pathname])

  // Page de montage d'un dossier : la barre latérale passe en RAIL d'icônes (mockup CEO —
  // place maximale pour la feuille). Réouverture manuelle possible ; en quittant le montage,
  // retour à la préférence enregistrée.
  const inMontage = /^\/workspace\/[^/]+$/.test(location.pathname)
  // Fond « canvas » gris premium (#f9fafb) — les surfaces de la DA où des cartes blanches doivent
  // ressortir : Dashboard + tout le Catalogue (liste Produits, wizard de création, fiche cockpit).
  const onCanvas =
    location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/catalogue')
  useEffect(() => {
    // Synchronisation pilotée par la route — exception légitime à set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(inMontage ? true : readSidebarCollapsed())
  }, [inMontage])
  // Contenu injecté par la page courante dans le bandeau (titre du dossier, façon Google Docs).
  const [headerSlot, setHeaderSlot] = useState<ReactNode>(null)
  // Config de topbar posée par la page courante (titre, bouton retour, recherche masquée) — sans
  // remplacer langue/thème/notifications (≠ headerSlot plein du cockpit).
  const [topbar, setTopbar] = useState<TopbarConfig>({})

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
  const pageTitle = PAGE_TITLES.find((x) => location.pathname.startsWith(x.prefix))?.label ?? {
    fr: 'Pharnos',
    en: 'Pharnos',
  }

  // Cache du choix de synchro cloud de l'org → lu par les modules de sync (non-React) pour le gate opt-in.
  const syncEnabled = plan?.sync_enabled
  useEffect(() => {
    if (orgId && syncEnabled !== undefined) setSyncEnabledCache(orgId, syncEnabled)
  }, [orgId, syncEnabled])

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c
      writeSidebarCollapsed(next)
      return next
    })
  }

  return (
    // Hauteur viewport fixe → c'est <main> qui défile (sa scrollbar = scroll global de droite),
    // pendant que la barre latérale et l'en-tête restent figés (modèle « Google Docs »).
    <div className="bg-background text-foreground flex h-svh overflow-hidden">
      {/* Barre latérale : visible ≥ lg uniquement (desktop inchangé) ; < lg → tiroir ☰ (refonte responsive). */}
      <aside
        className={cn(
          'bg-sidebar border-sidebar-border hidden w-16 shrink-0 flex-col border-r p-2 md:p-3 lg:flex',
          expanded && 'md:w-52',
        )}
      >
        <div className="flex items-center gap-2 px-1 py-3 md:px-2">
          {/* Barre navy dans les deux thèmes → logo BLANC (variante « dark ») partout. */}
          <img src="/brand/pharnos-logo-dark.svg" alt="Pharnos" className="size-8 shrink-0" />
          {expanded ? (
            <div className="hidden leading-tight md:block">
              <div className="font-display text-[17px] font-bold tracking-[-0.3px] text-white">
                Pharnos
              </div>
              <div className="text-sidebar-foreground/60 text-[11px]">RA UEMOA/CEDEAO</div>
            </div>
          ) : null}
        </div>

        <nav
          aria-label={t({ fr: 'Navigation principale', en: 'Main navigation' })}
          className="mt-3 flex flex-col gap-0.5"
        >
          {navItems.map(({ to, label, icon: Icon }) => {
            const text = t(label)
            return (
              <NavLink
                key={to}
                to={to}
                aria-label={text}
                title={text}
                className={cn(
                  // Nav sur fond NAVY : mutée par défaut, active = fond bleu tinté + barre d'accent
                  // gauche + texte blanc. État actif ciblé via aria-current (posé par NavLink) → pas
                  // par la couleur seule (a11y 1.4.1 : barre + graisse + aria-current cumulés).
                  'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors',
                  'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white',
                  'aria-[current=page]:bg-sidebar-primary/15 aria-[current=page]:font-medium aria-[current=page]:text-white',
                  expanded ? 'justify-center md:justify-start' : 'justify-center',
                )}
              >
                <span className="bg-sidebar-primary absolute top-1/2 left-0 hidden h-5 w-0.5 -translate-y-1/2 rounded-r group-aria-[current=page]:block" />
                <Icon className="size-4 shrink-0" />
                {expanded ? <span className="hidden md:inline">{text}</span> : null}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1.5">
          {/* Profil = menu compte (avatar + nom + plan, statut réseau). Reste EN BAS de la barre
              latérale (le profil ne se déplace pas — choix CEO). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={`${displayName}${orgName ? ` — ${orgName}` : ''} · ${online ? t({ fr: 'En ligne', en: 'Online' }) : t({ fr: 'Hors ligne', en: 'Offline' })}`}
                aria-label={t({ fr: 'Mon compte', en: 'My account' })}
                className="hover:bg-sidebar-accent text-sidebar-foreground flex w-full items-center justify-center gap-2 rounded-md p-1 md:justify-start"
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
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                          {t(PLAN_LABEL[plan.plan])}
                        </span>
                      ) : null}
                    </span>
                    {orgName ? (
                      <span className="text-sidebar-foreground/55 block max-w-[150px] truncate text-xs">
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
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunMoon className="size-4" /> {t({ fr: 'Thème', en: 'Theme' })}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme('light')}>
                    <Sun className="size-4" /> {t({ fr: 'Clair', en: 'Light' })}{' '}
                    {resolvedTheme === 'light' ? '✓' : ''}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    <Moon className="size-4" /> {t({ fr: 'Sombre', en: 'Dark' })}{' '}
                    {resolvedTheme === 'dark' ? '✓' : ''}
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
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hidden hover:text-white md:inline-flex"
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
        {/* Topbar (mockup CEO) : titre de page + recherche + langue + copilote + notifications +
            compte. Sur le montage de dossier, le slot de page reprend la main (titre + actions). */}
        <header className="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-4 md:gap-3 md:px-6">
          {/* ☰ — ouvre le menu principal en tiroir < lg (la barre latérale est masquée). */}
          <button
            type="button"
            aria-label={t({ fr: 'Ouvrir le menu', en: 'Open menu' })}
            aria-expanded={navOpen}
            aria-controls="app-nav-drawer"
            onClick={() => setNavOpen(true)}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'size-11 shrink-0 lg:hidden',
            )}
          >
            <Menu className="size-5" />
          </button>

          {headerSlot ? (
            <div className="min-w-0 flex-1">{headerSlot}</div>
          ) : (
            <>
              {/* Bouton retour optionnel (posé par la page via useTopbar), à gauche du titre. */}
              {topbar.backTo ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t({ fr: 'Retour', en: 'Back' })}
                  onClick={() => navigate(topbar.backTo as string)}
                  className="-ml-1 shrink-0"
                >
                  <ArrowLeft className="size-4" />
                </Button>
              ) : null}
              <div className="font-display min-w-0 flex-1 truncate text-base font-bold">
                {topbar.title ?? t(pageTitle)}
              </div>

              {/* Recherche globale — placeholder propre (non câblée → toast « bientôt »). Masquée
                  sur les pages qui ont leur propre recherche (évite deux champs sur un écran). */}
              {topbar.searchHidden ? null : (
                <button
                  type="button"
                  onClick={() =>
                    toast(t({ fr: 'Recherche bientôt disponible.', en: 'Search coming soon.' }))
                  }
                  aria-label={t({ fr: 'Rechercher (bientôt)', en: 'Search (coming soon)' })}
                  className="bg-background text-muted-foreground hover:border-input hidden h-9 w-60 items-center gap-2 rounded-lg border px-3 text-[13px] md:flex"
                >
                  <Search className="size-4 shrink-0" />
                  <span className="truncate">
                    {t({
                      fr: 'Rechercher produits, documents, pays…',
                      en: 'Search products, documents, countries…',
                    })}
                  </span>
                </button>
              )}

              {/* Langue (câblée) + thème (câblé) + notifications (placeholder) — desktop. */}
              <div className="hidden items-center gap-2 lg:flex">
                <button
                  type="button"
                  onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
                  aria-label={t({ fr: 'Changer de langue', en: 'Change language' })}
                  className="hover:bg-accent rounded-md border px-2.5 py-1 text-xs font-medium"
                >
                  {lang === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  aria-label={t({ fr: 'Changer de thème', en: 'Toggle theme' })}
                  title={t({ fr: 'Thème clair / sombre', en: 'Light / dark theme' })}
                  className="text-muted-foreground hover:bg-accent inline-flex size-9 items-center justify-center rounded-md border"
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    toast(
                      t({
                        fr: 'Notifications bientôt disponibles.',
                        en: 'Notifications coming soon.',
                      }),
                    )
                  }
                  aria-label={t({
                    fr: 'Notifications (bientôt)',
                    en: 'Notifications (coming soon)',
                  })}
                  className="text-muted-foreground hover:bg-accent relative inline-flex size-9 items-center justify-center rounded-md border"
                >
                  <Bell className="size-4" />
                  <span className="border-background absolute top-1.5 right-1.5 size-2 rounded-full border bg-red-500" />
                </button>
              </div>
            </>
          )}
        </header>

        {/* Tiroir du menu principal (< lg) : nav primaire + compte/statut. Portalisé (Radix) →
            hors du flux ; fermé ≥ lg (la barre latérale reprend la main). */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            side="left"
            id="app-nav-drawer"
            className="flex w-72 max-w-[86vw] flex-col p-0"
          >
            <SheetHeader className="border-b">
              <SheetTitle className="flex items-center gap-2">
                <img
                  src="/brand/pharnos-logo.svg"
                  alt=""
                  aria-hidden
                  className="size-7 dark:hidden"
                />
                <img
                  src="/brand/pharnos-logo-dark.svg"
                  alt=""
                  aria-hidden
                  className="hidden size-7 dark:block"
                />
                <span>Pharnos</span>
              </SheetTitle>
            </SheetHeader>

            <nav
              aria-label={t({ fr: 'Navigation principale', en: 'Main navigation' })}
              className="flex flex-col gap-1 p-2"
            >
              {navItems.map(({ to, label, icon: Icon }) => {
                const text = t(label)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
                        'h-11 justify-start',
                      )
                    }
                  >
                    <Icon className="size-4" /> <span>{text}</span>
                  </NavLink>
                )
              })}
            </nav>

            {/* Compte + statut réseau (parité avec le bas de la barre latérale). */}
            <div className="mt-auto flex flex-col gap-1 border-t p-2">
              <div className="flex items-center gap-2 px-2 py-1.5">
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
                      'border-card absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2',
                      online ? 'bg-emerald-500' : 'bg-muted-foreground',
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{displayName}</span>
                    {plan ? (
                      <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                        {t(PLAN_LABEL[plan.plan])}
                      </span>
                    ) : null}
                  </span>
                  {orgName ? (
                    <span className="text-muted-foreground block truncate text-xs">{orgName}</span>
                  ) : null}
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/compte')}
                className="hover:bg-accent flex h-11 items-center gap-2 rounded-md px-2 text-sm"
              >
                <Settings2 className="size-4" /> {t({ fr: 'Paramètres', en: 'Settings' })}
              </button>
              <div className="flex h-11 items-center gap-2 px-2 text-sm">
                <Globe className="size-4 shrink-0" />
                <span className="text-muted-foreground">{t({ fr: 'Langue', en: 'Language' })}</span>
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => setLang('fr')}
                    aria-pressed={lang === 'fr'}
                    className={cn(
                      'rounded px-2 py-1 text-xs font-medium',
                      lang === 'fr' ? 'bg-secondary' : 'hover:bg-accent',
                    )}
                  >
                    FR
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    aria-pressed={lang === 'en'}
                    className={cn(
                      'rounded px-2 py-1 text-xs font-medium',
                      lang === 'en' ? 'bg-secondary' : 'hover:bg-accent',
                    )}
                  >
                    EN
                  </button>
                </span>
              </div>
              <div className="flex h-11 items-center gap-2 px-2 text-sm">
                <SunMoon className="size-4 shrink-0" />
                <span className="text-muted-foreground">{t({ fr: 'Thème', en: 'Theme' })}</span>
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    aria-pressed={resolvedTheme === 'light'}
                    aria-label={t({ fr: 'Thème clair', en: 'Light theme' })}
                    className={cn(
                      'flex items-center rounded px-2 py-1',
                      resolvedTheme === 'light' ? 'bg-secondary' : 'hover:bg-accent',
                    )}
                  >
                    <Sun className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    aria-pressed={resolvedTheme === 'dark'}
                    aria-label={t({ fr: 'Thème sombre', en: 'Dark theme' })}
                    className={cn(
                      'flex items-center rounded px-2 py-1',
                      resolvedTheme === 'dark' ? 'bg-secondary' : 'hover:bg-accent',
                    )}
                  >
                    <Moon className="size-4" />
                  </button>
                </span>
              </div>
              {plan && plan.plan !== 'enterprise' ? (
                <button
                  type="button"
                  onClick={() => navigate('/compte', { state: { section: 'abonnement' } })}
                  className="hover:bg-accent flex h-11 items-center gap-2 rounded-md px-2 text-sm"
                >
                  <ArrowUpCircle className="size-4" />{' '}
                  {t({ fr: "Mettre à niveau l'abonnement", en: 'Upgrade plan' })}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                className="hover:bg-accent flex h-11 items-center gap-2 rounded-md px-2 text-sm"
              >
                <LogOut className="size-4" /> {t({ fr: 'Se déconnecter', en: 'Sign out' })}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* tabIndex={0} : la région défilable doit être accessible au clavier (axe
            scrollable-region-focusable) — surtout quand le contenu n'a pas d'élément focusable. */}
        {/* PAS de padding-top sur le conteneur de scroll : sinon les barres `sticky top-0` des
            pages (Bibliothèque, CTD builder) collent SOUS ce padding → bande transparente entre le
            header et la barre, où le contenu défile (signalé par le CEO). Sans padding-top, elles
            collent FLUSH sous le header. Le contenu démarre sous la bordure du header ; une page
            ajoute son propre `pt-*` si elle veut de la respiration (sans barre sticky). */}
        <main
          tabIndex={0}
          className={cn(
            'min-w-0 flex-1 overflow-auto px-4 pb-4 md:px-6 md:pb-6',
            // Dashboard : fond « canvas » gris clair (mockup gray50 #f9fafb) → les cartes blanches
            // ressortent avec leurs ombres/hover. En sombre : transparent → canvas GitHub du parent.
            onCanvas && 'bg-[#f9fafb] dark:bg-transparent',
          )}
        >
          <HeaderSlotContext.Provider value={setHeaderSlot}>
            <TopbarConfigContext.Provider value={setTopbar}>
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
            </TopbarConfigContext.Provider>
          </HeaderSlotContext.Provider>
        </main>
        {/* Pied de page SOBRE — fine barre persistante SOUS le contenu, sur TOUTES les pages
            (montage CTD inclus) → landmark contentinfo cohérent (a11y) + l'app ne « colle » pas
            au bas de l'écran. Hors de <main> : ne touche pas la hauteur fixe du montage. */}
        <AppFooter />
      </div>
    </div>
  )
}
