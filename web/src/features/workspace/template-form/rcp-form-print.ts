// Export PDF du formulaire RCP — rendu FINAL propre (saisies + options cochées uniquement)
// imprimé via le dialogue natif (l'utilisateur choisit « Enregistrer en PDF »). HTML et CSS
// @page A4 25,4 mm repris du gabarit CEO. L'impression passe par une IFRAME cachée (pas de
// window.open : aucun blocage de fenêtres contextuelles, fonctionne hors-ligne).
import { RCP_FORM_MODEL, rcpExportName, type RcpFormState } from './rcp-form-model'

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const multiline = (s: string) => esc(s).replace(/\r?\n/g, '<br>')

export function buildRcpPrintHtml(state: RcpFormState): string {
  const parts: string[] = []
  for (const b of RCP_FORM_MODEL) {
    switch (b.type) {
      case 'title':
        parts.push(`<h1 class="p-title">${esc(b.text ?? '')}</h1>`)
        break
      case 'sec':
        parts.push(`<h2 class="p-sec">${esc((b.text ?? '').replace('\t', '  '))}</h2>`)
        break
      case 'sub':
        parts.push(`<h3 class="p-sub">${esc((b.text ?? '').replace('\t', '  '))}</h3>`)
        break
      case 'subsub':
        parts.push(`<h4 class="p-subsub">${esc(b.text ?? '')}</h4>`)
        break
      case 'static':
        parts.push(`<p class="p-body">${esc(b.text ?? '')}</p>`)
        break
      case 'rule':
        parts.push('<hr class="p-rule">')
        break
      case 'line': {
        const v = (state.values[b.key] ?? '').trim()
        if (!v) break
        parts.push(`<p class="p-body">${b.label ? esc(b.label) : ''}${esc(v)}</p>`)
        break
      }
      case 'para': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) parts.push(`<p class="p-body">${multiline(state.values[b.key] ?? '')}</p>`)
        break
      }
      case 'duree': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) parts.push(`<p class="p-body">${esc(v)} mois</p>`)
        break
      }
      case 'atc': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) parts.push(`<p class="p-body">${esc(b.label)}${esc(v)}</p>`)
        if ((state.checks[b.chkKey] ?? []).includes(0))
          parts.push(`<p class="p-body">${esc(b.chkLabel)}.</p>`)
        break
      }
      case 'checks': {
        const picked = state.checks[b.key] ?? []
        const items = b.options.filter((_, i) => picked.includes(i))
        if (items.length)
          parts.push(`<ul class="p-list">${items.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`)
        break
      }
    }
  }

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(rcpExportName(state))}</title>
<style>
  @page { size: A4; margin: 25.4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; line-height: 1.35; margin: 0; }
  .p-title { text-align: center; color: #263F73; font-weight: bold; font-size: 12pt; margin: 0 0 14pt; }
  .p-sec { color: #263F73; font-weight: bold; font-size: 12pt; margin: 12pt 0 5pt; }
  .p-sub { color: #263F73; font-weight: bold; font-size: 12pt; margin: 9pt 0 4pt; }
  .p-subsub { color: #000; font-weight: bold; text-decoration: underline; font-size: 12pt; margin: 6pt 0 2pt; }
  .p-body { text-align: justify; margin: 0 0 5pt; }
  .p-list { margin: 0 0 5pt; padding-left: 18pt; }
  .p-list li { text-align: justify; margin: 0 0 2pt; }
  .p-rule { border: none; border-top: 1px solid #000; margin: 10pt 0 6pt; }
</style></head><body>${parts.join('\n')}</body></html>`
}

/** Ouvre le dialogue d'impression sur le rendu final (iframe cachée, retirée après usage). */
export function printRcpForm(state: RcpFormState): void {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  frame.srcdoc = buildRcpPrintHtml(state)
  frame.onload = () => {
    // Laisse la mise en page se poser, imprime, puis nettoie une fois le dialogue rendu.
    setTimeout(() => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 60_000)
    }, 150)
  }
  document.body.appendChild(frame)
}
