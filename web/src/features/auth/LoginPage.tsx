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
import { getSupabase } from '@/lib/supabase'

const credentialsSchema = z.object({
  email: z.string().trim().email('Email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
})
type Credentials = z.infer<typeof credentialsSchema>

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [submitting, setSubmitting] = useState(false)
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
        if (!data.session) {
          toast.success('Compte créé', {
            description: 'Vérifie ta boîte mail pour confirmer ton adresse.',
          })
        }
      }
    } catch (error) {
      toast.error('Échec', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-md font-bold">
            P
          </div>
          <CardTitle>{mode === 'login' ? 'Connexion à Pharnos' : 'Créer un compte'}</CardTitle>
          <CardDescription>Affaires réglementaires pharmaceutiques UEMOA/CEDEAO</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
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
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" className="w-full" disabled={submitting}>
                {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
              </Button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-sm"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'login'
                  ? 'Pas encore de compte ? Créer un compte'
                  : 'Déjà un compte ? Se connecter'}
              </button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
