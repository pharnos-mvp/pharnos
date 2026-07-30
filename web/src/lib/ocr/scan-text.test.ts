import { describe, expect, it } from 'vitest'

/** Retour à la ligne, nommé pour rester lisible dans les fixtures multi-lignes. */
const BR = String.fromCharCode(10)

import { buildControlCorpus, isTextlessPage, pageAreaCm2, stripRunningLines } from './scan-text'

/** A4 en points PostScript — le format de référence des mesures ci-dessous. */
const A4 = pageAreaCm2(595, 842)
/** Le bon à tirer KV-Cipro : 400 × 500 mm, et 201 caractères d'annotations d'imprimeur. */
const GRAND_FORMAT = pageAreaCm2(1134, 1417)

describe('isTextlessPage', () => {
  it('sépare une page-image d’une page de texte', () => {
    expect(isTextlessPage(0, A4)).toBe(true)
    expect(isTextlessPage(2500, A4)).toBe(false)
  })

  it('un BON À TIRER d’imprimeur est reconnu comme vectorisé, malgré son texte technique', () => {
    // LE cas trouvé sur dossier réel (notice KV-Cipro). Un artwork porte quelques annotations en
    // vrai texte — cotes « 150 x 220 mm », adresse du fabricant — pendant que TOUT le corps est
    // vectorisé. Un seuil en nombre absolu le déclarait « textuel » : aucune reconnaissance n'était
    // lancée, le corpus se réduisait aux cotes de l'imprimeur, et chaque rubrique du dossier serait
    // ressortie « Non fourni » sur un document complet.
    expect(isTextlessPage(201, GRAND_FORMAT)).toBe(true)
    // Le même nombre de caractères sur une page de RCP reste... rare, mais la densité tranche.
    expect(isTextlessPage(2457, A4)).toBe(false)
  })

  it('la DENSITÉ s’adapte au format, un nombre absolu non', () => {
    // Ces notices vont de 180 × 350 mm à 400 × 500 mm : un seuil absolu serait faux pour la moitié.
    const petit = pageAreaCm2(510, 992) // KV-Super Muscle
    const grand = pageAreaCm2(1134, 1417) // KV-Cipro
    // 700 caractères couvrent un petit dépliant (1,1 car./cm²) mais se perdent sur un grand
    // artwork (0,35) : le MÊME nombre absolu ne dit pas la même chose selon le format.
    expect(isTextlessPage(700, petit)).toBe(false)
    expect(isTextlessPage(700, grand)).toBe(true)
  })

  it('la décision est PAR PAGE — un seuil global se trompait dans les deux sens', () => {
    const pages = [...Array<number>(20).fill(2500), ...Array<number>(5).fill(0)]
    expect(pages.map((c) => isTextlessPage(c, A4)).filter(Boolean)).toHaveLength(5)
    // Seules les pages pauvres sont océrisées ; les autres gardent leur texte EXACT.
    expect([40, 2500, 2200, 60].map((c) => isTextlessPage(c, A4))).toEqual([
      true,
      false,
      false,
      true,
    ])
  })

  it('une page sans dimensions connues retombe sur la seule présence de texte', () => {
    expect(isTextlessPage(0, 0)).toBe(true)
    expect(isTextlessPage(10, 0)).toBe(false)
  })
})

