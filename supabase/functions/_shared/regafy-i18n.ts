// Localisation des constats Regafy (P0-2). Trois langues bien distinctes :
//   - UI (affichage) : `loc` ci-dessous — la langue de l'utilisateur (FR/EN) → langue des constats ;
//   - document : la langue détectée d'une pièce (RCP en anglais…) ;
//   - pays cible : la langue officielle du pays (FR en UEMOA) — la cible de traduction.
// Les constats DÉTERMINISTES (validité, conformité, langue) sont rendus ici dans la langue UI ;
// le texte LIBRE généré par l'IA (constats de lettres, rubriques manquantes) suit `respondIn(loc)`
// ajouté au prompt système. Le client passe `uiLang` à l'Edge et l'inclut dans sa clé de cache.

export type RegafyLocale = 'fr' | 'en'

export const asLocale = (x: unknown): RegafyLocale => (x === 'en' ? 'en' : 'fr')

// Nom de la langue (depuis un code ISO 639-1) dans la langue d'affichage.
const LANG_NAMES: Record<string, { fr: string; en: string }> = {
  fr: { fr: 'français', en: 'French' },
  en: { fr: 'anglais', en: 'English' },
  pt: { fr: 'portugais', en: 'Portuguese' },
  es: { fr: 'espagnol', en: 'Spanish' },
  de: { fr: 'allemand', en: 'German' },
  it: { fr: 'italien', en: 'Italian' },
  ar: { fr: 'arabe', en: 'Arabic' },
  nl: { fr: 'néerlandais', en: 'Dutch' },
}
export function langName(code: string, loc: RegafyLocale): string {
  const c = (code || '').toLowerCase().slice(0, 2)
  return LANG_NAMES[c]?.[loc] ?? code
}

/** Directive de langue de RÉPONSE ajoutée au prompt système (texte libre généré par l'IA). */
export function respondIn(loc: RegafyLocale): string {
  return loc === 'en'
    ? ' Write every finding/message in English.'
    : ' Rédige chaque constat/message en français.'
}

/** Constats déterministes (un objet de constructeurs par langue) — `label` = type de pièce. */
export function regafyMessages(loc: RegafyLocale) {
  const fr = loc === 'fr'
  // Fragment « (calculé : émission + N mois) » accolé aux dates dérivées.
  const how = (derived: boolean, months: number) =>
    derived ? (fr ? ` (calculé : émission + ${months} mois)` : ` (computed: issued + ${months} months)`) : ''
  // Fragment « par <agence> » du seuil de validité requis.
  const requirement = (agency: string) =>
    agency ? (fr ? ` par ${agency}` : ` by ${agency}`) : ''
  return {
    how,
    requirement,
    unreadable: (label: string) =>
      fr ? `${label} : document illisible — à vérifier.` : `${label}: unreadable document — please verify.`,
    wrongProduct: (label: string, docName: string, productName: string) =>
      fr
        ? `${label} : concerne « ${docName} » ≠ produit du dossier « ${productName} ». Mauvais document ?`
        : `${label}: refers to “${docName}” ≠ dossier product “${productName}”. Wrong document?`,
    drift: (label: string, expiry: string, derived: boolean, declared: string) =>
      fr
        ? `${label} : date lue dans le document (${expiry}${derived ? ', calculée' : ''}) ≠ date déclarée (${declared}) — à vérifier.`
        : `${label}: date read in the document (${expiry}${derived ? ', computed' : ''}) ≠ declared date (${declared}) — please verify.`,
    expired: (label: string, expiry: string, howFrag: string) =>
      fr ? `${label} expiré (${expiry})${howFrag}.` : `${label} expired (${expiry})${howFrag}.`,
    lowValidity: (label: string, monthsLeft: number, min: number, req: string, expiry: string, howFrag: string) =>
      fr
        ? `${label} : validité restante ~${monthsLeft} mois (< ${min} requis${req} ; expire le ${expiry})${howFrag}.`
        : `${label}: ~${monthsLeft} months of validity left (< ${min} required${req}; expires ${expiry})${howFrag}.`,
    validOk: (label: string, monthsLeft: number, expiry: string, howFrag: string) =>
      fr
        ? `${label} : validité vérifiée — conforme — valable encore ~${monthsLeft} mois (expire le ${expiry})${howFrag}.`
        : `${label}: validity checked — compliant — still valid for ~${monthsLeft} months (expires ${expiry})${howFrag}.`,
    statedValidity: (label: string, statement: string) =>
      fr
        ? `${label} : validité énoncée « ${statement} » — date d'émission introuvable, à confirmer.`
        : `${label}: stated validity “${statement}” — issue date not found, to be confirmed.`,
    extractionFailed: (label: string) =>
      fr
        ? `${label} : extraction de la validité échouée — à vérifier manuellement.`
        : `${label}: validity extraction failed — please verify manually.`,
    notDetected: (label: string) =>
      fr
        ? `${label} : validité non détectée automatiquement — à vérifier manuellement.`
        : `${label}: validity not detected automatically — please verify manually.`,
    /** « <pièce> en <langue doc> — langue officielle du <pays> : <langue cible>. Traduction recommandée. » */
    langMismatch: (label: string, docLang: string, country: string, targetLang: string) => {
      if (!fr)
        return `${label} in ${docLang} — official language of ${country || 'the target country'}: ${targetLang}. Translation recommended.`
      // Préposition française selon le pays (UEMOA/CEDEAO) : « du Bénin », « de la Côte d'Ivoire »…
      const dela = /(côte d'ivoire|guinée|gambie|sierra ?leone|mauritanie)/i.test(country) ? 'de la' : 'du'
      const ref = country ? `langue officielle ${dela} ${country}` : 'langue cible'
      return `${label} en ${docLang} — ${ref} : ${targetLang}. Traduction recommandée.`
    },
    /** En-tête du constat de non-conformité au template (le détail vit dans `missing`). */
    nonCompliant: (label: string) =>
      fr
        ? `${label} : non conforme au template en vigueur — à mettre en conformité.`
        : `${label}: not compliant with the current template — needs to be brought into compliance.`,
  }
}

export type RegafyMessages = ReturnType<typeof regafyMessages>
