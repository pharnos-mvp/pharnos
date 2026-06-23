import { useMemo, type ReactNode } from 'react'

import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
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

  // Insertion en-tête / pied / signature (images du profil org).
  const flag = (k: keyof LetterFields) => fields[k] === '1'
  const toggleFlag = (k: keyof LetterFields) => set(k, fields[k] === '1' ? '' : '1')
  const insertBtn = (
    k: keyof LetterFields,
    img: string | null | undefined,
    label: { fr: string; en: string },
  ) => (
    <button
      type="button"
      disabled={!img && !flag(k)}
      onClick={() => toggleFlag(k)}
      aria-pressed={flag(k)}
      title={img ? undefined : t({ fr: 'À définir dans le profil', en: 'Set in profile' })}
      className={cn(
        'rounded border px-2 py-0.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
        flag(k) && img
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground',
      )}
    >
      {t(label)}
    </button>
  )

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
      {/* Insertion en-tête / pied / signature du profil (le reste — produit/pays/AMM/natures — vit
          dans le header du flux). */}
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs">
        <span className="text-muted-foreground font-medium">
          {t({ fr: 'En-tête & signature', en: 'Letterhead & signature' })}
        </span>
        {insertBtn('useHeader', headerImage, { fr: 'En-tête', en: 'Header' })}
        {insertBtn('useFooter', footerImage, { fr: 'Pied', en: 'Footer' })}
        {insertBtn('useSignature', signatureImage, { fr: 'Signature', en: 'Signature' })}
      </div>

      {/* Feuille A4 : lettre de variation à cases remplissables inline (= buildVariation). */}
      <div className="tplform">
        <div className="tplform-canvas">
          <div
            className="tplform-sheet letter-sheet"
            aria-label={t({ fr: 'Lettre de variation (édition)', en: 'Variation letter (editing)' })}
          >
            {flag('useHeader') && headerImage ? (
              <div className="l-head">
                <img src={headerImage} alt="" />
              </div>
            ) : null}

            <p className="l-p l-r">
              {L(`${ctx.ville}, le ${ctx.date}`, `${ctx.ville}, ${ctx.date}`)}
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
