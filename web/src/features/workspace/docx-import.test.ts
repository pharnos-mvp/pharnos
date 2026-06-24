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

  it('html vide ou blanc → null (rien à importer)', async () => {
    expect(await htmlToTiptap('')).toBeNull()
    expect(await htmlToTiptap('   ')).toBeNull()
  })
})
