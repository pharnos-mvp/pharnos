import type { CtdNodeDef } from './module1-tree'

/**
 * Structure **complète du CTD (Modules 1 → 5)** pour la Table des matières générale (« 1.1
 * Table des matières détaillée de tous les modules »).
 *
 * Le **Module 1** est l'arbre réel du dossier (UEMOA, `dossier.tree`) — c'est lui qui porte les
 * documents et les numéros de page. Les **Modules 2 → 5** ci-dessous sont l'**ossature standard**
 * (ICH CTD), rendue dans le TDM **sans numéro de page** (ils ne font pas partie de ce dossier),
 * pour que le lecteur ait sous les yeux le plan complet du CTD. Réutilise `CtdNodeDef`.
 */

/** Titres des 5 modules — pour la page INDEX du TDM. */
export const CTD_MODULE_TITLES: { number: string; title: string }[] = [
  { number: '1', title: 'Informations administratives et informations sur le produit' },
  { number: '2', title: 'Résumés' },
  { number: '3', title: 'Qualité' },
  { number: '4', title: 'Rapports d’études non cliniques' },
  { number: '5', title: 'Rapports d’études cliniques' },
]

export interface CtdModuleOutline {
  number: string
  title: string
  nodes: CtdNodeDef[]
}

const MODULE_2: CtdModuleOutline = {
  number: '2',
  title: 'Résumés',
  nodes: [
    { number: '2.1', label: 'Table des matières générale (modules 2 à 5)' },
    { number: '2.2', label: 'Introduction' },
    {
      number: '2.3',
      label: 'Résumé global de la qualité',
      children: [
        {
          number: '2.3.S',
          label: 'Substance active',
          children: [
            { number: '2.3.S.1', label: 'Informations générales' },
            { number: '2.3.S.2', label: 'Fabricant' },
            { number: '2.3.S.3', label: 'Caractérisation' },
            { number: '2.3.S.4', label: 'Contrôle de la substance active' },
            { number: '2.3.S.5', label: 'Étalons ou matériaux de référence' },
            { number: '2.3.S.6', label: 'Système de fermeture du contenant' },
            { number: '2.3.S.7', label: 'Stabilité' },
          ],
        },
        {
          number: '2.3.P',
          label: 'Produit fini',
          children: [
            { number: '2.3.P.1', label: 'Description et composition' },
            { number: '2.3.P.2', label: 'Développement pharmaceutique' },
            { number: '2.3.P.3', label: 'Fabrication' },
            { number: '2.3.P.4', label: 'Contrôle des excipients' },
            { number: '2.3.P.5', label: 'Contrôle du produit fini' },
            { number: '2.3.P.6', label: 'Étalons ou matériaux de référence' },
            { number: '2.3.P.7', label: 'Système de fermeture du contenant' },
            { number: '2.3.P.8', label: 'Stabilité' },
          ],
        },
        { number: '2.3.A', label: 'Annexes' },
        { number: '2.3.R', label: 'Informations régionales' },
      ],
    },
    { number: '2.4', label: 'Aperçu non clinique' },
    { number: '2.5', label: 'Aperçu clinique' },
    { number: '2.6', label: 'Résumés non cliniques (rédigés et tabulés)' },
    { number: '2.7', label: 'Résumé clinique' },
  ],
}

