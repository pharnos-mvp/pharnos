import { assertEquals } from 'jsr:@std/assert@1'

import { adresseReponse } from './mail.ts'

Deno.test('reply-to : sans configuration, on retombe sur une adresse RÉELLEMENT routée', () => {
  Deno.env.delete('EMAIL_REPLY_TO')
  assertEquals(adresseReponse(), 'contact@pharnos.com')
})

Deno.test('reply-to : la variable d’environnement prend la main', () => {
  Deno.env.set('EMAIL_REPLY_TO', 'support@pharnos.com')
  try {
    assertEquals(adresseReponse(), 'support@pharnos.com')
  } finally {
    Deno.env.delete('EMAIL_REPLY_TO')
  }
})

// ⚠️ Un secret posé À VIDE est le cas de panne classique. Un `Reply-To` vide serait refusé par
// Resend et ferait échouer l'envoi ENTIER — le défaut doit reprendre la main.
Deno.test('reply-to : une valeur vide ou blanche ne remplace rien', () => {
  for (const vide of ['', '   ']) {
    Deno.env.set('EMAIL_REPLY_TO', vide)
    try {
      assertEquals(adresseReponse(), 'contact@pharnos.com')
    } finally {
      Deno.env.delete('EMAIL_REPLY_TO')
    }
  }
})
