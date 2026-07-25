import { useState } from 'react'
import { BookMarked, Landmark, Plus, ScrollText, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Section } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { COUNTRIES, countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n } from '@/lib/i18n-context'
import { adminApi, type RefVersionRow } from './admin-api'
import {
  currentKey,
  entryError,
  fromServerEntry,
  nextLabel,
  prefillEntry,
  refErrorLabel,
  SECTION_LABEL,
  toPayload,
  type CurrentMap,
  type DraftEntry,
  type SectionKey,
} from './ref-draft'
import { useAsync } from './use-async'

/**
 * Onglet « Référentiel » de la console god (P4.4, mockup écran 2 validé CEO) — LE canal de
 * publication de la « regulatory intelligence » : versions, éditeur de brouillon avec PROVENANCE
 * OBLIGATOIRE (pas de source, pas de publication), publication qui NOTIFIE sans jamais imposer
 * (l'adoption reste un consentement d'admin d'org, 0072), suivi d'adoption par organisation.
 *
 * Une version PUBLIÉE est immuable (photographie opposable) : corriger = publier une nouvelle
 * version. `ctd_structure` (P4.5) absente à dessein : publier une section que rien ne rend
 * serait un piège.
 */

export function AdminReferentiel() {
  const { t, lang } = useI18n()
  const overview = useAsync(adminApi.refOverview)
  const [draft, setDraft] = useState<{
    versionId: string | null
    label: string
    effectiveDate: string
    releaseNote: string
    entries: DraftEntry[]
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState<{ id: string; label: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [adoptionOf, setAdoptionOf] = useState<string | null>(null)

  const data = overview.data
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR') : '—'

  if (overview.loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (overview.error || !data) {
    return (
      <EmptyState
        icon={<BookMarked />}
        title={t({ fr: 'Référentiel indisponible', en: 'Reference data unavailable' })}
        description={t({ fr: 'Réessayez dans un instant.', en: 'Try again in a moment.' })}
        action={
          <Button variant="outline" size="sm" onClick={overview.reload}>
            {t({ fr: 'Réessayer', en: 'Retry' })}
          </Button>
        }
      />
    )
  }

  const latest = data.versions.find((v) => v.id === data.latest_id) ?? null
  const draftVersions = data.versions.filter((v) => v.status === 'draft')
  const activeOrgs = data.orgs.filter((o) => !o.disabled_at)
  // Contenu résolu courant (pays|section) : la base de préremplissage de l'éditeur (revue M2).
  const currentMap: CurrentMap = new Map(
    data.current.map((c) => [currentKey(c.country, c.section), c]),
  )

  const openDraft = async (v?: RefVersionRow) => {
    if (v) {
      setBusy(true)
      try {
        const rows = await adminApi.refEntries(v.id)
        setDraft({
          versionId: v.id,
          label: v.label,
          effectiveDate: v.effective_date ?? '',
          releaseNote: v.release_note,
          entries: rows.map(fromServerEntry),
        })
      } catch {
        toast.error(t({ fr: 'Chargement du brouillon impossible.', en: 'Could not load draft.' }))
      } finally {
        setBusy(false)
      }
    } else {
      setDraft({
        versionId: null,
        label: nextLabel(data.versions),
        effectiveDate: '',
        releaseNote: '',
        entries: [prefillEntry('SN', 'fees', currentMap)],
      })
    }
  }

  const saveDraft = async (): Promise<string | null> => {
    if (!draft) return null
    const seen = new Set<string>()
    for (const e of draft.entries) {
      const key = currentKey(e.country, e.section)
      if (seen.has(key)) {
        toast.error(
          t({
            fr: `${e.country} · ${t(SECTION_LABEL[e.section])} — entrée en double : fusionnez-les.`,
            en: `${e.country} · ${t(SECTION_LABEL[e.section])} — duplicate entry: merge them.`,
          }),
        )
        return null
      }
      seen.add(key)
      const err = entryError(e)
      if (err) {
        toast.error(`${e.country} · ${t(SECTION_LABEL[e.section])} — ${t(err)}`)
        return null
      }
    }
    setBusy(true)
    try {
      const { versionId } = await adminApi.refSaveDraft({
        versionId: draft.versionId,
        label: draft.label.trim(),
        effectiveDate: draft.effectiveDate || null,
        releaseNote: draft.releaseNote.trim(),
        entries: draft.entries.map((e) => ({
          country: e.country,
          section: e.section,
          payload: toPayload(e),
          provenance: {
            texte: e.provTexte.trim(),
            ...(e.provJo.trim() ? { jo: e.provJo.trim() } : {}),
            ...(e.provComplements.trim() ? { complements: e.provComplements.trim() } : {}),
          },
        })),
      })
      setDraft((d) => (d ? { ...d, versionId } : d))
      overview.reload()
      toast.success(t({ fr: 'Brouillon enregistré.', en: 'Draft saved.' }))
      return versionId
    } catch (err) {
      toast.error(t(refErrorLabel(err, { fr: "L'enregistrement a échoué.", en: 'Save failed.' })))
      return null
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!publishing) return
    setBusy(true)
    try {
      await adminApi.refPublish(publishing.id)
      toast.success(
        t({
          fr: `${publishing.label} publiée — les organisations sont notifiées, l'adoption reste à leur main.`,
          en: `${publishing.label} published — organisations are notified; adoption stays in their hands.`,
        }),
      )
      setPublishing(null)
      setDraft(null)
      overview.reload()
    } catch (err) {
      toast.error(
        t(
          refErrorLabel(err, {
            fr: 'Publication refusée (version vide ou provenance manquante ?).',
            en: 'Publish refused (empty version or missing provenance?).',
          }),
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const deleteDraft = async () => {
    if (!draft?.versionId) return
    setBusy(true)
    try {
      await adminApi.refDeleteDraft(draft.versionId)
      toast.success(t({ fr: 'Brouillon supprimé.', en: 'Draft deleted.' }))
      setConfirmDelete(false)
      setDraft(null)
      overview.reload()
    } catch (err) {
      toast.error(t(refErrorLabel(err, { fr: 'Suppression impossible.', en: 'Could not delete.' })))
    } finally {
      setBusy(false)
    }
  }

  const upd = (i: number, patch: Partial<DraftEntry>) =>
    setDraft((d) =>
      d ? { ...d, entries: d.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : d,
    )

  return (
    <div className="space-y-4">
      {/* ── KPIs (mockup écran 2) ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RefKpi
          label={t({ fr: 'Version publiée', en: 'Published version' })}
          value={latest?.label ?? '—'}
          sub={
            latest ? `${fmtDate(latest.published_at)} · ${latest.release_note.slice(0, 60)}` : ''
          }
          icon={BookMarked}
        />
        <RefKpi
          label={t({ fr: 'Adoption (dernière version)', en: 'Adoption (latest)' })}
          value={latest ? `${latest.adoption_count} / ${activeOrgs.length}` : '—'}
          sub={t({ fr: 'organisations actives', en: 'active organisations' })}
          icon={Landmark}
        />
        <RefKpi
          label={t({ fr: 'Brouillon en cours', en: 'Current draft' })}
          value={draftVersions[0]?.label ?? '—'}
          sub={
            draftVersions[0]
              ? `${draftVersions[0].entry_count} ${t({ fr: 'entrées', en: 'entries' })}`
              : t({ fr: 'aucun', en: 'none' })
          }
          icon={ScrollText}
        />
        <RefKpi
          label={t({
            fr: 'Dossiers sur une version antérieure',
            en: 'Submissions on an earlier version',
          })}
          value={String(data.pinned_behind)}
          sub={`${t({ fr: 'sur', en: 'of' })} ${data.active_dossiers} ${t({ fr: 'actifs', en: 'active' })}`}
          icon={Send}
        />
      </div>

      {/* `minmax(0, …)` et non `5fr_4fr` nu : une piste `fr` a pour minimum son CONTENU, et la
          note de publication (`truncate` = white-space: nowrap) impose sa longueur ENTIÈRE en
          min-content → la colonne de gauche mangeait ~80 % et l'éditeur était écrasé. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] xl:items-start">
        {/* ── Versions + adoption ── */}
        <div className="min-w-0 space-y-4">
          <Section
            title={t({ fr: 'Versions du référentiel', en: 'Reference data versions' })}
            actions={
              <Button size="sm" onClick={() => void openDraft()} disabled={busy}>
                <Plus /> {t({ fr: 'Nouveau brouillon', en: 'New draft' })}
              </Button>
            }
          >
            <ul className="divide-border divide-y">
              {data.versions.map((v) => {
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="font-display min-w-16 font-bold">{v.label}</span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">
                      {v.release_note ||
                        t({ fr: `${v.entry_count} entrées`, en: `${v.entry_count} entries` })}
                      {v.countries.length > 0 ? ` · ${v.countries.join(', ')}` : ''}
                      {v.is_baseline ? ` · ${t({ fr: 'socle', en: 'baseline' })}` : ''}
                    </span>
                    {v.status === 'published' ? (
                      <button
                        type="button"
                        className="shrink-0"
                        onClick={() => setAdoptionOf(adoptionOf === v.id ? null : v.id)}
                        aria-expanded={adoptionOf === v.id}
                      >
                        <StatusBadge tone="success">
                          {t({ fr: 'Publiée', en: 'Published' })} · {v.adoption_count}/
                          {activeOrgs.length}
                        </StatusBadge>
                      </button>
                    ) : v.status === 'draft' ? (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <StatusBadge tone="warning">
                          {t({ fr: 'Brouillon', en: 'Draft' })}
                        </StatusBadge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void openDraft(v)}
                          disabled={busy}
                        >
                          {t({ fr: 'Éditer', en: 'Edit' })}
                        </Button>
                      </span>
                    ) : (
                      // 3ᵉ état autorisé par le CHECK de 0071, qu'AUCUN bouton ne produit
                      // aujourd'hui (l'archivage se fait en SQL, cf. FK `on delete restrict` :
                      // une version épinglée s'archive, ne se supprime pas). Rendu d'avance pour
                      // qu'une version archivée à la main ne s'affiche jamais comme un brouillon.
                      <StatusBadge tone="neutral">
                        {t({ fr: 'Archivée', en: 'Archived' })}
                      </StatusBadge>
                    )}
                  </li>
                )
              })}
            </ul>
          </Section>

          {adoptionOf ? (
            <Section
              title={t({
                fr: `Adoption de ${data.versions.find((v) => v.id === adoptionOf)?.label ?? ''}`,
                en: `Adoption of ${data.versions.find((v) => v.id === adoptionOf)?.label ?? ''}`,
              })}
              description={t({
                fr: "Le consentement est journalisé côté org (qui, quand) — rien n'est imposé.",
                en: 'Consent is logged on the org side (who, when) — nothing is imposed.',
              })}
            >
              <ul className="divide-border divide-y">
                {activeOrgs.map((o) => {
                  const a = data.adoptions.find(
                    (x) => x.version_id === adoptionOf && x.org_id === o.id,
                  )
                  return (
                    <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      {a ? (
                        <>
                          <StatusBadge tone="success">
                            {t({ fr: 'Adoptée', en: 'Adopted' })}
                          </StatusBadge>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {fmtDate(a.adopted_at)} · {a.adopted_by_email}
                          </span>
                        </>
                      ) : (
                        <StatusBadge tone="warning">
                          {t({ fr: 'En attente', en: 'Pending' })}
                        </StatusBadge>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Section>
          ) : null}
        </div>

        {/* ── Éditeur de brouillon ── */}
        {draft ? (
          <Section
            title={
              draft.versionId
                ? t({ fr: `Brouillon ${draft.label}`, en: `Draft ${draft.label}` })
                : t({ fr: 'Nouveau brouillon', en: 'New draft' })
            }
            description={t({
              fr: 'Chaque entrée est préremplie depuis le contenu courant — modifiez, CITEZ la source, publiez.',
              en: 'Each entry is prefilled from current content — edit, CITE the source, publish.',
            })}
          >
            <div className="min-w-0 space-y-4">
              {/* 2 colonnes, pas 3 : dans la colonne de l'éditeur, trois champs côte à côte
                  hachaient les libellés sur 3 lignes et rognaient les saisies. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t({ fr: 'Libellé', en: 'Label' })}>
                  <Input
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    placeholder="v2026.2"
                  />
                </Field>
                <Field
                  label={t({ fr: "Date d'effet (optionnelle)", en: 'Effective date (optional)' })}
                >
                  <Input
                    type="date"
                    value={draft.effectiveDate}
                    // Jamais antérieure à AUJOURD'HUI : une version rétro-datée se classerait
                    // SOUS les versions applicables → publiée mais inerte (B1). L'Edge re-vérifie.
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })}
                  />
                  <span className="text-muted-foreground mt-1 block text-[11px]">
                    {t({
                      fr: 'Vide = effet immédiat. La date du décret se cite dans la provenance.',
                      en: 'Empty = immediate effect. The decree date belongs in the provenance.',
                    })}
                  </span>
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t({ fr: 'Note de publication', en: 'Release note' })}>
                    <Input
                      value={draft.releaseNote}
                      onChange={(e) => setDraft({ ...draft, releaseNote: e.target.value })}
                      placeholder={t({
                        fr: 'Sénégal — redevances (décret…)',
                        en: 'Senegal — fees (decree…)',
                      })}
                    />
                  </Field>
                </div>
              </div>

              {draft.entries.map((e, i) => (
                <EntryEditor
                  key={i}
                  entry={e}
                  current={currentMap}
                  onChange={(patch) => upd(i, patch)}
                  onRemove={() =>
                    setDraft({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })
                  }
                />
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Premier couple (pays, section) LIBRE — ajouter un doublon serait refusé
                    // à l'enregistrement, autant ne jamais le créer.
                    const taken = new Set(
                      draft.entries.map((x) => currentKey(x.country, x.section)),
                    )
                    for (const c of COUNTRIES) {
                      for (const s of Object.keys(SECTION_LABEL) as SectionKey[]) {
                        if (!taken.has(currentKey(c.code, s))) {
                          setDraft({
                            ...draft,
                            entries: [...draft.entries, prefillEntry(c.code, s, currentMap)],
                          })
                          return
                        }
                      }
                    }
                  }}
                >
                  <Plus /> {t({ fr: 'Ajouter une entrée', en: 'Add an entry' })}
                </Button>
                <span className="flex-1" />
                {draft.versionId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 /> {t({ fr: 'Supprimer le brouillon', en: 'Delete draft' })}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void saveDraft()}
                >
                  {t({ fr: 'Enregistrer', en: 'Save' })}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || draft.entries.length === 0}
                  onClick={async () => {
                    const id = await saveDraft()
                    if (!id) return
                    setPublishing({ id, label: draft.label })
                  }}
                >
                  <Send /> {t({ fr: 'Publier…', en: 'Publish…' })}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {t({
                  fr: "Publier notifie toutes les organisations mais n'impose rien : l'adoption reste un consentement d'administrateur, journalisé. Provenance obligatoire — pas de source, pas de publication.",
                  en: 'Publishing notifies every organisation but imposes nothing: adoption remains an administrator consent, logged. Provenance is mandatory — no source, no publication.',
                })}
              </p>
            </div>
          </Section>
        ) : (
          <EmptyState
            icon={<ScrollText />}
            title={t({ fr: 'Aucun brouillon ouvert', en: 'No draft open' })}
            description={t({
              fr: 'Créez un brouillon pour préparer une mise à jour sourcée du référentiel.',
              en: 'Create a draft to prepare a sourced reference data update.',
            })}
            action={
              <Button size="sm" onClick={() => void openDraft()}>
                <Plus /> {t({ fr: 'Nouveau brouillon', en: 'New draft' })}
              </Button>
            }
          />
        )}
      </div>

      {/* ── Confirmation de suppression de brouillon ── */}
      <Dialog open={confirmDelete} onOpenChange={(o) => !o && !busy && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t({ fr: 'Supprimer ce brouillon ?', en: 'Delete this draft?' })}
            </DialogTitle>
            <DialogDescription>
              {t({
                fr: 'Les entrées préparées (et leurs sources citées) seront perdues. Les versions publiées ne sont jamais touchées.',
                en: 'Prepared entries (and their cited sources) will be lost. Published versions are never affected.',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
              {t({ fr: 'Annuler', en: 'Cancel' })}
            </Button>
            <Button variant="destructive" onClick={() => void deleteDraft()} disabled={busy}>
              {busy
                ? t({ fr: 'Suppression…', en: 'Deleting…' })
                : t({ fr: 'Supprimer', en: 'Delete' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation de publication ── */}
      <Dialog open={!!publishing} onOpenChange={(o) => !o && !busy && setPublishing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t({ fr: `Publier ${publishing?.label} ?`, en: `Publish ${publishing?.label}?` })}
            </DialogTitle>
            <DialogDescription>
              {t({
                fr: 'Une version publiée est IMMUABLE (photographie opposable) : pour corriger, on publie une nouvelle version.',
                en: 'A published version is IMMUTABLE (defensible snapshot): to fix, publish a new version.',
              })}
            </DialogDescription>
          </DialogHeader>
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>
              {t({
                fr: '✔ Toutes les organisations verront la mise à jour (bannière + cloche).',
                en: '✔ Every organisation will see the update (banner + bell).',
              })}
            </li>
            <li>
              {t({
                fr: "✔ Rien ne s'applique sans l'adoption de leur administrateur.",
                en: '✔ Nothing applies without their administrator’s adoption.',
              })}
            </li>
            <li>
              {t({
                fr: '✔ Les dossiers existants restent épinglés sur leur version.',
                en: '✔ Existing submissions stay pinned to their version.',
              })}
            </li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishing(null)} disabled={busy}>
              {t({ fr: 'Annuler', en: 'Cancel' })}
            </Button>
            <Button onClick={() => void publish()} disabled={busy}>
              {busy
                ? t({ fr: 'Publication…', en: 'Publishing…' })
                : t({ fr: 'Publier', en: 'Publish' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RefKpi({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub: string
  icon: typeof BookMarked
}) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
        <span
          className="bg-info-subtle text-info flex size-7 shrink-0 items-center justify-center rounded-lg"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="font-display mt-1.5 truncate text-2xl font-bold tracking-tight">{value}</div>
      {sub ? <div className="text-muted-foreground mt-0.5 truncate text-xs">{sub}</div> : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm"
    />
  )
}

function EntryEditor({
  entry,
  current,
  onChange,
  onRemove,
}: {
  entry: DraftEntry
  current: CurrentMap
  onChange: (patch: Partial<DraftEntry>) => void
  onRemove: () => void
}) {
  const { t, lang } = useI18n()
  const err = entryError(entry)
  // Changer de pays/section re-préremplit depuis le contenu courant, mais la PROVENANCE déjà
  // saisie survit : c'est le travail du god, pas un dérivé du contenu (revue #417 m8).
  const repick = (country: string, section: SectionKey) =>
    onChange({
      ...prefillEntry(country, section, current),
      provTexte: entry.provTexte,
      provJo: entry.provJo,
      provComplements: entry.provComplements,
    })
  return (
    <div className="bg-muted/30 space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={entry.country}
          onChange={(e) => repick(e.target.value, entry.section)}
          aria-label={t({ fr: 'Pays', en: 'Country' })}
          className="w-44"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {countryLabel(c.code, lang)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={entry.section}
          onChange={(e) => repick(entry.country, e.target.value as SectionKey)}
          aria-label={t({ fr: 'Section', en: 'Section' })}
          className="w-52"
        >
          {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
            <option key={k} value={k}>
              {t(SECTION_LABEL[k])}
            </option>
          ))}
        </NativeSelect>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={t({ fr: 'Retirer', en: 'Remove' })}
        >
          <Trash2 />
        </Button>
      </div>

      {entry.section === 'fees' ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={t({ fr: 'Nouvelle AMM', en: 'New MA' })}>
              <Input
                value={entry.feeNewMa}
                onChange={(e) => onChange({ feeNewMa: e.target.value })}
                inputMode="numeric"
              />
            </Field>
            <Field label={t({ fr: 'Renouvellement', en: 'Renewal' })}>
              <Input
                value={entry.feeRenewal}
                onChange={(e) => onChange({ feeRenewal: e.target.value })}
                inputMode="numeric"
              />
            </Field>
            <Field label={t({ fr: 'Var. mineure', en: 'Minor var.' })}>
              <Input
                value={entry.feeVarMin}
                onChange={(e) => onChange({ feeVarMin: e.target.value })}
                inputMode="numeric"
              />
            </Field>
            <Field label={t({ fr: 'Var. majeure', en: 'Major var.' })}>
              <Input
                value={entry.feeVarMaj}
                onChange={(e) => onChange({ feeVarMaj: e.target.value })}
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t({ fr: 'Devise', en: 'Currency' })}>
              <Input
                value={entry.currency}
                onChange={(e) => onChange({ currency: e.target.value })}
              />
            </Field>
            <Field label={t({ fr: 'Délai indicatif (jours)', en: 'Indicative timeline (days)' })}>
              <Input
                value={entry.processingDays}
                onChange={(e) => onChange({ processingDays: e.target.value })}
                inputMode="numeric"
              />
            </Field>
          </div>
          <details>
            <summary className="text-muted-foreground cursor-pointer text-xs font-semibold">
              {t({
                fr: 'Précisions par activité (FR/EN, optionnelles)',
                en: 'Notes per activity (FR/EN, optional)',
              })}
            </summary>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['noteNewMaFr', 'noteNewMaEn', { fr: 'Nouvelle AMM', en: 'New MA' }],
                  ['noteRenewalFr', 'noteRenewalEn', { fr: 'Renouvellement', en: 'Renewal' }],
                  ['noteVariationFr', 'noteVariationEn', { fr: 'Variations', en: 'Variations' }],
                ] as const
              ).map(([frKey, enKey, lbl]) => (
                <div key={frKey} className="grid gap-2 sm:grid-cols-2">
                  <Field label={`${t(lbl)} — FR`}>
                    <TextArea
                      rows={2}
                      value={entry[frKey]}
                      onChange={(e) => onChange({ [frKey]: e.target.value })}
                    />
                  </Field>
                  <Field label={`${t(lbl)} — EN`}>
                    <TextArea
                      rows={2}
                      value={entry[enKey]}
                      onChange={(e) => onChange({ [enKey]: e.target.value })}
                    />
                  </Field>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}

      {entry.section === 'agency' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t({ fr: 'Sigle', en: 'Acronym' })}>
            <Input value={entry.agName} onChange={(e) => onChange({ agName: e.target.value })} />
          </Field>
          <Field label={t({ fr: 'Dénomination complète', en: 'Full name' })}>
            <Input value={entry.agFull} onChange={(e) => onChange({ agFull: e.target.value })} />
          </Field>
          <Field label={t({ fr: 'Directeur / Responsable', en: 'Director' })}>
            <Input
              value={entry.agDirecteur}
              onChange={(e) => onChange({ agDirecteur: e.target.value })}
            />
          </Field>
          <Field label={t({ fr: 'Civilité', en: 'Salutation' })}>
            <NativeSelect
              value={entry.agSexe}
              onChange={(e) => onChange({ agSexe: e.target.value as 'M' | 'F' })}
            >
              <option value="M">{t({ fr: 'Monsieur le Directeur', en: 'Mr (Director)' })}</option>
              <option value="F">{t({ fr: 'Madame la Directrice', en: 'Ms (Director)' })}</option>
            </NativeSelect>
          </Field>
          <Field label={t({ fr: 'Adresse', en: 'Address' })}>
            <Input
              value={entry.agAdresse}
              onChange={(e) => onChange({ agAdresse: e.target.value })}
            />
          </Field>
          <Field label={t({ fr: 'Langue de soumission', en: 'Submission language' })}>
            <NativeSelect
              value={entry.agLang}
              onChange={(e) => onChange({ agLang: e.target.value })}
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
              <option value="pt">PT</option>
            </NativeSelect>
          </Field>
          <Field label={t({ fr: 'Téléphone (optionnel)', en: 'Phone (optional)' })}>
            <Input value={entry.agTel} onChange={(e) => onChange({ agTel: e.target.value })} />
          </Field>
          <Field label={t({ fr: 'E-mail (optionnel)', en: 'Email (optional)' })}>
            <Input value={entry.agEmail} onChange={(e) => onChange({ agEmail: e.target.value })} />
          </Field>
        </div>
      ) : null}

      {entry.section === 'submission' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modalités — FR">
            <TextArea
              rows={3}
              value={entry.subFr}
              onChange={(e) => onChange({ subFr: e.target.value })}
            />
          </Field>
          <Field label="Filing — EN">
            <TextArea
              rows={3}
              value={entry.subEn}
              onChange={(e) => onChange({ subEn: e.target.value })}
            />
          </Field>
        </div>
      ) : null}

      {entry.section === 'samples' ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t({
              fr: 'Une exigence par ligne — FR et EN appariés ligne à ligne.',
              en: 'One requirement per line — FR and EN paired line by line.',
            })}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t({ fr: 'Nouvelle AMM — FR', en: 'New MA — FR' })}>
              <TextArea
                rows={4}
                value={entry.samplesNewMaFr}
                onChange={(e) => onChange({ samplesNewMaFr: e.target.value })}
              />
            </Field>
            <Field label={t({ fr: 'Nouvelle AMM — EN', en: 'New MA — EN' })}>
              <TextArea
                rows={4}
                value={entry.samplesNewMaEn}
                onChange={(e) => onChange({ samplesNewMaEn: e.target.value })}
              />
            </Field>
            <Field label={t({ fr: 'Renouvellement/variation — FR', en: 'Renewal/variation — FR' })}>
              <TextArea
                rows={3}
                value={entry.samplesRenewFr}
                onChange={(e) => onChange({ samplesRenewFr: e.target.value })}
              />
            </Field>
            <Field label={t({ fr: 'Renouvellement/variation — EN', en: 'Renewal/variation — EN' })}>
              <TextArea
                rows={3}
                value={entry.samplesRenewEn}
                onChange={(e) => onChange({ samplesRenewEn: e.target.value })}
              />
            </Field>
            <Field label={t({ fr: 'Réserve — FR', en: 'Reservation — FR' })}>
              <TextArea
                rows={2}
                value={entry.reserveFr}
                onChange={(e) => onChange({ reserveFr: e.target.value })}
              />
            </Field>
            <Field label={t({ fr: 'Réserve — EN', en: 'Reservation — EN' })}>
              <TextArea
                rows={2}
                value={entry.reserveEn}
                onChange={(e) => onChange({ reserveEn: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {/* Provenance — OBLIGATOIRE (le cœur de la confiance : la source citée). */}
      <div className="border-info/30 bg-info-subtle/50 grid gap-2 rounded-lg border p-2.5 sm:grid-cols-3">
        <Field label={t({ fr: 'Texte officiel (OBLIGATOIRE)', en: 'Official text (REQUIRED)' })}>
          <Input
            value={entry.provTexte}
            onChange={(e) => onChange({ provTexte: e.target.value })}
            placeholder={t({ fr: 'Décret n° … du …', en: 'Decree No. … of …' })}
          />
        </Field>
        <Field label={t({ fr: 'JO / publication', en: 'Official journal' })}>
          <Input value={entry.provJo} onChange={(e) => onChange({ provJo: e.target.value })} />
        </Field>
        <Field label={t({ fr: 'Compléments', en: 'Complements' })}>
          <Input
            value={entry.provComplements}
            onChange={(e) => onChange({ provComplements: e.target.value })}
          />
        </Field>
      </div>
      {err ? <p className="text-danger-subtle-foreground text-xs">{t(err)}</p> : null}
    </div>
  )
}
