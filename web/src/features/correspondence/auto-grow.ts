/**
 * Composeur auto-extensible (mockup CEO) : le champ de réponse n'a pas de hauteur fixe — il
 * grandit avec le texte jusqu'à `maxPx` (la moitié de la hauteur de la boîte), puis défile
 * en interne (le curseur reste visible, le navigateur scrolle sur la dernière ligne saisie).
 */
export function autoGrow(el: HTMLTextAreaElement | null, maxPx: number): void {
  if (!el) return
  const max = Math.max(40, maxPx)
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, max)}px`
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}
