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
import { updatePassword } from '@/features/account/account-repository'
import { useAuth } from './auth-context'

const resetSchema = z
  .object({
    password: z.string().min(8, 'Au moins 8 caractères'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  })
type ResetValues = z.infer<typeof resetSchema>

/**
 * Écran « définir un nouveau mot de passe », rendu par `AppGate` quand l'utilisateur
 * arrive via un lien de récupération (session temporaire `PASSWORD_RECOVERY`).
 * Une fois le mot de passe enregistré, on quitte le mode récupération et la session
 * normale prend le relais → l'app s'affiche.
 */
export function ResetPasswordPage() {
  const { clearRecovery } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  })

  async function onSubmit(values: ResetValues) {
    setSubmitting(true)
    try {
      await updatePassword(values.password)
      toast.success('Mot de passe mis à jour')
      clearRecovery()
    } catch (error) {
      toast.error('Échec', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nouveau mot de passe</CardTitle>
          <CardDescription>Choisissez un nouveau mot de passe pour votre compte.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nouveau mot de passe</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmer le mot de passe</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={submitting}>
                Enregistrer le mot de passe
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
