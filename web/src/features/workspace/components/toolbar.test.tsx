// @vitest-environment jsdom
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import { FormatToolbar } from './toolbar'

const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }

/** Monte un vrai éditeur TipTap avec la MÊME config que RichTextEditor (StarterKit = historique +
 *  extension-table) + la barre de format. Boutons utilitaires pour piloter l'éditeur dans les tests. */
function Harness() {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
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
      <button
        type="button"
        onClick={() => editor?.chain().focus().insertTable({ rows: 2, cols: 2 }).run()}
      >
        insert-table
      </button>
      <EditorContent editor={editor} />
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
    expect(screen.getByRole('button', { name: 'Tableau' })).toBeInTheDocument()
    // Rien à annuler sur le contenu initial.
    expect(undo).toBeDisabled()

    // Une édition crée un pas d'historique → « Annuler » devient disponible (état réactif).
    fireEvent.click(screen.getByRole('button', { name: 'edit' }))
    expect(await screen.findByRole('button', { name: 'Annuler' })).toBeEnabled()
  })
})

describe('FormatToolbar — tableaux (extension-table)', () => {
  it('l’éditeur accepte un tableau : insertTable rend un <table> dans le document', async () => {
    const { container } = render(<Harness />)
    await screen.findByRole('button', { name: 'Tableau' })
    expect(container.querySelector('table')).toBeNull()
    // Config réelle (Table/Row/Header/Cell) → la commande insère et rend un vrai tableau.
    fireEvent.click(screen.getByRole('button', { name: 'insert-table' }))
    expect(container.querySelector('table')).not.toBeNull()
    // 2×2 (avec ligne d'en-tête par défaut) → au moins 2 lignes, des cellules.
    expect(container.querySelectorAll('tr').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelectorAll('td, th').length).toBeGreaterThanOrEqual(4)
  })
})
