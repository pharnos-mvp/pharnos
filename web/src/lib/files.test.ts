import { describe, expect, it } from 'vitest'

import { contentTypeFor, isAllowedUpload, sanitizeFileName, storageObjectKey } from './files'

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

describe('storageObjectKey — la CLÉ Storage, pas le nom affiché', () => {
  it('RÉGRESSION : un nom accentué ne fait plus échouer l’upload (Invalid key)', () => {
    // Cas réel de production (Sentry JAVASCRIPT-REACT-B) : Supabase Storage refusait la clé à
    // cause du « é » de « complétude », et la pièce ne partait jamais.
    expect(storageObjectKey('KV-NS_Fiche de complétude ENR (2).pdf')).toBe(
      'KV-NS_Fiche de completude ENR (2).pdf',
    )
  })

  it('translittère les diacritiques français, casse préservée', () => {
    expect(storageObjectKey('ÉTIQUETAGE_çà-et-là.docx')).toBe('ETIQUETAGE_ca-et-la.docx')
  })

  it('ne produit QUE des caractères déjà observés en production dans le bucket', () => {
    const exotiques = 'Ωμέγα 日本語 emoji🙂 «guillemets» ™.pdf'
    expect(storageObjectKey(exotiques)).toMatch(/^[A-Za-z0-9 ._'()-]+$/)
  })

  it('laisse intact ce qui est déjà conforme (aucun renommage gratuit)', () => {
    // Ces caractères existent déjà dans les 198 objets du bucket : ils DOIVENT survivre.
    const conforme = "KV-Para_Lettre de demande de Variation mineur d'AMM.pdf"
    expect(storageObjectKey(conforme)).toBe(conforme)
  })

  it('n’est jamais vide (une clé vide ferait un chemin terminé par « / »)', () => {
    expect(storageObjectKey('🙂🙂🙂')).not.toBe('')
    expect(storageObjectKey('')).toBe('document')
  })

  it('le nom AFFICHÉ garde ses accents — les deux ne se confondent pas', () => {
    const name = 'Fiche de complétude.pdf'
    expect(sanitizeFileName(name)).toBe(name)
    expect(storageObjectKey(name)).not.toBe(name)
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

describe('contentTypeFor', () => {
  it('garde le MIME navigateur quand il est dans l’allowlist', () => {
    expect(contentTypeFor({ name: 'x.pdf', type: 'application/pdf' })).toBe('application/pdf')
    expect(contentTypeFor({ name: 'x.png', type: 'image/png' })).toBe('image/png')
  })

  it('dérive de l’extension quand le MIME est vide/octet-stream (Windows)', () => {
    // Sans ce repli, un PDF stocké en octet-stream serait refusé par la allowed_mime_types du bucket.
    expect(contentTypeFor({ name: 'scan.pdf', type: '' })).toBe('application/pdf')
    expect(contentTypeFor({ name: 'scan.pdf', type: 'application/octet-stream' })).toBe(
      'application/pdf',
    )
    expect(contentTypeFor({ name: 'photo.JPG', type: null })).toBe('image/jpeg')
  })

  it('repli sur octet-stream pour une extension inconnue', () => {
    expect(contentTypeFor({ name: 'mystery.bin', type: '' })).toBe('application/octet-stream')
  })
})