describe('stripRunningLines', () => {
  const page = (n: number, body: string) =>
    ['KV-KACIN 500 mg — Résumé des caractéristiques', body, `Page ${n} sur 4`].join('\n')

  it('retire en-tête courant et pied de page numéroté', () => {
    // Le masquage des chiffres est ce qui permet de reconnaître « Page 1 sur 4 » et « Page 2 sur 4 »
    // comme une seule et même ligne courante.
    const out = stripRunningLines([
      page(1, '4.1 Indications thérapeutiques'),
      page(2, '4.2 Posologie et mode d’administration'),
      page(3, '4.8 Effets indésirables'),
      page(4, '6.3 Durée de conservation'),
    ])
    expect(out).toEqual([
      '4.1 Indications thérapeutiques',
      '4.2 Posologie et mode d’administration',
      '4.8 Effets indésirables',
      '6.3 Durée de conservation',
    ])
  })

  it('retire un numéro de page NU, quelle que soit sa décoration', () => {
    const out = stripRunningLines([
      'Contenu de la première page utile\n— 7 —',
      'Contenu de la deuxième page utile\n— 8 —',
      'Contenu de la troisième page utile\n— 9 —',
    ])
    expect(out.every((p) => !/\d/.test(p))).toBe(true)
  })

  it('sous trois pages, « répété » ne veut rien dire : aucun retrait', () => {
    const pages = ['Titre\nContenu A\n1', 'Titre\nContenu B\n2']
    expect(stripRunningLines(pages)).toEqual(pages)
  })

  it('un document sans ornement ressort intact', () => {
    const pages = ['Rubrique 1 dénomination', 'Rubrique 2 composition', 'Rubrique 3 forme']
    expect(stripRunningLines(pages)).toEqual(pages)
  })

  it('un pied de page répété plusieurs fois sur la MÊME page ne compte qu’une fois', () => {
    // Sinon un ornement présent trois fois sur une page unique franchirait le seuil à lui seul et
    // ferait supprimer des lignes de bord légitimes sur les autres pages.
    const pages = [
      'Confidentiel\nContenu A\nContenu A bis\nConfidentiel',
      'Titre distinct un\nContenu B\nFin un',
      'Titre distinct deux\nContenu C\nFin deux',
    ]
    const out = stripRunningLines(pages)
    expect(out[1]).toBe(pages[1])
    expect(out[2]).toBe(pages[2])
  })
})

describe('buildControlCorpus', () => {
  it('sépare les pages par une ligne vide', () => {
    // Sans séparation, la dernière ligne d'une page et la première de la suivante se colleraient en
    // un mot inexistant, et une citation traversant la coupure deviendrait introuvable.
    const corpus = buildControlCorpus(['fin de page un', 'début de page deux', 'et de page trois'])
    expect(corpus).toBe('fin de page un\n\ndébut de page deux\n\net de page trois')
  })

  it('écarte les pages devenues vides après retrait des ornements', () => {
    const corpus = buildControlCorpus([
      'En-tête\nContenu réel de la page\nPage 1',
      'En-tête\nPage 2',
      'En-tête\nAutre contenu réel\nPage 3',
    ])
    expect(corpus).toBe('Contenu réel de la page\n\nAutre contenu réel')
  })
})

describe('stripRunningLines — la frontière entre ornement et donnée', () => {
  it('une valeur numérique en bas de page COURTE survit', () => {
    // Le cas qui a fait corriger la conception : avec une bande de deux lignes, l'avant-dernière
    // ligne d'une page courte est du CORPS. Toutes les lignes numériques partageant la clé « # »,
    // une bande trop large effaçait la valeur de tableau de toutes les pages à la fois.
    const pages = [
      'En-tête courant\nChaque comprimé contient 250 mg\n250\nPage 1',
      'En-tête courant\nExcipient à effet notoire : lactose\n250\nPage 2',
      'En-tête courant\nDurée de conservation : 24 mois\n250\nPage 3',
    ]
    const out = stripRunningLines(pages)
    expect(out.every((p) => p.includes('250'))).toBe(true)
    expect(out.every((p) => !p.includes('En-tête'))).toBe(true)
    expect(out.every((p) => !/Page \d/.test(p))).toBe(true)
  })

  it('un numéro de page en TOUTE DERNIÈRE ligne est bien retiré', () => {
    const out = stripRunningLines([
      'Contenu de la page une qui est reelle\n12',
      'Contenu de la page deux qui est reelle\n13',
      'Contenu de la page trois qui est reelle\n14',
    ])
    expect(out.every((p) => !/\d/.test(p))).toBe(true)
  })

  it('un numéro de page en PREMIÈRE ligne est retiré aussi', () => {
    const out = stripRunningLines([
      '12\nContenu de la page une qui est reelle',
      '13\nContenu de la page deux qui est reelle',
      '14\nContenu de la page trois qui est reelle',
    ])
    expect(out.every((p) => !/\d/.test(p))).toBe(true)
  })
})

