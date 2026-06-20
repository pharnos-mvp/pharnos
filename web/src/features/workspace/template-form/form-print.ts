// Export PDF des formulaires de templates — rendu FINAL propre (saisies + options cochées
// uniquement) imprimé via le dialogue natif (« Enregistrer en PDF »). HTML et CSS @page A4
// 25,4 mm repris des gabarits CEO (+ bandeaux gris du template Étiquetage). Impression via
// IFRAME cachée : aucun blocage de fenêtres contextuelles, fonctionne hors-ligne.
import type { Lang } from '@/lib/i18n-context'
import {
  checkText,
  fieldDyn,
  fieldDynList,
  fieldList,
  fieldText,
  formExportName,
  subSelectHeading,
  type TemplateFormDefinition,
  type TemplateFormState,
} from './form-types'

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const multiline = (s: string) => esc(s).replace(/\r?\n/g, '<br>')

export function buildFormPrintHtml(
  def: TemplateFormDefinition,
  state: TemplateFormState,
  lang: Lang = 'fr',
): string {
  const g = state.globals
  const v = (k: string) => (state.values[k] ?? '').trim()
  const checked = (k: string) => (state.checks[k] ?? []).includes(0)
  // Résolution bilingue ADDITIVE (mirror TemplatePreview) : EN si demandé ET disponible, sinon FR.
  const tx = (fr: string, en?: string) => fieldText(fr, en, lang)
  const parts: string[] = []

  for (const b of def.model) {
    switch (b.type) {
      case 'title':
        parts.push(`<h1 class="p-title">${esc(tx(b.text, b.textEn))}</h1>`)
        break
      case 'sec':
        parts.push(`<h2 class="p-sec">${esc(tx(b.text, b.textEn).replace('\t', '  '))}</h2>`)
        break
      case 'sub':
        parts.push(`<h3 class="p-sub">${esc(tx(b.text, b.textEn).replace('\t', '  '))}</h3>`)
        break
      case 'subsub':
        parts.push(`<h4 class="p-subsub">${esc(tx(b.text, b.textEn))}</h4>`)
        break
      case 'banner':
        parts.push(`<h2 class="p-banner">${esc(tx(b.text, b.textEn).replace('\t', '  '))}</h2>`)
        break
      case 'secDyn':
        parts.push(
          `<h2 class="p-sec">${esc(fieldDyn(b.dynText, b.dynTextEn, lang, g).replace('\t', '  '))}</h2>`,
        )
        break
      case 'subDyn':
        parts.push(
          `<h3 class="p-sub">${esc(fieldDyn(b.dynText, b.dynTextEn, lang, g).replace('\t', '  '))}</h3>`,
        )
        break
      case 'static':
        parts.push(`<p class="p-body">${esc(tx(b.text, b.textEn))}</p>`)
        break
      case 'dyn':
        parts.push(`<p class="p-body">${esc(fieldDyn(b.dynText, b.dynTextEn, lang, g))}</p>`)
        break
      case 'rule':
        parts.push('<hr class="p-rule">')
        break
      case 'bullets':
        parts.push(
          `<ul class="p-list">${fieldDynList(b.items, b.itemsEn, lang, g)
            .map((it) => `<li>${esc(it)}</li>`)
            .join('')}</ul>`,
        )
        break
      case 'line': {
        if (b.dependsOn && !checked(b.dependsOn)) break
        if (!v(b.key)) break
        parts.push(
          `<p class="p-body">${b.label ? esc(tx(b.label, b.labelEn)) : ''}${esc(v(b.key))}${b.suffix ? esc(tx(b.suffix, b.suffixEn)) : ''}</p>`,
        )
        break
      }
      case 'para': {
        if (b.dependsOn && !checked(b.dependsOn)) break
        if (v(b.key)) parts.push(`<p class="p-body">${multiline(state.values[b.key] ?? '')}</p>`)
        break
      }
      case 'duree': {
        if (v(b.key))
          parts.push(`<p class="p-body">${esc(v(b.key))} ${lang === 'en' ? 'months' : 'mois'}</p>`)
        break
      }
      case 'atc': {
        if (v(b.key))
          parts.push(`<p class="p-body">${esc(tx(b.label, b.labelEn))}${esc(v(b.key))}</p>`)
        if (checked(b.chkKey))
          parts.push(`<p class="p-body">${esc(tx(b.chkLabel, b.chkLabelEn))}.</p>`)
        break
      }
      case 'checks': {
        const picked = state.checks[b.key] ?? []
        const items = fieldList(b.options, b.optionsEn, lang).filter((_, i) => picked.includes(i))
        if (items.length)
          parts.push(`<ul class="p-list">${items.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`)
        break
      }
      case 'check': {
        if (!checked(b.key)) break
        const text = checkText(b, state, g, lang)
        parts.push(
          b.asHeading
            ? `<h3 class="p-sub">${esc(text)}</h3>`
            : `<p class="p-body">${esc(text)}</p>`,
        )
        break
      }
      case 'subSelect': {
        const chosen = state.selects[b.key] ?? ''
        if (!chosen) break
        parts.push(`<h3 class="p-sub">${esc(subSelectHeading(b, chosen, lang))}</h3>`)
        break
      }
      case 'subLine': {
        if (v(b.key))
          parts.push(
            `<h3 class="p-sub">${esc(fieldText(b.before, b.beforeEn, lang))}${esc(v(b.key))}</h3>`,
          )
        break
      }
    }
  }

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(formExportName(def, state))}</title>
<style>
  @page { size: A4; margin: 25.4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; line-height: 1.35; margin: 0; }
  .p-title { text-align: center; color: #263F73; font-weight: bold; font-size: 12pt; margin: 0 0 14pt; }
  .p-sec { color: #263F73; font-weight: bold; font-size: 12pt; margin: 12pt 0 5pt; }
  .p-sub { color: #263F73; font-weight: bold; font-size: 12pt; margin: 9pt 0 4pt; }
  .p-subsub { color: #000; font-weight: bold; text-decoration: underline; font-size: 12pt; margin: 6pt 0 2pt; }
  .p-banner { background: #d9d9d9; border: 0.5pt solid #808080; color: #263F73; font-weight: bold; font-size: 12pt; margin: 12pt 0 6pt; padding: 2pt 6pt; }
  .p-body { text-align: justify; margin: 0 0 5pt; }
  .p-list { margin: 0 0 5pt; padding-left: 18pt; }
  .p-list li { text-align: justify; margin: 0 0 2pt; }
  .p-rule { border: none; border-top: 1px solid #000; margin: 10pt 0 6pt; }
</style></head><body>${parts.join('\n')}</body></html>`
}

/** Ouvre le dialogue d'impression sur le rendu final (iframe cachée, retirée après usage). */
export function printForm(
  def: TemplateFormDefinition,
  state: TemplateFormState,
  lang: Lang = 'fr',
): void {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  frame.srcdoc = buildFormPrintHtml(def, state, lang)
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
