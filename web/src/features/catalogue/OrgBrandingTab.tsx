import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'

import { ImageField } from '@/features/account/ImageField'
import {
  getPartyBranding,
  setPartyFooter,
  setPartyHeader,
  setPartyLogo,
} from '@/features/profile/pro-settings-repository'
import { syncProSettings } from '@/features/profile/pro-settings-sync'
import { useProSettingsSync } from '@/features/profile/use-pro-settings-sync'
import { imageFileToDataUrl, MAX_IMAGE_BYTES } from '@/lib/image-utils'
import { useI18n } from '@/lib/i18n-context'

/**
 * Onglet « Marque » d'une fiche MAH : logo / en-tête / pied PROPRES à ce titulaire (mode agence).
 * Ces images alimentent les lettres et le dossier compilé de TOUT produit dont ce MAH est titulaire ;
 * si rien n'est défini ici, on retombe sur le papier à en-tête du compte (`getBrandingForParty`).
 *
 * Réutilise `ImageField` (page compte) + les setters `party*` (mêmes champs que le branding tenant,
 * stockés sous `pro_settings` `kind=partyBranding`). Décision CEO : branding sur onglet dédié,
 * signataire (nom + rôle) dans l'onglet Identification.
 */
export function OrgBrandingTab({ orgId, partyId }: { orgId: string; partyId: string }) {
  const { t } = useI18n()
  useProSettingsSync(orgId)
  const branding = useLiveQuery(() => getPartyBranding(partyId), [partyId])
  const upload = t({ fr: 'Téléverser', en: 'Upload' })

  async function pick(file: File, apply: (dataUrl: string) => Promise<void>) {
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
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Papier à en-tête propre à ce titulaire. Appliqué automatiquement aux lettres et au dossier compilé de ses produits. À défaut, le papier à en-tête du compte est utilisé.',
          en: 'Letterhead specific to this MA holder. Applied automatically to the letters and compiled dossier of its products. If left empty, the account letterhead is used.',
        })}
      </p>
      <ImageField
        label={t({ fr: 'Logo (bandeau du dossier compilé)', en: 'Logo (compiled dossier banner)' })}
        hint={t({
          fr: 'Petit logo en en-tête de chaque page du dossier compilé.',
          en: 'Small logo in the header of every compiled-dossier page.',
        })}
        value={branding?.logoImage ?? null}
        uploadLabel={upload}
        onPick={(f) => void pick(f, (d) => setPartyLogo(orgId, partyId, d))}
        onRemove={() => void remove(() => setPartyLogo(orgId, partyId, null))}
      />
      <ImageField
        label={t({ fr: 'En-tête', en: 'Header' })}
        hint={t({
          fr: 'Bannière pleine largeur en haut des lettres.',
          en: 'Full-width banner at the top of letters.',
        })}
        value={branding?.headerImage ?? null}
        uploadLabel={upload}
        onPick={(f) => void pick(f, (d) => setPartyHeader(orgId, partyId, d))}
        onRemove={() => void remove(() => setPartyHeader(orgId, partyId, null))}
      />
      <ImageField
        label={t({ fr: 'Pied de page', en: 'Footer' })}
        hint={t({ fr: 'Mentions légales / contact.', en: 'Legal notice / contact.' })}
        value={branding?.footerImage ?? null}
        uploadLabel={upload}
        onPick={(f) => void pick(f, (d) => setPartyFooter(orgId, partyId, d))}
        onRemove={() => void remove(() => setPartyFooter(orgId, partyId, null))}
      />
    </div>
  )
}
