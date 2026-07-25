import {
  listAgencies,
  officialLanguage,
  regulatoryProfileFor,
} from '@/features/workspace/roadmap-data'

/**
 * Générateur du seed 0071 — sérialise le contenu réglementaire du CODE (`roadmap-data.ts`) en
 * INSERT SQL. C'est LA source de la section seed de `supabase/migrations/0071_ref_versions.sql` ;
 * la parité est verrouillée par `ref-seed.test.ts` : si `roadmap-data.ts` bouge sans que la
 * migration (ou une NOUVELLE version publiée) ne suive, le test casse — volontairement (garde-fou
 * M7 : tant que lettres/Roadmap lisent le code, code et référentiel ne doivent JAMAIS diverger).
 * Importé uniquement par le test → tree-shaké du bundle applicatif.
 */
export const REF_SEED_VERSION_ID = '7a1e4d20-0000-4000-8000-000000000071'
export const REF_SEED_LABEL = 'v2026.1'

/** Provenance curée par pays/section — reprend les sources citées en commentaire du code. */
const PROVENANCE: Record<string, Record<string, string>> = {
  agency: {
    texte: 'Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)',
    note: 'Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf',
  },
  BJ: {
    texte: 'Barème officiel ABMed (Bénin)',
    note: 'Source CEO — fiches ABMed',
  },
  CI: {
    texte: 'Décret n° 2015-602 du 02/09/2015 (redevances AMM)',
    complements:
      'Modalités AIRP n° 01509 du 22/07/2024 · Note circulaire n° 0914/AIRP du 24/03/2026',
    note: 'RA-source/RAG_Ivory cost/',
  },
  SN: {
    texte: 'Décret n° 2025-1833 du 18/11/2025 (redevances régulation pharmaceutique), section 4',
    jo: 'Journal officiel n° 7871 du 29/12/2025',
    note: 'RA-source/Decret-2025-1833-redevances-ARP-Senegal.pdf',
  },
}

// Dollar-quoting sûr pour le JSON (apostrophes françaises fréquentes).
const j = (obj: unknown) => `$j$${JSON.stringify(obj)}$j$::jsonb`
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Un statement SQL par élément (version d'abord, puis 17 entrées) — texte EXACT du seed. */
export function buildRefSeedStatements(): string[] {
  const stmts: string[] = []
  stmts.push(
    [
      'insert into public.ref_versions (id, label, status, effective_date, release_note, published_at)',
      `values ('${REF_SEED_VERSION_ID}', '${REF_SEED_LABEL}', 'published', null,`,
      `  ${q('Socle initial — agences UEMOA/CEDEAO + barèmes BJ/CI/SN (contenu repris du code, provenance citée).')},`,
      '  now())',
      'on conflict (label) do nothing;',
    ].join('\n'),
  )

  const entry = (country: string, section: string, payload: unknown, provenance: unknown) =>
    stmts.push(
      [
        'insert into public.ref_entries (version_id, country, section, payload, provenance)',
        `values ('${REF_SEED_VERSION_ID}', ${q(country)}, ${q(section)}, ${j(payload)}, ${j(provenance)})`,
        'on conflict (version_id, country, section) do nothing;',
      ].join('\n'),
    )

  for (const { code, agency } of listAgencies()) {
    entry(code, 'agency', { ...agency, officialLang: officialLanguage(code) }, PROVENANCE.agency)
    const p = regulatoryProfileFor(code)
    if (!p) continue
    const prov = PROVENANCE[code] ?? { texte: 'Barème national officiel' }
    const { samples, submissionNote, ...feesPart } = p
    entry(code, 'fees', feesPart, prov)
    if (submissionNote) entry(code, 'submission', { note: submissionNote }, prov)
    if (samples && Object.keys(samples).length > 0) entry(code, 'samples', { samples }, prov)
  }
  return stmts
}
