import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import type { CorrespondenceMessageRecord, CorrespondenceRecord } from '@/lib/db'
import type { Lang } from '@/lib/i18n-context'

import { decisionLabel, statusLabel } from './correspondence-constants'

/**
 * Export PDF du fil de correspondance (Correspondance v3, LOT 10 — backlog RIM #6) : dossier
 * d'AUDIT imprimable de l'échange labo ⇄ correspondant (envois, décisions, messages, pièces).
 *
 * Le document est un HTML AUTONOME écrit dans une fenêtre dédiée puis imprimé (Destination
 * « Enregistrer en PDF ») — AUCUNE dépendance PDF, zéro contact avec la zone A4 protégée du
 * compilateur de dossier. Générateur PUR et testé : tout contenu utilisateur est échappé
 * (les messages sont de la saisie hostile par défaut).
 */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const formatSize = (bytes: number, lang: Lang): string => {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  const mb = lang === 'en' ? 'MB' : 'Mo'
  const kb = lang === 'en' ? 'KB' : 'Ko'
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} ${mb}` : `${Math.ceil(b / 1024)} ${kb}`
}

const dtLocale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'fr')
const fmtDateTime = (iso: string, lang: Lang): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(dtLocale(lang), { dateStyle: 'long', timeStyle: 'short' }).format(d)
}

const L = (lang: Lang, fr: string, en: string): string => (lang === 'en' ? en : fr)

export interface ThreadExportInput {
  correspondence: CorrespondenceRecord
  /** Messages de CETTE correspondance, ordre chronologique (l'appelant les a déjà triés). */
  messages: CorrespondenceMessageRecord[]
  lang: Lang
  /** Utilisateur qui exporte — figé dans le pied de page (traçabilité ALCOA). */
  exportedBy: string
  /** Horloge injectable (déterminisme des tests). */
  now?: Date
}

/** Document HTML autonome (imprimable A4) du fil — PUR : aucune E/S, tout est échappé. */
export function buildThreadExportHtml(input: ThreadExportInput): string {
  const { correspondence: c, messages, lang } = input
  const now = input.now ?? new Date()

  const title = `${L(lang, 'Correspondance', 'Correspondence')} — ${c.productName}`
  const decided = c.decidedAt
    ? `${statusLabel(c.status, lang)} · ${fmtDateTime(c.decidedAt, lang)}`
    : statusLabel(c.status, lang)

  const rows = messages
    .map((m) => {
      const who =
        m.author === 'sender'
          ? L(lang, 'Labo / Titulaire', 'Lab / Holder')
          : L(lang, 'Correspondant', 'Correspondent')
      const badge =
        m.kind === 'decision' && m.decision
          ? `<span class="decision d-${escapeHtml(m.decision)}">${escapeHtml(
              decisionLabel(m.decision, lang),
            )}</span>`
          : ''
      const attachments =
        m.attachments.length > 0
          ? `<ul class="atts">${m.attachments
              .map(
                (a) =>
                  `<li>📎 ${escapeHtml(a.name)} <span class="muted">(${formatSize(a.size, lang)})</span></li>`,
              )
              .join('')}</ul>`
          : ''
      const body = m.body ? `<div class="body">${escapeHtml(m.body)}</div>` : ''
      return `<article class="msg ${m.author === 'sender' ? 'from-sender' : 'from-recipient'}">
  <header><strong>${escapeHtml(who)}</strong> <span class="muted">· ${escapeHtml(
    m.authorLabel,
  )} · ${escapeHtml(fmtDateTime(m.createdAt, lang))}</span> ${badge}</header>
  ${body}${attachments}
</article>`
    })
    .join('\n')

  // Squelette autonome : styles imprimables inline, impression auto à l'ouverture.
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.5 system-ui, "Segoe UI", Arial, sans-serif; color: #111827; margin: 0; padding: 32px; max-width: 760px; margin-inline: auto; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .muted { color: #6b7280; }
  .head { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 16px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; margin: 10px 0 0; font-size: 12.5px; }
  dt { color: #6b7280; } dd { margin: 0; }
  .msg { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin: 10px 0; page-break-inside: avoid; }
  .msg.from-sender { background: #f8fafc; }
  .msg header { font-size: 12px; margin-bottom: 4px; }
  .body { white-space: pre-wrap; word-break: break-word; }
  .atts { margin: 6px 0 0; padding: 0; list-style: none; font-size: 12px; }
  .decision { border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
  .d-accepted { background: #dcfce7; color: #166534; }
  .d-suspended { background: #fef3c7; color: #92400e; }
  .d-rejected { background: #fee2e2; color: #991b1b; }
  footer { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 11px; color: #6b7280; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="head">
  <h1>${escapeHtml(title)}</h1>
  <div class="muted">${L(lang, 'Fil de correspondance — export d’audit', 'Correspondence thread — audit export')}</div>
  <dl>
    <dt>${L(lang, 'Pays cible', 'Target country')}</dt><dd>${escapeHtml(countryLabel(c.country, lang))}</dd>
    <dt>${L(lang, 'Activité', 'Activity')}</dt><dd>${escapeHtml(activityLabel(c.activity, lang))}</dd>
    <dt>${L(lang, 'Expéditeur', 'Sender')}</dt><dd>${escapeHtml(c.senderEmail)}</dd>
    <dt>${L(lang, 'Correspondant', 'Correspondent')}</dt><dd>${escapeHtml(c.recipientEmail)}</dd>
    <dt>${L(lang, 'Envoyé le', 'Sent on')}</dt><dd>${escapeHtml(fmtDateTime(c.createdAt, lang))}</dd>
    <dt>${L(lang, 'Statut', 'Status')}</dt><dd>${escapeHtml(decided)}</dd>
  </dl>
</div>
${rows || `<p class="muted">${L(lang, 'Aucun message.', 'No messages.')}</p>`}
<footer>
  ${L(lang, 'Exporté par', 'Exported by')} ${escapeHtml(input.exportedBy)} · ${escapeHtml(
    fmtDateTime(now.toISOString(), lang),
  )} · ${messages.length} ${L(lang, 'message(s)', 'message(s)')} · Pharnos
</footer>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 150) })</script>
</body>
</html>`
}

/**
 * Ouvre l'export dans une fenêtre dédiée et lance l'impression (→ « Enregistrer en PDF »).
 * DOIT être appelé de façon SYNCHRONE dans le handler de clic (bloqueurs de pop-up — leçon M3 :
 * jamais de window.open après un await). Renvoie `false` si la fenêtre a été bloquée.
 */
export function openThreadExport(input: ThreadExportInput): boolean {
  const win = window.open('', '_blank')
  if (!win) return false
  win.opener = null // isolation : la fenêtre d'export ne doit pas pouvoir naviguer l'app
  win.document.write(buildThreadExportHtml(input))
  win.document.close()
  return true
}
