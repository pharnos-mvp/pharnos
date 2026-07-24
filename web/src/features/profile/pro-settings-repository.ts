import { db, type ProSettingRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

const now = () => new Date().toISOString()

export const orgBrandingId = (orgId: string) => `org:${orgId}`
export const userSignatureId = (userId: string) => `user:${userId}`
/** Branding propre à UN MAH (mode agence) — même convention d'`id` que `org:`/`user:`. */
export const partyBrandingId = (partyId: string) => `party:${partyId}`

export async function getOrgBranding(orgId: string): Promise<ProSettingRecord | undefined> {
  const rec = await db.proSettings.get(orgBrandingId(orgId))
  return rec && rec.deletedAt === null ? rec : undefined
}

export async function getUserSignature(userId: string): Promise<ProSettingRecord | undefined> {
  const rec = await db.proSettings.get(userSignatureId(userId))
  return rec && rec.deletedAt === null ? rec : undefined
}

/** Branding d'un MAH (party rôle titulaire), s'il en a un de défini. */
export async function getPartyBranding(partyId: string): Promise<ProSettingRecord | undefined> {
  const rec = await db.proSettings.get(partyBrandingId(partyId))
  return rec && rec.deletedAt === null ? rec : undefined
}

/**
 * RÉSOLUTION EN CASCADE (source unique du branding des lettres/dossiers) : le branding du MAH du
 * produit s'il existe, SINON celui du tenant. Un compte mono-client (aucun branding MAH) garde donc
 * exactement le comportement d'avant — zéro régression. `titulaireId` = `product.titulaireId`.
 */
export async function getBrandingForParty(
  orgId: string,
  titulaireId: string | null | undefined,
): Promise<ProSettingRecord | undefined> {
  if (titulaireId) {
    const party = await getPartyBranding(titulaireId)
    if (party) return party
  }
  return getOrgBranding(orgId)
}

/** `kind` déduit de la convention d'`id` (source unique, cohérente avec le serveur). */
function kindFromId(id: string): ProSettingRecord['kind'] {
  if (id.startsWith('user:')) return 'userSignature'
  if (id.startsWith('party:')) return 'partyBranding'
  return 'orgBranding'
}

async function upsert(id: string, orgId: string, patch: Partial<ProSettingRecord>): Promise<void> {
  const existing = await db.proSettings.get(id)
  const base: ProSettingRecord = existing ?? {
    id,
    orgId,
    kind: kindFromId(id),
    entreprise: null,
    poste: null,
    signataire: null,
    pays: null,
    headerImage: null,
    footerImage: null,
    logoImage: null,
    signatureImage: null,
    updatedAt: now(),
    deletedAt: null,
  }
  const updated: ProSettingRecord = { ...base, ...patch, orgId, updatedAt: now(), deletedAt: null }
  await db.transaction('rw', db.proSettings, db.outbox, async () => {
    await db.proSettings.put(updated)
    await enqueueOutbox('pro_setting', id, existing ? 'update' : 'create', updated)
  })
}

/** Met à jour les infos professionnelles de l'organisation (entreprise, poste, pays). */
export function setOrgProfile(
  orgId: string,
  profile: {
    entreprise: string | null
    poste: string | null
    signataire: string | null
    pays: string | null
  },
): Promise<void> {
  return upsert(orgBrandingId(orgId), orgId, profile)
}

/** Met à jour le papier à en-tête / pied de page de l'organisation (data URL ou `null`). */
export function setOrgHeader(orgId: string, headerImage: string | null): Promise<void> {
  return upsert(orgBrandingId(orgId), orgId, { headerImage })
}

export function setOrgFooter(orgId: string, footerImage: string | null): Promise<void> {
  return upsert(orgBrandingId(orgId), orgId, { footerImage })
}

/** Met à jour le logo (bandeau d'en-tête du dossier compilé) — data URL ou `null`. */
export function setOrgLogo(orgId: string, logoImage: string | null): Promise<void> {
  return upsert(orgBrandingId(orgId), orgId, { logoImage })
}

/** Met à jour la signature de l'utilisateur (data URL ou `null`). */
export function setUserSignature(
  orgId: string,
  userId: string,
  signatureImage: string | null,
): Promise<void> {
  return upsert(userSignatureId(userId), orgId, { signatureImage })
}

// ── Branding propre à UN MAH (mode agence) — mêmes champs que le branding tenant, clé `party:<id>`.
/** Signataire d'un MAH : nom (`signataire`) + rôle/fonction (`poste`) portés sur ses lettres. */
export function setPartySignatory(
  orgId: string,
  partyId: string,
  signatory: { signataire: string | null; poste: string | null },
): Promise<void> {
  return upsert(partyBrandingId(partyId), orgId, signatory)
}

export function setPartyHeader(
  orgId: string,
  partyId: string,
  headerImage: string | null,
): Promise<void> {
  return upsert(partyBrandingId(partyId), orgId, { headerImage })
}

export function setPartyFooter(
  orgId: string,
  partyId: string,
  footerImage: string | null,
): Promise<void> {
  return upsert(partyBrandingId(partyId), orgId, { footerImage })
}

export function setPartyLogo(
  orgId: string,
  partyId: string,
  logoImage: string | null,
): Promise<void> {
  return upsert(partyBrandingId(partyId), orgId, { logoImage })
}
