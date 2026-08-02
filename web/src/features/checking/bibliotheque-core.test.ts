/**
 * Contrat de la logique de la Bibliothèque réglementaire (`landing/checking/bibliotheque-core.js`).
 *
 * Deux familles de règles se protègent ici, et elles ne sont pas techniques :
 *   • le PRIX affiché — un format qui ne montre qu'une devise laisse un acheteur ivoirien
 *     découvrir le montant réel au moment de payer ;
 *   • « un paiement = un document » — aucune notion de solde, de crédit ni de compteur ne doit
 *     apparaître dans ce module, sous peine de promettre un forfait qui n'existe pas.
 */
import { describe, expect, it } from 'vitest'

import { MODELES_FICHIERS } from '../../../../landing/checking/modeles-manifest.js'
import { PAYS } from '../../../../landing/checking/referentiel.js'
import {
  EXTENSIONS,
  estPerimee,
  fichierModele,
  fmtMontant,
  MAX_OCTETS,
  nouvelleCommande,
  TRIO_UPGRADABLE,
  OFFRES,
  PRIX,
  PRIX_UP3_PLEIN,
  prixCourt,
  prixDouble,
  tailleLisible,
  TTL_MS,
  validerFichier,
  varieParPays,
} from '../../../../landing/checking/bibliotheque-core.js'

describe('prix — barème CEO du 30/07/2026', () => {
  it('porte les montants arrêtés', () => {
    expect(PRIX.up1).toEqual({ eur: 29, xof: 19000 })
    expect(PRIX.up3).toEqual({ eur: 69, xof: 45000 })
  })

  it('affiche les DEUX devises, euro d’abord, dans les deux langues', () => {
    expect(prixDouble(PRIX.up1, 'fr')).toBe('29 € (19 000 FCFA)')
    expect(prixDouble(PRIX.up1, 'en')).toBe('29 € (19,000 FCFA)')
    expect(prixDouble(PRIX.up3, 'fr')).toBe('69 € (45 000 FCFA)')
    expect(prixDouble(PRIX.up3, 'en')).toBe('69 € (45,000 FCFA)')
  })

  it('normalise les espaces insécables des séparateurs de milliers', () => {
    // `toLocaleString('fr-FR')` rend U+202F ou U+00A0 selon le moteur : deux montants identiques
    // s'afficheraient différemment d'un navigateur à l'autre, et toute comparaison de chaîne
    // échouerait sans que rien ne le signale.
    const s = fmtMontant(19000, 'fr')
    expect(s).toBe('19 000')
    expect(/[\u202F\u00A0]/.test(s)).toBe(false)
  })

  it('chiffre l’économie du bundle sur le plein tarif de trois documents', () => {
    expect(PRIX_UP3_PLEIN).toEqual({ eur: 87, xof: 57000 })
    expect(PRIX_UP3_PLEIN.eur - PRIX.up3.eur).toBe(18)
    expect(prixCourt(PRIX_UP3_PLEIN, 'fr')).toBe('87 €')
  })

  it('n’expose ni solde, ni crédit, ni compteur de documents restants', () => {
    // Un paiement = un document. `documents` décrit ce que couvre l'offre, pas un reste à
    // consommer : aucune clé de ce module ne doit ressembler à un compteur.
    const cles = Object.values(OFFRES).flatMap((o) => Object.keys(o))
    expect(cles).not.toContain('credits')
    expect(cles).not.toContain('solde')
    expect(cles).not.toContain('restants')
    expect(OFFRES.up1.documents).toBe(1)
    expect(OFFRES.up3.documents).toBe(3)
  })
})

describe('taille lisible', () => {
  it('bascule de Ko en Mo et suit la langue', () => {
    expect(tailleLisible(500 * 1024, 'fr')).toBe('500 Ko')
    expect(tailleLisible(8.4 * 1024 * 1024, 'fr')).toBe('8,4 Mo')
    expect(tailleLisible(8.4 * 1024 * 1024, 'en')).toBe('8.4 MB')
  })

  it('n’annonce jamais « 0 Ko » pour un fichier non vide', () => {
    expect(tailleLisible(120, 'fr')).toBe('1 Ko')
  })
})

