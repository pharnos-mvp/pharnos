// Présentation PARTAGÉE des actions de document (icônes + classes de variante) — source unique
// consommée par l'en-tête horizontal (DocumentHeader, ≥ lg) ET la barre d'onglets compacte
// (DocumentActionsBar, < lg). Pas de composant ici (constantes pures) → import léger et
// pas d'avertissement fast-refresh. Le modèle (quels boutons) vit dans document-header-model.ts.
import {
  Download,
  FileDown,
  FileText,
  Languages,
  MoreHorizontal,
  PanelTop,
  Pencil,
  Replace,
  RotateCcw,
  ScanSearch,
  Signature,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'

/** Icône par clé d'action (le modèle reste agnostique du jeu d'icônes). */
export const ACTION_ICON: Record<string, LucideIcon> = {
  edit: Pencil,
  regenerate: Sparkles,
  sign: Signature,
  branding: PanelTop,
  download: Download,
  upload: Upload,
  reset: RotateCcw,
  settings: SlidersHorizontal,
  analyze: ScanSearch,
  translate: Languages,
  replace: Replace,
  generate: Sparkles,
  auto: Sparkles,
  more: MoreHorizontal,
  remove: Trash2,
}

export const MENU_ICON: Record<string, LucideIcon> = {
  pdf: FileText,
  docx: FileDown,
  remove: Trash2,
}

/** Variante « accent » (analyse/traduction) : contour émeraude. */
export const ACCENT_CLS =
  'border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/60 dark:text-emerald-300 dark:hover:bg-emerald-500/10'
/** Variante « solid » (Générer) : rempli navy (marque). */
export const SOLID_CLS = 'bg-brand text-brand-foreground hover:bg-brand/90 border-transparent'
