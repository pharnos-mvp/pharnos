import { Droplet, Pill, Syringe } from 'lucide-react'

/** Comprimé unique (style lucide) : cercle + barre de sécabilité. */
function TabletIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="3.3" x2="12" y2="20.7" />
    </svg>
  )
}

/** Icône produit selon la forme galénique (comprimé / injectable / liquide / gélule). */
export function ProductIcon({ forme, className }: { forme: string; className?: string }) {
  const f = (forme || '').toLowerCase()
  if (/comprim|cachet|dragée|dragee|tablet/.test(f)) return <TabletIcon className={className} />
  if (/inject|vaccin|ampoule|seringue|perfusion|lyophilis/.test(f))
    return <Syringe className={className} />
  if (/sirop|solution|suspension|buvable|goutte|collyre|spray|nasal|émulsion|emulsion/.test(f))
    return <Droplet className={className} />
  return <Pill className={className} /> // gélule, capsule, et défaut
}
