// deno test — les gabarits de l'e-mail n°1 (C5). Module pur : aucun réseau, aucune base.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import { htmlEmailCommande, texteEmailCommande } from './order-birth.ts'
import type { VenteVerifiee } from './orders-core.ts'

const VENTE: VenteVerifiee = {
  saleId: 'SALEX5MD9EZOYKITEPM',
  offre: 'up1',
  essai: false,
  amountMinor: 19000,
  currency: 'FCFA',
  email: 'acheteur@example.com',
  firstName: 'Awa',
  lastName: 'K.',
  ref: 'ref-123',
  lang: 'fr',
  paymentMethod: 'Carte bancaire',
  invoiceUrl: 'https://chariow.example/invoice/abc',
}

const LIEN = 'https://app.pharnos.com/u/jeton-test'

Deno.test('e-mail n°1 : la partie TEXTE porte tout ce que le HTML promet (C5)', () => {
  const txt = texteEmailCommande(VENTE, LIEN)
  // Le lien de livraison — l'accès à la commande — doit exister en texte seul.
  assertStringIncludes(txt, LIEN)
  // Le reçu : montant, référence, identité AASK (l'IFU doit figurer sur toute quittance).
  assertStringIncludes(txt, '19')
  assertStringIncludes(txt, 'SALEX5MD9EZOYKITEPM')
  assertStringIncludes(txt, 'IFU 3202113643386')
  // Les e-mails tiers ABSORBÉS : le relevé dit « MiMo Global », la clé de licence est expliquée.
  assertStringIncludes(txt, 'MiMo Global')
  assertStringIncludes(txt, 'clé de licence')
  // La facture DURABLE : la page de suivi est nommée comme chemin pérenne.
  assertStringIncludes(txt, 'page de suivi')
})

Deno.test('e-mail n°1 : le HTML porte les mêmes clauses — licence, MiMo, facture périssable dite', () => {
  const html = htmlEmailCommande(VENTE, LIEN)
  assertStringIncludes(html, LIEN)
  assertStringIncludes(html, 'MiMo Global')
  assertStringIncludes(html, 'clé de licence')
  // Le lien direct Chariow reste (il sert tout de suite) mais son expiration est DITE.
  assertStringIncludes(html, 'https://chariow.example/invoice/abc')
  assertStringIncludes(html, 'expire')
  assertStringIncludes(html, 'IFU 3202113643386')
})

Deno.test('e-mail n°1 : la version anglaise est complète, et une vente sans facture se tait sans mentir', () => {
  const venteEn: VenteVerifiee = { ...VENTE, lang: 'en', invoiceUrl: null, paymentMethod: null }
  const txt = texteEmailCommande(venteEn, LIEN)
  assertStringIncludes(txt, LIEN)
  assertStringIncludes(txt, 'MiMo Global')
  assertStringIncludes(txt, 'licence key')
  const html = htmlEmailCommande(venteEn, LIEN)
  // Sans facture : le chemin durable est nommé, aucun lien mort n'est promis.
  assertEquals(html.includes('chariow.example'), false)
  assertStringIncludes(html, 'tracking page')
})

/* ────────────────────── La machine à états de la naissance — le cœur du rail ─────────────────
 *
 * `faireNaitreCommande` est LE chemin partagé webhook/réconciliation : c'est précisément parce
 * qu'il est unique que ses cinq branches doivent être épinglées — une dérive d'idempotence ne se
 * verrait qu'à la vente réelle. Client Supabase FACTICE : chaque scénario déclare ce que la base
 * répond, le test vérifie ce qui a été écrit. */

import { faireNaitreCommande } from './order-birth.ts'

interface Scenario {
  insertOrder: { data: { id: string } | null; error: { code?: string } | null }
  dejaLigne?: { id: string; notified_at: string | null } | null
  insertToken?: { error: { code?: string } | null }
}

function stubSb(sc: Scenario) {
  const ecrits: Record<string, unknown[]> = { orders_insert: [], tokens_insert: [], orders_update: [] }
  const sb = {
    from(table: string) {
      return {
        insert(ligne: unknown) {
          if (table === 'order_tokens') {
            ecrits.tokens_insert.push(ligne)
            return Promise.resolve({ error: sc.insertToken?.error ?? null })
          }
          ecrits.orders_insert.push(ligne)
          return {
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: sc.insertOrder.data, error: sc.insertOrder.error }),
            }),
          }
        },
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: sc.dejaLigne ?? null, error: null }),
          }),
        }),
        update(maj: unknown) {
          ecrits.orders_update.push(maj)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
    },
  }
  // deno-lint-ignore no-explicit-any
  return { sb: sb as any, ecrits }
}

