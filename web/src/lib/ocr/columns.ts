/**
 * Remise en ORDRE DE LECTURE d'une page à plusieurs colonnes — module PUR, sans Tesseract ni DOM.
 *
 * ⚠️ **Pourquoi ce module existe.** Constaté en direct sur une notice client réelle (KV-Kacin 500,
 * dépliant bilingue FR/EN sur deux colonnes) : Tesseract lit la page LIGNE PAR LIGNE, en traversant
 * les colonnes. Le corpus de contrôle ressortait avec l'anglais et le français entrelacés sur la
 * même ligne, et une phrase française coupée par quatre-vingt-dix caractères d'anglais :
 *
 *     …actif contre un large spectre d'organismes à
 *     INDICATIONS: Amikacin sulfate is an aminoglycoside antibiotic … spectrum of Gram négatif.
 *
 * Le modèle, lui, lit l'image correctement et cite une phrase française CONTIGUË. Cette citation
 * n'existe alors nulle part dans le corpus : verdict `not_found`, rejeu, puis rubrique rétrogradée
 * en « Non fourni » sur un document parfaitement correct. C'est exactement le défaut que le
 * protocole à deux canaux existe pour empêcher, réintroduit par la mise en page.
 *
 * Les dépliants bilingues à deux colonnes sont la norme en UEMOA : ce n'est pas un cas limite.
 */

/** Cadre d'une ligne reconnue, dans le repère de l'image. */
export interface LineBox {
  x0: number
  y0: number
  x1: number
  text: string
}

/**
 * Part de lignes qu'une gouttière peut couper avant de cesser d'en être une. Quelques titres
 * pleine largeur traversent toujours une mise en page à deux colonnes : les compter comme une
 * réfutation ferait manquer toutes les vraies gouttières.
 */
const MAX_STRADDLE_SHARE = 0.2

/** Zone où chercher la gouttière — une colonne ne commence jamais dans les 25 % extrêmes. */
const SEARCH_FROM = 0.25
const SEARCH_TO = 0.75

/** En deçà, « colonnes » n'a pas de sens : trop peu de lignes pour que la géométrie prouve quoi que ce soit. */
const MIN_LINES_FOR_COLUMNS = 8

/**
 * Rend le texte des lignes dans un ordre où CHAQUE COLONNE EST CONTIGUË.
 *
 * L'ordre produit n'est pas destiné à être lu par un humain — c'est un corpus de CONTRÔLE. Ce qui
 * compte est qu'un passage cité par le modèle s'y retrouve d'un seul tenant. D'où le découpage en
 * BANDES : une ligne pleine largeur est un titre, elle clôt ce qui précède et ouvre ce qui suit, et
 * chaque bande est vidée colonne par colonne à sa place dans le document.
 *
 * Sans gouttière franche, on rend l'ordre d'origine : inventer des colonnes là où il n'y en a pas
 * disperserait un texte qui, lui, était contigu.
 */
export function readingOrder(lines: readonly LineBox[]): string[] {
  const gutter = findGutter(lines)
  if (gutter === null) return lines.map((l) => l.text)

  const byY = (a: LineBox, b: LineBox) => a.y0 - b.y0
  const ordered = [...lines].sort(byY)
  const out: string[] = []
  let band: LineBox[] = []

  // ⚠️ Découpage en BANDES, et non hissage des lignes pleine largeur en tête. Hisser garantissait la
  // contiguïté des colonnes mais détruisait l'ordre global : sur une notice réelle (KV-Super Relief),
  // le corpus commençait par la FIN du document. Une ligne pleine largeur est un titre : elle clôt ce
  // qui précède et ouvre ce qui suit. Chaque bande est donc vidée colonne par colonne, à sa place.
  const flush = () => {
    if (band.length === 0) return
    const left = band.filter((l) => l.x1 <= gutter)
    const right = band.filter((l) => l.x0 >= gutter)
    for (const l of [...left, ...right]) out.push(l.text)
    band = []
  }

  for (const line of ordered) {
    if (line.x0 < gutter && line.x1 > gutter) {
      flush()
      out.push(line.text)
      continue
    }
    band.push(line)
  }
  flush()
  return out
}

/**
 * Cherche une gouttière verticale : l'abscisse que le moins de lignes traversent.
 *
 * Rend `null` s'il n'existe aucune position assez franche, ou si chaque côté ne porte pas une part
 * substantielle du texte — une marge vide n'est pas une colonne, et la traiter comme telle
 * réordonnerait une page à une seule colonne pour rien.
 */
function findGutter(lines: readonly LineBox[]): number | null {
  if (lines.length < MIN_LINES_FOR_COLUMNS) return null
  const minX = Math.min(...lines.map((l) => l.x0))
  const maxX = Math.max(...lines.map((l) => l.x1))
  const span = maxX - minX
  if (span <= 0) return null

  let best: { x: number; straddle: number } | null = null
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const x = minX + span * (SEARCH_FROM + ((SEARCH_TO - SEARCH_FROM) * i) / steps)
    const straddle = lines.filter((l) => l.x0 < x && l.x1 > x).length
    if (!best || straddle < best.straddle) best = { x, straddle }
  }
  if (!best || best.straddle > lines.length * MAX_STRADDLE_SHARE) return null

  // Les deux côtés doivent porter du texte. Sans cette vérification, une page à une seule colonne
  // large trouverait toujours une « gouttière » dans sa marge droite.
  const left = lines.filter((l) => l.x1 <= best.x).length
  const right = lines.filter((l) => l.x0 >= best.x).length
  const substantial = lines.length * 0.2
  return left >= substantial && right >= substantial ? best.x : null
}
