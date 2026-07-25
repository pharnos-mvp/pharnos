import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildRefSeedStatements } from './ref-seed'

// Garde-fou M7 (plan §6) : tant que les lettres/Roadmap/listAgencies lisent `roadmap-data.ts`
// en direct, le seed v2026.1 publié et le code ne doivent JAMAIS diverger. Ce test casse si
// l'un des deux bouge seul — c'est voulu : modifier `roadmap-data.ts` exige soit de régénérer
// la migration (avant qu'elle ne parte en prod), soit de publier une NOUVELLE version du
// référentiel ET de brancher les consommateurs code-only sur le résolveur.
// Vitest tourne depuis `web/` (local comme CI) ; `import.meta.url` n'est pas un file: URL ici.
const MIGRATION = resolve(process.cwd(), '../supabase/migrations/0071_ref_versions.sql')

describe('parité seed 0071 ↔ roadmap-data.ts', () => {
  it('chaque statement régénéré depuis le code est présent TEL QUEL dans la migration', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n')
    const stmts = buildRefSeedStatements()

    // 1 version + 17 entrées (10 agences · BJ fees+samples · CI fees+submission+samples · SN fees+samples).
    expect(stmts).toHaveLength(18)
    for (const stmt of stmts) {
      expect(sql, `statement absent ou divergent :\n${stmt.slice(0, 120)}…`).toContain(stmt)
    }
  })
})
