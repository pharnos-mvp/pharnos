import { useLiveQuery } from 'dexie-react-hooks'
import {
  Building2,
  Factory,
  Handshake,
  Landmark,
  Megaphone,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mahPartyLimit, useOrgPlan } from '@/features/org/use-org-plan'
import type { PartyRole } from '@/lib/db'
import { cn } from '@/lib/utils'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { listParties } from './parties-repository'

interface OrgTypeEntry {
  /** Rôles DÉVELOPPÉS (naviguent vers le wizard) — absent = type annoncé, pas encore disponible. */
  roles?: PartyRole[]
  label: Translatable
  hint: Translatable
  icon: LucideIcon
}

/**
 * Types d'organisation proposés à la création (décision CEO 2026-07-24). NB vocabulaire : l'AGENCE
 * RÉGLEMENTAIRE = l'autorité nationale (ANRP, ABMed…) → référentiel Autorités, PAS une organisation
 * créable ici. Le rôle `agent` = agence locale / représentant / consultant.
 */
const TYPES: OrgTypeEntry[] = [
  {
    roles: ['titulaire'],
    label: { fr: "Titulaire d'AMM", en: 'MA holder' },
    hint: { fr: 'Détenteur des AMM (MAH)', en: 'Marketing authorization holder' },
    icon: Building2,
  },
  {
    roles: ['fabricant'],
    label: { fr: 'Fabricant', en: 'Manufacturer' },
    hint: { fr: 'Site de fabrication (GMP)', en: 'Manufacturing site (GMP)' },
    icon: Factory,
  },
  {
    roles: ['titulaire', 'fabricant'],
    label: { fr: 'MAH + Fabricant', en: 'MAH + Manufacturer' },
    hint: { fr: 'Titulaire qui fabrique aussi', en: 'Holder that also manufactures' },
    icon: Building2,
  },
  {
    roles: ['agent'],
    label: { fr: 'Agence locale / Représentant', en: 'Local agent / Representative' },
    hint: { fr: 'Représentant local, consultant', en: 'Local representative, consultant' },
    icon: Landmark,
  },
  {
    label: { fr: 'Agence Marketing', en: 'Marketing agency' },
    hint: { fr: 'Promotion & marché', en: 'Promotion & market' },
    icon: Megaphone,
  },
  {
    label: { fr: 'Grossiste', en: 'Wholesaler' },
    hint: { fr: 'Distribution en gros', en: 'Wholesale distribution' },
    icon: Warehouse,
  },
  {
    label: { fr: 'Agence RA', en: 'RA agency' },
    hint: { fr: 'Prestataire affaires réglementaires', en: 'Regulatory affairs provider' },
    icon: Handshake,
  },
]

/**
 * ÉTAPE 1 (au premier plan) de la création d'organisation : le CHOIX DU TYPE, seul. Un type
 * développé ouvre la page de création (wizard, façon « Nouveau produit ») ; un type annoncé
 * explique qu'il arrive. Le gate MAH s'applique dès ici (pas de wizard rempli pour rien).
 */
export function OrgCreateDialog({
  orgId,
  open,
  onOpenChange,
}: {
  orgId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { data: orgPlan } = useOrgPlan()
  const mahCount = useLiveQuery(
    () => listParties(orgId).then((ps) => ps.filter((p) => p.roles.includes('titulaire')).length),
    [orgId],
  )
  const mahGated = (mahCount ?? 0) >= (orgPlan ? mahPartyLimit(orgPlan.plan) : Infinity)

  function choose(entry: OrgTypeEntry) {
    if (!entry.roles) {
      toast(
        t({
          fr: 'Ce type d’organisation arrive bientôt.',
          en: 'This organization type is coming soon.',
        }),
      )
      return
    }
    if (entry.roles.includes('titulaire') && mahGated) {
      toast(
        t({
          fr: 'Un seul titulaire d’AMM est inclus. Passez à l’offre agence (Business) pour en gérer plusieurs.',
          en: 'Only one MA holder is included. Upgrade to the agency plan (Business) to manage several.',
        }),
        {
          action: {
            label: t({ fr: 'Mettre à niveau', en: 'Upgrade' }),
            onClick: () => navigate('/compte'),
          },
        },
      )
      return
    }
    onOpenChange(false)
    navigate(`/catalogue/organisations/nouvelle?type=${entry.roles.join(',')}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t({ fr: 'Quel type d’organisation ?', en: 'Which organization type?' })}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {TYPES.map((entry) => {
            const soon = !entry.roles
            const Icon = entry.icon
            return (
              <button
                key={t(entry.label)}
                type="button"
                onClick={() => choose(entry)}
                className={cn(
                  'focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none focus-visible:ring-[3px]',
                  soon ? 'opacity-60' : 'hover:border-info hover:shadow-sm',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    soon
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-info-subtle text-info-subtle-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t(entry.label)}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {t(entry.hint)}
                  </span>
                </span>
                {soon ? (
                  <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
                    {t({ fr: 'Bientôt', en: 'Soon' })}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
