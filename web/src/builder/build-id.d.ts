/**
 * Identifiant de build injecté par `vite.builder.config.ts` (`define`).
 *
 * Il est AFFICHÉ dans l'écran d'état du poste, et ce n'est pas une coquetterie : un builder hors
 * ligne peut tourner des semaines sur une version ancienne. Quand un utilisateur signale un
 * comportement, la première question est « quelle version ? » — et il doit pouvoir y répondre
 * sans être connecté.
 */
declare const __BUILDER_BUILD_ID__: string
