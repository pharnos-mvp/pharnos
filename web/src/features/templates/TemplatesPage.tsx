import { useState } from 'react'
import { FileText, Languages } from 'lucide-react'

import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { formDefinitionFor } from '@/features/workspace/template-form/form-definitions'
import { TemplatePreview } from './TemplatePreview'

interface TemplateEntry {
  key: string
  /** docType résolu par formDefinitionFor (null = lettre générée, pas encore un form-template). */
  docType: string | null
  label: Translatable
}

// Les 5 templates officiels du Module 1. RCP/Notice/Étiquetage ont un form-template (aperçu réel) ;
// Lettre de demande/PGHT sont générées dans le dossier (portage en form-template = jalon suivant).
const TEMPLATES: TemplateEntry[] = [
  {
    key: 'rcp',
    docType: 'rcp',
    label: {
      fr: 'RCP — Résumé des Caractéristiques du Produit',
      en: 'SmPC — Summary of Product Characteristics',
    },
  },
  { key: 'notice', docType: 'notice', label: { fr: 'Notice patient', en: 'Package Leaflet' } },
  { key: 'labeling', docType: 'labeling', label: { fr: 'Étiquetage', en: 'Labelling' } },
  { key: 'cover', docType: null, label: { fr: 'Lettre de demande', en: 'Cover Letter' } },
  {
    key: 'pght',
    docType: null,
    label: {
      fr: 'Lettre PGHT (Prix Grossiste Hors Taxe)',
      en: 'PGHT Letter (Wholesale Price, ex-VAT)',
    },
  },
]

/**
 * Bibliothèque de templates (couche RIM) — référence des 5 templates officiels du Module 1,
 * consultables en FR ou EN (EN aligné SmPC/MedDRA). **Accès illimité, tous plans** (aucun gating) :
 * c'est la rédaction, pas le livrable métré. Le remplissage réel se fait dans un dossier (Workspace).
 */
export function TemplatesPage() {
  const { t, lang } = useI18n()
  const [selected, setSelected] = useState<TemplateEntry>(TEMPLATES[0]!)
  const [previewLang, setPreviewLang] = useState<Lang>(lang)
  const def = formDefinitionFor(selected.docType)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t({ fr: 'Bibliothèque', en: 'Templates' })}</h1>
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Les 5 templates officiels du Module 1, consultables en français et en anglais (SmPC/MedDRA). Accès libre, tous plans.',
            en: 'The 5 official Module 1 templates, viewable in French and English (SmPC/MedDRA). Free access, all plans.',
          })}
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Liste des 5 templates */}
        <nav
          className="flex shrink-0 flex-col gap-1 lg:w-72"
          aria-label={t({ fr: 'Templates', en: 'Templates' })}
        >
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => setSelected(tpl)}
              aria-pressed={selected.key === tpl.key}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                selected.key === tpl.key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'hover:bg-accent text-foreground',
              )}
            >
              <FileText className="size-4 shrink-0" />
              <span>{t(tpl.label)}</span>
            </button>
          ))}
        </nav>

        {/* Aperçu + bascule de langue */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{t(selected.label)}</h2>
            <div
              className="inline-flex items-center gap-1 rounded-md border p-0.5"
              role="group"
              aria-label={t({ fr: 'Langue de l’aperçu', en: 'Preview language' })}
            >
              <Languages className="text-muted-foreground ml-1 size-3.5" aria-hidden />
              {(['fr', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setPreviewLang(l)}
                  aria-pressed={previewLang === l}
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-medium uppercase transition',
                    previewLang === l
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {def ? (
            <div className="overflow-hidden rounded-lg border">
              <TemplatePreview model={def.model} lang={previewLang} />
            </div>
          ) : (
            <div className="bg-muted/30 text-muted-foreground rounded-lg border p-6 text-sm">
              {t({
                fr: 'Cette lettre est générée directement dans un dossier (CTD Workspace) avec le destinataire et les mentions du pays cible. Son aperçu bilingue dans la Bibliothèque arrive dans une prochaine version.',
                en: 'This letter is generated directly inside a dossier (CTD Workspace) with the recipient and target-country wording. Its bilingual preview in the Library is coming in a future version.',
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
