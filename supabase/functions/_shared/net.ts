// Lecture réseau partagée par les Edge publiques — sans rien tirer d'autre : `checkout` n'a
// pas à embarquer le référentiel du Checking Standard pour lire une adresse IP.

/**
 * IP réelle de l'appelant.
 *
 * `x-forwarded-for.split(',')[0]` — le réflexe habituel — est FAUX derrière Cloudflare : le proxy
 * AJOUTE l'IP client à la fin de la chaîne existante, donc la première entrée est celle que
 * l'appelant a bien voulu écrire. Un attaquant y met ce qu'il veut et son plafond par IP saute.
 * On prend `cf-connecting-ip`, sinon la DERNIÈRE entrée XFF.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf.slice(0, 64)
  const xff = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return (xff[xff.length - 1] ?? 'unknown').slice(0, 64)
}
