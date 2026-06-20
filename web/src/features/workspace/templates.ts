import type { JSONContent } from '@tiptap/core'

import type { Lang } from '@/lib/i18n-context'
import type { DossierFormat } from './module1-tree'

/**
 * Templates « en vigueur » → documents générés (M3).
 *
 * Modèles ancrés sur les **modèles officiels UEMOA** (`RA-source/Template/`) :
 *  - `cover` : lettre de demande d'enregistrement d'AMM (Cover letter).
 *  - `pght`  : attestation de Prix Grossiste Hors Taxe (PGHT).
 *
 * La génération **pré-remplit** ce qui est connu (produit, agence, objet, date) et laisse des
 * marqueurs explicites `[…]` pour le reste (adresses, prix, signataire) — tout reste éditable
 * in-place (TipTap), jamais figé : l'expert RA garde la main.
 *
 * **Bilingue (jalon Bibliothèque M3)** : `build(c, lang)` rend le courrier en FR (défaut, langue de
 * soumission UEMOA — chemin dossier/workspace INCHANGÉ) ou en EN (aide à la rédaction côté
 * Bibliothèque). Le FR est verbatim ; l'EN est porté en additif. Aucun appelant existant ne passe
 * `lang` → comportement FR identique.
 */

export type TemplateKey = 'cover' | 'pght'

export interface TemplateContext {
  nomCommercial: string
  dci: string
  dosage: string
  /** Composition appariée DCI↔dosage, prête à l'affichage (multi-molécules). */
  dciDosage: string
  forme: string
  presentation: string
  /** Nom + adresse du demandeur d'AMM (titulaire). */
  demandeurNom: string
  /** Adresse du demandeur d'AMM (titulaire). */
  demandeurAdresse: string
  /** Nom du fabricant. */
  fabricantNom: string
  /** Adresse du fabricant. */
  fabricantAdresse: string
  /** Sigle de l'agence (ex. 'AIRP'). */
  agencyName: string
  /** Nom complet de l'agence. */
  agencyFull: string
  /** Civilité du destinataire (« Monsieur le Directeur Général » / « Madame la Directrice Générale »). */
  agencyCivilite: string
  /** Civilité EN du destinataire (« The Director General ») — repli sur `agencyCivilite` si absent. */
  agencyCiviliteEn?: string
  /** Adresse de l'agence (destinataire). */
  agencyAdresse: string
  /** Pays cible (code ISO). */
  country: string
  ville: string
  date: string
  /** Poste / fonction du signataire (profil utilisateur). */
  poste: string
  /** Nom et prénom(s) du signataire (profil utilisateur). */
  signataire: string
  /** Montant PGHT (FCFA). */
  pght: string
}

export interface TemplateDef {
  key: TemplateKey
  /** Titre du document généré (FR). */
  title: string
  /** Titre EN (export Bibliothèque). */
  titleEn: string
  /** Construit le contenu ProseMirror/TipTap à partir du contexte. Fonction **pure**. */
  build: (c: TemplateContext, lang?: Lang) => JSONContent
}

/* ----------------------------- Helpers ProseMirror ----------------------------- */

const txt = (text: string): JSONContent => ({ type: 'text', text })
const strong = (text: string): JSONContent => ({ type: 'text', text, marks: [{ type: 'bold' }] })
const para = (...content: JSONContent[]): JSONContent =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
/** Paragraphe **aligné à droite** (date, destinataire, bloc signature — forme officielle UEMOA). */
const paraR = (...content: JSONContent[]): JSONContent => ({
  type: 'paragraph',
  attrs: { textAlign: 'right' },
  content,
})
/** Saut de ligne **dans** un paragraphe → interligne serré (pas d'espace inter-paragraphe). */
const br = (): JSONContent => ({ type: 'hardBreak' })
const blank = (): JSONContent => ({ type: 'paragraph' })
const bullets = (items: JSONContent[]): JSONContent => ({
  type: 'bulletList',
  content: items.map((p) => ({ type: 'listItem', content: [p] })),
})

