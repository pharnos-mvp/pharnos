import { Suspense, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router'

import { Providers } from '@/app/providers'
import { AppRoutes } from '@/app/routes'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { useCurrentOrg } from '@/features/org/use-current-org'
import { env } from '@/lib/env'
import { useI18n } from '@/lib/i18n-context'
import { lazyChunk } from '@/lib/lazy-chunk'
import { LOCAL_ORG_ID } from '@/lib/session'

const LoginPage = lazyChunk(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const PublicReviewPage = lazyChunk(() =>
  import('@/features/correspondence/public/PublicReviewPage').then((m) => ({
    default: m.PublicReviewPage,
  })),
)
// Page d'après-paiement (U3) — chunk séparé : elle embarque la lecture des PDF, et le reste de
// l'app n'a aucune raison de la charger. La reconnaissance de caractères, elle, se charge encore
// plus tard, et seulement sur un scan.
const PublicUpgradePage = lazyChunk(() =>
  import('@/features/upgrade/PublicUpgradePage').then((m) => ({
    default: m.PublicUpgradePage,
  })),
)
const ResetPasswordPage = lazyChunk(() =>
  import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const OnboardingPage = lazyChunk(() =>
  import('@/features/org/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
)
// Console admin Pharnos (jalon M) — chunk séparé, chargé uniquement sur /admin. Elle s'auto-protège
// (l'Edge `admin` refuse les non super-admins → écran « accès refusé »).
const AdminConsole = lazyChunk(() =>
  import('@/features/admin/AdminConsole').then((m) => ({ default: m.AdminConsole })),
)
// Acceptation d'invitation d'équipe (jalon M4) — chunk séparé, chargé uniquement sur /invite/{token}.
const InvitePage = lazyChunk(() =>
  import('@/features/team/InvitePage').then((m) => ({ default: m.InvitePage })),
)

function FullScreenLoader() {
  const { t } = useI18n()
  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
      {t({ fr: 'Chargement…', en: 'Loading…' })}
    </div>
  )
}

/**
 * Écran de tête (hors app-shell). L'`ErrorBoundary` est INDISPENSABLE ici : `/`, `/admin`,
 * `/invite/…`, `/r/…` et la réinitialisation de mot de passe vivent en dehors de l'app-shell, donc
 * en dehors de SA frontière d'erreur. Sans elle, un chunk qui ne se charge pas laissait une page
 * définitivement blanche — la panne exacte remontée en production (juillet 2026).
 */
function Screen({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fullScreen>
      <Suspense fallback={<FullScreenLoader />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

function OrgScopedRoutes({ orgId }: { orgId: string }) {
  return (
    <OrgContext.Provider value={orgId}>
      <AppRoutes />
    </OrgContext.Provider>
  )
}

function AuthedApp() {
  const { loading, orgId, refresh } = useCurrentOrg()

  if (loading) return <FullScreenLoader />
  if (!orgId) {
    return (
      <Screen>
        <OnboardingPage onCreated={refresh} />
      </Screen>
    )
  }
  return <OrgScopedRoutes orgId={orgId} />
}

function AppGate() {
  const { loading, session, recovery } = useAuth()

  // Mode local/offline (pas de backend configuré) : pas d'auth, org locale.
  if (!env.isSupabaseConfigured) return <OrgScopedRoutes orgId={LOCAL_ORG_ID} />

  if (loading) return <FullScreenLoader />

  // Lien « mot de passe oublié » : on impose l'écran de reset avant tout (la session
  // de récupération est active, donc ce test précède celui de `session`).
  if (recovery) {
    return (
      <Screen>
        <ResetPasswordPage />
      </Screen>
    )
  }

  if (!session) {
    return (
      <Screen>
        <LoginPage />
      </Screen>
    )
  }

  // Acceptation d'invitation : l'utilisateur connecté accepte (l'e-mail doit correspondre). Avant
  // ce point, `!session` a déjà renvoyé LoginPage — après connexion, on retombe ici et on accepte.
  const inviteToken = /^\/invite\/([A-Za-z0-9_-]{43})\/?$/.exec(window.location.pathname)?.[1]
  if (inviteToken) {
    return (
      <Screen>
        <InvitePage token={inviteToken} />
      </Screen>
    )
  }

  // Console admin plateforme (hors shell RA org-scoped) — réservée aux super-admins Pharnos.
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <Screen>
        <AdminConsole />
      </Screen>
    )
  }

  return <AuthedApp />
}

// Page publique de review `/r/{token}` (jalon H) : AUCUNE auth/org/sync — le reviewer n'a pas
// de compte, le token est l'authentification (vérifiée par l'Edge `share`). Évaluée une fois au
// chargement : la page est autonome (pas de navigation interne). Format STRICT 43 caractères
// base64url — même contrat que l'Edge (`share-auth.ts`).
const shareToken = /^\/r\/([A-Za-z0-9_-]{43})\/?$/.exec(window.location.pathname)?.[1] ?? null

// Page publique d'après-paiement `/u/{token}` (U3) : MÊME patron que `/r/{token}` ci-dessus, et
// pour la même raison — l'acheteur n'a pas de compte. Ni `AuthProvider`, ni `BrowserRouter`, ni
// synchronisation hors ligne : la page est autonome, atteinte une fois sur un lien reçu par e-mail.
// Format STRICT 43 caractères base64url — même contrat que les Edge (`orders-core.ts`).
const upgradeToken = /^\/u\/([A-Za-z0-9_-]{43})\/?$/.exec(window.location.pathname)?.[1] ?? null

export default function App() {
  if (shareToken) {
    return (
      <Providers>
        <Screen>
          <PublicReviewPage token={shareToken} />
        </Screen>
        <Toaster richColors position="top-right" />
      </Providers>
    )
  }
  if (upgradeToken) {
    return (
      <Providers>
        <Screen>
          <PublicUpgradePage token={upgradeToken} />
        </Screen>
        <Toaster richColors position="top-right" />
      </Providers>
    )
  }
  return (
    <Providers>
      <AuthProvider>
        <BrowserRouter>
          <AppGate />
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </Providers>
  )
}
