import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ImageUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { useOrgId } from '@/features/org/org-context'
import { imageFileToDataUrl, MAX_IMAGE_BYTES } from '@/lib/image-utils'
import {
  getOrgBranding,
  getUserSignature,
  setOrgFooter,
  setOrgHeader,
  setOrgLogo,
  setUserSignature,
} from './pro-settings-repository'
import { syncProSettings } from './pro-settings-sync'
import { useProSettingsSync } from './use-pro-settings-sync'

export function ProfilePage() {
  const orgId = useOrgId()
  const { user } = useAuth()
  const userId = user?.id ?? 'local'
  useProSettingsSync(orgId)

  const branding = useLiveQuery(() => getOrgBranding(orgId), [orgId])
  const signature = useLiveQuery(() => getUserSignature(userId), [userId])

  async function handlePick(file: File, apply: (dataUrl: string) => Promise<void>) {
    if (!file.type.startsWith('image/')) {
      toast.error('Choisissez un fichier image (PNG/JPG).')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image trop lourde (max 3 Mo).')
      return
    }
    try {
      const dataUrl = await imageFileToDataUrl(file)
      await apply(dataUrl)
      void syncProSettings(orgId)
      toast.success('Enregistré')
    } catch {
      toast.error("Échec du traitement de l'image.")
    }
  }

  async function remove(apply: () => Promise<void>) {
    await apply()
    void syncProSettings(orgId)
    toast.success('Retiré')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Profil pro</h1>
        <p className="text-muted-foreground text-sm">
          En-tête et pied de page appliqués aux documents générés. Images réutilisées
          automatiquement.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide">PAPIER À EN-TÊTE (ORGANISATION)</h2>
        <p className="text-muted-foreground -mt-2 text-xs">
          Partagé par toute l'équipe du laboratoire.
        </p>
        <ImageField
          label="Logo (bandeau du dossier compilé)"
          hint="Petit logo affiché dans l'en-tête de chaque page du dossier compilé."
          value={branding?.logoImage ?? null}
          onPick={(f) => handlePick(f, (d) => setOrgLogo(orgId, d))}
          onRemove={() => remove(() => setOrgLogo(orgId, null))}
        />
        <ImageField
          label="En-tête (lettre seule)"
          hint="Papier à en-tête appliqué à une lettre téléchargée seule."
          value={branding?.headerImage ?? null}
          onPick={(f) => handlePick(f, (d) => setOrgHeader(orgId, d))}
          onRemove={() => remove(() => setOrgHeader(orgId, null))}
        />
        <ImageField
          label="Pied de page"
          hint="Mentions légales / contact en bas de page."
          value={branding?.footerImage ?? null}
          onPick={(f) => handlePick(f, (d) => setOrgFooter(orgId, d))}
          onRemove={() => remove(() => setOrgFooter(orgId, null))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide">SIGNATURE (VOUS)</h2>
        <p className="text-muted-foreground -mt-2 text-xs">
          Insérable dans un document via le bouton « Signer ».
        </p>
        <ImageField
          label="Signature"
          hint="Image de signature (fond transparent recommandé)."
          value={signature?.signatureImage ?? null}
          onPick={(f) => handlePick(f, (d) => setUserSignature(orgId, userId, d))}
          onRemove={() => remove(() => setUserSignature(orgId, userId, null))}
        />
      </section>
    </div>
  )
}

function ImageField({
  label,
  hint,
  value,
  onPick,
  onRemove,
}: {
  label: string
  hint?: string
  value: string | null
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{label}</h3>
          {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              e.target.value = ''
            }}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            <ImageUp className="size-4" /> Téléverser
          </Button>
          {value ? (
            <Button size="sm" variant="ghost" aria-label="Retirer" onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3">
        {value ? (
          <img
            src={value}
            alt={label}
            className="max-h-32 rounded border bg-white object-contain p-2"
          />
        ) : (
          <p className="text-muted-foreground text-xs italic">Aucune image.</p>
        )}
      </div>
    </div>
  )
}