describe('fichier servi — le pays commande le fichier', () => {
  it('rend un fichier distinct par pays pour le RCP', () => {
    const urls = PAYS.map((p: { k: string }) => fichierModele('rcp', p.k).pdf)
    expect(new Set(urls).size).toBe(PAYS.length)
    expect(fichierModele('rcp', 'sn').pdf).toContain('rcp-sn')
  })

  it('rend le même fichier aux huit pays pour un document sans mention nationale', () => {
    const urls = PAYS.map((p: { k: string }) => fichierModele('notice', p.k).pdf)
    expect(new Set(urls).size).toBe(1)
  })

  it('refuse de retomber sur un autre pays plutôt que de servir le mauvais modèle', () => {
    // Servir le RCP béninois à un déposant sénégalais enverrait `vigilances.abmed@gouv.bj` dans
    // un dossier sénégalais : mieux vaut une erreur bruyante qu'un document plausible et faux.
    expect(() => fichierModele('rcp', 'xx')).toThrow(/aucun fichier pour le pays/)
    expect(() => fichierModele('inconnu', 'bj')).toThrow(/modèle inconnu/)
  })

  it('dit la vérité sur ce qui varie', () => {
    expect(varieParPays('rcp')).toBe(true)
    expect(varieParPays('notice')).toBe(false)
    // Le manifeste généré est un littéral : on le relit en enregistrement pour l'indexer.
    const manifeste = MODELES_FICHIERS as unknown as Record<string, { perPays: boolean }>
    for (const [slug, m] of Object.entries(manifeste)) {
      expect(varieParPays(slug), slug).toBe(m.perPays)
    }
  })
})

describe('document déposé', () => {
  const f = (name: string, size = 1000) => ({ name, size })

  it('accepte les formats réellement déposés en UEMOA, scan compris', () => {
    for (const ext of EXTENSIONS) expect(validerFichier(f(`dossier${ext}`)).ok).toBe(true)
    expect(validerFichier(f('SCAN_RCP.PDF')).ok).toBe(true)
  })

  it('refuse ce qui ne peut pas être traité, en nommant la cause', () => {
    expect(validerFichier(null)).toEqual({ ok: false, raison: 'absent' })
    expect(validerFichier(f('photo.png'))).toEqual({ ok: false, raison: 'extension' })
    expect(validerFichier(f('vide.pdf', 0))).toEqual({ ok: false, raison: 'vide' })
    expect(validerFichier(f('enorme.pdf', MAX_OCTETS + 1))).toEqual({
      ok: false,
      raison: 'trop_gros',
    })
  })

  it('accepte exactement la taille maximale', () => {
    expect(validerFichier(f('limite.pdf', MAX_OCTETS)).ok).toBe(true)
  })
})

