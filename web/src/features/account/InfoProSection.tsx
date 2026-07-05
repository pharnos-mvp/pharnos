import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Section } from '@/components/ui/section'
import { useAuth } from '@/features/auth/auth-context'
import { useOrgId } from '@/features/org/org-context'
import {
  getOrgBranding,
  getUserSignature,
  setOrgFooter,
  setOrgHeader,
  setOrgLogo,
  setOrgProfile,
  setUserSignature,
} from '@/features/profile/pro-settings-repository'
import { syncProSettings } from '@/features/profile/pro-settings-sync'
import { useProSettingsSync } from '@/features/profile/use-pro-settings-sync'
import { useI18n } from '@/lib/i18n-context'
import { imageFileToDataUrl, MAX_IMAGE_BYTES } from '@/lib/image-utils'
import { ImageField } from './ImageField'

export function InfoProSection() {
  const orgId = useOrgId()
  const { user } = useAuth()
  const userId = user?.id ?? 'local'
  const { t } = useI18n()
  useProSettingsSync(orgId)

  const branding = useLiveQuery(() => getOrgBranding(orgId), [orgId])
  const signature = useLiveQuery(() => getUserSignature(userId), [userId])

  const upload = t({ fr: 'Téléverser', en: 'Upload' })

  async function handlePick(file: File, apply: (dataUrl: string) => Promise<void>) {
    if (!file.type.startsWith('image/')) {
      toast.error(t({ fr: 'Choisissez une image (PNG/JPG).', en: 'Choose an image (PNG/JPG).' }))
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t({ fr: 'Image trop lourde (max 3 Mo).', en: 'Image too large (max 3 MB).' }))
      return
    }
    try {
      await apply(await imageFileToDataUrl(file))
      void syncProSettings(orgId)
      toast.success(t({ fr: 'Enregistré', en: 'Saved' }))
    } catch {
      toast.error(t({ fr: "Échec du traitement de l'image.", en: 'Image processing failed.' }))
    }
  }

  async function remove(apply: () => Promise<void>) {
    await apply()
    void syncProSettings(orgId)
    toast.success(t({ fr: 'Retiré', en: 'Removed' }))
  }

  return (
    <div className="space-y-6">
      <OrgProfileForm
        // Remonte le formulaire quand les valeurs stockées changent (après save / synchro) →
        // réinitialise proprement la baseline sans effet ni clobber lors d'un upload d'image.
        key={`${branding?.entreprise ?? ''}|${branding?.poste ?? ''}|${branding?.signataire ?? ''}|${branding?.pays ?? ''}`}
        initial={{
          entreprise: branding?.entreprise ?? '',
          poste: branding?.poste ?? '',
          signataire: branding?.signataire ?? '',
          pays: branding?.pays ?? '',
        }}
        onSave={async (v) => {
          await setOrgProfile(orgId, {
            entreprise: v.entreprise.trim() || null,
            poste: v.poste.trim() || null,
            signataire: v.signataire.trim() || null,
            pays: v.pays.trim() || null,
          })
          void syncProSettings(orgId)
        }}
      />

      <Section
        title={t({ fr: 'Papier à en-tête (organisation)', en: 'Letterhead (organisation)' })}
        description={t({ fr: "Partagé par toute l'équipe.", en: 'Shared across the team.' })}
      >
        <ImageField
          label={t({
            fr: 'Logo (bandeau du dossier compilé)',
            en: 'Logo (compiled dossier banner)',
          })}
          hint={t({
            fr: 'Petit logo en en-tête de chaque page du dossier compilé.',
            en: 'Small logo in the header of every compiled-dossier page.',
          })}
          value={branding?.logoImage ?? null}
          uploadLabel={upload}
          onPick={(f) => handlePick(f, (d) => setOrgLogo(orgId, d))}
          onRemove={() => remove(() => setOrgLogo(orgId, null))}
        />
        <ImageField
          label={t({ fr: 'En-tête (lettre seule)', en: 'Header (single letter)' })}
          hint={t({
            fr: 'Papier à en-tête appliqué à une lettre téléchargée seule.',
            en: 'Letterhead applied to a single downloaded letter.',
          })}
          value={branding?.headerImage ?? null}
          uploadLabel={upload}
          onPick={(f) => handlePick(f, (d) => setOrgHeader(orgId, d))}
          onRemove={() => remove(() => setOrgHeader(orgId, null))}
        />
        <ImageField
          label={t({ fr: 'Pied de page', en: 'Footer' })}
          hint={t({ fr: 'Mentions légales / contact.', en: 'Legal notice / contact.' })}
          value={branding?.footerImage ?? null}
          uploadLabel={upload}
          onPick={(f) => handlePick(f, (d) => setOrgFooter(orgId, d))}
          onRemove={() => remove(() => setOrgFooter(orgId, null))}
        />
      </Section>

      <Section
        title={t({ fr: 'Signature (vous)', en: 'Signature (you)' })}
        description={t({ fr: 'Insérable via « Signer ».', en: 'Insertable via "Sign".' })}
      >
        <ImageField
          label={t({ fr: 'Signature', en: 'Signature' })}
          hint={t({
            fr: 'Fond transparent recommandé.',
            en: 'Transparent background recommended.',
          })}
          value={signature?.signatureImage ?? null}
          uploadLabel={upload}
          onPick={(f) => handlePick(f, (d) => setUserSignature(orgId, userId, d))}
          onRemove={() => remove(() => setUserSignature(orgId, userId, null))}
        />
      </Section>
    </div>
  )
}

