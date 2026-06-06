import { useState } from 'react'
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
import { createOrg } from './org-repository'

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Au moins 2 caractères').max(200),
})
type OrgValues = z.infer<typeof orgSchema>

export function OnboardingPage({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: '' },
  })

  async function onSubmit(values: OrgValues) {
    setSubmitting(true)
    try {
      await createOrg(values.name)
      toast.success('Organisation créée')
      await onCreated()
    } catch (error) {
      toast.error('Échec de la création', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Créer votre organisation</CardTitle>
          <CardDescription>
            Laboratoire, agence ou cabinet d'affaires réglementaires.
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
                    <FormLabel>Nom de l'organisation</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex. Laboratoire Sahel Pharma" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={submitting}>
                Créer l'organisation
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
