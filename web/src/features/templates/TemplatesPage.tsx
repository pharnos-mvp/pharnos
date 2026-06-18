import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, FileText, Languages, Pencil, Save, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/db'
import { useI18n, type Lang, type Translatable } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import { useOrgId } from '@/features/org/org-context'
import { formDefinitionFor } from '@/features/workspace/template-form/form-definitions'
import {
  emptyFormState,
  type TemplateFormState,
} from '@/features/workspace/template-form/form-types'
import { TemplatePreview } from './TemplatePreview'
import { deleteSavedTemplate, saveTemplate } from './saved-templates-repository'

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
  /** docType résolu par formDefinitionFor (null = lettre générée dans le dossier — tranche M3). */
  docType: string | null
  label: Translatable
}
const TEMPLATES: TemplateEntry[] = [
  { key: 'cover', docType: null, label: { fr: 'Lettre de demande AMM', en: 'Cover Letter' } },
  { key: 'pght', docType: null, label: { fr: 'Lettre de PGHT', en: 'PGHT Letter' } },
  { key: 'rcp', docType: 'rcp', label: { fr: 'RCP', en: 'SmPC' } },
  { key: 'notice', docType: 'notice', label: { fr: 'Notice patient', en: 'PIL' } },
  { key: 'labeling', docType: 'labeling', label: { fr: 'Étiquetage', en: 'Labeling' } },
]
const DOC_LABEL: Record<string, Translatable> = {
  rcp: { fr: 'RCP', en: 'SmPC' },
  notice: { fr: 'Notice patient', en: 'PIL' },
  labeling: { fr: 'Étiquetage', en: 'Labeling' },
}

/** Édition en cours (carte du tableau de bord = neuf ; carte « Mes modèles » = chargé). */
interface Editing {
  docType: string | null
  savedId?: string
  title: string
  state: TemplateFormState
  lang: Lang
}

/**
 * Bibliothèque de templates (couche RIM). 2 onglets : **Tableau de bord** (5 templates officiels par
 * zone, UEMOA/CEDEAO d'abord) et **Mes modèles** (versions enregistrées par l'org, local-first Dexie ;
 * onglet masqué si aucune). Accès **illimité, tous plans** (aucun gating). Clic carte → formulaire
 * centré A4 éditable (FR/EN) → Enregistrer. Le remplissage d'un dossier réel passe par le Workspace.
 */
