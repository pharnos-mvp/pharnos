import { useEffect, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { useI18n } from '@/lib/i18n-context'

import { teamApi, type AcceptResult } from './team-api'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="bg-card w-full max-w-md space-y-4 rounded-xl border p-6 text-center shadow-sm">
        <span className="bg-foreground text-background mx-auto grid size-9 place-items-center rounded-md text-sm font-bold">
          P
        </span>
        {children}
      </div>
    </div>
  )
}

/**
 * Page d'acceptation d'invitation `/invite/{token}` (jalon M4). Rendue par AppGate UNIQUEMENT si
 * une session existe (sinon LoginPage) : l'utilisateur doit être connecté avec l'e-mail invité.
 */
export function InvitePage({ token }: { token: string }) {
  const { t } = useI18n()
  const { user, signOut } = useAuth()
  const [result, setResult] = useState<AcceptResult | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    teamApi
      .accept(token)
      .then((r) => {
        if (active) setResult(r)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  if (loading) {
    return (
      <Shell>
        <p className="text-muted-foreground text-sm">
          {t({ fr: 'Validation de l’invitation…', en: 'Validating invitation…' })}
        </p>
      </Shell>
    )
  }

  if (error) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">
          {t({ fr: 'Une erreur est survenue', en: 'Something went wrong' })}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t({ fr: 'Réessayez plus tard.', en: 'Please try again later.' })}
        </p>
        <Button asChild variant="outline" size="sm">
          <a href="/">{t({ fr: "Aller à l'application", en: 'Go to the app' })}</a>
        </Button>
      </Shell>
    )
  }

  if (result?.ok) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">
          {t({ fr: 'Bienvenue dans l’équipe 🎉', en: 'Welcome to the team 🎉' })}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Votre accès est actif. Ouvrez l’application pour commencer.',
            en: 'Your access is active. Open the app to get started.',
          })}
        </p>
        {/* Navigation complète : recharge la session/org pour prendre en compte la nouvelle appartenance. */}
        <Button asChild>
          <a href="/">{t({ fr: "Ouvrir l'application", en: 'Open the app' })}</a>
        </Button>
      </Shell>
    )
  }

  // result.ok === false → motif explicite
  const reason = result?.reason
  if (reason === 'email_mismatch') {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">
          {t({ fr: 'Mauvais compte', en: 'Wrong account' })}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t({
            fr: `Cette invitation est destinée à ${result?.invited_email ?? ''}. Vous êtes connecté en tant que ${user?.email ?? ''}.`,
            en: `This invitation is for ${result?.invited_email ?? ''}. You are signed in as ${user?.email ?? ''}.`,
          })}
        </p>
        <p className="text-muted-foreground text-xs">
          {t({
            fr: 'Déconnectez-vous puis reconnectez-vous avec l’adresse invitée pour accepter.',
            en: 'Sign out and sign back in with the invited address to accept.',
          })}
        </p>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>
          {t({ fr: 'Se déconnecter', en: 'Sign out' })}
        </Button>
      </Shell>
    )
  }

  const message: Record<string, { fr: string; en: string }> = {
    expired: { fr: 'Ce lien d’invitation a expiré.', en: 'This invitation link has expired.' },
    already_used: {
      fr: 'Cette invitation a déjà été utilisée.',
      en: 'This invitation has already been used.',
    },
    not_found: {
      fr: 'Invitation introuvable ou révoquée.',
      en: 'Invitation not found or revoked.',
    },
  }
  return (
    <Shell>
      <h1 className="text-lg font-semibold">
        {t({ fr: 'Invitation indisponible', en: 'Invitation unavailable' })}
      </h1>
      <p className="text-muted-foreground text-sm">
        {t(message[reason ?? 'not_found'] ?? message.not_found!)}
      </p>
      <Button asChild variant="outline" size="sm">
        <a href="/">{t({ fr: "Aller à l'application", en: 'Go to the app' })}</a>
      </Button>
    </Shell>
  )
}
