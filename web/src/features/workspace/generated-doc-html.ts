import type { JSONContent } from '@tiptap/core'

/**
 * Sérialise un contenu ProseMirror/TipTap en HTML autonome (téléchargement M3).
 * Déterministe, sans dépendance : couvre le sous-ensemble StarterKit utilisé par les templates
 * et les éditions courantes. La compilation PDF fidèle (signets/numérotation) arrive en M6.
 */

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESCAPE[ch] ?? ch)
}

function renderMarks(text: string, marks?: JSONContent['marks']): string {
  let out = escapeHtml(text)
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        out = `<strong>${out}</strong>`
        break
      case 'italic':
        out = `<em>${out}</em>`
        break
      case 'strike':
        out = `<s>${out}</s>`
        break
      case 'code':
        out = `<code>${out}</code>`
        break
      default:
        break
    }
  }
  return out
}

/** Style d'alignement (textAlign TipTap) pour un paragraphe/titre HTML. */
function alignAttr(node: JSONContent): string {
  const a = node.attrs?.textAlign
  if (a === 'right') return ' style="text-align:right"'
  if (a === 'center') return ' style="text-align:center"'
  return ''
}

function renderNode(node: JSONContent): string {
  const children = (node.content ?? []).map(renderNode).join('')
  switch (node.type) {
    case 'doc':
      return children
    case 'text':
      return renderMarks(node.text ?? '', node.marks)
    case 'paragraph':
      return `<p${alignAttr(node)}>${children || '<br>'}</p>`
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)))
      return `<h${level}${alignAttr(node)}>${children}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${children}</ul>`
    case 'orderedList':
      return `<ol>${children}</ol>`
    case 'listItem':
      return `<li>${children}</li>`
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`
    case 'codeBlock':
      return `<pre><code>${children}</code></pre>`
    case 'horizontalRule':
      return '<hr>'
    case 'hardBreak':
      return '<br>'
    default:
      return children
  }
}

/** HTML du corps uniquement (sans <html>/<head>). */
export function contentToHtml(content: JSONContent): string {
  return renderNode(content)
}

export interface GeneratedDocOptions {
  /** Data URL de l'en-tête (papier à en-tête). */
  header?: string | null
  /** Data URL du pied de page. */
  footer?: string | null
}

function imgTag(src: string, alt: string): string {
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`
}

/**
 * Document HTML complet — **A4, Times New Roman 12, marges 2,5 cm**, en-tête/pied optionnels.
 * Prêt au téléchargement et à l'impression (Ctrl+P → PDF). La compilation PDF fidèle = M6.
 */
export function generatedDocToHtml(
  title: string,
  content: JSONContent,
  opts: GeneratedDocOptions = {},
): string {
  const header = opts.header ? `<div class="band">${imgTag(opts.header, 'En-tête')}</div>` : ''
  const footer = opts.footer
    ? `<div class="band band-footer">${imgTag(opts.footer, 'Pied de page')}</div>`
    : ''
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  /* Marge de page nulle : l'en-tête/pied occupent toute la largeur (bord-à-bord). Le corps garde
     ses marges 2,5 cm via le conteneur .content. */
  @page { size: A4; margin: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 0; }
  h1, h2, h3 { font-family: 'Times New Roman', Times, serif; }
  ul, ol { padding-left: 1.5rem; }
  p { margin: 0.5rem 0; }
  img { max-width: 100%; height: auto; }
  .content { max-width: 16cm; margin: 0 auto; padding: 2.5cm; }
  .band { width: 100%; }
  .band img { display: block; width: 100%; }
  .band-footer { margin-top: 2rem; }
</style>
</head>
<body>
${header}
<div class="content">
${renderNode(content)}
</div>
${footer}
</body>
</html>`
}
