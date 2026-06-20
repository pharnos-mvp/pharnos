import { useMemo } from 'react'

import { Input } from '@/components/ui/input'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { TEMPLATES, type TemplateKey } from '@/features/workspace/templates'
import {
  buildLetterContext,
  letterFieldsFromValues,
  UEMOA_COUNTRIES,
  type LetterFields,
} from '@/features/workspace/letter-context'
import { letterDocToHtml } from '@/features/workspace/letter-render'
import '@/features/workspace/template-form/template-form.css'

/**
 * Éditeur **standalone** d'une lettre (cover/PGHT) dans la Bibliothèque. Saisie à gauche, **aperçu
 * A4 live** à droite (rendu via `letterDocToHtml` — même source que l'export PDF/DOCX). Le **pays
 * cible** pilote le destinataire (agence/civilité/ville) ; FR/EN via le toggle de la barre d'actions.
 * Les valeurs sont stockées à plat (`Record<string,string>`) → persistées dans `savedTemplates`.
 */
export function LetterEditor({
  docType,
  values,
  lang,
  onChange,
}: {
  docType: 'cover' | 'pght'
  values: Record<string, string>
  lang: Lang
  onChange: (values: Record<string, string>) => void
}) {
  const { t } = useI18n()
  const fields = useMemo(() => letterFieldsFromValues(values), [values])
  const set = (k: keyof LetterFields, v: string) => onChange({ ...values, [k]: v })

  const { html, ctx } = useMemo(() => {
    const c = buildLetterContext(fields, lang)
    const doc = TEMPLATES[docType as TemplateKey].build(c, lang)
    return { html: letterDocToHtml(doc), ctx: c }
  }, [fields, lang, docType])

  // Champ étiqueté — FONCTION (appelée inline) et non composant, pour ne pas remonter l'input à
  // chaque frappe (perte de focus). Même motif que TemplatePreview.
  const field = (k: keyof LetterFields, label: Translatable) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{t(label)}</span>
      <Input value={fields[k]} onChange={(e) => set(k, e.target.value)} className="h-8" />
    </label>
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      {/* ── Panneau de saisie ── */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
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

        {/* Destinataire auto (preuve du pilotage par pays) */}
        <div className="bg-muted/40 text-muted-foreground rounded-md border p-2 text-xs">
          <div className="text-foreground font-medium">
            {t({ fr: 'Destinataire (auto)', en: 'Recipient (auto)' })}
          </div>
          <div>{ctx.agencyFull}</div>
          <div>{lang === 'en' ? ctx.agencyCiviliteEn : ctx.agencyCivilite}</div>
        </div>

        {field('nomCommercial', { fr: 'Nom commercial', en: 'Trade name' })}
        <div className="grid grid-cols-2 gap-2">
          {field('dci', { fr: 'DCI', en: 'INN' })}
          {field('dosage', { fr: 'Dosage', en: 'Strength' })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field('forme', { fr: 'Forme', en: 'Form' })}
          {field('presentation', { fr: 'Présentation', en: 'Presentation' })}
        </div>
        {field('demandeurNom', { fr: 'Demandeur d’AMM — nom', en: 'MA applicant — name' })}
        {field('demandeurAdresse', { fr: 'Demandeur — adresse', en: 'Applicant — address' })}
        {field('fabricantNom', { fr: 'Fabricant — nom', en: 'Manufacturer — name' })}
        {field('fabricantAdresse', { fr: 'Fabricant — adresse', en: 'Manufacturer — address' })}
        {docType === 'pght' ? field('pght', { fr: 'PGHT (FCFA)', en: 'PGHT (FCFA)' }) : null}
        <div className="grid grid-cols-2 gap-2">
          {field('poste', { fr: 'Signataire — poste', en: 'Signer — position' })}
          {field('signataire', { fr: 'Signataire — nom', en: 'Signer — name' })}
        </div>
      </div>

      {/* ── Aperçu A4 live ── */}
      <div className="tplform">
        <div className="tplform-canvas">
          <div
            className="tplform-sheet"
            aria-label={t({ fr: 'Aperçu de la lettre', en: 'Letter preview' })}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}
