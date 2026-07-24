import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  getBrandingForParty,
  getOrgBranding,
  getPartyBranding,
  getUserSignature,
  setOrgFooter,
  setOrgHeader,
  setPartyHeader,
  setPartySignatory,
  setUserSignature,
} from './pro-settings-repository'

const ORG = 'org-1'
const USER = 'user-1'
const MAH = 'party-mah'

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

describe('branding MAH (mode agence) — résolution en cascade', () => {
  it('le branding d’un MAH est stocké à part (kind partyBranding, clé party:<id>)', async () => {
    await setPartySignatory(ORG, MAH, {
      signataire: 'Dr Aïcha Koné',
      poste: 'Pharmacien responsable',
    })
    await setPartyHeader(ORG, MAH, 'data:image/png;base64,HEAD')
    const b = await getPartyBranding(MAH)
    expect(b?.id).toBe('party:party-mah')
    expect(b?.kind).toBe('partyBranding')
    expect(b?.signataire).toBe('Dr Aïcha Koné')
    expect(b?.poste).toBe('Pharmacien responsable')
    expect(b?.headerImage).toContain('HEAD')
    // Ne pollue pas le branding tenant.
    expect(await getOrgBranding(ORG)).toBeUndefined()
  })

  it('résout le branding du MAH quand il existe', async () => {
    await setOrgHeader(ORG, 'data:image/png;base64,TENANT')
    await setPartyHeader(ORG, MAH, 'data:image/png;base64,MAH')
    const resolved = await getBrandingForParty(ORG, MAH)
    expect(resolved?.headerImage).toContain('MAH')
  })

  it('REPLI sur le branding tenant si le MAH n’a pas de branding (zéro régression)', async () => {
    await setOrgHeader(ORG, 'data:image/png;base64,TENANT')
    // MAH sans branding propre → on retombe sur le tenant.
    const resolved = await getBrandingForParty(ORG, MAH)
    expect(resolved?.headerImage).toContain('TENANT')
  })

  it('sans titulaire (produit non lié) → branding tenant', async () => {
    await setOrgHeader(ORG, 'data:image/png;base64,TENANT')
    const resolved = await getBrandingForParty(ORG, null)
    expect(resolved?.headerImage).toContain('TENANT')
  })
})
