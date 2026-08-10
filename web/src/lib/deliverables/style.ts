/**
 * Constantes de mise en page des livrables — partagées par le DOCX et le PDF.
 *
 * Elles vivent à part pour une raison précise : les deux rendus doivent être visuellement
 * identiques. Une couleur ou un corps dupliqué dans chaque module finirait par diverger, et le
 * client recevrait un Word et un PDF qui ne se ressemblent pas.
 */

/** Navy du gabarit ABMed 2026 — titres et sous-titres. */
export const BLUE = '0B3D92'
/** Gris des mentions secondaires : pagination, en-tête courant, marqueur d'absence. */
export const GREY = '595959'
/** Filets de tableau. */
export const RULE = 'BFBFBF'
/** Fond des bandeaux et des en-têtes de tableau. */
export const BAND = 'F2F4F8'

export const FONT = 'Arial'
export const PT = 11
export const TITLE_PT = 12
export const SMALL_PT = 9.5
