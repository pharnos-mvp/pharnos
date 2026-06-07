import { Component, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/sentry'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
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
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div>
            <p className="text-lg font-semibold">Une erreur est survenue sur cette page.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Vous pouvez revenir en arrière ou recharger.
            </p>
          </div>
          <pre className="text-muted-foreground bg-muted max-w-xl overflow-auto rounded-md border p-3 text-left text-xs">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Réessayer
            </Button>
            <Button onClick={() => window.location.reload()}>Recharger</Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
