import { type ReactNode } from 'react'
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
import { EMPTY_PRODUCT, productSchema, type ProductFormValues, type ProductInput } from './types'

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
  label: string
  required?: boolean
  placeholder?: string
}> = [
  { name: 'nomCommercial', label: 'Nom commercial', required: true, placeholder: 'Ex. Doliprane' },
  { name: 'dci', label: 'DCI', required: true, placeholder: 'Ex. Paracétamol' },
  { name: 'dosage', label: 'Dosage', placeholder: 'Ex. 500 mg' },
  { name: 'forme', label: 'Forme pharmaceutique', placeholder: 'Ex. Comprimé' },
  { name: 'presentation', label: 'Présentation', placeholder: 'Ex. Boîte de 16' },
  { name: 'classeTherapeutique', label: 'Classe thérapeutique', placeholder: 'Ex. Antalgique' },
  { name: 'codeAtc', label: 'Code ATC', placeholder: 'Ex. N02BE01' },
]

export function ProductForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel,
  documentsSlot,
  adminSlot,
}: ProductFormProps) {
  const form = useForm<ProductInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: defaultValues ?? EMPTY_PRODUCT,
  })

  const savePrompt = (
    <p className="text-muted-foreground text-sm">
      Enregistrez d'abord le produit (onglet Identification) pour ajouter des documents.
    </p>
  )

  return (
    <Form {...form}>
      <Tabs defaultValue="identification">
        <TabsList>
          <TabsTrigger value="identification">Identification</TabsTrigger>
          <TabsTrigger value="documents">Documents d'information</TabsTrigger>
          <TabsTrigger value="admin">Pièces administratives</TabsTrigger>
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
                        {f.label}
                        {f.required ? <span className="text-destructive"> *</span> : null}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={f.placeholder} {...field} value={field.value ?? ''} />
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
