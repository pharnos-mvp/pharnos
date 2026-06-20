import { describe, expect, it } from 'vitest'

import { buildLetterContext, emptyLetterFields, letterFieldsFromValues } from './letter-context'
import { letterDocToHtml } from './letter-render'
import { TEMPLATES } from './templates'

describe('buildLetterContext (lettre standalone Bibliothèque, pilotée par pays)', () => {
  it('le pays cible remplit le destinataire (agence + civilité + ville depuis l’adresse)', () => {
    const f = { ...emptyLetterFields('BJ'), demandeurAdresse: 'Aban House, Cotonou - 12345, Bénin' }
    const fr = buildLetterContext(f, 'fr')
    expect(fr.agencyFull).toContain('Agence Béninoise du Médicament')
    expect(fr.agencyFull).toContain('(ABMed)')
    expect(fr.agencyCivilite).toContain('Directeur') // directeur BJ = M
    expect(fr.ville).toBe('Cotonou') // extrait de l’adresse du demandeur
    const en = buildLetterContext(f, 'en')
    expect(en.agencyCiviliteEn).toBe('The Director General')
  })

  it('champs vides → marqueurs localisés (FR/EN)', () => {
    expect(buildLetterContext(emptyLetterFields('SN'), 'fr').nomCommercial).toBe('[Nom commercial]')
    expect(buildLetterContext(emptyLetterFields('SN'), 'en').nomCommercial).toBe('[Trade name]')
  })

  it('letterFieldsFromValues lit les valeurs persistées (repli sur les défauts)', () => {
    const f = letterFieldsFromValues({ country: 'ML', nomCommercial: 'X' })
    expect(f.country).toBe('ML')
    expect(f.nomCommercial).toBe('X')
    expect(f.pght).toBe('')
  })
})

describe('letterDocToHtml (rendu A4 générique du courrier)', () => {
  it('rend l’alignement à droite, les puces et le gras depuis le doc de lettre', () => {
    const ctx = buildLetterContext({ ...emptyLetterFields('CI'), nomCommercial: 'KV-Kacin' }, 'fr')
    const html = letterDocToHtml(TEMPLATES.cover.build(ctx, 'fr'))
    expect(html).toContain('class="l-p l-r"') // date / destinataire alignés à droite
    expect(html).toContain('<ul class="l-ul">') // liste des infos produit
    expect(html).toContain('<strong>') // libellés en gras
    expect(html).toContain('KV-Kacin')
  })

  it('échappe le HTML des valeurs saisies (anti-injection)', () => {
    const ctx = buildLetterContext(
      { ...emptyLetterFields('CI'), nomCommercial: '<script>x</script>' },
      'fr',
    )
    const html = letterDocToHtml(TEMPLATES.cover.build(ctx, 'fr'))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
