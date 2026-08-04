import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Frontière d'erreur PROPRE au CTD Builder.
 *
 * Pourquoi ne pas réutiliser `@/components/ErrorBoundary` : il importe `@/lib/sentry`, que le
 * garde-fou d'isolation interdit — le build échouerait. Ce n'est pas un contournement, c'est la
 * règle qui fonctionne : aucune télémétrie ne doit sortir d'un poste qui monte un dossier d'AMM.
 * L'erreur va donc dans la console du navigateur, et nulle part ailleurs.
 *
 * ⚠️ Pourquoi elle est indispensable ici, et pas seulement « une bonne pratique » :
 * `useLiveQuery` (dexie-react-hooks) **relance l'erreur pendant le rendu** quand la base ne
 * s'ouvre pas. Or l'ouverture d'IndexedDB échoue pour des raisons parfaitement ordinaires chez
 * nos utilisateurs — navigation privée, stockage bloqué par une politique d'entreprise,
 * `MissingAPIError`. Sans frontière, React démonte la racine : **page blanche, aucun message**,
 * sur un produit payant. Et le seul écran qui aurait expliqué le problème — « État du poste » —
 * disparaît avec le reste.
 *
 * C'est pour cette raison que le bandeau d'état est monté HORS de cette frontière : il doit
 * survivre à la panne qu'il sert à diagnostiquer.
 */
type Props = { children: ReactNode }
type State = { erreur: Error | null }

export class BuilderErrorBoundary extends Component<Props, State> {
  override state: State = { erreur: null }

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur }
  }

  override componentDidCatch(erreur: Error, info: ErrorInfo) {
    // Console uniquement — assumé, cf. l'en-tête. C'est le prix de la promesse, et il est juste.
    console.error('CTD Builder — erreur non rattrapée', erreur, info.componentStack)
  }

  override render() {
    if (!this.state.erreur) return this.props.children

    return (
      <div
        role="alert"
        className="border-danger-subtle bg-danger-subtle text-danger-subtle-foreground rounded-xl border p-5"
      >
        <h1 className="text-base font-semibold">Vos dossiers sont inaccessibles sur ce poste.</h1>
        <p className="mt-3 text-sm leading-relaxed">
          Le CTD Builder range vos dossiers dans le stockage local du navigateur. Il n'a pas pu
          l'ouvrir — c'est ce qui arrive en <strong>navigation privée</strong>, ou quand le stockage
          des sites est bloqué par une règle d'entreprise.
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          Rouvrez cette page dans une fenêtre normale. Vos dossiers déjà montés ne sont pas perdus :
          ils restent sur ce poste.
        </p>
        <p className="text-danger-subtle-foreground/80 mt-3 font-mono text-xs break-words">
          {this.state.erreur.name} : {this.state.erreur.message}
        </p>
      </div>
    )
  }
}
