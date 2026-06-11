import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { FileDown, FileText, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import type { GeneratedDocRecord, ProductRecord } from '@/lib/db'
import { cn } from '@/lib/utils'
import { updateGeneratedDocContent } from '../generated-docs-repository'
import { syncGeneratedDocs } from '../generated-docs-sync'
import { triggerDownload } from '../download-utils'
import {
  buildRcpFillContent,
  initialRcpFormState,
  rcpFormStateFromContent,
} from '../template-form/rcp-form-content'
import {
  RCP_FORM_MODEL,
  blockHeadingText,
  rcpExportName,
  type RcpFormState,
} from '../template-form/rcp-form-model'
import { printRcpForm } from '../template-form/rcp-form-print'
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
 * Formulaire interactif du template RCP — branding officiel CEO (feuille A4 navy/Times) :
 * la structure réglementaire est rendue par le composant (titres intrinsèquement
 * verrouillés), l'utilisateur remplit champs et cases. Saisies persistées (débouncé 700 ms,
 * flush au démontage) dans le `content` TipTap du document généré → compilation du dossier
 * et vérification Regafy à l'enregistrement inchangées. Export DOCX/PDF 100 % conformes au
 * gabarit (mêmes générateurs que le fichier de référence).
 */
export function TemplateFillForm({
  genDoc,
  product,
  countryName,
  orgId,
}: {
  genDoc: GeneratedDocRecord
  product?: ProductRecord
  countryName: string
  orgId: string
}) {
  const [state, setState] = useState<RcpFormState>(() =>
    rcpFormStateFromContent(genDoc.content as JSONContent),
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<RcpFormState | null>(null)

  const persist = useCallback(
    (s: RcpFormState) => {
      pending.current = null
      void updateGeneratedDocContent(genDoc.id, buildRcpFillContent(s)).then(() =>
        syncGeneratedDocs(orgId),
      )
    },
    [genDoc.id, orgId],
  )

  /** Applique une mise à jour du formulaire + sauvegarde débouncée (700 ms). */
  const apply = useCallback(
    (next: RcpFormState) => {
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

  const setValue = (key: string, v: string) =>
    apply({ ...state, values: { ...state.values, [key]: v } })
  const toggleCheck = (key: string, idx: number) => {
    const cur = state.checks[key] ?? []
    const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx]
    apply({ ...state, checks: { ...state.checks, [key]: next } })
  }

  function handleReset() {
    if (!window.confirm('Effacer toutes les saisies et cases cochées ?')) return
    const fresh = initialRcpFormState(product)
    apply(fresh)
    toast.success('Formulaire réinitialisé', {
      description: 'Identification du produit pré-remplie depuis la fiche.',
    })
  }

  async function handleDocx() {
    try {
      // Lazy : la lib docx reste hors du chunk workspace.
      const { rcpFormDocxBlob } = await import('../template-form/rcp-form-docx')
      const blob = await rcpFormDocxBlob(state)
      triggerDownload(URL.createObjectURL(blob), `${rcpExportName(state)}.docx`, true)
    } catch (e) {
      console.error(e)
      toast.error('Échec du téléchargement (.docx).')
    }
  }

  return (
    <div className="tplform">
      <div className={cn('tplform-topbar', 'top-[5.25rem] rounded-t-lg')}>
        <div className="tplform-brand">
          <span className="tplform-t1">Résumé des Caractéristiques du Produit</span>
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
        <button type="button" className="tplform-btn" onClick={() => printRcpForm(state)}>
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
      <div className="tplform-hint">
        <b>Astuce&nbsp;:</b>&nbsp;remplissez les champs, cochez les mentions qui s’appliquent. Le
        document exporté ne contient que vos saisies et les options cochées — rien d’autre.
      </div>
      <div className="tplform-canvas">
        <main className="tplform-sheet" role="form" aria-label="Formulaire RCP">
          {RCP_FORM_MODEL.map((b, i) => {
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
                    {blockHeadingText(b.text ?? '')}
                  </h2>
                )
              case 'sub':
                return (
                  <h3 key={i} className="doc-sub">
                    {blockHeadingText(b.text ?? '')}
                  </h3>
                )
              case 'subsub':
                return (
                  <h4 key={i} className="doc-subsub">
                    {b.text}
                  </h4>
                )
              case 'static':
                return (
                  <p key={i} className="doc-static">
                    {b.text}
                  </p>
                )
              case 'rule':
                return <hr key={i} className="doc-rule" />
              case 'line':
                return (
                  <div key={i} className="field-line">
                    {b.label ? <span className="field-label">{b.label}</span> : null}
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
              case 'para':
                return (
                  <FieldArea
                    key={i}
                    value={state.values[b.key] ?? ''}
                    ph={b.ph}
                    onChange={(v) => setValue(b.key, v)}
                  />
                )
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
                        checked={(state.checks[b.chkKey] ?? []).includes(0)}
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
              default:
                return null
            }
          })}
        </main>
      </div>
    </div>
  )
}