const MODULE_3: CtdModuleOutline = {
  number: '3',
  title: 'Qualité',
  nodes: [
    { number: '3.1', label: 'Table des matières du module 3' },
    {
      number: '3.2',
      label: 'Corps des données',
      children: [
        {
          number: '3.2.S',
          label: 'Substance active',
          children: [
            {
              number: '3.2.S.1',
              label: 'Informations générales',
              children: [
                { number: '3.2.S.1.1', label: 'Nomenclature' },
                { number: '3.2.S.1.2', label: 'Structure' },
                { number: '3.2.S.1.3', label: 'Propriétés générales' },
              ],
            },
            {
              number: '3.2.S.2',
              label: 'Fabrication',
              children: [
                { number: '3.2.S.2.1', label: 'Fabricant(s)' },
                { number: '3.2.S.2.2', label: 'Description du procédé et des contrôles' },
                { number: '3.2.S.2.3', label: 'Contrôle des matières' },
                { number: '3.2.S.2.4', label: 'Contrôles des étapes critiques et intermédiaires' },
                { number: '3.2.S.2.5', label: 'Validation et/ou évaluation du procédé' },
                { number: '3.2.S.2.6', label: 'Développement du procédé de fabrication' },
              ],
            },
            {
              number: '3.2.S.3',
              label: 'Caractérisation',
              children: [
                { number: '3.2.S.3.1', label: 'Élucidation de la structure' },
                { number: '3.2.S.3.2', label: 'Impuretés' },
              ],
            },
            {
              number: '3.2.S.4',
              label: 'Contrôle de la substance active',
              children: [
                { number: '3.2.S.4.1', label: 'Spécifications' },
                { number: '3.2.S.4.2', label: 'Procédures analytiques' },
                { number: '3.2.S.4.3', label: 'Validation des procédures analytiques' },
                { number: '3.2.S.4.4', label: 'Analyses de lots' },
                { number: '3.2.S.4.5', label: 'Justification des spécifications' },
              ],
            },
            { number: '3.2.S.5', label: 'Étalons ou matériaux de référence' },
            { number: '3.2.S.6', label: 'Système de fermeture du contenant' },
            {
              number: '3.2.S.7',
              label: 'Stabilité',
              children: [
                { number: '3.2.S.7.1', label: 'Résumé et conclusions' },
                {
                  number: '3.2.S.7.2',
                  label: 'Protocole et engagement de stabilité post-approbation',
                },
                { number: '3.2.S.7.3', label: 'Données de stabilité' },
              ],
            },
          ],
        },
        {
          number: '3.2.P',
          label: 'Produit fini',
          children: [
            { number: '3.2.P.1', label: 'Description et composition du produit fini' },
            {
              number: '3.2.P.2',
              label: 'Développement pharmaceutique',
              children: [
                { number: '3.2.P.2.1', label: 'Composants du produit fini' },
                { number: '3.2.P.2.2', label: 'Produit fini' },
                { number: '3.2.P.2.3', label: 'Développement du procédé de fabrication' },
                { number: '3.2.P.2.4', label: 'Système de fermeture du contenant' },
                { number: '3.2.P.2.5', label: 'Attributs microbiologiques' },
                { number: '3.2.P.2.6', label: 'Compatibilité' },
              ],
            },
            {
              number: '3.2.P.3',
              label: 'Fabrication',
              children: [
                { number: '3.2.P.3.1', label: 'Fabricant(s)' },
                { number: '3.2.P.3.2', label: 'Formule de lot' },
                { number: '3.2.P.3.3', label: 'Description du procédé et des contrôles' },
                { number: '3.2.P.3.4', label: 'Contrôles des étapes critiques et intermédiaires' },
                { number: '3.2.P.3.5', label: 'Validation et/ou évaluation du procédé' },
              ],
            },
            {
              number: '3.2.P.4',
              label: 'Contrôle des excipients',
              children: [
                { number: '3.2.P.4.1', label: 'Spécifications' },
                { number: '3.2.P.4.2', label: 'Procédures analytiques' },
                { number: '3.2.P.4.3', label: 'Validation des procédures analytiques' },
                { number: '3.2.P.4.4', label: 'Justification des spécifications' },
                { number: '3.2.P.4.5', label: 'Excipients d’origine humaine ou animale' },
                { number: '3.2.P.4.6', label: 'Excipients nouveaux' },
              ],
            },
            {
              number: '3.2.P.5',
              label: 'Contrôle du produit fini',
              children: [
                { number: '3.2.P.5.1', label: 'Spécification(s)' },
                { number: '3.2.P.5.2', label: 'Procédures analytiques' },
                { number: '3.2.P.5.3', label: 'Validation des procédures analytiques' },
                { number: '3.2.P.5.4', label: 'Analyses de lots' },
                { number: '3.2.P.5.5', label: 'Caractérisation des impuretés' },
                { number: '3.2.P.5.6', label: 'Justification des spécifications' },
              ],
            },
            { number: '3.2.P.6', label: 'Étalons ou matériaux de référence' },
            { number: '3.2.P.7', label: 'Système de fermeture du contenant' },
            {
              number: '3.2.P.8',
              label: 'Stabilité',
              children: [
                { number: '3.2.P.8.1', label: 'Résumé et conclusions' },
                {
                  number: '3.2.P.8.2',
                  label: 'Protocole et engagements de stabilité post-approbation',
                },
                { number: '3.2.P.8.3', label: 'Données de stabilité' },
              ],
            },
          ],
        },
        {
          number: '3.2.A',
          label: 'Annexes',
          children: [
            { number: '3.2.A.1', label: 'Installations et équipements' },
            {
              number: '3.2.A.2',
              label: 'Évaluation de la sécurité vis-à-vis des agents adventices',
            },
            { number: '3.2.A.3', label: 'Excipients' },
          ],
        },
        {
          number: '3.2.R',
          label: 'Informations régionales',
          children: [
            { number: '3.2.R.1', label: 'Documentation de production' },
            { number: '3.2.R.2', label: 'Procédure analytique et informations de validation' },
          ],
        },
      ],
    },
    { number: '3.3', label: 'Références bibliographiques' },
  ],
}

const MODULE_4: CtdModuleOutline = {
  number: '4',
  title: 'Rapports d’études non cliniques',
  nodes: [
    { number: '4.1', label: 'Table des matières du module 4' },
    {
      number: '4.2',
      label: 'Rapports d’études non cliniques',
      children: [
        { number: '4.2.1', label: 'Pharmacologie' },
        { number: '4.2.2', label: 'Pharmacocinétique' },
        { number: '4.2.3', label: 'Toxicologie' },
      ],
    },
    { number: '4.3', label: 'Références bibliographiques' },
  ],
}

const MODULE_5: CtdModuleOutline = {
  number: '5',
  title: 'Rapports d’études cliniques',
  nodes: [
    { number: '5.1', label: 'Table des matières du module 5' },
    { number: '5.2', label: 'Liste tabulée de toutes les études cliniques' },
    {
      number: '5.3',
      label: 'Rapports d’études cliniques',
      children: [
        { number: '5.3.1', label: 'Études de biopharmacie (BA/BE)' },
        { number: '5.3.2', label: 'Études pharmacocinétiques (biomatériaux)' },
        { number: '5.3.3', label: 'Études pharmacocinétiques (PK)' },
        { number: '5.3.4', label: 'Études pharmacodynamiques (PD)' },
        { number: '5.3.5', label: 'Études d’efficacité et de sécurité' },
        { number: '5.3.6', label: 'Expérience post-commercialisation' },
        { number: '5.3.7', label: 'Cahiers d’observation et listes individuelles de patients' },
      ],
    },
    { number: '5.4', label: 'Références bibliographiques' },
  ],
}

/** Ossature standard des Modules 2 → 5 (le Module 1 vient de l'arbre réel du dossier). */
export const CTD_OUTLINE_2_5: CtdModuleOutline[] = [MODULE_2, MODULE_3, MODULE_4, MODULE_5]
