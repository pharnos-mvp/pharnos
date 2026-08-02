/**
 * Câblage de la page `/modele` — les identifiants que le script cherche existent-ils vraiment
 * dans la page qu'il pilote ?
 *
 * Pourquoi ce test : `landing/` est du HTML servi tel quel, sans compilation. Un `$("#buy3")`
 * qui ne correspond à aucun élément ne casse rien au chargement : il lève au CLIC, hors du
 * `try`, et le parcours d'achat s'arrête sans un mot. C'est exactement ce qui est arrivé au
 * bouton du bundle. Un `grep` croisé coûte moins cher qu'une vente perdue.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const racine = path.resolve(__dirname, '../../../../landing')
const lire = (p: string) => fs.readFileSync(path.join(racine, p), 'utf8')

const JS = lire('modele.js')
const PAGES = ['modele.html', 'en/template.html'] as const

/**
 * Les `"#xxx"` littéraux du script — un sélecteur construit dynamiquement échappe au contrôle,
 * et c'est assumé : on garde ce qui est vérifiable sans deviner.
 *
 * Le GUILLEMET FERMANT fait partie du motif, sinon un identifiant interpolé laisse son préfixe
 * derrière lui : `href="#fl-${pays}"` était lu comme un `id="fl-"` littéral, qu'aucune page ne
 * porte — la garde échouait sur un nœud qui n'a jamais été cherché. Exiger la fermeture ne perd
 * aucun vrai sélecteur (vérifié : 88 des 89, le 89ᵉ étant précisément ce préfixe).
 */
const idsCherches = [...JS.matchAll(/"#([A-Za-z][\w-]*)"/g)].map((m) => m[1] as string)

describe('page /modele — câblage script ↔ page', () => {
  it('cherche au moins la trentaine de nœuds attendus', () => {
    expect(new Set(idsCherches).size).toBeGreaterThan(30)
  })

  it.each(PAGES)('%s porte tous les identifiants que le script interroge', (page) => {
    const html = lire(page)
    const manquants = [...new Set(idsCherches)].filter((id) => !html.includes(`id="${id}"`))
    expect(manquants).toEqual([])
  })
})

describe('parcours de règlement', () => {
  /** Le lien « accès direct au paiement » de Chariow finit par `/checkout` : sans ce suffixe, le
   *  client atterrit sur une fiche produit de boutique et doit re-cliquer pour payer. */
  it('les liens de règlement configurés mènent droit au paiement', () => {
    const bloc = JS.slice(JS.indexOf('const CHECKOUT = {'))
    const liens = [...bloc.slice(0, bloc.indexOf('};')).matchAll(/`([^`]+)`/g)].map(
      (m) => m[1] as string,
    )
    expect(liens.length).toBe(2)
    for (const lien of liens) {
      expect(lien.startsWith('${BOUTIQUE}/prd_')).toBe(true)
      expect(lien.endsWith('/checkout')).toBe(true)
    }
  })

  /** Le domaine de paiement se change à UN seul endroit — sinon une offre bascule et l'autre
   *  reste sur l'ancienne boutique, sans que rien ne le signale. */
  it("l'origine de la boutique est déclarée une seule fois, en https", () => {
    const origines = [...JS.matchAll(/const BOUTIQUE = "([^"]+)"/g)].map((m) => m[1] as string)
    expect(origines.length).toBe(1)
    expect(origines[0]).toMatch(/^https:\/\/[a-z0-9.-]+$/)
  })

  it.each(PAGES)('%s : la confirmation de retour ne repropose aucun achat', (page) => {
    const html = lire(page)
    const debut = html.indexOf('id="upg-e3"')
    expect(debut).toBeGreaterThan(0)
    // L'étape 3 est le dernier bloc du panneau : tout ce qui suit jusqu'à `</aside>` est à elle.
    const etape3 = html.slice(debut, html.indexOf('</aside>', debut))
    // Reproposer « Commander » à un client qui vient de régler le ferait payer deux fois.
    for (const achat of ['id="buy1"', 'id="bx1"', 'id="bx3"']) {
      expect(etape3).not.toContain(achat)
    }
  })
})
