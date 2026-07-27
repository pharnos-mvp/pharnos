// Contrat du cœur de `checking-report`. Cette fonction est une surface PUBLIQUE, sans
// authentification : chaque test ci-dessous décrit une entrée hostile ou malformée qu'elle doit
// refuser, et ce qui doit rester vrai du rapport envoyé sous notre marque.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import {
  buildReportEmail,
  buildTeamNotice,
  clientIp,
  contactBucketKey,
  escapeHtml,
  fixLine,
  pickLang,
  resultFor,
  sanitizeAnswers,
  validateRequest,
  type ValidRequest,
} from './checking-report-core.ts'

const baseBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  lang: 'fr',
  channel: 'email',
  contact: 'ra@laboratoire.com',
  pays: 'bj',
  op: 'enr',
  type: 'spec',
  answers: { m1: 'ok', rcp: 'nc', pay: 'ko' },
  consent: true,
  ...over,
})

Deno.test('validateRequest — accepte un payload nominal et normalise', () => {
  const v = validateRequest(baseBody())
  assert(v)
  assertEquals(v.channel, 'email')
  assertEquals(v.country, 'bj')
  assertEquals(v.newsletter, false)
  assertEquals(v.answers, { m1: 'ok', rcp: 'nc', pay: 'ko' })
})

Deno.test('validateRequest — refuse un canal inconnu plutôt que de choisir un défaut', () => {
  assertEquals(validateRequest(baseBody({ channel: 'sms' })), null)
  assertEquals(validateRequest(baseBody({ channel: undefined })), null)
})

Deno.test('validateRequest — refuse un pays inventé (jamais de repli silencieux)', () => {
  // Un repli sur le Bénin produirait un rapport citant l'ABMed à quelqu'un qui dépose ailleurs.
  assertEquals(validateRequest(baseBody({ pays: 'zz' })), null)
  assertEquals(validateRequest(baseBody({ pays: '' })), null)
  assertEquals(validateRequest(baseBody({ pays: { k: 'bj' } })), null)
})

Deno.test('validateRequest — refuse une opération ou un type de produit hors énumération', () => {
  assertEquals(validateRequest(baseBody({ op: 'variation' })), null)
  assertEquals(validateRequest(baseBody({ type: 'biosimilaire' })), null)
})

Deno.test('validateRequest — valide le contact selon le canal', () => {
  assertEquals(validateRequest(baseBody({ contact: 'pas-un-email' })), null)
  assertEquals(validateRequest(baseBody({ contact: '' })), null)
  assert(validateRequest(baseBody({ channel: 'whatsapp', contact: '+229 01 02 03 04' })))
  // Un e-mail dans le canal WhatsApp ne passe pas le format téléphone.
  assertEquals(validateRequest(baseBody({ channel: 'whatsapp', contact: 'ra@labo.com' })), null)
})

Deno.test('validateRequest — refuse une requête sans aucune réponse exploitable', () => {
  assertEquals(validateRequest(baseBody({ answers: {} })), null)
  assertEquals(validateRequest(baseBody({ answers: null })), null)
  assertEquals(validateRequest(baseBody({ answers: 'ok' })), null)
  assertEquals(validateRequest(baseBody({ answers: { inconnu: 'ok' } })), null)
})

Deno.test('validateRequest — exige la preuve de consentement', () => {
  // La case cochée dans le navigateur n'est pas une preuve : sans ce drapeau, ni envoi ni
  // conservation du contact.
  assertEquals(validateRequest(baseBody({ consent: false })), null)
  assertEquals(validateRequest(baseBody({ consent: undefined })), null)
  assertEquals(validateRequest(baseBody({ consent: 'oui' })), null)
  assertEquals(validateRequest(baseBody())!.consent, true)
})

Deno.test('validateRequest — un numéro sans chiffres n’est pas un numéro', () => {
  // `PHONE_RE` seule accepte « ()()() » : on exige une densité de chiffres plausible.
  assertEquals(validateRequest(baseBody({ channel: 'whatsapp', contact: '()()()' })), null)
  assertEquals(validateRequest(baseBody({ channel: 'whatsapp', contact: '------' })), null)
  assertEquals(validateRequest(baseBody({ channel: 'whatsapp', contact: '12 34' })), null)
  assert(validateRequest(baseBody({ channel: 'whatsapp', contact: '+22901020304' })))
})

