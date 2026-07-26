import { useMemo, useState } from 'react'
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
import { CTD_ACTIVITY_CODES, type CtdDeltaKind } from '@/features/catalogue/ref-structure'
import {
  anyActivityLabel,
  COUNTRIES,
  countryLabel,
  formatLabel,
} from '@/features/workspace/dossier-constants'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { adminApi, type RefVersionRow } from './admin-api'
import {
  currentKey,
  currentMapOf,
  DELTA_ISSUE_LABEL,
  deltaScopeByFormat,
  draftDeltaIssues,
  draftToDelta,
  entryError,
  fromServerEntry,
  isBlockingDeltaIssue,
  newDelta,
  nextFreeChildNumber,
  nextLabel,
  pickableNodes,
  prefillEntry,
  refErrorLabel,
  removedSubtreeCount,
  SECTION_LABEL,
  toPayload,
  type CurrentMap,
  type DraftDelta,
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
 * version.
 *
 * Depuis P4.5, la section « Structure du Module 1 » (`ctd_structure`) s'y publie aussi : le
 * SEUL module CTD qui varie par pays (cas d'école « le PGHT n'est plus exigé au Togo »). Elle
 * publie des DELTAS de nœuds, jamais une arborescence entière — un arbre publié figerait le pays
 * hors de toute évolution du socle.
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
  // Référence STABLE : la validation de structure (calculs d'arbre) en dépend, un `new Map` par
  // rendu invaliderait toutes les mémoïsations en aval à chaque frappe du god.
  const currentMap: CurrentMap = currentMapOf(data.current)

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
      const err = entryError(e, currentMap)
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
      {/* La liste est une VUE DE RÉFÉRENCE (notes de publication, pays, adoption : elle doit
          respirer), l'éditeur est une TÂCHE (il exige la concentration). Les mettre côte à côte
          rabougrissait les deux — c'est ce qui avait produit la colonne écrasée de #418. Donc :
          liste PLEINE LARGEUR, éditeur en MODALE centrée au premier plan. */}
      <div className="space-y-4">
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
      </div>

      {/* ── Éditeur de brouillon : MODALE centrée au premier plan ──────────────────────────────
          Préparer une version est une TÂCHE longue et engageante (elle finit en publication
          immuable) : elle mérite la largeur et l'attention exclusive, pas une colonne latérale.
          Fermer par l'extérieur est bloqué pendant une écriture (`busy`) — on ne perd pas une
          curation à cause d'un clic à côté. */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && !busy && setDraft(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.versionId
                ? t({ fr: `Brouillon ${draft.label}`, en: `Draft ${draft.label}` })
                : t({ fr: 'Nouveau brouillon', en: 'New draft' })}
            </DialogTitle>
            <DialogDescription>
              {t({
                fr: 'Chaque entrée est préremplie depuis le contenu courant — modifiez, CITEZ la source, publiez.',
                en: 'Each entry is prefilled from current content — edit, CITE the source, publish.',
              })}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="max-h-[70vh] min-w-0 space-y-4 overflow-y-auto pr-1">
              {/* La modale est large : trois champs tiennent enfin sur une ligne sans hacher
                  les libellés (contrainte qui imposait 2 colonnes en panneau latéral, #418). */}
              <div className="grid gap-3 sm:grid-cols-3">
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
                  key={e.id}
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
          ) : null}
        </DialogContent>
      </Dialog>

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
  // Mémoïsé : la validation de `ctd_structure` fait des calculs d'arbre sur tous les scopes, et ce
  // composant se re-rend à chaque frappe n'importe où dans le brouillon.
  const err = useMemo(() => entryError(entry, current), [entry, current])
  // Changer de pays/section re-préremplit depuis le contenu courant, mais la PROVENANCE déjà
  // saisie survit : c'est le travail du god, pas un dérivé du contenu (revue #417 m8).
  const repick = (country: string, section: SectionKey) =>
    onChange({
      ...prefillEntry(country, section, current),
      // L'identité de LIGNE survit au changement de pays/section (sinon React remonte le bloc et
      // le focus saute), tout comme la provenance déjà saisie (revue #417 m8).
      id: entry.id,
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

      {entry.section === 'ctd_structure' ? (
        <StructureEditor entry={entry} onChange={onChange} current={current} />
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

const KIND_LABEL: Record<CtdDeltaKind, Translatable> = {
  remove: { fr: 'Plus exigé', en: 'No longer required' },
  add: { fr: 'Nouveau', en: 'New' },
  relabel: { fr: 'Libellé', en: 'Rename' },
}

/**
 * Éditeur de la section « Structure du Module 1 » (mockup ①) — un tableau de deltas de nœuds.
 *
 * Deux garanties tenues ICI et nulle part ailleurs :
 * 1. **La portée est montrée, pas devinée** : chaque ligne affiche les activités réellement
 *    touchées. C'est ainsi que le god voit que l'arbre de VARIATION reste dehors tant qu'il ne
 *    le demande pas (M4) — sa numérotation est homonyme sans être synonyme.
 * 2. **Un delta inerte est signalé avant l'enregistrement** : l'Edge sait dire « ce payload est
 *    bien formé », pas « ce numéro existe » (l'arborescence vit dans le bundle web).
 */
function StructureEditor({
  entry,
  onChange,
  current,
}: {
  entry: DraftEntry
  onChange: (patch: Partial<DraftEntry>) => void
  /** Contenu publié courant : la liste des nœuds part de l'arborescence RÉELLE du pays. */
  current: CurrentMap
}) {
  const { t, lang } = useI18n()
  const issues = useMemo(() => draftDeltaIssues(entry), [entry])
  // Arborescence RÉELLE du pays (socle ← deltas déjà publiés). Le format de la 1re ligne suffit :
  // mélanger CTD et eCTD dans une même liste rendrait les numéros ambigus à l'œil.
  const nodes = useMemo(
    () => pickableNodes(entry.country, entry.deltas[0]?.format ?? '', current),
    [entry.country, entry.deltas, current],
  )
  /** Parent déduit du numéro en cours (« 1.2.9 » → « 1.2 ») — présélectionne la liste « Sous ». */
  const parentOf = (n: string) => (n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : '')
  const setDelta = (i: number, patch: Partial<DraftDelta>) =>
    onChange({ deltas: entry.deltas.map((d, j) => (j === i ? { ...d, ...patch } : d)) })

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {t({
          fr: 'Le socle reste la référence : on publie des CHANGEMENTS de nœuds, jamais une arborescence entière. Le numéro est l’identité du nœud — il ne se renomme jamais.',
          en: 'The baseline stays the reference: publish node CHANGES, never a whole tree. The number is the node’s identity — it is never renamed.',
        })}
      </p>

      {/* ABROGATION — le contenu d'une section REMPLACE celui de la version précédente : sans
          cette case, un pays resterait prisonnier à vie de ses écarts publiés (un décret,
          ça s'abroge). Elle vide la liste : les deux ne se publient pas ensemble. */}
      <label className="border-warning/30 bg-warning-subtle/40 flex items-start gap-2 rounded-lg border p-2.5 text-xs">
        <input
          type="checkbox"
          checked={entry.structureReset}
          onChange={(e) => onChange({ structureReset: e.target.checked, deltas: [] })}
          className="mt-0.5"
        />
        <span>
          <span className="font-semibold">
            {t({
              fr: 'Revenir à l’arborescence de référence pour ce pays',
              en: 'Return to the reference tree for this country',
            })}
          </span>
          <span className="text-muted-foreground block">
            {t({
              fr: 'Abroge tous les écarts nationaux publiés. Les dossiers existants ne changent pas : chacun se met à jour depuis son propre écran.',
              en: 'Repeals every published national deviation. Existing submissions do not change: each updates from its own screen.',
            })}
          </span>
        </span>
      </label>

      {entry.structureReset
        ? null
        : entry.deltas.map((d, i) => {
            const canonical = draftToDelta(d)
            const scope = canonical ? deltaScopeByFormat(canonical) : []
            // Une ligne encore VIERGE ne crie pas « incomplet » avant la première frappe.
            const pristine = d.number.trim() === '' && d.label.trim() === ''
            const issue = pristine ? null : issues[i]
            const carries = canonical ? removedSubtreeCount(canonical) : 0
            const errId = `delta-err-${d.id}`
            return (
              <div key={d.id} className="bg-background space-y-2 rounded-lg border p-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={t({ fr: 'Changement', en: 'Change' })}>
                    <NativeSelect
                      value={d.kind}
                      onChange={(e) => setDelta(i, { kind: e.target.value as CtdDeltaKind })}
                      className="w-40"
                    >
                      {(Object.keys(KIND_LABEL) as CtdDeltaKind[]).map((k) => (
                        <option key={k} value={k}>
                          {t(KIND_LABEL[k])}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {/* Le nœud se CHOISIT, il ne se tape pas : une coquille publiait un delta
                      INERTE (l'Edge ne connaît pas l'arborescence, cf. `pickableNodes`).
                      • « Plus exigé »/« Libellé » visent un nœud EXISTANT → liste des nœuds réels.
                        Un retrait n'offre que la profondeur ≥ 3 : la garde de branche devient
                        invisible au lieu d'être punitive.
                      • « Nouveau » vise un numéro qui n'existe PAS encore → on choisit le PARENT
                        et le premier numéro libre est proposé (modifiable). */}
                  {d.kind === 'add' ? (
                    <>
                      <Field label={t({ fr: 'Sous', en: 'Under' })}>
                        <NativeSelect
                          value={parentOf(d.number)}
                          onChange={(e) =>
                            setDelta(i, { number: nextFreeChildNumber(nodes, e.target.value) })
                          }
                          className="w-72"
                        >
                          <option value="">{t({ fr: '— choisir —', en: '— choose —' })}</option>
                          {nodes.map((n) => (
                            <option key={n.number} value={n.number}>
                              {' '.repeat((n.depth - 1) * 2)}
                              {n.number} · {n.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label={t({ fr: 'Numéro', en: 'Number' })}>
                        <Input
                          value={d.number}
                          onChange={(e) => setDelta(i, { number: e.target.value })}
                          placeholder="1.2.9"
                          inputMode="decimal"
                          className="w-28"
                          aria-invalid={isBlockingDeltaIssue(issue, d.kind) || undefined}
                          aria-describedby={issue ? errId : undefined}
                        />
                      </Field>
                    </>
                  ) : (
                    <Field label={t({ fr: 'Nœud', en: 'Node' })}>
                      <NativeSelect
                        value={d.number}
                        onChange={(e) => setDelta(i, { number: e.target.value })}
                        className="w-80"
                        aria-invalid={isBlockingDeltaIssue(issue, d.kind) || undefined}
                        aria-describedby={issue ? errId : undefined}
                      >
                        <option value="">{t({ fr: '— choisir —', en: '— choose —' })}</option>
                        {nodes
                          .filter((n) => d.kind !== 'remove' || n.depth >= 3)
                          .map((n) => (
                            <option key={n.number} value={n.number}>
                              {' '.repeat((n.depth - 1) * 2)}
                              {n.number} · {n.label}
                            </option>
                          ))}
                        {/* Un numéro déjà saisi mais absent de l'arbre (delta hérité d'une version
                            antérieure, socle qui a bougé) doit rester VISIBLE et sélectionné, sinon
                            le select l'effacerait en silence. */}
                        {d.number && !nodes.some((n) => n.number === d.number) ? (
                          <option value={d.number}>
                            {d.number} · {t({ fr: 'hors arborescence', en: 'outside the tree' })}
                          </option>
                        ) : null}
                      </NativeSelect>
                    </Field>
                  )}
                  {d.kind === 'remove' ? null : (
                    <Field label={t({ fr: 'Libellé', en: 'Label' })}>
                      <Input
                        value={d.label}
                        onChange={(e) => setDelta(i, { label: e.target.value })}
                        className="w-72"
                      />
                    </Field>
                  )}
                  <span className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ deltas: entry.deltas.filter((_, j) => j !== i) })}
                    aria-label={t({ fr: 'Retirer ce changement', en: 'Remove this change' })}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <Field label={t({ fr: 'Format', en: 'Format' })}>
                    <NativeSelect
                      value={d.format}
                      onChange={(e) =>
                        setDelta(i, { format: e.target.value as DraftDelta['format'] })
                      }
                      className="w-40"
                    >
                      <option value="">{t({ fr: 'Les deux', en: 'Both' })}</option>
                      <option value="ctd">CTD (PDF)</option>
                      <option value="ectd">eCTD v4</option>
                    </NativeSelect>
                  </Field>
                  {d.kind === 'remove' ? null : (
                    <Field label={t({ fr: 'Guidance (optionnelle)', en: 'Guidance (optional)' })}>
                      <Input
                        value={d.note}
                        onChange={(e) => setDelta(i, { note: e.target.value })}
                        className="w-72"
                      />
                    </Field>
                  )}
                </div>

                <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <legend className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">
                    {t({ fr: 'Activités visées', en: 'Targeted activities' })}
                  </legend>
                  {/* TOUTES les activités qu'un dossier peut porter, `transfer` compris : un payload
                  scopé dessus doit rester visible et modifiable, sinon l'éditeur cache un état
                  qu'il prétend montrer. Aucune case cochée = toutes (variation CTD exceptée). */}
                  {CTD_ACTIVITY_CODES.map((code) => (
                    <label key={code} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={d.activities.includes(code)}
                        onChange={(e) =>
                          setDelta(i, {
                            activities: e.target.checked
                              ? [...d.activities, code]
                              : d.activities.filter((x) => x !== code),
                          })
                        }
                      />
                      {anyActivityLabel(code, lang)}
                    </label>
                  ))}
                </fieldset>

                {/* Portée EFFECTIVE, calculée format par format — pas une promesse d'étiquette.
                « Aucune case cochée » ne veut PAS dire « toutes » : en CTD, l'arbre de variation
                reste dehors (numérotation homonyme, contenu différent), en eCTD non (arbre
                standard). Le dire ici évite au god de le découvrir en production. */}
                {scope.length > 0 ? (
                  <p className="text-muted-foreground text-[11px]">
                    {t({ fr: 'S’appliquera à : ', en: 'Will apply to: ' })}
                    {scope.map((s, k) => (
                      <span key={s.format}>
                        {k > 0 ? ' · ' : ''}
                        <span className="font-medium">{formatLabel(s.format)}</span>
                        {' — '}
                        {s.activities.map((a) => anyActivityLabel(a, lang)).join(', ')}
                      </span>
                    ))}
                    {d.activities.length === 0 &&
                    scope.some((s) => s.format === 'ctd' && !s.activities.includes('variation')) ? (
                      <span className="block">
                        {t({
                          fr: 'La variation CTD en est exclue (son arborescence est différente) — cochez-la pour la viser.',
                          en: 'CTD variations are excluded (their tree differs) — tick it to target them.',
                        })}
                      </span>
                    ) : null}
                  </p>
                ) : null}

                {/* Un retrait emporte son sous-arbre : le contrat interdit d'effacer une branche de
                1er niveau, mais « retirer 1.2.6 » emporte quand même ses deux nœuds AMM. Aucun
                document n'est perdu (l'auto-classement remonte sur l'ancêtre survivant) — encore
                faut-il que le god le sache avant de publier. */}
                {carries > 0 ? (
                  <p className="text-warning-subtle-foreground text-[11px]">
                    {t({
                      fr: `Retire aussi ${carries} sous-section${carries > 1 ? 's' : ''} sous ce nœud.`,
                      en: `Also removes ${carries} sub-section${carries > 1 ? 's' : ''} under this node.`,
                    })}
                  </p>
                ) : null}

                {issue ? (
                  <p
                    id={errId}
                    role={isBlockingDeltaIssue(issue, d.kind) ? 'alert' : undefined}
                    className={
                      isBlockingDeltaIssue(issue, d.kind)
                        ? 'text-danger-subtle-foreground text-xs'
                        : 'text-muted-foreground text-xs'
                    }
                  >
                    {t(DELTA_ISSUE_LABEL[issue](`#${i + 1} ${d.number.trim() || '—'}`))}
                  </p>
                ) : null}
              </div>
            )
          })}

      {entry.structureReset ? null : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ deltas: [...entry.deltas, newDelta()] })}
        >
          <Plus /> {t({ fr: 'Ajouter un changement', en: 'Add a change' })}
        </Button>
      )}
    </div>
  )
}
