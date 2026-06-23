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

export type TemplateKey = 'cover' | 'pght' | 'renewal' | 'variation'

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
  /** Devise du PGHT (Bibliothèque) — défaut « FCFA » (workspace inchangé). */
  pghtCurrency?: string
  /** Renouvellement d'AMM — n° de l'AMM à renouveler (sinon marqueur éditable). */
  ammNumero?: string
  /** Renouvellement d'AMM — date de délivrance de l'AMM. */
  ammDateDelivrance?: string
  /** Renouvellement d'AMM — date d'expiration de l'AMM. */
  ammDateExpiration?: string
  /** Variation — classe globale de la demande (mot inséré dans l'objet). */
  variationClass?: 'mineure' | 'majeure'
  /** Variation — natures des modifications (puces du corps), texte libre. */
  variationItems?: string[]
  /** Variation — pièces jointes (libellés déjà localisés) à énumérer en fin de lettre. */
  variationPieces?: string[]
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

/* --------------- Lettre de demande d'AMM (enregistrement / renouvellement) --------------- */

/**
 * Lettre de demande d'AMM. `renewal=false` → **enregistrement** (nouvelle AMM, INCHANGÉ).
 * `renewal=true` → **renouvellement** : (1) intention « renouvellement » dans l'objet + le corps ;
 * (2) ligne **Réf.** sous l'objet (n° d'AMM + date de délivrance) ; (3) bloc **« AMM à renouveler »**
 * dans le corps (n°, date de délivrance, date d'expiration). Tout le reste est identique → la nouvelle
 * AMM et le renouvellement partagent une seule source (pas de divergence de prose).
 */
