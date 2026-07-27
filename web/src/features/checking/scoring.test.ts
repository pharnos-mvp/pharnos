/**
 * Table de vérité du moteur du Checking Standard (`landing/checking/scoring.js`).
 *
 * Le module vit dans `landing/` — la landing est servie SANS build, le navigateur charge le
 * fichier tel quel. On le teste depuis ici parce que Vitest n'est configuré que sur `web/src`.
 * Ces tests sont le contrat : le score et le verdict partent chez un prospect, puis dans un
 * e-mail. Une régression silencieuse ici, c'est un rapport faux envoyé sous notre marque.
 */
import { describe, expect, it } from 'vitest'

import { ITEMS_ENR, ITEMS_REN } from '../../../../landing/checking/referentiel.js'
import {
  BAREME_VERSION,
  buildFlow,
  computeResult,
  THRESHOLD_PARTIAL,
  THRESHOLD_READY,
  verdictOf,
} from '../../../../landing/checking/scoring.js'

type Answer = 'ok' | 'nc' | 'ko' | 'na'

/** Répond `v` à tout le questionnaire du contexte. */
const answerAll = (ctx: { op?: string; type?: string }, v: Answer): Record<string, string> =>
  Object.fromEntries(buildFlow(ctx).map((it) => [it.id, v]))

describe('buildFlow', () => {
  it("n'expose les items `only` qu'aux types de produit concernés", () => {
    const ids = (type: string) => buildFlow({ op: 'enr', type }).map((i) => i.id)
    expect(ids('gen')).toContain('dis')
    expect(ids('spec')).not.toContain('dis')
    expect(ids('vac')).not.toContain('dis')
    expect(buildFlow({ op: 'ren', type: 'gen' }).map((i) => i.id)).toContain('int')
    expect(buildFlow({ op: 'ren', type: 'spec' }).map((i) => i.id)).not.toContain('int')
  })

  it('retombe sur enregistrement/spécialité pour un contexte invalide ou absent', () => {
    const ref = buildFlow({ op: 'enr', type: 'spec' }).map((i) => i.id)
    expect(buildFlow({}).map((i) => i.id)).toEqual(ref)
    expect(buildFlow({ op: 'DROP TABLE', type: '../../etc' }).map((i) => i.id)).toEqual(ref)
    // @ts-expect-error — contrat défensif : le moteur reçoit un payload public non fiable.
    expect(buildFlow(undefined).map((i) => i.id)).toEqual(ref)
  })

  it('couvre les deux opérations sans identifiant en double', () => {
    for (const items of [ITEMS_ENR, ITEMS_REN]) {
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    }
  })
})

describe('computeResult — bornes du score', () => {
  it('tout conforme = 100, tous verrous satisfaits, dossier complet', () => {
    const r = computeResult({
      op: 'enr',
      type: 'gen',
      answers: answerAll({ op: 'enr', type: 'gen' }, 'ok'),
    })
    expect(r.score).toBe(100)
    expect(r.gateFail).toBe(false)
    expect(r.gateOk).toBe(r.gateTotal)
    expect(r.gateTotal).toBe(3)
    expect(r.missing).toEqual([])
    expect(r.complete).toBe(true)
    expect(r.verdict).toBe('ready')
  })

  it('rien de prêt = 0 et tous les verrous fermés', () => {
    const r = computeResult({
      op: 'enr',
      type: 'spec',
      answers: answerAll({ op: 'enr', type: 'spec' }, 'ko'),
    })
    expect(r.score).toBe(0)
    expect(r.gateOk).toBe(0)
    expect(r.gateFail).toBe(true)
    expect(r.verdict).toBe('gate_fail')
    expect(r.complete).toBe(false)
  })

  it('« présent mais non conforme » vaut strictement entre les deux', () => {
    const r = computeResult({
      op: 'enr',
      type: 'spec',
      answers: answerAll({ op: 'enr', type: 'spec' }, 'nc'),
    })
    expect(r.score).toBeGreaterThan(0)
    expect(r.score).toBeLessThan(THRESHOLD_PARTIAL)
    // …et ne satisfait AUCUN verrou : la réception ne se contente pas d'une pièce présente.
    expect(r.gateOk).toBe(0)
    expect(r.gateFail).toBe(true)
  })
})

