import { useMemo, type ReactNode } from 'react'

import { useI18n, type Lang } from '@/lib/i18n-context'
import { buildLetterContext, type LetterFields } from '@/features/workspace/letter-context'
import type { VariationClass } from './variation-catalog'
import '@/features/workspace/template-form/template-form.css'

/**
 * Éditeur **inline** de la **lettre de variation** — cases remplissables directement sur la feuille A4
 * (exactement comme `LetterEditor` pour cover/PGHT). Les options choisies dans le **header du flux**
 * (produit / pays / N° d'AMM / natures) **auto-remplissent** les champs ; l'utilisateur peut affiner
 * en place (N° & date d'octroi d'AMM, Nom commercial, DCI). Les **natures** (read-only) viennent du
 * sélecteur. Le rendu **reflète à l'identique** l'export (`buildVariation`) → affiché = exporté.
 */
export function VariationLetterEditor({
  fields,
  natures,
  variationClass,
  lang,
  onChange,
  headerImage,
  footerImage,
  signatureImage,
}: {
  fields: LetterFields
  /** Libellés des natures de variation (déjà localisés) — affichés en puces read-only. */
  natures: string[]
  variationClass: VariationClass
  lang: Lang
  onChange: (fields: LetterFields) => void
  headerImage?: string | null
  footerImage?: string | null
  signatureImage?: string | null
}) {
  const { t } = useI18n()
  const ctx = useMemo(() => buildLetterContext(fields, lang), [fields, lang])

  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const civ = lang === 'en' ? (ctx.agencyCiviliteEn ?? ctx.agencyCivilite) : ctx.agencyCivilite
  const sep = lang === 'en' ? ': ' : ' : '
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const set = (k: keyof LetterFields, v: string) => onChange({ ...fields, [k]: v })

  const plural = natures.length > 1
  const classWord = variationClass
    ? lang === 'en'
      ? variationClass === 'majeure'
        ? 'major '
        : 'minor '
      : `${variationClass} `
    : ''
  const nomC = fields.nomCommercial || L('[Nom commercial]', '[Trade name]')

  // Lecture des flags en-tête/pied/signature (basculés depuis le header du flux) → rendu des images.
  const flag = (k: keyof LetterFields) => fields[k] === '1'

  /** Input inline sur la feuille (classe `field-input`, scopée `.tplform-sheet`). */
  const inp = (k: keyof LetterFields, placeholder?: string, ariaLabel?: string) => (
    <input
      type="text"
      className="field-input"
      value={fields[k]}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder ?? k}
    />
  )
  const bullet = (label: string, content: ReactNode) => (
    <li>
      <span className="field-line">
        <span className="field-label field-label--bold">
          {label}
          {sep}
        </span>
        {content}
      </span>
    </li>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Feuille A4 : lettre de variation à cases remplissables inline (= buildVariation). L'en-tête,
          le pied et la signature sont basculés depuis le header du flux (flags `useHeader`…). */}
      <div className="tplform">
        <div className="tplform-canvas">
          <div
            className="tplform-sheet letter-sheet"
            aria-label={t({
              fr: 'Lettre de variation (édition)',
              en: 'Variation letter (editing)',
            })}
          >
            {flag('useHeader') && headerImage ? (
              <div className="l-head">
                <img src={headerImage} alt="" />
              </div>
            ) : null}

            {/* Dateline REMPLISSABLE (Ville / Date) — vides → défaut auto à l'export. */}
            <p className="l-p l-r">
              {inp('ville', L('Ville', 'City'), L('Ville de la lettre', 'Letter city'))}
              {L(', le ', ', ')}
              {inp('date', today, L('Date de la lettre', 'Letter date'))}
            </p>
            <p className="l-p l-r">&nbsp;</p>
            <p className="l-p l-r">{L('À', 'To')}</p>
            <p className="l-p l-r">
              {civ}
              <br />
              {ctx.agencyFull}
              <br />
              {ctx.agencyAdresse}
            </p>
            <p className="l-p l-r">&nbsp;</p>

            <p className="l-p">
              <strong>{L('Objet : ', 'Subject: ')}</strong>
              {L(
                `Demande de variation ${classWord}de l’AMM du produit ${nomC}`,
                `Application for a ${classWord}variation to the MA of the product ${nomC}`,
              )}
            </p>
            <p className="l-p">
              <strong>{L('Réf. : ', 'Ref.: ')}</strong>
              {L('AMM n° ', 'MA No. ')}
              {inp('ammNumero', L('N° d’AMM', 'MA number'), L('N° d’AMM', 'MA number'))}
              {L(' du ', ' of ')}
              {inp(
                'ammDateDelivrance',
                L('date d’octroi', 'grant date'),
                L('Date d’octroi de l’AMM', 'MA grant date'),
              )}
            </p>
            <p className="l-p">{`${civ},`}</p>

            <p className="l-p">
              {L(
                'Nous avons l’honneur de soumettre à votre haute bienveillance une demande de variation de l’autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :',
                'We have the honour of submitting for your kind consideration an application for a variation of the marketing authorisation (MA) of our pharmaceutical specialty, identified as follows:',
              )}
            </p>

            <ul className="doc-bullets">
              {bullet(
                L('Nom commercial', 'Trade name'),
                inp('nomCommercial', L('Nom commercial', 'Trade name')),
              )}
              {bullet(L('DCI', 'INN'), inp('dci', L('DCI', 'INN')))}
            </ul>

            <p className="l-p">
              {plural
                ? L('Les variations sollicitées portent sur :', 'The requested variations concern:')
                : L('La variation sollicitée porte sur :', 'The requested variation concerns:')}
            </p>
            <ul className="l-ul">
              {natures.length ? (
                natures.map((n, i) => <li key={i}>{n}</li>)
              ) : (
                <li>{L('[Nature de la variation]', '[Nature of the variation]')}</li>
              )}
            </ul>

            <p className="l-p">
              {L(
                `Le détail ${plural ? 'des variations' : 'de la variation'} (situation actuelle / proposée) figure dans le tableau comparatif joint en annexe. Le dossier de variation ci-joint a été constitué conformément à l’Annexe N°2 du Règlement n°04/2020/CM/UEMOA. Nous restons à votre entière disposition pour tout complément d’information.`,
                `The details of the ${plural ? 'variations' : 'variation'} (current / proposed) are set out in the comparison table provided in the annex. The attached variation dossier has been compiled in accordance with Annex No. 2 of UEMOA Regulation No. 04/2020. We remain at your full disposal for any further information.`,
              )}
            </p>
            <p className="l-p">
              {L(
                `Nous vous prions d’agréer, ${civ}, l’expression de notre sincère considération.`,
                `Please accept, ${civ}, the assurance of our highest consideration.`,
              )}
            </p>

            <p className="l-p l-r">&nbsp;</p>
            <p className="l-p l-r">{ctx.poste || L('[Poste]', '[Position]')}</p>
            {flag('useSignature') && signatureImage ? (
              <p className="l-p l-r">
                <img className="l-sig" src={signatureImage} alt="Signature" />
              </p>
            ) : (
              <p className="l-p l-r">{L('[Signature et cachet]', '[Signature and stamp]')}</p>
            )}
            <p className="l-p l-r">{ctx.signataire || L('[Nom et prénom(s)]', '[Full name]')}</p>
            {flag('useFooter') && footerImage ? (
              <div className="l-foot">
                <img src={footerImage} alt="" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
