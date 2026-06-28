import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

/**
 * Configuration du bandeau (topbar) par la page courante — **sans** remplacer toute la barre
 * (≠ `HeaderSlotContext`, utilisé par le cockpit pour un bandeau plein). Permet à une page de :
 * surcharger le titre, ajouter un bouton retour, et masquer la recherche globale — **tout en
 * conservant langue / thème / notifications** à droite.
 */
export interface TopbarConfig {
  /** Titre affiché à gauche (sinon le titre de route par défaut). */
  title?: ReactNode
  /** Si défini, affiche un bouton retour (flèche) vers ce chemin, à gauche du titre. */
  backTo?: string
  /** Masque la recherche globale (pour une page qui a sa propre recherche). */
  searchHidden?: boolean
}

export const TopbarConfigContext = createContext<Dispatch<SetStateAction<TopbarConfig>> | null>(
  null,
)

/** Applique une config de topbar le temps du montage de la page (réinitialisée au démontage). */
export function useTopbar(config: TopbarConfig): void {
  const setConfig = useContext(TopbarConfigContext)
  const { title, backTo, searchHidden } = config
  useEffect(() => {
    if (!setConfig) return
    setConfig({ title, backTo, searchHidden })
    return () => setConfig({})
  }, [setConfig, title, backTo, searchHidden])
}
