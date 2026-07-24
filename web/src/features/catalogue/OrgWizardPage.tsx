import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { syncCatalogue } from './catalogue-sync'
import { adminDocTypesForPartyRoles, AMM_DOC_TYPE } from './doc-types'
import { DocTypeCards, type DraftDocument } from './DocTypeCards'
import { addPartyDocument } from './documents-repository'
import { updateParty, upsertParty } from './parties-repository'
import { useCatalogueSync } from './use-catalogue-sync'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const TYPE_LABEL: Partial<Record<PartyRole, Translatable>> = {
  titulaire: { fr: "Titulaire d'AMM", en: 'MA holder' },
  fabricant: { fr: 'Fabricant', en: 'Manufacturer' },
  agent: { fr: 'Agence locale / Représentant', en: 'Local agent / Representative' },
}

/** Une session du wizard — la liste dépend des RÔLES (matrice CEO, PLAN-ORG-REFERENTIEL §1). */
interface Session {
  key: 'identif' | 'info' | 'admin' | 'amm'
  label: Translatable
}

/**
 * Page de **création d'une organisation** (`/catalogue/organisations/nouvelle?type=…`) — wizard à
 * sessions DÉRIVÉES DES RÔLES, même chrome que « Nouveau produit » :
 *  • MAH pur : Identification · Docs d'information · Pièces admin (contrat) · AMM
 *  • Fabricant / Agence locale : Identification · Pièces administratives
 *  • MAH + Fabricant (`?type=titulaire,fabricant`) : Identification · Docs d'info · Pièces admin · AMM
 * `type` accepte une liste de rôles séparés par des virgules ; invalide → retour aux Organisations.
 * Le gate MAH est appliqué au choix du type (dialog) ; « Terminer » exige seulement le nom.
 */
