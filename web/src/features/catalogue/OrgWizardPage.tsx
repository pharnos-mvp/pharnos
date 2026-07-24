import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FolderOpen } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Page } from '@/components/ui/page'
import { useTopbar } from '@/components/layout/topbar'
import { useOrgId } from '@/features/org/org-context'
import { setPartySignatory } from '@/features/profile/pro-settings-repository'
import { syncProSettings } from '@/features/profile/pro-settings-sync'
import type { PartyRole } from '@/lib/db'
import { cn } from '@/lib/utils'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { updateParty, upsertParty } from './parties-repository'
import { syncParties } from './parties-sync'
import { useCatalogueSync } from './use-catalogue-sync'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const TYPE_LABEL: Partial<Record<PartyRole, Translatable>> = {
  titulaire: { fr: "Titulaire d'AMM", en: 'MA holder' },
  fabricant: { fr: 'Fabricant', en: 'Manufacturer' },
  agent: { fr: 'Agence locale / Représentant', en: 'Local agent / Representative' },
}

const STEPS: Translatable[] = [
  { fr: 'Identification', en: 'Identification' },
  { fr: 'Documents d’information', en: 'Product information' },
  { fr: 'Pièces administratives', en: 'Administrative documents' },
]

/**
 * Page de **création d'une organisation** (`/catalogue/organisations/nouvelle?type=…`) — wizard
 * 3 sessions, MÊME chrome que « Nouveau produit » (décision CEO). Le type vient de l'étape 1
 * (dialog de choix, `OrgCreateDialog`) ; un type invalide renvoie aux Organisations.
 *
 * Sessions II/III : les documents rattachés à l'ORGANISATION arrivent dans la PR suivante
 * (décision CEO « Identification d'abord ») — les sessions annoncent la fiche en attendant.
 * Le gate MAH est déjà appliqué au choix du type ; « Terminer » ne re-gate pas (défense au
 * niveau du dialog), il exige seulement le nom.
 */
