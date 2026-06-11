import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'

import { updateGeneratedDocContent } from './generated-docs-repository'
import { syncGeneratedDocs } from './generated-docs-sync'

/**
 * Sauvegarde débouncée des documents générés (extrait move-only de DossierWorkspacePage — T7.3) :
 * chaque édition TipTap est écrite 700 ms après la dernière frappe, flushée immédiatement au
 * changement de section et au démontage (navigation) — aucune édition n'est jamais perdue.
 */
export function useDebouncedDocSave(orgId: string) {
  const [editorState, setEditorState] = useState<{ id: string; ed: Editor } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<{ id: string; json: JSONContent } | null>(null)

  const handleEditorReady = useCallback((ed: Editor, id: string) => setEditorState({ id, ed }), [])

  /** Écrit immédiatement toute édition débouncée en attente. */
  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const p = pendingSave.current
    if (p) {
      pendingSave.current = null
      void updateGeneratedDocContent(p.id, p.json).then(() => syncGeneratedDocs(orgId))
    }
  }, [orgId])

  /** Abandonne toute édition débouncée en attente (ex. avant régénération). */
  const cancelSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingSave.current = null
  }, [])

  const handleEditorChange = useCallback(
    (id: string, json: JSONContent) => {
      pendingSave.current = { id, json }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => flushSave(), 700)
    },
    [flushSave],
  )

  // Persiste les éditions en attente au démontage (navigation hors du workspace).
  useEffect(() => () => flushSave(), [flushSave])

  return { editorState, handleEditorReady, handleEditorChange, flushSave, cancelSave }
}
