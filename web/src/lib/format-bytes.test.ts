import { describe, expect, it } from 'vitest'

import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('affiche les octets bruts sous 1 Ko', () => {
    expect(formatBytes(0)).toBe('0 o')
    expect(formatBytes(512)).toBe('512 o')
    expect(formatBytes(1023)).toBe('1023 o')
  })

  it('convertit en Ko/Mo/Go/To (base 1024)', () => {
    expect(formatBytes(1024)).toBe('1 Ko')
    expect(formatBytes(10 * 1024 ** 2)).toBe('10 Mo')
    expect(formatBytes(3 * 1024 ** 4)).toBe('3 To')
  })

  it('garde 1 décimale sous 10, localisée en virgule (FR)', () => {
    expect(formatBytes(1536)).toBe('1,5 Ko')
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1,5 Go')
    // ≥ 10 → entier (pas de décimale)
    expect(formatBytes(10.4 * 1024 ** 2)).toBe('10 Mo')
  })

  it('unités et décimale anglaises sous UI EN', () => {
    expect(formatBytes(512, 'en')).toBe('512 B')
    expect(formatBytes(1536, 'en')).toBe('1.5 KB')
    expect(formatBytes(1.5 * 1024 ** 3, 'en')).toBe('1.5 GB')
  })
})