const LOG = { fn: 'test' }

Deno.test('naissance : le cas nominal crée la commande, frappe UN jeton, tente l’e-mail', async () => {
  const { sb, ecrits } = stubSb({ insertOrder: { data: { id: 'ord-1' }, error: null } })
  const r = await faireNaitreCommande(sb, VENTE, LOG)
  // Sans RESEND_API_KEY (environnement de test), l'envoi échoue proprement : la commande, elle,
  // EXISTE — et `notified_at` reste nul pour que le rejeu retente.
  assertEquals(r, { statut: 'nee', orderId: 'ord-1', mail: 'failed', renaissance: false })
  assertEquals(ecrits.orders_insert.length, 1)
  assertEquals(ecrits.tokens_insert.length, 1)
  assertEquals(ecrits.orders_update.length, 0)
  const jeton = ecrits.tokens_insert[0] as { source: string; order_id: string }
  assertEquals(jeton.source, 'email')
  assertEquals(jeton.order_id, 'ord-1')
})

Deno.test('naissance : le REJEU (23505 + e-mail parti) ne crée rien et ne renvoie rien', async () => {
  const { sb, ecrits } = stubSb({
    insertOrder: { data: null, error: { code: '23505' } },
    dejaLigne: { id: 'ord-1', notified_at: '2026-08-14T02:20:00Z' },
  })
  const r = await faireNaitreCommande(sb, VENTE, LOG)
  assertEquals(r, { statut: 'rejeu' })
  assertEquals(ecrits.tokens_insert.length, 0)
})

Deno.test('naissance : 23505 + e-mail JAMAIS parti = renaissance — nouveau jeton, nouvel essai', async () => {
  // C'est CE chemin qui rend l'e-mail n°1 fiable à travers les cinq rejeux Chariow — et c'est lui
  // que la réconciliation emprunte pour réveiller une commande née pendant une panne Resend.
  const { sb, ecrits } = stubSb({
    insertOrder: { data: null, error: { code: '23505' } },
    dejaLigne: { id: 'ord-1', notified_at: null },
  })
  const r = await faireNaitreCommande(sb, VENTE, LOG)
  assertEquals(r.statut, 'nee')
  if (r.statut === 'nee') {
    assertEquals(r.renaissance, true)
    assertEquals(r.orderId, 'ord-1')
  }
  assertEquals(ecrits.tokens_insert.length, 1)
})

Deno.test('naissance : une VRAIE panne d’écriture remonte en erreur — l’appelant décide du rejeu', async () => {
  const { sb } = stubSb({ insertOrder: { data: null, error: { code: '57014' } } })
  assertEquals(await faireNaitreCommande(sb, VENTE, LOG), { statut: 'erreur' })
  // Et un conflit SANS ligne retrouvée (course improbable) est une erreur aussi, jamais un rejeu.
  const { sb: sb2 } = stubSb({
    insertOrder: { data: null, error: { code: '23505' } },
    dejaLigne: null,
  })
  assertEquals(await faireNaitreCommande(sb2, VENTE, LOG), { statut: 'erreur' })
})

Deno.test('naissance : un jeton refusé fait tout échouer — jamais un e-mail au lien mort', async () => {
  const { sb } = stubSb({
    insertOrder: { data: { id: 'ord-1' }, error: null },
    insertToken: { error: { code: '23514' } },
  })
  assertEquals(await faireNaitreCommande(sb, VENTE, LOG), { statut: 'erreur' })
})

Deno.test('naissance : quand l’e-mail PART, notified_at est posé — le rejeu suivant se tait', async () => {
  // Resend est bouchonné : l'envoi « réussit » sans réseau.
  const vraiFetch = globalThis.fetch
  const anciensEnv = Deno.env.get('RESEND_API_KEY')
  Deno.env.set('RESEND_API_KEY', 're_test')
  globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 200 }))
  try {
    const { sb, ecrits } = stubSb({ insertOrder: { data: { id: 'ord-1' }, error: null } })
    const r = await faireNaitreCommande(sb, VENTE, LOG)
    assertEquals(r.statut === 'nee' && r.mail, 'sent')
    assertEquals(ecrits.orders_update.length, 1)
    const maj = ecrits.orders_update[0] as { notified_at?: string }
    assertEquals(typeof maj.notified_at, 'string')
  } finally {
    globalThis.fetch = vraiFetch
    if (anciensEnv === undefined) Deno.env.delete('RESEND_API_KEY')
    else Deno.env.set('RESEND_API_KEY', anciensEnv)
  }
})