/* ----------------------------- Infos professionnelles (texte) ----------------------------- */

interface OrgProfileValues {
  entreprise: string
  poste: string
  signataire: string
  pays: string
}

/**
 * Formulaire « Informations professionnelles » : entreprise → poste → pays.
 * Bouton Enregistrer **en haut** (sticky), actif uniquement en cas de modification (dirty).
 * Remonté par `key` quand les valeurs stockées changent → baseline propre, sans effet.
 */
function OrgProfileForm({
  initial,
  onSave,
}: {
  initial: OrgProfileValues
  onSave: (v: OrgProfileValues) => Promise<void>
}) {
  const { t } = useI18n()
  const [entreprise, setEntreprise] = useState(initial.entreprise)
  const [poste, setPoste] = useState(initial.poste)
  const [signataire, setSignataire] = useState(initial.signataire)
  const [pays, setPays] = useState(initial.pays)
  const [saving, setSaving] = useState(false)

  const dirty =
    entreprise !== initial.entreprise ||
    poste !== initial.poste ||
    signataire !== initial.signataire ||
    pays !== initial.pays

  async function save() {
    setSaving(true)
    try {
      await onSave({ entreprise, poste, signataire, pays })
      toast.success(t({ fr: 'Enregistré', en: 'Saved' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t({ fr: 'Erreur', en: 'Error' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title={t({ fr: 'Informations professionnelles', en: 'Professional information' })}
      description={t({
        fr: 'Identité de l’organisation en tête des documents générés.',
        en: 'Organization identity in the header of generated documents.',
      })}
      actions={
        <Button size="sm" disabled={saving || !dirty} onClick={() => void save()}>
          {t({ fr: 'Enregistrer', en: 'Save' })}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="org-entreprise">
            {t({ fr: "Nom de l'entreprise", en: 'Company name' })}
          </Label>
          <Input
            id="org-entreprise"
            value={entreprise}
            onChange={(e) => setEntreprise(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-poste">{t({ fr: 'Poste', en: 'Position' })}</Label>
          <Input id="org-poste" value={poste} onChange={(e) => setPoste(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-signataire">
            {t({ fr: 'Nom et prénom(s) du signataire', en: 'Signatory full name' })}
          </Label>
          <Input
            id="org-signataire"
            value={signataire}
            onChange={(e) => setSignataire(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-pays">{t({ fr: 'Pays', en: 'Country' })}</Label>
          <Input id="org-pays" value={pays} onChange={(e) => setPays(e.target.value)} />
        </div>
      </div>
    </Section>
  )
}
