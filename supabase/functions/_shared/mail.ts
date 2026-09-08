// Adresse de réponse des e-mails que Pharnos envoie EN SON NOM (commande, livraison, rapport).
//
// ⚠️ `EMAIL_FROM` vaut `noreply@pharnos.com`, qui n'a AUCUNE règle dans Cloudflare Email Routing,
// et le catch-all du domaine est réglé sur « Drop ». Sans `Reply-To`, la réponse d'un client est
// donc détruite EN SILENCE : ni rebond chez lui, ni trace chez nous. Toute réponse doit atterrir
// sur une adresse réellement routée — c'est la seule raison d'être de ce module.
//
// Ne s'applique PAS aux e-mails envoyés au nom d'une organisation cliente (relances de dossier,
// veille fabricant) : là, la réponse appartient à l'émetteur du dossier, jamais à Pharnos.
const REPONSE_DEFAUT = 'contact@pharnos.com'

// Même motif que `lifecycle-reminders` : il exclut " ' < > , ; : — les caractères qui plient un
// en-tête. Ici la valeur vient de l'OPÉRATEUR, pas d'un client : le risque n'est donc pas
// l'injection mais la PANNE. Une adresse mal saisie fait rejeter la requête entière par Resend, et
// l'e-mail de livraison d'une commande PAYÉE ne part pas. Un réglage de confort ne doit jamais
// pouvoir casser une livraison : on dégrade vers le défaut, on ne casse pas.
const EMAIL_RE = /^[^\s@"'<>,;:]+@[^\s@"'<>,;:]+\.[^\s@"'<>,;:]+$/

/** Adresse `Reply-To` des e-mails signés Pharnos. Surchargeable par `EMAIL_REPLY_TO`. */
export function adresseReponse(): string {
  const brut = (Deno.env.get('EMAIL_REPLY_TO') ?? '').trim()
  return EMAIL_RE.test(brut) ? brut : REPONSE_DEFAUT
}
