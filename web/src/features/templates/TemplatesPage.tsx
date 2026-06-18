import { useMemo, useState } from 'react'
import { ArrowLeft, FileText, Languages, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { formDefinitionFor } from '@/features/workspace/template-form/form-definitions'
import { TemplatePreview } from './TemplatePreview'

type Tab = 'dashboard' | 'saved'
type ZoneKey = 'all' | 'uemoa' | 'afrique' | 'europe' | 'amerique' | 'asie'

interface Zone {
  key: ZoneKey
  label: Translatable
  /** false → zone pas encore ouverte (toast « bientôt »), ne change pas la vue. */
  ready: boolean
}
const ZONES: Zone[] = [
  { key: 'all', label: { fr: 'Tous', en: 'All' }, ready: true },
  { key: 'uemoa', label: { fr: 'UEMOA/CEDEAO', en: 'WAEMU/ECOWAS' }, ready: true },
  { key: 'afrique', label: { fr: 'Afrique', en: 'Africa' }, ready: false },
  { key: 'europe', label: { fr: 'Europe', en: 'Europe' }, ready: false },
  { key: 'amerique', label: { fr: 'Amérique', en: 'America' }, ready: false },
  { key: 'asie', label: { fr: 'Asie', en: 'Asia' }, ready: false },
]

interface TemplateEntry {
  key: string
  /** docType résolu par formDefinitionFor (null = lettre générée dans le dossier — Tranche B). */
  docType: string | null
  label: Translatable
}
// Ordre validé CEO. RCP/Notice/Étiquetage ont un form-template (aperçu réel) ; Lettre de demande
// et PGHT sont générées dans le dossier (portage en form-template = Tranche B).
const TEMPLATES: TemplateEntry[] = [
  { key: 'cover', docType: null, label: { fr: 'Lettre de demande AMM', en: 'Cover Letter' } },
  { key: 'pght', docType: null, label: { fr: 'Lettre de PGHT', en: 'PGHT Letter' } },
  { key: 'rcp', docType: 'rcp', label: { fr: 'RCP', en: 'SmPC' } },
  { key: 'notice', docType: 'notice', label: { fr: 'Notice patient', en: 'PIL' } },
  { key: 'labeling', docType: 'labeling', label: { fr: 'Étiquetage', en: 'Labeling' } },
]

/**
 * Bibliothèque de templates (couche RIM). Accueil à 2 onglets : **Tableau de bord** (les 5 templates
 * officiels du Module 1, par zone réglementaire — UEMOA/CEDEAO en premier) et **Mes modèles** (les
 * versions enregistrées par l'org — persistance = tranche suivante). Accès **illimité, tous plans**
 * (aucun gating) : c'est la rédaction, pas le livrable métré. Clic sur une carte → formulaire centré
 * A4 (FR/EN). Le remplissage/sauvegarde réels d'un dossier passent par le CTD Workspace.
 */
export function TemplatesPage() {
  const { t, lang } = useI18n()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [zone, setZone] = useState<ZoneKey>('uemoa')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<TemplateEntry | null>(null)
  const [previewLang, setPreviewLang] = useState<Lang>(lang)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TEMPLATES
    return TEMPLATES.filter((e) => (e.label.fr + ' ' + e.label.en).toLowerCase().includes(q))
  }, [query])

  function pickZone(z: Zone) {
    if (z.ready) {
      setZone(z.key)
    } else {
      toast(t({ fr: `${t(z.label)} — bientôt disponible`, en: `${t(z.label)} — coming soon` }))
    }
  }

  // ───────────────────────── Vue FORMULAIRE (centrée A4, sans menu latéral) ─────────────────────────
  if (open) {
    const def = formDefinitionFor(open.docType)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" /> {t({ fr: 'Bibliothèque', en: 'Library' })}
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold">
            {t(open.label)}
          </h1>
          <LangToggle
            value={previewLang}
            onChange={setPreviewLang}
            label={t({ fr: 'Langue', en: 'Language' })}
          />
        </div>
        {def ? (
          <TemplatePreview model={def.model} lang={previewLang} />
        ) : (
          <div className="bg-muted/30 text-muted-foreground mx-auto max-w-2xl rounded-lg border p-6 text-sm">
            {t({
              fr: 'Cette lettre est générée directement dans un dossier (CTD Workspace) : le destinataire (Agence/Direction nationale) et les mentions s’adaptent au pays cible du montage. Son édition depuis la Bibliothèque arrive dans la prochaine tranche.',
              en: 'This letter is generated directly inside a dossier (CTD Workspace): the recipient (national agency) and wording adapt to the dossier’s target country. Editing it from the Library is coming in the next slice.',
            })}
          </div>
        )}
      </div>
    )
  }

  // ───────────────────────── Accueil (2 onglets) ─────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t({ fr: 'Bibliothèque', en: 'Templates' })}</h1>
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Templates officiels (FR/EN, SmPC/MedDRA) et vos modèles enregistrés. Accès libre, tous plans.',
            en: 'Official templates (FR/EN, SmPC/MedDRA) and your saved models. Free access, all plans.',
          })}
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-2" role="tablist">
        {(
          [
            { key: 'dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
            { key: 'saved', label: { fr: 'Mes modèles', en: 'My templates' } },
          ] as const
        ).map((b) => (
          <button
            key={b.key}
            type="button"
            role="tab"
            aria-selected={tab === b.key}
            onClick={() => setTab(b.key)}
            className={cn(
              'rounded-lg border px-4 py-2 text-sm font-medium transition',
              tab === b.key
                ? 'border-primary bg-primary/5 text-primary'
                : 'hover:bg-accent text-muted-foreground',
            )}
          >
            {t(b.label)}
          </button>
        ))}
      </div>

      {/* Header commun : recherche + filtres de zone */}
      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t({ fr: 'Rechercher un template…', en: 'Search a template…' })}
            className="pl-8"
            aria-label={t({ fr: 'Rechercher', en: 'Search' })}
          />
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t({ fr: 'Zone', en: 'Region' })}
        >
          {ZONES.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => pickZone(z)}
              aria-pressed={z.ready && zone === z.key}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                z.ready && zone === z.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : z.ready
                    ? 'hover:bg-accent text-foreground'
                    : 'text-muted-foreground/60 border-dashed',
              )}
            >
              {t(z.label)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dashboard' ? (
        // 5 cartes officielles, 2 par ligne (zone UEMOA/CEDEAO — les autres zones = bientôt).
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => {
                setPreviewLang(lang)
                setOpen(e)
              }}
              className="hover:border-primary/50 hover:bg-accent/40 flex items-center gap-3 rounded-xl border p-4 text-left transition"
            >
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(e.label)}</span>
                <span className="text-muted-foreground block text-xs">
                  {e.label.fr} / {e.label.en}
                </span>
              </span>
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
              {t({ fr: 'Aucun template ne correspond.', en: 'No template matches.' })}
            </p>
          ) : null}
        </div>
      ) : (
        // Mes modèles — persistance (enregistrer/éditer/supprimer) = tranche suivante.
        <div className="bg-muted/30 text-muted-foreground rounded-lg border p-8 text-center text-sm">
          {t({
            fr: 'Vous n’avez pas encore de modèle enregistré. Bientôt : enregistrez un template rempli (avec les métadonnées produit) pour le réutiliser et le modifier ici.',
            en: 'You have no saved template yet. Coming soon: save a filled template (with product metadata) to reuse and edit it here.',
          })}
        </div>
      )}
    </div>
  )
}

function LangToggle({
  value,
  onChange,
  label,
}: {
  value: Lang
  onChange: (l: Lang) => void
  label: string
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border p-0.5"
      role="group"
      aria-label={label}
    >
      <Languages className="text-muted-foreground ml-1 size-3.5" aria-hidden />
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={value === l}
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium uppercase transition',
            value === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
