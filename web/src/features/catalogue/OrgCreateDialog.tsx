import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, Factory, Landmark } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mahPartyLimit, useOrgPlan } from '@/features/org/use-org-plan'
import { setPartySignatory } from '@/features/profile/pro-settings-repository'
import { syncProSettings } from '@/features/profile/pro-settings-sync'
import type { PartyRole } from '@/lib/db'
import { cn } from '@/lib/utils'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { listParties, updateParty, upsertParty } from './parties-repository'
import { syncParties } from './parties-sync'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Types créables directement (décision CEO) — le distributeur reste dérivé des produits. */
const TYPES: {
  role: PartyRole
  label: Translatable
  hint: Translatable
  icon: typeof Building2
}[] = [
  {
    role: 'titulaire',
    label: { fr: "Titulaire d'AMM", en: 'MA holder' },
    hint: { fr: 'Détenteur des AMM (MAH)', en: 'Marketing authorization holder' },
    icon: Building2,
  },
  {
    role: 'fabricant',
    label: { fr: 'Fabricant', en: 'Manufacturer' },
    hint: { fr: 'Site de fabrication (GMP)', en: 'Manufacturing site (GMP)' },
    icon: Factory,
  },
  {
    role: 'agent',
    label: { fr: 'Agence réglementaire', en: 'Regulatory agent' },
    hint: {
      fr: 'Représentant local / consultant',
      en: 'Local representative / consultant',
    },
    icon: Landmark,
  },
]

