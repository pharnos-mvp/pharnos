import { env } from '@/lib/env'

/**
 * Client de l'Edge Function `share` (page publique de review — jalon H).
 * Aucune session Supabase : le token (et le mot de passe éventuel) EST l'authentification.
 */

export interface ReviewCorrespondence {
  productName: string
  country: string
  activity: string
  senderEmail: string
  recipientEmail: string
  note: string | null
  status: 'in_review' | 'accepted' | 'suspended' | 'rejected'
  decidedAt: string | null
  createdAt: string
  /** Expiration du lien (L1) — null = sans expiration. */
  expiresAt: string | null
  pdfSize: number
  hasPassword: boolean
}

export interface ReviewAttachment {
  name: string
  size: number
  mime: string
  /** URL signée (1 h) — null si la pièce n'a pas pu être signée. */
  url: string | null
}

export interface ReviewMessage {
  id: string
  author: 'sender' | 'recipient'
  authorLabel: string
  kind: 'note' | 'decision' | 'comment'
  decision: 'accepted' | 'suspended' | 'rejected' | null
  body: string
  createdAt: string
  attachments: ReviewAttachment[]
}

export interface OpenPayload {
  correspondence: ReviewCorrespondence
  pdfUrl: string
  messages: ReviewMessage[]
  /** Réponse à `decide` : vrai si le lien vient d'être auto-révoqué (écran terminal véridique). */
  linkRevoked?: boolean
}

export type ShareErrorCode =
  | 'invalid'
  | 'revoked'
  | 'expired'
  | 'password_required'
  | 'wrong_password'
  | 'rate_limited'
  | 'attachment_invalid'
  | 'bad_request'
  | 'offline'
  | 'server_error'

export type ShareResult = { ok: true; data: OpenPayload } | { ok: false; error: ShareErrorCode }

export interface ReviewAttachmentInput {
  name: string
  mime: string
  dataBase64: string
}

interface ShareRequest {
  action: 'open' | 'decide' | 'reply'
  token: string
  password?: string
  decision?: string
  body?: string
  attachments?: ReviewAttachmentInput[]
  /** Poll de rafraîchissement (90 s) — l'Edge ne le journalise pas dans le journal d'accès. */
  silent?: boolean
}

export async function callShare(req: ShareRequest): Promise<ShareResult> {
  if (!env.isSupabaseConfigured) return { ok: false, error: 'server_error' }
  if (!navigator.onLine) return { ok: false, error: 'offline' }
  try {
    const res = await fetch(`${env.supabaseUrl}/functions/v1/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
    const data: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const code = (data as { error?: string } | null)?.error
      const known: ShareErrorCode[] = [
        'invalid',
        'revoked',
        'expired',
        'password_required',
        'wrong_password',
        'rate_limited',
        'attachment_invalid',
        'bad_request',
      ]
      return {
        ok: false,
        error: known.includes(code as ShareErrorCode) ? (code as ShareErrorCode) : 'server_error',
      }
    }
    return { ok: true, data: data as OpenPayload }
  } catch {
    return { ok: false, error: navigator.onLine ? 'server_error' : 'offline' }
  }
}

/** Messages d'erreur FR de la page publique. */
export const SHARE_ERROR_MESSAGES: Record<ShareErrorCode, string> = {
  invalid: 'Lien invalide — vérifiez l’adresse reçue ou contactez l’expéditeur.',
  revoked: 'Accès révoqué par l’expéditeur.',
  expired: 'Lien expiré — demandez un nouvel envoi à l’expéditeur.',
  password_required: 'Ce lien est protégé par un mot de passe.',
  wrong_password: 'Mot de passe incorrect.',
  rate_limited: 'Trop de tentatives — réessayez dans quelques minutes.',
  attachment_invalid:
    'Pièce jointe refusée (formats : PDF, PNG, JPG, WebP, DOCX — 4 Mo max par pièce, 3 pièces).',
  bad_request: 'Requête invalide.',
  offline: 'Connexion interrompue — vérifiez votre réseau puis réessayez.',
  server_error: 'Erreur du service — réessayez dans un instant.',
}

/** Lit un fichier en base64 (pièce jointe du reviewer). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'))
    reader.onload = () => {
      const url = String(reader.result ?? '')
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