const joinNonEmpty = (...parts: string[]): string => parts.filter((p) => p.trim()).join(' ')

/** Civilité résolue selon la langue (EN = `agencyCiviliteEn`, repli FR). */
const civ = (c: TemplateContext, lang: Lang): string =>
  lang === 'en' ? (c.agencyCiviliteEn ?? c.agencyCivilite) : c.agencyCivilite

/* ----------------------------- Cover letter (demande d'AMM) ----------------------------- */

function buildCover(c: TemplateContext, lang: Lang = 'fr'): JSONContent {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const sep = lang === 'en' ? ': ' : ' : '
  const field = (label: string, value: string): JSONContent =>
    para(strong(`${label}${sep}`), txt(value))
  const partyField = (label: string, nom: string, adresse: string): JSONContent =>
    adresse
      ? para(strong(`${label}${sep}`), txt(nom), br(), txt(adresse))
      : para(strong(`${label}${sep}`), txt(nom))
  const cv = civ(c, lang)
  return {
    type: 'doc',
    content: [
      paraR(txt(L(`${c.ville}, le ${c.date}`, `${c.ville}, ${c.date}`))),
      blank(),
      paraR(txt(L('À', 'To'))),
      paraR(txt(cv), br(), txt(c.agencyFull), br(), txt(c.agencyAdresse)),
      blank(),
      para(
        strong(L('Objet : ', 'Subject: ')),
        txt(
          L(
            `Demande d’enregistrement d’AMM du produit ${c.nomCommercial}`,
            `Application for marketing authorisation (MA) of the product ${c.nomCommercial}`,
          ),
        ),
      ),
      blank(),
      para(txt(`${cv},`)),
      para(
        txt(
          L(
            'Nous avons l’honneur de soumettre à votre haute bienveillance le dossier de demande ' +
              'd’autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :',
            'We have the honour of submitting for your kind consideration the application file for ' +
              'marketing authorisation (MA) for our following pharmaceutical specialty:',
          ),
        ),
      ),
      bullets([
        field(L('Nom commercial', 'Trade name'), c.nomCommercial),
        field(
          L('DCI et dosage', 'INN and strength'),
          c.dciDosage || L('[DCI et dosage]', '[INN and strength]'),
        ),
        field(
          L('Forme et présentation', 'Form and presentation'),
          joinNonEmpty(c.forme, c.presentation) ||
            L('[Forme et présentation]', '[Form and presentation]'),
        ),
        partyField(
          L('Nom et adresse du demandeur d’AMM', 'Name and address of the MA applicant'),
          c.demandeurNom,
          c.demandeurAdresse,
        ),
        partyField(
          L('Nom et adresse du fabricant', 'Name and address of the manufacturer'),
          c.fabricantNom,
          c.fabricantAdresse,
        ),
      ]),
      para(
        txt(
          L(
            'Le dossier technique ci-joint a été constitué en conformité avec les directives de l’UEMOA ' +
              'et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour ' +
              'tout complément d’information.',
            'The attached technical dossier has been compiled in accordance with the UEMOA guidelines ' +
              'and the specific requirements of your Agency. We remain at your full disposal for any ' +
              'further information.',
          ),
        ),
      ),
      para(
        txt(
          L(
            `Nous vous prions d’agréer, ${cv}, l’expression de notre sincère considération.`,
            `Please accept, ${cv}, the assurance of our highest consideration.`,
          ),
        ),
      ),
      blank(),
      paraR(txt(c.poste || L('[Poste]', '[Position]'))),
      paraR(txt(L('[Signature et cachet]', '[Signature and stamp]'))),
      paraR(txt(c.signataire || L('[Nom et prénom(s)]', '[Full name]'))),
    ],
  }
}

/* ----------------------------- Attestation PGHT ----------------------------- */

