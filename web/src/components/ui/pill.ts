import { cva } from 'class-variance-authority'

/**
 * Pilule de SOUS-NAVIGATION intra-page — le pattern unique du DS (rail Compte, onglets Catalogue,
 * sections Admin). Extraction de la dette tracée en revue LOT 7 (3 copies divergentes : la variante
 * Catalogue avait perdu l'anneau de focus clavier). Active = `bg-info text-white` (AA 4,63:1 en
 * sombre depuis le fix token `--info`). S'applique à un `<button>` OU un `<NavLink>` ; l'état actif
 * est TOUJOURS doublé d'`aria-current` côté appelant (a11y 1.4.1 — jamais la couleur seule).
 */
export const pillVariants = cva(
  'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium transition-colors ' +
    'outline-none focus-visible:ring-ring/60 focus-visible:ring-2 focus-visible:ring-offset-2',
  {
    variants: {
      active: {
        true: 'bg-info text-white',
        false: 'text-muted-foreground hover:bg-accent',
      },
    },
    defaultVariants: { active: false },
  },
)
