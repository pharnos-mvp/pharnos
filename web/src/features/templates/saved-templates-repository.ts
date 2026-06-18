import { db, type SavedTemplateRecord } from '@/lib/db'
import type { TemplateFormState } from '@/features/workspace/template-form/form-types'

/**
 * Dépôt local-first des modèles enregistrés (« Mes modèles ») — Dexie, offline, pas de sync (la
 * synchro cloud viendra plus tard). Soft-delete (`deletedAt`) cohérent avec le reste de l'app.
 */
export interface SaveTemplateInput {
  /** Renseigné = mise à jour ; absent = création. */
  id?: string
  orgId: string
  docType: string
  title: string
  productName?: string
  dci?: string
  lang: 'fr' | 'en'
  state: TemplateFormState
}

export async function saveTemplate(input: SaveTemplateInput): Promise<string> {
  const now = new Date().toISOString()
  const id = input.id ?? crypto.randomUUID()
  const existing = input.id ? await db.savedTemplates.get(input.id) : undefined
  const rec: SavedTemplateRecord = {
    id,
    orgId: input.orgId,
    docType: input.docType,
    title: input.title,
    productName: input.productName,
    dci: input.dci,
    lang: input.lang,
    state: input.state,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.savedTemplates.put(rec)
  return id
}

/** Soft-delete (retrait de « Mes modèles »). */
export async function deleteSavedTemplate(id: string): Promise<void> {
  await db.savedTemplates.update(id, { deletedAt: new Date().toISOString() })
}