describe('commande — le contexte est capté AVANT le premier appel du moteur', () => {
  const base = {
    doc: 'rcp',
    pays: 'sn',
    activite: 'amm',
    offre: 'up1',
    fichier: new Blob(['x']),
    nomFichier: 'rcp.pdf',
    octets: 1,
    id: 'id-1',
    cree: 1_700_000_000_000,
  }

  it('conserve le pays, l’activité et le document', () => {
    const c = nouvelleCommande(base)
    expect(c).toMatchObject({ doc: 'rcp', pays: 'sn', activite: 'amm', offre: 'up1' })
    expect(c.fichier).toBeInstanceOf(Blob)
  })

  it('refuse une activité vide ou inconnue', () => {
    // Pays et activité entrent dans le prompt de CHAQUE rubrique : les laisser passer vides
    // produirait un document mis à niveau sur un contexte que personne n'a choisi.
    expect(() => nouvelleCommande({ ...base, activite: '' })).toThrow(/activité inconnue/)
    expect(() => nouvelleCommande({ ...base, activite: 'variation' })).toThrow(/activité inconnue/)
  })

  /* ── Le bundle vend TROIS documents : la commande doit les PORTER, pas les promettre.
     Sans ces garanties, on encaisse 69 € puis on réclame le reste par e-mail — le client
     travaille après avoir payé, et la commande part sans sa matière. ── */
  const annexe = (doc: string) => ({ doc, fichier: new File(['x'], `${doc}.pdf`) })

  it('le bundle porte les DEUX autres documents du trio, ni plus ni moins', () => {
    expect(() => nouvelleCommande({ ...base, offre: 'up3' })).toThrow(/le bundle attend/)
    expect(() => nouvelleCommande({ ...base, offre: 'up3', annexes: [annexe('notice')] })).toThrow(
      /le bundle attend/,
    )
    const c = nouvelleCommande({
      ...base,
      offre: 'up3',
      annexes: [annexe('notice'), annexe('etiquetage')],
    })
    expect(c.annexes.map((a: { doc: string }) => a.doc).sort()).toEqual(['etiquetage', 'notice'])
    // Nom et taille sont DÉRIVÉS du fichier : l'écran de confirmation ne lit que ceux-là.
    expect(c.annexes[0]).toMatchObject({ nomFichier: 'notice.pdf', octets: 1 })
  })

  it('compter ne suffit pas — deux fois le même document n’est pas un bundle', () => {
    expect(() =>
      nouvelleCommande({ ...base, offre: 'up3', annexes: [annexe('notice'), annexe('notice')] }),
    ).toThrow(/le bundle attend/)
  })

  it('une offre à un document ne porte aucune annexe', () => {
    expect(() => nouvelleCommande({ ...base, annexes: [annexe('notice')] })).toThrow(
      /ne porte pas d'annexe/,
    )
  })

  it('refuse une annexe sans fichier ou de document inconnu', () => {
    expect(() =>
      nouvelleCommande({
        ...base,
        offre: 'up3',
        // Un appelant JS peut passer une annexe sans fichier : le contrat doit le refuser
        // AVANT la commande, pas en lisant plus tard un Blob absent.
        annexes: [annexe('notice'), { doc: 'etiquetage' } as unknown as ReturnType<typeof annexe>],
      }),
    ).toThrow(/sans fichier/)
    expect(() =>
      nouvelleCommande({ ...base, offre: 'up3', annexes: [annexe('notice'), annexe('qos-pd')] }),
    ).toThrow(/le bundle attend/)
  })

  it('le trio est DÉRIVÉ du manifeste, jamais recopié', () => {
    // Un quatrième document `upgradable` ferait un bundle à trois annexes qu'aucun écran ne
    // collecte : le test échoue AVANT que la vente ne casse.
    expect([...TRIO_UPGRADABLE].sort()).toEqual(['etiquetage', 'notice', 'rcp'])
  })

  it('accepte le renouvellement, qui change les rubriques 8, 9 et 10', () => {
    expect(nouvelleCommande({ ...base, activite: 'renouv' }).activite).toBe('renouv')
  })

  it('refuse une offre ou un document inconnus', () => {
    expect(() => nouvelleCommande({ ...base, offre: 'abo' })).toThrow(/offre inconnue/)
    expect(() => nouvelleCommande({ ...base, doc: 'qos' })).toThrow(/document inconnu/)
  })
})

describe('conservation du document', () => {
  const t0 = 1_700_000_000_000
  it('garde la commande pendant la durée annoncée, puis la purge', () => {
    const cmd = { cree: t0 }
    expect(estPerimee(cmd, t0)).toBe(false)
    expect(estPerimee(cmd, t0 + TTL_MS)).toBe(false)
    expect(estPerimee(cmd, t0 + TTL_MS + 1)).toBe(true)
  })

  it('traite une entrée absente comme périmée', () => {
    expect(estPerimee(null, t0)).toBe(true)
  })

  it('couvre un paiement par virement sans laisser traîner un document indéfiniment', () => {
    expect(TTL_MS).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1000)
    expect(TTL_MS).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000)
  })
})
