// Noyau TESTABLE de l'Edge `checkout` — validation du client et contrat Chariow.
//
// Séparé de l'I/O pour la même raison que `checking-report-core` : tout ce qui décide
// (bornes, mapping offre → produit, forme de la requête Chariow, lecture de la réponse)
// se teste en Deno sans réseau ; `index.ts` ne garde que le transport.

/** Les DEUX offres vendables, mappées côté serveur : le navigateur ne choisit jamais un
 *  `product_id` — il nomme une offre, le serveur nomme le produit. Un id forgé est donc
 *  inopérant par construction. */
export const OFFRES_CHARIOW: Record<string, { productId: string; libelle: string }> = {
  up1: { productId: 'prd_hf86pys5', libelle: 'Mise à niveau documentaire — 1 document' },
  up3: { productId: 'prd_1u8jrq16', libelle: 'Mise à niveau documentaire — les trois documents' },
}

export const CHARIOW_ENDPOINT = 'https://api.chariow.com/v1/checkout'

/** Retour de paiement — DEUX constantes serveur, jamais une URL reçue du navigateur : le
 *  navigateur nomme une langue, le serveur nomme la page.
 *
 *  ⚠️ On revient sur `/paiement/retour`, PAS sur `/modele` : c'est la seule page de
 *  pharnos.com qui accepte d'être cadrée (`frame-ancestors 'self'` dans `_headers`). Le
 *  reste du site est en `frame-ancestors 'none'` — y revenir directement afficherait
 *  « connexion refusée » dans le cadre à l'acheteur qui vient de payer. `lang` sert au repli
 *  hors cadre, qui renvoie sur le bon miroir. */
export const RETOURS = {
  fr: 'https://pharnos.com/paiement/retour?paiement=ok&lang=fr',
  en: 'https://pharnos.com/paiement/retour?paiement=ok&lang=en',
} as const

/** Hôtes de paiement admis en redirection. Tout autre hôte dans la réponse est traité en
 *  erreur : rediriger un acheteur au milieu d'un paiement vers un domaine inattendu est la
 *  position de phishing idéale.
 *
 *  ⚠️ Cette liste et le `frame-src` de `landing/_headers` doivent rester JUMELLES : un hôte
 *  accepté ici mais absent de la CSP donne un cadre blanc, sans erreur ni repli — le pire des
 *  échecs, celui qui ne dit rien. Le test `hotes-jumeaux` échoue si elles divergent. */
export const HOTES_PAIEMENT =
  /^([a-z0-9-]+\.)*moneroo\.io$|^([a-z0-9-]+\.)*mychariow\.com$|^services\.pharnos\.com$/

/** Indicatifs des pays proposés par le formulaire — pour dédoublonner une saisie
 *  internationale : `country_code` porte déjà le pays, le numéro n'a pas à répéter le préfixe.
 *
 *  ⚠️ JUMELLE de la liste `INDICATIFS` de `landing/modele.js`. Un pays proposé au formulaire
 *  mais absent ici perd le dédoublonnage : « +229 01 96… » part en `229019…`, le processeur
 *  refuse, et le refus ressemble à une faute de l'acheteur. Le test `indicatifs-jumeaux`
 *  échoue si la liste du formulaire déborde celle-ci. */
export const INDICATIFS: Record<string, string> = {
  BJ: '229',
  BF: '226',
  CI: '225',
  GW: '245',
  ML: '223',
  NE: '227',
  SN: '221',
  TG: '228',
  GH: '233',
  GN: '224',
  LR: '231',
  NG: '234',
  SL: '232',
  CV: '238',
  GM: '220',
  MR: '222',
  TD: '235',
  CM: '237',
  CF: '236',
  CG: '242',
  CD: '243',
  GA: '241',
  GQ: '240',
  ST: '239',
  AO: '244',
  MA: '212',
  DZ: '213',
  TN: '216',
  LY: '218',
  EG: '20',
  KE: '254',
  TZ: '255',
  UG: '256',
  RW: '250',
  BI: '257',
  ET: '251',
  ZA: '27',
  MU: '230',
  MG: '261',
  ZM: '260',
  ZW: '263',
  MZ: '258',
  BW: '267',
  NA: '264',
  FR: '33',
  BE: '32',
  CH: '41',
  DE: '49',
  ES: '34',
  PT: '351',
  IT: '39',
  NL: '31',
  LU: '352',
  GB: '44',
  IE: '353',
  AT: '43',
  SE: '46',
  DK: '45',
  NO: '47',
  FI: '358',
  PL: '48',
  GR: '30',
  RO: '40',
  US: '1',
  CA: '1',
  BR: '55',
  MX: '52',
  AR: '54',
  HT: '509',
  AE: '971',
  SA: '966',
  QA: '974',
  LB: '961',
  TR: '90',
  IN: '91',
  PK: '92',
  BD: '880',
  CN: '86',
  JP: '81',
  KR: '82',
  SG: '65',
  MY: '60',
  ID: '62',
  TH: '66',
  VN: '84',
  PH: '63',
  AU: '61',
  NZ: '64',
}

