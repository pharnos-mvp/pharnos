import { Component, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { reportError } from '@/lib/sentry'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * UI de repli (fonctionnelle → peut utiliser `useI18n`, contrairement à la classe).
 * Rendue sous `I18nProvider` (la frontière est par route, à l'intérieur des providers).
 */
function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-lg font-semibold">
          {t({
            fr: 'Une erreur est survenue sur cette page.',
            en: 'An error occurred on this page.',
          })}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t({
            fr: 'Vous pouvez revenir en arrière ou recharger.',
            en: 'You can go back or reload.',
          })}
        </p>
      </div>
      <pre className="text-muted-foreground bg-muted max-w-xl overflow-auto rounded-md border p-3 text-left text-xs">
        {error.message}
      </pre>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onRetry}>
          {t({ fr: 'Réessayer', en: 'Retry' })}
        </Button>
        <Button onClick={() => window.location.reload()}>
          {t({ fr: 'Recharger', en: 'Reload' })}
        </Button>
      </div>
    </div>
  )
}

/**
 * Capture les erreurs de rendu d'une page pour éviter l'écran blanc complet : affiche un message
 * lisible (+ le détail technique) et garde le reste de l'app (navigation) utilisable.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: unknown): void {
    console.error('[ErrorBoundary]', error, info)
    reportError(error, { boundary: 'route' })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error) {
      return <ErrorFallback error={error} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}
