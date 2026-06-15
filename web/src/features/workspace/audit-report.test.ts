import { describe, expect, it } from 'vitest'

import { buildAuditReport, pieceStatus, type AuditData, type AuditPiece } from './audit-report'
import type { RegafyFinding } from './regafy'

const f = (over: Partial<RegafyFinding>): RegafyFinding => ({
  id: 'x',
  nodeNumber: '1.3.1',
  nodeLabel: 'RCP',
  severity: 'warning',
  message: 'msg',
  source: 'ai',
  ...over,
})

const piece = (over: Partial<AuditPiece>): AuditPiece => ({
  name: 'rcp_en.pdf',
  nodeNumber: '1.3.1',
  nodeLabel: 'RCP, notice et étiquetage',
  docType: 'rcp',
  kind: 'template',
  findings: [],
  ...over,
})

const data = (over: Partial<AuditData>): AuditData => ({
  productName: 'Paracétamol 500',
  countryName: 'Bénin',
  countryCode: 'BJ',
  agency: 'ABMed',
  format: 'CTD UEMOA',
  activity: 'Nouvelle AMM',
  date: '2026-06-12',
  pieces: [],
  structural: [],
  ...over,
})

describe('buildAuditReport — rapport déterministe (zéro hallucination par construction)', () => {
  it('dossier sans écart : 6 sections, synthèse positive, conclusion apte', () => {
    const r = buildAuditReport(
      data({ pieces: [piece({ findings: [f({ ok: true, severity: 'info' })] })] }),
    )
    expect(r.title).toBe("RAPPORT D'AUDIT DE CONFORMITÉ RÉGLEMENTAIRE")
    expect(r.sections).toHaveLength(6)
    expect(r.sections[2]!.items).toContain('Documents examinés : 1')
    expect(r.sections[2]!.items).toContain('Conformes : 1')
    expect(r.sections[2]!.paragraphs![0]).toMatch(/apte à la compilation/)
    expect(r.sections[3]!.paragraphs![0]).toMatch(/Aucun constat/)
    expect(r.sections[5]!.paragraphs![0]).toMatch(/aucun écart de conformité/)
    // Métadonnées citées telles quelles.
    expect(r.sections[0]!.rows).toContainEqual(['Produit', 'Paracétamol 500'])
    expect(r.subtitle).toBe('Paracétamol 500 — Bénin (ABMed)')
  })

  it('constat template : document CITÉ (nœud + fichier), rubriques manquantes énumérées, action recommandée', () => {
    const r = buildAuditReport(
      data({
        pieces: [
          piece({
            findings: [
              f({
                message: 'RCP : non conforme au template en vigueur et rédigé en EN.',
                upgrade: true,
                translate: true,
                missing: ['4.6 Grossesse et allaitement', '10. Date de mise à jour'],
              }),
            ],
          }),
        ],
      }),
    )
    const detail = r.sections[3]!.items![0]!
    expect(detail).toContain('1.3.1 RCP, notice et étiquetage — « rcp_en.pdf »')
    expect(detail).toContain('document à template RCP')
    expect(detail).toContain('non conforme au template en vigueur et rédigé en EN')
    expect(detail).toContain(
      'Rubriques manquantes : 4.6 Grossesse et allaitement ; 10. Date de mise à jour.',
    )
    expect(detail).toMatch(/remplir le template en vigueur, traduire vers le français/)
    expect(r.sections[5]!.paragraphs![0]).toMatch(/n'est pas prêt pour soumission/)
  })

  it('pièce admin en erreur : statut non conforme + recommandation de remplacement', () => {
    const p = piece({
      name: 'gmp_2019.pdf',
      docType: 'gmp',
      kind: 'admin',
      nodeNumber: '1.2.4',
      nodeLabel: 'Bonnes pratiques de fabrication',
      findings: [f({ severity: 'error', message: 'GMP expiré (2025-01-01).' })],
    })
    expect(pieceStatus(p)).toBe('non conforme')
    const r = buildAuditReport(data({ pieces: [p] }))
    expect(r.sections[3]!.items![0]).toContain('« gmp_2019.pdf » (pièce administrative)')
    expect(r.sections[3]!.items![0]).toContain('Remplacer la pièce')
  })

  it('constats structurels : sections manquantes énumérées une par une (section 5)', () => {
    const r = buildAuditReport(
      data({
        structural: [
          f({
            nodeNumber: '1.1.1',
            nodeLabel: 'Lettre de demande',
            severity: 'warning',
            message: 'Section validée sans document.',
            missing: ['Lettre de demande signée'],
          }),
          f({
            nodeNumber: '',
            nodeLabel: 'Dossier',
            severity: 'warning',
            message: 'Titulaire ≠ fabricant : contrat (licence/fabrication) non fourni.',
          }),
        ],
      }),
    )
    expect(r.sections[4]!.items).toContain('1.1.1 Lettre de demande : Lettre de demande signée')
    expect(
      r.sections[4]!.items!.some((i) => i.includes('contrat (licence/fabrication) non fourni')),
    ).toBe(true)
    expect(r.sections[2]!.items).toContain('Constats structurels (arborescence) : 2')
  })

  it("rien d'inventé : le rapport ne contient que les messages des constats fournis", () => {
    const r = buildAuditReport(
      data({ pieces: [piece({ findings: [f({ message: 'MSG-UNIQUE-42' })] })] }),
    )
    const text = JSON.stringify(r)
    expect(text).toContain('MSG-UNIQUE-42')
    // Aucune autre « citation » de constat que celle fournie.
    expect(r.sections[3]!.items).toHaveLength(1)
  })

  it('en-tête « Outil », signature et nom de fichier (point 14)', () => {
    const r = buildAuditReport(data({ productName: 'Gynoril ovule', countryCode: 'BJ' }))
    expect(r.sections[0]!.rows).toContainEqual(['Outil', 'Regafy AI, RA Copilot'])
    expect(r.footer).toBe('© Regafy AI, 2026-06-12 ---- by Pharnos')
    expect(r.fileTitle).toBe('Gynoril ovule_M1_bj_Audit')
  })
})
