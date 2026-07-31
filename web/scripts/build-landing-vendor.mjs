/**
 * Bundle NAVIGATEUR de la bibliothèque `docx` pour la landing (sans étape de build).
 *
 *   Régénérer : `npm run build:landing-vendor` (depuis web/), puis committer
 *   `landing/vendor/docx.esm.js`. À relancer quand la dépendance `docx` change de version.
 *
 * POURQUOI : le formulaire « Générer ma lettre » de /modele produit un DOCX conforme DANS LE
 * navigateur — aucune donnée produit ne part sur le réseau, et la landing n'a ni node_modules ni
 * bundler. La CSP `script-src 'self'` interdit tout CDN : la bibliothèque doit être servie par
 * pharnos.com. C'est la même `docx` (version identique) que le générateur des modèles — le
 * fichier généré au clic et le fichier généré au build sortent du même moteur.
 *
 * Chargé en `import()` PARESSEUX au premier clic seulement : ~300 Ko qu'aucun visiteur qui ne
 * génère pas de lettre ne doit télécharger.
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const RACINE = path.resolve(import.meta.dirname, '../..')
const SORTIE = path.join(RACINE, 'landing', 'vendor', 'docx.esm.js')

fs.mkdirSync(path.dirname(SORTIE), { recursive: true })

const resultat = await build({
  stdin: {
    contents: `export { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, Footer, ExternalHyperlink, ShadingType, VerticalAlign } from 'docx'`,
    resolveDir: path.resolve(import.meta.dirname, '..'),
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  outfile: SORTIE,
  logLevel: 'silent',
  metafile: true,
})

const octets = fs.statSync(SORTIE).size
if (octets > 900_000) {
  // Un bundle qui triple de taille signale un import qui a embarqué Node ou une dépendance
  // entière — on échoue plutôt que de faire télécharger ça à un navigateur.
  throw new Error(`docx.esm.js pèse ${octets} octets — au-delà du budget de 900 Ko`)
}
console.log(
  `landing/vendor/docx.esm.js écrit — ${Math.round(octets / 1024)} Ko (avertissements : ${resultat.warnings.length})`,
)
