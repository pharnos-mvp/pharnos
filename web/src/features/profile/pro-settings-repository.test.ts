import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  getOrgBranding,
  getUserSignature,
  setOrgFooter,
  setOrgHeader,
  setUserSignature,
} from './pro-settings-repository'

const ORG = 'org-1'
const USER = 'user-1'

beforeEach(async () => {
  await db.proSettings.clear()
  await db.outbox.clear()
})

describe('pro-settings repository (profil pro)', () => {
  it('enregistre en-tête + pied de l’org sur une seule ligne (+ outbox)', async () => {
    await setOrgHeader(ORG, 'data:image/png;base64,AAA')
    await setOrgFooter(ORG, 'data:image/png;base64,BBB')
    const b = await getOrgBranding(ORG)
    expect(b?.headerImage).toContain('AAA')
    expect(b?.footerImage).toContain('BBB')
    expect(b?.kind).toBe('orgBranding')
    expect(await db.proSettings.where('orgId').equals(ORG).count()).toBe(1)
    const outbox = await db.outbox.where('entity').equals('pro_setting').toArray()
    expect(outbox.length).toBeGreaterThan(0)
  })

  it('enregistre la signature utilisateur séparément du branding org', async () => {
    await setUserSignature(ORG, USER, 'data:image/png;base64,SIG')
    const s = await getUserSignature(USER)
    expect(s?.signatureImage).toContain('SIG')
    expect(s?.kind).toBe('userSignature')
    expect(await getOrgBranding(ORG)).toBeUndefined()
  })

  it('retire une image en passant null', async () => {
    await setOrgHeader(ORG, 'data:image/png;base64,AAA')
    await setOrgHeader(ORG, null)
    expect((await getOrgBranding(ORG))?.headerImage).toBeNull()
  })
})
