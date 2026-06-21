// Rendu GÉNÉRIQUE d'un document de lettre TipTap (sortie de `buildCover`/`buildPght`) → HTML A4
// (impression PDF). Générique sur le petit jeu de nœuds des lettres (doc · paragraph[textAlign] ·
// text[bold] · hardBreak · bulletList · listItem) → AUCUNE duplication du contenu (source unique =
// templates.ts). Le DOCX vit dans `letter-docx.ts` (lazy). Calé EXACTEMENT sur l'éditeur du CTD
// Builder (`.editor-page`/`generated-doc-html`) : Times 12, interligne 1,5, marqueur « à droite »
// = bloc aligné à GAUCHE décalé à 56 %, **en-tête/pied bord-à-bord (sans marge)**, signature ≤ 6,35 cm.
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

/**
 * Corps HTML du courrier (paragraphes / puces) — SANS l'en-tête/pied (ceux-ci sont des bandeaux
 * bord-à-bord hors du `.content` paddé, cf. `letterPrintHtml`). La signature (`brand.signatureImage`)
 * remplace le marqueur « [Signature et cachet] ».
 */
export function letterDocToHtml(doc: JSONContent, brand?: LetterBrand): string {
  return (doc.content ?? [])
    .map((n) => {
      if (n.type === 'paragraph') {
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
}

/**
 * Document HTML A4 complet (impression « Enregistrer en PDF »). `@page` sans marge + `.content`
 * paddé 2,5 cm → l'en-tête et le pied (bandeaux pleine largeur) débordent **bord-à-bord**, comme
 * le papier à en-tête du CTD Builder.
 */
export function letterPrintHtml(
  doc: JSONContent,
  title: string,
  lang: 'fr' | 'en',
  brand?: LetterBrand,
): string {
  const head = brand?.headerImage
    ? `<div class="band"><img src="${esc(brand.headerImage)}" alt=""></div>`
    : ''
  const foot = brand?.footerImage
    ? `<div class="band band-foot"><img src="${esc(brand.footerImage)}" alt=""></div>`
    : ''
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; line-height: 1.5; margin: 0; }
  /* Corps paddé 2,5 cm ; en-tête/pied = bandeaux pleine largeur HORS de ce padding (bord-à-bord). */
  .content { max-width: 16cm; margin: 0 auto; padding: 2.5cm; }
  /* « à droite » = bloc aligné à gauche décalé à 56 % (forme officielle UEMOA, identique au CTD Builder). */
  .l-p { margin: 0.5rem 0; }
  .l-r { margin-left: 56%; text-align: left; }
  .l-ul { margin: 0.5rem 0; padding-left: 1.5rem; list-style: disc; }
  .l-ul li { text-align: left; margin: 0 0 3pt; }
  .l-sig { max-width: 6.35cm; }
  .band { width: 100%; }
  .band img { display: block; width: 100%; }
  .band-foot { margin-top: 2rem; }
</style></head><body>${head}<div class="content">${letterDocToHtml(doc, brand)}</div>${foot}</body></html>`
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
