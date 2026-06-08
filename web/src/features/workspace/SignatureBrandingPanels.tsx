import { useRef, useState, type ReactNode } from 'react'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { setOrgFooter, setOrgHeader } from '@/features/profile/pro-settings-repository'
import type { ProSettingRecord } from '@/lib/db'
import { imageFileToDataUrl, MAX_IMAGE_BYTES } from '@/lib/image-utils'

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
          <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose}>
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
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image trop lourde (max 3 Mo).')
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
    <PanelShell title="Signature" onClose={onClose}>
      <p className="text-muted-foreground text-sm">
        Importez votre signature depuis votre ordinateur. Elle se place automatiquement à
        l'emplacement réservé de la lettre (entre le poste et le nom).
      </p>
      <p className="text-muted-foreground text-xs">
        Recommandé : PNG à fond transparent, ~600×200 px, moins de 3 Mo.
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
          alt="Aperçu de la signature"
          className="max-h-28 self-center rounded border bg-white p-2"
        />
      ) : (
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> Choisir un fichier
        </Button>
      )}
      {preview ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
            Changer
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void apply(false)}>
            Appliquer une fois
          </Button>
          <Button disabled={busy} onClick={() => void apply(true)}>
            Enregistrer et appliquer
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
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="rounded border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {current ? (
          <Button variant="ghost" size="sm" onClick={() => void onRemove()}>
            Retirer
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
        <Upload className="size-4" /> {current ? 'Remplacer' : 'Importer'}
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
  async function upload(kind: 'header' | 'footer', file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image trop lourde (max 3 Mo).')
      return
    }
    const dataUrl = await imageFileToDataUrl(file, 1600)
    if (kind === 'header') await setOrgHeader(orgId, dataUrl)
    else await setOrgFooter(orgId, dataUrl)
    toast.success(kind === 'header' ? 'En-tête mis à jour' : 'Pied de page mis à jour')
  }

  return (
    <PanelShell title="En-tête / Pied de page" onClose={onClose}>
      <p className="text-muted-foreground text-sm">
        Importez votre papier à en-tête et votre pied de page : ils s'appliquent à vos lettres
        (éditeur + PDF compilé), pleine largeur — sans quitter le montage.
      </p>
      <BrandRow
        label="En-tête"
        current={branding?.headerImage ?? null}
        hint="Bannière pleine largeur, ~1000×150 px, moins de 3 Mo."
        onUpload={(f) => upload('header', f)}
        onRemove={() => setOrgHeader(orgId, null)}
      />
      <BrandRow
        label="Pied de page"
        current={branding?.footerImage ?? null}
        hint="Bannière pleine largeur, ~1000×120 px, moins de 3 Mo."
        onUpload={(f) => upload('footer', f)}
        onRemove={() => setOrgFooter(orgId, null)}
      />
    </PanelShell>
  )
}
