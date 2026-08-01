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

export type TemplateKey = 'cover' | 'pght' | 'renewal' | 'variation' | 'dmf'

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
  /**
   * Déclaration DMF (Côte d'Ivoire) — le dossier ne porte AUCUN de ces trois champs : la fiche
   * produit ne connaît ni le site de fabrication de la substance active, ni l'autorité qui a
   * approuvé le DMF, ni son numéro. Laissés vides, ils rendent un marqueur `[…]` éditable
   * in-place, comme partout ailleurs — jamais une valeur devinée.
   */
  /** Nom, adresse, e-mail et téléphone du site de fabrication de la substance active. */
  apiFabricantSite?: string
  /** Autorité de réglementation ayant approuvé le numéro de DMF. */
  dmfAutorite?: string
  /** Numéro de Drug Master File. */
  dmfNumero?: string
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

/* -------------------- Déclaration de certification des numéros DMF -------------------- */

/**
 * Déclaration relative à la **certification des numéros DMF** — modèle officiel de l'AIRP
 * (note d'information n° 1668, « Obligation de déclaration des Numéros de DMF »,
 * `RA-source/AIRP/`). Le laboratoire certifie que le n° de Drug Master File de la substance
 * active est exact, valide et conforme, et s'engage à signaler toute variation.
 *
 * Les PARAGRAPHES sont ceux de la note, mot pour mot. Ce qui est normalisé sur le moteur de
 * lettres : la mise en page (dateline en tête — le modèle AIRP datait en pied, on ne date pas deux
 * fois ; bloc signature à droite), l'en-tête du laboratoire (branding du profil) et la CIVILITÉ,
 * prise au référentiel d'agences (« Monsieur le Directeur Général ») là où la note s'en tient à
 * « Madame, Monsieur » — comme toutes nos autres lettres, qui s'adressent nommément.
 *
 * Les trois informations que le dossier ne détient pas (site de fabrication de l'API, autorité
 * approbatrice, n° de DMF) restent des marqueurs `[…]` éditables : rien n'est deviné.
 */
function buildDmf(c: TemplateContext, lang: Lang = 'fr'): JSONContent {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const cv = civ(c, lang)
  const mark = (v: string | undefined, fr: string, en: string): string =>
    (v ?? '').trim() || L(fr, en)
  // Cellule de tableau : un nœud `text` vide est invalide → paragraphe sans contenu.
  const cell = (text: string, header = false): JSONContent => ({
    type: header ? 'tableHeader' : 'tableCell',
    content: [{ type: 'paragraph', content: text ? [txt(text)] : undefined }],
  })
  const row = (label: string, value: string): JSONContent => ({
    type: 'tableRow',
    content: [cell(label, true), cell(value)],
  })
  const signataire = mark(c.signataire, '[Nom et prénom]', '[Full name]')
  const fonction = mark(c.poste, '[Fonction]', '[Position]')
  const laboratoire = mark(c.demandeurNom, '[Nom du laboratoire]', '[Name of the laboratory]')
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
            'Déclaration relative à la certification des numéros DMF',
            'Declaration on the certification of DMF numbers',
          ),
        ),
      ),
      blank(),
      para(txt(`${cv},`)),
      para(
        txt(
          L(
            `Je soussigné(e), ${signataire}, agissant en qualité de ${fonction} au sein du ` +
              `laboratoire ${laboratoire}, certifie que le numéro de Drug Master File (DMF) relatif ` +
              'à la substance active (API) du produit ci-dessous est exact, valide et conforme aux ' +
              'informations fournies par le fabricant.',
            `I, the undersigned, ${signataire}, acting as ${fonction} within the laboratory ` +
              `${laboratoire}, certify that the Drug Master File (DMF) number for the active ` +
              'pharmaceutical ingredient (API) of the product below is accurate, valid and ' +
              'consistent with the information provided by the manufacturer.',
          ),
        ),
      ),
      para(
        txt(
          L(
            'Je déclare également que ces informations ont été vérifiées auprès de l’autorité de ' +
              'réglementation pharmaceutique du pays d’origine de cette substance active.',
            'I further declare that this information has been verified with the pharmaceutical ' +
              'regulatory authority of the country of origin of that active ingredient.',
          ),
        ),
      ),
      para(
        txt(
          L(
            'Le tableau ci-dessous récapitule les informations concernées :',
            'The table below summarises the information concerned:',
          ),
        ),
      ),
      {
        type: 'table',
        content: [
          row(
            L('Dénomination du produit fini', 'Name of the finished product'),
            c.nomCommercial || L('[Nom du produit]', '[Product name]'),
          ),
          row(
            L('Titulaire de l’AMM', 'MA holder'),
            mark(c.demandeurNom, '[Titulaire de l’AMM]', '[MA holder]'),
          ),
          row(
            L('Fabricant du produit fini', 'Manufacturer of the finished product'),
            mark(c.fabricantNom, '[Nom du fabricant]', '[Manufacturer name]'),
          ),
          row(
            L('Substance active (API)', 'Active ingredient (API)'),
            mark(c.dci, '[Nom de la substance active]', '[Active ingredient name]'),
          ),
          // Libellés VERBATIM du modèle — les mêmes que la bibliothèque publique
          // (`scripts/lib/modeles-source.mjs`), pour qu'un même document ne change pas de mots
          // selon l'endroit d'où le client le sort.
          row(
            L(
              'Nom, adresse, contacts e-mail et numéro de téléphone du site de fabrication de la substance active (API)',
              'Name, address, e-mail contacts and telephone number of the API manufacturing site',
            ),
            mark(
              c.apiFabricantSite,
              '[Site de fabrication de la substance active]',
              '[API manufacturing site]',
            ),
          ),
          row(
            L(
              'Nom de l’autorité de réglementation approbatrice du numéro de DMF',
              'Name of the regulatory authority that approved the DMF number',
            ),
            mark(c.dmfAutorite, '[Autorité de réglementation]', '[Regulatory authority]'),
          ),
          row(L('N° DMF', 'DMF No.'), mark(c.dmfNumero, '[N° DMF]', '[DMF number]')),
        ],
      },
      para(
        txt(
          L(
            `Je m’engage à informer au préalable l’${c.agencyName} de toute variation relative à ces informations.`,
            `I undertake to inform the ${c.agencyName} in advance of any variation concerning this information.`,
          ),
        ),
      ),
      para(
        txt(
          L(
            'La présente déclaration est établie pour servir et valoir ce que de droit.',
            'This declaration is issued to serve and avail as of right.',
          ),
        ),
      ),
      blank(),
      paraR(txt(fonction)),
      paraR(txt(L('[Signature et cachet]', '[Signature and stamp]'))),
      paraR(txt(signataire)),
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
  dmf: {
    key: 'dmf',
    title: 'Déclaration de certification des numéros DMF',
    titleEn: 'Declaration on the Certification of DMF Numbers',
    build: buildDmf,
  },
}

