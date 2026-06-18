import type { Lang } from '@/lib/i18n-context'
import {
  blockHeadingText,
  DEFAULT_GLOBALS,
  fieldList,
  fieldText,
  resolveText,
  type FormBlock,
} from '@/features/workspace/template-form/form-types'
import '@/features/workspace/template-form/template-form.css'

/**
 * Aperçu READ-ONLY d'un template officiel pour la Bibliothèque : rend la STRUCTURE du modèle
 * (titres, mentions, champs en gris) dans la langue demandée — référence réglementaire, non
 * remplissable ici (le remplissage réel se fait dans un dossier du CTD Workspace). Réutilise la
 * feuille A4 navy/Times des formulaires. Les libellés bilingues sont résolus via `fieldText` /
 * `fieldList` (repli FR pour les blocs pas encore traduits). Zéro hallucination : texte verbatim.
 */
export function TemplatePreview({ model, lang }: { model: FormBlock[]; lang: Lang }) {
  const g = DEFAULT_GLOBALS
  const ph = (text: string) => <span className="text-muted-foreground italic">[{text}]</span>
  return (
    <div className="tplform">
      <div className="tplform-canvas">
        <div
          className="tplform-sheet"
          aria-label={lang === 'en' ? 'Template preview' : 'Aperçu du template'}
        >
          {model.map((b, i) => {
            switch (b.type) {
              case 'title':
                // Facsimilé read-only : titre du document rendu en <p> stylé (pas un <h1>) — la page
                // Bibliothèque porte déjà le <h1>, on évite un 2ᵉ h1 / un désordre de hiérarchie a11y.
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
                    {ph(fieldText(b.ph, b.phEn, lang))}
                    {b.suffix ? (
                      <span className="field-suffix"> {fieldText(b.suffix, b.suffixEn, lang)}</span>
                    ) : null}
                  </p>
                )
              case 'para':
                return (
                  <p key={i} className="doc-static">
                    {ph(fieldText(b.ph, b.phEn, lang))}
                  </p>
                )
              case 'duree':
                return (
                  <p key={i} className="field-line">
                    {ph(fieldText(b.ph, b.phEn, lang))}{' '}
                    <span className="field-suffix">{lang === 'en' ? 'months' : 'mois'}</span>
                  </p>
                )
              case 'atc':
                return (
                  <div key={i}>
                    <p className="field-line">
                      <span className="field-label">{fieldText(b.label, b.labelEn, lang)}</span>
                      {ph(fieldText(b.ph, b.phEn, lang))}
                    </p>
                    <label className="chk">
                      <span className="chk-box" aria-hidden />
                      <span className="chk-text">{fieldText(b.chkLabel, b.chkLabelEn, lang)}</span>
                    </label>
                  </div>
                )
              case 'checks':
                return (
                  <div key={i} className="chk-group">
                    {fieldList(b.options, b.optionsEn, lang).map((opt, oi) => (
                      <label key={oi} className="chk">
                        <span className="chk-box" aria-hidden />
                        <span className="chk-text">{opt}</span>
                      </label>
                    ))}
                  </div>
                )
              case 'check':
                return (
                  <label key={i} className="chk">
                    <span className="chk-box" aria-hidden />
                    <span className="chk-text">{resolveText(b.text, g)}</span>
                  </label>
                )
              case 'subSelect':
                return (
                  <p key={i} className="field-line doc-sub-line">
                    <span className="field-label field-label--bold">{b.before}</span>
                    {ph(b.options.join(' / '))}
                  </p>
                )
              case 'subLine':
                return (
                  <p key={i} className="field-line doc-sub-line">
                    <span className="field-label field-label--bold">{b.before}</span>
                    {ph(b.ph)}
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
