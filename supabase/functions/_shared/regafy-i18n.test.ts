// deno test — localisation des constats Regafy (P0-2). Verrouille (a) la PARITÉ FR : les chaînes
// rendues sont identiques au comportement historique (aucune régression sous UI FR) ; (b) la
// sortie EN ; (c) la robustesse de `asLocale` (entrée non fiable du client).
import { assert, assertEquals } from 'jsr:@std/assert@1'

import { asLocale, langName, regafyMessages, respondIn } from './regafy-i18n.ts'

Deno.test('asLocale : seul « en » donne en, tout le reste retombe sur fr (fail-safe)', () => {
  assertEquals(asLocale('en'), 'en')
  assertEquals(asLocale('fr'), 'fr')
  assertEquals(asLocale(undefined), 'fr')
  assertEquals(asLocale('EN'), 'fr') // strict : pas de normalisation de casse côté Edge
  assertEquals(asLocale('de'), 'fr')
  assertEquals(asLocale(42), 'fr')
})

Deno.test('langName : nom de langue dans la langue d’affichage, repli sur le code', () => {
  assertEquals(langName('en', 'fr'), 'anglais')
  assertEquals(langName('en', 'en'), 'English')
  assertEquals(langName('fr', 'fr'), 'français')
  assertEquals(langName('fr', 'en'), 'French')
  assertEquals(langName('FR', 'en'), 'French') // tolère la casse / un code long
  assertEquals(langName('xx', 'fr'), 'xx') // inconnu → code brut, jamais d’exception
})

Deno.test('respondIn : directive de langue de réponse de l’IA', () => {
  assert(respondIn('fr').toLowerCase().includes('français'))
  assert(respondIn('en').toLowerCase().includes('english'))
})

Deno.test('parité FR : chaînes identiques au comportement historique', () => {
  const M = regafyMessages('fr')
  assertEquals(M.unreadable('GMP'), 'GMP : document illisible — à vérifier.')
  assertEquals(M.expired('GMP', '2026-04-29', ''), 'GMP expiré (2026-04-29).')
  assertEquals(
    M.expired('GMP', '2026-04-29', M.how(true, 24)),
    'GMP expiré (2026-04-29) (calculé : émission + 24 mois).',
  )
  assertEquals(
    M.lowValidity('AMM', 3, 6, M.requirement('ABMed'), '2026-09-01', ''),
    'AMM : validité restante ~3 mois (< 6 requis par ABMed ; expire le 2026-09-01).',
  )
  assertEquals(
    M.validOk('FSC', 14, '2027-08-15', ''),
    'FSC : validité vérifiée — conforme — valable encore ~14 mois (expire le 2027-08-15).',
  )
  assertEquals(
    M.nonCompliant('RCP'),
    'RCP : non conforme au template en vigueur — à mettre en conformité.',
  )
  // Préposition française correcte selon le pays (« du Bénin », « de la Côte d'Ivoire »).
  assertEquals(
    M.langMismatch('RCP', 'anglais', 'Bénin', 'français'),
    'RCP en anglais — langue officielle du Bénin : français. Traduction recommandée.',
  )
  assertEquals(
    M.langMismatch('Notice', 'anglais', "Côte d'Ivoire", 'français'),
    "Notice en anglais — langue officielle de la Côte d'Ivoire : français. Traduction recommandée.",
  )
})

Deno.test('sortie EN : constats rendus en anglais', () => {
  const M = regafyMessages('en')
  assertEquals(M.unreadable('GMP'), 'GMP: unreadable document — please verify.')
  assertEquals(M.expired('GMP', '2026-04-29', ''), 'GMP expired (2026-04-29).')
  assertEquals(
    M.lowValidity('AMM', 3, 6, M.requirement('ABMed'), '2026-09-01', M.how(true, 24)),
    'AMM: ~3 months of validity left (< 6 required by ABMed; expires 2026-09-01) (computed: issued + 24 months).',
  )
  assertEquals(
    M.nonCompliant('RCP'),
    'RCP: not compliant with the current template — needs to be brought into compliance.',
  )
  assertEquals(
    M.langMismatch('RCP', 'English', 'Benin', 'French'),
    'RCP in English — official language of Benin: French. Translation recommended.',
  )
})
