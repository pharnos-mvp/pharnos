import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'
import { avatarColor } from './avatar-colors'

/**
 * Avatar de correspondant — pastille colorée déterministe par e-mail (palette type WhatsApp),
 * partagée entre la liste Discussions et les bulles du fil (un auteur = une couleur + des
 * initiales constantes). Pas de photo : on n'en dispose pas pour les correspondants externes.
 */
export function ConversationAvatar({ email, size = 'md' }: { email: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-9 text-xs' : 'size-10 text-sm',
        avatarColor(email),
      )}
      aria-hidden
    >
      {initials(email)}
    </span>
  )
}
