// deno test — porte de recevabilité, couche 0. Déterministe : aucun appel IA, aucun réseau.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import { CONFORMITY_SPECS } from './conformity-specs.ts'
import {
  empreinteGabarit,
  jugerRecevabilite,
  messageRefus,
  REPERES_MINIMUM,
} from './order-gate-core.ts'

/** Un RCP réel, tel qu'un client l'envoie : titres officiels, contenu quelconque. */
const RCP = [
  '1. DÉNOMINATION DU MÉDICAMENT',
  'KV-Kacin 500 mg, poudre pour solution injectable',
  '2. COMPOSITION QUALITATIVE ET QUANTITATIVE',
  'Chaque flacon contient 500 mg d’amikacine.',
  '4.1 Indications thérapeutiques',
  '4.8 Effets indésirables',
  'Les effets indésirables sont classés par système-organe.',
].join('\n')

/** Un journal officiel : zéro repère de gabarit. */
const JOURNAL = [
  'JOURNAL OFFICIEL DE LA RÉPUBLIQUE',
  'Décret n° 2025-1833 portant fixation des redevances',
  'Article premier — Les redevances perçues par l’Agence sont fixées comme suit.',
  'Fait à Dakar, le 12 novembre 2025.',
].join('\n')

Deno.test('empreinte : les repères viennent du GABARIT, jamais d’une liste parallèle', () => {
  // Une liste en double finirait par diverger, et la porte jugerait sur un référentiel que le
  // moteur n'utilise plus.
  const reperes = empreinteGabarit(CONFORMITY_SPECS.rcp)
  assertEquals(reperes.includes('COMPOSITION QUALITATIVE ET QUANTITATIVE'), true)
  assertEquals(reperes.includes('DÉNOMINATION DU MÉDICAMENT'), true)
  // Les titres trop courts sont écartés : ils se retrouvent partout et gonfleraient le score.
  assertEquals(reperes.includes('Posologie'), false)
  assertEquals(reperes.every((r) => r.length >= 12), true)
  // Aucun doublon : deux rubriques homonymes ne doivent pas compter double.
  assertEquals(new Set(reperes).size, reperes.length)
})

Deno.test('porte : un RCP réel PASSE, même avec un contenu quelconque', () => {
  // ⚠️ La porte ne juge pas la qualité. Un RCP médiocre est le cas d'usage NORMAL de l'upgrade.
  const v = jugerRecevabilite(RCP, 'text', CONFORMITY_SPECS.rcp)
  assertEquals(v.recevable, true)
  assertEquals(v.trouves.length >= REPERES_MINIMUM, true)
})

Deno.test('porte : un JOURNAL OFFICIEL est arrêté, gratuitement', () => {
  // C'est le faux accept qu'on ne peut pas se permettre : livrable absurde, crédit brûlé,
  // crédibilité détruite en un essai.
  const v = jugerRecevabilite(JOURNAL, 'text', CONFORMITY_SPECS.rcp)
  assertEquals(v.recevable, false)
  assertEquals(v.trouves.length, 0)
  // Le total est rendu : « 0 trouvé » ne veut rien dire sans lui.
  assertEquals(v.cherches > 0, true)
})

Deno.test('porte : un document VIDE ou minuscule est refusé', () => {
  for (const texte of ['', '   ', 'Bonjour']) {
    assertEquals(jugerRecevabilite(texte, 'text', CONFORMITY_SPECS.rcp).recevable, false)
  }
})

Deno.test('porte : sur un SCAN, la tolérance de lecture s’applique', () => {
  // ⚠️ La recherche passe par `findInSource`, la même fonction que le contrôle de citation. Une
  // empreinte plus stricte que le contrôle qu'elle précède refuserait des documents que le moteur
  // saurait traiter — le client paierait pour un refus dû à NOTRE outil de lecture.
  const scanne = RCP
    .replace('COMPOSITION QUALITATIVE ET QUANTITATIVE', 'C0MPOSITION QUALITATIVE ET QUANTlTATIVE')
    .replace('DÉNOMINATION DU MÉDICAMENT', 'DÉNOMlNATION DU MÉDICAMENT')
  assertEquals(jugerRecevabilite(scanne, 'ocr', CONFORMITY_SPECS.rcp).recevable, true)
})

