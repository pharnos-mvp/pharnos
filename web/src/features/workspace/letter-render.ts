// Helpers PARTAGÉS des lettres (cover/PGHT) — petit modèle de nœuds TipTap commun aux exports PDF
// (`letter-pdf`, qui réutilise le moteur pdf-lib du dossier compilé) et DOCX (`letter-docx`). Source
// unique du contenu = templates.ts. Aucun rendu HTML ici : les livrables sont générés en VECTEUR
// (true A4), comme le dossier compilé — l'ancienne impression navigateur (`window.print`) a été retirée.
import type { JSONContent } from '@tiptap/core'

export const isBoldNode = (n: JSONContent) => (n.marks ?? []).some((m) => m.type === 'bold')

/** Images de marque (profil org) à insérer dans la lettre (en-tête · pied · signature). */
export interface LetterBrand {
  headerImage?: string | null
  footerImage?: string | null
  signatureImage?: string | null
}

/** Marqueurs du bloc signature (FR/EN) — remplacés par l'image de signature si fournie. */
export const SIGNATURE_MARKERS = ['[Signature et cachet]', '[Signature and stamp]']
