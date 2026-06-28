import { db, type PartyRecord, type PartyRole } from '@/lib/db'
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

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

function bytesToUuid(b: Uint8Array): string {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** UUIDv5 (SHA-1) standard — déterministe pour un couple (namespace, name). */
async function uuidv5(name: string, namespace: string): Promise<string> {
  const ns = hexToBytes(namespace.replace(/-/g, ''))
  const nameBytes = new TextEncoder().encode(name)
  const data = new Uint8Array(ns.length + nameBytes.length)
  data.set(ns)
  data.set(nameBytes, ns.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16)
  digest[6] = (digest[6]! & 0x0f) | 0x50 // version 5
  digest[8] = (digest[8]! & 0x3f) | 0x80 // variant RFC 4122
  return bytesToUuid(digest)
}

/** Id déterministe d'une organisation au sein d'un tenant (clé de dédup). */
export function partyId(orgId: string, nom: string): Promise<string> {
  return uuidv5(`${orgId}:${normalizePartyName(nom)}`, PARTY_NAMESPACE)
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

const unionRoles = (a: PartyRole[], b: PartyRole[]): PartyRole[] => [...new Set([...a, ...b])].sort()

/**
 * Upsert idempotent d'une organisation par NOM (id déterministe). Fusionne les rôles (cumul) et
 * complète les champs vides SANS écraser une donnée déjà saisie. Enregistre une op outbox seulement
 * en cas de changement réel (pas de churn de synchro). Renvoie l'id (à lier au produit) ou `null`
 * si le nom est vide. Réveille une organisation soft-deleted si elle réapparaît sur un produit.
 */
export async function upsertParty(orgId: string, input: PartyInput): Promise<string | null> {
  const nom = input.nom.trim()
  if (!nom) return null
  const id = await partyId(orgId, nom)
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

/** Met à jour les détails d'une organisation depuis sa fiche (pays/adresse/GMP/rôles). */
export async function updateParty(
  id: string,
  patch: Partial<Omit<PartyRecord, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
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

/** Suppression logique (soft delete) — l'objet reste pour la réconciliation de synchro. */
export async function deleteParty(id: string): Promise<void> {
  const existing = await db.parties.get(id)
  if (!existing || existing.deletedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.parties, db.outbox, async () => {
    await db.parties.update(id, { deletedAt: ts, updatedAt: ts })
    await enqueueOutbox('party', id, 'delete', { id })
  })
}
