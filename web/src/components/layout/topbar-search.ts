import { createContext, useContext, useEffect, type Dispatch, type SetStateAction } from 'react'

/**
 * Permet à une page **qui possède sa propre recherche** (ex. la liste Produits) de masquer la
 * recherche globale du topbar, pour éviter deux champs de recherche sur le même écran. Défaut =
 * affichée (les surfaces validées — dashboard, cockpit — ne l'appellent pas → inchangées).
 * Même esprit que `HeaderSlotContext`.
 */
export const TopbarSearchHiddenContext = createContext<Dispatch<SetStateAction<boolean>> | null>(
  null,
)

/** À appeler dans une page qui fournit sa propre recherche : masque la recherche du topbar le temps du montage. */
export function useHideTopbarSearch(): void {
  const setHidden = useContext(TopbarSearchHiddenContext)
  useEffect(() => {
    if (!setHidden) return
    setHidden(true)
    return () => setHidden(false)
  }, [setHidden])
}
