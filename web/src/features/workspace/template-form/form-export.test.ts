import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import { buildFormDocument, formDocxBlob } from './form-docx'
import { buildFormPrintHtml } from './form-print'
import { emptyFormState, initialFormState } from './form-types'
import { LABELING_FORM_DEFINITION } from './labeling-form-model'
import { NOTICE_FORM_DEFINITION } from './notice-form-model'
import { RCP_FORM_DEFINITION, RCP_FORM_MODEL } from './rcp-form-model'

const product = {
  nomCommercial: 'KV-Kacin 500',
  dci: 'Amikacine',
  dosage: '500 mg / 2 ml',
  forme: 'Solution injectable',
} as ProductRecord

describe('buildFormPrintHtml (export PDF — rendu final)', () => {
  it('RCP : structure officielle + saisies/options cochées uniquement (format gabarit)', () => {
    const state = emptyFormState(RCP_FORM_MODEL)
    state.values.denomination = 'KV-Kacin 500'
    state.values.classe_pharma = 'Aminosides'
    state.checks.incompat_chk = [0]
    const html = buildFormPrintHtml(RCP_FORM_DEFINITION, state)
    expect(html).toContain('RESUME DES CARACTERISTIQUES DU PRODUIT')
    expect(html).toContain('KV-Kacin 500')
    expect(html).toContain('Classe pharmacothérapeutique : ')
    expect(html).toContain('<li>Sans objet.</li>')
    expect(html).toContain('vigilances.abmed@gouv.bj')
    expect(html).not.toContain('[À COMPLÉTER]')
    expect(html).not.toContain('Tél. : ')
    expect(html).toContain('size: A4; margin: 25.4mm')
    expect(html).toContain('#263F73')
  })

  it('Notice : textes dynamiques résolus (verbe/HCP), dependsOn respecté', () => {
    const state = initialFormState(NOTICE_FORM_DEFINITION, product)
    state.globals = {
      verb: 'utiliser',
      hcp: { medecin: true, pharmacien: false, infirmier: false },
    }
    state.checks.deterioration = [0]
    state.values.deterioration_txt = 'Changement de couleur.'
    const html = buildFormPrintHtml(NOTICE_FORM_DEFINITION, state)
    expect(html).toContain('NOTICE : INFORMATION DE L’UTILISATEUR')
    expect(html).toContain('avant d’utiliser ce médicament')
    expect(html).toContain('COMMENT UTILISER CE MEDICAMENT')
    expect(html).toContain('Changement de couleur.')
    // L'encadré (bullets) toujours exporté.
    expect(html).toContain('Gardez cette notice.')
    // Champ dépendant d'une case décochée → absent.
    expect(html).not.toContain('Posologie chez les enfants')
  })

  it('Étiquetage : bandeaux gris .p-banner + mentions statiques', () => {
    const state = initialFormState(LABELING_FORM_DEFINITION, product)
    state.values.fab_date = '01/2026'
    state.checks.picto_chk = [2]
    const html = buildFormPrintHtml(LABELING_FORM_DEFINITION, state)
    expect(html).toContain('p-banner')
    expect(html).toContain('DENOMINATION DU MEDICAMENT')
    expect(html).toContain('FAB 01/2026')
    expect(html).toContain('Lire la notice avant utilisation.')
    expect(html).toContain('<li>Sans objet.</li>')
  })

  it('échappe le HTML des saisies (aucune injection dans la fenêtre d’impression)', () => {
    const state = emptyFormState(RCP_FORM_MODEL)
    state.values.denomination = '<script>alert(1)</script> & Cie'
    const html = buildFormPrintHtml(RCP_FORM_DEFINITION, state)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cie')
  })
})

describe('buildFormDocument (export DOCX)', () => {
  it('construit un Document et un blob .docx non vide pour les trois formulaires', async () => {
    for (const def of [RCP_FORM_DEFINITION, NOTICE_FORM_DEFINITION, LABELING_FORM_DEFINITION]) {
      const state = initialFormState(def, product)
      state.checks[Object.keys(state.checks)[0]!] = [0]
      expect(() => buildFormDocument(def, state)).not.toThrow()
      const blob = await formDocxBlob(def, state)
      expect(blob.size).toBeGreaterThan(1000)
    }
  })
})
