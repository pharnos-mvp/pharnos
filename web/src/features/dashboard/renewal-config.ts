/**
 * Override runtime des préavis de renouvellement par type de pièce (domaine B — config
 * `reminder_settings`, migration 0055). `renewalLeadDays` (dashboard-data) consulte cet override :
 * c'est le POINT DE PASSAGE UNIQUE du monitoring (dashboard, cockpit organisation, fiche produit,
 * aperçu dossier, section documents convergent tous vers `renewalLeadDays`), donc un seul endroit à
 * peupler rend toutes les surfaces cohérentes — jamais un écran qui en contredit un autre.
 *
 * Peuplé par `useApplyReminderLeadDays` (monté dans l'app-shell) au chargement de la config org.
 * Vide par défaut → `renewalLeadDays` retombe sur ses constantes (comportement inchangé, sélecteurs
 * purs et leurs tests verts sans réglage). Réinitialisé au reload : la bascule d'org et le logout
 * rechargent l'app → aucune fuite inter-org (même garantie que `sync-prefs`).
 */
let leadOverrides: Record<string, number> = {}

/** Remplace l'override par la carte { docType → jours } de la config org (valeurs positives entières). */
export function setRenewalLeadOverrides(map: Record<string, number> | null | undefined): void {
  const next: Record<string, number> = {}
  if (map && typeof map === 'object') {
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) next[k] = Math.round(v)
    }
  }
  leadOverrides = next
}

/** Préavis configuré (jours) pour ce type de pièce, ou `undefined` si l'org n'a rien surchargé. */
export function renewalLeadOverride(docType: string): number | undefined {
  const v = leadOverrides[docType]
  return typeof v === 'number' ? v : undefined
}
