// Construction du `TemplateContext` des lettres (cover/PGHT) pour l'éditeur **standalone** de la
// Bibliothèque : les champs sont saisis à la main + un **pays cible** pilote le destinataire
// (agence / civilité / ville), exactement comme le montage CTD côté Workspace — mais sans dossier.
// Réutilise les sources pays (roadmap-data, city) en LECTURE SEULE ; le chemin Workspace est inchangé.
import type { Lang } from '@/lib/i18n-context'
import type { ProductRecord } from '@/lib/db'
import { formatComposition } from './composition'
import { extractCity } from './city'
import { agencyCivilite, agencyCiviliteEn, agencyFor } from './roadmap-data'
import type { TemplateContext } from './templates'

/** Champs éditables d'une lettre dans la Bibliothèque (indépendants de la langue d'affichage). */
export interface LetterFields {
  /** Pays cible (code ISO) → destinataire auto (agence + civilité du directeur). */
  country: string
  /** Ville et date de la lettre (dateline) — REMPLISSABLES ; si vides → défaut auto (ville extraite
   * de l'adresse du demandeur / date du jour) appliqué à la compilation. */
  ville: string
  date: string
  nomCommercial: string
  dci: string
  dosage: string
  forme: string
  presentation: string
  demandeurNom: string
  demandeurAdresse: string
  fabricantNom: string
  fabricantAdresse: string
  /** Montant PGHT (lettre PGHT uniquement). */
  pght: string
  /** Devise du PGHT (lettre PGHT) — ex. « FCFA », « Naira »… */
  pghtCurrency: string
  poste: string
  signataire: string
  /** Renouvellement d'AMM — n°, date de délivrance, date d'expiration de l'AMM à renouveler. */
  ammNumero: string
  ammDateDelivrance: string
  ammDateExpiration: string
  /** Inclure l'en-tête / le pied / la signature du profil (insertion 1-clic) — '1' = oui. */
  useHeader: string
  useFooter: string
  useSignature: string
}

/** Devises proposées pour le PGHT (libellé affiché tel quel dans la lettre). */
export const LETTER_CURRENCIES = [
  'FCFA',
  'Naira',
  'Cedi',
  'Dirham',
  'Euro',
  'USD',
  'GBP',
  'AUD',
] as const

/** Pays UEMOA (destinataire auto des lettres) — source du sélecteur. */
export const UEMOA_COUNTRIES: { code: string; name: string }[] = [
  { code: 'BJ', name: 'Bénin' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'GW', name: 'Guinée-Bissau' },
  { code: 'ML', name: 'Mali' },
  { code: 'NE', name: 'Niger' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'TG', name: 'Togo' },
]

export const LETTER_FIELD_KEYS: (keyof LetterFields)[] = [
  'country',
  'ville',
  'date',
  'nomCommercial',
  'dci',
  'dosage',
  'forme',
  'presentation',
  'demandeurNom',
  'demandeurAdresse',
  'fabricantNom',
  'fabricantAdresse',
  'pght',
  'pghtCurrency',
  'poste',
  'signataire',
  'ammNumero',
  'ammDateDelivrance',
  'ammDateExpiration',
  'useHeader',
  'useFooter',
  'useSignature',
]

/** État vide. Pas de pays par défaut : l'utilisateur doit choisir (point CEO). */
export function emptyLetterFields(country = ''): LetterFields {
  return {
    country,
    ville: '',
    date: '',
    nomCommercial: '',
    dci: '',
    dosage: '',
    forme: '',
    presentation: '',
    demandeurNom: '',
    demandeurAdresse: '',
    fabricantNom: '',
    fabricantAdresse: '',
    pght: '',
    pghtCurrency: 'FCFA',
    poste: '',
    signataire: '',
    ammNumero: '',
    ammDateDelivrance: '',
    ammDateExpiration: '',
    useHeader: '',
    useFooter: '',
    useSignature: '',
  }
}

/** Mappe une fiche produit (catalogue) → champs de lettre (auto-synchronisation, hors pays). */
export function productToLetterFields(p: ProductRecord): Partial<LetterFields> {
  return {
    nomCommercial: p.nomCommercial ?? '',
    dci: p.dci ?? '',
    dosage: p.dosage ?? '',
    forme: p.forme ?? '',
    presentation: p.presentation ?? '',
    demandeurNom: p.titulaire ?? '',
    demandeurAdresse: p.titulaireAdresse ?? '',
    fabricantNom: p.fabricant ?? '',
    fabricantAdresse: p.fabricantAdresse ?? '',
  }
}

/** Lit des `LetterFields` depuis un `Record<string,string>` (persistance via savedTemplates.values). */
export function letterFieldsFromValues(values: Record<string, string>): LetterFields {
  const base = emptyLetterFields(values['country'] || '')
  for (const k of LETTER_FIELD_KEYS) {
    if (typeof values[k] === 'string') base[k] = values[k] as string
  }
  return base
}

/**
 * Construit le `TemplateContext` (consommé par `buildCover`/`buildPght`) depuis les champs saisis et
 * le pays cible. Marqueurs `[…]` localisés pour les champs vides (édition in-place ensuite). PURE.
 */
export function buildLetterContext(f: LetterFields, lang: Lang): TemplateContext {
  const ag = agencyFor(f.country)
  const ph = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const v = (s: string) => s.trim()
  return {
    nomCommercial: v(f.nomCommercial) || ph('[Nom commercial]', '[Trade name]'),
    dci: v(f.dci),
    dosage: v(f.dosage),
    dciDosage: formatComposition(v(f.dci), v(f.dosage)),
    forme: v(f.forme),
    presentation: v(f.presentation),
    demandeurNom: v(f.demandeurNom) || ph('[Nom du demandeur d’AMM]', '[MA applicant name]'),
    demandeurAdresse: v(f.demandeurAdresse),
    fabricantNom: v(f.fabricantNom) || ph('[Nom du fabricant]', '[Manufacturer name]'),
    fabricantAdresse: v(f.fabricantAdresse),
    agencyName: ag.name,
    agencyFull: ag.name ? `${ag.full} (${ag.name})` : ag.full,
    agencyCivilite: agencyCivilite(ag),
    agencyCiviliteEn: agencyCiviliteEn(),
    agencyAdresse: ag.adresse || ph('[Adresse de l’agence]', '[Agency address]'),
    country: f.country,
    // REMPLISSABLES : la saisie l'emporte ; sinon défaut auto (ville extraite de l'adresse / aujourd'hui).
    ville: v(f.ville) || extractCity(f.demandeurAdresse) || ph('[Ville]', '[City]'),
    date:
      v(f.date) ||
      new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    poste: v(f.poste),
    signataire: v(f.signataire),
    pght: v(f.pght) || ph('[Montant]', '[Amount]'),
    pghtCurrency: v(f.pghtCurrency) || 'FCFA',
    // Renouvellement : valeurs brutes (les marqueurs éditables sont posés par le template).
    ammNumero: v(f.ammNumero),
    ammDateDelivrance: v(f.ammDateDelivrance),
    ammDateExpiration: v(f.ammDateExpiration),
  }
}