Deno.test('porte : le chemin de REFUS reste sous le budget CPU sur un gros scan', () => {
  // ⚠️ Le piège est contre-intuitif : le chemin coûteux est celui du REFUS, celui qu'on annonce
  // gratuit. Un document accepté s'arrête au 3ᵉ repère ; un document hors sujet les balaie TOUS.
  // Mesuré avant correction : ~1,15 s pour 200 000 caractères et ~9,5 s pour 1,4 million, contre
  // 2 s de CPU par invocation Edge. L'isolat était tué et l'acheteur recevait une erreur opaque à
  // la place du message qui lui disait qu'il pouvait redéposer sans rien payer.
  // Le corpus MAXIMAL que l'Edge accepte (400 000 caractères), sans un seul repère : le pire cas
  // réel, pas un cas d'école. C'est ce test qui a rattrapé une première borne posée par
  // raisonnement — elle laissait le refus à 3 001 ms, au-dessus du budget.
  const gros = (JOURNAL + '\n').repeat(2700)
  const t0 = Date.now()
  const v = jugerRecevabilite(gros, 'ocr', CONFORMITY_SPECS.rcp)
  const ms = Date.now() - t0
  assertEquals(v.recevable, false)
  // 1,5 s : au-dessus des ~700 ms mesurés, sous les 2 s de CPU d'une invocation. Le test attrape
  // une régression d'ordre de grandeur, il ne mesure pas la machine.
  assertEquals(ms < 1500, true, `refus sur gros scan : ${ms} ms`)
})

Deno.test('porte : la passe LITTÉRALE couvre tout le corpus, la TOLÉRANTE est bornée', () => {
  // C'est le compromis exact du correctif, et il mérite d'être verrouillé : un RCP dont les titres
  // sont exacts passe où qu'ils se trouvent ; la tolérance de lecture, elle, ne s'applique qu'au
  // début du document — là où vivent les repères d'un RCP réel.
  const bourrage = 'lorem ipsum dolor sit amet. '.repeat(12_000) // ~330 000 caractères
  assertEquals(jugerRecevabilite(bourrage + RCP, 'ocr', CONFORMITY_SPECS.rcp).recevable, true)

  const scanneTard = bourrage + RCP
    .replace('COMPOSITION QUALITATIVE ET QUANTITATIVE', 'C0MPOSITION QUALITATIVE ET QUANTlTATIVE')
    .replace('DÉNOMINATION DU MÉDICAMENT', 'DÉNOMlNATION DU MÉDICAMENT')
    .replace('Indications thérapeutiques', 'lndications thérapeutiques')
    .replace('Effets indésirables', 'Effets lndésirables')
  assertEquals(jugerRecevabilite(scanneTard, 'ocr', CONFORMITY_SPECS.rcp).recevable, false)
})

Deno.test('refus : le message dit ce qui manque ET que rien n’a été débité', () => {
  // §6 du plan : trois choses à dire, sans quoi le client ouvre un litige là où une phrase suffit.
  const fr = messageRefus('fr', 'un RCP', 2)
  assertStringIncludes(fr, 'rien n')
  assertStringIncludes(fr, 'débité')
  assertStringIncludes(fr, '2 tentative')
  const en = messageRefus('en', 'an SmPC', 2)
  assertStringIncludes(en, 'nothing has been charged')
  assertStringIncludes(en, '2 attempt')
})

Deno.test('refus : sans dépôt restant, le message ouvre un RECOURS au lieu d’une impasse', () => {
  // L'inclinaison vers le refus n'est tenable que si le chemin de récupération est réel.
  assertStringIncludes(messageRefus('fr', 'un RCP', 0), 'e-mail de confirmation')
  assertStringIncludes(messageRefus('en', 'an SmPC', 0), 'confirmation email')
})