const ZONE_XOF = new Set(['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG'])

/**
 * Devise de règlement selon le pays de l'acheteur — DEUX valeurs, jamais trois.
 *
 * Le prix est annoncé partout `29 € (19 000 FCFA)` : ce sont les deux seules devises que le
 * client a lues avant de cliquer. Facturer dans une troisième — le dollar, que le processeur
 * proposait par défaut hors zone — lui montre au paiement un montant qu'il n'a jamais vu
 * (« $33.68 » pour 19 000 FCFA, vu le 31/07), et le pousse à recalculer notre prix lui-même.
 * L'euro est aussi le bon choix technique : le franc CFA lui est arrimé à parité fixe, donc
 * 29 € et 19 000 FCFA désignent le même montant, pas deux prix qui dérivent.
 *
 * `null` = on ne transmet rien et la boutique facture en XOF natif.
 */
export function deviseDePaiement(paysTel: string): string | null {
  return ZONE_XOF.has(paysTel) ? null : 'EUR'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Indicatif ISO 3166-1 alpha-2 — Chariow attend le code PAYS (« FR », « CI »), pas le +225.
const PAYS_RE = /^[A-Z]{2}$/
// La référence de commande est un UUID généré par NOTRE page — toute autre forme est un forgeage.
const REF_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type CommandeValidee = {
  offre: 'up1' | 'up3'
  ref: string
  prenom: string
  nom: string
  email: string
  telephone: string
  paysTel: string
  langue: 'fr' | 'en'
}

/** Champ texte : trim + espaces normalisés, borné — null si hors bornes. */
function champ(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ')
  return s.length >= 1 && s.length <= max ? s : null
}

/** Valide le corps reçu du navigateur. Retourne la commande propre, ou la liste des champs
 *  fautifs — jamais un mélange des deux. */
export function validerCommande(
  body: Record<string, unknown>,
): { ok: true; cmd: CommandeValidee } | { ok: false; champs: string[] } {
  const fautifs: string[] = []

  const offre = typeof body.offre === 'string' && body.offre in OFFRES_CHARIOW ? body.offre : null
  if (!offre) fautifs.push('offre')

  const ref = typeof body.ref === 'string' && REF_RE.test(body.ref) ? body.ref : null
  if (!ref) fautifs.push('ref')

  const prenom = champ(body.prenom, 50)
  if (!prenom) fautifs.push('prenom')
  const nom = champ(body.nom, 50)
  if (!nom) fautifs.push('nom')

  const email = champ(body.email, 254)
  if (!email || !EMAIL_RE.test(email)) fautifs.push('email')

  const paysTel =
    typeof body.paysTel === 'string' && PAYS_RE.test(body.paysTel.toUpperCase().trim())
      ? body.paysTel.toUpperCase().trim()
      : null
  if (!paysTel) fautifs.push('paysTel')

  // Chariow exige un numéro « numérique uniquement » : on tolère la saisie humaine (espaces,
  // tirets, +) et on ne transmet que les chiffres — SANS l'indicatif, `country_code` le porte
  // déjà. Un acheteur qui tape « +229 01 96 … » avec « Bénin » sélectionné ne doit pas devenir
  // +229 229… chez le processeur : WhatsApp est le canal annoncé, un faux numéro est une
  // livraison perdue sur une commande payée. Bornes alignées sur checking-report (8–15).
  const telBrut = champ(body.telephone, 32)
  let telephone = telBrut ? telBrut.replace(/\D/g, '') : ''
  const indicatif = paysTel ? (INDICATIFS[paysTel] ?? '') : ''
  if (indicatif && telephone.startsWith(indicatif)) telephone = telephone.slice(indicatif.length)
  if (telephone.length < 8 || telephone.length > 15) fautifs.push('telephone')

  // La langue pilote la page de RETOUR — champ optionnel, défaut français, jamais une URL.
  const langue = body.langue === 'en' ? 'en' : 'fr'

  if (fautifs.length > 0) return { ok: false, champs: fautifs }
  return {
    ok: true,
    cmd: {
      offre: offre as 'up1' | 'up3',
      ref: ref as string,
      prenom: prenom as string,
      nom: nom as string,
      email: email as string,
      telephone,
      paysTel: paysTel as string,
      langue,
    },
  }
}

/** Corps de la requête Chariow. `custom_metadata.ref` porte NOTRE référence jusque dans les
 *  webhooks Pulse ; `customer_ip` porte l'IP réelle de l'acheteur (sinon Chariow verrait
 *  celle de l'infrastructure Supabase — géolocalisation et anti-fraude faussées). */
export function corpsChariow(cmd: CommandeValidee, ip: string): Record<string, unknown> {
  const devise = deviseDePaiement(cmd.paysTel)
  return {
    product_id: OFFRES_CHARIOW[cmd.offre].productId,
    email: cmd.email,
    first_name: cmd.prenom,
    last_name: cmd.nom,
    phone: { number: cmd.telephone, country_code: cmd.paysTel },
    redirect_url: RETOURS[cmd.langue],
    custom_metadata: { ref: cmd.ref, offre: cmd.offre },
    ...(devise ? { payment_currency: devise } : {}),
    // ⚠️ `customer_ip` est OBLIGATOIRE ici, contre-intuitif mais mesuré le 31/07 : sans lui,
    // Chariow voit l'IP de notre Edge (Francfort) et classe TOUS les acheteurs en `country=DE`.
    // Avec lui, un déposant béninois obtient bien `country=BJ` et ses corridors mobile money.
    // Corollaire assumé : derrière un VPN, l'acheteur est classé au pays du VPN — c'est le
    // comportement du processeur, pas le nôtre, et il vaut mieux que « tout le monde en DE ».
    ...(ip !== 'unknown' ? { customer_ip: ip } : {}),
  }
}

/** Lit la réponse Chariow et la réduit aux trois cas que le navigateur sait traiter.
 *  Tout ce qui n'est pas une URL de paiement exploitable est une erreur franche : promettre
 *  un paiement sur une réponse ambiguë ferait perdre un client déjà décidé. */
export function lireReponseChariow(
  status: number,
  corps: unknown,
):
  | { ok: true; url: string }
  | { ok: false; erreur: 'deja_achete' | 'donnees' | 'chariow'; champs?: string[] } {
  const data =
    typeof corps === 'object' && corps !== null
      ? (corps as { data?: Record<string, unknown> }).data
      : undefined
  if (status === 200 && data) {
    if (data.step === 'already_purchased') return { ok: false, erreur: 'deja_achete' }
    const payment = data.payment as { checkout_url?: unknown } | undefined
    const url = payment?.checkout_url
    if (data.step === 'payment' && typeof url === 'string' && url.startsWith('https://')) {
      // Hôte ÉPINGLÉ, pas seulement https : la seule URL qu'on transmet à un navigateur est
      // celle d'un processeur de paiement connu.
      let hote = ''
      try {
        hote = new URL(url).hostname
      } catch {
        return { ok: false, erreur: 'chariow' }
      }
      if (HOTES_PAIEMENT.test(hote)) return { ok: true, url }
    }
  }
  // 422 = Chariow refuse les DONNÉES du client, pas notre requête. Le cas nominal : un numéro
  // qui ne correspond pas à l'indicatif choisi (un déposant béninois qui dépose au Niger garde
  // son numéro béninois — c'est la norme du métier, pas l'exception). Ce refus doit revenir à
  // l'acheteur avec le champ fautif ; le renvoyer vers la boutique lui ferait ressaisir le
  // même formulaire pour se faire refuser pareil.
  // 400 comme 422 : le processeur a compris la requête et refuse ce qu'elle CONTIENT. Un 401
  // (clé) ou un 5xx, eux, ne regardent pas l'acheteur et gardent le repli.
  if (status === 400 || status === 422) {
    const detail = corps as
      | { errors?: Record<string, unknown>; message?: unknown }
      | null
    const champs = detail?.errors ? Object.keys(detail.errors).slice(0, 12) : []
    // Certaines réponses ne portent pas `errors` mais nomment le champ dans `message`
    // (« The phone.number field… ») : on le récupère, sinon l'acheteur ne saurait pas où
    // regarder.
    if (champs.length === 0 && typeof detail?.message === 'string') {
      for (const candidat of ['phone', 'email', 'first_name', 'last_name']) {
        if (detail.message.includes(candidat)) champs.push(candidat)
      }
    }
    return { ok: false, erreur: 'donnees', champs }
  }
  return { ok: false, erreur: 'chariow' }
}
