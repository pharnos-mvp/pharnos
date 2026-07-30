// deno test — contrôle `source_evidence` (M2). Module pur : aucun SDK, aucun réseau.
import { assertEquals } from 'jsr:@std/assert@1'

import {
  findInSource,
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

Deno.test('ungroundedFigures : une source ANGLAISE et un contenu FRANÇAIS parlent des mêmes chiffres', () => {
  // LE cas qui aurait fait échouer tout dossier anglais : l'anglais sépare les milliers par une
  // virgule, le français par une espace. Sans canonisation, « 35,000 » et « 35 000 » sont deux
  // jetons différents et la rubrique 2 est rétrogradée alors que le dosage est exact.
  const src = prepareSource('Each pessary contains: Neomycin sulfate 35,000 IU; Nystatin 100,000 IU.')
  assertEquals(ungroundedFigures('Sulfate de néomycine 35 000 UI, nystatine 100 000 UI.', src), [])
  // ...et l'inverse, source FR vers contenu EN.
  const fr = prepareSource('Chaque ovule contient 35 000 UI de sulfate de néomycine.')
  assertEquals(ungroundedFigures('Each pessary contains 35,000 IU of neomycin sulfate.', fr), [])
  // Un dosage réellement différent reste signalé, quelle que soit la convention.
  assertEquals(ungroundedFigures('Sulfate de néomycine 45 000 UI.', src), ['45 000'])
})

Deno.test('ungroundedFigures : la virgule DÉCIMALE ne se confond pas avec un séparateur de milliers', () => {
  // « 12,5 » est un nombre décimal ; « 12,500 » est douze mille cinq cents. Les confondre
  // laisserait passer un dosage cent fois trop élevé.
  const src = prepareSource('Dose : 12,5 mg par prise. Conditionnement de 12 500 unités.')
  assertEquals(ungroundedFigures('Dose of 12.5 mg per intake.', src), [])
  assertEquals(ungroundedFigures('Pack of 12,500 units.', src), [])
  assertEquals(ungroundedFigures('Dose de 125 mg.', src), ['125'])
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

/* ──────────────────────────── Sources SCANNÉES (reconnaissance de caractères) ──────────────── */

// Ce que l'OCR fait réellement, observé sur les PDF du guide sénégalais : les mots se reconstituent,
// des lettres se substituent (0/O, 1/l, 5/S, 8/B, rn/m). La citation du modèle vient de l'IMAGE, donc
// du texte JUSTE ; le corpus de contrôle, lui, porte les coquilles. Sans tolérance, chaque rubrique
// d'un dossier scanné serait rétrogradée alors que le livrable est correct.
const OCR_SOURCE = [
  'RESUME DES CARACTERISTIQUES DU PRODU1T',
  'GYNORlL 500 mg, comprimé pelliculé.',
  "4.1 Indications thérapeutiques : traitement de l'endométriose chez la femme aduIte.",
].join('\n')

Deno.test('verifyEvidence : sur une source OCÉRISÉE, une lettre mal lue ne fait pas échouer la citation', () => {
  const ocr = prepareSource(OCR_SOURCE, 'ocr')
  const verdict = verifyEvidence(
    "traitement de l'endométriose chez la femme adulte",
    ocr,
    'filled',
  )
  // Verdict DISTINCT : la garantie est réelle mais moindre, et rien ne doit pouvoir la présenter
  // comme une correspondance exacte.
  assertEquals(verdict, 'verified_ocr')
  // Le même texte déclaré fidèle échoue — c'est bien la provenance qui décide, pas le contenu.
  assertEquals(
    verifyEvidence("traitement de l'endométriose chez la femme adulte", prepareSource(OCR_SOURCE), 'filled'),
    'not_found',
  )
})

Deno.test('verifyEvidence : la tolérance OCR ne va pas jusqu’à accepter une citation étrangère', () => {
  const ocr = prepareSource(OCR_SOURCE, 'ocr')
  // Aucun mot significatif en commun : c'est une invention, pas une lecture fautive.
  assertEquals(
    verifyEvidence('contre-indiqué pendant la grossesse et l’allaitement', ocr, 'filled'),
    'not_found',
  )
})

Deno.test('findInSource : une source fidèle n’accorde JAMAIS la tolérance OCR', () => {
  const approx = "traitement de l'endométriose chez la femme adulte"
  assertEquals(findInSource(approx, prepareSource(OCR_SOURCE, 'ocr')), 'ocr')
  assertEquals(findInSource(approx, prepareSource(OCR_SOURCE, 'text')), 'absent')
  // Et une correspondance littérale reste 'exact' même sur un corpus océrisé.
  assertEquals(findInSource('GYNORlL 500 mg', prepareSource(OCR_SOURCE, 'ocr')), 'exact')
})

Deno.test('ungroundedFigures : AUCUNE tolérance OCR sur les chiffres, dans les deux sens', () => {
  // Décision centrale du dispositif : l'OCR confond précisément les chiffres. Rapprocher « à peu
  // près » ferait accepter 8 mg pour 3 mg — la comparaison reste donc EXACTE, et c'est l'appelant
  // qui rend le signal consultatif (`figuresAdvisory`) au lieu de rétrograder la rubrique.
  const ocr = prepareSource('Chaque comprimé contient 3OO mg de substance active.', 'ocr')
  assertEquals(ungroundedFigures('Chaque comprimé contient 300 mg.', ocr), ['300'])
  const clean = prepareSource('Chaque comprimé contient 300 mg de substance active.', 'ocr')
  assertEquals(ungroundedFigures('Chaque comprimé contient 300 mg.', clean), [])
})

Deno.test('findInSource : le budget d’erreurs de lecture est PROPORTIONNEL à la longueur', () => {
  // La frontière est ce qui donne sa valeur à la tolérance : 8 % des caractères, quand une
  // reconnaissance correcte se trompe sur 1 à 2 %. Au-delà, ce n'est plus une lecture fautive.
  const src = prepareSource('5.3 Sécurité préclinique et données pharmacocinétiques.', 'ocr')
  // Une lettre par mot (é → e, i → l) : retrouvé.
  assertEquals(findInSource('5.3 Sécurite préclinlque et données pharmacocinétiques.', src), 'ocr')
  // Deux lettres dans le même mot : le mot ne compte plus. Deux mots ainsi abîmés sur quatre font
  // tomber le recouvrement sous le seuil, et la citation est refusée.
  assertEquals(findInSource('5.3 Sécurite prellnlque et dones pharmacocintiques.', src), 'absent')
})

Deno.test('findInSource : une citation RECOMBINÉE ne passe pas, même mot pour mot du document', () => {
  // ⚠️ LE défaut qu'un score de recouvrement par MOTS laissait passer, et la raison pour laquelle
  // le rapprochement porte sur un passage CONTIGU. Ici chaque mot de la citation existe dans le
  // document — mais dans deux phrases différentes, et la posologie pédiatrique est INVENTÉE.
  const src = prepareSource(
    "La dose recommandée chez l'adulte est de 5OO mg deux fois par jour pendant 7 jours. " +
      "L'utilisation chez l'enfant de moins de 12 ans n'a pas été étudiée.",
    'ocr',
  )
  assertEquals(
    findInSource("La dose recommandée chez l'enfant est de 250 mg deux fois par jour", src),
    'absent',
  )
  // Le passage réellement présent, lui, est bien retrouvé malgré « 5OO » lu de travers.
  assertEquals(
    findInSource("La dose recommandée chez l'adulte est de 500 mg deux fois par jour", src),
    'ocr',
  )
})

Deno.test('findInSource : sur un scan, un CHIFFRE faux n’est jamais toléré', () => {
  // ⚠️ LE défaut le plus grave du dispositif, trouvé en revue : la tolérance de 8 % ne distinguait
  // pas une lettre d'un chiffre. Conjuguée aux valeurs consultatives, elle annulait LES DEUX
  // contrôles sur le même chemin — une posologie doublée sortait « citation vérifiée », et « 500 »
  // existant ailleurs dans le document (« boîte de 500 comprimés »), rien n'était même signalé.
  const src = prepareSource(
    '2. COMPOSITION : chaque comprimé contient 250 mg de kacinamide. ' +
      "4.2 Posologie : la posologie usuelle est de 250 mg par jour chez l'adulte. " +
      'Boîte de 500 comprimés sous plaquettes thermoformées.',
    'ocr',
  )
  // Le dosage doublé : refusé, alors que le budget d'édition (4 sur 57 caractères) le couvrirait.
  assertEquals(
    findInSource("la posologie usuelle est de 500 mg par jour chez l'adulte", src),
    'absent',
  )
  // Un chiffre ajouté ou retiré ne se rattrape pas non plus : 250 ≠ 2500 ≠ 25.
  assertEquals(findInSource('chaque comprimé contient 2500 mg de kacinamide', src), 'absent')
  assertEquals(findInSource('chaque comprimé contient 25 mg de kacinamide', src), 'absent')
  // Et le passage réellement présent reste retrouvé, malgré une LETTRE mal lue.
  assertEquals(findInSource('chaque comprimé contlent 250 mg de kacinamide', src), 'ocr')
})

Deno.test('findInSource : seules les confusions chiffre ↔ LETTRE sont accordées', () => {
  // Ce qu'une reconnaissance produit vraiment : 0/O, 1/l, 5/S, 8/B. Jamais 2 pour 5.
  const src = prepareSource('Chaque ovule contient 35 OOO Ul de sulfate de néomycine.', 'ocr')
  assertEquals(findInSource('Chaque ovule contient 35 000 UI de sulfate de néomycine.', src), 'ocr')
  // La même longueur, un chiffre réellement différent : refusé.
  assertEquals(findInSource('Chaque ovule contient 45 000 UI de sulfate de néomycine.', src), 'absent')
})

Deno.test('verifyEvidence : sur un scan, une citation trop longue pour être APPROCHÉE est rejouée', () => {
  // Juger 600 caractères sur 700 laisserait la queue de la citation vérifiée par rien — et c'est
  // exactement là qu'une invention se cache. `too_long` est rejouable, avec un message qui demande
  // une citation plus COURTE : mieux vaut cela qu'un contrôle partiel présenté comme complet.
  const body = 'Chaque comprimé pelliculé contient de la substance active. '
  const long = body.repeat(12) // ~700 caractères
  // Une LETTRE mal lue dans le corpus : le littéral échoue, l'approché ne peut pas juger 700
  // caractères d'un tenant ⇒ rejeu.
  const ocr = prepareSource(body.repeat(20) + 'Chaque comprlmé pelliculé contient. ', 'ocr')
  assertEquals(verifyEvidence(long.slice(0, 700), ocr, 'filled'), 'verified')
  const drifted = long.replace('Chaque comprimé pelliculé contient de la substance active. ', 'Chaque comprlmé pelliculé contient de la substance active. ')
  assertEquals(verifyEvidence(drifted, ocr, 'filled'), 'too_long')
  assertEquals(isEvidenceRejected('too_long'), true)
  // ⚠️ Une citation LITTÉRALEMENT présente n'est jamais rejetée pour dépassement : le plafond du
  // scan protège le rapprochement approché, pas le contrôle exact. La rejeter rétrograderait une
  // rubrique dont chaque caractère a été vérifié.
  assertEquals(verifyEvidence(long, prepareSource(body.repeat(40), 'ocr'), 'filled'), 'verified')
  assertEquals(verifyEvidence(long, prepareSource(body.repeat(40)), 'filled'), 'verified')
})

Deno.test('findInSource : les chiffres de TÊTE de la citation ne se suppriment pas', () => {
  // ⚠️ Fuite trouvée en contre-revue : la colonne initiale de la programmation dynamique encodait
  // « supprimer les i premiers caractères » à 1 par caractère, en exception à la règle que le reste
  // du calcul applique. Atteignable là où c'est le plus grave — la rubrique 1, dont la citation est
  // la première ligne du document et porte le dosage.
  const src = prepareSource('comprimes par jour pendant la duree du traitement prescrit', 'ocr')
  assertEquals(findInSource('250 comprimes par jour pendant la duree du traitement', src), 'absent')
  assertEquals(findInSource('12 comprimes par jour pendant la duree du traitement', src), 'absent')
  // Le même passage sans chiffre ajouté reste retrouvé, à une lettre près.
  assertEquals(findInSource('comprimes par jour pendant la duree du traltement', src), 'ocr')
})

Deno.test('findInSource : l’UNITÉ d’un dosage est protégée comme le chiffre', () => {
  // La magnitude d'une posologie vit pour MOITIÉ dans des lettres. Protéger les chiffres seuls
  // laissait « 250 g » s'aligner sur « 250 mg » — facteur mille, et cette fois sans AUCUN signal :
  // le jeton chiffré étant intact, `ungroundedFigures` n'a rien à lister.
  const src = prepareSource('la dose est de 250 mg par jour chez l’adulte traite', 'ocr')
  assertEquals(findInSource('la dose est de 250 g par jour chez l’adulte traite', src), 'absent')
  assertEquals(findInSource('la dose est de 250 mcg par jour chez l’adulte traite', src), 'absent')
  const vol = prepareSource('administrer 10 l de solution par voie intraveineuse lente', 'ocr')
  assertEquals(findInSource('administrer 10 ml de solution par voie intraveineuse lente', vol), 'absent')
  // Et l'unité correctement citée passe, y compris avec une lettre mal lue AILLEURS.
  assertEquals(findInSource('la dose est de 250 mg par jour chez l’adulte tralte', src), 'ocr')
})

Deno.test('findInSource : le séparateur décimal ne se déplace pas', () => {
  // Chiffres identiques, dans l'ordre : seule la virgule bouge, et une virgule n'est pas un chiffre.
  // Facteur dix sur une dose, que l'ancrage des valeurs ne rattrape pas si « 1,25 » traîne ailleurs.
  const src = prepareSource('dose de 12,5 mg par prise quotidienne le matin', 'ocr')
  assertEquals(findInSource('dose de 1,25 mg par prise quotidienne le matin', src), 'absent')
  assertEquals(findInSource('dose de 125 mg par prise quotidienne le matin', src), 'absent')
  assertEquals(findInSource('dose de 12,5 mg par prise quotldienne le matin', src), 'ocr')
})

Deno.test('findInSource : les unités COMPOSÉES d’une posologie sont protégées elles aussi', () => {
  // Un plafond calibré sur « mg » et « ml » laissait `mg/kg/j` et `µg/kg/min` sans protection — donc
  // un facteur mille sur une posologie pédiatrique, la population la plus exposée.
  const src = prepareSource('la dose pediatrique est de 10 mg/kg/j en deux prises espacees', 'ocr')
  assertEquals(findInSource('la dose pediatrique est de 10 g/kg/j en deux prises espacees', src), 'absent')
  const perf = prepareSource('perfusion continue de 5 µg/kg/min sous surveillance continue', 'ocr')
  assertEquals(findInSource('perfusion continue de 5 mg/kg/min sous surveillance continue', perf), 'absent')
  // L'unité correctement citée passe, malgré une lettre mal lue ailleurs dans la phrase.
  assertEquals(findInSource('la dose pediatrlque est de 10 mg/kg/j en deux prises espacees', src), 'ocr')
})

Deno.test('findInSource : un TITRE de rubrique après un numéro n’est pas pris pour une unité', () => {
  // ⚠️ Le motif le plus fréquent d'un RCP : « 5.3 Sécurité préclinique », « 4.2 Posologie ». Geler
  // le mot qui suit un numéro sur un simple critère de longueur ferait refuser presque toutes les
  // citations d'un scan — d'où un vocabulaire d'unités FERMÉ plutôt qu'une heuristique.
  const src = prepareSource('5.3 Sécurité préclinique et données pharmacocinétiques du produit', 'ocr')
  assertEquals(findInSource('5.3 Sécurite préclinlque et données pharmacocinétiques du produit', src), 'ocr')
  const poso = prepareSource('4.2 Posologie et mode d’administration chez l’adulte et l’enfant', 'ocr')
  assertEquals(findInSource('4.2 Posologle et mode d’administration chez l’adulte et l’enfant', poso), 'ocr')
})

Deno.test('findInSource : le micro devient un mu GREC après normalisation', () => {
  // NFKC replie le signe micro sur le mu grec. Une table écrite avec le signe micro serait
  // inopérante — et muette, puisqu'elle échouerait en REFUSANT, ce qui ressemble à un contrôle actif.
  const src = prepareSource('perfusion de 5 µg/kg/min pendant douze heures consecutives', 'ocr')
  // « ug » pour « µg » est une confusion de lecture sans effet sur la magnitude : acceptée.
  assertEquals(findInSource('perfusion de 5 ug/kg/min pendant douze heures consecutives', src), 'ocr')
  // « mg » pour « µg » multiplie la dose par mille : refusée.
  assertEquals(findInSource('perfusion de 5 mg/kg/min pendant douze heures consecutives', src), 'absent')
})

Deno.test('findInSource : l’espace entre nombre et unité peut être collée ou séparée', () => {
  // Après la confusion de lettres, l'artefact OCR le plus fréquent : « 500mg » pour « 500 mg ».
  // Geler cette espace faisait refuser une citation JUSTE — donc rejeu, donc « Non fourni ». Les
  // attaques par décalage restent tuées par la règle de substitution contre une espace.
  const colle = prepareSource('chaque comprime contient 500mg de substance active', 'ocr')
  assertEquals(findInSource('chaque comprime contient 500 mg de substance active', colle), 'ocr')
  const separe = prepareSource('chaque comprime contient 500 mg de substance active', 'ocr')
  assertEquals(findInSource('chaque comprime contient 500mg de substance active', separe), 'ocr')
  // ...et l'unité elle-même reste intouchable dans les deux formes.
  assertEquals(findInSource('chaque comprime contient 500 g de substance active', colle), 'absent')
  assertEquals(findInSource('chaque comprime contient 500ng de substance active', separe), 'absent')
})

Deno.test('findInSource : les unités de temps en TOUTES LETTRES sont protégées', () => {
  // `h` et `j` étaient protégés, `heures` et `jours` non — alors que « 24 heures » et « 24 jours »
  // se confondent aussi sûrement, et qu'un intervalle d'administration faux est un défaut clinique.
  const src = prepareSource('a renouveler toutes les 24 jours si necessaire selon avis', 'ocr')
  assertEquals(findInSource('a renouveler toutes les 24 heures si necessaire selon avis', src), 'absent')
  const sem = prepareSource('traitement pendant 3 semaines consecutives sans interruption', 'ocr')
  assertEquals(findInSource('traitement pendant 3 secondes consecutives sans interruption', sem), 'absent')
  // La forme correcte, avec une lettre mal lue ailleurs, passe toujours.
  assertEquals(findInSource('a renouveler toutes les 24 jours si necessalre selon avis', src), 'ocr')
})

Deno.test('findInSource : les DOSES UNITAIRES protègent aussi leur numérateur', () => {
  // ⚠️ Notations standard des patches, inhalateurs, sprays et vaccins. Le balayage du jeton s'arrête
  // sur un chiffre (« mg/24 h » ne livre que « mg/ ») et le dénominateur d'une dose n'était pas du
  // vocabulaire : dans les deux cas le NUMÉRATEUR redevenait libre, et « g » remplaçait « mg » pour
  // un facteur mille — sans aucun signal, le chiffre étant intact.
  const patch = prepareSource('libere 5 mg/24 h pendant sept jours consecutifs apres pose', 'ocr')
  assertEquals(findInSource('libere 5 g/24 h pendant sept jours consecutifs apres pose', patch), 'absent')
  const colle = prepareSource('libere 5 mg/24h pendant sept jours consecutifs apres pose', 'ocr')
  assertEquals(findInSource('libere 5 g/24h pendant sept jours consecutifs apres pose', colle), 'absent')
  const inhal = prepareSource('chaque bouffee delivre 0,5 mg/dose de principe actif', 'ocr')
  assertEquals(findInSource('chaque bouffee delivre 0,5 g/dose de principe actif', inhal), 'absent')
  const vaccin = prepareSource('titre vaccinal de 500 kui/dose apres reconstitution du lyophilisat', 'ocr')
  assertEquals(findInSource('titre vaccinal de 500 ui/dose apres reconstitution du lyophilisat', vaccin), 'absent')
  const spray = prepareSource('50 mg/pulverisation dans chaque narine matin et soir', 'ocr')
  assertEquals(findInSource('50 g/pulverisation dans chaque narine matin et soir', spray), 'absent')
  // Et les formes correctes passent, malgré une lettre mal lue ailleurs.
  assertEquals(findInSource('libere 5 mg/24 h pendant sept jours consecutlfs apres pose', patch), 'ocr')
  assertEquals(findInSource('chaque bouffee delivre 0,5 mg/dose de principe actlf', inhal), 'ocr')
})

Deno.test('findInSource : les unités écrites en TOUTES LETTRES sont protégées', () => {
  // ⚠️ La forme la plus dangereuse à laisser nue : la réglementation demande de l'écrire pour ÉVITER
  // la confusion μg/mg, donc elle apparaît là où cette confusion coûte le plus cher. Trois
  // substitutions séparent « micro » de « milli » — sous le budget dès qu'une citation dépasse
  // ~80 caractères, c'est-à-dire toujours. La protection n'était qu'un accident d'arithmétique.
  const mg = 'chaque comprime pellicule contient 250 milligrammes de substance active micronisee ' +
    'et des excipients a effet notoire selon la liste ci-dessous'
  const src = prepareSource(mg, 'ocr')
  assertEquals(findInSource(mg.replace('milligrammes', 'microgrammes'), src), 'absent')
  assertEquals(findInSource(mg.replace('milligrammes', 'grammes'), src), 'absent')
  // ...dans les deux sens, et en anglais.
  const microSrc = prepareSource(mg.replace('milligrammes', 'microgrammes'), 'ocr')
  assertEquals(findInSource(mg, microSrc), 'absent')
  const en = 'each film coated tablet contains 250 milligrams of micronised active substance and ' +
    'excipients with known effect as listed below in this section'
  assertEquals(findInSource(en.replace('milligrams', 'micrograms'), prepareSource(en, 'ocr')), 'absent')
  // Nutrition parentérale : « 200 cal » n'est pas « 200 kcal ».
  const cal = prepareSource('apport energetique de 200 kcal par poche de solution nutritive', 'ocr')
  assertEquals(findInSource('apport energetique de 200 cal par poche de solution nutritive', cal), 'absent')
  // Et un mot GELÉ dont l'OCR a abîmé une lettre reste toléré : le gel interdit la suppression,
  // pas la confusion graphique.
  assertEquals(findInSource(mg.replace('milligrammes', 'mllligrammes'), src), 'ocr')
})
