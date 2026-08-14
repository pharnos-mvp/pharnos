/**
 * La LIVRAISON — du JSON d'`order-status` aux cinq fichiers, dans le navigateur. Module pur hors
 * DOM de téléchargement : tout ce qui décide est testable sans écran.
 *
 * ⚠️ Le navigateur ne fait QUE la mise en page. Les markdowns arrivent ASSEMBLÉS du serveur —
 * c'est l'autorité, la même que celle du banc d'essai — et `created` est la date de complétion du
 * job, la même des deux côtés : c'est elle qui rend les PDF reproductibles à l'octet (recette U5).
 * Recalculer quoi que ce soit ici recréerait le défaut de `d224665`.
 */
import {
  DELIVERABLE_FILE_COUNT,
  renderDeliverables,
  upgradeJobs,
  type Deliverable,
} from '@/lib/deliverables'

/** Les quatre comptes de l'écran de livraison — figés à l'assemblage, côté serveur. */
export interface StatsLivrable {
  reprises: number
  aCompleter: number
  deplaces: number
  aRelire: number
}

/** Ce que `order-status?livrable=1` rend — le contrat serveur, revalidé ici. */
export interface LivrableRecu {
  fr: string
  en: string
  rapport: string
  slug: string
  reportHeader: string
  reportLang: 'fr' | 'en'
  /** Date de complétion (ISO) — l'horodatage des PDF, identique au banc d'essai. */
  created: string | null
  sourceKind: string
  /** Langue du document SOURCE (porte, LOT B3) — `null` sur les jobs antérieurs. */
  sourceLang: 'fr' | 'en' | null
  /** `null` sur les jobs antérieurs à la migration `0093` : la page masque alors les tuiles. */
  stats: StatsLivrable | null
  /** Durée réelle du traitement, en secondes — mesurée par le serveur, jamais estimée ici. */
  dureeS: number | null
}

/**
 * Revalide la forme du livrable reçu.
 *
 * ⚠️ `poster` ne valide rien (`payload as T`) : un champ manquant traverserait jusqu'au rendu et
 * produirait un fichier au contenu `undefined` — téléchargé, ouvert chez l'agence. Sur le seul
 * appel dont la sortie devient un DOCUMENT DÉPOSÉ, on vérifie tout, et on refuse en nommant.
 */
export function lireLivrable(brut: unknown): LivrableRecu | { erreur: string } {
  if (!brut || typeof brut !== 'object') return { erreur: 'livrable absent' }
  const b = brut as Record<string, unknown>
  for (const champ of ['fr', 'en', 'rapport', 'slug', 'reportHeader'] as const) {
    if (typeof b[champ] !== 'string' || !b[champ]) {
      return { erreur: `livrable incomplet : ${champ}` }
    }
  }
  // Les stats sont OPTIONNELLES (jobs antérieurs à `0093`) mais jamais à moitié : un objet
  // incomplet afficherait des tuiles à `undefined` — on préfère les masquer entières.
  const s = b.stats as Record<string, unknown> | null | undefined
  const stats =
    s &&
    (['reprises', 'aCompleter', 'deplaces', 'aRelire'] as const).every(
      (k) => typeof s[k] === 'number' && Number.isFinite(s[k]),
    )
      ? (s as unknown as StatsLivrable)
      : null
  return {
    fr: b.fr as string,
    en: b.en as string,
    rapport: b.rapport as string,
    slug: b.slug as string,
    reportHeader: b.reportHeader as string,
    reportLang: b.reportLang === 'en' ? 'en' : 'fr',
    created: typeof b.created === 'string' ? b.created : null,
    sourceKind: b.sourceKind === 'ocr' ? 'ocr' : 'text',
    sourceLang: b.sourceLang === 'en' ? 'en' : b.sourceLang === 'fr' ? 'fr' : null,
    stats,
    dureeS: typeof b.dureeS === 'number' && Number.isFinite(b.dureeS) ? b.dureeS : null,
  }
}

/**
 * Le LABEL HUMAIN d'un fichier livré (mockup v3 : « SmPC — anglais », jamais un nom technique).
 *
 * Décidé sur le NOM du fichier — la seule donnée que `Deliverable` porte — et jamais en dur sur
 * une position de liste : l'ordre de `upgradeJobs` pourrait changer sans casser aucun test de
 * position. Un nom inconnu garde son nom : mentir sur un fichier serait pire qu'être technique.
 */
