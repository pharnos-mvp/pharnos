import { describe, expect, it } from 'vitest'

import { isAllowedUpload, sanitizeFileName } from './files'

describe('sanitizeFileName', () => {
  it('laisse passer un nom sain (accents inclus)', () => {
    expect(sanitizeFileName('Décret n°123 — AMM.pdf')).toBe('Décret n°123 — AMM.pdf')
  })

  it('neutralise les séparateurs de chemin (anti path-traversal)', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(sanitizeFileName('..\\..\\boot.ini')).toBe('.._.._boot.ini')
  })

  it('retire contrôles et caractères réservés Windows', () => {
    expect(sanitizeFileName('rap\u0007port<final>:v2?.pdf')).toBe('rapport_final__v2_.pdf')
  })

  it('normalise les espaces et les fins de nom interdites', () => {
    expect(sanitizeFileName('  mon    fichier  .pdf  ')).toBe('mon fichier .pdf')
    expect(sanitizeFileName('sans-extension...')).toBe('sans-extension')
  })

  it('borne la longueur à 120 en préservant l’extension', () => {
    const long = 'a'.repeat(300) + '.pdf'
    const out = sanitizeFileName(long)
    expect(out.length).toBeLessThanOrEqual(120)
    expect(out.endsWith('.pdf')).toBe(true)
  })

  it('repli sur « document » si le nom est vide après nettoyage', () => {
    expect(sanitizeFileName('')).toBe('document')
    expect(sanitizeFileName('\u0001\u0002 . ')).toBe('document')
  })
})

describe('isAllowedUpload', () => {
  it('accepte PDF, images et bureautique par MIME', () => {
    expect(isAllowedUpload({ name: 'x.pdf', type: 'application/pdf' })).toBe(true)
    expect(isAllowedUpload({ name: 'x.png', type: 'image/png' })).toBe(true)
    expect(
      isAllowedUpload({
        name: 'x.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBe(true)
  })

  it('accepte par extension quand le MIME est vide/générique (Windows)', () => {
    expect(isAllowedUpload({ name: 'scan.pdf', type: '' })).toBe(true)
    expect(isAllowedUpload({ name: 'photo.JPG', type: 'application/octet-stream' })).toBe(true)
  })

  it('refuse les types à risque (html, svg, exécutables…)', () => {
    expect(isAllowedUpload({ name: 'page.html', type: 'text/html' })).toBe(false)
    expect(isAllowedUpload({ name: 'logo.svg', type: 'image/svg+xml' })).toBe(false)
    expect(isAllowedUpload({ name: 'setup.exe', type: 'application/x-msdownload' })).toBe(false)
    expect(isAllowedUpload({ name: 'script.js', type: 'text/javascript' })).toBe(false)
  })
})
