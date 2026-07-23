/**
 * Configuration pdf.js PARTAGÉE — source unique pour toutes les surfaces (visionneuse plein écran,
 * vignettes, aperçus). Un seul endroit garantit qu'aucune surface ne rende un PDF autrement qu'une
 * autre (retour CEO : « toujours les mêmes docs illisibles partout »).
 */

/** Charge pdf.js et arme le worker UNE seule fois (idempotent). */
let workerSet = false
export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist')
  if (!workerSet) {
    const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
    workerSet = true
  }
  return pdfjs
}

/**
 * Options `getDocument` communes = les assets NON JS de pdf.js, servis sous `{BASE}pdf/` (plugin
 * Vite `pharnos:pdfjs-assets`).
 *
 * INDISPENSABLES : sans `cMapUrl`, les PDF à polices **CID** (scans, formulaires — Adobe-Japan1,
 * Identity-H…) rendent en BLANC ; sans `standardFontDataUrl`, les 14 polices standard NON
 * embarquées tombent sur des substituts aux métriques fausses. C'est la cause des documents
 * « illisibles dans l'app mais lisibles en local ».
 */
export const PDF_DOC_ASSETS = {
  cMapUrl: `${import.meta.env.BASE_URL}pdf/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdf/standard_fonts/`,
} as const
