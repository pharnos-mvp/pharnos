// Relance FABRICANT (domaine B du monitoring, Slice 2b) — cœur PUR, testé sans I/O.
//
// Quand une PIÈCE ADMIN (GMP, COPP, FSC, ML, AMM, COA…) entre dans sa fenêtre de renouvellement
// (préavis `monitoring_lead_days` par type, config org 0055), on relance le CONTACT du fabricant
// (`parties.contact_email`, 0057) pour qu'il engage le renouvellement à temps.
//
// MIROIR CONTRACTUEL de la règle de validité web (`renewalLeadDays`, dashboard-data.ts) : COA = 547 j,
// toute pièce admin = 180 j, sinon 90 j ; le préavis PERSONNALISÉ de l'org prime. Aucun écran ne doit
// contredire le moteur sur la même pièce. Les Edge Functions ne peuvent pas importer `web/src` → copie.
//
// Idempotence : UNE relance par couple (document_id, expiry_date) — `alreadySent` filtre les couples
// déjà relancés (matérialisés dans `monitoring_reminders`, 0058). Un renouvellement change l'échéance
// → nouveau couple → une relance à la prochaine fenêtre. Fonction pure (le temps est un paramètre).

/** Ligne brute d'une pièce (`documents`) pertinente pour le monitoring. */
export interface MonitorDocRow {
  id: string
  org_id: string
  product_id: string | null
  doc_type: string
  /** Échéance (date 'YYYY-MM-DD') ; null = pièce sans validité → jamais relancée. */
  expiry_date: string | null
}

/** Ligne brute d'un produit (lien vers le fabricant). */
export interface MonitorProductRow {
  id: string
  nom_commercial: string
  fabricant_id: string | null
}

/** Ligne brute d'une organisation (`parties`) — fabricant destinataire. */
export interface MonitorPartyRow {
  id: string
  nom: string
  contact_email: string | null
}

/** Couple (pièce, échéance) déjà relancé — clé d'idempotence (table `monitoring_reminders`). */
export interface MonitorSentRow {
  document_id: string
  /** 'YYYY-MM-DD' (colonne `date` → PostgREST renvoie ce format). */
  expiry_date: string
}

/** Préavis par type de pièce (jours) — config org `reminder_settings.monitoring_lead_days` (0055). */
export type MonitoringLeadCfg = Record<string, number>

// Défauts MIROIR EXACT de `renewalLeadDays` (web) : COA 547 j, pièce admin connue 180 j, sinon 90 j.
export const MONITOR_COA_LEAD_DAYS = 547
export const MONITOR_ADMIN_LEAD_DAYS = 180
export const MONITOR_DEFAULT_LEAD_DAYS = 90

/** Codes ADMIN — miroir de `ADMIN_DOC_TYPES`/`ADMIN_DOC_CODES` (web) : mêmes clés que renewalLeadDays. */
const ADMIN_DOC_CODES = new Set(['amm', 'gmp', 'copp', 'fsc', 'ml', 'contract', 'coa', 'other_admin'])

/**
 * Au-delà de N jours APRÈS expiration on CESSE de relancer : une pièce chroniquement périmée est
 * déjà signalée en rouge dans l'app ; un nudge nocturne n'y change rien. Borne le mécanisme à
 * « à venir + récemment périmé » — et évite qu'au 1er run l'arriéré historique parte en masse.
 */
export const MONITOR_GRACE_DAYS = 30

/** Préavis effectif d'un type de pièce : override org valide (> 0), sinon défaut MIROIR renewalLeadDays. */
export function monitorLeadDays(docType: string, cfg?: MonitoringLeadCfg): number {
  const o = cfg?.[docType]
  if (typeof o === 'number' && Number.isFinite(o) && o > 0) return Math.round(o)
  if (docType === 'coa') return MONITOR_COA_LEAD_DAYS
  if (ADMIN_DOC_CODES.has(docType)) return MONITOR_ADMIN_LEAD_DAYS
  return MONITOR_DEFAULT_LEAD_DAYS // pièce hors vocabulaire admin → même défaut que le dashboard
}

/** Une relance fabricant PLANIFIÉE (à envoyer + à journaliser). */
export interface ManufacturerReminderPlan {
  orgId: string
  documentId: string
  docType: string
  /** 'YYYY-MM-DD' — clé d'idempotence avec documentId. */
  expiryDate: string
  /** Jours entiers avant expiration (négatif = déjà périmée) — contexte du message. */
  daysLeft: number
  productName: string
  manufacturerName: string
  /** Destinataire (validé non vide ici ; le format est re-vérifié à l'envoi). */
  contactEmail: string
}

const DAY_MS = 86_400_000

/**
 * Décide QUELLES pièces déclenchent une relance fabricant MAINTENANT — pur & déterministe.
 *
 * Une pièce est planifiée si : elle a une échéance parsable, elle est dans sa FENÊTRE de relance
 * (`-MONITOR_GRACE_DAYS <= daysLeft <= préavis` : à venir, ou périmée depuis peu), on n'a pas DÉJÀ
 * relancé ce couple (pièce, échéance), son produit est lié à un fabricant, et ce fabricant a un
 * e-mail de contact. Sinon, ignorée. Le plancher bas évite de nudger sur l'arriéré chroniquement
 * périmé (déjà en rouge dans l'app) et borne l'envoi de masse au 1er run. Idempotence : une relance
 * par (pièce, échéance) ; les plafonds (edge) bornent le run.
 */
export function planManufacturerReminders(input: {
  documents: MonitorDocRow[]
  products: MonitorProductRow[]
  parties: MonitorPartyRow[]
  leadCfg?: MonitoringLeadCfg
  alreadySent: MonitorSentRow[]
  now: Date
}): ManufacturerReminderPlan[] {
  const productById = new Map(input.products.map((p) => [p.id, p]))
  const partyById = new Map(input.parties.map((p) => [p.id, p]))
  const sent = new Set(input.alreadySent.map((s) => `${s.document_id}|${s.expiry_date}`))
  const nowMs = input.now.getTime()

  const out: ManufacturerReminderPlan[] = []
  for (const d of input.documents) {
    if (!d.expiry_date) continue
    const t = Date.parse(d.expiry_date)
    if (!Number.isFinite(t)) continue
    const daysLeft = Math.round((t - nowMs) / DAY_MS)
    if (daysLeft > monitorLeadDays(d.doc_type, input.leadCfg)) continue // pas encore dans la fenêtre
    if (daysLeft < -MONITOR_GRACE_DAYS) continue // périmée depuis trop longtemps (chronique → app, pas d'e-mail)
    if (sent.has(`${d.id}|${d.expiry_date}`)) continue // déjà relancé pour cette échéance (idempotence)

    const product = d.product_id ? productById.get(d.product_id) : undefined
    if (!product?.fabricant_id) continue // pas de fabricant lié → personne à relancer
    const party = partyById.get(product.fabricant_id)
    const contactEmail = party?.contact_email?.trim()
    if (!party || !contactEmail) continue // fabricant sans contact → aucun envoi possible

    out.push({
      orgId: d.org_id,
      documentId: d.id,
      docType: d.doc_type,
      expiryDate: d.expiry_date,
      daysLeft,
      productName: product.nom_commercial,
      manufacturerName: party.nom,
      contactEmail,
    })
  }
  return out
}
