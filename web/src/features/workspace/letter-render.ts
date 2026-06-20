// Rendu GÉNÉRIQUE d'un document de lettre TipTap (sortie de `buildCover`/`buildPght`) → HTML A4
// (aperçu Bibliothèque + impression PDF). Générique sur le petit jeu de nœuds des lettres
// (doc · paragraph[textAlign] · text[bold] · hardBreak · bulletList · listItem) → AUCUNE duplication
// du contenu des lettres (source unique = templates.ts). Le DOCX vit dans `letter-docx.ts` (lazy :
// la lib `docx` reste hors du chunk Bibliothèque). Times New Roman, A4 25,4 mm.
//
// **Tranche 2 (branding)** : `LetterBrand` permet d'insérer en 1 clic l'en-tête, le pied et la
// signature du profil de l'org (images data-URL). La signature remplace le marqueur
// « [Signature et cachet] » du bloc signature.
import type { JSONContent } from '@tiptap/core'

const esc = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const isBoldNode = (n: JSONContent) => (n.marks ?? []).some((m) => m.type === 'bold')

/** Images de marque (profil org) à insérer dans la lettre (en-tête · pied · signature). */
export interface LetterBrand {
  headerImage?: string | null
  footerImage?: string | null
  signatureImage?: string | null
}

/** Marqueurs du bloc signature (FR/EN) — remplacés par l'image de signature si fournie. */
export const SIGNATURE_MARKERS = ['[Signature et cachet]', '[Signature and stamp]']

/* ----------------------------- HTML (aperçu + impression PDF) ----------------------------- */

function inlineHtml(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'hardBreak') return '<br>'
      if (n.type === 'text') {
        const t = esc(n.text ?? '')
        return isBoldNode(n) ? `<strong>${t}</strong>` : t
      }
      return ''
    })
    .join('')
}

/** Texte brut d'un paragraphe (concat des nœuds texte) — détection du marqueur de signature. */
function inlineText(nodes: JSONContent[] | undefined): string {
  return (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : '')).join('')
}

/** Corps HTML du courrier — partagé par l'aperçu et l'impression. `brand` insère en-tête/pied/signature. */
export function letterDocToHtml(doc: JSONContent, brand?: LetterBrand): string {
  const body = (doc.content ?? [])
    .map((n) => {
      if (n.type === 'paragraph') {
        // Bloc signature : remplacer « [Signature et cachet] » par l'image si fournie.
        if (brand?.signatureImage && SIGNATURE_MARKERS.includes(inlineText(n.content).trim())) {
          return `<p class="l-p l-r"><img class="l-sig" src="${esc(brand.signatureImage)}" alt=""></p>`
        }
        const right = n.attrs?.textAlign === 'right'
        const inner = inlineHtml(n.content)
        return `<p class="l-p${right ? ' l-r' : ''}">${inner || '&nbsp;'}</p>`
      }
      if (n.type === 'bulletList') {
        const items = (n.content ?? [])
          .map(
            (li) => `<li>${(li.content ?? []).map((p) => inlineHtml(p.content)).join('<br>')}</li>`,
          )
          .join('')
        return `<ul class="l-ul">${items}</ul>`
      }
      return ''
    })
    .join('')
  const header = brand?.headerImage
    ? `<div class="l-head"><img src="${esc(brand.headerImage)}" alt=""></div>`
    : ''
  const footer = brand?.footerImage
    ? `<div class="l-foot"><img src="${esc(brand.footerImage)}" alt=""></div>`
    : ''
  return header + body + footer
}

/** Document HTML A4 complet (impression « Enregistrer en PDF » via iframe). */
export function letterPrintHtml(
  doc: JSONContent,
  title: string,
  lang: 'fr' | 'en',
  brand?: LetterBrand,
): string {
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 25.4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; line-height: 1.5; margin: 0; }
  /* « à droite » = bloc aligné à gauche décalé à 56 % (forme officielle UEMOA, identique au CTD Builder). */
  .l-p { margin: 0.5rem 0; }
  .l-r { margin-left: 56%; text-align: left; }
  .l-ul { margin: 0.5rem 0; padding-left: 1.5rem; list-style: disc; }
  .l-ul li { text-align: left; margin: 0 0 3pt; }
  .l-head { margin: 0 0 12pt; }
  .l-head img, .l-foot img { max-width: 100%; display: block; }
  .l-foot { margin: 16pt 0 0; }
  .l-sig { max-width: 6.35cm; }
</style></head><body>${letterDocToHtml(doc, brand)}</body></html>`
}

/** Ouvre le dialogue d'impression sur le courrier (iframe cachée — hors-ligne, sans pop-up). */
export function printLetter(
  doc: JSONContent,
  title: string,
  lang: 'fr' | 'en',
  brand?: LetterBrand,
): void {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  frame.srcdoc = letterPrintHtml(doc, title, lang, brand)
  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 60_000)
    }, 150)
  }
  document.body.appendChild(frame)
}
