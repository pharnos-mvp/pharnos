import { useRef, useState, type ReactNode } from 'react'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { setOrgFooter, setOrgHeader } from '@/features/profile/pro-settings-repository'
import type { ProSettingRecord } from '@/lib/db'
import { imageFileToDataUrl, MAX_IMAGE_BYTES } from '@/lib/image-utils'
import { useI18n } from '@/lib/i18n-context'

/**
 * Panneaux d'upload **in-montage** (signature, en-tête/pied) — l'utilisateur ne quitte jamais
 * l'espace de montage (« Deepwork »). Upload local → option de stockage pour réutiliser.
 */

function PanelShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-card flex w-full max-w-md flex-col gap-3 rounded-lg border p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t({ fr: 'Fermer', en: 'Close' })}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Panneau signature : import + (option) stockage, puis insertion au bon emplacement de la lettre. */
export function SignaturePanel({
  onApply,
  onClose,
}: {
  onApply: (dataUrl: string, store: boolean) => void | Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t({ fr: 'Image trop lourde (max 3 Mo).', en: 'Image too large (max 3 MB).' }))
      return
    }
    setPreview(await imageFileToDataUrl(file, 600))
  }

  async function apply(store: boolean) {
    if (!preview) return
    setBusy(true)
    try {
      await onApply(preview, store)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell title={t({ fr: 'Signature', en: 'Signature' })} onClose={onClose}>
      <p className="text-muted-foreground text-sm">
        {t({
          fr: "Importez votre signature depuis votre ordinateur. Elle se place automatiquement à l'emplacement réservé de la lettre (entre le poste et le nom).",
          en: 'Import your signature from your computer. It is placed automatically at the reserved spot in the letter (between the role and the name).',
        })}
      </p>
      <p className="text-muted-foreground text-xs">
        {t({
          fr: 'Recommandé : PNG à fond transparent, ~600×200 px, moins de 3 Mo.',
          en: 'Recommended: transparent PNG, ~600×200 px, under 3 MB.',
        })}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />
      {preview ? (
        <img
          src={preview}
          alt={t({ fr: 'Aperçu de la signature', en: 'Signature preview' })}
          className="max-h-28 self-center rounded border bg-white p-2"
        />
      ) : (
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> {t({ fr: 'Choisir un fichier', en: 'Choose a file' })}
        </Button>
      )}
      {preview ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
            {t({ fr: 'Changer', en: 'Change' })}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void apply(false)}>
            {t({ fr: 'Appliquer une fois', en: 'Apply once' })}
          </Button>
          <Button disabled={busy} onClick={() => void apply(true)}>
            {t({ fr: 'Enregistrer et appliquer', en: 'Save and apply' })}
          </Button>
        </div>
      ) : null}
    </PanelShell>
  )
}

function BrandRow({
  label,
  current,
  hint,
  onUpload,
  onRemove,
}: {
  label: string
  current: string | null
  hint: string
  onUpload: (file: File) => void | Promise<void>
  onRemove: () => void | Promise<void>
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="rounded border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {current ? (
          <Button variant="ghost" size="sm" onClick={() => void onRemove()}>
            {t({ fr: 'Retirer', en: 'Remove' })}
          </Button>
        ) : null}
      </div>
      {current ? (
        <img
          src={current}
          alt={label}
          className="mt-2 max-h-16 w-full rounded border bg-white object-contain p-1"
        />
      ) : null}
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onUpload(f)
          e.target.value = ''
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />{' '}
        {current ? t({ fr: 'Remplacer', en: 'Replace' }) : t({ fr: 'Importer', en: 'Import' })}
      </Button>
    </div>
  )
}

/** Panneau en-tête/pied : import / remplacement / retrait (stocké au niveau organisation). */
export function BrandingPanel({
  branding,
  orgId,
  onClose,
}: {
  branding: ProSettingRecord | undefined
  orgId: string
  onClose: () => void
}) {
  const { t } = useI18n()
  async function upload(kind: 'header' | 'footer', file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t({ fr: 'Image trop lourde (max 3 Mo).', en: 'Image too large (max 3 MB).' }))
      return
    }
    const dataUrl = await imageFileToDataUrl(file, 1600)
    if (kind === 'header') await setOrgHeader(orgId, dataUrl)
    else await setOrgFooter(orgId, dataUrl)
    toast.success(
      kind === 'header'
        ? t({ fr: 'En-tête mis à jour', en: 'Header updated' })
        : t({ fr: 'Pied de page mis à jour', en: 'Footer updated' }),
    )
  }

  return (
    <PanelShell
      title={t({ fr: 'En-tête / Pied de page', en: 'Header / Footer' })}
      onClose={onClose}
    >
      <p className="text-muted-foreground text-sm">
        {t({
          fr: "Importez votre papier à en-tête et votre pied de page : ils s'appliquent à vos lettres (éditeur + PDF compilé), pleine largeur — sans quitter le montage.",
          en: 'Import your letterhead and footer: they apply to your letters (editor + compiled PDF), full width — without leaving the workspace.',
        })}
      </p>
      <BrandRow
        label={t({ fr: 'En-tête', en: 'Header' })}
        current={branding?.headerImage ?? null}
        hint={t({
          fr: 'Bannière pleine largeur, ~1000×150 px, moins de 3 Mo.',
          en: 'Full-width banner, ~1000×150 px, under 3 MB.',
        })}
        onUpload={(f) => upload('header', f)}
        onRemove={() => setOrgHeader(orgId, null)}
      />
      <BrandRow
        label={t({ fr: 'Pied de page', en: 'Footer' })}
        current={branding?.footerImage ?? null}
        hint={t({
          fr: 'Bannière pleine largeur, ~1000×120 px, moins de 3 Mo.',
          en: 'Full-width banner, ~1000×120 px, under 3 MB.',
        })}
        onUpload={(f) => upload('footer', f)}
        onRemove={() => setOrgFooter(orgId, null)}
      />
      <div className="flex justify-end pt-1">
        <Button onClick={onClose}>{t({ fr: 'Insérer', en: 'Insert' })}</Button>
      </div>
    </PanelShell>
  )
}
