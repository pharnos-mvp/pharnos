import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { LangSwitch } from '@/components/layout/LangSwitch'
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
import { useI18n } from '@/lib/i18n-context'
import { useAuth } from './auth-context'

type ResetValues = { password: string; confirm: string }

/**
 * Écran « définir un nouveau mot de passe », rendu par `AppGate` quand l'utilisateur
 * arrive via un lien de récupération (session temporaire `PASSWORD_RECOVERY`).
 * Une fois le mot de passe enregistré, on quitte le mode récupération et la session
 * normale prend le relais → l'app s'affiche.
 */
export function ResetPasswordPage() {
  const { t, lang } = useI18n()
  const { clearRecovery } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const resetSchema = useMemo(
    () =>
      z
        .object({
          password: z
            .string()
            .min(8, t({ fr: 'Au moins 8 caractères', en: 'At least 8 characters' })),
          confirm: z.string(),
        })
        .refine((values) => values.password === values.confirm, {
          message: t({
            fr: 'Les mots de passe ne correspondent pas',
            en: 'Passwords do not match',
          }),
          path: ['confirm'],
        }),
    [t],
  )
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  })

  // Re-traduit à chaud les messages de validation DÉJÀ affichés quand la langue change.
  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) void form.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  async function onSubmit(values: ResetValues) {
    setSubmitting(true)
    try {
      await updatePassword(values.password)
      toast.success(t({ fr: 'Mot de passe mis à jour', en: 'Password updated' }))
      clearRecovery()
    } catch (error) {
      toast.error(t({ fr: 'Échec', en: 'Failed' }), {
        description:
          error instanceof Error
            ? error.message
            : t({ fr: 'Erreur inconnue', en: 'Unknown error' }),
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-background relative flex min-h-svh items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LangSwitch />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t({ fr: 'Nouveau mot de passe', en: 'New password' })}</CardTitle>
          <CardDescription>
            {t({
              fr: 'Choisissez un nouveau mot de passe pour votre compte.',
              en: 'Choose a new password for your account.',
            })}
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t({ fr: 'Nouveau mot de passe', en: 'New password' })}</FormLabel>
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
                    <FormLabel>
                      {t({ fr: 'Confirmer le mot de passe', en: 'Confirm password' })}
                    </FormLabel>
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
                {t({ fr: 'Enregistrer le mot de passe', en: 'Save password' })}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
