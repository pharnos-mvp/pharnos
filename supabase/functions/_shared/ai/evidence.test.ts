// deno test — contrôle `source_evidence` (M2). Module pur : aucun SDK, aucun réseau.
import { assertEquals } from 'jsr:@std/assert@1'

import {
  isEvidenceRejected,
  MAX_EVIDENCE_CHARS,
  MIN_EVIDENCE_CHARS,
  normalizeForEvidence,
  prepareSource,
  ungroundedFigures,
  verifyEvidence,
} from './evidence.ts'

const SOURCE = [
  'RESUME DES CARACTERISTIQUES DU PRODUIT',
  '1. DENOMINATION DU MEDICAMENT',
  'GYNORIL 500 mg, comprimé pelliculé.',
  "4.1 Indications thérapeutiques : traitement de l'endométriose chez la femme adulte.",
  'Chaque comprimé contient 500 mg de substance active.',
].join('\n')

Deno.test('verifyEvidence : une citation exacte est vérifiée', () => {
  const src = prepareSource(SOURCE)
  assertEquals(verifyEvidence('GYNORIL 500 mg, comprimé pelliculé.', src, 'filled'), 'verified')
})

Deno.test('verifyEvidence : la typographie ne fait pas échouer une citation honnête', () => {
  const src = prepareSource(SOURCE)
  // Apostrophe droite côté modèle vs courbe côté source, espace insécable étroite, casse, et un
  // retour à la ligne inséré par l'extraction PDF : rien de tout cela ne porte de sens.
  assertEquals(
    verifyEvidence("traitement de l’endométriose chez la\nfemme adulte", src, 'filled'),
    'verified',
  )
  assertEquals(verifyEvidence('chaque comprimé contient 500 mg', src, 'filled'), 'verified')
})

Deno.test('verifyEvidence : une césure de fin de ligne PDF est recollée des DEUX côtés', () => {
  const src = prepareSource('Chaque compri-\nmé contient 500 mg de substance active.')
  assertEquals(verifyEvidence('chaque comprimé contient 500 mg', src, 'filled'), 'verified')
})

Deno.test('verifyEvidence : les accents NE sont PAS effacés (la comparaison reste stricte)', () => {
  // Effacer les accents rendrait le contrôle plus permissif : « periode » passerait pour « période ».
  assertEquals(normalizeForEvidence('période').includes('é'), true)
})

Deno.test('verifyEvidence : citer le TITRE de la rubrique ne prouve rien', () => {
  // Le contournement le plus simple : un titre de rubrique figure dans TOUT document du même type,
  // donc le citer « justifie » n'importe quel contenu. Retranché, il ne reste rien à juger.
  const src = prepareSource(SOURCE)
  assertEquals(verifyEvidence('4.1 Indications thérapeutiques', src, 'filled', 'Indications thérapeutiques'), 'too_short')
  // En revanche, titre + passage réel reste une citation parfaitement valable.
  assertEquals(
    verifyEvidence(
      "4.1 Indications thérapeutiques : traitement de l'endométriose chez la femme adulte.",
      src,
      'filled',
      'Indications thérapeutiques',
    ),
    'verified',
  )
})

Deno.test('verifyEvidence : une citation absente est rejetée (le cœur de la garantie)', () => {
  const src = prepareSource(SOURCE)
  assertEquals(
    verifyEvidence('traitement du diabète de type 2 chez l’adulte', src, 'filled'),
    'not_found',
  )
})

Deno.test('verifyEvidence : une citation trop courte ne prouve rien', () => {
  const src = prepareSource(SOURCE)
  assertEquals(verifyEvidence('na', src, 'filled'), 'too_short')
  assertEquals(verifyEvidence('500 mg', src, 'filled'), 'too_short')
  assertEquals(verifyEvidence('', src, 'partial'), 'too_short')
  // Juste au-dessus du seuil, une citation présente passe.
  const needle = normalizeForEvidence(SOURCE).slice(0, MIN_EVIDENCE_CHARS)
  assertEquals(verifyEvidence(needle, src, 'filled'), 'verified')
})

Deno.test('verifyEvidence : une citation COURTE mais assez riche en mots reste valable', () => {
  // « GYNORIL 500 mg » fait 14 caractères et justifie parfaitement la rubrique 1. La refuser
  // rejouerait puis rétrograderait une rubrique correcte — et fausserait la métrique du §7.
  assertEquals(verifyEvidence('GYNORIL 500 mg', prepareSource(SOURCE), 'filled'), 'verified')
})

Deno.test('verifyEvidence : recopier la source entière ne vaut pas citation', () => {
  const long = 'a'.repeat(MAX_EVIDENCE_CHARS + 1)
  assertEquals(verifyEvidence(long, prepareSource(long), 'filled'), 'too_long')
  // Le plafond est aussi RELATIF : sur une source courte, 2 000 caractères absolus laisseraient
  // passer une recopie intégrale, vraie par construction.
  const short = 'x'.repeat(1_000)
  assertEquals(verifyEvidence(short, prepareSource(short), 'filled'), 'too_long')
})

