import type { JSONContent } from '@tiptap/core'

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
 */

export type TemplateKey = 'cover' | 'pght'

export interface TemplateContext {
  nomCommercial: string
  dci: string
  dosage: string
  forme: string
  presentation: string
  /** Nom + adresse du demandeur d'AMM (titulaire). */
  demandeur: string
  /** Nom + adresse du fabricant. */
  fabricant: string
  /** Sigle de l'agence (ex. 'AIRP'). */
  agencyName: string
  /** Nom complet de l'agence. */
  agencyFull: string
  /** Pays cible (code ISO). */
  country: string
  ville: string
  date: string
  /** Montant PGHT (FCFA). */
  pght: string
}

export interface TemplateDef {
  key: TemplateKey
  /** Titre du document généré. */
  title: string
  /** Construit le contenu ProseMirror/TipTap à partir du contexte. Fonction **pure**. */
  build: (c: TemplateContext) => JSONContent
}

/* ----------------------------- Helpers ProseMirror ----------------------------- */

const txt = (text: string): JSONContent => ({ type: 'text', text })
const strong = (text: string): JSONContent => ({ type: 'text', text, marks: [{ type: 'bold' }] })
const para = (...content: JSONContent[]): JSONContent =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
const blank = (): JSONContent => ({ type: 'paragraph' })
const field = (label: string, value: string): JSONContent => para(strong(`${label} : `), txt(value))
const bullets = (items: JSONContent[]): JSONContent => ({
  type: 'bulletList',
  content: items.map((p) => ({ type: 'listItem', content: [p] })),
})

const joinNonEmpty = (...parts: string[]): string => parts.filter((p) => p.trim()).join(' ')

/* ----------------------------- Cover letter (demande d'AMM) ----------------------------- */

function buildCover(c: TemplateContext): JSONContent {
  return {
    type: 'doc',
    content: [
      para(txt(`${c.ville}, le ${c.date}`)),
      blank(),
      para(txt('À l’attention de Monsieur / Madame le Directeur Général')),
      para(txt(c.agencyFull)),
      para(txt('[Adresse de l’Agence]')),
      blank(),
      para(strong('Objet : '), txt(`Demande d’enregistrement d’AMM du produit ${c.nomCommercial}`)),
      blank(),
      para(txt('Madame, Monsieur,')),
      para(
        txt(
          'Nous avons l’honneur de soumettre à votre haute bienveillance le dossier de demande ' +
            'd’autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :',
        ),
      ),
      bullets([
        field('Nom commercial', c.nomCommercial),
        field('DCI et dosage', joinNonEmpty(c.dci, c.dosage) || '[DCI et dosage]'),
        field(
          'Forme et présentation',
          joinNonEmpty(c.forme, c.presentation) || '[Forme et présentation]',
        ),
        field('Nom et adresse du demandeur d’AMM', c.demandeur),
        field('Nom et adresse du fabricant', c.fabricant),
      ]),
      para(
        txt(
          'Le dossier technique ci-joint a été constitué en conformité avec les directives de l’UEMOA ' +
            'et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour ' +
            'tout complément d’information.',
        ),
      ),
      para(
        txt(
          'Nous vous prions d’agréer, Madame, Monsieur, l’expression de notre sincère considération.',
        ),
      ),
      blank(),
      para(txt('[Poste]')),
      para(txt('[Signature et cachet]')),
      para(txt('[Nom et prénoms]')),
    ],
  }
}

/* ----------------------------- Attestation PGHT ----------------------------- */

function buildPght(c: TemplateContext): JSONContent {
  return {
    type: 'doc',
    content: [
      para(txt(`${c.ville}, le ${c.date}`)),
      blank(),
      para(txt('À l’attention de Monsieur / Madame le Directeur Général')),
      para(txt(c.agencyFull)),
      para(txt('[Adresse de l’Agence]')),
      blank(),
      para(strong('Objet : '), txt('Attestation de Prix Grossiste Hors Taxe (PGHT)')),
      blank(),
      para(txt('Madame, Monsieur,')),
      para(
        txt(
          'Nous venons par la présente porter à votre connaissance les informations et le Prix ' +
            'Grossiste Hors Taxe (PGHT) de notre spécialité pharmaceutique, consignés ci-dessous :',
        ),
      ),
      bullets([
        field('Nom commercial', c.nomCommercial),
        field('DCI et dosage', joinNonEmpty(c.dci, c.dosage) || '[DCI et dosage]'),
        field(
          'Forme et présentation',
          joinNonEmpty(c.forme, c.presentation) || '[Forme et présentation]',
        ),
        field('PGHT (FCFA)', c.pght),
      ]),
      para(txt('Nous restons à votre entière disposition pour tout complément d’information.')),
      para(
        txt(
          'Dans l’espoir d’une suite favorable, nous vous prions d’agréer, Madame, Monsieur, ' +
            'l’expression de notre sincère collaboration.',
        ),
      ),
      blank(),
      para(txt('[Poste]')),
      para(txt('[Signature et cachet]')),
      para(txt('[Nom et prénom(s)]')),
    ],
  }
}

/* ----------------------------- Registre + liaison aux nœuds ----------------------------- */

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  cover: { key: 'cover', title: 'Lettre de demande d’AMM', build: buildCover },
  pght: { key: 'pght', title: 'Attestation de PGHT', build: buildPght },
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
