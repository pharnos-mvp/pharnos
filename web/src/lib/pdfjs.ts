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
 * TOUTES INDISPENSABLES — quand une URL manque, pdf.js abandonne SILENCIEUSEMENT le contenu
 * concerné (aucune erreur remontée à l'UI) :
 *  • `cMapUrl` : sans elle, les PDF à polices **CID** (scans, formulaires — Identity-H,
 *    Adobe-Japan1…) rendent en BLANC ;
 *  • `standardFontDataUrl` : sans elle, les 14 polices standard NON embarquées tombent sur des
 *    substituts aux métriques fausses ;
 *  • `wasmUrl` : décodeurs **JBIG2 / JPEG2000 / couleur (qcms)**. Sans elle, un scan à couches
 *    (MRC = masques JBIG2 pour le texte + fond JPEG) perd SA COUCHE DE TEXTE → la page paraît
 *    vide alors qu'elle est lisible dans tout autre lecteur (cas réel `KV-10D_GMP.pdf` :
 *    « ignoring XObject: JBig2 failed to initialize ») ;
 *  • `iccUrl` : profil ICC CMYK → couleurs justes.
 * C'est la cause des documents « illisibles dans l'app mais lisibles en local ».
 */
export const PDF_DOC_ASSETS = {
  cMapUrl: `${import.meta.env.BASE_URL}pdf/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdf/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdf/wasm/`,
  iccUrl: `${import.meta.env.BASE_URL}pdf/iccs/`,
} as const
