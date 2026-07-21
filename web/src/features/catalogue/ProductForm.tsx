import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

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
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { FormeControl, OrgBlock, PghtField } from './product-fields'
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
  /** Édition cockpit : bouton « Annuler » DANS l'en-tête (à côté d'Enregistrer) — pas de rangée
   *  séparée au-dessus qui décalerait le formulaire vers le bas. */
  onCancel?: () => void
}

const identificationFields: ReadonlyArray<{
  // Champs texte uniquement (le PGHT — un tableau — a son propre composant, hors de cette grille).
  name: Exclude<keyof ProductFormValues, 'pght'>
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
  // Titulaire / Fabricant ne sont PAS des champs plats ici : rendus en blocs appariés `OrgBlock`
  // (identiques au wizard de création) sous le PGHT.
]

/**
 * Formulaire d'édition de l'identification produit (cockpit). Une seule carte « Identification » :
 * champs + PGHT + blocs Titulaire/Fabricant, avec Annuler/Enregistrer dans l'en-tête. Les documents
 * ne sont PAS gérés ici — ils ont leur onglet dédié (« Documents ») sur la fiche produit.
 */
export function ProductForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel,
  onCancel,
}: ProductFormProps) {
  const { t } = useI18n()
  const schema = useMemo(() => makeProductSchema(t), [t])
  const form = useForm<ProductInput, unknown, ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? EMPTY_PRODUCT,
    mode: 'onChange',
  })

  // Re-traduit à chaud les messages de validation déjà affichés quand la langue change.
  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) void form.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <span className="font-semibold tracking-tight">
              {t({ fr: 'Identification', en: 'Identification' })}
            </span>
            <div className="flex items-center gap-2">
              {onCancel ? (
                <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                  {t({ fr: 'Annuler', en: 'Cancel' })}
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={submitting}>
                {submitLabel}
              </Button>
            </div>
          </div>
          <div className="border-t px-5 py-5">
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
                        {f.name === 'forme' ? (
                          <FormeControl
                            value={field.value ?? ''}
                            onChange={(v) => field.onChange(v)}
                            placeholder={f.placeholder ? t(f.placeholder) : undefined}
                          />
                        ) : (
                          <Input
                            placeholder={f.placeholder ? t(f.placeholder) : undefined}
                            {...field}
                            value={field.value ?? ''}
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            {/* PGHT — table de prix multi-pays (après Code ATC). */}
            <div className="mt-5 border-t pt-5">
              <FormField
                control={form.control}
                name="pght"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <PghtField value={field.value ?? []} onChange={(v) => field.onChange(v)} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            {/* Titulaire d'AMM / Fabricant — blocs appariés, IDENTIQUES au wizard de création. */}
            <div className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-2">
              <OrgBlock
                form={form}
                title={t({ fr: "Titulaire d'AMM", en: 'MA holder' })}
                nameField="titulaire"
                addressField="titulaireAdresse"
              />
              <OrgBlock
                form={form}
                title={t({ fr: 'Fabricant', en: 'Manufacturer' })}
                nameField="fabricant"
                addressField="fabricantAdresse"
              />
            </div>
          </div>
        </Card>
      </form>
    </Form>
  )
}