function buildApplicationLetter(c: TemplateContext, lang: Lang, renewal: boolean): JSONContent {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const sep = lang === 'en' ? ': ' : ' : '
  const field = (label: string, value: string): JSONContent =>
    para(strong(`${label}${sep}`), txt(value))
  const partyField = (label: string, nom: string, adresse: string): JSONContent =>
    adresse
      ? para(strong(`${label}${sep}`), txt(nom), br(), txt(adresse))
      : para(strong(`${label}${sep}`), txt(nom))
  const cv = civ(c, lang)
  // Renouvellement : valeurs ou marqueurs éditables (le contexte du dossier ne les fournit pas).
  const ammNum = (c.ammNumero ?? '').trim() || L('[N° d’AMM]', '[MA number]')
  const ammDel = (c.ammDateDelivrance ?? '').trim() || L('[Date de délivrance]', '[Date of grant]')
  const ammExp = (c.ammDateExpiration ?? '').trim() || L('[Date d’expiration]', '[Expiry date]')
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
          renewal
            ? L(
                `Demande de renouvellement d’AMM du produit ${c.nomCommercial}`,
                `Application for renewal of marketing authorisation (MA) of the product ${c.nomCommercial}`,
              )
            : L(
                `Demande d’enregistrement d’AMM du produit ${c.nomCommercial}`,
                `Application for marketing authorisation (MA) of the product ${c.nomCommercial}`,
              ),
        ),
      ),
      ...(renewal
        ? [
            para(
              strong(L('Réf. : ', 'Ref.: ')),
              txt(
                L(
                  `AMM n° ${ammNum} délivrée le ${ammDel}`,
                  `MA No. ${ammNum} granted on ${ammDel}`,
                ),
              ),
            ),
          ]
        : []),
      blank(),
      para(txt(`${cv},`)),
      para(
        txt(
          renewal
            ? L(
                'Nous avons l’honneur de soumettre à votre haute bienveillance le dossier de demande ' +
                  'de renouvellement de l’autorisation de mise sur le marché (AMM) pour notre spécialité ' +
                  'pharmaceutique suivante :',
                'We have the honour of submitting for your kind consideration the application file for ' +
                  'renewal of the marketing authorisation (MA) for our following pharmaceutical specialty:',
              )
            : L(
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
        // Renouvellement : réf. de l'AMM à renouveler, dans la même liste (sans phrase d'intro).
        ...(renewal
          ? [
              field(L('N° d’AMM', 'MA number'), ammNum),
              field(L('Date de délivrance', 'Date of grant'), ammDel),
              field(L('Date d’expiration', 'Expiry date'), ammExp),
            ]
          : []),
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

function buildCover(c: TemplateContext, lang: Lang = 'fr'): JSONContent {
  return buildApplicationLetter(c, lang, false)
}

function buildRenewal(c: TemplateContext, lang: Lang = 'fr'): JSONContent {
  return buildApplicationLetter(c, lang, true)
}

/* --------------- Lettre de demande de variation / modification d'AMM --------------- */

/**
 * Lettre de demande de **variation** (Annexe N°2, Règlement 04/2020 UEMOA). Déclare une (ou
 * plusieurs — multi-variation) modification(s) sur une AMM **existante** : objet + classe
 * (mineure/majeure), réf. de l'AMM, puces des natures de modification, puis énumération des
 * **pièces jointes** (union des pièces de la demande). Construit depuis `TemplateContext`
 * (`variationClass`, `variationItems`, `variationPieces`, `ammNumero`).
 */
function buildVariation(c: TemplateContext, lang: Lang = 'fr'): JSONContent {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const sep = lang === 'en' ? ': ' : ' : '
  const field = (label: string, value: string): JSONContent =>
    para(strong(`${label}${sep}`), txt(value))
  const cv = civ(c, lang)
  const ammNum = (c.ammNumero ?? '').trim() || L('[N° d’AMM]', '[MA number]')
  const classWord = c.variationClass
    ? lang === 'en'
      ? c.variationClass === 'majeure'
        ? 'major '
        : 'minor '
      : `${c.variationClass} `
    : ''
  const items =
    c.variationItems && c.variationItems.length
      ? c.variationItems
      : [L('[Nature de la variation]', '[Nature of the variation]')]
  // Date d'OCTROI de l'AMM (≠ date du jour) — réutilise `ammDateDelivrance` ; marqueur si absente.
  const ammDel = (c.ammDateDelivrance ?? '').trim() || L('[date d’octroi]', '[grant date]')
  const plural = (c.variationItems?.length ?? 0) > 1
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
            `Demande de variation ${classWord}de l’AMM du produit ${c.nomCommercial}`,
            `Application for a ${classWord}variation to the MA of the product ${c.nomCommercial}`,
          ),
        ),
      ),
      // Réf. : n° de l'AMM existante + sa DATE D'OCTROI (jamais la date du jour).
      para(
        strong(L('Réf. : ', 'Ref.: ')),
        txt(L(`AMM n° ${ammNum} du ${ammDel}`, `MA No. ${ammNum} of ${ammDel}`)),
      ),
      blank(),
      para(txt(`${cv},`)),
      // Identification limitée (Nom commercial · DCI) — le n° d'AMM et sa date d'octroi sont en réf.
      para(
        txt(
          L(
            'Nous avons l’honneur de soumettre à votre haute bienveillance une demande de variation de ' +
              'l’autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :',
            'We have the honour of submitting for your kind consideration an application for a variation of ' +
              'the marketing authorisation (MA) of our pharmaceutical specialty, identified as follows:',
          ),
        ),
      ),
      bullets([
        field(L('Nom commercial', 'Trade name'), c.nomCommercial),
        field(L('DCI', 'INN'), (c.dci ?? '').trim() || L('[DCI]', '[INN]')),
      ]),
      // Accord singulier / pluriel selon le nombre de variations cochées ; « variation » (≠ « modification »).
      para(
        txt(
          L(
            plural
              ? 'Les variations sollicitées portent sur :'
              : 'La variation sollicitée porte sur :',
            plural ? 'The requested variations concern:' : 'The requested variation concerns:',
          ),
        ),
      ),
      bullets(items.map((nat) => para(txt(nat)))),
      // Renvoi au tableau comparatif en ANNEXE (pas de liste « Pièces jointes » : la lettre EST la demande).
      para(
        txt(
          L(
            `Le détail ${plural ? 'des variations' : 'de la variation'} (situation actuelle / proposée) ` +
              'figure dans le tableau comparatif joint en annexe. Le dossier de variation ci-joint a été ' +
              'constitué conformément à l’Annexe N°2 du Règlement n°04/2020/CM/UEMOA. Nous restons à votre ' +
              'entière disposition pour tout complément d’information.',
            `The details of the ${plural ? 'variations' : 'variation'} (current / proposed) are set out in ` +
              'the comparison table provided in the annex. The attached variation dossier has been compiled ' +
              'in accordance with Annex No. 2 of UEMOA Regulation No. 04/2020. We remain at your full disposal ' +
              'for any further information.',
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
        field(`PGHT (${c.pghtCurrency || 'FCFA'})`, c.pght),
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
  renewal: {
    key: 'renewal',
    title: 'Lettre de demande de renouvellement d’AMM',
    titleEn: 'Marketing Authorisation Renewal Application Letter',
    build: buildRenewal,
  },
  variation: {
    key: 'variation',
    title: 'Lettre de demande de variation d’AMM',
    titleEn: 'Marketing Authorisation Variation Application Letter',
    build: buildVariation,
  },
}

/** Nœud (par numéro CTD) → template applicable, selon le format réglementaire. */
const TEMPLATE_BY_NUMBER: Record<DossierFormat, Record<string, TemplateKey>> = {
  // eCTD CEDEAO : 1.0.1 = Lettre d'accompagnement.
  ectd: { '1.0.1': 'cover' },
  // CTD UEMOA : 1.1.1 = Lettre de demande ; 1.1.2 = Lettre de PGHT.
  ctd: { '1.1.1': 'cover', '1.1.2': 'pght' },
}

/**
 * Renvoie la clé de template générable pour un nœud (par numéro), ou `undefined`.
 * Selon l'**opération du dossier** : pour un **renouvellement** (`activity === 'renewal'`), la lettre
 * de demande (cover, au 1.1.1 CTD / 1.0.1 eCTD) devient la **lettre de renouvellement**.
 */
export function templateKeyForNode(
  format: DossierFormat,
  nodeNumber: string,
  activity?: string,
): TemplateKey | undefined {
  const key = TEMPLATE_BY_NUMBER[format]?.[nodeNumber]
  if (key === 'cover' && activity === 'renewal') return 'renewal'
  if (key === 'cover' && activity === 'variation') return 'variation'
  return key
}
