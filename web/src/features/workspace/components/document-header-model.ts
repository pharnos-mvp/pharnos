// Modèle d'actions de l'EN-TÊTE DE DOCUMENT UNIQUE du CTD builder (mockup
// docs/mockups/ctd-builder-unified-header.html). L'en-tête a un CADRE CONSTANT (identité du
// document à gauche, barre d'actions à droite) ; seules les actions s'adaptent au type de
// document. Ce module est PUR (zéro React/DOM) → la logique « quels boutons pour quel document »
// est testable isolément et constitue la source unique de vérité consommée par DocumentHeader.
import type { LucideIcon } from 'lucide-react'
import type { Translatable } from '@/lib/i18n-context'

/** Fonction de traduction (sous-ensemble de useI18n().t) — injectée pour garder le module pur. */
export type TFn = (m: Translatable) => string

/** Type fonctionnel du document actif, dérivé de l'état du workspace. */
export type DocKind = 'letter' | 'form' | 'piece' | 'cover' | 'empty'

export type DocStatusTone = 'draft' | 'ready' | 'file' | 'todo' | 'auto'
export type DocActionVariant = 'default' | 'accent' | 'solid' | 'danger'

/** Entrée d'un menu déroulant (Télécharger ▾, overflow ⋯). */
export interface DocMenuItem {
  key: string
  label: string
  icon?: LucideIcon
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

/** Une action de l'en-tête : bouton, bascule, menu, ou séparateur visuel. */
export interface DocAction {
  key: string
  kind: 'button' | 'toggle' | 'menu' | 'separator'
  label?: string
  /** aria-label quand le libellé visible est masqué (icône seule / écran étroit). */
  ariaLabel?: string
  icon?: LucideIcon
  variant?: DocActionVariant
  onClick?: () => void
  /** bascule (Modifier) : état actif. */
  pressed?: boolean
  /** menu déroulant (kind === 'menu'). */
  menu?: DocMenuItem[]
  disabled?: boolean
  title?: string
  /** masque le texte sur écran étroit (l'icône reste) — responsive M2. */
  collapsible?: boolean
}

export interface DocHeaderStatus {
  tone: DocStatusTone
  label: string
  icon: LucideIcon
}

/** Contexte d'entrée du constructeur d'actions — dérivé de l'état réel du workspace. */
export interface DocActionsContext {
  kind: DocKind
  /** Notice → barre de réglages globaux (verbe/professionnels). */
  hasGlobals?: boolean
  /** Politique Regafy 3 états : 'enabled' (analyse réelle) · 'teaser' (Vitrine→upsell) · 'hidden'. */
  regafy?: 'enabled' | 'teaser' | 'hidden'
  /** Lettre en mode édition → l'en-tête révèle la mise en forme. */
  editing?: boolean
  /** Document généré par IA (≠ pièce téléversée) → « Régénérer » disponible. */
  aiGenerated?: boolean
  /** Document analysable par Regafy (pièce, ou lettre = traduction / version conforme). */
  analyzable?: boolean
  /** Analyse réelle indisponible (hors-ligne / Supabase absent / analyse en cours) → bouton désactivé. */
  analyzeDisabled?: boolean
  /** Nœud à template officiel sans document généré → « Générer » disponible (même sur une pièce). */
  canGenerate?: boolean
  handlers: Partial<{
    edit: () => void
    regenerate: () => void
    sign: () => void
    branding: () => void
    downloadPdf: () => void
    downloadDocx: () => void
    download: () => void
    upload: () => void
    reset: () => void
    settings: () => void
    analyze: () => void
    translate: () => void
    replace: () => void
    generate: () => void
    remove: () => void
  }>
}

const noop = () => {}

/**
 * Construit la liste ORDONNÉE des actions de l'en-tête pour le document actif, fidèle au mockup.
 * Source unique : DocumentHeader (écran) et les tests consomment exactement cette sortie.
 */
export function buildDocActions(ctx: DocActionsContext, t: TFn): DocAction[] {
  const h = ctx.handlers
  const labels = {
    download: t({ fr: 'Télécharger', en: 'Download' }),
    upload: t({ fr: 'Téléverser', en: 'Upload' }),
    reset: t({ fr: 'Réinitialiser', en: 'Reset' }),
    more: t({ fr: 'Plus d’actions', en: 'More actions' }),
    remove: t({ fr: 'Supprimer', en: 'Delete' }),
  }

  // Menu Télécharger ▾ (PDF/DOCX) — « garde le menu du bouton télécharger » (exigence CEO).
  const downloadMenu = (): DocAction => ({
    key: 'download',
    kind: 'menu',
    label: labels.download,
    collapsible: true,
    menu: [
      { key: 'pdf', label: 'PDF', onSelect: h.downloadPdf ?? noop },
      { key: 'docx', label: 'DOCX', onSelect: h.downloadDocx ?? noop },
    ],
  })
  const uploadBtn = (): DocAction => ({
    key: 'upload',
    kind: 'button',
    label: labels.upload,
    collapsible: true,
    onClick: h.upload,
  })
  const moreMenu = (): DocAction => ({
    key: 'more',
    kind: 'menu',
    ariaLabel: labels.more,
    menu: [{ key: 'remove', label: labels.remove, onSelect: h.remove ?? noop, destructive: true }],
  })
  // Analyser (IA Regafy) : désactivé si l'analyse réelle est indisponible (hors-ligne…) en mode
  // activé — en Vitrine le bouton reste cliquable (accroche → upsell).
  const analyzeBtn = (): DocAction => ({
    key: 'analyze',
    kind: 'button',
    label: t({ fr: 'Analyser', en: 'Analyze' }),
    variant: 'accent',
    collapsible: true,
    disabled: ctx.regafy === 'enabled' && !!ctx.analyzeDisabled,
    title:
      ctx.regafy === 'enabled' && ctx.analyzeDisabled
        ? t({ fr: 'Analyse disponible en ligne', en: 'Analysis available online' })
        : undefined,
    onClick: h.analyze,
  })
  // Traduire : accroche Vitrine (upsell) — la traduction réelle vit dans le constat Regafy (panneau).
  const translateBtn = (): DocAction => ({
    key: 'translate',
    kind: 'button',
    label: t({ fr: 'Traduire', en: 'Translate' }),
    variant: 'accent',
    collapsible: true,
    onClick: h.translate,
  })
  const generateBtn = (): DocAction => ({
    key: 'generate',
    kind: 'button',
    label: t({ fr: 'Générer', en: 'Generate' }),
    variant: 'solid',
    onClick: h.generate,
  })

  switch (ctx.kind) {
    case 'letter':
      return [
        {
          key: 'edit',
          kind: 'toggle',
          label: t({ fr: 'Modifier', en: 'Edit' }),
          pressed: !!ctx.editing,
          onClick: h.edit,
        },
        { key: 'sep1', kind: 'separator' },
        ...(ctx.analyzable && ctx.regafy && ctx.regafy !== 'hidden' ? [analyzeBtn()] : []),
        ...(ctx.aiGenerated
          ? [
              {
                key: 'regenerate',
                kind: 'button' as const,
                label: t({ fr: 'Régénérer', en: 'Regenerate' }),
                variant: 'accent' as const,
                collapsible: true,
                onClick: h.regenerate,
              },
            ]
          : []),
        {
          key: 'sign',
          kind: 'button',
          label: t({ fr: 'Signer', en: 'Sign' }),
          collapsible: true,
          // Désactivé hors mode édition : signer modifie le document (le handler re-vérifie aussi).
          disabled: !ctx.editing,
          title: ctx.editing
            ? undefined
            : t({ fr: 'Passez en mode Modifier pour signer', en: 'Switch to Edit mode to sign' }),
          onClick: h.sign,
        },
        {
          key: 'branding',
          kind: 'button',
          label: t({ fr: 'En-tête / Pied', en: 'Header / Footer' }),
          collapsible: true,
          onClick: h.branding,
        },
        // Lettre = un seul format de téléchargement (.html / .docx selon le type) → bouton simple.
        {
          key: 'download',
          kind: 'button',
          label: labels.download,
          collapsible: true,
          onClick: h.download,
        },
        uploadBtn(),
        moreMenu(),
      ]

    case 'form':
      return [
        ...(ctx.hasGlobals
          ? [
              {
                key: 'settings',
                kind: 'button' as const,
                label: t({ fr: 'Réglages', en: 'Settings' }),
                collapsible: true,
                onClick: h.settings,
              },
            ]
          : []),
        { key: 'reset', kind: 'button', label: labels.reset, collapsible: true, onClick: h.reset },
        downloadMenu(),
        uploadBtn(),
        moreMenu(),
      ]

    case 'piece':
      return [
        // Nœud à template officiel sans document généré : « Générer » reste accessible même quand
        // une pièce est l'onglet actif (parité avec l'ancienne barre d'actions).
        ...(ctx.canGenerate ? [generateBtn()] : []),
        ...(ctx.regafy && ctx.regafy !== 'hidden' ? [analyzeBtn()] : []),
        ...(ctx.regafy === 'teaser' ? [translateBtn()] : []),
        {
          key: 'download',
          kind: 'button',
          label: labels.download,
          collapsible: true,
          onClick: h.download,
        },
        {
          key: 'replace',
          kind: 'button',
          label: t({ fr: 'Remplacer', en: 'Replace' }),
          collapsible: true,
          onClick: h.replace,
        },
        moreMenu(),
      ]

    case 'cover':
      return [
        {
          key: 'auto',
          kind: 'toggle',
          label: t({ fr: 'Autogénéré', en: 'Auto-generated' }),
          pressed: true,
          title: t({
            fr: 'Page générée automatiquement à la compilation',
            en: 'Page generated automatically at compilation',
          }),
        },
        uploadBtn(),
      ]

    case 'empty':
      return [generateBtn(), uploadBtn()]
  }
}
