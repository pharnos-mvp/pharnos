import { db, type PartyRecord, type PartyRole, type ProductRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

const now = () => new Date().toISOString()

/**
 * Namespace UUID fixe (Pharnos · parties). Sert à dériver un id DÉTERMINISTE depuis (org + nom
 * normalisé) → la même organisation reçoit le même id sur tous les appareils et à chaque
 * dérivation : pas de doublon serveur/multi-appareil, l'upsert fusionne naturellement.
 */
const PARTY_NAMESPACE = 'b9f6e4d2-1a3c-4e5b-8c7d-0f1a2b3c4d5e'

/** Normalise un nom d'organisation pour la clé déterministe (insensible casse/espaces). */
export function normalizePartyName(nom: string): string {
  return nom.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * UUID DÉTERMINISTE depuis une chaîne (FNV-1a, 4 graines → 128 bits). Synchrone (ni crypto async ni
 * secure-context requis) et compact. La forme 8-4-4-4-12 hex est acceptée telle quelle par le type
 * `uuid` de Postgres ; les bits de version/variant n'ont pas de sémantique ici (id interne de dédup).
 */
function deterministicUuid(input: string): string {
  const seeds = [0x811c9dc5, 0x23456789, 0x9e3779b1, 0x85ebca77]
  let hex = ''
  for (const seed of seeds) {
    let h = seed >>> 0
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    hex += (h >>> 0).toString(16).padStart(8, '0')
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** Id déterministe d'une organisation au sein d'un tenant (clé de dédup). */
export function partyId(orgId: string, nom: string): string {
  return deterministicUuid(`${PARTY_NAMESPACE}:${orgId}:${normalizePartyName(nom)}`)
}

/** Organisations actives d'un tenant, de la plus récemment modifiée à la plus ancienne. */
export async function listParties(orgId: string): Promise<PartyRecord[]> {
  const items = await db.parties.where('orgId').equals(orgId).toArray()
  return items
    .filter((p) => p.deletedAt === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getParty(id: string): Promise<PartyRecord | undefined> {
  const p = await db.parties.get(id)
  return p && p.deletedAt === null ? p : undefined
}

export interface PartyInput {
  nom: string
  roles?: PartyRole[]
  pays?: string
  adresse?: string
  gmpCertificat?: string
  gmpExpiry?: string | null
}

const unionRoles = (a: PartyRole[], b: PartyRole[]): PartyRole[] =>
  [...new Set([...a, ...b])].sort()

/**
 * Upsert idempotent d'une organisation par NOM (id déterministe). Fusionne les rôles (cumul) et
 * complète les champs vides SANS écraser une donnée déjà saisie. Enregistre une op outbox seulement
 * en cas de changement réel (pas de churn de synchro). Renvoie l'id (à lier au produit) ou `null`
 * si le nom est vide. Réveille une organisation soft-deleted si elle réapparaît sur un produit.
 */
export async function upsertParty(orgId: string, input: PartyInput): Promise<string | null> {
  const nom = input.nom.trim()
  if (!nom) return null
  const id = partyId(orgId, nom)
  const roles = input.roles ?? []
  const existing = await db.parties.get(id)

  if (existing && existing.deletedAt === null) {
    const merged: PartyRecord = {
      ...existing,
      nom, // garde la dernière casse saisie
      roles: unionRoles(existing.roles, roles),
      pays: existing.pays || (input.pays ?? ''),
      adresse: existing.adresse || (input.adresse ?? ''),
      gmpCertificat: existing.gmpCertificat || (input.gmpCertificat ?? ''),
      gmpExpiry: existing.gmpExpiry ?? input.gmpExpiry ?? null,
    }
    const changed =
      merged.nom !== existing.nom ||
      merged.roles.join() !== existing.roles.join() ||
      merged.pays !== existing.pays ||
      merged.adresse !== existing.adresse ||
      merged.gmpCertificat !== existing.gmpCertificat ||
      merged.gmpExpiry !== existing.gmpExpiry
    if (!changed) return id
    merged.updatedAt = now()
    await db.transaction('rw', db.parties, db.outbox, async () => {
      await db.parties.put(merged)
      await enqueueOutbox('party', id, 'update', merged)
    })
    return id
  }

  const ts = now()
  const record: PartyRecord = {
    id,
    orgId,
    nom,
    roles: unionRoles([], roles),
    pays: input.pays ?? '',
    adresse: input.adresse ?? '',
    gmpCertificat: input.gmpCertificat ?? '',
    gmpExpiry: input.gmpExpiry ?? null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.transaction('rw', db.parties, db.outbox, async () => {
    await db.parties.put(record) // put (≠ add) : réveille un id soft-deleted réutilisé
    await enqueueOutbox('party', id, existing ? 'update' : 'create', record)
  })
  return id
}

/**
 * Met à jour les détails éditables d'une organisation depuis sa fiche. `nom` est VOLONTAIREMENT
 * exclu : l'id est dérivé du nom → le renommer créerait un doublon orphelin à la prochaine
 * dérivation (un nom différent = une autre organisation). Le nom suit le free-text des produits.
 */
export async function updateParty(
  id: string,
  patch: Partial<Pick<PartyRecord, 'pays' | 'adresse' | 'gmpCertificat' | 'gmpExpiry'>>,
): Promise<PartyRecord> {
  const existing = await db.parties.get(id)
  if (!existing || existing.deletedAt !== null) throw new Error('Organisation introuvable')
  const updated: PartyRecord = { ...existing, ...patch, updatedAt: now() }
  await db.transaction('rw', db.parties, db.outbox, async () => {
    await db.parties.put(updated)
    await enqueueOutbox('party', id, 'update', updated)
  })
  return updated
}

/** Free-text d'un produit dont on dérive les organisations liées. */
export interface ProductPartyFields {
  titulaire: string
  titulaireAdresse?: string | null
  fabricant: string
  fabricantAdresse?: string | null
}

/**
 * Dérive (et lie) les organisations d'un produit depuis ses free-text — « 0 ressaisie ». Upsert
 * idempotent du titulaire (rôle `titulaire`) et du fabricant (rôle `fabricant`) ; renvoie leurs ids
 * (à stocker sur le produit). Le free-text reste la source de vérité (secours pendant la transition).
 */
export async function deriveProductLinks(
  orgId: string,
  p: ProductPartyFields,
): Promise<{ titulaireId: string | null; fabricantId: string | null }> {
  const titulaireId = await upsertParty(orgId, {
    nom: p.titulaire,
    roles: ['titulaire'],
    adresse: p.titulaireAdresse ?? '',
  })
  const fabricantId = await upsertParty(orgId, {
    nom: p.fabricant,
    roles: ['fabricant'],
    adresse: p.fabricantAdresse ?? '',
  })
  return { titulaireId, fabricantId }
}

const BACKFILL_VERSION = '1'
const backfillKey = (orgId: string) => `pharnos.parties.backfilled.${orgId}`

/**
 * Backfill idempotent : lie les produits existants à leurs organisations (créées au besoin) depuis
 * leurs free-text — pour les enregistrements antérieurs à la migration `0045`. Ne touche QUE les
 * produits dont un free-text non vide n'a pas encore de lien (pas de churn de synchro). Un flag
 * localStorage par org évite de re-scanner tous les produits à chaque montage — une fois fait, les
 * nouveaux produits sont liés à la création/édition (`deriveProductLinks`). Best-effort.
 */
export async function backfillProductParties(orgId: string): Promise<void> {
  try {
    if (localStorage.getItem(backfillKey(orgId)) === BACKFILL_VERSION) return
  } catch {
    /* stockage indisponible → on exécute quand même (le travail reste idempotent) */
  }

  const products = await db.products.where('orgId').equals(orgId).toArray()
  for (const p of products) {
    if (p.deletedAt !== null) continue
    const needsT = !!p.titulaire?.trim() && !p.titulaireId
    const needsF = !!p.fabricant?.trim() && !p.fabricantId
    if (!needsT && !needsF) continue

    const { titulaireId, fabricantId } = await deriveProductLinks(orgId, p)
    const patch: Partial<ProductRecord> = {}
    if (needsT && titulaireId) patch.titulaireId = titulaireId
    if (needsF && fabricantId) patch.fabricantId = fabricantId
    if (Object.keys(patch).length === 0) continue
    patch.updatedAt = now()

    await db.transaction('rw', db.products, db.outbox, async () => {
      await db.products.update(p.id, patch)
      await enqueueOutbox('product', p.id, 'update', { ...p, ...patch })
    })
  }

  try {
    localStorage.setItem(backfillKey(orgId), BACKFILL_VERSION)
  } catch {
    /* non bloquant : le prochain montage re-tentera (idempotent) */
  }
}
