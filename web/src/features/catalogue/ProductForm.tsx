import { useEffect, useMemo, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  /** Contenu de l'onglet « Documents d'information » (mode édition). */
  documentsSlot?: ReactNode
  /** Contenu de l'onglet « Pièces administratives » (mode édition). */
  adminSlot?: ReactNode
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

  const savePrompt = (
    <p className="text-muted-foreground text-sm">
      {t({
        fr: "Enregistrez d'abord le produit (onglet Identification) pour ajouter des documents.",
        en: 'Save the product first (Identification tab) to add documents.',
      })}
    </p>
  )

  return (
    <Form {...form}>
      <Tabs defaultValue="identification">
        <TabsList>
          <TabsTrigger value="identification">
            {t({ fr: 'Identification', en: 'Identification' })}
          </TabsTrigger>
          <TabsTrigger value="documents">
            {t({ fr: "Documents d'information", en: 'Product information' })}
          </TabsTrigger>
          <TabsTrigger value="admin">
            {t({ fr: 'Pièces administratives', en: 'Administrative documents' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identification" className="pt-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
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
            <Button type="submit" disabled={submitting}>
              {submitLabel}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="documents" className="pt-4">
          {documentsSlot ?? savePrompt}
        </TabsContent>

        <TabsContent value="admin" className="pt-4">
          {adminSlot ?? savePrompt}
        </TabsContent>
      </Tabs>
    </Form>
  )
}