/**
 * Création DIRECTE d'une organisation depuis la page Organisations (bouton ＋) — sans passer par un
 * produit. Section I (Identification) de la fiche d'ajout ; les sections II/III (documents d'info,
 * pièces admin rattachés à l'org) suivent sur la FICHE créée. `upsertParty` est idempotent par nom
 * → recréer un nom existant fusionne (cumul de rôles), jamais de doublon.
 *
 * Gate d'upsell : SEUL le type MAH est plafonné (1 inclus hors Business+) — créer un fabricant ou
 * une agence réglementaire n'est JAMAIS gaté (décision CEO).
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
  const [role, setRole] = useState<PartyRole>('titulaire')
  const [nom, setNom] = useState('')
  const [pays, setPays] = useState('')
  const [adresse, setAdresse] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [gmpCertificat, setGmpCertificat] = useState('')
  const [gmpExpiry, setGmpExpiry] = useState('')
  const [signataire, setSignataire] = useState('')
  const [poste, setPoste] = useState('')
  const [busy, setBusy] = useState(false)

  // Gate MAH : nb de titulaires déjà enregistrés vs plafond du plan (1 hors Business+).
  const mahCount = useLiveQuery(
    () => listParties(orgId).then((ps) => ps.filter((p) => p.roles.includes('titulaire')).length),
    [orgId],
  )
  const mahGated =
    role === 'titulaire' && (mahCount ?? 0) >= (orgPlan ? mahPartyLimit(orgPlan.plan) : Infinity)

  function reset() {
    setRole('titulaire')
    setNom('')
    setPays('')
    setAdresse('')
    setContactEmail('')
    setGmpCertificat('')
    setGmpExpiry('')
    setSignataire('')
    setPoste('')
  }

  function upsell() {
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
  }

  async function create() {
    if (!nom.trim()) {
      toast.error(t({ fr: 'Le nom est requis.', en: 'Name is required.' }))
      return
    }
    const email = contactEmail.trim()
    if (email && !EMAIL_RE.test(email)) {
      toast.error(t({ fr: 'E-mail de contact invalide.', en: 'Invalid contact e-mail.' }))
      return
    }
    // Défense en profondeur : le gate est aussi vérifié au submit (le plan peut charger tard).
    if (mahGated) {
      upsell()
      return
    }
    setBusy(true)
    try {
      const id = await upsertParty(orgId, {
        nom,
        roles: [role],
        pays: pays.trim(),
        adresse: adresse.trim(),
        gmpCertificat: role === 'fabricant' ? gmpCertificat.trim() : '',
        gmpExpiry: role === 'fabricant' ? gmpExpiry || null : null,
      })
      if (!id) return
      if (email) await updateParty(id, { contactEmail: email })
      // Signataire du MAH → branding party (résolu sur ses lettres). Store séparé, écrit une fois.
      if (role === 'titulaire' && (signataire.trim() || poste.trim())) {
        await setPartySignatory(orgId, id, {
          signataire: signataire.trim() || null,
          poste: poste.trim() || null,
        })
        void syncProSettings(orgId)
      }
      void syncParties(orgId)
      toast.success(t({ fr: 'Organisation créée', en: 'Organization created' }))
      onOpenChange(false)
      reset()
      // Atterrit sur la fiche créée : c'est là que vivent Marque / pièces / documents.
      navigate(`/catalogue/organisations/${id}`)
    } catch {
      toast.error(t({ fr: 'Échec de la création', en: 'Creation failed' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t({ fr: 'Nouvelle organisation', en: 'New organization' })}</DialogTitle>
        </DialogHeader>

        {/* Type (I — Identification) */}
        <div role="radiogroup" aria-label={t({ fr: 'Type', en: 'Type' })} className="grid gap-2">
          {TYPES.map(({ role: r, label, hint, icon: Icon }) => {
            const active = role === r
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRole(r)}
                className={cn(
                  'focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none focus-visible:ring-[3px]',
                  active ? 'border-info bg-info-subtle' : 'hover:border-muted-foreground/25',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    active ? 'bg-info text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t(label)}</span>
                  <span className="text-muted-foreground block text-xs">{t(hint)}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Plafond MAH atteint : on le DIT avant la saisie (pas de formulaire rempli pour rien). */}
        {mahGated ? (
          <p className="bg-warning-subtle text-warning-subtle-foreground rounded-lg px-3 py-2 text-xs">
            {t({
              fr: 'Un seul titulaire d’AMM est inclus dans votre offre. Passez à l’offre agence (Business) pour en gérer plusieurs.',
              en: 'Only one MA holder is included in your plan. Upgrade to the agency plan (Business) to manage several.',
            })}{' '}
            <button
              type="button"
              onClick={() => navigate('/compte')}
              className="font-semibold underline underline-offset-2"
            >
              {t({ fr: 'Mettre à niveau', en: 'Upgrade' })}
            </button>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="norg-nom">{t({ fr: 'Nom *', en: 'Name *' })}</Label>
            <Input
              id="norg-nom"
              value={nom}
              maxLength={300}
              onChange={(e) => setNom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="norg-pays">{t({ fr: 'Pays', en: 'Country' })}</Label>
            <Input
              id="norg-pays"
              value={pays}
              maxLength={100}
              onChange={(e) => setPays(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="norg-email">
              {t({ fr: 'E-mail de contact', en: 'Contact e-mail' })}
            </Label>
            <Input
              id="norg-email"
              type="email"
              value={contactEmail}
              maxLength={320}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="norg-adresse">{t({ fr: 'Adresse', en: 'Address' })}</Label>
            <Input
              id="norg-adresse"
              value={adresse}
              maxLength={300}
              onChange={(e) => setAdresse(e.target.value)}
            />
          </div>

          {role === 'fabricant' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="norg-gmp">
                  {t({ fr: 'N° certificat GMP', en: 'GMP certificate no.' })}
                </Label>
                <Input
                  id="norg-gmp"
                  value={gmpCertificat}
                  maxLength={100}
                  onChange={(e) => setGmpCertificat(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="norg-gmp-exp">{t({ fr: 'Échéance GMP', en: 'GMP expiry' })}</Label>
                <Input
                  id="norg-gmp-exp"
                  type="date"
                  value={gmpExpiry}
                  onChange={(e) => setGmpExpiry(e.target.value)}
                />
              </div>
            </>
          ) : null}

          {role === 'titulaire' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="norg-sign">
                  {t({ fr: 'Signataire (lettres)', en: 'Signatory (letters)' })}
                </Label>
                <Input
                  id="norg-sign"
                  value={signataire}
                  maxLength={120}
                  onChange={(e) => setSignataire(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="norg-poste">
                  {t({ fr: 'Rôle du signataire', en: 'Signatory role' })}
                </Label>
                <Input
                  id="norg-poste"
                  value={poste}
                  maxLength={120}
                  onChange={(e) => setPoste(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>

        {/* Les documents (info + pièces admin) se déposent sur la fiche créée. */}
        <p className="text-muted-foreground text-xs">
          {t({
            fr: 'Les documents (pièces admin, docs d’information) s’ajoutent ensuite sur la fiche de l’organisation.',
            en: 'Documents (admin & information docs) are added on the organization page afterwards.',
          })}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t({ fr: 'Annuler', en: 'Cancel' })}
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy}>
            {t({ fr: 'Créer', en: 'Create' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
