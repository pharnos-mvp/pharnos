import { useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'

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
import { DocTypeCards } from './DocTypeCards'
import { createProduct, updateProduct } from './repository'
import { syncProducts } from './sync'
import { makeProductSchema, type ProductFormValues, type ProductInput } from './types'

/** Champs « produit classique » (session 1, hors titulaire/fabricant qui ont leurs blocs appariés). */
const coreFields: ReadonlyArray<{
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
]

const STEPS: Translatable[] = [
  { fr: 'Identification', en: 'Identification' },
  { fr: "Documents d'information", en: 'Product information' },
  { fr: 'Pièces administratives', en: 'Administrative documents' },
]

/**
 * Wizard de création produit (3 sessions, style typeform). Session 1 = identification (+ blocs
 * Titulaire/Fabricant appariés) ; à « Suivant », le produit est créé → sessions 2 (documents
 * d'information) et 3 (pièces admin) attachent les pièces via des cartes par type.
 */
export function ProductWizard({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const { t } = useI18n()
  const schema = useMemo(() => makeProductSchema(t), [t])
  const form = useForm<ProductInput, unknown, ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nomCommercial: '',
      dci: '',
      dosage: '',
      forme: '',
      presentation: '',
      classeTherapeutique: '',
      codeAtc: '',
      titulaire: '',
      titulaireAdresse: '',
      fabricant: '',
      fabricantAdresse: '',
    },
    mode: 'onChange',
  })
  const [step, setStep] = useState(1)
  const [productId, setProductId] = useState<string | null>(null)
  const productIdRef = useRef<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Session 1 → persiste l'identification puis avance. Crée le produit (1ʳᵉ fois) ou le met à jour.
  async function nextFromStep1() {
    if (!(await form.trigger())) return
    const values = schema.parse(form.getValues())
    setSaving(true)
    try {
      if (productIdRef.current) {
        await updateProduct(productIdRef.current, values)
      } else {
        const rec = await createProduct(orgId, values)
        productIdRef.current = rec.id
        setProductId(rec.id)
      }
      void syncProducts(orgId)
      setStep(2)
    } catch (error) {
      toast.error(t({ fr: "Échec de l'enregistrement", en: 'Save failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stepper typeform */}
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1
          const done = step > n
          const active = step === n
          return (
            <li key={n} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  done
                    ? 'bg-success text-white'
                    : active
                      ? 'bg-info text-white'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="size-4" /> : n}
              </span>
              <span
                className={cn(
                  'truncate text-sm font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(label)}
              </span>
              {n < STEPS.length ? <span className="bg-border h-px flex-1" /> : null}
            </li>
          )
        })}
      </ol>

      {/* Session 1 — Identification */}
      {step === 1 ? (
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void nextFromStep1()
            }}
            className="space-y-5"
            noValidate
          >
            <Card className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {coreFields.map((f) => (
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
            </Card>

            {/* Blocs Titulaire d'AMM / Fabricant — appariés (nom + adresse), visuellement cohérents. */}
            <div className="grid gap-4 md:grid-cols-2">
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

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={saving}>
                {t({ fr: 'Suivant', en: 'Next' })} <ArrowRight />
              </Button>
            </div>
          </form>
        </Form>
      ) : null}

      {/* Session 2 — Documents d'information */}
      {step === 2 && productId ? (
        <>
          <DocTypeCards orgId={orgId} productId={productId} category="info" />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextLabel={t({ fr: 'Suivant', en: 'Next' })}
          />
        </>
      ) : null}

      {/* Session 3 — Pièces administratives */}
      {step === 3 && productId ? (
        <>
          <DocTypeCards orgId={orgId} productId={productId} category="admin" />
          <StepNav
            onBack={() => setStep(2)}
            onNext={onDone}
            nextLabel={t({ fr: 'Terminer', en: 'Finish' })}
            nextVariant="primary"
          />
        </>
      ) : null}
    </div>
  )
}

function OrgBlock({
  form,
  title,
  nameField,
  addressField,
}: {
  form: ReturnType<typeof useForm<ProductInput, unknown, ProductFormValues>>
  title: string
  nameField: 'titulaire' | 'fabricant'
  addressField: 'titulaireAdresse' | 'fabricantAdresse'
}) {
  const { t } = useI18n()
  return (
    <Card className="gap-4 p-5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <FormField
        control={form.control}
        name={nameField}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t({ fr: 'Nom', en: 'Name' })}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={addressField}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t({ fr: 'Adresse', en: 'Address' })}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Card>
  )
}

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextVariant = 'default',
}: {
  onBack: () => void
  onNext: () => void
  nextLabel: string
  nextVariant?: 'default' | 'primary'
}) {
  const { t } = useI18n()
  return (
    <div className="flex justify-between">
      <Button type="button" variant="outline" onClick={onBack}>
        <ArrowLeft /> {t({ fr: 'Précédent', en: 'Back' })}
      </Button>
      <Button type="button" variant={nextVariant} onClick={onNext}>
        {nextLabel} {nextVariant === 'primary' ? <Check /> : <ArrowRight />}
      </Button>
    </div>
  )
}
