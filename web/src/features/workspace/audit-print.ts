import type { AuditReport } from './audit-report'

const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** HTML d'impression du rapport d'audit — papier A4, typographie corporate (Times). */
export function buildAuditPrintHtml(r: AuditReport): string {
  const parts: string[] = [
    `<h1>${esc(r.title)}</h1>`,
    `<p class="sub">${esc(r.subtitle)}</p>`,
    '<hr class="rule" />',
  ]
  for (const s of r.sections) {
    parts.push(`<h2>${esc(s.heading)}</h2>`)
    if (s.rows) {
      parts.push(
        '<table>' +
          s.rows
            .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`)
            .join('') +
          '</table>',
      )
    }
    for (const p of s.paragraphs ?? []) parts.push(`<p class="body">${esc(p)}</p>`)
    if (s.items && s.items.length > 0) {
      parts.push('<ul>' + s.items.map((i) => `<li>${esc(i)}</li>`).join('') + '</ul>')
    }
  }
  parts.push(`<p class="footer">${esc(r.footer)}</p>`)
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>${esc(r.fileTitle || r.title)}</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; margin: 0; }
  h1 { font-size: 15pt; text-align: center; letter-spacing: .4pt; margin: 0 0 4pt; }
  .sub { text-align: center; font-size: 11.5pt; font-weight: bold; color: #263F73; margin: 0 0 10pt; }
  .rule { border: none; border-top: 1.5pt solid #263F73; margin: 0 0 12pt; }
  h2 { font-size: 12pt; color: #263F73; margin: 12pt 0 5pt; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 6pt; }
  td { border: 0.5pt solid #999; padding: 3pt 6pt; vertical-align: top; }
  td.k { width: 32%; font-weight: bold; background: #f2f4f8; }
  .body { text-align: justify; margin: 0 0 5pt; }
  ul { margin: 0 0 6pt; padding-left: 16pt; }
  li { text-align: justify; margin: 0 0 3pt; }
  .footer { margin-top: 16pt; padding-top: 6pt; border-top: 0.5pt solid #999; font-size: 9pt; color: #555; text-align: center; }
</style></head><body>${parts.join('\n')}</body></html>`
}

/** Ouvre le dialogue d'impression du rapport (iframe cachée — même pattern que printForm). */
export function printAuditReport(r: AuditReport): void {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  frame.srcdoc = buildAuditPrintHtml(r)
  frame.onload = () => {
    setTimeout(() => {
      // Le nom « Enregistrer en PDF » est repris du document.title de la PAGE (pas de l'iframe sous
      // Chrome) → on le bascule sur le nom de fichier voulu le temps du dialogue, puis on restaure.
      const prevTitle = document.title
      if (r.fileTitle) document.title = r.fileTitle
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      document.title = prevTitle
      setTimeout(() => frame.remove(), 60_000)
    }, 150)
  }
  document.body.appendChild(frame)
}
