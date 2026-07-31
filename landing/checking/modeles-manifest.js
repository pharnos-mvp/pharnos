/**
 * FICHIER GÉNÉRÉ par web/scripts/build-landing-modeles.mjs — NE PAS ÉDITER À LA MAIN.
 * Régénérer : `npm run build:landing-modeles` (depuis web/), puis committer landing/modeles/.
 *
 * `perPays: false` signifie que le document ne porte AUCUNE mention nationale : un seul fichier
 * sert les huit pays. Le déclarer par pays donnerait huit copies identiques — une variation de
 * façade que la page présenterait comme un choix.
 */
export const MODELES_VERSION = "2026.1"

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
    "upgradable": true,
    "perPays": true,
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
    "upgradable": true,
    "perPays": false,
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
    "upgradable": true,
    "perPays": false,
    "fichiers": {
      "*": {
        "pdf": "/modeles/etiquetage.pdf",
        "docx": "/modeles/etiquetage.docx",
        "pages": 4,
        "octetsPdf": 6556,
        "octetsDocx": 10323
      }
    }
  }
}
