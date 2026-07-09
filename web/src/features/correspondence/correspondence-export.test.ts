import { describe, expect, it } from 'vitest'

import type { CorrespondenceMessageRecord, CorrespondenceRecord } from '@/lib/db'

import { buildThreadExportHtml } from './correspondence-export'

/**
 * Export PDF du fil (Correspondance v3, LOT 10) — le générateur est PUR : on teste l'échappement
 * (saisie hostile), les pastilles de décision, les pièces, la traçabilité du pied de page, FR/EN.
 */

const NOW = new Date('2026-07-04T10:00:00.000Z')

const corr = (over: Partial<CorrespondenceRecord> = {}): CorrespondenceRecord => ({
  id: 'c1',
  orgId: 'org1',
  dossierId: 'd1',
  productName: 'Amoxicilline 500 mg',
  country: 'BJ',
  activity: 'enregistrement',
  senderEmail: 'ra@labo.example',
  recipientEmail: 'agent@cotonou.example',
  note: null,
  pdfPath: 'org1/shares/c1/dossier.pdf',
  pdfSize: 1024,
  tokenHash: 'x',
  passwordHash: null,
  status: 'accepted',
  decidedAt: '2026-07-01T09:00:00.000Z',
  revokedAt: null,
  expiresAt: null,
  autoRevokeOnDecision: false,
  createdAt: '2026-06-20T08:00:00.000Z',
  updatedAt: '2026-07-01T09:00:00.000Z',
  deletedAt: null,
  ...over,
})

const msg = (over: Partial<CorrespondenceMessageRecord> = {}): CorrespondenceMessageRecord => ({
  id: 'm1',
  orgId: 'org1',
  correspondenceId: 'c1',
  author: 'recipient',
  authorLabel: 'agent@cotonou.example',
  kind: 'comment',
  decision: null,
  body: 'Bien reçu.',
  attachments: [],
  createdAt: '2026-06-21T10:00:00.000Z',
  ...over,
})

describe('buildThreadExportHtml (export d’audit du fil)', () => {
  it('document autonome : en-tête dossier + messages + pied de traçabilité', () => {
    const html = buildThreadExportHtml({
      correspondence: corr(),
      messages: [
        msg({
          id: 'm1',
          kind: 'note',
          author: 'sender',
          authorLabel: 'ra@labo.example',
          body: 'Envoi initial',
        }),
        msg({ id: 'm2', kind: 'decision', decision: 'accepted', body: 'RAS' }),
      ],
      lang: 'fr',
      exportedBy: 'ra@labo.example',
      now: NOW,
    })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Correspondance — Amoxicilline 500 mg')
    expect(html).toContain('Bénin')
    expect(html).toContain('agent@cotonou.example')
    expect(html).toContain('Envoi initial')
    expect(html).toContain('Dossier accepté') // pastille décision
    expect(html).toContain('Exporté par ra@labo.example')
    expect(html).toContain('2 message(s)')
    // CSP-safe : AUCUN script dans le document (l'impression part du JS de l'app, iframe srcdoc —
    // un script inline serait bloqué par `script-src 'self'` en prod) + charset déclaré (accents).
    expect(html).not.toContain('<script')
    expect(html).toContain('<meta charset="utf-8"')
  })

  it('échappe TOUT contenu utilisateur (messages, e-mails, produit) — saisie hostile', () => {
    const html = buildThreadExportHtml({
      correspondence: corr({
        productName: 'Produit <img src=x onerror=alert(1)>',
        recipientEmail: '"><script>steal()</script>@evil.example',
      }),
      messages: [msg({ body: '<script>alert("xss")</script> & <b>gras</b>' })],
      lang: 'fr',
      exportedBy: 'ra@labo.example',
      now: NOW,
    })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<script>steal')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &lt;b&gt;gras&lt;/b&gt;',
    )
  })

  it('pièces jointes : nom + taille lisible, jamais d’URL (document d’archive)', () => {
    const html = buildThreadExportHtml({
      correspondence: corr(),
      messages: [
        msg({
          attachments: [
            {
              path: 'org1/shares/c1/recipient/a.pdf',
              name: 'récépissé.pdf',
              size: 2 * 1024 * 1024,
              mime: 'application/pdf',
            },
          ],
        }),
      ],
      lang: 'fr',
      exportedBy: 'ra@labo.example',
      now: NOW,
    })
    expect(html).toContain('récépissé.pdf')
    // Taille via le formatteur unique `lib/format-bytes` (localisé, sans zéro superflu) : « 2 Mo ».
    expect(html).toContain('2 Mo')
    expect(html).not.toContain('org1/shares') // les chemins Storage ne fuient pas dans l'export
  })

  it('EN : libellés traduits', () => {
    const html = buildThreadExportHtml({
      correspondence: corr(),
      messages: [],
      lang: 'en',
      exportedBy: 'ra@labo.example',
      now: NOW,
    })
    expect(html).toContain('Correspondence — Amoxicilline 500 mg')
    expect(html).toContain('Exported by')
    expect(html).toContain('No messages.')
  })
})
