/**
 * Cohérence des dates d'une pièce datée (garde-fou Monitor) : la date de **délivrance / d'émission**
 * ne peut pas être POSTÉRIEURE à la date d'**expiration**. Une pièce dont l'émission tombe après
 * l'expiration est incohérente (saisie inversée) et doit être signalée avant tout enregistrement.
 *
 * Les `<input type="date">` renvoient « YYYY-MM-DD » → la comparaison **lexicographique** est
 * chronologique (aucun `new Date()`, donc aucun décalage de fuseau) tant que l'année tient sur
 * 4 chiffres — toujours vrai pour des validités pharmaceutiques. Renvoie `false` tant qu'une des
 * deux dates manque : il n'y a alors rien à comparer (la présence requise est gérée ailleurs).
 */
export function isIssueAfterExpiry(
  issueDate: string | null | undefined,
  expiryDate: string | null | undefined,
): boolean {
  return Boolean(issueDate && expiryDate && issueDate > expiryDate)
}
