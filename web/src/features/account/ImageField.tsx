import { useRef } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'

interface ImageFieldProps {
  label: string
  hint?: string
  value: string | null
  onPick: (file: File) => void
  onRemove: () => void
  uploadLabel: string
}

/** Champ de téléversement d'image avec aperçu (en-tête, pied, logo, signature, photo). */
export function ImageField({ label, hint, value, onPick, onRemove, uploadLabel }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
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
            <ImageUp className="size-4" /> {uploadLabel}
          </Button>
          {value ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t({ fr: 'Retirer', en: 'Remove' })}
              onClick={onRemove}
            >
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
          <p className="text-muted-foreground text-xs italic">—</p>
        )}
      </div>
    </div>
  )
}