Deno.test('clientIp — prend la dernière entrée XFF, jamais celle que l’appelant a écrite', () => {
  // Cloudflare AJOUTE l'IP réelle à la fin de la chaîne : lire `split(',')[0]` reviendrait à
  // laisser l'appelant choisir sa propre clé de rate-limit.
  const h = new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' })
  assertEquals(clientIp(h), '203.0.113.7')
  // `cf-connecting-ip` fait autorité quand il est présent.
  h.set('cf-connecting-ip', '198.51.100.4')
  assertEquals(clientIp(h), '198.51.100.4')
  assertEquals(clientIp(new Headers()), 'unknown')
})

Deno.test('contactBucketKey — clé stable, normalisée, et ne contient pas la PII', async () => {
  const a = await contactBucketKey('RA@Laboratoire.com')
  const b = await contactBucketKey('  ra@laboratoire.com  ')
  assertEquals(a, b)
  assert(!a.includes('laboratoire'))
  assert(!a.includes('@'))
  assertEquals(a.length, 32)
  assert(a !== (await contactBucketKey('autre@laboratoire.com')))
})

Deno.test('validateRequest — borne le contact à la longueur de colonne', () => {
  const long = 'a'.repeat(300) + '@labo.com'
  const v = validateRequest(baseBody({ contact: long }))
  // Tronqué à 254 : le '@' disparaît, donc la validation d'e-mail échoue — refus, pas d'insert
  // qui exploserait sur la contrainte SQL.
  assertEquals(v, null)
})

Deno.test('sanitizeAnswers — écarte les identifiants hors questionnaire et les valeurs inconnues', () => {
  // `JSON.parse` — pas un littéral objet : `{ __proto__: … }` invoquerait le setter de prototype
  // et ne créerait aucune clé propre, le test ne prouverait rien. C'est bien ce chemin-là que
  // l'Edge emprunte sur un corps de requête.
  const out = sanitizeAnswers(
    JSON.parse('{"m1":"ok","__proto__":"ok","inexistant":"ok","rcp":"PARFAIT","pay":"ko"}'),
    'enr',
    'spec',
  )
  assertEquals(out, { m1: 'ok', pay: 'ko' })
  assertEquals(Object.getPrototypeOf(out), Object.prototype)
})

Deno.test("sanitizeAnswers — refuse « na » sur un item qui ne l'offre pas", () => {
  // Faille corrigée : `na` sort l'item du dénominateur. L'accepter partout permettait de forger
  // un « 100/100 · prêt pour le dépôt » en répondant `na` à tout sauf aux trois verrous.
  assertEquals(sanitizeAnswers({ m1: 'na' }, 'enr', 'spec'), {}) // verrou CTD : pas de « na »
  assertEquals(sanitizeAnswers({ m3: 'na' }, 'enr', 'spec'), {}) // Module 3 : pas de « na »
  assertEquals(sanitizeAnswers({ pgr: 'na' }, 'enr', 'spec'), { pgr: 'na' }) // exigence conditionnelle
})

Deno.test('resultFor — un « na » massif ne fabrique pas un dossier prêt', () => {
  const answers: Record<string, string> = { m1: 'ok', ech: 'ok', pay: 'ok' }
  for (const id of ['rcp', 'not', 'etiq', 'btif', 'pgr', 'dmf', 'm2', 'qos', 'm3', 'm4', 'm5']) {
    answers[id] = 'na'
  }
  const v = validateRequest(baseBody({ answers }))!
  const r = resultFor(v)
  assert(r.score < 100, `score forgé : ${r.score}`)
  assert(r.verdict !== 'ready', `verdict forgé : ${r.verdict}`)
  assertEquals(r.complete, false)
})

Deno.test('sanitizeAnswers — respecte le filtre par type de produit', () => {
  // `dis` (dissolution comparée) n'existe que pour les génériques.
  assertEquals(sanitizeAnswers({ dis: 'ok' }, 'enr', 'spec'), {})
  assertEquals(sanitizeAnswers({ dis: 'ok' }, 'enr', 'gen'), { dis: 'ok' })
})

Deno.test('sanitizeAnswers — ne fait pas confiance à un type non objet', () => {
  assertEquals(sanitizeAnswers(['m1'], 'enr', 'spec'), {})
  assertEquals(sanitizeAnswers('m1=ok', 'enr', 'spec'), {})
  assertEquals(sanitizeAnswers(null, 'enr', 'spec'), {})
})

Deno.test('resultFor — applique le barème du serveur, jamais un score posté', () => {
  const v = validateRequest(baseBody({ score: 100, verdict: 'ready' }))!
  const r = resultFor(v)
  // Le client prétend 100/ready ; les verrous « échantillons » et « paiement » ne sont pas
  // satisfaits, donc le serveur conclut au blocage.
  assert(r.score < 100)
  assertEquals(r.verdict, 'gate_fail')
})

