// deno test — postures du moteur. Module pur : aucun réseau, aucun SDK.
//
// Ces tests ne vérifient pas des chaînes pour le plaisir : chacun verrouille une DÉCISION de
// conception qu'une réécriture de prompt pourrait défaire sans que rien ne casse par ailleurs.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import { conformitySystem, reviewSystem, translationSystem } from './personas.ts'

const MARKER = '[Non fourni, à compléter]'
const conformity = conformitySystem({ docType: 'rcp', missingMarker: MARKER })

/** Consignes d'auto-vérification : proscrites sur Opus 5 (§3.3), sur-vérification sans gain. */
const SELF_CHECK = /double-?check|vérifie (?:bien|avant)|relis-toi|assure-toi de vérifier|check your work/i

Deno.test('conformité : la posture NE revendique PAS d’expertise — c’est le correctif central', () => {
  // La version précédente ouvrait par « Tu es un expert en affaires réglementaires » puis passait
  // quatre puces à interdire l'usage de cette expertise. Sur un modèle qui suit les consignes au
  // pied de la lettre, amorcer un comportement pour le réprimer ensuite est un mauvais calcul.
  assertEquals(/tu es un expert/i.test(conformity), false)
  assertStringIncludes(conformity, 'opérateur de mise en conformité')
  assertStringIncludes(conformity, 'Tu ne connais pas ce médicament')
})

Deno.test('conformité : les quatre règles zéro-invention sont conservées mot pour mot', () => {
  // Elles ont fait leurs preuves sur deux cas réels : seul le RÔLE devait changer.
  assertStringIncludes(conformity, 'RÈGLE ABSOLUE — ZÉRO INVENTION :')
  assertStringIncludes(conformity, 'provient du document source')
  assertStringIncludes(conformity, 'N’utilise JAMAIS tes connaissances générales')
  assertStringIncludes(conformity, 'Recopie VERBATIM')
  assertStringIncludes(conformity, 'nombres, dosages, unités, dates, codes ATC')
})

Deno.test('conformité : le marqueur est INJECTÉ, jamais écrit en dur dans la posture', () => {
  // Le marqueur est un contrat client ; le dupliquer ici le ferait diverger au premier changement.
  assertStringIncludes(conformity, MARKER)
  const other = conformitySystem({ docType: 'rcp', missingMarker: '[XXX]' })
  assertStringIncludes(other, '[XXX]')
  assertEquals(other.includes(MARKER), false)
})

Deno.test('conformité : la terminologie verrouillée du gabarit est bien jointe', () => {
  assertStringIncludes(conformity, 'TERMINOLOGIE VERROUILLÉE')
  // Le noyau MedDRA/EDQM dépend du type de document.
  const notice = conformitySystem({ docType: 'notice', missingMarker: MARKER })
  assertEquals(notice === conformity, false)
})

Deno.test('traduction : le risque nommé est l’AMÉLIORATION, pas l’invention', () => {
  // Un modèle à qui l'on dit « traduis » clarifie, condense, corrige la syntaxe — et déplace du
  // sens réglementaire au passage. La posture doit refuser cela explicitement.
  const en = translationSystem('en')
  assertStringIncludes(en, 'terminologue réglementaire')
  assertStringIncludes(en, 'Tu n’AMÉLIORES pas')
  assertStringIncludes(en, 'ni plus, ni moins, ni mieux')
  assertStringIncludes(en, 'Tu ne juges pas de la complétude')
  assertStringIncludes(en, 'anglais')
  assertStringIncludes(translationSystem('fr'), 'français')
})

Deno.test('traduction : les valeurs chiffrées et les noms propres sont hors de portée', () => {
  const s = translationSystem('en')
  assertStringIncludes(s, 'Tu ne touches à AUCUNE valeur chiffrée')
  assertStringIncludes(s, 'destinataire de pharmacovigilance traduit n’existe pas')
})

Deno.test('revue : la connaissance générale est AUTORISÉE — et bornée', () => {
  // Seule passe où l'expertise est un actif. Sans autorisation explicite, la posture de conformité
  // contaminerait la revue et l'on perdrait précisément ce que le client achète.
  const fr = reviewSystem('fr')
  assertStringIncludes(fr, 'expert senior en affaires réglementaires')
  assertStringIncludes(fr, 'CETTE TÂCHE EST LA SEULE')
  assertStringIncludes(fr, 'Tu SIGNALES, tu ne complètes jamais le document')
  assertStringIncludes(fr, 'jamais dans la pièce déposée')
})

Deno.test('revue : le ton partenaire est prescrit, le reproche proscrit', () => {
  const fr = reviewSystem('fr')
  assertStringIncludes(fr, 'Tu travailles AVEC le client')
  assertStringIncludes(fr, 'tu n’écris pas « non conforme »')
  assertStringIncludes(fr, 'Tu nommes le produit du client')
})

Deno.test('revue : version anglaise complète, sans résidu français', () => {
  const en = reviewSystem('en')
  assertStringIncludes(en, 'senior regulatory affairs expert')
  assertStringIncludes(en, 'You FLAG; you never complete the document')
  assertStringIncludes(en, 'you do not write "non-compliant"')
  // Un rapport anglais ne doit pas hériter d'une posture française.
  assertEquals(/[àéèêçù]/i.test(en.replace(/UEMOA/g, '')), false)
})

Deno.test('aucune posture ne contient de consigne d’auto-vérification (§3.3)', () => {
  for (const s of [conformity, translationSystem('en'), translationSystem('fr'), reviewSystem('fr'), reviewSystem('en')]) {
    assertEquals(SELF_CHECK.test(s), false)
  }
})

Deno.test('les trois postures sont DISTINCTES — pas une variation d’un même texte', () => {
  const [a, b, c] = [conformity, translationSystem('fr'), reviewSystem('fr')]
  assertEquals(new Set([a, b, c]).size, 3)
  // Et la conformité ne doit surtout pas s'annoncer experte là où la revue le fait.
  assertEquals(/expert senior/i.test(a), false)
  assertEquals(/expert senior/i.test(c), true)
})
