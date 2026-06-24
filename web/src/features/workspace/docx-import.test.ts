// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { htmlToTiptap } from './docx-import'

describe('htmlToTiptap (import .docx → document éditable)', () => {
  it('convertit titres / gras / listes / tableaux en TipTap valide (édition native, zéro perte)', async () => {
    const html =
      '<h2>Rapport</h2><p>Un <strong>point</strong> important.</p>' +
      '<ul><li>a</li><li>b</li></ul>' +
      '<table><tr><td>Rubrique</td><td>Valeur</td></tr></table>'
    const json = await htmlToTiptap(html)
    expect(json).not.toBeNull() // validé par parseTiptapContent (sinon quarantaine = perte)
    const s = JSON.stringify(json)
    expect(s).toContain('Rapport')
    expect(s).toContain('Rubrique')
    expect(s).toContain('"type":"table"') // tableau préservé
    expect(s).toContain('"type":"bold"') // gras préservé
  })

  it('lien → texte (pas de marque link) ; image non supportée retirée, PNG conservé (dégradation, pas de rejet)', async () => {
    const html =
      '<p>Voir <a href="https://x.com">le site</a>.</p>' +
      '<p><img src="data:image/gif;base64,R0lGODlhAQ=="></p>' +
      '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>'
    const json = await htmlToTiptap(html)
    expect(json).not.toBeNull() // dégradé, PAS rejeté en bloc
    const s = JSON.stringify(json)
    expect(s).toContain('le site') // texte du lien conservé
    expect(s).not.toContain('"type":"link"') // marque link désactivée (sinon perte au pull)
    expect(s).not.toContain('image/gif') // image non supportée retirée
    expect(s).toContain('image/png') // PNG conservé
  })

  it('html vide ou blanc → null (rien à importer)', async () => {
    expect(await htmlToTiptap('')).toBeNull()
    expect(await htmlToTiptap('   ')).toBeNull()
  })
})
