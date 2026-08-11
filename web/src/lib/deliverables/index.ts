/**
 * Fabrication des livrables d'une mise à niveau documentaire.
 *
 * **Où ce module tourne, et pourquoi.** Le serveur fait la partie lente (les 59 appels au moteur,
 * de l'attente pure) et ne stocke qu'un JSON ; le navigateur fait la partie rapide — cette
 * mise en page, ~1 s de calcul — au moment où le client est là. Deux conséquences : l'interdiction
 * du rendu DOCX/PDF sur Edge (2 s de CPU par requête) est respectée, et rien de dérivé n'est
 * stocké, donc rien ne peut devenir périmé. Voir `docs/PLAN-UPGRADE-PROD.md` §1.4.
 *
 * Ce module est PUR et sans dépendance à un environnement : le banc d'essai U0 l'exécute sous Node
 * sur le même JSON que le navigateur. C'est ce qui rend vérifiable la promesse « les fichiers du
 * navigateur sont ceux que le serveur a mesurés ».
 */
import { Packer } from 'docx'

import { sanitizeFileName } from '../files'
import { type Block, type Profile, parse, productName } from './blocks'
import { buildDeliverableDocx } from './docx'
import { buildDeliverablePdf } from './pdf'

export type { Block, Profile } from './blocks'
export { parse, productName, runs, isMissing, dotOf } from './blocks'
export { buildDeliverableDocx, DOCX_NONDETERMINISTIC_ENTRY } from './docx'
export { buildDeliverablePdf } from './pdf'

export interface DeliverableJob {
  /** Nom du fichier, SANS extension. */
  name: string
  markdown: string
  profile: Profile
  /**
   * Produire le DOCX en plus du PDF. Le rapport n'en a pas : il constate, il ne se complète pas
   * (décision verrouillée, étape 3 §1).
   */
  docx: boolean
  /** Signature Pharnos au pied — RAPPORT uniquement. */
  signature?: boolean
  /** En-tête courant. Par défaut, le nom du produit lu dans la rubrique 1. */
  header?: string
  /** Langue des libellés ajoutés par le RENDU (criticité de la revue). Défaut : `fr`. */
  lang?: 'fr' | 'en'
}

export interface Deliverable {
  fileName: string
  kind: 'docx' | 'pdf'
  bytes: Uint8Array
}

export interface RenderOptions {
  /**
   * Date de création inscrite dans les PDF.
   *
   * Injectable pour un rendu DÉTERMINISTE : sans elle, `pdf-lib` inscrit l'instant de la
   * fabrication et deux rendus du même contenu diffèrent d'octets. On ne pourrait alors plus
   * vérifier que le navigateur produit ce que le banc d'essai a mesuré (recette U5).
   *
   * ⚠️ Elle **ne rend pas les DOCX reproductibles** : `docx` y stampe son propre horodatage sans
   * offrir de moyen de l'injecter (cf. `DOCX_NONDETERMINISTIC_ENTRY`).
   */
  created?: Date
}

export interface RenderResult {
  files: Deliverable[]
  /**
   * Caractères qu'aucune police standard ne sait tracer, retirés des PDF. À REMONTER : un signe
   * absent d'un tableau de fréquences change le sens de la ligne.
   */
  dropped: string[]
}

/**
 * Les trois markdowns d'une mise à niveau donnent CINQ fichiers : deux documents en DOCX + PDF, et
 * une revue en PDF seul. Le compte est une décision verrouillée — l'exprimer en code plutôt qu'en
 * prose empêche la promesse commerciale et le livrable réel de diverger.
 */
export const DELIVERABLE_FILE_COUNT = 5

export interface UpgradeSources {
  /** Markdown du document conforme, en français. */
  fr: string
  /** Markdown du document conforme, en anglais. */
  en: string
  /** Markdown de la revue réglementaire. */
  report: string
  /** Base des noms de fichiers, p. ex. `KV-Kacin`. */
  slug: string
  /** En-tête courant de la revue, p. ex. `KV-KACIN 500 — Regulatory Review`. */
  reportHeader: string
  /**
   * Langue de la REVUE — celle du document téléversé, décision verrouillée (étape 1 §7).
   *
   * ⚠️ Elle commande le nom du fichier, pas seulement son contenu : un client francophone qui
   * reçoit « Revue réglementaire du RCP » dans un fichier nommé `…-SmPC-regulatory-review.pdf`
   * constate un livrable incohérent avec ce qu'il a acheté.
   */
  reportLang: 'fr' | 'en'
}

/** Les trois travaux standard d'une mise à niveau de RCP. */
export function upgradeJobs({
  fr,
  en,
  report,
  slug,
  reportHeader,
  reportLang,
}: UpgradeSources): DeliverableJob[] {
  return [
    { name: `${slug}-RCP-FR`, markdown: fr, profile: 'document', docx: true },
    { name: `${slug}-SmPC-EN`, markdown: en, profile: 'document', docx: true },
    {
      name:
        reportLang === 'fr' ? `${slug}-revue-reglementaire-RCP` : `${slug}-SmPC-regulatory-review`,
      markdown: report,
      profile: 'report',
      docx: false,
      signature: true,
      header: reportHeader,
      lang: reportLang,
    },
  ]
}

/** Rend les fichiers d'un lot de travaux. L'ordre de sortie suit celui des travaux. */
export async function renderDeliverables(
  jobs: readonly DeliverableJob[],
  { created }: RenderOptions = {},
): Promise<RenderResult> {
  const files: Deliverable[] = []
  const dropped = new Set<string>()

  for (const job of jobs) {
    const blocks: Block[] = parse(job.markdown, job.profile)
    const header = job.header ?? productName(blocks)
    // ⚠️ Assaini À LA FRONTIÈRE, là où le nom devient un nom de FICHIER. Le `slug` d'`upgradeJobs`
    // vient de la commande, donc à terme du client : un `/` ou un `..` y traverserait le
    // répertoire d'écriture du banc d'essai, et fabriquerait un nom de téléchargement douteux
    // côté navigateur. La garantie vit dans la fonction qui ÉCRIT, pas chez l'appelant.
    const name = sanitizeFileName(job.name)
    if (job.docx) {
      // `toArrayBuffer` et non `toBuffer`/`toBlob` : c'est le seul empaqueteur qui rende la MÊME
      // chose sous Node et dans le navigateur. Les deux autres épinglent leur environnement, et le
      // banc d'essai ne pourrait plus comparer ses octets à ceux de la livraison.
      const ab = await Packer.toArrayBuffer(buildDeliverableDocx(blocks, { header }))
      files.push({ fileName: `${name}.docx`, kind: 'docx', bytes: new Uint8Array(ab) })
    }
    const pdf = await buildDeliverablePdf(blocks, {
      header,
      signature: job.signature,
      created,
      ...(job.lang ? { lang: job.lang } : {}),
    })
    for (const ch of pdf.dropped) dropped.add(ch)
    files.push({ fileName: `${name}.pdf`, kind: 'pdf', bytes: pdf.bytes })
  }

  return { files, dropped: [...dropped] }
}
