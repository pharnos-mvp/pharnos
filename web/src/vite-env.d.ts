/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Paquets Fontsource = CSS pur (woff2 + @font-face), sans déclarations de types → l'import
// side-effect (`import '@fontsource-variable/…'`) échoue en TS strict (TS2882). Déclaration
// ambiante pour l'autoriser. Polices auto-hébergées : Syne (display) + DM Sans (corps).
declare module '@fontsource-variable/*'

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