export function OrgWizardPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  const [params] = useSearchParams()
  const type = params.get('type') as PartyRole | null

  useTopbar({
    title: t({ fr: 'Nouvelle organisation', en: 'New organization' }),
    backTo: '/catalogue/organisations',
    searchHidden: true,
  })

  const [step, setStep] = useState(1)
  const [attempted, setAttempted] = useState(false)
  const [nom, setNom] = useState('')
  const [pays, setPays] = useState('')
  const [adresse, setAdresse] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [gmpCertificat, setGmpCertificat] = useState('')
  const [gmpExpiry, setGmpExpiry] = useState('')
  const [signataire, setSignataire] = useState('')
  const [poste, setPoste] = useState('')
  const [busy, setBusy] = useState(false)

  // Type absent/inconnu (URL forgée, type « bientôt ») → retour au choix.
  if (!type || !TYPE_LABEL[type]) return <Navigate to="/catalogue/organisations" replace />

  const isValidStep1 = nom.trim().length > 0

  function goToStep(n: number) {
    if (n === step) return
    if (step === 1 && n !== 1) setAttempted(!isValidStep1)
    setStep(n)
  }

  async function finish() {
    if (!nom.trim()) {
      setAttempted(true)
      setStep(1)
      toast.error(t({ fr: 'Le nom est requis.', en: 'Name is required.' }))
      return
    }
    const email = contactEmail.trim()
    if (email && !EMAIL_RE.test(email)) {
      setStep(1)
      toast.error(t({ fr: 'E-mail de contact invalide.', en: 'Invalid contact e-mail.' }))
      return
    }
    setBusy(true)
    try {
      const id = await upsertParty(orgId, {
        nom,
        roles: [type as PartyRole],
        pays: pays.trim(),
        adresse: adresse.trim(),
        gmpCertificat: type === 'fabricant' ? gmpCertificat.trim() : '',
        gmpExpiry: type === 'fabricant' ? gmpExpiry || null : null,
      })
      if (!id) return
      if (email) await updateParty(id, { contactEmail: email })
      // Signataire du MAH → branding party (résolu sur ses lettres).
      if (type === 'titulaire' && (signataire.trim() || poste.trim())) {
        await setPartySignatory(orgId, id, {
          signataire: signataire.trim() || null,
          poste: poste.trim() || null,
        })
        void syncProSettings(orgId)
      }
      void syncParties(orgId)
      toast.success(t({ fr: 'Organisation créée', en: 'Organization created' }))
      navigate(`/catalogue/organisations/${id}`)
    } catch {
      toast.error(t({ fr: 'Échec de la création', en: 'Creation failed' }))
    } finally {
      setBusy(false)
    }
  }

  const stepState = (n: number): 'done' | 'active' | 'error' | 'todo' => {
    if (n === step) return 'active'
    if (n === 1) return isValidStep1 ? 'done' : attempted ? 'error' : 'todo'
    return 'todo'
  }

  /** Sessions II/III — les documents org-level arrivent juste après (fiche en attendant). */
  const docsInterim = (
    <EmptyState
      icon={<FolderOpen />}
      title={t({ fr: 'Bientôt directement ici', en: 'Coming right here soon' })}
      description={t({
        fr: 'Les documents de l’organisation se déposeront dans cette session très prochainement. En attendant, ajoutez-les depuis la fiche de l’organisation après création.',
        en: 'Organization documents will be uploaded in this step very soon. Meanwhile, add them from the organization page after creation.',
      })}
    />
  )

  return (
    <Page className="max-w-3xl">
      <p className="text-muted-foreground text-sm">
        {t({
          fr: `Renseignez l’organisation (${t(TYPE_LABEL[type]!)}) en 3 étapes. Tout est enregistré localement et disponible hors-ligne.`,
          en: `Fill in the organization (${t(TYPE_LABEL[type]!)}) in 3 steps. Everything is saved locally and available offline.`,
        })}
      </p>

      <div className="space-y-6">
        {/* Stepper typeform — titres CLIQUABLES (même chrome que Nouveau produit). */}
        <ol className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1
            const state = stepState(n)
            return (
              <li key={n} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToStep(n)}
                  aria-current={state === 'active' ? 'step' : undefined}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      state === 'done'
                        ? 'bg-success text-white'
                        : state === 'active'
                          ? 'bg-info text-white'
                          : state === 'error'
                            ? 'bg-danger text-white'
                            : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {state === 'done' ? <Check className="size-4" /> : state === 'error' ? '!' : n}
                  </span>
                  <span
                    className={cn(
                      'truncate text-sm font-medium',
                      state === 'active'
                        ? 'text-foreground'
                        : state === 'error'
                          ? 'text-danger'
                          : 'text-muted-foreground',
                    )}
                  >
                    {t(label)}
                  </span>
                </button>
                {n < STEPS.length ? <span className="bg-border h-px flex-1" /> : null}
              </li>
            )
          })}
        </ol>

        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              goToStep(2)
            }}
            className="space-y-5"
            noValidate
          >
            <Card className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="worg-nom">
                    {t({ fr: 'Nom', en: 'Name' })} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="worg-nom"
                    value={nom}
                    maxLength={300}
                    aria-invalid={attempted && !isValidStep1 ? true : undefined}
                    onChange={(e) => setNom(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="worg-pays">{t({ fr: 'Pays', en: 'Country' })}</Label>
                  <Input
                    id="worg-pays"
                    value={pays}
                    maxLength={100}
                    onChange={(e) => setPays(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="worg-email">
                    {t({ fr: 'E-mail de contact', en: 'Contact e-mail' })}
                  </Label>
                  <Input
                    id="worg-email"
                    type="email"
                    value={contactEmail}
                    maxLength={320}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="worg-adresse">{t({ fr: 'Adresse', en: 'Address' })}</Label>
                  <Input
                    id="worg-adresse"
                    value={adresse}
                    maxLength={300}
                    onChange={(e) => setAdresse(e.target.value)}
                  />
                </div>

                {type === 'fabricant' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="worg-gmp">
                        {t({ fr: 'N° certificat GMP', en: 'GMP certificate no.' })}
                      </Label>
                      <Input
                        id="worg-gmp"
                        value={gmpCertificat}
                        maxLength={100}
                        onChange={(e) => setGmpCertificat(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="worg-gmp-exp">
                        {t({ fr: 'Échéance GMP', en: 'GMP expiry' })}
                      </Label>
                      <Input
                        id="worg-gmp-exp"
                        type="date"
                        value={gmpExpiry}
                        onChange={(e) => setGmpExpiry(e.target.value)}
                      />
                    </div>
                  </>
                ) : null}

                {type === 'titulaire' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="worg-sign">
                        {t({ fr: 'Signataire (lettres)', en: 'Signatory (letters)' })}
                      </Label>
                      <Input
                        id="worg-sign"
                        value={signataire}
                        maxLength={120}
                        onChange={(e) => setSignataire(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="worg-poste">
                        {t({ fr: 'Rôle du signataire', en: 'Signatory role' })}
                      </Label>
                      <Input
                        id="worg-poste"
                        value={poste}
                        maxLength={120}
                        onChange={(e) => setPoste(e.target.value)}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" variant="primary">
                {t({ fr: 'Suivant', en: 'Next' })} <ArrowRight />
              </Button>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            {docsInterim}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => goToStep(1)}>
                <ArrowLeft /> {t({ fr: 'Précédent', en: 'Back' })}
              </Button>
              <Button type="button" variant="primary" onClick={() => goToStep(3)}>
                {t({ fr: 'Suivant', en: 'Next' })} <ArrowRight />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            {docsInterim}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => goToStep(2)}>
                <ArrowLeft /> {t({ fr: 'Précédent', en: 'Back' })}
              </Button>
              <Button type="button" variant="primary" disabled={busy} onClick={() => void finish()}>
                {t({ fr: 'Terminer', en: 'Finish' })} <Check />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  )
}
