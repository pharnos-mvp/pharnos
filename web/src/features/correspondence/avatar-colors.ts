/**
 * Couleurs déterministes d'avatar/auteur par e-mail (palette type WhatsApp) — partagées par
 * `ConversationAvatar` (pastille) et les bulles du fil (nom de l'auteur). Module sans JSX :
 * permet d'importer ces helpers dans plusieurs composants sans casser le fast-refresh.
 */

const AVATAR_BG = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-teal-500',
  'bg-indigo-500',
] as const

// Couleur de TEXTE assortie (nom de l'auteur dans les bulles). Teinte -700 en clair (contraste
// AA ≥ 4,5:1 sur bulle blanche, même pour ambre/teal/émeraude), -300 en sombre.
const AVATAR_TEXT = [
  'text-rose-700 dark:text-rose-300',
  'text-amber-700 dark:text-amber-300',
  'text-emerald-700 dark:text-emerald-300',
  'text-sky-700 dark:text-sky-300',
  'text-violet-700 dark:text-violet-300',
  'text-fuchsia-700 dark:text-fuchsia-300',
  'text-teal-700 dark:text-teal-300',
  'text-indigo-700 dark:text-indigo-300',
] as const

function hashIndex(s: string, mod: number): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % mod
}

export const avatarColor = (email: string): string => AVATAR_BG[hashIndex(email, AVATAR_BG.length)]!
export const authorTextColor = (email: string): string =>
  AVATAR_TEXT[hashIndex(email, AVATAR_TEXT.length)]!