describe('stripRunningLines — le libellé de page se reconnaît par ce qu’il EST', () => {
  it('retire « Page 6/59 » où qu’il se trouve dans la page', () => {
    // Constaté sur un scan réel : le bloc d'en-tête d'un document officiel s'étale sur cinq lignes
    // et le numéro de page atterrit au MILIEU, hors de toute bande de bord. Aucune largeur de bande
    // ne l'attrape ; le reconnaître par sa forme, oui.
    const pages = [
      'Reference DISV-VIG SD 001\nAgence senegalaise\nReglementation\npharmacovigilance\nPage 6/59\nRemerciements',
      'entete garbled autrement\nautre ligne\nPage 7 sur 59\nIntroduction',
      'p. 8\nLa pharmacovigilance peut etre definie comme',
    ]
    const out = stripRunningLines(pages)
    expect(out.some((p) => /page/i.test(p))).toBe(false)
    // ...et le contenu réel survit.
    expect(out[0]).toContain('Remerciements')
    expect(out[2]).toContain('La pharmacovigilance')
  })

  it('n’efface PAS une ligne qui contient un libellé de page ET du contenu', () => {
    // La règle porte sur la ligne ENTIÈRE : « Page 6 — Effets indésirables » porte une rubrique.
    const pages = [
      'Page 6 — 4.8 Effets indesirables\nContenu un',
      'Page 7 — 4.9 Surdosage\nContenu deux',
      'Page 8 — 5.1 Pharmacodynamie\nContenu trois',
    ]
    const out = stripRunningLines(pages)
    expect(out[0]).toContain('4.8 Effets indesirables')
  })

  it('une ligne réduite à « 6/59 » relève de la position, pas du libellé', () => {
    // Ambiguë par nature : proportion, date, dosage. On ne la retire que si elle est en extrémité
    // ET répétée — la règle générale, pas l'exception.
    const pages = [
      'Chaque comprime contient\n6/59\nsuite du contenu de la page',
      'Autre contenu de la page deux\n6/59\nsuite deux',
      'Autre contenu de la page trois\n6/59\nsuite trois',
    ]
    expect(stripRunningLines(pages).every((p) => p.includes('6/59'))).toBe(true)
  })
})

describe('stripRunningLines — folio contre donnée', () => {
  it('un folio nu CROISSANT est retiré', () => {
    const out = stripRunningLines([
      'Contenu reel de la page une\n6',
      'Contenu reel de la page deux\n7',
      'Contenu reel de la page trois\n8',
    ])
    expect(out.every((p) => !/\d/.test(p))).toBe(true)
  })

  it('une valeur RÉPÉTÉE n’est pas un folio et survit', () => {
    // Le cas qui a fait ajouter la preuve de croissance : après retrait du libellé de page, la valeur
    // de tableau devenait la dernière ligne, donc éligible — et le masquage des chiffres la confondait
    // avec un folio. L'effacer aurait retiré du corpus une donnée que la citation porte peut-être.
    const out = stripRunningLines([
      'Chaque comprime contient 250 mg\n250\nPage 1',
      'Excipient a effet notoire lactose\n250\nPage 2',
      'Duree de conservation 24 mois\n250\nPage 3',
    ])
    expect(out.every((p) => p.includes('250'))).toBe(true)
    expect(out.every((p) => !/page/i.test(p))).toBe(true)
  })
})

