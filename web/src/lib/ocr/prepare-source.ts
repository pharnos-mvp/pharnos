/**
 * Prépare le CORPUS DE CONTRÔLE d'un document source — le point d'entrée unique du protocole à deux
 * canaux, et le seul endroit où la décision « faut-il océriser ? » se prend.
 *
 * Rappel de ce qui se joue : le modèle lit la PIÈCE (il océrise nativement, mieux que nous), et ce
 * corpus ne sert qu'à vérifier EN CODE sa citation et ses chiffres. Son mérite n'est pas sa qualité,
 * c'est son INDÉPENDANCE — un contrôle produit par ce qu'il contrôle n'est pas un contrôle.
 */
import { MAX_CONTROL_CHARS, readPdfPages } from './pdf-text'
import { buildControlCorpus, type SourceKind } from './scan-text'

export type PreparePhase =
  /** Lecture de la couche texte — rapide, systématique. */
  | 'reading'
  /** Reconnaissance de caractères — plusieurs mégaoctets à charger, ~4 s par page. */
  | 'recognizing'

export interface PreparedUpgradeSource {
  /** À transmettre TEL QUEL à l'Edge : la provenance est déclarée, jamais devinée côté serveur. */
  sourceKind: SourceKind
  /**
   * Corpus de contrôle, ornements retirés, pages séparées.
   *
   * ⚠️ Nommé `controlText` et non `text` : ce n'est PAS l'entrée du modèle. Confondre les deux ferait
   * envoyer au modèle un texte dont on a retiré en-têtes et folios — un document amputé, présenté
   * comme la source.
   */
  controlText: string
  pageCount: number
  /** Pages effectivement océrisées — zéro sur un document à couche texte complète. */
  recognizedPages: number
  /**
   * `true` quand le document n'a pas été lu en entier (borne de pages ou budget de corpus).
   * ⚠️ À DIRE au client : les rubriques citées dans les pages non lues ressortiront « Non fourni »,
   * et cela aurait l'air d'un défaut du moteur alors que c'est une limite déclarée.
   */
  truncated: boolean
}

export interface PrepareOptions {
  signal?: AbortSignal
  /** Annonce la phase AVANT qu'elle commence : une minute d'attente muette passe pour une panne. */
  onPhase?: (phase: PreparePhase) => void
  /** Progression 0→1 à l'intérieur de la phase courante. */
  onProgress?: (ratio: number) => void
}

/**
 * Levée quand le corpus dépasse ce que l'Edge accepte. **Une erreur, pas un drapeau** : le mode
 * rubrique répondrait `413 control_truncated`, et un booléen consultatif que rien n'oblige à lire
 * finirait par ne pas l'être. La garantie doit vivre dans la fonction qui écrit.
 */
export class ControlCorpusTooLargeError extends Error {
  readonly chars: number
  constructor(chars: number) {
    super(
      `Document trop volumineux pour la mise en conformité par rubrique : ` +
        `${chars} caractères de contrôle pour ${MAX_CONTROL_CHARS} acceptés.`,
    )
    this.name = 'ControlCorpusTooLargeError'
    this.chars = chars
  }
}

/**
 * Lit un PDF et rend le corpus de contrôle.
 *
 * ⚠️ **La reconnaissance n'est chargée que si des pages en ont besoin**, et **seules ces pages** sont
 * océrisées. Deux garanties dans un même geste : ~7,5 Mo de noyau et de modèles n'atteignent que les
 * utilisateurs qui déposent un scan — sur un marché où la bande passante se paie, l'inverse serait un
 * défaut produit — et un document mixte garde le texte EXACT de ses pages textuelles au lieu de le
 * voir remplacé par une reconstruction.
 */
export async function prepareUpgradeSource(
  data: ArrayBuffer | Uint8Array,
  { signal, onPhase, onProgress }: PrepareOptions = {},
): Promise<PreparedUpgradeSource> {
  onPhase?.('reading')
  const read = await readPdfPages(data, { signal, onProgress })
  if (read.textless.length === 0) {
    return finish('text', read.pages, read.pageCount, read.truncated, 0)
  }

  onPhase?.('recognizing')
  // Import DIFFÉRÉ du module de reconnaissance lui-même, et pas seulement de tesseract.js : le code
  // de rendu et la configuration des assets n'ont aucune raison de peser sur un dossier textuel.
  const { recognizePdf } = await import('./recognize')
  const rec = await recognizePdf(data, {
    signal,
    pages: read.textless,
    onProgress: (ratio) => onProgress?.(ratio),
  })
  // Fusion PAR PAGE : la couche texte là où elle existe, la reconnaissance là où elle manquait.
  const merged = read.pages.map((text, i) => rec.pages.get(i) ?? text)
  return finish('ocr', merged, read.pageCount, read.truncated || rec.truncated, rec.recognized)
}

function finish(
  sourceKind: SourceKind,
  pages: readonly string[],
  pageCount: number,
  truncated: boolean,
  recognizedPages: number,
): PreparedUpgradeSource {
  const controlText = buildControlCorpus(pages)
  if (controlText.length > MAX_CONTROL_CHARS) {
    throw new ControlCorpusTooLargeError(controlText.length)
  }
  return { sourceKind, controlText, pageCount, truncated, recognizedPages }
}
