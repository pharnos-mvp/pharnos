// Code d'invitation plateforme (accès par privilège, migration 0063).
//
// Le prospect arrive via pharnos.com/i/CODE → app.pharnos.com/?invite=CODE, puis passe par
// l'OAuth Google qui PERD la query string. On capture donc le code AVANT l'auth (appelé depuis
// main.tsx) et on le garde en localStorage jusqu'à la création de l'organisation.

const STORAGE_KEY = 'pharnos.inviteCode'
// Même format que la contrainte SQL de platform_invites (majuscules/chiffres/tirets, 3-32).
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidInviteCodeFormat(raw: string): boolean {
  return CODE_RE.test(normalizeInviteCode(raw))
}

/** À appeler au boot (pré-auth) : stocke `?invite=CODE` s'il est présent et bien formé. */
export function captureInviteCodeFromUrl(): void {
  try {
    const code = new URLSearchParams(window.location.search).get('invite')
    if (code && isValidInviteCodeFormat(code)) {
      window.localStorage.setItem(STORAGE_KEY, normalizeInviteCode(code))
    }
  } catch {
    // localStorage indisponible (navigation privée stricte) : le prospect saisira le code à la main.
  }
}

export function getStoredInviteCode(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
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
