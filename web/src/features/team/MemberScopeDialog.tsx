import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import { db, type DossierRecord } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

import { teamApi, type TeamMember } from './team-api'

/**
 * Éditeur du périmètre CS1 d'un membre (« pas une agence invitée ne verra tout mon catalogue »).
 * Deux modes : toute l'organisation (défaut historique) ou une liste de dossiers — l'unité du
 * mandat RA (produit × pays × opération) — avec raccourcis de sélection par pays / par produit.
 * Le remplacement est ATOMIQUE côté serveur (team_set_scope, journalisé audit GxP).
 */
export function MemberScopeDialog({
  orgId,
  member,
  onSaved,
}: {
  orgId: string
  member: TeamMember
  onSaved: () => void
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const currentIds = member.scope_dossier_ids ?? null
  const [mode, setMode] = useState<'org' | 'dossiers'>(currentIds === null ? 'org' : 'dossiers')
  const [selected, setSelected] = useState<Set<string>>(new Set(currentIds ?? []))
  const [filter, setFilter] = useState('')

  // Dossiers de l'org (actifs ET archivés : le mandat de suivi couvre l'après-soumission).
  const dossiers = useLiveQuery(
    async () => {
      const items = await db.dossiers.where('orgId').equals(orgId).toArray()
      return items
        .filter((d) => d.deletedAt === null)
        .sort(
          (a, b) =>
            a.productName.localeCompare(b.productName) || a.country.localeCompare(b.country),
        )
    },
    [orgId],
    [] as DossierRecord[],
  )

  const countries = useMemo(
    () => Array.from(new Set(dossiers.map((d) => d.country))).sort(),
    [dossiers],
  )
  const products = useMemo(
    () => Array.from(new Set(dossiers.map((d) => d.productName))).sort(),
    [dossiers],
  )
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return dossiers
    return dossiers.filter(
      (d) =>
        d.productName.toLowerCase().includes(q) ||
        countryLabel(d.country, lang).toLowerCase().includes(q),
    )
  }, [dossiers, filter, lang])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Raccourci « par pays / par produit » : ajoute tous les dossiers du groupe à la sélection. */
  function selectGroup(match: (d: DossierRecord) => boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const d of dossiers) if (match(d)) next.add(d.id)
      return next
    })
  }

  async function save() {
    setBusy(true)
    try {
      await teamApi.setScope(orgId, member.user_id, mode === 'org' ? null : Array.from(selected))
      toast.success(
        mode === 'org'
          ? t({ fr: 'Périmètre : toute l’organisation', en: 'Scope: whole organization' })
          : t({
              fr: `Périmètre enregistré (${selected.size} dossier${selected.size > 1 ? 's' : ''})`,
              en: `Scope saved (${selected.size} dossier${selected.size > 1 ? 's' : ''})`,
            }),
      )
      setOpen(false)
      onSaved()
    } catch (err) {
      const msg = (err as Error).message
      toast.error(
        msg.includes('cannot_scope_admin')
          ? t({
              fr: 'Un administrateur a toujours accès à toute l’organisation.',
              en: 'An administrator always has access to the whole organization.',
            })
          : msg.includes('forbidden')
            ? t({ fr: 'Réservé aux administrateurs', en: 'Admins only' })
            : t({ fr: 'Échec de l’enregistrement du périmètre', en: 'Failed to save scope' }),
      )
    } finally {
      setBusy(false)
    }
  }

  // Rouvre proprement : re-synchronise l'état local sur le périmètre courant du membre.
  function onOpenChange(next: boolean) {
    if (next) {
      setMode(currentIds === null ? 'org' : 'dossiers')
      setSelected(new Set(currentIds ?? []))
      setFilter('')
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {currentIds === null
            ? t({ fr: 'Toute l’organisation', en: 'Whole organization' })
            : t({
                fr: `${currentIds.length} dossier${currentIds.length > 1 ? 's' : ''}`,
                en: `${currentIds.length} dossier${currentIds.length > 1 ? 's' : ''}`,
              })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{t({ fr: 'Périmètre d’accès', en: 'Access scope' })}</DialogTitle>
          <DialogDescription className="truncate">
            {member.email} —{' '}
            {t({
              fr: 'couche suivi : dossiers, parcours, correspondance',
              en: 'tracking layer: dossiers, roadmap, correspondence',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto p-4">
          <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              type="radio"
              name="scope-mode"
              checked={mode === 'org'}
              onChange={() => setMode('org')}
              className="accent-primary mt-0.5 size-4 shrink-0"
            />
            <span>
              <span className="font-medium">
                {t({ fr: 'Toute l’organisation', en: 'Whole organization' })}
              </span>
              <span className="text-muted-foreground block text-xs">
                {t({
                  fr: 'Accès complet, comme aujourd’hui (défaut).',
                  en: 'Full access, as today (default).',
                })}
              </span>
            </span>
          </label>

          <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              type="radio"
              name="scope-mode"
              checked={mode === 'dossiers'}
              onChange={() => setMode('dossiers')}
              className="accent-primary mt-0.5 size-4 shrink-0"
            />
            <span>
              <span className="font-medium">
                {t({ fr: 'Dossiers sélectionnés', en: 'Selected dossiers' })}
              </span>
              <span className="text-muted-foreground block text-xs">
                {t({
                  fr: 'Le membre ne voit QUE ces dossiers (suivi) — jamais le catalogue ni les documents de travail.',
                  en: 'The member sees ONLY these dossiers (tracking) — never the catalogue or working documents.',
                })}
              </span>
            </span>
          </label>

          {mode === 'dossiers' ? (
            <div className="space-y-3">
              {/* Raccourcis de sélection — l'unité du portefeuille : un pays, un produit. */}
              {countries.length > 1 || products.length > 1 ? (
                <div className="flex flex-wrap gap-1.5">
                  {countries.map((c) => (
                    <button
                      key={`c-${c}`}
                      type="button"
                      onClick={() => selectGroup((d) => d.country === c)}
                      className="bg-secondary hover:bg-accent rounded-full px-2.5 py-1 text-xs"
                      title={t({
                        fr: 'Ajouter tous les dossiers de ce pays',
                        en: 'Add every dossier for this country',
                      })}
                    >
                      + {countryLabel(c, lang)}
                    </button>
                  ))}
                  {products.map((p) => (
                    <button
                      key={`p-${p}`}
                      type="button"
                      onClick={() => selectGroup((d) => d.productName === p)}
                      className="bg-secondary hover:bg-accent max-w-[180px] truncate rounded-full px-2.5 py-1 text-xs"
                      title={t({
                        fr: 'Ajouter tous les dossiers de ce produit',
                        en: 'Add every dossier for this product',
                      })}
                    >
                      + {p}
                    </button>
                  ))}
                </div>
              ) : null}

              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t({
                  fr: 'Filtrer produit ou pays…',
                  en: 'Filter product or country…',
                })}
              />

              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1.5">
                {visible.length === 0 ? (
                  <p className="text-muted-foreground p-2 text-sm">
                    {t({ fr: 'Aucun dossier.', en: 'No dossiers.' })}
                  </p>
                ) : (
                  visible.map((d) => (
                    <label
                      key={d.id}
                      className={cn(
                        'hover:bg-accent/40 flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm',
                        selected.has(d.id) && 'bg-accent/30',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggle(d.id)}
                        className="accent-primary size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{d.productName}</span>
                      <Badge variant="secondary" className="shrink-0 font-normal">
                        {countryLabel(d.country, lang)}
                      </Badge>
                      <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                        {activityLabel(d.activity, lang)}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {t({
                  fr: `${selected.size} dossier${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''} — la révocation coupe l'accès mais n'efface pas ce qui a déjà été synchronisé sur son appareil.`,
                  en: `${selected.size} dossier${selected.size > 1 ? 's' : ''} selected — revoking cuts access but does not erase what was already synced on their device.`,
                })}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t({ fr: 'Annuler', en: 'Cancel' })}
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy
              ? t({ fr: 'Enregistrement…', en: 'Saving…' })
              : t({ fr: 'Enregistrer', en: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
