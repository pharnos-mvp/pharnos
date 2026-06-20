// Rendu GÉNÉRIQUE d'un document de lettre TipTap (sortie de `buildCover`/`buildPght`) → HTML A4
// (aperçu Bibliothèque + impression PDF). Générique sur le petit jeu de nœuds des lettres
// (doc · paragraph[textAlign] · text[bold] · hardBreak · bulletList · listItem) → AUCUNE duplication
// du contenu des lettres (source unique = templates.ts). Le DOCX vit dans `letter-docx.ts` (lazy :
// la lib `docx` reste hors du chunk Bibliothèque). Times New Roman, A4 25,4 mm.
import type { JSONContent } from '@tiptap/core'

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const isBoldNode = (n: JSONContent) => (n.marks ?? []).some((m) => m.type === 'bold')

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

/** Corps HTML du courrier (sans wrapper de page) — partagé par l'aperçu et l'impression. */
export function letterDocToHtml(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((n) => {
      if (n.type === 'paragraph') {
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

/** Document HTML A4 complet (impression « Enregistrer en PDF » via iframe). */
export function letterPrintHtml(doc: JSONContent, title: string, lang: 'fr' | 'en'): string {
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 25.4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; line-height: 1.4; margin: 0; }
  .l-p { text-align: justify; margin: 0 0 6pt; }
  .l-r { text-align: right; }
  .l-ul { margin: 0 0 6pt; padding-left: 18pt; }
  .l-ul li { text-align: left; margin: 0 0 3pt; }
</style></head><body>${letterDocToHtml(doc)}</body></html>`
}

/** Ouvre le dialogue d'impression sur le courrier (iframe cachée — hors-ligne, sans pop-up). */
export function printLetter(doc: JSONContent, title: string, lang: 'fr' | 'en'): void {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  frame.srcdoc = letterPrintHtml(doc, title, lang)
  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 60_000)
    }, 150)
  }
  document.body.appendChild(frame)
}
