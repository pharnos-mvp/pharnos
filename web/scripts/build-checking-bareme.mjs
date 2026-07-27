// Recopie le barème du Checking Standard depuis `landing/checking/` (SOURCE UNIQUE, servie telle
// quelle au navigateur) vers `supabase/functions/_shared/checking/`, pour que l'Edge Function
// `checking-report` n'ait AUCUN import remontant au-dessus de `supabase/`.
//
// Pourquoi une copie plutôt qu'un import relatif : `supabase functions deploy` enracine son bundle
// sur `supabase/functions`. Un import `../../../landing/…` type-checke en local mais n'est pas
// garanti d'entrer dans l'eszip déployé — la panne se verrait en production, sur le bouton
// « Recevoir par e-mail », pas en CI. La copie rend le bundle autonome ; la garde zéro-diff en CI
// rend la divergence impossible (même patron que `landing/en/`).
//
//   Régénérer : `npm run build:checking-bareme` (depuis web/). À lancer après TOUTE modif du barème.
//
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const SRC_DIR = path.join(ROOT, 'landing', 'checking')
const OUT_DIR = path.join(ROOT, 'supabase', 'functions', '_shared', 'checking')

// `templates.js` n'est pas copié : seule la page publique l'utilise (prévisualiseur de modèles).
const FILES = ['referentiel.js', 'scoring.js']

const BANNER = (name) =>
  `/* FICHIER GENERE par web/scripts/build-checking-bareme.mjs a partir de\n` +
  ` * landing/checking/${name} — NE PAS EDITER A LA MAIN.\n` +
  ` * Modifier la source, puis lancer \`npm run build:checking-bareme\` (depuis web/).\n` +
  ` * La CI regenere et exige zero diff : la copie ne peut pas deriver de la source. */\n`

/* Les sources portent un `?v=` sur leurs imports : c'est le seul moyen de casser le cache
   navigateur, Cloudflare ignorant le Cache-Control de `_headers`. Deno, lui, refuse une query
   string sur un chemin de fichier local — on la retire à la copie. */
const stripVersion = (src) => src.replace(/(from\s+'\.\/[\w./-]+\.js)\?v=[\w.-]+'/g, "$1'")

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const name of FILES) {
  const src = stripVersion(fs.readFileSync(path.join(SRC_DIR, name), 'utf8'))
  const out = path.join(OUT_DIR, name)
  fs.writeFileSync(out, BANNER(name) + src, 'utf8')
  process.stdout.write(
    `build-checking-bareme: wrote ${path.relative(ROOT, out)} (${src.length} bytes)\n`,
  )
}
