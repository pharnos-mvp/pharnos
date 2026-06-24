// @vitest-environment jsdom
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import { FormatToolbar } from './toolbar'

const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }

/** Monte un vrai éditeur TipTap (StarterKit = historique inclus) + la barre de format. Le bouton
 *  « éditer » provoque une transaction pour vérifier que « Annuler » s'active réactivement. */
function Harness() {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false })],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }],
    },
  })
  return (
    <I18nContext.Provider value={i18n}>
      <FormatToolbar editor={editor} />
      <button type="button" onClick={() => editor?.commands.insertContent(' x')}>
        edit
      </button>
    </I18nContext.Provider>
  )
}

describe('FormatToolbar — Annuler / Rétablir', () => {
  it('boutons rendus ; « Annuler » désactivé à l’ouverture puis activé après une édition', async () => {
    render(<Harness />)
    // useEditor monte l'éditeur de façon asynchrone → la barre apparaît ensuite.
    const undo = await screen.findByRole('button', { name: 'Annuler' })
    expect(screen.getByRole('button', { name: 'Rétablir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gras' })).toBeInTheDocument()
    // Rien à annuler sur le contenu initial.
    expect(undo).toBeDisabled()

    // Une édition crée un pas d'historique → « Annuler » devient disponible (état réactif).
    fireEvent.click(screen.getByRole('button', { name: 'edit' }))
    expect(await screen.findByRole('button', { name: 'Annuler' })).toBeEnabled()
  })
})