export function OrgWizardPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const orgId = useOrgId()
  useCatalogueSync(orgId)
  const [params] = useSearchParams()
  // Dédoublonné : une URL forgée `?type=titulaire,titulaire` ne double pas le libellé (les données
  // sont déjà sûres — upsertParty unionne les rôles).
  const roles = [...new Set((params.get('type') ?? '').split(',').filter(Boolean))] as PartyRole[]
  const rolesValid = roles.length > 0 && roles.every((r) => !!TYPE_LABEL[r])

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
  // Documents AJOUTÉS sans organisation (buffer, comme le wizard produit) — persistés à « Terminer »
  // seulement, rattachés à l'org créée (`addPartyDocument`).
  const [drafts, setDrafts] = useState<DraftDocument[]>([])
  const [busy, setBusy] = useState(false)

  // Type absent/inconnu (URL forgée, type « bientôt ») → retour au choix.
  if (!rolesValid) return <Navigate to="/catalogue/organisations" replace />

  const isMah = roles.includes('titulaire')
  const isFab = roles.includes('fabricant')
  // Pièces admin autorisées pour ces rôles (MAH pur → contrat seul ; fabricant/agent → tout sauf AMM).
  const adminTypes = adminDocTypesForPartyRoles(roles)

  const sessions: Session[] = [
    { key: 'identif', label: { fr: 'Identification', en: 'Identification' } },
    ...(isMah
      ? [
          {
            key: 'info',
            label: { fr: 'Documents d’information', en: 'Product information' },
          } as Session,
        ]
      : []),
    ...(adminTypes.length > 0
      ? [
          {
            key: 'admin',
            label: { fr: 'Pièces administratives', en: 'Administrative documents' },
          } as Session,
        ]
      : []),
    ...(isMah ? [{ key: 'amm', label: { fr: 'AMM', en: 'MA' } } as Session] : []),
  ]
  const current = sessions[step - 1]?.key ?? 'identif'
  const lastStep = sessions.length

  const typeLabel = roles.map((r) => t(TYPE_LABEL[r]!)).join(' + ')
  const isValidStep1 = nom.trim().length > 0

  function goToStep(n: number) {
    if (n === step) return
    if (step === 1 && n !== 1) setAttempted(!isValidStep1)
    setStep(n)
  }

  /** Drafts d'une session docs (l'AMM est une pièce admin, mais vit dans SA session). */
  const draftsFor = (key: Session['key']): DraftDocument[] =>
    key === 'info'
      ? drafts.filter((d) => d.category === 'info')
      : key === 'amm'
        ? drafts.filter((d) => d.docType === 'amm')
        : drafts.filter((d) => d.category === 'admin' && d.docType !== 'amm')

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
        roles,
        pays: pays.trim(),
        adresse: adresse.trim(),
        gmpCertificat: isFab ? gmpCertificat.trim() : '',
        gmpExpiry: isFab ? gmpExpiry || null : null,
      })
      if (!id) return
      if (email) await updateParty(id, { contactEmail: email })
      // Signataire du MAH → branding party (résolu sur ses lettres).
      if (isMah && (signataire.trim() || poste.trim())) {
        await setPartySignatory(orgId, id, {
          signataire: signataire.trim() || null,
          poste: poste.trim() || null,
        })
        void syncProSettings(orgId)
      }
      // Sessions docs : persiste les documents bufferisés, rattachés à l'ORGANISATION.
      for (const d of drafts) {
        await addPartyDocument(orgId, id, {
          category: d.category,
          docType: d.docType,
          file: d.file,
          issueDate: d.issueDate,
          expiryDate: d.expiryDate,
          holder: d.holder,
          country: d.country,
          reference: d.reference,
          batchNumber: d.batchNumber,
        })
        // Retiré du buffer dès persisté : un « Terminer » rejoué après échec partiel (l'org est
        // déjà créée, idempotente par nom) ne DUPLIQUE pas les documents déjà enregistrés.
        setDrafts((cur) => cur.filter((x) => x.id !== d.id))
      }
      // Chaîne ordonnée parties → produits → documents (FK) — pas de push isolé.
      void syncCatalogue(orgId)
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
    const key = sessions[n - 1]?.key
    if (key === 'identif') return isValidStep1 ? 'done' : attempted ? 'error' : 'todo'
    return key && draftsFor(key).length > 0 ? 'done' : 'todo'
  }

  /** Session de documents (info / pièces admin / AMM) — cartes par type + nav. */
  const docsSession = (key: Exclude<Session['key'], 'identif'>, stepNo: number) => (
    <div className="space-y-5">
      <DocTypeCards
        category={key === 'info' ? 'info' : 'admin'}
        types={key === 'admin' ? adminTypes : key === 'amm' ? AMM_DOC_TYPE : undefined}
        // Contexte ORG : le champ « Titulaire » n'existe pas (on est chez le propriétaire).
        hideHolder
        drafts={draftsFor(key)}
        onAdd={(d) => setDrafts((cur) => [...cur, d])}
        onRemove={(id) => setDrafts((cur) => cur.filter((d) => d.id !== id))}
      />
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={() => goToStep(stepNo - 1)}>
          <ArrowLeft /> {t({ fr: 'Précédent', en: 'Back' })}
        </Button>
        {stepNo === lastStep ? (
          <Button type="button" variant="primary" disabled={busy} onClick={() => void finish()}>
            {t({ fr: 'Terminer', en: 'Finish' })} <Check />
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={() => goToStep(stepNo + 1)}>
            {t({ fr: 'Suivant', en: 'Next' })} <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <Page className="max-w-3xl">
      <p className="text-muted-foreground text-sm">
        {t({
          fr: `Renseignez l’organisation (${typeLabel}) en ${lastStep} étapes. Tout est enregistré localement et disponible hors-ligne.`,
          en: `Fill in the organization (${typeLabel}) in ${lastStep} steps. Everything is saved locally and available offline.`,
        })}
      </p>

      <div className="space-y-6">
        {/* Stepper typeform — titres CLIQUABLES (même chrome que Nouveau produit). */}
        <ol className="flex items-center gap-2">
          {sessions.map((s, i) => {
            const n = i + 1
            const state = stepState(n)
            return (
              <li key={s.key} className="flex flex-1 items-center gap-2">
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
                    {t(s.label)}
                  </span>
                </button>
                {n < sessions.length ? <span className="bg-border h-px flex-1" /> : null}
              </li>
            )
          })}
        </ol>

        {current === 'identif' ? (
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

                {isFab ? (
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

                {isMah ? (
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

        {/* Sessions docs — mêmes cartes par type que le wizard produit (buffer). La liste des
            sessions ET les types proposés suivent la matrice par rôle (PLAN-ORG-REFERENTIEL §1). */}
        {current !== 'identif' ? docsSession(current, step) : null}
      </div>
    </Page>
  )
}
