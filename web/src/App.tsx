import { lazy, Suspense } from 'react'
import { BrowserRouter } from 'react-router-dom'

import { Providers } from '@/app/providers'
import { AppRoutes } from '@/app/routes'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { useCurrentOrg } from '@/features/org/use-current-org'
import { env } from '@/lib/env'
import { useI18n } from '@/lib/i18n-context'
import { LOCAL_ORG_ID } from '@/lib/session'

const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const PublicReviewPage = lazy(() =>
  import('@/features/correspondence/public/PublicReviewPage').then((m) => ({
    default: m.PublicReviewPage,
  })),
)
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const OnboardingPage = lazy(() =>
  import('@/features/org/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
)
// Console admin Pharnos (jalon M) — chunk séparé, chargé uniquement sur /admin. Elle s'auto-protège
// (l'Edge `admin` refuse les non super-admins → écran « accès refusé »).
const AdminConsole = lazy(() =>
  import('@/features/admin/AdminConsole').then((m) => ({ default: m.AdminConsole })),
)

function FullScreenLoader() {
  const { t } = useI18n()
  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
      {t({ fr: 'Chargement…', en: 'Loading…' })}
    </div>
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
      <Suspense fallback={<FullScreenLoader />}>
        <OnboardingPage onCreated={refresh} />
      </Suspense>
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
      <Suspense fallback={<FullScreenLoader />}>
        <ResetPasswordPage />
      </Suspense>
    )
  }

  if (!session) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <LoginPage />
      </Suspense>
    )
  }

  // Console admin plateforme (hors shell RA org-scoped) — réservée aux super-admins Pharnos.
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <AdminConsole />
      </Suspense>
    )
  }

  return <AuthedApp />
}

// Page publique de review `/r/{token}` (jalon H) : AUCUNE auth/org/sync — le reviewer n'a pas
// de compte, le token est l'authentification (vérifiée par l'Edge `share`). Évaluée une fois au
// chargement : la page est autonome (pas de navigation interne). Format STRICT 43 caractères
// base64url — même contrat que l'Edge (`share-auth.ts`).
const shareToken = /^\/r\/([A-Za-z0-9_-]{43})\/?$/.exec(window.location.pathname)?.[1] ?? null

export default function App() {
  if (shareToken) {
    return (
      <Providers>
        <Suspense fallback={<FullScreenLoader />}>
          <PublicReviewPage token={shareToken} />
        </Suspense>
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
