/**
 * FICHIER GÉNÉRÉ par web/scripts/build-landing-modeles.mjs — NE PAS ÉDITER À LA MAIN.
 * Régénérer : `npm run build:landing-modeles` (depuis web/), puis committer landing/modeles/.
 *
 * `perPays: false` signifie que le document ne porte AUCUNE mention nationale : un seul fichier
 * sert les huit pays. Le déclarer par pays donnerait huit copies identiques — une variation de
 * façade que la page présenterait comme un choix.
 */
export const MODELES_VERSION = "2026.2"

export const MODELES_FICHIERS = {
  "rcp": {
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
        "docx": "/modeles/rcp-bj.docx",
        "pages": 4,
        "octetsPdf": 7100,
        "octetsDocx": 10779
      },
      "bf": {
        "pdf": "/modeles/rcp-bf.pdf",
        "docx": "/modeles/rcp-bf.docx",
        "pages": 4,
        "octetsPdf": 7110,
        "octetsDocx": 10769
      },
      "ci": {
        "pdf": "/modeles/rcp-ci.pdf",
        "docx": "/modeles/rcp-ci.docx",
        "pages": 4,
        "octetsPdf": 7115,
        "octetsDocx": 10785
      },
      "gw": {
        "pdf": "/modeles/rcp-gw.pdf",
        "docx": "/modeles/rcp-gw.docx",
        "pages": 4,
        "octetsPdf": 7041,
        "octetsDocx": 10728
      },
      "ml": {
        "pdf": "/modeles/rcp-ml.pdf",
        "docx": "/modeles/rcp-ml.docx",
        "pages": 4,
        "octetsPdf": 6996,
        "octetsDocx": 10719
      },
      "ne": {
        "pdf": "/modeles/rcp-ne.pdf",
        "docx": "/modeles/rcp-ne.docx",
        "pages": 4,
        "octetsPdf": 7003,
        "octetsDocx": 10720
      },
      "sn": {
        "pdf": "/modeles/rcp-sn.pdf",
        "docx": "/modeles/rcp-sn.docx",
        "pages": 4,
        "octetsPdf": 7095,
        "octetsDocx": 10769
      },
      "tg": {
        "pdf": "/modeles/rcp-tg.pdf",
        "docx": "/modeles/rcp-tg.docx",
        "pages": 4,
        "octetsPdf": 7002,
        "octetsDocx": 10719
      }
    }
  },
  "notice": {
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
        "docx": "/modeles/notice.docx",
        "pages": 4,
        "octetsPdf": 8194,
        "octetsDocx": 11585
      }
    }
  },
  "etiquetage": {
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
        "docx": "/modeles/etiquetage.docx",
        "pages": 4,
        "octetsPdf": 6556,
        "octetsDocx": 10323
      }
    }
  },
  "lettre-demande": {
    "nom": [
      "Lettre de demande d'AMM",
      "MA application letter"
    ],
    "court": [
      "Lettre de demande",
      "Application letter"
    ],
    "resume": [
      "La lettre qui ouvre le dossier — objet, identification du produit, demandeur et fabricant.",
      "The letter that opens the dossier — subject, product identification, applicant and manufacturer."
    ],
    "source": [
      "Modèle UEMOA — nouvelle AMM",
      "UEMOA template — new MA"
    ],
    "groupe": "lettres",
    "upgradable": false,
    "perPays": false,
    "apercu": [
      {
        "t": "part",
        "x": "ENTETE"
      },
      {
        "t": "p",
        "x": "…………………………………………………………………………………………………"
      },
      {
        "t": "right",
        "x": "Ville, le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur / Madame …"
      },
      {
        "t": "right",
        "x": "Nom de la Direction du Médicament / Agence réglementaire nationale"
      },
      {
        "t": "right",
        "x": "Adresse"
      },
      {
        "t": "h3",
        "x": "Objet : Demande d'enregistrement d'AMM du produit …"
      },
      {
        "t": "p",
        "x": "Madame / Monsieur,"
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
      }
    ],
    "fichiers": {
      "*": {
        "pdf": "/modeles/lettre-demande.pdf",
        "docx": "/modeles/lettre-demande.docx",
        "pages": 1,
        "octetsPdf": 2238,
        "octetsDocx": 9066
      }
    }
  },
  "lettre-renouvellement": {
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
    "perPays": false,
    "apercu": [
      {
        "t": "part",
        "x": "ENTETE"
      },
      {
        "t": "p",
        "x": "…………………………………………………………………………………………………"
      },
      {
        "t": "right",
        "x": "Ville, le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur / Madame …"
      },
      {
        "t": "right",
        "x": "Nom de la Direction du Médicament / Agence réglementaire nationale"
      },
      {
        "t": "right",
        "x": "Adresse"
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
        "x": "Madame / Monsieur,"
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
      }
    ],
    "fichiers": {
      "*": {
        "pdf": "/modeles/lettre-renouvellement.pdf",
        "docx": "/modeles/lettre-renouvellement.docx",
        "pages": 1,
        "octetsPdf": 2372,
        "octetsDocx": 9114
      }
    }
  },
  "lettre-variation": {
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
    "perPays": false,
    "apercu": [
      {
        "t": "part",
        "x": "ENTETE"
      },
      {
        "t": "p",
        "x": "…………………………………………………………………………………………………"
      },
      {
        "t": "right",
        "x": "Ville, le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur / Madame …"
      },
      {
        "t": "right",
        "x": "Nom de la Direction du Médicament / Agence réglementaire nationale"
      },
      {
        "t": "right",
        "x": "Adresse"
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
        "x": "Madame / Monsieur,"
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
      }
    ],
    "fichiers": {
      "*": {
        "pdf": "/modeles/lettre-variation.pdf",
        "docx": "/modeles/lettre-variation.docx",
        "pages": 1,
        "octetsPdf": 2226,
        "octetsDocx": 9083
      }
    }
  },
  "lettre-pght": {
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
    "perPays": false,
    "apercu": [
      {
        "t": "part",
        "x": "ENTETE"
      },
      {
        "t": "p",
        "x": "…………………………………………………………………………………………………"
      },
      {
        "t": "right",
        "x": "Ville, le {date}"
      },
      {
        "t": "right",
        "x": "À"
      },
      {
        "t": "right",
        "x": "Monsieur / Madame …"
      },
      {
        "t": "right",
        "x": "Nom de la Direction du Médicament / Agence réglementaire nationale"
      },
      {
        "t": "right",
        "x": "Adresse"
      },
      {
        "t": "h3",
        "x": "Objet : Attestation de PGHT"
      },
      {
        "t": "p",
        "x": "Monsieur / Madame le …,"
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
        "x": "Dans l'espoir d'une suite favorable, nous vous prions de recevoir Monsieur / Madame le …, l'expression de notre sincère collaboration."
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
      "*": {
        "pdf": "/modeles/lettre-pght.pdf",
        "docx": "/modeles/lettre-pght.docx",
        "pages": 1,
        "octetsPdf": 2365,
        "octetsDocx": 9138
      }
    }
  },
  "qos-pd": {
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
        "docx": "/modeles/qos-pd.docx",
        "pages": 1,
        "octetsPdf": 2449,
        "octetsDocx": 9295
      }
    }
  },
  "btif": {
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
        "docx": "/modeles/btif.docx",
        "pages": 1,
        "octetsPdf": 2354,
        "octetsDocx": 9187
      }
    }
  }
}
