/**
 * Organisation courante.
 *
 * Tant que l'auth Supabase n'est pas branchée, on utilise un identifiant local stable
 * pour faire fonctionner le Catalogue 100 % offline. Il sera remplacé par l'organisation
 * issue de la session authentifiée (table `memberships`) une fois Supabase câblé.
 */
export const LOCAL_ORG_ID = 'local-org'
