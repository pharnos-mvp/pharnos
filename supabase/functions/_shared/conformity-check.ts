// Vérification de conformité d'un document au template en vigueur (U3, Regafy Upgrade).
// Cœur commun aux deux entrées : pièce uploadée (multimodal, PDF/image) et texte (traductions,
// lettres). Posture anti-faux-positifs : un constat de conformité erroné = bruit qui décrédibilise
// Regafy — en cas de doute, le document est réputé conforme (CERTAINTY-only, plafond strict).

import { specForDocType, specPromptText, type ConformitySpec } from './conformity-specs.ts'
import { logJson } from './log.ts'
import { generateParts, type Part } from './vertex.ts'

export interface ConformityResult {
  conforme: boolean
  /** Rubriques manquantes/non conformes : « <id>. <titre> — <raison courte> ». */
  manquantes: string[]
}

const MAX_FINDINGS = 12

function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        return null
      }
    }
    return null
  }
}

const SYSTEM =
  'Tu es un expert en affaires réglementaires pharmaceutiques (UEMOA/CEDEAO). Tu vérifies la ' +
  'conformité STRUCTURELLE d’un document au template officiel en vigueur : présence des rubriques ' +
  'obligatoires, titres, mentions imposées, ordre. Tu ne juges PAS le fond médical. Réponds en ' +
  'JSON STRICT, en français.'

function conformityPrompt(spec: ConformitySpec, country?: string): string {
  return (
    `Vérifie si CE document (${spec.label}) respecte le template officiel en vigueur :\n\n` +
    `${specPromptText(spec, country)}\n\n` +
    'Réponds STRICTEMENT : {"conforme":true|false,"manquantes":["<id>. <titre> — <raison courte>", …]}.\n' +
    'RÈGLES ANTI-FAUX-POSITIFS :\n' +
    '- Signale une rubrique UNIQUEMENT si tu es CERTAIN qu’elle est absente ou non conforme.\n' +
    '- Une rubrique présente sous un titre équivalent ou une numérotation proche est CONFORME.\n' +
    '- Les rubriques [optionnelle] absentes ne sont JAMAIS signalées.\n' +
    `- Maximum ${MAX_FINDINGS} entrées, les plus importantes d’abord.\n` +
    '- En cas de doute, considère la rubrique conforme. Document globalement conforme → {"conforme":true,"manquantes":[]}.'
  )
}

/** Vérifie la conformité ; renvoie null si l'analyse échoue (constat honnête côté appelant). */
export async function checkConformityParts(
  contentParts: Part[],
  docType: string,
  country: string | undefined,
  log: Record<string, unknown>,
): Promise<ConformityResult | null> {
  const spec = specForDocType(docType)
  if (!spec) return null
  try {
    const raw = await generateParts(
      [{ text: conformityPrompt(spec, country) }, ...contentParts],
      { system: SYSTEM, json: true, maxOutputTokens: 1024, temperature: 0, timeoutMs: 60_000 },
    )
    const parsed = extractJson(raw) as { conforme?: boolean; manquantes?: unknown[] } | null
    if (!parsed || typeof parsed !== 'object') return null
    const manquantes = (Array.isArray(parsed.manquantes) ? parsed.manquantes : [])
      .map((m) => String(m).slice(0, 200))
      .filter((m) => m.trim())
      .slice(0, MAX_FINDINGS)
    return { conforme: parsed.conforme !== false && manquantes.length === 0, manquantes }
  } catch (e) {
    logJson({
      ...log,
      op: 'conformity',
      docType,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return null
  }
}

/** Variante fichier (PDF/image en base64). */
export function checkConformityFile(
  mime: string,
  b64: string,
  docType: string,
  country: string | undefined,
  log: Record<string, unknown>,
): Promise<ConformityResult | null> {
  return checkConformityParts([{ inlineData: { mimeType: mime, data: b64 } }], docType, country, log)
}

/** Variante texte (traductions, documents générés). */
export function checkConformityText(
  text: string,
  docType: string,
  country: string | undefined,
  log: Record<string, unknown>,
): Promise<ConformityResult | null> {
  return checkConformityParts(
    [{ text: `DOCUMENT À VÉRIFIER :\n${text}` }],
    docType,
    country,
    log,
  )
}

/** Message du constat (panneau Remarques) — sobre, actionnable, plafonné. */
export function conformityMessage(docType: string, manquantes: string[]): string {
  const spec = specForDocType(docType)
  const label = spec ? spec.label : docType.toUpperCase()
  const shown = manquantes.slice(0, 3).join(' ; ')
  const more = manquantes.length > 3 ? ` (+${manquantes.length - 3} autres)` : ''
  return (
    `${label} : non conforme au template en vigueur — ` +
    `${manquantes.length} rubrique(s) à corriger : ${shown}${more}.`
  )
}
