import { useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '@/lib/db'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { useOrgId } from '@/features/org/org-context'
import {
  buildLetterContext,
  LETTER_CURRENCIES,
  letterFieldsFromValues,
  productToLetterFields,
  UEMOA_COUNTRIES,
  type LetterFields,
} from '@/features/workspace/letter-context'
import '@/features/workspace/template-form/template-form.css'

/**
 * Éditeur **inline** d'une lettre (cover/PGHT) — cases remplissables directement sur la feuille A4
 * (comme RCP/Notice). Barre d'en-tête HORS-template : **Pays cible** (→ agence + civilité du
 * destinataire auto), **Produit** (sélecteur catalogue → auto-sync de la fiche ; saisie manuelle
 * toujours possible inline) et **insertion en-tête/pied/signature** du profil. Nom/poste du
 * signataire pré-remplis depuis le profil. Valeurs à plat → persistées ; FR = langue de soumission.
 */
export function LetterEditor({
  docType,
  values,
  lang,
  onChange,
  headerImage,
  footerImage,
  signatureImage,
}: {
  docType: 'cover' | 'pght'
  values: Record<string, string>
  lang: Lang
  onChange: (values: Record<string, string>) => void
  headerImage?: string | null
  footerImage?: string | null
  signatureImage?: string | null
}) {
  const { t } = useI18n()
  const orgId = useOrgId()
  const fields = useMemo(() => letterFieldsFromValues(values), [values])
  const ctx = useMemo(() => buildLetterContext(fields, lang), [fields, lang])
  const products = useLiveQuery(
    () =>
      db.products
        .where('orgId')
        .equals(orgId)
        .filter((p) => p.deletedAt === null)
        .toArray(),
    [orgId],
  )

  const set = (k: keyof LetterFields, v: string) => onChange({ ...values, [k]: v })
  const pickProduct = (id: string) => {
    const p = (products ?? []).find((x) => x.id === id)
    if (p) onChange({ ...values, ...productToLetterFields(p) })
  }

  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const civ = lang === 'en' ? (ctx.agencyCiviliteEn ?? ctx.agencyCivilite) : ctx.agencyCivilite
  const sep = lang === 'en' ? ': ' : ' : '

  // Insertion en-tête/pied/signature (images du profil org) — bouton désactivé si l'image manque.
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
  const inp = (k: keyof LetterFields, placeholder?: string) => (
    <input
      type="text"
      className="field-input"
      value={fields[k]}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder ?? k}
    />
  )
  /** Puce « label : champ(s) » sur la feuille. */
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
      {/* ───── Barre d'en-tête HORS-template (pays · produit · en-tête/signature) ───── */}
      <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Pays cible', en: 'Target country' })}
          </span>
          <select
            value={fields.country}
            onChange={(e) => set('country', e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
            aria-label={t({ fr: 'Pays cible', en: 'Target country' })}
          >
            {UEMOA_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'Catalogue', en: 'Catalogue' })}
          </span>
          <select
            value=""
            onChange={(e) => pickProduct(e.target.value)}
            className="border-input bg-background h-8 min-w-44 rounded-md border px-2 text-sm"
            aria-label={t({ fr: 'Choisir un produit', en: 'Choose a product' })}
          >
            <option value="">
              {(products ?? []).length
                ? t({ fr: 'Choisir un produit', en: 'Choose a product' })
                : t({ fr: 'Aucun produit — saisir à la main', en: 'No product — type manually' })}
            </option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomCommercial}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {t({ fr: 'En-tête & signature', en: 'Letterhead & signature' })}
          </span>
          <div className="flex items-center gap-1">
            {insertBtn('useHeader', headerImage, { fr: 'En-tête', en: 'Header' })}
            {insertBtn('useFooter', footerImage, { fr: 'Pied', en: 'Footer' })}
            {insertBtn('useSignature', signatureImage, { fr: 'Signature', en: 'Signature' })}
          </div>
        </div>
      </div>

      {/* ───── Feuille A4 : lettre à cases remplissables inline ───── */}
      <div className="tplform">
        <div className="tplform-canvas">
          <div
            className="tplform-sheet letter-sheet"
            aria-label={t({ fr: 'Lettre (édition)', en: 'Letter (editing)' })}
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
              {docType === 'cover'
                ? L(
                    `Demande d’enregistrement d’AMM du produit ${ctx.nomCommercial}`,
                    `Application for marketing authorisation (MA) of the product ${ctx.nomCommercial}`,
                  )
                : L(
                    'Attestation de Prix Grossiste Hors Taxe (PGHT)',
                    'Certificate of Wholesale Price Excluding Tax (PGHT)',
                  )}
            </p>
            <p className="l-p">{`${civ},`}</p>

            <p className="l-p">
              {docType === 'cover'
                ? L(
                    'Nous avons l’honneur de soumettre à votre haute bienveillance le dossier de demande d’autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :',
                    'We have the honour of submitting for your kind consideration the application file for marketing authorisation (MA) for our following pharmaceutical specialty:',
                  )
                : L(
                    'Nous venons par la présente porter à votre connaissance les informations et le Prix Grossiste Hors Taxe (PGHT) de notre spécialité pharmaceutique, consignés ci-dessous :',
                    'We hereby bring to your attention the information and the Wholesale Price Excluding Tax (PGHT) of our pharmaceutical specialty, set out below:',
                  )}
            </p>

            <ul className="doc-bullets">
              {bullet(
                L('Nom commercial', 'Trade name'),
                inp('nomCommercial', L('Nom commercial', 'Trade name')),
              )}
              {bullet(
                L('DCI et dosage', 'INN and strength'),
                <>
                  {inp('dci', L('DCI', 'INN'))}
                  {inp('dosage', L('Dosage', 'Strength'))}
                </>,
              )}
              {bullet(
                L('Forme et présentation', 'Form and presentation'),
                <>
                  {inp('forme', L('Forme', 'Form'))}
                  {inp('presentation', L('Présentation', 'Presentation'))}
                </>,
              )}
              {docType === 'cover' ? (
                <>
                  {bullet(
                    L('Nom et adresse du demandeur d’AMM', 'Name and address of the MA applicant'),
                    <>
                      {inp('demandeurNom', L('Nom du demandeur', 'Applicant name'))}
                      {inp('demandeurAdresse', L('Adresse', 'Address'))}
                    </>,
                  )}
                  {bullet(
                    L('Nom et adresse du fabricant', 'Name and address of the manufacturer'),
                    <>
                      {inp('fabricantNom', L('Nom du fabricant', 'Manufacturer name'))}
                      {inp('fabricantAdresse', L('Adresse', 'Address'))}
                    </>,
                  )}
                </>
              ) : (
                <li>
                  <span className="field-line">
                    <span className="field-label field-label--bold">
                      {'PGHT ('}
                      <select
                        value={fields.pghtCurrency}
                        onChange={(e) => set('pghtCurrency', e.target.value)}
                        className="field-select"
                        aria-label={t({ fr: 'Devise', en: 'Currency' })}
                      >
                        {LETTER_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {`)${sep}`}
                    </span>
                    {inp('pght', L('Montant', 'Amount'))}
                  </span>
                </li>
              )}
            </ul>

            {docType === 'cover' ? (
              <p className="l-p">
                {L(
                  'Le dossier technique ci-joint a été constitué en conformité avec les directives de l’UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d’information.',
                  'The attached technical dossier has been compiled in accordance with the UEMOA guidelines and the specific requirements of your Agency. We remain at your full disposal for any further information.',
                )}
              </p>
            ) : (
              <p className="l-p">
                {L(
                  'Nous restons à votre entière disposition pour tout complément d’information.',
                  'We remain at your full disposal for any further information.',
                )}
              </p>
            )}

            <p className="l-p">
              {docType === 'cover'
                ? L(
                    `Nous vous prions d’agréer, ${civ}, l’expression de notre sincère considération.`,
                    `Please accept, ${civ}, the assurance of our highest consideration.`,
                  )
                : L(
                    `Dans l’espoir d’une suite favorable, nous vous prions d’agréer, ${civ}, l’expression de notre sincère collaboration.`,
                    `In the hope of a favourable response, please accept, ${civ}, the expression of our sincere collaboration.`,
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
