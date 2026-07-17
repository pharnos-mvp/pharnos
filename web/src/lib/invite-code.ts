// Code d'invitation plateforme (accès par privilège, migration 0063).
//
// Le prospect arrive via pharnos.com/i/CODE → app.pharnos.com/?invite=CODE, puis passe par
// l'OAuth Google qui PERD la query string. On capture donc le code AVANT l'auth (appelé depuis
// main.tsx) et on le garde en localStorage jusqu'à la création de l'organisation.

const STORAGE_KEY = 'pharnos.inviteCode'
// Même format que la contrainte SQL de platform_invites (majuscules/chiffres/tirets, 3-32).
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/
// L'attribution rémunère les experts : un code capturé ne doit PAS survivre des jours sur un
// navigateur partagé (il serait crédité à tort au prochain inscrit). 1 h couvre largement
// l'aller-retour OAuth, qui se joue en secondes.
const TTL_MS = 60 * 60 * 1000

export function normalizeInviteCode(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase()
}

export function isValidInviteCodeFormat(raw: string): boolean {
  return CODE_RE.test(normalizeInviteCode(raw))
}

/** À appeler au boot (pré-auth) : stocke `?invite=CODE` s'il est présent et bien formé. */
export function captureInviteCodeFromUrl(): void {
  try {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('invite')
    if (code && isValidInviteCodeFormat(code)) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ code: normalizeInviteCode(code), at: Date.now() }),
      )
      // Le code est en storage : on nettoie l'URL (pas de code résiduel dans la barre/l'historique).
      url.searchParams.delete('invite')
      window.history.replaceState(null, '', url.toString())
    }
  } catch {
    // localStorage indisponible (navigation privée stricte) : le prospect saisira le code à la main.
  }
}

export function getStoredInviteCode(): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { code?: unknown; at?: unknown }
    if (typeof parsed.code !== 'string' || typeof parsed.at !== 'number') return ''
    if (Date.now() - parsed.at > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY)
      return ''
    }
    return parsed.code
  } catch {
    return ''
  }
}

export function clearStoredInviteCode(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // rien à nettoyer
  }
}
