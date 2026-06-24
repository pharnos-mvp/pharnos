import { useI18n, type Lang } from '@/lib/i18n-context'
import { countryLabel } from '@/features/workspace/dossier-constants'
import type { LetterFields } from '@/features/workspace/letter-context'
import type { VariationItem } from './variation-request'
import '@/features/workspace/template-form/template-form.css'

const DASH = '—'

/**
 * **Document A4 ÉDITABLE** du tableau comparatif de variation (annexe) — feuille papier (`.tplform-sheet`,
 * comme la lettre), titre + bloc méta (produit / AMM / pays / date) puis tableau dont les cellules
 * « situation actuelle / proposée / justification » sont des **textareas** éditables ; N° + nature en
 * lecture seule (issus du sélecteur). Reflète à l'identique l'export (`buildComparisonTable`) →
 * affiché = exporté. Réutilisé par la **Bibliothèque** (onglet Tableau) et le **CTD Builder** (nœud 1.4.1).
 */
export function VariationTableSheet({
  items,
  natures,
  onChange,
  fields,
  title,
  lang,
  onAmmChange,
}: {
  items: VariationItem[]
  /** Libellés des natures (déjà localisés) — colonne « Nature » en lecture seule. */
  natures: string[]
  onChange: (items: VariationItem[]) => void
  fields: LetterFields
  title: string
  lang: Lang
  /** Si fourni, le N° d'AMM du bloc méta devient éditable **inline sur la feuille** (édition
   *  directe du document — pas de case-formulaire séparée). Sinon affiché en lecture seule. */
  onAmmChange?: (v: string) => void
}) {
  const { t } = useI18n()
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const setItem = (i: number, patch: Partial<VariationItem>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const date = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const ammLabel = L('N° d’AMM', 'MA number')
  const meta: { l: string; v: string; amm?: boolean }[] = [
    { l: L('Produit', 'Product'), v: fields.nomCommercial || DASH },
    { l: ammLabel, v: fields.ammNumero || DASH, amm: true },
    {
      l: L('Pays', 'Country'),
      v: countryLabel(fields.country, lang) || fields.country || DASH,
    },
    { l: L('Date', 'Date'), v: date },
  ]

  return (
    <div className="tplform">
      <div className="tplform-canvas">
        <div
          className="tplform-sheet"
          aria-label={t({ fr: 'Tableau de variation (édition)', en: 'Variation table (editing)' })}
        >
          <h1 className="doc-title">{title}</h1>
          <div className="doc-meta">
            {meta.map((m, i) => (
              <div key={i}>
                <strong>{m.l} : </strong>
                {m.amm && onAmmChange ? (
                  <input
                    type="text"
                    className="field-input"
                    value={fields.ammNumero}
                    onChange={(e) => onAmmChange(e.target.value)}
                    placeholder={ammLabel}
                    aria-label={ammLabel}
                  />
                ) : (
                  m.v
                )}
              </div>
            ))}
          </div>

          {items.length ? (
            <table className="vartab">
              <thead>
                <tr>
                  <th className="vt-num">{L('N°', 'No.')}</th>
                  <th className="vt-nat">
                    {L('Nature de la variation', 'Nature of the variation')}
                  </th>
                  <th>{L('Situation actuelle', 'Current situation')}</th>
                  <th>{L('Situation proposée', 'Proposed situation')}</th>
                  <th>{L('Justification', 'Justification')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const nat = natures[i] ?? it.nature
                  const natLabel = it.rubrique ? `${nat} (${it.rubrique})` : nat || DASH
                  return (
                    <tr key={it.ref ?? `other-${i}`}>
                      <td className="vt-num">{it.ref ?? DASH}</td>
                      <td className="vt-nat">{natLabel}</td>
                      <td>
                        <textarea
                          value={it.before}
                          onChange={(e) => setItem(i, { before: e.target.value })}
                          rows={2}
                          aria-label={`${L('Situation actuelle', 'Current situation')} — ${natLabel}`}
                        />
                      </td>
                      <td>
                        <textarea
                          value={it.after}
                          onChange={(e) => setItem(i, { after: e.target.value })}
                          rows={2}
                          aria-label={`${L('Situation proposée', 'Proposed situation')} — ${natLabel}`}
                        />
                      </td>
                      <td>
                        <textarea
                          value={it.justification}
                          onChange={(e) => setItem(i, { justification: e.target.value })}
                          rows={2}
                          placeholder={L('(optionnel)', '(optional)')}
                          aria-label={`${L('Justification', 'Justification')} — ${natLabel}`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="vt-empty">
              {L(
                'Ajoutez une variation pour remplir le tableau comparatif.',
                'Add a variation to fill the comparison table.',
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
