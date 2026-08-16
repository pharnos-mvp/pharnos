// deno test — les gabarits de l'e-mail n°1 (C5). Module pur : aucun réseau, aucune base.
import { assertArrayIncludes, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

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
  ref: '8f3a2c10-4b6d-4e21-9c77-2a1b5e9d0f34',
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
  insertOrder: { data: { id: string } | null; error: { code?: string; message?: string; details?: string } | null }
  dejaLigne?: { id: string; notified_at: string | null; ref?: string | null } | null
  insertToken?: { error: { code?: string } | null }
  /** Second insert, quand une renaissance sans référence rejoue l'écriture. */
  insertOrder2?: { data: { id: string } | null; error: { code?: string } | null }
  majRefErreur?: { code?: string } | null
  /** Lignes touchées par le back-fill — `[]` simule une course perdue. */
  majRefTouchees?: { id: string }[]
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
          // Le second insert rejoue l'écriture sans référence (conflit `orders_ref_key`).
          const rep = ecrits.orders_insert.length === 1 || !sc.insertOrder2
            ? sc.insertOrder
            : sc.insertOrder2
          return {
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: rep.data, error: rep.error }),
            }),
          }
        },
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: sc.dejaLigne ?? null, error: null }),
          }),
        }),
        update(maj: unknown) {
          // ⚠️ Les FILTRES sont enregistrés, pas seulement la charge utile. Sans cela, retirer
          // `.is('ref', null)` — la seule protection contre la course au back-fill — ne faisait
          // échouer AUCUN test : mesuré par mutation du module.
          const filtres: string[] = []
          ecrits.orders_update.push({ maj, filtres })
          const chaine = {
            eq(colonne: string, _v: unknown) {
              filtres.push(`eq:${colonne}`)
              return Object.assign(Promise.resolve({ error: null }), chaine)
            },
            is(colonne: string, valeur: unknown) {
              filtres.push(`is:${colonne}=${valeur}`)
              return Object.assign(
                Promise.resolve({ data: sc.majRefTouchees ?? [{ id: 'ord-1' }], error: sc.majRefErreur ?? null }),
                { select: () => Promise.resolve({ data: sc.majRefTouchees ?? [{ id: 'ord-1' }], error: sc.majRefErreur ?? null }) },
              )
            },
          }
          return chaine
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
  assertEquals(r, {
    statut: 'nee',
    orderId: 'ord-1',
    mail: 'failed',
    renaissance: false,
    refPosee: VENTE.ref,
  })
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
    const maj = ecrits.orders_update[0] as { maj: { notified_at?: string } }
    assertEquals(typeof maj.maj.notified_at, 'string')
  } finally {
    globalThis.fetch = vraiFetch
    if (anciensEnv === undefined) Deno.env.delete('RESEND_API_KEY')
    else Deno.env.set('RESEND_API_KEY', anciensEnv)
  }
})

Deno.test('⚠️ naissance : la RÉFÉRENCE se remplit quand la réconciliation a gagné la course', async () => {
  // LA trajectoire du 14/08/2026, celle qui a coûté la vente : le Pulse n'arrive pas, le balayage
  // fait naître la commande SANS référence (il n'en a aucune), puis le Pulse arrive enfin. Sans ce
  // back-fill, sa référence était jetée et la salle d'attente restait aveugle — le défaut survivait
  // sur le chemin même où il avait mordu.
  const { sb, ecrits } = stubSb({
    insertOrder: { data: null, error: { code: '23505' } },
    dejaLigne: { id: 'ord-1', notified_at: '2026-08-14T02:20:00Z', ref: null },
  })
  const r = await faireNaitreCommande(sb, VENTE, LOG)
  assertEquals(r, { statut: 'rejeu' })
  // La référence est écrite, et RIEN d'autre : ni jeton, ni e-mail — la commande était déjà servie.
  assertEquals(ecrits.orders_update.length, 1)
  const maj = ecrits.orders_update[0] as { maj: unknown; filtres: string[] }
  assertEquals(maj.maj, { ref: VENTE.ref })
  // ⚠️ Le filtre EST la protection : le garde `!deja.ref` est une lecture, donc racée. C'est
  // `is('ref', null)` qui rend l'écriture sûre — un test qui ne l'exige pas laisse le retirer.
  assertArrayIncludes(maj.filtres, ['is:ref=null'])
  assertEquals(ecrits.tokens_insert.length, 0)
})

Deno.test('naissance : une commande qui a DÉJÀ une référence n’est jamais déplacée', async () => {
  // Remplir, jamais écraser : un Pulse tardif — ou forgé — ne doit pas pouvoir déplacer le pont
  // d'une commande établie vers une référence qu'il choisit.
  const { sb, ecrits } = stubSb({
    insertOrder: { data: null, error: { code: '23505' } },
    dejaLigne: {
      id: 'ord-1',
      notified_at: '2026-08-14T02:20:00Z',
      ref: '11111111-1111-4111-8111-111111111111',
    },
  })
  assertEquals(await faireNaitreCommande(sb, VENTE, LOG), { statut: 'rejeu' })
  assertEquals(ecrits.orders_update.length, 0)
})

Deno.test('⚠️ naissance : une RÉFÉRENCE déjà prise ne tue pas une vente réglée', async () => {
  // `orders.ref` est UNIQUE (`orders_ref_key`, 0083) : depuis que la référence voyage, cette
  // contrainte est armée. Deviner laquelle des deux a cédé ferait relire par `chariow_sale_id`,
  // ne rien trouver, rendre 503 — et Chariow rejouerait le même conflit cinq fois sur 24 h, pour
  // une vente PAYÉE. On renaît donc sans elle : le pont est perdu, la commande ne l'est pas.
  const { sb, ecrits } = stubSb({
    insertOrder: {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "orders_ref_key"' },
    },
    insertOrder2: { data: { id: 'ord-2' }, error: null },
  })
  const r = await faireNaitreCommande(sb, VENTE, LOG)
  assertEquals(r.statut, 'nee')
  assertEquals(ecrits.orders_insert.length, 2)
  // La seconde écriture est la même commande, sans sa référence.
  const seconde = ecrits.orders_insert[1] as { ref: string | null; chariow_sale_id: string }
  assertEquals(seconde.ref, null)
  assertEquals(seconde.chariow_sale_id, VENTE.saleId)
})
