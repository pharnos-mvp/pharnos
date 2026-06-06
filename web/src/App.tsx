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
import { LOCAL_ORG_ID } from '@/lib/session'

const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const OnboardingPage = lazy(() =>
  import('@/features/org/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
)

function FullScreenLoader() {
  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
      Chargement…
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
  const { loading, session } = useAuth()

  // Mode local/offline (pas de backend configuré) : pas d'auth, org locale.
  if (!env.isSupabaseConfigured) return <OrgScopedRoutes orgId={LOCAL_ORG_ID} />

  if (loading) return <FullScreenLoader />

  if (!session) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <LoginPage />
      </Suspense>
    )
  }

  return <AuthedApp />
}

export default function App() {
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
