/**
 * FICHIER GÉNÉRÉ par web/scripts/build-landing-modeles.mjs — NE PAS ÉDITER À LA MAIN.
 * Régénérer : `npm run build:landing-modeles` (depuis web/), puis committer landing/modeles/.
 *
 * `zip` est le téléchargement (DOCX français + DOCX anglais de courtoisie quand `bilingue`) ;
 * `pdf` est l'aperçu du lecteur. `perPays: false` = un seul fichier pour les huit pays.
 */
export const MODELES_VERSION = "2026.6"

export const MODELES_FICHIERS = {
  "rcp": {
    "activites": null,
    "nom": [
      "Résumé des Caractéristiques du Produit",
      "Summary of Product Characteristics"
    ],
    "court": [
      "RCP",
      "SmPC"
    ],
    "resume": [
      "Le document qui fait foi pour le professionnel de santé — 10 rubriques, numérotation non modifiable.",
      "The reference document for healthcare professionals — 10 sections, numbering not modifiable."
    ],
    "source": [
      "Maquette ABMed 2026",
      "ABMed 2026 template"
    ],
    "groupe": "produit",
    "upgradable": true,
    "bilingue": true,
    "perPays": true,
    "apercu": [
      {
        "t": "doctitle",
        "x": "RESUME DES CARACTERISTIQUES DU PRODUIT"
      },
      {
        "t": "h1",
        "x": "1. DENOMINATION DU MEDICAMENT"
      },
      {
        "t": "p",
        "x": "xxxxxxxxx"
      },
      {
        "t": "h1",
        "x": "2. COMPOSITION QUALITATIVE ET QUANTITATIVE"
      },
      {
        "t": "p",
        "x": "{ ................................................................ }"
      },
      {
        "t": "p",
        "x": "<Excipient(s) à effet notoire :>"
      },
      {
        "t": "p",
        "x": "<Pour la liste complète des excipients, voir rubrique 6.1.>"
      },
      {
        "t": "h1",
        "x": "3. FORME PHARMACEUTIQUE"
      },
      {
        "t": "p",
        "x": "xxxxxxxxx"
      },
      {
        "t": "h1",
        "x": "4. DONNEES CLINIQUES"
      },
      {
        "t": "h2",
        "x": "4.1. Indications thérapeutiques"
      },
      {
        "t": "p",
        "x": "xxxxxxxxx"
      },
      {
        "t": "h2",
        "x": "4.2. Posologie et mode d'administration"
      },
      {
        "t": "h3",
        "x": "Posologie"
      },
      {
        "t": "p",
        "x": "xxxxxxxxx"
      },
      {
        "t": "h3",
        "x": "Mode d'administration"
      }
    ],
    "fichiers": {
      "bj": {
        "pdf": "/modeles/rcp-bj.pdf",
        "zip": "/modeles/rcp-bj.zip",
        "pages": 4,
        "octetsPdf": 7107,
        "octetsZip": 19945
      },
      "bf": {
        "pdf": "/modeles/rcp-bf.pdf",
        "zip": "/modeles/rcp-bf.zip",
        "pages": 4,
        "octetsPdf": 7120,
        "octetsZip": 19928
      },
      "ci": {
        "pdf": "/modeles/rcp-ci.pdf",
        "zip": "/modeles/rcp-ci.zip",
        "pages": 2,
        "octetsPdf": 279133,
        "octetsZip": 265264,
        "officiel": true,
        "source": [
          "Modèle officiel AIRP",
          "Official AIRP template"
        ]
      },
      "gw": {
        "pdf": "/modeles/rcp-gw.pdf",
        "zip": "/modeles/rcp-gw.zip",
        "pages": 4,
        "octetsPdf": 7106,
        "octetsZip": 19860
      },
      "ml": {
        "pdf": "/modeles/rcp-ml.pdf",
        "zip": "/modeles/rcp-ml.zip",
        "pages": 4,
        "octetsPdf": 7061,
        "octetsZip": 19794
      },
      "ne": {
        "pdf": "/modeles/rcp-ne.pdf",
        "zip": "/modeles/rcp-ne.zip",
        "pages": 4,
        "octetsPdf": 7072,
        "octetsZip": 19798
      },
      "sn": {
        "pdf": "/modeles/rcp-sn.pdf",
        "zip": "/modeles/rcp-sn.zip",
        "pages": 4,
        "octetsPdf": 7106,
        "octetsZip": 19935
      },
      "tg": {
        "pdf": "/modeles/rcp-tg.pdf",
        "zip": "/modeles/rcp-tg.zip",
        "pages": 4,
        "octetsPdf": 7066,
        "octetsZip": 19796
      }
    }
  },
  "notice": {
    "activites": null,
    "nom": [
      "Notice : information de l'utilisateur",
      "Package leaflet: information for the user"
    ],
    "court": [
      "Notice",
      "Leaflet"
    ],
    "resume": [
      "L'encadré d'avertissement et les six rubriques, dans l'ordre imposé.",
      "The warning box and the six sections, in the imposed order."
    ],
    "source": [
      "Maquette ABMed 2026",
      "ABMed 2026 template"
    ],
    "groupe": "produit",
    "upgradable": true,
    "bilingue": true,
    "perPays": false,
    "apercu": [
      {
        "t": "doctitle",
        "x": "NOTICE : INFORMATION DE L'UTILISATEUR"
      },
      {
        "t": "h3",
        "x": "Dénomination du médicament"
      },
      {
        "t": "p",
        "x": "xxxxxxxxxxxxxx"
      },
      {
        "t": "p",
        "x": "{Substance(s) active(s)}"
      },
      {
        "t": "h3",
        "x": "Encadré"
      },
      {
        "t": "p",
        "x": "<Veuillez lire attentivement cette notice avant <de prendre> <d’utiliser> ce médicament car elle contient des informations importantes pour …"
      },
      {
        "t": "li",
        "x": "Gardez cette notice. Vous pourriez avoir besoin de la relire."
      },
      {
        "t": "li",
        "x": "Si vous avez d'autres questions, interrogez <votre médecin> <,> <ou> <votre pharmacien> ou <votre infirmier/ère>."
      },
      {
        "t": "li",
        "x": "<Ce médicament vous a été personnellement prescrit. Ne le donnez pas à d'autres personnes. Il pourrait leur être nocif, même si les signes d…"
      },
      {
        "t": "li",
        "x": "Si vous ressentez un quelconque effet indésirable, parlez-en à <votre médecin> <,> <ou> <votre pharmacien> <ou votre infirmier/ère>. Ceci s'…"
      },
      {
        "t": "h3",
        "x": "Que contient cette notice ?"
      },
      {
        "t": "p",
        "x": "1. Qu'est-ce que xxx et dans quels cas est-il utilisé ?"
      },
      {
        "t": "p",
        "x": "2. Quelles sont les informations à connaître avant <de prendre> <d'utiliser> xxx ?"
      },
      {
        "t": "p",
        "x": "3. Comment <prendre> <utiliser> xxx ?"
      },
      {
        "t": "p",
        "x": "4. Quels sont les effets indésirables éventuels ?"
      },
      {
        "t": "p",
        "x": "5. Comment conserver xxx ?"
      }
    ],
    "fichiers": {
      "*": {
        "pdf": "/modeles/notice.pdf",
        "zip": "/modeles/notice.zip",
        "pages": 4,
        "octetsPdf": 8307,
        "octetsZip": 21186
      }
    }
  },
  "etiquetage": {
    "activites": null,
    "nom": [
      "Étiquetage et conditionnement",
      "Labelling and packaging"
    ],
    "court": [
      "Étiquetage",
      "Labelling"
    ],
    "resume": [
      "Les trois jeux de mentions : emballage extérieur, plaquettes, petits conditionnements.",
      "The three sets of particulars: outer packaging, blisters, small immediate packs."
    ],
    "source": [
      "Modèle ABMed 2026",
      "ABMed 2026 template"
    ],
    "groupe": "produit",
    "upgradable": true,
    "bilingue": true,
    "perPays": false,
    "apercu": [
      {
        "t": "doctitle",
        "x": "ETIQUETAGE"
      },
      {
        "t": "part",
        "x": "MENTIONS DEVANT FIGURER SUR L'EMBALLAGE EXTERIEUR ET SUR LE CONDITIONNEMENT PRIMAIRE"
      },
      {
        "t": "h3",
        "x": "NATURE/TYPE EMBALLAGE SECONDAIRE OU CONDITIONNEMENT PRIMAIRE"
      },
      {
        "t": "p",
        "x": "<{conditionnement secondaire}> <et> <{Conditionnement(s) primaire(s)}>"
      },
      {
        "t": "h1",
        "x": "1. DENOMINATION DU MEDICAMENT"
      },
      {
        "t": "p",
        "x": "xxx"
      },
      {
        "t": "p",
        "x": "{Substance(s) active(s)}"
      },
      {
        "t": "h1",
        "x": "2. COMPOSITION EN SUBSTANCES ACTIVES"
      },
      {
        "t": "p",
        "x": "{ ................................................................ }"
      },
      {
        "t": "h1",
        "x": "3. LISTE DES EXCIPIENTS"
      },
      {
        "t": "p",
        "x": "<Sans objet.>"
      },
      {
        "t": "p",
        "x": "<Préciser la présence d'excipient à effet notoire.>"
      },
      {
        "t": "h1",
        "x": "4. FORME PHARMACEUTIQUE ET CONTENU"
      },
      {
        "t": "p",
        "x": "{}"
      },
      {
        "t": "h1",
        "x": "5. MODE ET VOIE(S) D'ADMINISTRATION"
      },
      {
        "t": "p",
        "x": "<Indiquez la voie>"
      }
    ],
    "fichiers": {
      "*": {
        "pdf": "/modeles/etiquetage.pdf",
        "zip": "/modeles/etiquetage.zip",
        "pages": 4,
        "octetsPdf": 6609,
        "octetsZip": 19030
      }
    }
  },
  "lettre-demande": {
    "activites": null,
    "nom": [
      "Lettre de demande d'AMM",
      "MA application letter"
    ],
    "court": [
      "Lettre de demande",
      "Application letter"
    ],
    "resume": [
      "La lettre qui ouvre le dossier, adressée à l'autorité de votre pays de dépôt.",
      "The letter that opens the dossier, addressed to your filing country’s authority."
    ],
    "source": [
      "Modèle UEMOA — nouvelle AMM",
      "UEMOA template — new MA"
    ],
    "groupe": "lettres",
    "upgradable": false,
    "bilingue": true,
    "perPays": true,
    "apercu": [
      {
        "t": "right",
        "x": "Le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur le Directeur Général"
      },
      {
        "t": "right",
        "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
      },
      {
        "t": "right",
        "x": "Cotonou, Zone résidentielle"
      },
      {
        "t": "h3",
        "x": "Objet : Demande d'enregistrement d'AMM du produit …"
      },
      {
        "t": "p",
        "x": "Monsieur le Directeur Général,"
      },
      {
        "t": "p",
        "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre s…"
      },
      {
        "t": "li",
        "x": "Nom commercial : …"
      },
      {
        "t": "li",
        "x": "DCI et dosage : …"
      },
      {
        "t": "li",
        "x": "Forme et présentation : …"
      },
      {
        "t": "li",
        "x": "Nom et adresse du demandeur d'AMM : …"
      },
      {
        "t": "li",
        "x": "Nom et adresse du fabricant : …"
      },
      {
        "t": "p",
        "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nou…"
      },
      {
        "t": "p",
        "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
      },
      {
        "t": "right",
        "x": "Poste"
      }
    ],
    "fichiers": {
      "bj": {
        "pdf": "/modeles/lettre-demande-bj.pdf",
        "zip": "/modeles/lettre-demande-bj.zip",
        "pages": 1,
        "octetsPdf": 123747,
        "octetsZip": 93664,
        "officiel": true,
        "source": [
          "Modèle officiel ABMed",
          "Official ABMed template"
        ]
      },
      "bf": {
        "pdf": "/modeles/lettre-demande-bf.pdf",
        "zip": "/modeles/lettre-demande-bf.zip",
        "pages": 1,
        "octetsPdf": 2211,
        "octetsZip": 16781,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Nationale de Régulation Pharmaceutique (ANRP)"
          },
          {
            "t": "right",
            "x": "Ouagadougou, 01 BP 7009"
          },
          {
            "t": "h3",
            "x": "Objet : Demande d'enregistrement d'AMM du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du demandeur d'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ci": {
        "pdf": "/modeles/lettre-demande-ci.pdf",
        "zip": "/modeles/lettre-demande-ci.zip",
        "pages": 1,
        "octetsPdf": 2206,
        "octetsZip": 16800,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Autorité Ivoirienne de Régulation Pharmaceutique (AIRP)"
          },
          {
            "t": "right",
            "x": "Abidjan, Cocody"
          },
          {
            "t": "h3",
            "x": "Objet : Demande d'enregistrement d'AMM du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du demandeur d'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "gw": {
        "pdf": "/modeles/lettre-demande-gw.pdf",
        "zip": "/modeles/lettre-demande-gw.zip",
        "pages": 1,
        "octetsPdf": 2241,
        "octetsZip": 16832,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direção dos Serviços de Farmácia e Medicamentos (DIFALRM)"
          },
          {
            "t": "right",
            "x": "Bissau, Ministère de la Santé Publique"
          },
          {
            "t": "h3",
            "x": "Objet : Demande d'enregistrement d'AMM du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du demandeur d'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ml": {
        "pdf": "/modeles/lettre-demande-ml.pdf",
        "zip": "/modeles/lettre-demande-ml.zip",
        "pages": 1,
        "octetsPdf": 2195,
        "octetsZip": 16730,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et du Médicament (DPM)"
          },
          {
            "t": "right",
            "x": "Bamako, Darsalam, BPE 5202"
          },
          {
            "t": "h3",
            "x": "Objet : Demande d'enregistrement d'AMM du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du demandeur d'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ne": {
        "pdf": "/modeles/lettre-demande-ne.pdf",
        "zip": "/modeles/lettre-demande-ne.zip",
        "pages": 1,
        "octetsPdf": 2209,
        "octetsZip": 16763,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et de la Médecine Traditionnelle (DPM/MT)"
          },
          {
            "t": "right",
            "x": "Niamey, Ministère de la Santé"
          },
          {
            "t": "h3",
            "x": "Objet : Demande d'enregistrement d'AMM du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du demandeur d'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "sn": {
        "pdf": "/modeles/lettre-demande-sn.pdf",
        "zip": "/modeles/lettre-demande-sn.zip",
        "pages": 1,
        "octetsPdf": 2200,
        "octetsZip": 16776,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Sénégalaise de Réglementation Pharmaceutique (ARP)"
          },
          {
            "t": "right",
            "x": "Dakar, Point E, Rue A x Rue 6"
          },
          {
            "t": "h3",
            "x": "Objet : Demande d'enregistrement d'AMM du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du demandeur d'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "tg": {
        "pdf": "/modeles/lettre-demande-tg.pdf",
        "zip": "/modeles/lettre-demande-tg.zip",
        "pages": 1,
        "octetsPdf": 2208,
        "octetsZip": 16759,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie, du Médicament et des Laboratoires (DPML)"
          },
          {
            "t": "right",
            "x": "Lomé, Avenue du 2 Février"
          },
          {
            "t": "h3",
            "x": "Objet : Demande d'enregistrement d'AMM du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande d'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du demandeur d'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      }
    }
  },
  "lettre-renouvellement": {
    "activites": null,
    "nom": [
      "Lettre de demande de renouvellement",
      "MA renewal application letter"
    ],
    "court": [
      "Lettre de renouvellement",
      "Renewal letter"
    ],
    "resume": [
      "La demande de renouvellement, avec la référence de l'AMM existante et sa date d'octroi.",
      "The renewal application, with the existing MA reference and its grant date."
    ],
    "source": [
      "Modèle UEMOA — renouvellement",
      "UEMOA template — renewal"
    ],
    "groupe": "lettres",
    "upgradable": false,
    "bilingue": true,
    "perPays": true,
    "apercu": [
      {
        "t": "right",
        "x": "Le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur le Directeur Général"
      },
      {
        "t": "right",
        "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
      },
      {
        "t": "right",
        "x": "Cotonou, Zone résidentielle"
      },
      {
        "t": "h3",
        "x": "Objet : Demande de renouvellement d'AMM du produit …"
      },
      {
        "t": "h3",
        "x": "Réf. : AMM n° … du {date d'octroi}"
      },
      {
        "t": "p",
        "x": "Monsieur le Directeur Général,"
      },
      {
        "t": "p",
        "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marc…"
      },
      {
        "t": "li",
        "x": "Nom commercial : …"
      },
      {
        "t": "li",
        "x": "DCI et dosage : …"
      },
      {
        "t": "li",
        "x": "Forme et présentation : …"
      },
      {
        "t": "li",
        "x": "N° d'AMM et date d'octroi : …"
      },
      {
        "t": "li",
        "x": "Nom et adresse du titulaire de l'AMM : …"
      },
      {
        "t": "li",
        "x": "Nom et adresse du fabricant : …"
      },
      {
        "t": "p",
        "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nou…"
      }
    ],
    "fichiers": {
      "bj": {
        "pdf": "/modeles/lettre-renouvellement-bj.pdf",
        "zip": "/modeles/lettre-renouvellement-bj.zip",
        "pages": 1,
        "octetsPdf": 2332,
        "octetsZip": 16905,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
          },
          {
            "t": "right",
            "x": "Cotonou, Zone résidentielle"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "bf": {
        "pdf": "/modeles/lettre-renouvellement-bf.pdf",
        "zip": "/modeles/lettre-renouvellement-bf.zip",
        "pages": 1,
        "octetsPdf": 2331,
        "octetsZip": 16905,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Nationale de Régulation Pharmaceutique (ANRP)"
          },
          {
            "t": "right",
            "x": "Ouagadougou, 01 BP 7009"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ci": {
        "pdf": "/modeles/lettre-renouvellement-ci.pdf",
        "zip": "/modeles/lettre-renouvellement-ci.zip",
        "pages": 1,
        "octetsPdf": 2326,
        "octetsZip": 16931,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Autorité Ivoirienne de Régulation Pharmaceutique (AIRP)"
          },
          {
            "t": "right",
            "x": "Abidjan, Cocody"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "gw": {
        "pdf": "/modeles/lettre-renouvellement-gw.pdf",
        "zip": "/modeles/lettre-renouvellement-gw.zip",
        "pages": 1,
        "octetsPdf": 2363,
        "octetsZip": 16969,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direção dos Serviços de Farmácia e Medicamentos (DIFALRM)"
          },
          {
            "t": "right",
            "x": "Bissau, Ministère de la Santé Publique"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ml": {
        "pdf": "/modeles/lettre-renouvellement-ml.pdf",
        "zip": "/modeles/lettre-renouvellement-ml.zip",
        "pages": 1,
        "octetsPdf": 2316,
        "octetsZip": 16850,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et du Médicament (DPM)"
          },
          {
            "t": "right",
            "x": "Bamako, Darsalam, BPE 5202"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ne": {
        "pdf": "/modeles/lettre-renouvellement-ne.pdf",
        "zip": "/modeles/lettre-renouvellement-ne.zip",
        "pages": 1,
        "octetsPdf": 2327,
        "octetsZip": 16878,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et de la Médecine Traditionnelle (DPM/MT)"
          },
          {
            "t": "right",
            "x": "Niamey, Ministère de la Santé"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "sn": {
        "pdf": "/modeles/lettre-renouvellement-sn.pdf",
        "zip": "/modeles/lettre-renouvellement-sn.zip",
        "pages": 1,
        "octetsPdf": 2324,
        "octetsZip": 16883,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Sénégalaise de Réglementation Pharmaceutique (ARP)"
          },
          {
            "t": "right",
            "x": "Dakar, Point E, Rue A x Rue 6"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "tg": {
        "pdf": "/modeles/lettre-renouvellement-tg.pdf",
        "zip": "/modeles/lettre-renouvellement-tg.zip",
        "pages": 1,
        "octetsPdf": 2330,
        "octetsZip": 16876,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie, du Médicament et des Laboratoires (DPML)"
          },
          {
            "t": "right",
            "x": "Lomé, Avenue du 2 Février"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de renouvellement d'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance, le dossier de demande de renouvellement de l'autorisation de mise sur le marché (AMM) pour notre spécialité pharmaceutique suivante :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI et dosage : …"
          },
          {
            "t": "li",
            "x": "Forme et présentation : …"
          },
          {
            "t": "li",
            "x": "N° d'AMM et date d'octroi : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du titulaire de l'AMM : …"
          },
          {
            "t": "li",
            "x": "Nom et adresse du fabricant : …"
          },
          {
            "t": "p",
            "x": "Le dossier technique ci-joint a été constitué en conformité avec les directives de l'UEMOA et les exigences spécifiques de votre Agence. Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      }
    }
  },
  "lettre-variation": {
    "activites": null,
    "nom": [
      "Lettre de demande de variation",
      "MA variation application letter"
    ],
    "court": [
      "Lettre de variation",
      "Variation letter"
    ],
    "resume": [
      "La déclaration d'une modification sur une AMM existante — classe, natures, annexe comparative.",
      "The declaration of a change to an existing MA — class, natures, comparative annex."
    ],
    "source": [
      "Annexe N°2, Règlement 04/2020 UEMOA",
      "Annex No. 2, Regulation 04/2020 WAEMU"
    ],
    "groupe": "lettres",
    "upgradable": false,
    "bilingue": true,
    "perPays": true,
    "apercu": [
      {
        "t": "right",
        "x": "Le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur le Directeur Général"
      },
      {
        "t": "right",
        "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
      },
      {
        "t": "right",
        "x": "Cotonou, Zone résidentielle"
      },
      {
        "t": "h3",
        "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
      },
      {
        "t": "h3",
        "x": "Réf. : AMM n° … du {date d'octroi}"
      },
      {
        "t": "p",
        "x": "Monsieur le Directeur Général,"
      },
      {
        "t": "p",
        "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notr…"
      },
      {
        "t": "li",
        "x": "Nom commercial : …"
      },
      {
        "t": "li",
        "x": "DCI : …"
      },
      {
        "t": "p",
        "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
      },
      {
        "t": "li",
        "x": "<Nature de la modification>"
      },
      {
        "t": "p",
        "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
      },
      {
        "t": "p",
        "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
      },
      {
        "t": "right",
        "x": "Poste"
      }
    ],
    "fichiers": {
      "bj": {
        "pdf": "/modeles/lettre-variation-bj.pdf",
        "zip": "/modeles/lettre-variation-bj.zip",
        "pages": 1,
        "octetsPdf": 2233,
        "octetsZip": 16835,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
          },
          {
            "t": "right",
            "x": "Cotonou, Zone résidentielle"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "bf": {
        "pdf": "/modeles/lettre-variation-bf.pdf",
        "zip": "/modeles/lettre-variation-bf.zip",
        "pages": 1,
        "octetsPdf": 2237,
        "octetsZip": 16821,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Nationale de Régulation Pharmaceutique (ANRP)"
          },
          {
            "t": "right",
            "x": "Ouagadougou, 01 BP 7009"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ci": {
        "pdf": "/modeles/lettre-variation-ci.pdf",
        "zip": "/modeles/lettre-variation-ci.zip",
        "pages": 1,
        "octetsPdf": 2227,
        "octetsZip": 16854,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Autorité Ivoirienne de Régulation Pharmaceutique (AIRP)"
          },
          {
            "t": "right",
            "x": "Abidjan, Cocody"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "gw": {
        "pdf": "/modeles/lettre-variation-gw.pdf",
        "zip": "/modeles/lettre-variation-gw.zip",
        "pages": 1,
        "octetsPdf": 2258,
        "octetsZip": 16878,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direção dos Serviços de Farmácia e Medicamentos (DIFALRM)"
          },
          {
            "t": "right",
            "x": "Bissau, Ministère de la Santé Publique"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ml": {
        "pdf": "/modeles/lettre-variation-ml.pdf",
        "zip": "/modeles/lettre-variation-ml.zip",
        "pages": 1,
        "octetsPdf": 2221,
        "octetsZip": 16785,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et du Médicament (DPM)"
          },
          {
            "t": "right",
            "x": "Bamako, Darsalam, BPE 5202"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ne": {
        "pdf": "/modeles/lettre-variation-ne.pdf",
        "zip": "/modeles/lettre-variation-ne.zip",
        "pages": 1,
        "octetsPdf": 2230,
        "octetsZip": 16811,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et de la Médecine Traditionnelle (DPM/MT)"
          },
          {
            "t": "right",
            "x": "Niamey, Ministère de la Santé"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "sn": {
        "pdf": "/modeles/lettre-variation-sn.pdf",
        "zip": "/modeles/lettre-variation-sn.zip",
        "pages": 1,
        "octetsPdf": 2226,
        "octetsZip": 16812,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Sénégalaise de Réglementation Pharmaceutique (ARP)"
          },
          {
            "t": "right",
            "x": "Dakar, Point E, Rue A x Rue 6"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "tg": {
        "pdf": "/modeles/lettre-variation-tg.pdf",
        "zip": "/modeles/lettre-variation-tg.zip",
        "pages": 1,
        "octetsPdf": 2231,
        "octetsZip": 16800,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie, du Médicament et des Laboratoires (DPML)"
          },
          {
            "t": "right",
            "x": "Lomé, Avenue du 2 Février"
          },
          {
            "t": "h3",
            "x": "Objet : Demande de variation <mineure> <majeure> de l'AMM du produit …"
          },
          {
            "t": "h3",
            "x": "Réf. : AMM n° … du {date d'octroi}"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous avons l'honneur de soumettre à votre haute bienveillance une demande de variation de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique, identifiée comme suit :"
          },
          {
            "t": "li",
            "x": "Nom commercial : …"
          },
          {
            "t": "li",
            "x": "DCI : …"
          },
          {
            "t": "p",
            "x": "La (les) variation(s) sollicitée(s) porte(nt) sur :"
          },
          {
            "t": "li",
            "x": "<Nature de la modification>"
          },
          {
            "t": "p",
            "x": "Le tableau comparatif « avant / après » et les pièces justificatives correspondantes sont joints en annexe."
          },
          {
            "t": "p",
            "x": "Nous vous prions d'agréer, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      }
    }
  },
  "lettre-pght": {
    "activites": [
      "enr",
      "renouv"
    ],
    "nom": [
      "Lettre de PGHT",
      "Ex-factory price (PGHT) letter"
    ],
    "court": [
      "Lettre de PGHT",
      "PGHT letter"
    ],
    "resume": [
      "Le Prix Grossiste Hors Taxe, déclaré dans le tableau attendu par les autorités.",
      "The ex-factory wholesale price, declared in the table expected by the authorities."
    ],
    "source": [
      "Modèle UEMOA — PGHT",
      "UEMOA template — PGHT"
    ],
    "groupe": "lettres",
    "upgradable": false,
    "bilingue": true,
    "perPays": true,
    "apercu": [
      {
        "t": "right",
        "x": "Le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur le Directeur Général"
      },
      {
        "t": "right",
        "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
      },
      {
        "t": "right",
        "x": "Cotonou, Zone résidentielle"
      },
      {
        "t": "h3",
        "x": "Objet : Attestation de PGHT — enregistrement du produit …"
      },
      {
        "t": "p",
        "x": "Monsieur le Directeur Général,"
      },
      {
        "t": "p",
        "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) …"
      },
      {
        "t": "table",
        "rows": [
          [
            "Nom commercial",
            "DCI et dosage",
            "Forme et présentation",
            "PGHT (FCFA)"
          ],
          [
            "…",
            "…",
            "…",
            "…"
          ]
        ]
      },
      {
        "t": "p",
        "x": "Nous restons à votre entière disposition pour tout complément d'information."
      },
      {
        "t": "p",
        "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboratio…"
      },
      {
        "t": "right",
        "x": "Poste"
      },
      {
        "t": "right",
        "x": "Signature et Cachet"
      },
      {
        "t": "right",
        "x": "Nom et Prénom(s)"
      }
    ],
    "fichiers": {
      "bj-enr": {
        "pdf": "/modeles/lettre-pght-bj-enr.pdf",
        "zip": "/modeles/lettre-pght-bj-enr.zip",
        "pages": 1,
        "octetsPdf": 2333,
        "octetsZip": 17238,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
          },
          {
            "t": "right",
            "x": "Cotonou, Zone résidentielle"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "bj-renouv": {
        "pdf": "/modeles/lettre-pght-bj-renouv.pdf",
        "zip": "/modeles/lettre-pght-bj-renouv.zip",
        "pages": 1,
        "octetsPdf": 2333,
        "octetsZip": 17227,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Agence Béninoise du Médicament et des autres produits de santé (ABMed)"
          },
          {
            "t": "right",
            "x": "Cotonou, Zone résidentielle"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "bf-enr": {
        "pdf": "/modeles/lettre-pght-bf-enr.pdf",
        "zip": "/modeles/lettre-pght-bf-enr.zip",
        "pages": 1,
        "octetsPdf": 2332,
        "octetsZip": 17221,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Nationale de Régulation Pharmaceutique (ANRP)"
          },
          {
            "t": "right",
            "x": "Ouagadougou, 01 BP 7009"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "bf-renouv": {
        "pdf": "/modeles/lettre-pght-bf-renouv.pdf",
        "zip": "/modeles/lettre-pght-bf-renouv.zip",
        "pages": 1,
        "octetsPdf": 2329,
        "octetsZip": 17209,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Nationale de Régulation Pharmaceutique (ANRP)"
          },
          {
            "t": "right",
            "x": "Ouagadougou, 01 BP 7009"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ci-enr": {
        "pdf": "/modeles/lettre-pght-ci-enr.pdf",
        "zip": "/modeles/lettre-pght-ci-enr.zip",
        "pages": 1,
        "octetsPdf": 2330,
        "octetsZip": 17250,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Autorité Ivoirienne de Régulation Pharmaceutique (AIRP)"
          },
          {
            "t": "right",
            "x": "Abidjan, Cocody"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ci-renouv": {
        "pdf": "/modeles/lettre-pght-ci-renouv.pdf",
        "zip": "/modeles/lettre-pght-ci-renouv.zip",
        "pages": 1,
        "octetsPdf": 2334,
        "octetsZip": 17260,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Autorité Ivoirienne de Régulation Pharmaceutique (AIRP)"
          },
          {
            "t": "right",
            "x": "Abidjan, Cocody"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "gw-enr": {
        "pdf": "/modeles/lettre-pght-gw-enr.pdf",
        "zip": "/modeles/lettre-pght-gw-enr.zip",
        "pages": 1,
        "octetsPdf": 2359,
        "octetsZip": 17275,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direção dos Serviços de Farmácia e Medicamentos (DIFALRM)"
          },
          {
            "t": "right",
            "x": "Bissau, Ministère de la Santé Publique"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "gw-renouv": {
        "pdf": "/modeles/lettre-pght-gw-renouv.pdf",
        "zip": "/modeles/lettre-pght-gw-renouv.zip",
        "pages": 1,
        "octetsPdf": 2360,
        "octetsZip": 17284,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direção dos Serviços de Farmácia e Medicamentos (DIFALRM)"
          },
          {
            "t": "right",
            "x": "Bissau, Ministère de la Santé Publique"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ml-enr": {
        "pdf": "/modeles/lettre-pght-ml-enr.pdf",
        "zip": "/modeles/lettre-pght-ml-enr.zip",
        "pages": 1,
        "octetsPdf": 2312,
        "octetsZip": 17169,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et du Médicament (DPM)"
          },
          {
            "t": "right",
            "x": "Bamako, Darsalam, BPE 5202"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ml-renouv": {
        "pdf": "/modeles/lettre-pght-ml-renouv.pdf",
        "zip": "/modeles/lettre-pght-ml-renouv.zip",
        "pages": 1,
        "octetsPdf": 2311,
        "octetsZip": 17171,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et du Médicament (DPM)"
          },
          {
            "t": "right",
            "x": "Bamako, Darsalam, BPE 5202"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ne-enr": {
        "pdf": "/modeles/lettre-pght-ne-enr.pdf",
        "zip": "/modeles/lettre-pght-ne-enr.zip",
        "pages": 1,
        "octetsPdf": 2328,
        "octetsZip": 17200,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et de la Médecine Traditionnelle (DPM/MT)"
          },
          {
            "t": "right",
            "x": "Niamey, Ministère de la Santé"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "ne-renouv": {
        "pdf": "/modeles/lettre-pght-ne-renouv.pdf",
        "zip": "/modeles/lettre-pght-ne-renouv.zip",
        "pages": 1,
        "octetsPdf": 2326,
        "octetsZip": 17209,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie et de la Médecine Traditionnelle (DPM/MT)"
          },
          {
            "t": "right",
            "x": "Niamey, Ministère de la Santé"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "sn-enr": {
        "pdf": "/modeles/lettre-pght-sn-enr.pdf",
        "zip": "/modeles/lettre-pght-sn-enr.zip",
        "pages": 1,
        "octetsPdf": 2325,
        "octetsZip": 17213,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Sénégalaise de Réglementation Pharmaceutique (ARP)"
          },
          {
            "t": "right",
            "x": "Dakar, Point E, Rue A x Rue 6"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "sn-renouv": {
        "pdf": "/modeles/lettre-pght-sn-renouv.pdf",
        "zip": "/modeles/lettre-pght-sn-renouv.zip",
        "pages": 1,
        "octetsPdf": 2321,
        "octetsZip": 17216,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Madame la Directrice Générale"
          },
          {
            "t": "right",
            "x": "Agence Sénégalaise de Réglementation Pharmaceutique (ARP)"
          },
          {
            "t": "right",
            "x": "Dakar, Point E, Rue A x Rue 6"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Madame la Directrice Générale,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Madame la Directrice Générale, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "tg-enr": {
        "pdf": "/modeles/lettre-pght-tg-enr.pdf",
        "zip": "/modeles/lettre-pght-tg-enr.zip",
        "pages": 1,
        "octetsPdf": 2323,
        "octetsZip": 17206,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie, du Médicament et des Laboratoires (DPML)"
          },
          {
            "t": "right",
            "x": "Lomé, Avenue du 2 Février"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — enregistrement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, l'enregistrement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      },
      "tg-renouv": {
        "pdf": "/modeles/lettre-pght-tg-renouv.pdf",
        "zip": "/modeles/lettre-pght-tg-renouv.zip",
        "pages": 1,
        "octetsPdf": 2326,
        "octetsZip": 17199,
        "blocs": [
          {
            "t": "right",
            "x": "Le {date}"
          },
          {
            "t": "right",
            "x": "À"
          },
          {
            "t": "right",
            "x": "Monsieur le Directeur Général"
          },
          {
            "t": "right",
            "x": "Direction de la Pharmacie, du Médicament et des Laboratoires (DPML)"
          },
          {
            "t": "right",
            "x": "Lomé, Avenue du 2 Février"
          },
          {
            "t": "h3",
            "x": "Objet : Attestation de PGHT — renouvellement du produit …"
          },
          {
            "t": "p",
            "x": "Monsieur le Directeur Général,"
          },
          {
            "t": "p",
            "x": "Nous venons par la présente, solliciter auprès de votre haute bienveillance, le renouvellement de l'autorisation de mise sur le marché (AMM) de notre spécialité pharmaceutique dont les informations et le Prix Grossiste Hors Taxe (PGHT) sont consignés dans le tableau suivant :"
          },
          {
            "t": "table",
            "rows": [
              [
                "Nom commercial",
                "DCI et dosage",
                "Forme et présentation",
                "PGHT (FCFA)"
              ],
              [
                "…",
                "…",
                "…",
                "…"
              ]
            ]
          },
          {
            "t": "p",
            "x": "Nous restons à votre entière disposition pour tout complément d'information."
          },
          {
            "t": "p",
            "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir, Monsieur le Directeur Général, l'expression de notre sincère collaboration."
          },
          {
            "t": "right",
            "x": "Poste"
          },
          {
            "t": "right",
            "x": "Signature et Cachet"
          },
          {
            "t": "right",
            "x": "Nom et Prénom(s)"
          }
        ]
      }
    }
  },
  "lettre-dmf": {
    "activites": null,
    "nom": [
      "Déclaration de certification des numéros DMF",
      "Declaration on the certification of DMF numbers"
    ],
    "court": [
      "Déclaration DMF",
      "DMF declaration"
    ],
    "resume": [
      "La certification du numéro de Drug Master File de la substance active, exigée par l’AIRP.",
      "Certification of the active ingredient’s Drug Master File number, required by the AIRP."
    ],
    "source": [
      "Modèle AIRP — note n° 1668",
      "AIRP template — note No. 1668"
    ],
    "groupe": "lettres",
    "upgradable": false,
    "bilingue": true,
    "perPays": true,
    "apercu": [
      {
        "t": "right",
        "x": "Le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur le Directeur Général"
      },
      {
        "t": "right",
        "x": "Autorité Ivoirienne de Régulation Pharmaceutique (AIRP)"
      },
      {
        "t": "right",
        "x": "Abidjan, Cocody"
      },
      {
        "t": "h3",
        "x": "Objet : Déclaration relative à la certification des numéros DMF"
      },
      {
        "t": "p",
        "x": "Monsieur le Directeur Général,"
      },
      {
        "t": "p",
        "x": "Je soussigné(e), …, agissant en qualité de … au sein du laboratoire …, certifie que le numéro de Drug Master File (DMF) relatif à la substan…"
      },
      {
        "t": "p",
        "x": "Je déclare également que ces informations ont été vérifiées auprès de l’autorité de réglementation pharmaceutique du pays d’origine de cette…"
      },
      {
        "t": "p",
        "x": "Le tableau ci-dessous récapitule les informations concernées :"
      },
      {
        "t": "table",
        "rows": [
          [
            "Dénomination du produit fini",
            "…"
          ],
          [
            "Titulaire de l’AMM",
            "…"
          ],
          [
            "Fabricant du produit fini",
            "…"
          ],
          [
            "Substance active (API)",
            "…"
          ],
          [
            "Site de fabrication de la substance active",
            "Nom, adresse, e-mail et téléphone"
          ],
          [
            "Autorité approbatrice du numéro de DMF",
            "…"
          ],
          [
            "N° DMF",
            "…"
          ]
        ]
      },
      {
        "t": "p",
        "x": "Je m’engage à informer au préalable l’autorité de toute variation relative à ces informations."
      },
      {
        "t": "p",
        "x": "La présente déclaration est établie pour servir et valoir ce que de droit."
      },
      {
        "t": "right",
        "x": "Poste"
      },
      {
        "t": "right",
        "x": "Signature et Cachet"
      },
      {
        "t": "right",
        "x": "Nom et Prénom(s)"
      }
    ],
    "fichiers": {
      "ci": {
        "pdf": "/modeles/lettre-dmf-ci.pdf",
        "zip": "/modeles/lettre-dmf-ci.zip",
        "pages": 2,
        "octetsPdf": 900816,
        "octetsZip": 687854,
        "officiel": true,
        "source": [
          "Modèle officiel AIRP",
          "Official AIRP template"
        ]
      }
    }
  },
  "qos-pd": {
    "activites": null,
    "nom": [
      "QOS-PD — Quality Overall Summary",
      "QOS-PD — Quality Overall Summary"
    ],
    "court": [
      "QOS-PD",
      "QOS-PD"
    ],
    "resume": [
      "Le résumé qualité du Module 2.3 — un résumé, pas un renvoi : chaque rubrique porte la donnée.",
      "The Module 2.3 quality summary — a summary, not a cross-reference: each section holds the data."
    ],
    "source": [
      "Modèle OMS — janvier 2025",
      "WHO template — January 2025"
    ],
    "groupe": "resumes",
    "upgradable": false,
    "bilingue": false,
    "perPays": false,
    "apercu": [
      {
        "t": "doctitle",
        "x": "MODULE 2.3 — QUALITY OVERALL SUMMARY : PRODUCT DOSSIER (QOS-PD)"
      },
      {
        "t": "h1",
        "x": "INTRODUCTION — RÉSUMÉ DES INFORMATIONS PRODUIT"
      },
      {
        "t": "li",
        "x": "DCI et noms commerciaux : …"
      },
      {
        "t": "li",
        "x": "Substance(s) active(s), avec forme (sel, hydrate, polymorphe) : …"
      },
      {
        "t": "li",
        "x": "Demandeur : …"
      },
      {
        "t": "li",
        "x": "Forme galénique et dosage(s) : …"
      },
      {
        "t": "li",
        "x": "Voie d'administration : …"
      },
      {
        "t": "li",
        "x": "Indications proposées : …"
      },
      {
        "t": "h3",
        "x": "Personnes de contact"
      },
      {
        "t": "p",
        "x": "Contact principal et contacts additionnels : adresse postale complète, e-mail, téléphone."
      },
      {
        "t": "h3",
        "x": "Dossiers liés et références bibliographiques"
      },
      {
        "t": "p",
        "x": "Numéro de référence · statut de préqualification · fabricant de la substance active."
      },
      {
        "t": "h1",
        "x": "2.3.S — SUBSTANCE ACTIVE (DRUG SUBSTANCE)"
      },
      {
        "t": "p",
        "x": "Nomenclature · structure · propriétés générales."
      },
      {
        "t": "p",
        "x": "Fabricant · description du procédé · contrôle des matières."
      },
      {
        "t": "p",
        "x": "Contrôle de la substance active · normes de référence · conditionnement · stabilité."
      }
    ],
    "fichiers": {
      "*": {
        "pdf": "/modeles/qos-pd.pdf",
        "zip": "/modeles/qos-pd.zip",
        "pages": 1,
        "octetsPdf": 2468,
        "octetsZip": 8505
      }
    }
  },
  "btif": {
    "activites": null,
    "nom": [
      "BTIF — Bioequivalence Trial Information Form",
      "BTIF — Bioequivalence Trial Information Form"
    ],
    "court": [
      "BTIF",
      "BTIF"
    ],
    "resume": [
      "Le formulaire OMS de l'étude de bioéquivalence — format et contenu non modifiables.",
      "The WHO bioequivalence trial form — format and content not modifiable."
    ],
    "source": [
      "Modèle OMS — 13 janvier 2023",
      "WHO template — 13 January 2023"
    ],
    "groupe": "resumes",
    "upgradable": false,
    "bilingue": false,
    "perPays": false,
    "apercu": [
      {
        "t": "doctitle",
        "x": "BIOEQUIVALENCE TRIAL INFORMATION FORM (BTIF)"
      },
      {
        "t": "h1",
        "x": "1. SUMMARY"
      },
      {
        "t": "h3",
        "x": "1.1 Summary of bioequivalence studies"
      },
      {
        "t": "p",
        "x": "…"
      },
      {
        "t": "h3",
        "x": "1.2 Composition of the proposed formulations and biobatches"
      },
      {
        "t": "p",
        "x": "Tableaux comparatifs par dosage."
      },
      {
        "t": "h1",
        "x": "2. CLINICAL STUDY REPORT"
      },
      {
        "t": "p",
        "x": "Numéro et titre d'étude · localisation du protocole · dates de chaque phase et d'administration du produit."
      },
      {
        "t": "h3",
        "x": "2.1 Ethics"
      },
      {
        "t": "p",
        "x": "Comité d'éthique · date d'approbation · localisation de la lettre et du formulaire de consentement."
      },
      {
        "t": "h3",
        "x": "2.2 Investigators and study administrative structure"
      },
      {
        "t": "p",
        "x": "Investigateur principal (CV) · site clinique · laboratoires cliniques et analytiques · société PK/statistique."
      },
      {
        "t": "h3",
        "x": "2.3 Study objectives"
      },
      {
        "t": "p",
        "x": "…"
      },
      {
        "t": "h3",
        "x": "2.4 Investigational plan"
      },
      {
        "t": "p",
        "x": "Plan d'étude · critères d'inclusion et d'exclusion · vérification de l'état de santé · retrait des sujets · remplaçants."
      }
    ],
    "fichiers": {
      "*": {
        "pdf": "/modeles/btif.pdf",
        "zip": "/modeles/btif.zip",
        "pages": 1,
        "octetsPdf": 2363,
        "octetsZip": 8402
      }
    }
  }
}
