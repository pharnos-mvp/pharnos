import { describe, expect, it } from 'vitest'

import { emptyRcpFormState, rcpExportName } from './rcp-form-model'
import { buildRcpPrintHtml } from './rcp-form-print'
import { buildRcpFormDocument, rcpFormDocxBlob } from './rcp-form-docx'

describe('buildRcpPrintHtml (export PDF — rendu final)', () => {
  it('contient la structure officielle et UNIQUEMENT les saisies/options cochées', () => {
    const state = emptyRcpFormState()
    state.values.denomination = 'KV-Kacin 500'
    state.values.classe_pharma = 'Aminosides'
    state.checks.incompat_chk = [0]
    const html = buildRcpPrintHtml(state)
    expect(html).toContain('RESUME DES CARACTERISTIQUES DU PRODUIT')
    expect(html).toContain('CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE')
    expect(html).toContain('KV-Kacin 500')
    expect(html).toContain('Classe pharmacothérapeutique : ')
    expect(html).toContain('<li>Sans objet.</li>')
    // Mentions statiques toujours exportées ; placeholders jamais.
    expect(html).toContain('vigilances.abmed@gouv.bj')
    expect(html).not.toContain('[À COMPLÉTER]')
    // Champ vide → la ligne n'apparaît pas.
    expect(html).not.toContain('Tél. : ')
    // Styles du gabarit CEO (A4, navy).
    expect(html).toContain('size: A4; margin: 25.4mm')
    expect(html).toContain('#263F73')
  })

  it('échappe le HTML des saisies (aucune injection dans la fenêtre d’impression)', () => {
    const state = emptyRcpFormState()
    state.values.denomination = '<script>alert(1)</script> & Cie'
    const html = buildRcpPrintHtml(state)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cie')
  })
})

describe('rcpExportName', () => {
  it('slug « RCP_<dénomination> » (40 caractères max)', () => {
    const state = emptyRcpFormState()
    expect(rcpExportName(state)).toBe('RCP')
    state.values.denomination = 'KV-Kacin 500 mg / 2 ml, solution injectable'
    expect(rcpExportName(state)).toBe('RCP_KV_Kacin_500_mg_2_ml_solution_injectable')
    state.values.denomination = 'Dénomination particulièrement longue qui dépasse la limite fixée'
    expect(rcpExportName(state).length).toBeLessThanOrEqual(44) // 'RCP_' + 40
  })
})

describe('buildRcpFormDocument (export DOCX)', () => {
  it('construit un Document et un blob .docx non vide', async () => {
    const state = emptyRcpFormState()
    state.values.denomination = 'KV-Kacin 500'
    state.checks.prescription_chk = [2]
    expect(() => buildRcpFormDocument(state)).not.toThrow()
    const blob = await rcpFormDocxBlob(state)
    expect(blob.size).toBeGreaterThan(1000)
  })
})
