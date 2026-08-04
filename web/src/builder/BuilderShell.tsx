import { useCallback, useEffect, useState } from 'react'

import { requestPersistentStorage } from '@/lib/persist'
import { I18nProvider } from '@/lib/I18nProvider'
import { BuilderWorkspace } from './BuilderWorkspace'
import { BuilderErrorBoundary } from './BuilderErrorBoundary'

/**
 * Coquille du CTD Builder autonome — en-tête, montage de dossier, et l'état du poste.
 *
 * Le bandeau du bas est un choix produit, pas un aveu (§6) : il rassure (rien ne part), rappelle
 * la limite (rien ne revient si le poste meurt) et affichera la version de référentiel — le seul
 * indicateur réglementairement critique. Le tableau de bord complet reste le lot B4.
 *
 * `navigator.storage.persist()` est traité dès maintenant, et pas plus tard, parce que c'est le
 * seul risque de la §5.5 qui détruit des données SANS prévenir : sous pression disque, un
 * navigateur évince une base non persistante — le dossier d'AMM disparaît sans message. La
 * demande DOIT partir d'un geste utilisateur (les navigateurs ignorent l'appel au chargement).
 */

type PersistState = 'inconnu' | 'accorde' | 'refuse' | 'indisponible'

const PERSIST_LABEL: Record<PersistState, string> = {
  inconnu: 'vérification…',
  accorde: 'accordé — vos dossiers ne seront pas évincés',
  refuse: 'non accordé — le navigateur peut effacer vos dossiers sous pression disque',
  indisponible: 'non géré par ce navigateur',
}

function usePersistState() {
  const [state, setState] = useState<PersistState>('inconnu')
  // Une demande a-t-elle DÉJÀ été faite et refusée ? Sans cette distinction, le bouton « Autoriser »
  // laisse l'écran stricto identique quand le navigateur dit non — l'utilisateur ne peut pas savoir
  // si son clic a fait quelque chose. Constaté en recette navigateur, corrigé avant livraison.
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (!navigator.storage?.persisted) {
        if (!cancelled) setState('indisponible')
        return
      }
      try {
        const granted = await navigator.storage.persisted()
        if (!cancelled) setState(granted ? 'accorde' : 'refuse')
      } catch {
        if (!cancelled) setState('indisponible')
      }
    }
    void read()
    return () => {
      cancelled = true
    }
  }, [])

  // Garde de concurrence : deux clics rapides lanceraient deux `persist()` simultanés, dont le
  // second écraserait le résultat du premier. Sert aussi à désactiver le bouton pendant l'appel.
  const [pending, setPending] = useState(false)

  const request = useCallback(async () => {
    if (pending) return
    setPending(true)
    try {
      const granted = await requestPersistentStorage()
      setState(granted ? 'accorde' : 'refuse')
      setDenied(!granted)
    } finally {
      setPending(false)
    }
  }, [pending])

  return { state, denied, pending, request }
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-foreground text-sm font-medium">{value}</dd>
    </div>
  )
}

export function BuilderShell() {
  return (
    <I18nProvider>
      <BuilderChrome />
    </I18nProvider>
  )
}

function BuilderChrome() {
  const { state, denied, pending, request } = usePersistState()

  return (
    <div className="bg-page text-foreground min-h-svh">
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-3xl items-baseline gap-3 px-4 py-5 md:px-6">
          <span className="font-display text-lg font-semibold">Pharnos</span>
          <span className="text-muted-foreground text-lg">CTD Builder</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        {/* La frontière n'entoure QUE le montage de dossier. Le bandeau « État du poste » reste
            en dehors : c'est lui qui explique le stockage, il doit survivre à sa panne. */}
        <BuilderErrorBoundary>
          <BuilderWorkspace />
        </BuilderErrorBoundary>

        <section
          aria-labelledby="etat-du-poste"
          className="border-border bg-card mt-12 rounded-xl border p-5"
        >
          <h2 id="etat-du-poste" className="text-sm font-semibold">
            État du poste
          </h2>
          <dl className="divide-border mt-2 divide-y">
            <StatusRow label="Mode" value="Poste local · non synchronisé" />
            {/* Formulation exacte : c'est ce que la politique du site AUTORISE, pas une mesure
                du trafic. Écrire « aucune sortie » serait affirmer un fait non observé. */}
            <StatusRow label="Politique du site" value="aucune sortie réseau autorisée" />
            <StatusRow label="Stockage persistant" value={PERSIST_LABEL[state]} />
            <StatusRow label="Version" value={__BUILDER_BUILD_ID__} />
          </dl>

          {state === 'refuse' && (
            <div className="border-warning-subtle bg-warning-subtle text-warning-subtle-foreground mt-4 rounded-lg border p-4">
              <p className="text-sm leading-relaxed">
                Sans autorisation durable, le navigateur peut effacer vos dossiers pour récupérer de
                l'espace disque — sans avertissement.
              </p>
              {/* Région live montée EN PERMANENCE, vide au départ. Une région live insérée en
                  même temps que son contenu n'est pas annoncée par les lecteurs d'écran : ils
                  n'observent que les régions déjà présentes dans le document. */}
              <div role="status" aria-live="polite">
                {denied && (
                  <p className="mt-2 text-sm leading-relaxed">
                    <strong>Le navigateur a refusé la demande.</strong> La plupart ne l'accordent
                    qu'après quelques visites, ou si le site est ajouté aux favoris. Vous pouvez
                    réessayer plus tard — d'ici là, exportez vos dossiers régulièrement.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void request()}
                disabled={pending}
                className="bg-primary text-primary-foreground ring-offset-background focus-visible:ring-ring mt-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
              >
                {denied ? 'Réessayer' : 'Autoriser le stockage durable'}
              </button>
            </div>
          )}
        </section>

        <p className="text-muted-foreground mt-8 text-xs leading-relaxed">
          Vos documents ne transitent jamais par les serveurs de Pharnos.
        </p>
      </main>
    </div>
  )
}
