import { useMemo, useState } from 'react'
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
import { DocTypeCards, type DraftDocument } from './DocTypeCards'
import { addDocument } from './documents-repository'
import { syncDocuments } from './documents-sync'
import { createProduct } from './repository'
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
  const [saving, setSaving] = useState(false)
  // L'utilisateur a tenté d'enregistrer / a sauté l'identification incomplète → session 1 en rouge.
  const [attempted, setAttempted] = useState(false)
  // Pièces AJOUTÉES sans produit (buffer) — persistées seulement à l'enregistrement. L'ajout de
  // documents ne dépend donc d'AUCUN champ ; seul « Terminer » exige l'identification.
  const [drafts, setDrafts] = useState<DraftDocument[]>([])
  const isValidStep1 = form.formState.isValid // live (mode onChange) → pilote l'état du stepper

  // Navigation LIBRE entre sessions (clic sur les titres). Sauter la session 1 invalide la marque
  // en rouge, mais n'empêche jamais d'ajouter des pièces aux sessions suivantes.
  function goToStep(n: number) {
    if (n === step) return
    if (step === 1 && n !== 1) setAttempted(!isValidStep1)
    setStep(n)
  }

  // « Terminer » = SEUL moment subordonné aux champs requis : refuse tant que l'identification
  // n'est pas valide ; sinon crée le produit puis persiste toutes les pièces bufferisées.
  async function finish() {
    if (!(await form.trigger())) {
      setAttempted(true)
      setStep(1)
      toast.error(
        t({
          fr: "Complétez les champs requis de l'Identification avant d'enregistrer.",
          en: 'Fill the required Identification fields before saving.',
        }),
      )
      return
    }
    setSaving(true)
    try {
      const rec = await createProduct(orgId, schema.parse(form.getValues()))
      for (const d of drafts) {
        await addDocument(orgId, rec.id, {
          category: d.category,
          docType: d.docType,
          file: d.file,
          language: 'fr',
          issueDate: d.issueDate,
          expiryDate: d.expiryDate,
          reference: d.reference,
          holder: d.holder,
          country: d.country,
          batchNumber: d.batchNumber,
        })
      }
      void syncProducts(orgId)
      void syncDocuments(orgId)
      onDone()
    } catch (error) {
      toast.error(t({ fr: "Échec de l'enregistrement", en: 'Save failed' }), {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const addDraft = (d: DraftDocument) => setDrafts((list) => [...list, d])
  const removeDraft = (id: string) => setDrafts((list) => list.filter((x) => x.id !== id))

  const stepState = (n: number): 'done' | 'active' | 'error' | 'todo' => {
    if (n === 1) {
      if (isValidStep1) return step === 1 ? 'active' : 'done'
      if (attempted) return 'error'
      return step === 1 ? 'active' : 'todo'
    }
    return step === n ? 'active' : step > n ? 'done' : 'todo'
  }

  return (
    <div className="space-y-6">
      {/* Stepper typeform — titres CLIQUABLES (navigation libre). */}
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1
          const state = stepState(n)
          return (
            <li key={n} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => void goToStep(n)}
                aria-current={state === 'active' ? 'step' : undefined}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    state === 'done'
                      ? 'bg-success text-white'
                      : state === 'active'
                        ? 'bg-info text-white'
                        : state === 'error'
                          ? 'bg-danger text-white'
                          : 'bg-muted text-muted-foreground',
                  )}
                >
                  {state === 'done' ? <Check className="size-4" /> : state === 'error' ? '!' : n}
                </span>
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    state === 'active'
                      ? 'text-foreground'
                      : state === 'error'
                        ? 'text-danger'
                        : 'text-muted-foreground',
                  )}
                >
                  {t(label)}
                </span>
              </button>
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
              void goToStep(2)
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

      {/* Session 2 — Documents d'information (ajout LIBRE, bufferisé) */}
      {step === 2 ? (
        <>
          <DocTypeCards category="info" drafts={drafts} onAdd={addDraft} onRemove={removeDraft} />
          <StepNav
            onBack={() => goToStep(1)}
            onNext={() => goToStep(3)}
            nextLabel={t({ fr: 'Suivant', en: 'Next' })}
          />
        </>
      ) : null}

      {/* Session 3 — Pièces administratives (ajout LIBRE, bufferisé) */}
      {step === 3 ? (
        <>
          <DocTypeCards category="admin" drafts={drafts} onAdd={addDraft} onRemove={removeDraft} />
          <StepNav
            onBack={() => goToStep(2)}
            onNext={() => void finish()}
            nextLabel={t({ fr: 'Terminer', en: 'Finish' })}
            finish
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
  finish = false,
}: {
  onBack: () => void
  onNext: () => void
  nextLabel: string
  /** Dernière session : bouton « Terminer » (icône Check) plutôt que « Suivant » (flèche). */
  finish?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex justify-between">
      <Button type="button" variant="outline" onClick={onBack}>
        <ArrowLeft /> {t({ fr: 'Précédent', en: 'Back' })}
      </Button>
      {/* CTA d'avancement = bleu DA (variant primary), jamais le bouton neutre noir. */}
      <Button type="button" variant="primary" onClick={onNext}>
        {nextLabel} {finish ? <Check /> : <ArrowRight />}
      </Button>
    </div>
  )
}
