import { inflateRawSync, inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  DELIVERABLE_FILE_COUNT,
  DOCX_NONDETERMINISTIC_ENTRY,
  renderDeliverables,
  upgradeJobs,
} from './index'

/**
 * Tout le texte d'un PDF, flux compressés inclus.
 *
 * `pdf-lib` comprime les flux de contenu et regroupe les objets : chercher une chaîne dans les
 * octets bruts ne prouverait rien — ni sa présence, ni son absence. On décompresse donc, comme le
 * ferait n'importe quel extracteur.
 */
function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes)
  const raw = buf.toString('latin1')
  const parts: string[] = [raw]
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    try {
      parts.push(inflateSync(buf.subarray(start, end)).toString('latin1'))
    } catch {
      // Flux non compressé ou tronqué : le texte brut est déjà dans `parts`.
    }
  }
  // `pdf-lib` écrit les chaînes tracées en HEXADÉCIMAL (`<322E20…> Tj`), pas en littéral `(…)`.
  // Sans ce décodage, on ne trouverait aucun texte et l'on conclurait à tort à son absence.
  return parts
    .join('\n')
    .replace(/<([0-9A-Fa-f\s]+)>\s*Tj/g, (_, h: string) =>
      Buffer.from(h.replace(/\s+/g, ''), 'hex').toString('latin1'),
    )
}

/**
 * Contenu d'un DOCX, entrée par entrée — lecteur ZIP minimal, sans dépendance.
 *
 * Lu par le CATALOGUE CENTRAL et non par les en-têtes locaux : ceux-ci peuvent porter des tailles
 * nulles quand l'empaqueteur écrit un descripteur de données, et l'on lirait alors des entrées
 * vides en croyant les avoir comparées — un test qui passe sans rien vérifier.
 */
