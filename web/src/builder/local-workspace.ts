/**
 * L'identité de travail du CTD Builder autonome — il n'y en a qu'une, et elle est CONSTANTE.
 *
 * Le socle de données réutilisé (`dossier-repository` & co.) indexe tout par `orgId`, parce qu'il
 * a été écrit pour une plateforme multi-tenant. Le builder, lui, se vend « sans compte à créer »
 * (§7.2) : il n'a ni org, ni session, ni utilisateur. Il faut pourtant donner une valeur à cette
 * clé, et le choix de cette valeur n'est pas anodin.
 *
 * ⚠️ **Surtout pas un identifiant tiré au hasard et rangé dans `localStorage`.** C'est la solution
 * qui vient à l'esprit, et elle perd des données : `localStorage` et IndexedDB s'effacent
 * SÉPARÉMENT. Un nettoyage de navigateur qui vide l'un sans l'autre — ou un utilisateur qui vide
 * « les cookies et données de site » partiellement — regénérerait un identifiant neuf, et tous les
 * dossiers déjà montés deviendraient invisibles : encore présents dans IndexedDB, indexés sous une
 * clé que plus personne ne cherche. Une perte de données silencieuse, exactement ce que la §5.5
 * cherche à éviter.
 *
 * Une constante ne peut pas dériver de ce qu'elle indexe. Le seul état est IndexedDB, et il n'y a
 * qu'une source de vérité.
 *
 * Corollaire à connaître avant de brancher l'import d'un `.pharnos` (lot B7) : les dossiers
 * importés prennent cette clé, quelle que soit l'org d'origine. C'est voulu — sur ce poste, il n'y
 * a qu'un espace de travail.
 */
export const LOCAL_WORKSPACE_ID = 'local'
