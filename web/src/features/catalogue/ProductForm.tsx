import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import {
  EMPTY_PRODUCT,
  makeProductSchema,
  type ProductFormValues,
  type ProductInput,
} from './types'

interface ProductFormProps {
  defaultValues?: ProductFormValues
  onSubmit: (values: ProductFormValues) => void | Promise<void>
  submitting?: boolean
  submitLabel: string
  /** Contenu de la section « Documents d'information » (mode édition). */
  documentsSlot?: ReactNode
  /** Contenu de la section « Pièces administratives » (mode édition). */
  adminSlot?: ReactNode
}

/** Carte de session repliable (chaînon de la fiche produit) — en-tête cliquable + corps. */
function SectionCard({
  title,
  open,
  onToggle,
  action,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'text-muted-foreground size-4 shrink-0 transition-transform',
              open ? '' : '-rotate-90',
            )}
          />
          <span className="font-semibold tracking-tight">{title}</span>
        </button>
        {action}
      </div>
      {open ? <div className="border-t px-5 py-5">{children}</div> : null}
    </Card>
  )
}

const identificationFields: ReadonlyArray<{
  name: keyof ProductFormValues
  label: Translatable
  required?: boolean
  placeholder?: Translatable
}> = [
  {
    name: 'nomCommercial',
    label: { fr: 'Nom commercial', en: 'Trade name' },
    required: true,
    placeholder: { fr: 'Ex. Doliprane', en: 'e.g. Doliprane' },
  },
  {
    name: 'dci',
    label: { fr: 'DCI', en: 'INN' },
    required: true,
    placeholder: { fr: 'Ex. Paracétamol', en: 'e.g. Paracetamol' },
  },
  {
    name: 'dosage',
    label: { fr: 'Dosage', en: 'Strength' },
    placeholder: { fr: 'Ex. 500 mg', en: 'e.g. 500 mg' },
  },
  {
    name: 'forme',
    label: { fr: 'Forme pharmaceutique', en: 'Pharmaceutical form' },
    placeholder: { fr: 'Ex. Comprimé', en: 'e.g. Tablet' },
  },
  {
    name: 'presentation',
    label: { fr: 'Présentation', en: 'Presentation' },
    placeholder: { fr: 'Ex. Boîte de 16', en: 'e.g. Box of 16' },
  },
  {
    name: 'classeTherapeutique',
    label: { fr: 'Classe thérapeutique', en: 'Therapeutic class' },
    placeholder: { fr: 'Ex. Antalgique', en: 'e.g. Analgesic' },
  },
  {
    name: 'codeAtc',
    label: { fr: 'Code ATC', en: 'ATC code' },
    placeholder: { fr: 'Ex. N02BE01', en: 'e.g. N02BE01' },
  },
  {
    name: 'titulaire',
    label: { fr: "Nom du titulaire / demandeur d'AMM", en: 'MA holder / applicant name' },
    placeholder: { fr: 'Ex. Sahel Pharma SARL', en: 'e.g. Sahel Pharma SARL' },
  },
  {
    name: 'titulaireAdresse',
    label: { fr: 'Adresse du titulaire', en: 'Holder address' },
    placeholder: {
      fr: 'Ex. 12 rue de la Santé, Cotonou, Bénin',
      en: 'e.g. 12 rue de la Santé, Cotonou, Benin',
    },
  },
  {
    name: 'fabricant',
    label: { fr: 'Nom du fabricant', en: 'Manufacturer name' },
    placeholder: { fr: 'Ex. Laboratoires Atlas', en: 'e.g. Atlas Laboratories' },
  },
  {
    name: 'fabricantAdresse',
    label: { fr: 'Adresse du fabricant', en: 'Manufacturer address' },
    placeholder: {
      fr: 'Ex. Zone industrielle, Casablanca, Maroc',
      en: 'e.g. Industrial zone, Casablanca, Morocco',
    },
  },
]

export function ProductForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel,
  documentsSlot,
  adminSlot,
}: ProductFormProps) {
  const { t } = useI18n()
  const schema = useMemo(() => makeProductSchema(t), [t])
  const form = useForm<ProductInput, unknown, ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? EMPTY_PRODUCT,
  })

  // Re-traduit à chaud les messages de validation déjà affichés quand la langue change.
  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) void form.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  const [open, setOpen] = useState({ id: true, docs: false, admin: false })
  const toggle = (k: 'id' | 'docs' | 'admin') => setOpen((o) => ({ ...o, [k]: !o[k] }))

  const savePrompt = (
    <p className="text-muted-foreground text-sm">
      {t({
        fr: "Enregistrez d'abord le produit (section I — Identification) pour ajouter des documents.",
        en: 'Save the product first (section I — Identification) to add documents.',
      })}
    </p>
  )

  // Trois sessions empilées (chaînon l'un sous l'autre) : I (Identification) porte le formulaire
  // et le bouton d'enregistrement ; II/III reçoivent les documents en mode édition. Repli sur
  // erreur de validation : on rouvre la section I pour montrer les messages.
  return (
    <Form {...form}>
      <div className="space-y-4">
        <form
          onSubmit={form.handleSubmit(onSubmit, () => setOpen((o) => ({ ...o, id: true })))}
          noValidate
        >
          <SectionCard
            title={t({ fr: 'I — Identification', en: 'I — Identification' })}
            open={open.id}
            onToggle={() => toggle('id')}
            action={
              <Button type="submit" size="sm" disabled={submitting}>
                {submitLabel}
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {identificationFields.map((f) => (
                <FormField
                  key={f.name}
                  control={form.control}
                  name={f.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t(f.label)}
                        {f.required ? <span className="text-destructive"> *</span> : null}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={f.placeholder ? t(f.placeholder) : undefined}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </SectionCard>
        </form>

        <SectionCard
          title={t({ fr: "II — Documents d'information du produit", en: 'II — Product information' })}
          open={open.docs}
          onToggle={() => toggle('docs')}
        >
          {documentsSlot ?? savePrompt}
        </SectionCard>

        <SectionCard
          title={t({ fr: 'III — Pièces administratives', en: 'III — Administrative documents' })}
          open={open.admin}
          onToggle={() => toggle('admin')}
        >
          {adminSlot ?? savePrompt}
        </SectionCard>
      </div>
    </Form>
  )
}