export function TemplatesPage() {
  const { t, lang } = useI18n()
  const orgId = useOrgId()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [zone, setZone] = useState<ZoneKey>('uemoa')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [saving, setSaving] = useState(false)

  const saved = useLiveQuery(
    () =>
      db.savedTemplates
        .where('orgId')
        .equals(orgId)
        .filter((r) => r.deletedAt === null)
        .toArray(),
    [orgId],
  )
  const savedList = useMemo(
    () => (saved ?? []).slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [saved],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TEMPLATES
    return TEMPLATES.filter((e) => (e.label.fr + ' ' + e.label.en).toLowerCase().includes(q))
  }, [query])

  function pickZone(z: Zone) {
    if (z.ready) setZone(z.key)
    else toast(t({ fr: `${t(z.label)} — bientôt disponible`, en: `${t(z.label)} — coming soon` }))
  }

  function openNew(e: TemplateEntry) {
    const def = formDefinitionFor(e.docType)
    setEditing({
      docType: e.docType,
      title: '',
      state: def
        ? emptyFormState(def.model)
        : ({
            values: {},
            checks: {},
            selects: {},
            globals: {
              verb: 'prendre',
              hcp: { medecin: true, pharmacien: true, infirmier: false },
            },
          } as TemplateFormState),
      lang,
    })
  }

  async function handleSave() {
    if (!editing || !editing.docType) return
    const title = editing.title.trim() || t({ fr: 'Modèle sans titre', en: 'Untitled template' })
    setSaving(true)
    try {
      await saveTemplate({
        id: editing.savedId,
        orgId,
        docType: editing.docType,
        title,
        productName: editing.state.values['denomination'] || undefined,
        dci: editing.state.values['composition'] || undefined,
        lang: editing.lang,
        state: editing.state,
      })
      toast.success(t({ fr: 'Modèle enregistré', en: 'Template saved' }))
      setEditing(null)
      setTab('saved')
    } catch (err) {
      toast.error(t({ fr: 'Échec de l’enregistrement', en: 'Save failed' }))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // ───────────────────────── Vue FORMULAIRE (centrée A4, sans menu latéral) ─────────────────────────
  if (editing) {
    const def = formDefinitionFor(editing.docType)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" /> {t({ fr: 'Bibliothèque', en: 'Library' })}
          </button>
          {def ? (
            <>
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder={t({
                  fr: 'Nom du modèle (ex. produit)',
                  en: 'Template name (e.g. product)',
                })}
                className="h-8 max-w-xs"
                aria-label={t({ fr: 'Nom du modèle', en: 'Template name' })}
              />
              <div className="ml-auto flex items-center gap-2">
                <LangToggle
                  value={editing.lang}
                  onChange={(l) => setEditing({ ...editing, lang: l })}
                  label={t({ fr: 'Langue', en: 'Language' })}
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  <Save className="size-4" /> {t({ fr: 'Enregistrer', en: 'Save' })}
                </Button>
              </div>
            </>
          ) : null}
        </div>
        {def ? (
          <TemplatePreview
            model={def.model}
            lang={editing.lang}
            editable
            state={editing.state}
            onChange={(s) => setEditing({ ...editing, state: s })}
          />
        ) : (
          <div className="bg-muted/30 text-muted-foreground mx-auto max-w-2xl rounded-lg border p-6 text-sm">
            {t({
              fr: 'Cette lettre est générée directement dans un dossier (CTD Workspace) : le destinataire (Agence/Direction nationale) et les mentions s’adaptent au pays cible du montage. Son édition depuis la Bibliothèque arrive prochainement.',
              en: 'This letter is generated directly inside a dossier (CTD Workspace): the recipient (national agency) and wording adapt to the dossier’s target country. Editing it from the Library is coming soon.',
            })}
          </div>
        )}
      </div>
    )
  }

  const showSavedTab = savedList.length > 0
  const effectiveTab: Tab = tab === 'saved' && !showSavedTab ? 'dashboard' : tab

  // ───────────────────────── Accueil (onglets) ─────────────────────────
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

      {/* Onglets — « Mes modèles » masqué tant qu'aucun modèle enregistré. */}
      <div className="flex gap-2" role="tablist">
        <TabBtn active={effectiveTab === 'dashboard'} onClick={() => setTab('dashboard')}>
          {t({ fr: 'Tableau de bord', en: 'Dashboard' })}
        </TabBtn>
        {showSavedTab ? (
          <TabBtn active={effectiveTab === 'saved'} onClick={() => setTab('saved')}>
            {t({ fr: 'Mes modèles', en: 'My templates' })} ({savedList.length})
          </TabBtn>
        ) : null}
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

      {effectiveTab === 'dashboard' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => openNew(e)}
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
        // Mes modèles — cartes des modèles enregistrés (métadonnées) : éditer / supprimer.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {savedList.map((rec) => (
            <div key={rec.id} className="flex items-start gap-3 rounded-xl border p-4">
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{rec.title}</div>
                <div className="text-muted-foreground text-xs">
                  {t(DOC_LABEL[rec.docType] ?? { fr: rec.docType, en: rec.docType })} ·{' '}
                  {rec.lang.toUpperCase()}
                  {rec.productName ? ` · ${rec.productName}` : ''}
                  {rec.dci ? ` · ${rec.dci}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={t({ fr: 'Modifier', en: 'Edit' })}
                  title={t({ fr: 'Modifier', en: 'Edit' })}
                  className="hover:bg-accent rounded-md p-1.5"
                  onClick={() =>
                    setEditing({
                      docType: rec.docType,
                      savedId: rec.id,
                      title: rec.title,
                      state: rec.state as TemplateFormState,
                      lang: rec.lang,
                    })
                  }
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t({ fr: 'Supprimer', en: 'Delete' })}
                  title={t({ fr: 'Supprimer', en: 'Delete' })}
                  className="hover:bg-destructive/10 hover:text-destructive rounded-md p-1.5"
                  onClick={() => {
                    if (
                      window.confirm(
                        t({ fr: 'Supprimer ce modèle ?', en: 'Delete this template?' }),
                      )
                    )
                      void deleteSavedTemplate(rec.id)
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-4 py-2 text-sm font-medium transition',
        active
          ? 'border-primary bg-primary/5 text-primary'
          : 'hover:bg-accent text-muted-foreground',
      )}
    >
      {children}
    </button>
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
