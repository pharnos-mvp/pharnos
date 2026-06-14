import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useI18n, type I18nValue } from '@/lib/i18n-context'
import { createOrg } from './org-repository'

const makeOrgSchema = (t: I18nValue['t']) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, t({ fr: 'Au moins 2 caractères', en: 'At least 2 characters' }))
      .max(200),
  })
type OrgValues = z.infer<ReturnType<typeof makeOrgSchema>>

export function OnboardingPage({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const { t } = useI18n()
  const [submitting, setSubmitting] = useState(false)
  const schema = useMemo(() => makeOrgSchema(t), [t])
  const form = useForm<OrgValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  })

  // Re-traduit les messages de validation déjà affichés quand la langue bascule (revue L1).
  const { trigger, formState } = form
  useEffect(() => {
    if (Object.keys(formState.errors).length > 0) void trigger()
  }, [t, trigger, formState.errors])

  async function onSubmit(values: OrgValues) {
    setSubmitting(true)
    try {
      await createOrg(values.name)
      toast.success(t({ fr: 'Organisation créée', en: 'Organization created' }))
      await onCreated()
    } catch (error) {
      toast.error(t({ fr: 'Échec de la création', en: 'Creation failed' }), {
        description:
          error instanceof Error
            ? error.message
            : t({ fr: 'Erreur inconnue', en: 'Unknown error' }),
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {t({ fr: 'Créer votre organisation', en: 'Create your organization' })}
          </CardTitle>
          <CardDescription>
            {t({
              fr: "Laboratoire, agence ou cabinet d'affaires réglementaires.",
              en: 'Laboratory, agency or regulatory affairs firm.',
            })}
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t({ fr: "Nom de l'organisation", en: 'Organization name' })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t({
                          fr: 'Ex. Laboratoire Sahel Pharma',
                          en: 'E.g. Sahel Pharma Laboratory',
                        })}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={submitting}>
                {t({ fr: "Créer l'organisation", en: 'Create organization' })}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