export function labelFichier(fileName: string, lang: 'fr' | 'en'): string {
  const fr = lang === 'fr'
  if (/-RCP-FR\./i.test(fileName)) return fr ? 'RCP — français' : 'SmPC — French'
  if (/-SmPC-EN\./i.test(fileName)) return fr ? 'SmPC — anglais' : 'SmPC — English'
  if (/revue-reglementaire|regulatory-review/i.test(fileName)) {
    return fr
      ? 'Revue réglementaire — ce que nous avons fait, et ce qu’il reste à faire'
      : 'Regulatory review — what we did, and what remains'
  }
  return fileName
}

/** L'extension affichée à côté du label (mockup : `DOCX` / `PDF`). Sans point : rien — jamais le
 *  nom entier en capitales. */
export const extensionDe = (fileName: string): string => {
  const point = fileName.lastIndexOf('.')
  return point > 0 ? fileName.slice(point + 1).toUpperCase() : ''
}

export interface FichiersLivres {
  files: Deliverable[]
  /** Caractères retirés des PDF — à MONTRER : un signe perdu peut changer le sens d'une ligne. */
  dropped: string[]
  zipName: string
  /** La date de complétion serveur — celle des PDF, et celle des en-têtes du ZIP. */
  created: Date
}

/**
 * Fabrique les cinq fichiers depuis le livrable serveur.
 *
 * ⚠️ `created` DOIT venir du serveur. Sans lui, `pdf-lib` horodate à la seconde de la fabrication
 * et deux rendus du même contenu divergent : la conformité binaire avec le banc d'essai — le
 * critère de recette U5 — deviendrait invérifiable. Un livrable sans date est donc un REFUS, pas
 * un repli sur l'horloge locale.
 */
export async function fabriquerFichiers(
  l: LivrableRecu,
): Promise<FichiersLivres | { erreur: string }> {
  if (!l.created) return { erreur: 'date de complétion absente : rendu non reproductible' }
  const created = new Date(l.created)
  if (Number.isNaN(created.getTime())) return { erreur: 'date de complétion illisible' }

  const { files, dropped } = await renderDeliverables(
    upgradeJobs({
      fr: l.fr,
      en: l.en,
      report: l.rapport,
      slug: l.slug,
      reportHeader: l.reportHeader,
      reportLang: l.reportLang,
    }),
    { created },
  )
  if (files.length !== DELIVERABLE_FILE_COUNT) {
    // Le compte est une décision verrouillée (5 fichiers) : un écart est une panne, jamais un état
    // à présenter comme la livraison.
    return { erreur: `${files.length} fichiers produits sur ${DELIVERABLE_FILE_COUNT}` }
  }
  return { files, dropped, zipName: nomArchive(l.slug, l.sourceLang), created }
}

/**
 * Le nom de l'archive suit la LANGUE SOURCE (LOT B3) : l'acheteur d'un SmPC anglais reçoit
 * « Produit_SmPC Upgrade.zip » — son document, mis au standard — jamais « RCP » qu'il ne
 * connaît pas. `null` (job antérieur à `0093`) retombe sur la forme française du gabarit.
 */
export const nomArchive = (slug: string, sourceLang: 'fr' | 'en' | null): string =>
  sourceLang === 'en' ? `${slug}_SmPC Upgrade.zip` : `${slug}_RCP Upgrade.zip`

/**
 * Le « tout télécharger » — chargé à la demande : jszip n'a rien à faire dans le chunk initial.
 *
 * ⚠️ La date de complétion est posée sur CHAQUE entrée : sans elle, jszip stampe l'horloge locale
 * et deux archives du même contenu diffèrent. La reproductibilité à l'octet reste celle des trois
 * PDF — les DOCX portent l'horodatage interne de la bibliothèque `docx`
 * (`DOCX_NONDETERMINISTIC_ENTRY`), et l'archive en hérite : dire le contraire ferait croire au
 * prochain lecteur une garantie qui n'existe pas.
 */
export async function fabriquerZip(fichiers: FichiersLivres): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const f of fichiers.files) zip.file(f.fileName, f.bytes, { date: fichiers.created })
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Le type MIME d'un livrable, pour le téléchargement. */
export const mimeDe = (f: Deliverable): string =>
  f.kind === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf'
