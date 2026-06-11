import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { FileDown, FileText, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import type { GeneratedDocRecord, ProductRecord } from '@/lib/db'
import { cn } from '@/lib/utils'
import { updateGeneratedDocContent } from '../generated-docs-repository'
import { syncGeneratedDocs } from '../generated-docs-sync'
import { triggerDownload } from '../download-utils'
import { buildFillContent, formStateFromContent } from '../template-form/form-content'
import {
  blockHeadingText,
  formExportName,
  initialFormState,
  resolveText,
  type FormGlobals,
  type TemplateFormDefinition,
  type TemplateFormState,
} from '../template-form/form-types'
import { printForm } from '../template-form/form-print'
import '../template-form/template-form.css'

/** Zone de texte auto-extensible sur la feuille (hauteur ajustée au contenu). */
function FieldArea({
  value,
  ph,
  onChange,
}: {
  value: string
  ph: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight + 2}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="field-area"
      rows={1}
      placeholder={ph}
      aria-label={ph}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Formulaire interactif d'un template officiel (RCP, Notice, Étiquetage) — branding CEO
 * (feuille A4 navy/Times) : la structure réglementaire est rendue par le composant (titres
 * intrinsèquement verrouillés), l'utilisateur remplit champs, cases et choix. Saisies
 * persistées (débouncé 700 ms, flush au démontage) dans le `content` TipTap du document
 * généré → compilation du dossier et vérification Regafy à l'enregistrement inchangées.
 * Exports DOCX/PDF 100 % conformes aux gabarits. La Notice porte en plus la barre de
 * réglages GLOBAUX (verbe employé, professionnels mentionnés) du gabarit.
 */
export function TemplateFillForm({
  def,
  genDoc,
  product,
  countryName,
  orgId,
}: {
  def: TemplateFormDefinition
  genDoc: GeneratedDocRecord
  product?: ProductRecord
  countryName: string
  orgId: string
}) {
  const [state, setState] = useState<TemplateFormState>(() =>
    formStateFromContent(def, genDoc.content as JSONContent),
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<TemplateFormState | null>(null)

  const persist = useCallback(
    (s: TemplateFormState) => {
      pending.current = null
      void updateGeneratedDocContent(genDoc.id, buildFillContent(def, s)).then(() =>
        syncGeneratedDocs(orgId),
      )
    },
    [def, genDoc.id, orgId],
  )

  /** Applique une mise à jour du formulaire + sauvegarde débouncée (700 ms). */
  const apply = useCallback(
    (next: TemplateFormState) => {
      setState(next)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        if (pending.current) persist(pending.current)
      }, 700)
    },
    [persist],
  )

  // Flush au démontage (changement d'onglet/section, navigation) — aucune saisie perdue.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (pending.current) persist(pending.current)
    },
    [persist],
  )

  const g = state.globals
  const setValue = (key: string, v: string) =>
    apply({ ...state, values: { ...state.values, [key]: v } })
  const toggleCheck = (key: string, idx: number) => {
    const cur = state.checks[key] ?? []
    const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx]
    apply({ ...state, checks: { ...state.checks, [key]: next } })
  }
  const setSelect = (key: string, v: string) =>
    apply({ ...state, selects: { ...state.selects, [key]: v } })
  const setGlobals = (next: FormGlobals) => apply({ ...state, globals: next })
  const isChecked = (key: string) => (state.checks[key] ?? []).includes(0)

  function handleReset() {
    if (!window.confirm('Effacer toutes les saisies et cases cochées ?')) return
    apply(initialFormState(def, product))
    toast.success('Formulaire réinitialisé', {
      description: 'Identification du produit pré-remplie depuis la fiche.',
    })
  }

  async function handleDocx() {
    try {
      // Lazy : la lib docx reste hors du chunk workspace.
      const { formDocxBlob } = await import('../template-form/form-docx')
      const blob = await formDocxBlob(def, state)
      triggerDownload(URL.createObjectURL(blob), `${formExportName(def, state)}.docx`, true)
    } catch (e) {
      console.error(e)
      toast.error('Échec du téléchargement (.docx).')
    }
  }

  return (
    <div className="tplform">
      <div className={cn('tplform-topbar', 'top-[5.25rem] rounded-t-lg')}>
        <div className="tplform-brand">
          <span className="tplform-t1">{def.topbarTitle}</span>
          <span className="tplform-t2">
            Formulaire interactif — gabarit réglementaire ({countryName} / UEMOA)
          </span>
        </div>
        <div className="tplform-spacer" />
        <button
          type="button"
          className="tplform-btn tplform-btn--ghost"
          title="Tout effacer"
          onClick={handleReset}
        >
          <RotateCcw aria-hidden /> Réinitialiser
        </button>
        <button type="button" className="tplform-btn" onClick={() => printForm(def, state)}>
          <FileText aria-hidden /> PDF
        </button>
        <button
          type="button"
          className="tplform-btn tplform-btn--primary"
          onClick={() => void handleDocx()}
        >
          <FileDown aria-hidden /> Télécharger DOCX
        </button>
      </div>
      {def.hasGlobalsBar ? (
        // Réglages GLOBAUX du gabarit Notice : appliqués à tous les textes dynamiques.
        <div className="tplform-globals">
          <span className="tplform-g-label">Verbe employé&nbsp;:</span>
          <select
            className="tplform-g-select"
            aria-label="Verbe employé"
            value={g.verb}
            onChange={(e) =>
              setGlobals({ ...g, verb: e.target.value === 'utiliser' ? 'utiliser' : 'prendre' })
            }
          >
            <option value="prendre">prendre</option>
            <option value="utiliser">utiliser</option>
          </select>
          <span className="tplform-g-divider" />
          <span className="tplform-g-label">Professionnels mentionnés&nbsp;:</span>
          {(['medecin', 'pharmacien', 'infirmier'] as const).map((k) => (
            <label key={k} className="tplform-g-cb">
              <input
                type="checkbox"
                checked={g.hcp[k]}
                onChange={(e) => setGlobals({ ...g, hcp: { ...g.hcp, [k]: e.target.checked } })}
              />
              {k === 'medecin' ? 'médecin' : k === 'pharmacien' ? 'pharmacien' : 'infirmier/ère'}
            </label>
          ))}
          <span className="tplform-spacer" />
          <span className="tplform-g-hint">Ces réglages s’appliquent à tout le document.</span>
        </div>
      ) : null}
      <div className="tplform-hint">
        <b>Astuce&nbsp;:</b>&nbsp;remplissez les champs, cochez les mentions qui s’appliquent. Le
        document exporté ne contient que vos saisies et les options cochées — rien d’autre.
      </div>
      <div className="tplform-canvas">
        <main className="tplform-sheet" role="form" aria-label={`Formulaire ${def.topbarTitle}`}>
          {def.model.map((b, i) => {
            switch (b.type) {
              case 'title':
                return (
                  <h1 key={i} className="doc-title">
                    {b.text}
                  </h1>
                )
              case 'sec':
                return (
                  <h2 key={i} className="doc-sec">
                    {blockHeadingText(b.text)}
                  </h2>
                )
              case 'banner':
                return (
                  <h2 key={i} className="doc-banner">
                    {blockHeadingText(b.text)}
                  </h2>
                )
              case 'sub':
                return (
                  <h3 key={i} className="doc-sub">
                    {blockHeadingText(b.text)}
                  </h3>
                )
              case 'subsub':
                return (
                  <h4 key={i} className="doc-subsub">
                    {b.text}
                  </h4>
                )
              case 'secDyn':
                return (
                  <h2 key={i} className="doc-sec">
                    {blockHeadingText(b.dynText(g))}
                  </h2>
                )
              case 'subDyn':
                return (
                  <h3 key={i} className="doc-sub">
                    {blockHeadingText(b.dynText(g))}
                  </h3>
                )
              case 'static':
                return (
                  <p key={i} className="doc-static">
                    {b.text}
                  </p>
                )
              case 'dyn':
                return (
                  <p key={i} className="doc-static">
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
              case 'line': {
                if (b.dependsOn && !isChecked(b.dependsOn)) return null
                return (
                  <div key={i} className={cn('field-line', b.dependsOn && 'field-line--indent')}>
                    {b.label ? <span className="field-label">{b.label}</span> : null}
                    <input
                      type="text"
                      className={cn('field-input', b.narrow && 'field-input--narrow')}
                      placeholder={b.ph}
                      aria-label={b.ph}
                      value={state.values[b.key] ?? ''}
                      onChange={(e) => setValue(b.key, e.target.value)}
                    />
                    {b.suffix ? <span className="field-suffix">{b.suffix}</span> : null}
                  </div>
                )
              }
              case 'para': {
                if (b.dependsOn && !isChecked(b.dependsOn)) return null
                return (
                  <FieldArea
                    key={i}
                    value={state.values[b.key] ?? ''}
                    ph={b.ph}
                    onChange={(v) => setValue(b.key, v)}
                  />
                )
              }
              case 'duree':
                return (
                  <div key={i} className="field-line">
                    <input
                      type="text"
                      className="field-input field-input--narrow"
                      placeholder={b.ph}
                      aria-label="Durée de conservation (nombre de mois)"
                      value={state.values[b.key] ?? ''}
                      onChange={(e) => setValue(b.key, e.target.value)}
                    />
                    <span className="field-suffix">mois</span>
                  </div>
                )
              case 'atc':
                return (
                  <div key={i}>
                    <div className="field-line">
                      <span className="field-label">{b.label}</span>
                      <input
                        type="text"
                        className="field-input"
                        placeholder={b.ph}
                        aria-label={b.ph}
                        value={state.values[b.key] ?? ''}
                        onChange={(e) => setValue(b.key, e.target.value)}
                      />
                    </div>
                    <label className="chk">
                      <input
                        type="checkbox"
                        className="chk-box"
                        checked={isChecked(b.chkKey)}
                        onChange={() => toggleCheck(b.chkKey, 0)}
                      />
                      <span className="chk-text">{b.chkLabel}</span>
                    </label>
                  </div>
                )
              case 'checks':
                return (
                  <div key={i} className="chk-group">
                    {b.options.map((opt, oi) => (
                      <label key={oi} className="chk">
                        <input
                          type="checkbox"
                          className="chk-box"
                          checked={(state.checks[b.key] ?? []).includes(oi)}
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
                      checked={isChecked(b.key)}
                      onChange={() => toggleCheck(b.key, 0)}
                    />
                    <span className="chk-text">{resolveText(b.text, g)}</span>
                  </label>
                )
              case 'subSelect':
                return (
                  <div key={i} className="field-line doc-sub-line">
                    <span className="field-label field-label--bold">{b.before}</span>
                    <select
                      className="field-select"
                      aria-label={b.before.trim()}
                      value={state.selects[b.key] ?? ''}
                      onChange={(e) => setSelect(b.key, e.target.value)}
                    >
                      <option value="">— choisir —</option>
                      {b.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              case 'subLine':
                return (
                  <div key={i} className="field-line doc-sub-line">
                    <span className="field-label field-label--bold">{b.before}</span>
                    <input
                      type="text"
                      className="field-input"
                      placeholder={b.ph}
                      aria-label={b.ph}
                      value={state.values[b.key] ?? ''}
                      onChange={(e) => setValue(b.key, e.target.value)}
                    />
                  </div>
                )
              default:
                return null
            }
          })}
        </main>
      </div>
    </div>
  )
}