function docxEntries(bytes: Uint8Array): Map<string, string> {
  const buf = Buffer.from(bytes)
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('ZIP invalide : fin de catalogue introuvable')

  const out = new Map<string, string>()
  let p = buf.readUInt32LE(eocd + 16)
  while (buf.readUInt32LE(p) === 0x02014b50) {
    const method = buf.readUInt16LE(p + 10)
    const compressed = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')

    const local = buf.readUInt32LE(p + 42)
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(dataAt, dataAt + compressed)
    if (!name.endsWith('/')) {
      out.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'))
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const FR = [
  '## RÉSUMÉ DES CARACTÉRISTIQUES DU PRODUIT',
  '',
  '### 1. DÉNOMINATION DU MÉDICAMENT',
  '',
  'KV-KACIN 500, poudre pour solution injectable.',
  '',
  '### 2. COMPOSITION QUALITATIVE ET QUANTITATIVE',
  '',
  '- Amikacine sulfate ......... 500 mg',
  '',
  '### 4.8 Effets indésirables',
  '',
  'Très fréquent (≥ 1/10) : néphrotoxicité. Concentration de 25 µg/mL.',
  '',
  '### 8. NUMÉRO D’AUTORISATION',
  '',
  '[Non fourni, à compléter]',
].join('\n')

const EN = FR.replace(
  'RÉSUMÉ DES CARACTÉRISTIQUES DU PRODUIT',
  'SUMMARY OF PRODUCT CHARACTERISTICS',
)

const REPORT = [
  '# Revue réglementaire du RCP',
  '',
  '> Ce document constate ; il ne se complète pas.',
  '',
  '## Constats',
  '',
  '| Rubrique | Criticité | Constat |',
  '|---|---|---|',
  '| 4.8 | 🔴 | Mention de vigilance absente |',
  '| 9 | 🟠 | Une seule ligne |',
].join('\n')

const sources = {
  fr: FR,
  en: EN,
  report: REPORT,
  slug: 'KV-Kacin',
  reportHeader: 'KV-KACIN 500 — Regulatory Review',
  reportLang: 'en',
} as const

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // « PK\x03\x04 »
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // « %PDF »

describe('renderDeliverables', () => {
  it('rend les CINQ fichiers du livrable, deux documents et une revue', async () => {
    const { files } = await renderDeliverables(upgradeJobs(sources), { created: new Date(0) })

    expect(files).toHaveLength(DELIVERABLE_FILE_COUNT)
    expect(files.map((f) => f.fileName)).toEqual([
      'KV-Kacin-RCP-FR.docx',
      'KV-Kacin-RCP-FR.pdf',
      'KV-Kacin-SmPC-EN.docx',
      'KV-Kacin-SmPC-EN.pdf',
      // La revue est en PDF SEUL : elle constate, elle ne se complète pas.
      'KV-Kacin-SmPC-regulatory-review.pdf',
    ])
    for (const f of files) {
      const magic = f.kind === 'docx' ? ZIP_MAGIC : PDF_MAGIC
      expect([...f.bytes.slice(0, 4)], f.fileName).toEqual(magic)
      expect(f.bytes.byteLength, f.fileName).toBeGreaterThan(1000)
    }
  })

  it('trace « ≥ » et « µ » au lieu de lever — les polices standard ne codent que le WinAnsi', async () => {
    // Piège déjà payé : un `drawText` avec une seule police LÈVE sur ces signes. Ils doivent passer
    // par les polices de secours Symbol / ZapfDingbats, et ne PAS être comptés comme retirés.
    const { dropped } = await renderDeliverables(upgradeJobs(sources), { created: new Date(0) })
    expect(dropped).not.toContain('≥')
    expect(dropped).not.toContain('µ')
  })

  it('rend des PDF identiques à l’OCTET pour une même entrée et une même date', async () => {
    // Critère de recette U5 : les fichiers fabriqués par le navigateur doivent être ceux que le
    // banc d'essai a produits sous Node. Pour les PDF, la comparaison est exacte.
    const created = new Date('2026-08-03T10:00:00Z')
    const a = await renderDeliverables(upgradeJobs(sources), { created })
    const b = await renderDeliverables(upgradeJobs(sources), { created })
    const pdfs = a.files.filter((f) => f.kind === 'pdf')
    expect(pdfs).toHaveLength(3)
    for (const f of pdfs) {
      const other = b.files.find((g) => g.fileName === f.fileName)!
      expect(Buffer.from(other.bytes).equals(Buffer.from(f.bytes)), f.fileName).toBe(true)
    }
  })

  it('rend des DOCX identiques entrée par entrée, sauf l’horodatage Word', async () => {
    // `docx` stampe `docProps/core.xml` à l'empaquetage et n'offre AUCUN moyen de l'injecter. Le
    // reste du paquet — `word/document.xml` compris — est reproductible. La recette U5 compare
    // donc les DOCX entrée par entrée, cette seule exception exclue et NOMMÉE : sans ce test, la
    // prochaine source de dérive passerait pour « le même horodatage » et ne serait pas vue.
    const created = new Date('2026-08-03T10:00:00Z')
    const a = await renderDeliverables(upgradeJobs(sources), { created })
    const b = await renderDeliverables(upgradeJobs(sources), { created })

    for (const f of a.files.filter((x) => x.kind === 'docx')) {
      const other = b.files.find((g) => g.fileName === f.fileName)!
      const za = docxEntries(f.bytes)
      const zb = docxEntries(other.bytes)
      expect([...za.keys()].sort()).toEqual([...zb.keys()].sort())
      // Le paquet porte bien un contenu : sans ce garde-fou, un lecteur ZIP défaillant rendrait
      // deux tableaux vides et le test passerait en n'ayant rien comparé.
      expect(za.get('word/document.xml')?.length ?? 0).toBeGreaterThan(1000)

      const differing = [...za.keys()].filter((n) => za.get(n) !== zb.get(n))
      expect(differing, f.fileName).toEqual([DOCX_NONDETERMINISTIC_ENTRY])
    }
  })

  it("n'inscrit aucune marque de fournisseur dans les propriétés Word", async () => {
    // `Un-named` est le défaut de `docx` — négligé sur une pièce d'AMM. Et « Pharnos » y serait
    // une marque de fournisseur, interdite sur le document déposé (étape 3 §3).
    const { files } = await renderDeliverables(upgradeJobs(sources), { created: new Date(0) })
    const docx = files.find((f) => f.fileName === 'KV-Kacin-RCP-FR.docx')!
    const core = docxEntries(docx.bytes).get('docProps/core.xml') ?? ''

    expect(core).toContain('<dc:creator>KV-KACIN 500</dc:creator>')
    expect(core).not.toContain('Un-named')
    expect(core).not.toMatch(/Pharnos|Regafy/i)
  })

  it("n'appose la signature Pharnos QUE sur la revue", async () => {
    // Le RCP et le SmPC partent à l'agence : aucune marque de fournisseur (étape 3 §3).
    const { files } = await renderDeliverables(upgradeJobs(sources), { created: new Date(0) })
    const text = (name: string) => pdfText(files.find((f) => f.fileName === name)!.bytes)

    expect(text('KV-Kacin-SmPC-regulatory-review.pdf')).toContain('pharnos.com')
    expect(text('KV-Kacin-RCP-FR.pdf')).not.toContain('pharnos.com')
    expect(text('KV-Kacin-SmPC-EN.pdf')).not.toContain('pharnos.com')
  })

  it('nomme la revue dans la langue du document, et assainit le nom de fichier', async () => {
    // Décision verrouillée : le rapport est dans la langue du document téléversé (étape 1 §7). Le
    // NOM du fichier doit suivre, sinon le francophone reçoit un `…-SmPC-regulatory-review.pdf`.
    const fr = await renderDeliverables(upgradeJobs({ ...sources, reportLang: 'fr' }))
    expect(fr.files.map((f) => f.fileName)).toContain('KV-Kacin-revue-reglementaire-RCP.pdf')

    // Le `slug` vient de la commande, donc à terme du client : aucun séparateur de chemin ne doit
    // survivre jusqu'au nom de fichier écrit sur disque ou proposé au téléchargement.
    const hostile = await renderDeliverables(
      upgradeJobs({ ...sources, slug: '../../etc/passwd', reportLang: 'en' }),
    )
    for (const f of hostile.files) {
      expect(f.fileName, f.fileName).not.toMatch(/[/\\]/)
    }
  })

  it('garde les nombres solidaires dans le PDF, avec les DEUX espaces insécables', async () => {
    // Régression réelle : `layout` coupait sur `/\s+/`, qui inclut les insécables, puis recollait
    // avec une espace ordinaire ; et U+202F, hors WinAnsi, était purement SUPPRIMÉE. Le PDF portait
    // « 250000 UI » là où le DOCX portait « 250 000 UI » — un DOSAGE FAUX dans une pièce déposée,
    // que rien ne signalait puisque le nombre restait plausible.
    const nbsp = String.fromCharCode(0x00a0)
    const nnbsp = String.fromCharCode(0x202f)
    const md = `## T\n\n### 1. D\n\nDose de 500${nbsp}000 UI, puis 250${nnbsp}000 UI.`
    const { files, dropped } = await renderDeliverables(
      [{ name: 'X', markdown: md, profile: 'document', docx: true }],
      { created: new Date(0) },
    )

    // Aucun caractère perdu : la fine est dégradée vers l'insécable ordinaire, pas jetée.
    expect(dropped).toEqual([])
    const t = pdfText(files.find((f) => f.kind === 'pdf')!.bytes)
    expect(t).toContain(`500${nbsp}000 UI`)
    expect(t).toContain(`250${nbsp}000 UI`)
    expect(t).not.toContain('250000')
    expect(t).not.toContain('500000')
  })

  it('trace les chaînes entières, pour que les extracteurs ne recollent pas les mots', async () => {
    // « QUALITATIVEET » : positionner chaque mot produit un PDF dont le texte extrait est illisible.
    // Sur une pièce réglementaire, l'extractibilité fait partie de la conformité.
    const { files } = await renderDeliverables(upgradeJobs(sources), { created: new Date(0) })
    const fr = files.find((f) => f.fileName === 'KV-Kacin-RCP-FR.pdf')!
    // Le titre doit apparaître comme UNE chaîne tracée, espaces compris — pas mot par mot.
    expect(pdfText(fr.bytes)).toContain('COMPOSITION QUALITATIVE ET QUANTITATIVE')
  })
})