describe('computeResult — règles fail-safe', () => {
  it('une réponse absente est notée comme absente, pas ignorée', () => {
    const full = answerAll({ op: 'enr', type: 'spec' }, 'ok')
    const partial = { ...full }
    delete partial.m3
    const r = computeResult({ op: 'enr', type: 'spec', answers: partial })
    expect(r.score).toBeLessThan(100)
    expect(r.answered).toBe(r.total - 1)
    expect(r.missing.map((m) => m.id)).toContain('m3')
  })

  it('une valeur de réponse inconnue est traitée comme absente', () => {
    const answers = { ...answerAll({ op: 'enr', type: 'spec' }, 'ok'), m3: 'oui' }
    const r = computeResult({ op: 'enr', type: 'spec', answers })
    expect(r.missing.map((m) => m.id)).toContain('m3')
    expect(r.answered).toBe(r.total - 1)
  })

  it('un verrou sans réponse reste fermé', () => {
    const answers = answerAll({ op: 'enr', type: 'spec' }, 'ok')
    delete answers.pay
    const r = computeResult({ op: 'enr', type: 'spec', answers })
    expect(r.gates.find((g) => g.key === 'pay')?.ok).toBe(false)
    expect(r.gateFail).toBe(true)
    expect(r.verdict).toBe('gate_fail')
  })

  it('un payload sans réponses ne fait pas exploser le moteur', () => {
    const r = computeResult({ op: 'ren', type: 'spec' })
    expect(r.score).toBe(0)
    expect(r.answered).toBe(0)
    expect(r.verdict).toBe('gate_fail')
  })
})

describe('computeResult — « non applicable » n’est pas une porte dérobée', () => {
  it("n'est honoré que sur les items qui l'offrent", () => {
    // `na` sort l'item du dénominateur : l'accepter partout permettrait de forger un
    // « 100/100 · prêt pour le dépôt » en répondant `na` à tout sauf aux trois verrous.
    const answers: Record<string, string> = { m1: 'ok', ech: 'ok', pay: 'ok' }
    for (const id of ['rcp', 'not', 'etiq', 'btif', 'pgr', 'dmf', 'm2', 'qos', 'm3', 'm4', 'm5']) {
      answers[id] = 'na'
    }
    const r = computeResult({ op: 'enr', type: 'spec', answers })
    expect(r.score).toBeLessThan(100)
    expect(r.verdict).not.toBe('ready')
    expect(r.complete).toBe(false)
    // Seul `pgr` propose réellement « non applicable » : les autres sont retombés en `ko`.
    expect(r.answers.pgr).toBe('na')
    expect(r.answers.m3).toBe('ko')
    expect(r.missing.map((m) => m.id)).toContain('m3')
  })

  it('expose un instantané des réponses retenues', () => {
    const answers = { ...answerAll({ op: 'enr', type: 'spec' }, 'ok'), m3: 'valeur-bidon' }
    const r = computeResult({ op: 'enr', type: 'spec', answers })
    expect(r.answers.m3).toBe('ko')
    expect(Object.keys(r.answers).length).toBe(r.total)
  })
})

describe('computeResult — « non applicable »', () => {
  it('sort l’item du dénominateur au lieu de le pénaliser', () => {
    const base = answerAll({ op: 'enr', type: 'spec' }, 'ok')
    const withNa = { ...base, pgr: 'na' }
    const withKo = { ...base, pgr: 'ko' }
    expect(computeResult({ op: 'enr', type: 'spec', answers: withNa }).score).toBe(100)
    expect(computeResult({ op: 'enr', type: 'spec', answers: withKo }).score).toBeLessThan(100)
  })

  it("n'apparaît pas dans le plan de préparation", () => {
    const answers = { ...answerAll({ op: 'enr', type: 'spec' }, 'ok'), pgr: 'na' }
    expect(computeResult({ op: 'enr', type: 'spec', answers }).missing).toEqual([])
  })
})

