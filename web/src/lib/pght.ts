import type { PghtEntry } from '@/lib/db'
import type { Lang } from '@/lib/i18n-context'
import { eurToXof, formatMoney, parseAmount } from '@/lib/money'

/**
 * Résout le PGHT d'un produit pour UN pays → montant FCFA formaté (string), sinon `''`.
 *
 * La « Lettre de PGHT » du CTD Builder est MONO-PAYS (le dossier cible un pays) et libellée en FCFA
 * (devise réglementaire UEMOA) : un montant saisi en euros est converti à la parité fixe BCEAO, un
 * montant déjà en FCFA est repris tel quel. `''` si le pays n'a pas de prix ou si le montant est
 * invalide → le template garde alors son marqueur éditable `[…]` (comportement inchangé).
 */
export function pghtFcfaForCountry(
  entries: PghtEntry[] | undefined,
  country: string,
  lang: Lang = 'fr',
): string {
  const entry = entries?.find((e) => e.country === country)
  if (!entry) return ''
  const n = parseAmount(entry.amount)
  if (n === null) return ''
  return formatMoney(entry.currency === 'EUR' ? eurToXof(n) : n, lang)
}
