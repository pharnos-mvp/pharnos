import { describe, expect, it } from 'vitest'

import { normalizeError } from './sentry'

describe('normalizeError', () => {
  it('laisse passer une Error telle quelle, contexte = extra', () => {
    const err = new Error('boom')
    const out = normalizeError(err, { op: 'sync' })
    expect(out.error).toBe(err)
    expect(out.extra).toEqual({ op: 'sync' })
  })

  it('transforme une erreur Supabase {code,details,hint,message} en Error lisible', () => {
    const out = normalizeError(
      { code: '23505', message: 'duplicate key value', details: 'Key (id)=(x)', hint: null },
      { op: 'sync', entity: 'products' },
    )
    expect(out.error).toBeInstanceOf(Error)
    expect(out.error.message).toBe('duplicate key value')
    expect(out.error.name).toBe('SupabaseError(23505)')
    // code/details versés au contexte (hint null ignoré), contexte d'appel préservé
    expect(out.extra).toEqual({
      op: 'sync',
      entity: 'products',
      code: '23505',
      details: 'Key (id)=(x)',
    })
  })

  it('objet sans message → message générique (jamais « Object captured… »)', () => {
    const out = normalizeError({ foo: 1 })
    expect(out.error.message).toBe('Erreur non-Error capturée')
  })

  it('chaîne ou primitive → Error', () => {
    expect(normalizeError('panne réseau').error.message).toBe('panne réseau')
    expect(normalizeError(42).error.message).toContain('42')
  })
})