describe('computeResult — priorité du plan de préparation', () => {
  it('place les verrous avant toute autre correction, quel que soit le poids', () => {
    const answers = { ...answerAll({ op: 'enr', type: 'spec' }, 'ok'), pay: 'ko', etiq: 'ko' }
    const r = computeResult({ op: 'enr', type: 'spec', answers })
    expect(r.missing[0]?.id).toBe('pay')
    expect(r.missing.map((m) => m.id)).toEqual(['pay', 'etiq'])
  })

  it('est déterministe à poids égal (tri stable par identifiant)', () => {
    const answers = { ...answerAll({ op: 'enr', type: 'spec' }, 'ok'), rcp: 'ko', not: 'ko' }
    const once = computeResult({ op: 'enr', type: 'spec', answers }).missing.map((m) => m.id)
    const twice = computeResult({ op: 'enr', type: 'spec', answers }).missing.map((m) => m.id)
    expect(once).toEqual(twice)
    expect(once).toEqual(['not', 'rcp'])
  })

  it('reporte la clé de modèle officiel pour les pièces opposables', () => {
    const answers = { ...answerAll({ op: 'enr', type: 'spec' }, 'ok'), rcp: 'nc' }
    const r = computeResult({ op: 'enr', type: 'spec', answers })
    expect(r.missing.find((m) => m.id === 'rcp')).toMatchObject({ kind: 'nc', tpl: 'rcp' })
  })
})

describe('verdictOf — les verrous priment sur le score', () => {
  it('un verrou fermé bloque même un score parfait', () => {
    expect(verdictOf({ score: 100, gateFail: true })).toBe('gate_fail')
  })

  it('applique les seuils publiés hors situation de verrou', () => {
    expect(verdictOf({ score: THRESHOLD_READY, gateFail: false })).toBe('ready')
    expect(verdictOf({ score: THRESHOLD_READY - 1, gateFail: false })).toBe('incomplete')
    expect(verdictOf({ score: THRESHOLD_PARTIAL, gateFail: false })).toBe('incomplete')
    expect(verdictOf({ score: THRESHOLD_PARTIAL - 1, gateFail: false })).toBe('not_ready')
  })

  it("un dossier presque parfait mais bloqué n'est jamais annoncé comme prêt", () => {
    const answers = { ...answerAll({ op: 'enr', type: 'spec' }, 'ok'), ech: 'nc' }
    const r = computeResult({ op: 'enr', type: 'spec', answers })
    expect(r.score).toBeGreaterThan(THRESHOLD_READY)
    expect(r.verdict).toBe('gate_fail')
  })
})

describe('computeResult — renouvellement', () => {
  it('signale le dépôt hors délai des 120 jours', () => {
    const base = answerAll({ op: 'ren', type: 'spec' }, 'ok')
    expect(
      computeResult({ op: 'ren', type: 'spec', answers: { ...base, tim: 'nc' } }).flags,
    ).toEqual(['timing_nc'])
    expect(
      computeResult({ op: 'ren', type: 'spec', answers: { ...base, tim: 'ko' } }).flags,
    ).toEqual(['timing_ko'])
    expect(computeResult({ op: 'ren', type: 'spec', answers: base }).flags).toEqual([])
  })

  it('expose les mêmes trois verrous que l’enregistrement', () => {
    const r = computeResult({
      op: 'ren',
      type: 'spec',
      answers: answerAll({ op: 'ren', type: 'spec' }, 'ok'),
    })
    expect(r.gates.map((g) => g.key).sort()).toEqual(['ctd', 'ech', 'pay'])
  })
})

describe('traçabilité', () => {
  it('reporte la version du barème dans chaque résultat', () => {
    expect(computeResult({ op: 'enr', type: 'spec' }).version).toBe(BAREME_VERSION)
    expect(BAREME_VERSION).toMatch(/^uemoa-\d{4}\.\d+$/)
  })

  it('ne renvoie que des axes réellement évalués', () => {
    const r = computeResult({
      op: 'enr',
      type: 'spec',
      answers: answerAll({ op: 'enr', type: 'spec' }, 'ok'),
    })
    expect(r.axes.every((a) => a.pct === 100)).toBe(true)
    expect(r.axes.map((a) => a.key)).toEqual(['adm', 'tec', 'saf', 'rec'])
  })
})