describe('stripRunningLines — la preuve porte sur la LIGNE candidate, pas sur la page', () => {
  it('une ligne numérique DANS LE CORPS n’empêche pas le retrait des folios', () => {
    // Défaut trouvé en revue : la preuve de croissance lisait la PREMIÈRE ligne numérique de la page
    // au lieu de la candidate. Une valeur de tableau dans le corps suffisait alors à faire échouer la
    // preuve — et les folios restaient dans le corpus de TOUT le document, donc chaque jonction de
    // page devenait une rubrique « Non fourni ».
    const out = stripRunningLines([
      'Tableau posologie\n500\nAdultes deux fois par jour\n6',
      'Suite du tableau\n500\nEnfants une fois par jour\n7',
      'Fin du tableau\n500\nPersonnes agees\n8',
    ])
    expect(out.every((p) => p.includes('500'))).toBe(true)
    expect(out.some((p) => /\b[678]\b/.test(p))).toBe(false)
  })

  it('la preuve de folio ne retire QUE les positions qui l’ont formée', () => {
    // Folio en tête, valeur de tableau en pied : la clé masquée est la même (« # »). Retirer toutes
    // les lignes de cette clé effacerait la composition qualitative du corpus.
    const out = stripRunningLines([
      '6\nChaque comprime contient 250 mg de principe actif\n250',
      '7\nExcipient a effet notoire lactose monohydrate\n250',
      '8\nDuree de conservation vingt quatre mois\n250',
    ])
    expect(out.every((p) => p.includes('250'))).toBe(true)
    expect(out.some((p) => /^[678]$/m.test(p))).toBe(false)
  })

  it('la preuve vaut pour TOUTE clé sans lettre, pas seulement « # »', () => {
    // « 140/90 » se masque en « #/# » : une garde limitée à la clé « # » laissait effacer des
    // valeurs de pression artérielle, de proportion ou de dosage composé.
    const out = stripRunningLines([
      'Pression arterielle cible du protocole\n140/90',
      'Valeurs observees au jour sept du traitement\n130/85',
      'Valeurs observees au jour quatorze du traitement\n120/80',
    ])
    expect(out[0]).toContain('140/90')
    expect(out[2]).toContain('120/80')
  })

  it('sur une page COURTE, le CORPS reste hors d’atteinte', () => {
    // Une bande fixe de quatre lignes avale une page de six lignes entière : il n'y a plus de corps
    // à protéger, et un contenu répété disparaît des trois pages. La bande est donc proportionnelle —
    // un tiers de la page à chaque extrémité — ce qui laisse toujours un milieu intact.
    //
    // ⚠️ Ce que cela ne promet PAS : une ligne réellement identique EN BORD de chaque page reste
    // indistinguable d'un pied courant, et part. Aucun signal ne les sépare, et c'est assumé.
    const out = stripRunningLines([
      [
        'Tableau 1 - Composition',
        'Substance active',
        'Kacine chlorhydrate 500 mg',
        'Excipients qsp',
        'Lactose',
        'Fin page une',
      ].join(BR),
      [
        'Tableau 1 - Composition',
        'Substance active',
        'Kacine chlorhydrate 250 mg',
        'Excipients qsp',
        'Amidon',
        'Fin page deux',
      ].join(BR),
      [
        'Tableau 1 - Composition',
        'Substance active',
        'Kacine chlorhydrate 125 mg',
        'Excipients qsp',
        'Talc',
        'Fin page trois',
      ].join(BR),
    ])
    // Le corps — dosages et sous-titre du milieu — survit intégralement.
    expect(out[0]).toContain('Kacine chlorhydrate 500 mg')
    expect(out[1]).toContain('Kacine chlorhydrate 250 mg')
    expect(out.every((p) => p.includes('Excipients qsp'))).toBe(true)
    // L'en-tête réellement répété, lui, part.
    expect(out.every((p) => !p.includes('Tableau 1 - Composition'))).toBe(true)
  })
})
