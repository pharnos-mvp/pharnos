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

function renderNode(node: JSONContent): string {
  const children = (node.content ?? []).map(renderNode).join('')
  switch (node.type) {
    case 'doc':
      return children
    case 'text':
      return renderMarks(node.text ?? '', node.marks)
    case 'paragraph':
      return `<p>${children || '<br>'}</p>`
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)))
      return `<h${level}>${children}</h${level}>`
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

/** Document HTML complet, prêt au téléchargement / à l'impression. */
export function generatedDocToHtml(title: string, content: JSONContent): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 21cm; margin: 2.5cm auto; padding: 0 1.5cm; line-height: 1.5; color: #111; }
  h1, h2, h3 { font-family: Arial, Helvetica, sans-serif; }
  ul, ol { padding-left: 1.5rem; }
  p { margin: 0.5rem 0; }
</style>
</head>
<body>
${renderNode(content)}
</body>
</html>`
}