function buildPght(c: TemplateContext, lang: Lang = 'fr'): JSONContent {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const sep = lang === 'en' ? ': ' : ' : '
  const field = (label: string, value: string): JSONContent =>
    para(strong(`${label}${sep}`), txt(value))
  const cv = civ(c, lang)
  return {
    type: 'doc',
    content: [
      paraR(txt(L(`${c.ville}, le ${c.date}`, `${c.ville}, ${c.date}`))),
      blank(),
      paraR(txt(L('À', 'To'))),
      paraR(txt(cv), br(), txt(c.agencyFull), br(), txt(c.agencyAdresse)),
      blank(),
      para(
        strong(L('Objet : ', 'Subject: ')),
        txt(
          L(
            'Attestation de Prix Grossiste Hors Taxe (PGHT)',
            'Certificate of Wholesale Price Excluding Tax (PGHT)',
          ),
        ),
      ),
      blank(),
      para(txt(`${cv},`)),
      para(
        txt(
          L(
            'Nous venons par la présente porter à votre connaissance les informations et le Prix ' +
              'Grossiste Hors Taxe (PGHT) de notre spécialité pharmaceutique, consignés ci-dessous :',
            'We hereby bring to your attention the information and the Wholesale Price Excluding Tax ' +
              '(PGHT) of our pharmaceutical specialty, set out below:',
          ),
        ),
      ),
      bullets([
        field(L('Nom commercial', 'Trade name'), c.nomCommercial),
        field(
          L('DCI et dosage', 'INN and strength'),
          c.dciDosage || L('[DCI et dosage]', '[INN and strength]'),
        ),
        field(
          L('Forme et présentation', 'Form and presentation'),
          joinNonEmpty(c.forme, c.presentation) ||
            L('[Forme et présentation]', '[Form and presentation]'),
        ),
        field(L('PGHT (FCFA)', 'PGHT (FCFA)'), c.pght),
      ]),
      para(
        txt(
          L(
            'Nous restons à votre entière disposition pour tout complément d’information.',
            'We remain at your full disposal for any further information.',
          ),
        ),
      ),
      para(
        txt(
          L(
            `Dans l’espoir d’une suite favorable, nous vous prions d’agréer, ${cv}, ` +
              'l’expression de notre sincère collaboration.',
            `In the hope of a favourable response, please accept, ${cv}, the expression of our ` +
              'sincere collaboration.',
          ),
        ),
      ),
      blank(),
      paraR(txt(c.poste || L('[Poste]', '[Position]'))),
      paraR(txt(L('[Signature et cachet]', '[Signature and stamp]'))),
      paraR(txt(c.signataire || L('[Nom et prénom(s)]', '[Full name]'))),
    ],
  }
}

/* ----------------------------- Registre + liaison aux nœuds ----------------------------- */

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  cover: {
    key: 'cover',
    title: 'Lettre de demande d’AMM',
    titleEn: 'Marketing Authorisation Application Letter',
    build: buildCover,
  },
  pght: {
    key: 'pght',
    title: 'Attestation de PGHT',
    titleEn: 'PGHT Certificate',
    build: buildPght,
  },
}

/** Nœud (par numéro CTD) → template applicable, selon le format réglementaire. */
const TEMPLATE_BY_NUMBER: Record<DossierFormat, Record<string, TemplateKey>> = {
  // eCTD CEDEAO : 1.0.1 = Lettre d'accompagnement.
  ectd: { '1.0.1': 'cover' },
  // CTD UEMOA : 1.1.1 = Lettre de demande ; 1.1.2 = Lettre de PGHT.
  ctd: { '1.1.1': 'cover', '1.1.2': 'pght' },
}

/** Renvoie la clé de template générable pour un nœud (par numéro), ou `undefined`. */
export function templateKeyForNode(
  format: DossierFormat,
  nodeNumber: string,
): TemplateKey | undefined {
  return TEMPLATE_BY_NUMBER[format]?.[nodeNumber]
}
