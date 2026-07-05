/**
 * Préférence « Ne plus afficher ce message » du dialogue de suppression d'un brouillon
 * (recette CEO LOT 9). Par navigateur et par organisation (localStorage — même famille que le
 * curseur de sync). Sauter la confirmation reste SÛR : la suppression part en corbeille 30 j
 * avec un toast « Restaurer » (undo) — le filet remplace le dialogue, pas l'inverse.
 */
const key = (orgId: string) => `pharnos.skipDeleteConfirm.${orgId}`

export function isDeleteConfirmSkipped(orgId: string): boolean {
  try {
    return localStorage.getItem(key(orgId)) === '1'
  } catch {
    return false
  }
}

export function setDeleteConfirmSkipped(orgId: string, skip: boolean): void {
  try {
    if (skip) localStorage.setItem(key(orgId), '1')
    else localStorage.removeItem(key(orgId))
  } catch {
    // stockage indisponible (navigation privée stricte) : la préférence ne persiste pas, sans casser.
  }
}
