import { describe, expect, it } from 'vitest'

import { withRetry } from './retry'

const failTimes = (n: number, error: unknown) => {
  let calls = 0
  return {
    fn: () => {
      calls++
      if (calls <= n) return Promise.reject(error)
      return Promise.resolve('ok')
    },
    calls: () => calls,
  }
}

describe('withRetry (sync client)', () => {
  it('succès direct → un seul appel', async () => {
    const { fn, calls } = failTimes(0, null)
    await expect(withRetry(fn, { baseMs: 1 })).resolves.toBe('ok')
    expect(calls()).toBe(1)
  })

  it('erreur réseau (TypeError) → re-tente puis réussit', async () => {
    const { fn, calls } = failTimes(1, new TypeError('Failed to fetch'))
    await expect(withRetry(fn, { baseMs: 1 })).resolves.toBe('ok')
    expect(calls()).toBe(2)
  })

  it('503 (status) → re-tente ; borné au nombre de tentatives', async () => {
    const err = Object.assign(new Error('Service Unavailable'), { status: 503 })
    const { fn, calls } = failTimes(99, err)
    await expect(withRetry(fn, { attempts: 3, baseMs: 1 })).rejects.toBe(err)
    expect(calls()).toBe(3)
  })

  it('statusCode string « 500 » (storage-js) → transitoire', async () => {
    const err = Object.assign(new Error('Internal'), { statusCode: '500' })
    const { fn, calls } = failTimes(1, err)
    await expect(withRetry(fn, { baseMs: 1 })).resolves.toBe('ok')
    expect(calls()).toBe(2)
  })

  it('erreur RLS/4xx déterministe → AUCUN retry', async () => {
    const err = Object.assign(new Error('permission denied'), { status: 403 })
    const { fn, calls } = failTimes(99, err)
    await expect(withRetry(fn, { baseMs: 1 })).rejects.toBe(err)
    expect(calls()).toBe(1)
  })

  it('erreur applicative sans status → AUCUN retry', async () => {
    const err = new Error('validation métier')
    const { fn, calls } = failTimes(99, err)
    await expect(withRetry(fn, { baseMs: 1 })).rejects.toBe(err)
    expect(calls()).toBe(1)
  })
})
