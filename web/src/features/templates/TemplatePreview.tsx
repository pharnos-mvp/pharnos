import type { Lang } from '@/lib/i18n-context'
import {
  blockHeadingText,
  DEFAULT_GLOBALS,
  fieldList,
  fieldText,
  resolveText,
  type FormBlock,
  type TemplateFormState,
} from '@/features/workspace/template-form/form-types'
import '@/features/workspace/template-form/template-form.css'

/**
 * Rendu d'un template officiel sur la feuille A4 navy/Times. Deux modes :
 *  - **aperçu** (défaut) : structure + champs en gris (référence read-only de la Bibliothèque) ;
 *  - **éditable** (`editable` + `state` + `onChange`) : les champs deviennent des saisies réelles
 *    (mêmes contrôles que le formulaire de dossier) → éditeur de « Mes modèles ».
 * Libellés bilingues résolus via `fieldText`/`fieldList` (repli FR). Zéro hallucination : verbatim.
 */
export function TemplatePreview({
  model,
  lang,
  editable = false,
  state,
  onChange,
}: {
  model: FormBlock[]
  lang: Lang
  editable?: boolean
  state?: TemplateFormState
  onChange?: (next: TemplateFormState) => void
}) {
  const g = state?.globals ?? DEFAULT_GLOBALS
  const rw = editable && state && onChange // mode éditable effectif
  const ph = (text: string) => <span className="text-muted-foreground italic">[{text}]</span>

  const setValue = (key: string, v: string) =>
    rw && onChange({ ...state, values: { ...state.values, [key]: v } })
  const setSelect = (key: string, v: string) =>
    rw && onChange({ ...state, selects: { ...state.selects, [key]: v } })
  const isChecked = (key: string, idx = 0) => (state?.checks[key] ?? []).includes(idx)
  const toggleCheck = (key: string, idx: number) => {
    if (!rw) return
    const cur = state.checks[key] ?? []
    const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx]
    onChange({ ...state, checks: { ...state.checks, [key]: next } })
  }

  /** Champ texte : input réel (éditable) ou placeholder gris (aperçu). */
  const field = (key: string, placeholder: string, area = false) => {
    if (!rw) return ph(placeholder)
    return area ? (
      <textarea
        className="field-area"
        rows={1}
        placeholder={placeholder}
        aria-label={placeholder}
        value={state.values[key] ?? ''}
        onChange={(e) => setValue(key, e.target.value)}
      />
    ) : (
      <input
        type="text"
        className="field-input"
        placeholder={placeholder}
        aria-label={placeholder}
        value={state.values[key] ?? ''}
        onChange={(e) => setValue(key, e.target.value)}
      />
    )
  }

  return (
    <div className="tplform">
      <div className="tplform-canvas">
        <div
          className="tplform-sheet"
          aria-label={lang === 'en' ? 'Template form' : 'Formulaire du template'}
        >
          {model.map((b, i) => {
            switch (b.type) {
              case 'title':
                // Facsimilé : titre du document rendu en <p> stylé (pas un <h1>) — évite un 2ᵉ h1.
                return (
                  <p key={i} className="doc-title">
                    {fieldText(b.text, b.textEn, lang)}
                  </p>
                )
              case 'sec':
                return (
                  <h2 key={i} className="doc-sec">
                    {blockHeadingText(fieldText(b.text, b.textEn, lang))}
                  </h2>
                )
              case 'banner':
                return (
                  <h2 key={i} className="doc-banner">
                    {blockHeadingText(fieldText(b.text, b.textEn, lang))}
                  </h2>
                )
              case 'sub':
                return (
                  <h3 key={i} className="doc-sub">
                    {blockHeadingText(fieldText(b.text, b.textEn, lang))}
                  </h3>
                )
              case 'subsub':
                return (
                  <h4 key={i} className="doc-subsub">
                    {fieldText(b.text, b.textEn, lang)}
                  </h4>
                )
              case 'static':
                return (
                  <p key={i} className="doc-static">
                    {fieldText(b.text, b.textEn, lang)}
                  </p>
                )
              case 'dyn':
              case 'secDyn':
              case 'subDyn':
                return (
                  <p key={i} className={b.type === 'dyn' ? 'doc-static' : 'doc-sub'}>
                    {b.dynText(g)}
                  </p>
                )
              case 'rule':
                return <hr key={i} className="doc-rule" />
              case 'bullets':
                return (
                  <ul key={i} className="doc-bullets">
                    {b.items.map((it, ii) => (
                      <li key={ii}>{resolveText(it, g)}</li>
                    ))}
                  </ul>
                )
              case 'line':
                return (
                  <p key={i} className="field-line">
                    {b.label ? (
                      <span className="field-label">{fieldText(b.label, b.labelEn, lang)}</span>
                    ) : null}
                    {field(b.key, fieldText(b.ph, b.phEn, lang))}
                    {b.suffix ? (
                      <span className="field-suffix"> {fieldText(b.suffix, b.suffixEn, lang)}</span>
                    ) : null}
                  </p>
                )
              case 'para':
                return (
                  <div key={i} className="doc-static">
                    {field(b.key, fieldText(b.ph, b.phEn, lang), true)}
                  </div>
                )
              case 'duree':
                return (
                  <p key={i} className="field-line">
                    {field(b.key, fieldText(b.ph, b.phEn, lang))}{' '}
                    <span className="field-suffix">{lang === 'en' ? 'months' : 'mois'}</span>
                  </p>
                )
              case 'atc':
                return (
                  <div key={i}>
                    <p className="field-line">
                      <span className="field-label">{fieldText(b.label, b.labelEn, lang)}</span>
                      {field(b.key, fieldText(b.ph, b.phEn, lang))}
                    </p>
                    <label className="chk">
                      <input
                        type="checkbox"
                        className="chk-box"
                        disabled={!rw}
                        checked={isChecked(b.chkKey)}
                        onChange={() => toggleCheck(b.chkKey, 0)}
                      />
                      <span className="chk-text">{fieldText(b.chkLabel, b.chkLabelEn, lang)}</span>
                    </label>
                  </div>
                )
              case 'checks':
                return (
                  <div key={i} className="chk-group">
                    {fieldList(b.options, b.optionsEn, lang).map((opt, oi) => (
                      <label key={oi} className="chk">
                        <input
                          type="checkbox"
                          className="chk-box"
                          disabled={!rw}
                          checked={isChecked(b.key, oi)}
                          onChange={() => toggleCheck(b.key, oi)}
                        />
                        <span className="chk-text">{opt}</span>
                      </label>
                    ))}
                  </div>
                )
              case 'check':
                return (
                  <label key={i} className="chk">
                    <input
                      type="checkbox"
                      className="chk-box"
                      disabled={!rw}
                      checked={isChecked(b.key)}
                      onChange={() => toggleCheck(b.key, 0)}
                    />
                    <span className="chk-text">{resolveText(b.text, g)}</span>
                  </label>
                )
              case 'subSelect':
                return (
                  <p key={i} className="field-line doc-sub-line">
                    <span className="field-label field-label--bold">{b.before}</span>
                    {rw ? (
                      <select
                        className="field-select"
                        aria-label={b.before.trim()}
                        value={state.selects[b.key] ?? ''}
                        onChange={(e) => setSelect(b.key, e.target.value)}
                      >
                        <option value="">— {lang === 'en' ? 'choose' : 'choisir'} —</option>
                        {b.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ph(b.options.join(' / '))
                    )}
                  </p>
                )
              case 'subLine':
                return (
                  <p key={i} className="field-line doc-sub-line">
                    <span className="field-label field-label--bold">{b.before}</span>
                    {field(b.key, b.ph)}
                  </p>
                )
              default:
                return null
            }
          })}
        </div>
      </div>
    </div>
  )
}
