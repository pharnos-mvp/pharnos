import { describe, expect, it, vi } from 'vitest'

import { packageFingerprint, runMeteredCompile } from './metered-compile'
import type { CompileGate } from './use-org-plan'

const OK: CompileGate = { allowed: true, billed: true, cap: 5, used: 1, remaining: 4 }
const GRACE: CompileGate = { allowed: true, billed: false, cap: 5, used: 1, remaining: 4 }
const FULL: CompileGate = {
  allowed: false,
  reason: 'quota_exceeded',
  cap: 1,
  used: 1,
  remaining: 0,
}

/** Fabrique les trois étapes, en traçant l'ordre réel des appels. */
function steps(over: {
  metered?: boolean
  pre?: CompileGate
  rec?: CompileGate
  compile?: () => Promise<string>
}) {
  const calls: string[] = []
  const s = {
    metered: over.metered ?? true,
    preflight: vi.fn(async () => {
      calls.push('preflight')
      return over.pre ?? OK
    }),
    compile:
      over.compile ??
      vi.fn(async () => {
        calls.push('compile')
        return 'pdf'
      }),
    record: vi.fn(async (produced: string) => {
      calls.push(`record(${produced})`)
      return over.rec ?? OK
    }),
  }
  return { s, calls }
}

describe('runMeteredCompile', () => {
  it('ordonne préflight → fabrication → enregistrement', async () => {
    const { s, calls } = steps({})
    const out = await runMeteredCompile(s)
    expect(calls).toEqual(['preflight', 'compile', 'record(pdf)'])
    expect(out).toEqual({ ok: true, value: 'pdf', gate: OK })
  })

  it('au plafond : refuse AVANT de fabriquer — rien n’est compilé ni enregistré', async () => {
    const { s, calls } = steps({ pre: FULL })
    const out = await runMeteredCompile(s)
    expect(calls).toEqual(['preflight'])
    expect(s.compile).not.toHaveBeenCalled()
    expect(s.record).not.toHaveBeenCalled()
    expect(out).toEqual({ ok: false, gate: FULL })
  })

  it('fabrication en échec : AUCUN crédit consommé (le correctif de l’audit)', async () => {
    const boom = vi.fn(async () => {
      throw new Error('pdf-lib a explosé')
    })
    const { s } = steps({ compile: boom as unknown as () => Promise<string> })
    await expect(runMeteredCompile(s)).rejects.toThrow('pdf-lib a explosé')
    expect(s.record).not.toHaveBeenCalled()
  })

  it('quota épuisé pendant la fabrication : rien n’est livré', async () => {
    const { s, calls } = steps({ rec: FULL })
    const out = await runMeteredCompile(s)
    expect(calls).toEqual(['preflight', 'compile', 'record(pdf)'])
    expect(out).toEqual({ ok: false, gate: FULL })
  })

  it('fenêtre de grâce : la recompilation passe et ne facture pas', async () => {
    const { s } = steps({ pre: GRACE, rec: GRACE })
    const out = await runMeteredCompile(s)
    // `out.ok && out.gate?.billed` vaudrait aussi false si `ok` était false : on désambiguïse.
    expect(out).toEqual({ ok: true, value: 'pdf', gate: GRACE })
  })

  it('l’enregistrement reçoit ce qui vient d’être fabriqué — c’est de là que sort l’empreinte', async () => {
    const { s } = steps({})
    await runMeteredCompile(s)
    expect(s.record).toHaveBeenCalledWith('pdf')
  })

  it('hors ligne : on compile sans appeler le serveur, et sans rien compter', async () => {
    const { s, calls } = steps({ metered: false })
    const out = await runMeteredCompile(s)
    expect(calls).toEqual(['compile'])
    expect(s.preflight).not.toHaveBeenCalled()
    expect(s.record).not.toHaveBeenCalled()
    expect(out).toEqual({ ok: true, value: 'pdf' })
  })
})

describe('packageFingerprint', () => {
  // Le vecteur canonique : SHA-256 de la chaîne vide. Si cette constante change, c'est l'identité
  // du paquet qui change — et toutes les récupérations déjà payées redeviendraient facturables.
  const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  it('produit un SHA-256 hexadécimal minuscule de 64 caractères', async () => {
    expect(await packageFingerprint(new Uint8Array())).toBe(SHA256_EMPTY)
  })

  it('accepte indifféremment un Uint8Array et son ArrayBuffer', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    expect(await packageFingerprint(bytes)).toBe(
      await packageFingerprint(bytes.slice().buffer as ArrayBuffer),
    )
  })

  it('une VUE partielle ne hache que ses propres octets, pas le buffer sous-jacent', async () => {
    const backing = new Uint8Array([9, 9, 0x25, 0x50, 0x44, 0x46, 9])
    const view = backing.subarray(2, 6)
    expect(await packageFingerprint(view)).toBe(
      await packageFingerprint(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    )
  })

  it('deux contenus différents ont deux empreintes différentes', async () => {
    expect(await packageFingerprint(new Uint8Array([1]))).not.toBe(
      await packageFingerprint(new Uint8Array([2])),
    )
  })
})