Deno.test('verifyEvidence : un mot composé césuré par le PDF reste vérifiable dans les DEUX sens', () => {
  // Le modèle recopie « anti-inflammatoire » comme un humain le lit ; la source PDF porte
  // « anti-\ninflammatoire ». Rejeter cela livrerait « non fourni » sur une rubrique correcte.
  const src = prepareSource('Traitement anti-\ninflammatoire de courte durée.')
  assertEquals(verifyEvidence('Traitement anti-inflammatoire de courte durée.', src, 'filled'), 'verified')
})

Deno.test('ungroundedFigures : une valeur inventée est détectée même sous une citation valide', () => {
  // LE contournement que ce contrôle ferme : citer une vraie ligne du document pour couvrir un
  // contenu inventé. `verifyEvidence` dirait « verified » ; le dosage, lui, n'existe pas.
  const src = prepareSource(SOURCE)
  assertEquals(ungroundedFigures('Boîte de 90 comprimés.', src), ['90'])
  assertEquals(ungroundedFigures('GYNORIL 500 mg, comprimé pelliculé.', src), [])
})

Deno.test('ungroundedFigures : ni les chiffres isolés ni les RENVOIS au gabarit ne sont exigés', () => {
  const src = prepareSource(SOURCE)
  // Un chiffre isolé (« 3 fois par jour ») se retrouve partout : il ne prouve ni ne réfute rien.
  assertEquals(ungroundedFigures('À prendre 3 fois par jour.', src), [])
  // Un renvoi explicite désigne la STRUCTURE du document, pas une donnée du produit.
  assertEquals(ungroundedFigures('Voir rubrique 6.6.', src), [])
  assertEquals(ungroundedFigures('Se reporter à la section 4.2 pour la posologie.', src), [])
  // ...mais un chiffre SANS renvoi reste exigé, même s'il ressemble à un numéro de rubrique :
  // exempter tous les identifiants du gabarit laisserait passer « posologie : 10 mg » inventé.
  assertEquals(ungroundedFigures('Posologie : 10 mg par jour.', src), ['10'])
  assertEquals(ungroundedFigures('Posologie : 10 mg par jour.', src, new Set(['10'])), [])
})

Deno.test('ungroundedFigures : la comparaison porte sur des JETONS, jamais des sous-chaînes', () => {
  // LA classe d'hallucination la plus dangereuse : le dosage voisin du vrai. Une comparaison par
  // `includes` rendrait « 32 mg » vrai face à une source qui dit « 325 mg ».
  const src = prepareSource('Chaque comprimé contient 325 mg de paracétamol. Conservation : 24 mois.')
  assertEquals(ungroundedFigures('Comprimé à 32 mg.', src), ['32'])
  assertEquals(ungroundedFigures('Conservation : 18 mois.', src), ['18'])
  assertEquals(ungroundedFigures('Chaque comprimé contient 325 mg.', src), [])
})

Deno.test('ungroundedFigures : les séparateurs de milliers ne créent pas de faux positif', () => {
  const src = prepareSource('Le prix grossiste est de 1 500 FCFA la boîte.')
  assertEquals(ungroundedFigures('PGHT : 1500 FCFA.', src), [])
})

Deno.test('ungroundedFigures : sans source, aucun chiffre n’est déclaré non fondé', () => {
  // Mode fichier : le contrôle ne peut pas s'exercer, il ne PRÉTEND donc rien — ni dans un sens,
  // ni dans l'autre. Rendre « tout est non fondé » rétrograderait toutes les rubriques.
  assertEquals(ungroundedFigures('Boîte de 90 comprimés.', prepareSource(null)), [])
})

Deno.test('verifyEvidence : une rubrique déclarée absente n’a rien à justifier', () => {
  assertEquals(verifyEvidence('', prepareSource(SOURCE), 'missing'), 'not_required')
  // Même sans texte source : « missing » se tranche avant tout le reste.
  assertEquals(verifyEvidence('', prepareSource(null), 'missing'), 'not_required')
})

Deno.test('verifyEvidence : sans texte source, le contrôle est INVÉRIFIABLE, jamais réussi', () => {
  // Mode fichier (PDF non extrait) : compter cela comme vérifié transformerait la garantie en décor.
  for (const empty of [null, undefined, '', '   \n  ']) {
    assertEquals(verifyEvidence('une citation quelconque et longue', prepareSource(empty), 'filled'), 'unverifiable')
  }
})

Deno.test('isEvidenceRejected : seuls les verdicts qu’un rejeu peut corriger sont rejoués', () => {
  assertEquals(isEvidenceRejected('not_found'), true)
  assertEquals(isEvidenceRejected('too_short'), true)
  assertEquals(isEvidenceRejected('too_long'), true)
  // Rejouer ne fournirait pas le texte source manquant : ce serait un appel payé pour rien.
  assertEquals(isEvidenceRejected('unverifiable'), false)
  assertEquals(isEvidenceRejected('not_required'), false)
  assertEquals(isEvidenceRejected('verified'), false)
})