/**
 * Templates dont l'obligation est NATIONALE : ils n'apparaissent que sur un dossier du pays qui
 * les impose, ET pour les seules opérations que le texte vise. Ne jamais élargir un modèle sans
 * le texte qui l'y étend — la déclaration DMF est une obligation de l'AIRP (note n° 1668), pas
 * une exigence régionale, et elle ne couvre pas toutes les opérations.
 */
const TEMPLATE_BY_COUNTRY: Record<
  string,
  Partial<Record<DossierFormat, Record<string, { key: TemplateKey; activities: string[] }>>>
> = {
  CI: {
    // La déclaration DMF se classe avec le DMF, décision CEO : le 1.2.5 est LA section du dossier
    // maître de la substance active. En CTD UEMOA elle a une sous-section dédiée, « 1.2.5.1 Lettre
    // d'accès au DMF » ; l'eCTD CEDEAO n'en a pas et s'arrête au 1.2.5, qui est une feuille — d'où
    // une entrée par format plutôt qu'un numéro unique, qui aurait ouvert le modèle sur la section
    // de garde du CTD en même temps que sur sa sous-section.
    //
    // La note n° 1668 énumère DEUX cas, et deux seulement : « Toute nouvelle demande
    // d'enregistrement en vue de l'obtention d'une Autorisation de Mise sur le Marché ; Toute
    // demande de renouvellement d'une Autorisation de Mise sur le Marché. » La VARIATION n'y
    // figure pas — la proposer y ferait annoncer par Pharnos une pièce que l'AIRP ne réclame pas.
    ctd: { '1.2.5.1': { key: 'dmf', activities: ['new_ma', 'renewal'] } },
    ectd: { '1.2.5': { key: 'dmf', activities: ['new_ma', 'renewal'] } },
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
 *
 * `country` (code ISO du dossier) ouvre en plus les modèles d'obligation NATIONALE. Il est
 * optionnel : sans lui, seul le socle régional répond — un appelant qui l'ignore garde donc
 * exactement le comportement d'avant.
 */
export function templateKeyForNode(
  format: DossierFormat,
  nodeNumber: string,
  activity?: string,
  country?: string,
): TemplateKey | undefined {
  const key = TEMPLATE_BY_NUMBER[format]?.[nodeNumber]
  if (key === 'cover' && activity === 'renewal') return 'renewal'
  if (key === 'cover' && activity === 'variation') return 'variation'
  if (key) return key
  // Le socle régional prime : un modèle national ne peut pas évincer la lettre d'un nœud déjà
  // servi. Et il ne s'ouvre que pour les opérations que son texte vise — sans opération connue,
  // on ne propose rien plutôt que de proposer à tort.
  const national = country ? TEMPLATE_BY_COUNTRY[country]?.[format]?.[nodeNumber] : undefined
  if (!national || !activity || !national.activities.includes(activity)) return undefined
  return national.key
}
