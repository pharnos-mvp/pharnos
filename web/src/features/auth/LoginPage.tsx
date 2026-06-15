import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'
import { requestPasswordReset, resendSignupConfirmation } from './auth-repository'

type Credentials = { email: string; password: string }
type Mode = 'login' | 'signup' | 'reset-request'

const TITLES: Record<Mode, Translatable> = {
  login: { fr: 'Connexion à Pharnos', en: 'Sign in to Pharnos' },
  signup: { fr: 'Créer un compte', en: 'Create an account' },
  'reset-request': { fr: 'Réinitialiser le mot de passe', en: 'Reset your password' },
}
const DESCRIPTIONS: Record<Mode, Translatable> = {
  login: {
    fr: 'Affaires réglementaires pharmaceutiques UEMOA/CEDEAO',
    en: 'Pharmaceutical regulatory affairs WAEMU/ECOWAS',
  },
  signup: {
    fr: 'Affaires réglementaires pharmaceutiques UEMOA/CEDEAO',
    en: 'Pharmaceutical regulatory affairs WAEMU/ECOWAS',
  },
  'reset-request': {
    fr: 'Saisissez votre adresse pour recevoir un lien de réinitialisation.',
    en: 'Enter your email to receive a reset link.',
  },
}

export function LoginPage() {
  const { t, lang } = useI18n()
  const [mode, setMode] = useState<Mode>('login')
  const [submitting, setSubmitting] = useState(false)
  // Adresse en attente de confirmation après inscription → affiche l'option « renvoyer ».
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)

  // Schéma recréé avec la langue courante → messages de validation localisés.
  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .email(t({ fr: 'Email invalide', en: 'Invalid email' })),
        password: z
          .string()
          .min(8, t({ fr: 'Au moins 8 caractères', en: 'At least 8 characters' })),
      }),
    [t],
  )
  const form = useForm<Credentials>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  // Re-traduit à chaud les messages de validation DÉJÀ affichés quand la langue change
  // (RHF ne relance pas le resolver sur simple changement de langue).
  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) void form.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  async function onSubmit(values: Credentials) {
    setSubmitting(true)
    const supabase = await getSupabase()
    if (!supabase) {
      setSubmitting(false)
      return
    }
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword(values)
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp(values)
        if (error) throw error
        if (!data.session) setPendingEmail(values.email)
      }
    } catch (error) {
      toast.error(t({ fr: 'Échec', en: 'Failed' }), {
        description:
          error instanceof Error
            ? error.message
            : t({ fr: 'Erreur inconnue', en: 'Unknown error' }),
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Réinitialisation : on ne valide que l'e-mail (le champ mot de passe est masqué).
  async function onResetRequest(event: FormEvent) {
    event.preventDefault()
    if (!(await form.trigger('email'))) return
    setSubmitting(true)
    try {
      await requestPasswordReset(form.getValues('email'))
      toast.success(t({ fr: 'E-mail envoyé', en: 'Email sent' }), {
        description: t({
          fr: 'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.',
          en: 'If an account exists for this address, a reset link has been sent.',
        }),
      })
      switchMode('login')
    } catch (error) {
      toast.error(t({ fr: 'Échec', en: 'Failed' }), {
        description:
          error instanceof Error
            ? error.message
            : t({ fr: 'Erreur inconnue', en: 'Unknown error' }),
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onResend() {
    if (!pendingEmail) return
    setSubmitting(true)
    try {
      await resendSignupConfirmation(pendingEmail)
      toast.success(t({ fr: 'E-mail renvoyé', en: 'Email resent' }), {
        description: t({ fr: 'Vérifiez votre boîte mail.', en: 'Check your inbox.' }),
      })
    } catch (error) {
      toast.error(t({ fr: 'Échec', en: 'Failed' }), {
        description:
          error instanceof Error
            ? error.message
            : t({ fr: 'Erreur inconnue', en: 'Unknown error' }),
      })
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setPendingEmail(null)
    form.clearErrors()
  }

  // Après inscription : confirmer l'adresse, avec possibilité de renvoyer l'e-mail.
  if (pendingEmail) {
    return (
      <div className="bg-background relative flex min-h-svh items-center justify-center p-4">
        <div className="absolute top-4 right-4">
          <LangSwitch />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t({ fr: 'Confirmez votre adresse', en: 'Confirm your email' })}</CardTitle>
            <CardDescription>
              {t({
                fr: 'Un e-mail de confirmation a été envoyé à',
                en: 'A confirmation email has been sent to',
              })}{' '}
              <strong>{pendingEmail}</strong>.{' '}
              {t({
                fr: 'Cliquez sur le lien pour activer votre compte.',
                en: 'Click the link to activate your account.',
              })}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-3">
            <Button type="button" className="w-full" disabled={submitting} onClick={onResend}>
              {t({ fr: "Renvoyer l'e-mail de confirmation", en: 'Resend confirmation email' })}
            </Button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-sm"
              onClick={() => switchMode('login')}
            >
              {t({ fr: 'Retour à la connexion', en: 'Back to sign in' })}
            </button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="bg-background relative flex min-h-svh items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LangSwitch />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-md font-bold">
            P
          </div>
          <CardTitle>{t(TITLES[mode])}</CardTitle>
          <CardDescription>{t(DESCRIPTIONS[mode])}</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={mode === 'reset-request' ? onResetRequest : form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t({ fr: 'Email', en: 'Email' })}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder={t({ fr: 'vous@laboratoire.com', en: 'you@lab.com' })}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {mode !== 'reset-request' && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t({ fr: 'Mot de passe', en: 'Password' })}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
            <CardFooter className="flex-col gap-3 pt-6">
              <Button type="submit" className="w-full" disabled={submitting}>
                {mode === 'login'
                  ? t({ fr: 'Se connecter', en: 'Sign in' })
                  : mode === 'signup'
                    ? t({ fr: 'Créer le compte', en: 'Create account' })
                    : t({ fr: 'Envoyer le lien', en: 'Send link' })}
              </Button>
              {mode === 'login' && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-sm"
                  onClick={() => switchMode('reset-request')}
                >
                  {t({ fr: 'Mot de passe oublié ?', en: 'Forgot password?' })}
                </button>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-sm"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'login'
                  ? t({
                      fr: 'Pas encore de compte ? Créer un compte',
                      en: 'No account yet? Create one',
                    })
                  : mode === 'signup'
                    ? t({
                        fr: 'Déjà un compte ? Se connecter',
                        en: 'Already have an account? Sign in',
                      })
                    : t({ fr: 'Retour à la connexion', en: 'Back to sign in' })}
              </button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
