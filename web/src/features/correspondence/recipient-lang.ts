import type { Lang } from '@/lib/i18n-context'

/**
 * Langue par défaut d'un DESTINATAIRE d'après le pays cible du dossier (Slice 1b).
 *
 * MIROIR CONTRACTUEL de `COUNTRY_OFFICIAL_LANG` / `officialLang` du cœur Edge
 * (`supabase/functions/_shared/lifecycle-reminders-core.ts`) : le cron y retombe quand aucune
 * langue n'est stockée (`recipient_lang` null). Ici, l'UI d'envoi (`ShareDialog`) et la section
 * « Destinataires » de la page Relances proposent le MÊME défaut, pour que le choix affiché
 * coïncide avec ce que le serveur appliquerait par défaut. Toute évolution de la carte doit être
 * répercutée des deux côtés (les Edge Functions ne peuvent pas importer `web/src`).
 *
 * L'app ne gère que FR/EN → la Guinée-Bissau (lusophone) replie sur FR, comme le cœur Edge.
 */
export const COUNTRY_OFFICIAL_LANG: Readonly<Record<string, Lang>> = Object.freeze({
  BJ: 'fr',
  BF: 'fr',
  CI: 'fr',
  GW: 'fr',
  ML: 'fr',
  NE: 'fr',
  SN: 'fr',
  TG: 'fr',
  NG: 'en',
  GH: 'en',
})

/** Langue par défaut du destinataire selon le pays (code ISO alpha-2) ; repli FR. */
export function officialLang(country: string): Lang {
  return COUNTRY_OFFICIAL_LANG[country] ?? 'fr'
}
