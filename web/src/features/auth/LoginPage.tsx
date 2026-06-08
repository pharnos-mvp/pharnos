import { useState, type FormEvent } from 'react'
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
import { getSupabase } from '@/lib/supabase'
import { requestPasswordReset, resendSignupConfirmation } from './auth-repository'

const credentialsSchema = z.object({
  email: z.string().trim().email('Email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
})
type Credentials = z.infer<typeof credentialsSchema>

type Mode = 'login' | 'signup' | 'reset-request'

const TITLES: Record<Mode, string> = {
  login: 'Connexion à Pharnos',
  signup: 'Créer un compte',
  'reset-request': 'Réinitialiser le mot de passe',
}
const DESCRIPTIONS: Record<Mode, string> = {
  login: 'Affaires réglementaires pharmaceutiques UEMOA/CEDEAO',
  signup: 'Affaires réglementaires pharmaceutiques UEMOA/CEDEAO',
  'reset-request': 'Saisissez votre adresse pour recevoir un lien de réinitialisation.',
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [submitting, setSubmitting] = useState(false)
  // Adresse en attente de confirmation après inscription → affiche l'option « renvoyer ».
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  })

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
      toast.error('Échec', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
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
      toast.success('E-mail envoyé', {
        description:
          'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.',
      })
      switchMode('login')
    } catch (error) {
      toast.error('Échec', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
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
      toast.success('E-mail renvoyé', { description: 'Vérifiez votre boîte mail.' })
    } catch (error) {
      toast.error('Échec', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
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
      <div className="bg-background flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Confirmez votre adresse</CardTitle>
            <CardDescription>
              Un e-mail de confirmation a été envoyé à <strong>{pendingEmail}</strong>. Cliquez sur
              le lien pour activer votre compte.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-3">
            <Button type="button" className="w-full" disabled={submitting} onClick={onResend}>
              Renvoyer l'e-mail de confirmation
            </Button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-sm"
              onClick={() => switchMode('login')}
            >
              Retour à la connexion
            </button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-md font-bold">
            P
          </div>
          <CardTitle>{TITLES[mode]}</CardTitle>
          <CardDescription>{DESCRIPTIONS[mode]}</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={mode === 'reset-request' ? onResetRequest : form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="vous@laboratoire.com"
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
                      <FormLabel>Mot de passe</FormLabel>
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
            <CardFooter className="flex-col gap-3">
              <Button type="submit" className="w-full" disabled={submitting}>
                {mode === 'login'
                  ? 'Se connecter'
                  : mode === 'signup'
                    ? 'Créer le compte'
                    : 'Envoyer le lien'}
              </Button>
              {mode === 'login' && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-sm"
                  onClick={() => switchMode('reset-request')}
                >
                  Mot de passe oublié ?
                </button>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-sm"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'login'
                  ? 'Pas encore de compte ? Créer un compte'
                  : mode === 'signup'
                    ? 'Déjà un compte ? Se connecter'
                    : 'Retour à la connexion'}
              </button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
