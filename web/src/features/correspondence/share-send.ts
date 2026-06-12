import type { CorrespondenceRecord, DossierRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import {
  createCorrespondence,
  getShareLink,
  updateCorrespondencePdf,
  type CreateCorrespondenceInput,
} from './correspondence-repository'
import { syncCorrespondences } from './correspondence-sync'
import { generateShareToken, hashSharePassword, sha256Hex, shareUrl } from './share-crypto'

/**
 * Envoi du Module 1 compilé (jalon H) — orchestration côté expéditeur :
 * token 256 bits → SHA-256 en DB ; PDF téléversé dans le bucket privé `documents`
 * (`{orgId}/shares/{id}/module1.pdf` à l'envoi initial, `…/v{ts}.pdf` aux mises à jour —
 * write-once dans les deux cas) ; correspondance + note + lien local. Online-only par
 * nature (l'upload l'exige) — l'UI l'explique hors-ligne.
 */

const BUCKET = 'documents'

export interface SendDossierInput {
  orgId: string
  dossier: DossierRecord
  pdfBlob: Blob
  senderEmail: string
  recipientEmail: string
  note: string
  /** Mot de passe optionnel — hashé PBKDF2 ici, JAMAIS transmis ni stocké en clair. */
  password: string | null
  /** Expiration du lien (L1) — null = sans expiration. */
  expiresAt?: string | null
  /** L1 : révocation automatique du lien dès la décision rendue. */
  autoRevokeOnDecision?: boolean
}

export interface SendDossierResult {
  correspondence: CorrespondenceRecord
  /** Lien public `/r/{token}` — affiché et copiable côté expéditeur uniquement. */
  url: string
}

export async function sendCompiledDossier(input: SendDossierInput): Promise<SendDossierResult> {
  if (!navigator.onLine) throw new Error('Connexion requise pour envoyer le dossier.')
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Backend non configuré — envoi indisponible.')

  const token = generateShareToken()
  const [tokenHash, passwordHash] = await Promise.all([
    sha256Hex(token),
    input.password ? hashSharePassword(input.password) : Promise.resolve(null),
  ])

  const correspondenceId = crypto.randomUUID()
  const pdfPath = `${input.orgId}/shares/${correspondenceId}/module1.pdf`
  // WRITE-ONCE (ALCOA) : l'artefact sous review n'est jamais réécrit — un retry d'envoi génère
  // un nouvel id donc un nouveau chemin ; l'objet d'un lien déjà émis reste immuable.
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(pdfPath, input.pdfBlob, {
    upsert: false,
    contentType: 'application/pdf',
  })
  if (upErr) throw new Error(`Téléversement du PDF impossible : ${upErr.message}`)

  const url = shareUrl(window.location.origin, token)
  const payload: CreateCorrespondenceInput = {
    id: correspondenceId,
    dossierId: input.dossier.id,
    productName: input.dossier.productName,
    country: input.dossier.country,
    activity: input.dossier.activity,
    senderEmail: input.senderEmail,
    recipientEmail: input.recipientEmail.trim().toLowerCase(),
    note: input.note.trim() || null,
    pdfPath,
    pdfSize: input.pdfBlob.size,
    tokenHash,
    passwordHash,
    expiresAt: input.expiresAt ?? null,
    autoRevokeOnDecision: input.autoRevokeOnDecision ?? false,
    shareUrl: url,
  }
  const correspondence = await createCorrespondence(input.orgId, payload)
  // Pousse immédiatement (best-effort) : le reviewer doit voir la correspondance côté serveur.
  void syncCorrespondences(input.orgId)
  return { correspondence, url }
}

/**
 * Remplace le PDF d'un envoi EXISTANT (dossier recompilé) — le correspondant garde le même
 * lien et le fil complet ; il est prévenu par e-mail (best-effort). Upload write-once vers un
 * nouveau chemin versionné : l'artefact d'une version déjà reviewée n'est jamais réécrit.
 */
export async function resendCompiledDossier(input: {
  orgId: string
  correspondence: CorrespondenceRecord
  pdfBlob: Blob
  senderEmail: string
}): Promise<void> {
  if (!navigator.onLine) throw new Error('Connexion requise pour envoyer le dossier.')
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Backend non configuré — envoi indisponible.')

  const pdfPath = `${input.orgId}/shares/${input.correspondence.id}/v${Date.now()}.pdf`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(pdfPath, input.pdfBlob, {
    upsert: false,
    contentType: 'application/pdf',
  })
  if (upErr) throw new Error(`Téléversement du PDF impossible : ${upErr.message}`)

  await updateCorrespondencePdf(
    input.correspondence,
    input.senderEmail,
    pdfPath,
    input.pdfBlob.size,
  )
  void syncCorrespondences(input.orgId)
  // E-mail best-effort : le reviewer retrouve le MÊME lien (token inchangé, conservé en local).
  const link = await getShareLink(input.correspondence.id)
  if (link) void notifyRecipient(input.correspondence.id, link.url)
}

/** Mot de passe proposé : 14 caractères sans ambiguïté (a-z, 2-9 sans l/o/0/1), ~70 bits. */
export function suggestSharePassword(): string {
  // 32 caractères : 256 % 32 === 0 → le modulo est UNIFORME (pas de biais). Si l'alphabet
  // change un jour pour une taille non puissance de 2, passer en rejection sampling.
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

/**
 * Notification e-mail du correspondant (action `notify`, authentifiée) — BEST-EFFORT : le lien
 * copiable reste le chemin nominal ; un échec d'e-mail n'invalide jamais l'envoi.
 * Le mot de passe ne transite jamais par e-mail (canal séparé).
 */
export async function notifyRecipient(correspondenceId: string, url: string): Promise<boolean> {
  try {
    const supabase = await getSupabase()
    if (!supabase || !navigator.onLine) return false
    const { error } = await supabase.functions.invoke('share', {
      body: { action: 'notify', correspondenceId, url },
    })
    return !error
  } catch {
    return false
  }
}
