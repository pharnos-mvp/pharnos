import { db, type ProSettingRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

const now = () => new Date().toISOString()

export const orgBrandingId = (orgId: string) => `org:${orgId}`
export const userSignatureId = (userId: string) => `user:${userId}`

export async function getOrgBranding(orgId: string): Promise<ProSettingRecord | undefined> {
  const rec = await db.proSettings.get(orgBrandingId(orgId))
  return rec && rec.deletedAt === null ? rec : undefined
}

export async function getUserSignature(userId: string): Promise<ProSettingRecord | undefined> {
  const rec = await db.proSettings.get(userSignatureId(userId))
  return rec && rec.deletedAt === null ? rec : undefined
}

async function upsert(id: string, orgId: string, patch: Partial<ProSettingRecord>): Promise<void> {
  const existing = await db.proSettings.get(id)
  const base: ProSettingRecord = existing ?? {
    id,
    orgId,
    kind: id.startsWith('user:') ? 'userSignature' : 'orgBranding',
    headerImage: null,
    footerImage: null,
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

/** Met à jour le papier à en-tête / pied de page de l'organisation (data URL ou `null`). */
export function setOrgHeader(orgId: string, headerImage: string | null): Promise<void> {
  return upsert(orgBrandingId(orgId), orgId, { headerImage })
}

export function setOrgFooter(orgId: string, footerImage: string | null): Promise<void> {
  return upsert(orgBrandingId(orgId), orgId, { footerImage })
}

/** Met à jour la signature de l'utilisateur (data URL ou `null`). */
export function setUserSignature(
  orgId: string,
  userId: string,
  signatureImage: string | null,
): Promise<void> {
  return upsert(userSignatureId(userId), orgId, { signatureImage })
}