Deno.test('resultFor — un verrou sans réponse reste fermé', () => {
  const v = validateRequest(baseBody({ answers: { m1: 'ok' } }))!
  const r = resultFor(v)
  assertEquals(r.gateOk, 1)
  assertEquals(r.gateTotal, 3)
  assertEquals(r.verdict, 'gate_fail')
})

Deno.test('escapeHtml — neutralise les caractères actifs', () => {
  assertEquals(escapeHtml(`<script>"x"&'y'`), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;')
})

Deno.test('pickLang — résout les libellés bilingues et les chaînes uniques', () => {
  assertEquals(pickLang(['bonjour', 'hello'], 'en'), 'hello')
  assertEquals(pickLang(['bonjour', 'hello'], 'fr'), 'bonjour')
  assertEquals(pickLang('Mali', 'en'), 'Mali')
})

Deno.test('fixLine — distingue « à prévoir » et « à reprendre » et cite l’écart', () => {
  const item = { piece: ['un RCP conforme', 'a compliant SmPC'], ncNote: ['Non conforme', 'Not compliant'] }
  assertStringIncludes(fixLine(item, 'ko', 'fr'), 'À prévoir : un RCP conforme')
  assertStringIncludes(fixLine(item, 'nc', 'fr'), 'écart relevé')
  assertStringIncludes(fixLine(item, 'ko', 'en'), 'To prepare: a compliant SmPC')
})

Deno.test('fixLine — une recommandation sur mesure prime sur le gabarit', () => {
  const item = { piece: ['x', 'x'], fixMap: { ko: ['Contactez l’autorité.', 'Contact the authority.'] } }
  assertEquals(fixLine(item, 'ko', 'fr'), 'Contactez l’autorité.')
})

Deno.test('buildReportEmail — porte le score, le verdict, les verrous et la portée', () => {
  const v = validateRequest(baseBody())!
  const r = resultFor(v)
  const { subject, html } = buildReportEmail(v, r)

  assertStringIncludes(subject, `${r.score}/100`)
  assertStringIncludes(subject, 'Enregistrement')
  assertStringIncludes(html, `${r.score}`)
  assertStringIncludes(html, 'Verrou de réception non satisfait')
  assertStringIncludes(html, `${r.gateOk}/${r.gateTotal}`)
  // La réserve juridique et la version du barème accompagnent TOUJOURS le rapport.
  assertStringIncludes(html, 'Portée du diagnostic.')
  // Le nom d'agence est échappé (`l'ABMed` → `l&#39;ABMed`) : c'est la défense en profondeur
  // attendue, le jour où ce libellé viendra d'une base plutôt que du code.
  assertStringIncludes(html, 'la recevabilité relève exclusivement de l&#39;ABMed')
  assertStringIncludes(html, r.version)
})

Deno.test('buildReportEmail — cite l’autorité du pays choisi, pas une autre', () => {
  const v = validateRequest(baseBody({ pays: 'sn' }))!
  const sn = buildReportEmail(v, resultFor(v))
  assertStringIncludes(sn.html, 'l&#39;ARP')
  assert(!sn.html.includes('ABMed'))
})

Deno.test('buildReportEmail — bascule intégralement en anglais', () => {
  const v = validateRequest(baseBody({ lang: 'en' }))!
  const { html } = buildReportEmail(v, resultFor(v))
  assertStringIncludes(html, 'Your completeness diagnostic')
  assertStringIncludes(html, 'Reception gate not met')
  assertStringIncludes(html, 'Scope of this diagnostic.')
  assert(!html.includes('Portée du diagnostic'))
})

Deno.test('buildReportEmail — un dossier complet ne montre pas de plan vide', () => {
  const answers: Record<string, string> = {}
  for (const id of ['m1', 'rcp', 'not', 'etiq', 'btif', 'pgr', 'dmf', 'm2', 'qos', 'm3', 'm4', 'm5', 'ech', 'pay']) {
    answers[id] = 'ok'
  }
  const v = validateRequest(baseBody({ answers }))!
  const r = resultFor(v)
  assertEquals(r.verdict, 'ready')
  const { html } = buildReportEmail(v, r)
  assertStringIncludes(html, 'Rien ne manque à votre déclaration')
  assert(!html.includes('plan de préparation'))
})

Deno.test("buildTeamNotice — ne diffuse le numéro qu'en interne, échappé", () => {
  const v: ValidRequest = {
    ...validateRequest(baseBody({ channel: 'whatsapp', contact: '+229 01 02 03 04' }))!,
  }
  const { subject, html } = buildTeamNotice(v, resultFor(v))
  assertStringIncludes(subject, 'demande WhatsApp')
  assertStringIncludes(html, '+229 01 02 03 04')
  assert(!html.includes('<script'))
})
