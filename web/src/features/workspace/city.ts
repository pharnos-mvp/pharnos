/**
 * Extraction **best-effort** de la ville depuis une adresse libre (titulaire d'AMM) → utilisée
 * dans la date de la lettre (« Ville, le … »). Couvre les formes courantes :
 *  - « … Ville - 400023 » (ville juste avant un code postal) ;
 *  - « …, Ville, Pays » (avant-dernier segment).
 * Déterministe ; une extraction LLM (Lot B, Gemini) pourra couvrir les cas complexes plus tard.
 */

function cleanCity(s: string): string {
  // Garde le dernier segment après un tiret (« Dist. - Mehsana » → « Mehsana ») + nettoie les bords.
  const last = s.split(/\s[-–]\s/).pop() ?? s
  return last.replace(/^[\s\W]+|[\s\W]+$/g, '').trim()
}

export function extractCity(address: string | null | undefined): string | null {
  if (!address || !address.trim()) return null
  const parts = address
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)

  // 1) Ville juste avant un code postal (« Mumbai - 400023 »…). On prend le **dernier** segment
  // correspondant (le code postal réel est en fin d'adresse ; évite un n° de rue/parcelle précoce).
  for (let k = parts.length - 1; k >= 0; k--) {
    const m = /^(.+?)[\s-]+\d{3,6}\b/.exec(parts[k] ?? '')
    if (m?.[1] && /[a-zà-ÿ]/i.test(m[1])) return cleanCity(m[1])
  }
  // 2) « …, Ville, Pays » : avant-dernier segment alphabétique (sans long nombre).
  const alpha = parts.filter((s) => /[a-zà-ÿ]/i.test(s) && !/\d{3,}/.test(s))
  if (alpha.length >= 2) return cleanCity(alpha[alpha.length - 2] ?? '')
  if (alpha.length === 1) return cleanCity(alpha[0] ?? '')
  return null
}
