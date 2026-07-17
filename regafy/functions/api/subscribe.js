/* POST /api/subscribe — leads Regafy → Resend (contact + corrigé quiz + double opt-in Regafy Pulse).
   JS volontairement (pas de build/typescript sur ce projet statique) ; contrat d'entrée strict.
   Bilingue : `lang` ('en' par défaut, 'fr' si navigateur francophone) pilote les deux e-mails.
   Env requis : RESEND_API_KEY, CONFIRM_SECRET. Optionnel : FROM_ADDR, SITE_URL.
   Compte Resend Regafy = nouvelle API Contacts « flat » (POST /contacts), PAS d'audienceId.
   Le contact est créé `unsubscribed: true` tant que le double opt-in n'est pas confirmé (/api/confirm). */

import { CORRIGE } from './corrige.js';

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,24}$/;
const SOURCES = new Set(['quiz', 'home', 'outils']);
const RESEND = 'https://api.resend.com';

const MAIL = {
  fr: {
    corrigeSubject: (s) => `Votre corrigé détaillé — Le Test RA UEMOA${s === null ? '' : ` (${s}/10)`}`,
    corrigeTitle: (s) => `Votre corrigé détaillé${s === null ? '' : ` — ${s}/10`}`,
    corrigeIntro: 'Le Test RA UEMOA : les 10 réponses, chacune avec son explication et sa référence.',
    corrigeOutro:
      'Ces questions viennent du référentiel réglementaire vivant de <a href="https://pharnos.com" style="color:#1a56db;">Pharnos</a> — l\'outil avec lequel les équipes RA pilotent leurs dossiers dans l\'espace UEMOA.',
    corrigeFooter: 'Contenu informatif — ne remplace pas les textes officiels.',
    question: 'Question',
    confirmSubject: 'Un clic pour confirmer — Regafy Pulse',
    confirmTitle: 'Un dernier clic',
    confirmBody:
      'Confirmez votre abonnement à <strong>Regafy Pulse</strong> — la liste privée des experts RA UEMOA/CEDEAO : textes officiels, notes de service, masterclass, actus du secteur. Désinscription en un clic.',
    confirmBtn: 'Je confirme mon abonnement',
    confirmIgnore: "Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail, vous ne serez pas abonné·e.",
    privacy: 'Politique de confidentialité',
  },
  en: {
    corrigeSubject: (s) => `Your detailed answer key — The UEMOA RA Test${s === null ? '' : ` (${s}/10)`}`,
    corrigeTitle: (s) => `Your detailed answer key${s === null ? '' : ` — ${s}/10`}`,
    corrigeIntro: 'The UEMOA RA Test: all 10 answers, each with its explanation and reference.',
    corrigeOutro:
      'These questions come from the living regulatory repository of <a href="https://pharnos.com" style="color:#1a56db;">Pharnos</a> — the tool RA teams use to run their dossiers across the WAEMU area.',
    corrigeFooter: 'Informational content — does not replace official texts.',
    question: 'Question',
    confirmSubject: 'One click to confirm — Regafy Pulse',
    confirmTitle: 'One last click',
    confirmBody:
      'Confirm your subscription to <strong>Regafy Pulse</strong> — the private list for RA professionals across WAEMU/ECOWAS: official texts, agency memos, masterclasses, industry news. One-click unsubscribe.',
    confirmBtn: 'Confirm my subscription',
    confirmIgnore: "Didn't request this? Just ignore this email — you won't be subscribed.",
    privacy: 'Privacy policy',
  },
};

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY || !env.CONFIRM_SECRET) {
    return json(503, { error: 'service_not_configured' });
  }
  if (Number(request.headers.get('content-length') || 0) > 2048) {
    return json(413, { error: 'too_large' });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_json' });
  }
  // Leurre anti-bot : on répond comme si tout allait bien, sans rien faire.
  if (typeof body.website === 'string' && body.website !== '') {
    return json(200, { ok: true });
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json(400, { error: 'invalid_email' });
  const source = SOURCES.has(body.source) ? body.source : 'home';
  const newsletter = body.newsletter === true;
  const lang = body.lang === 'fr' ? 'fr' : 'en';
  const t = MAIL[lang];
  const score =
    Number.isInteger(body.score) && body.score >= 0 && body.score <= 10 ? body.score : null;

  const from = env.FROM_ADDR || 'Regafy Pulse <pulse@regafy.com>';
  const site = env.SITE_URL || new URL(request.url).origin;

  try {
    // Contact (idempotent : « déjà existant » = succès). unsubscribed tant que non confirmé.
    const c = await resend(env, 'POST', '/contacts', {
      email,
      unsubscribed: true,
    });
    if (!c.ok && c.status !== 409) throw new Error(`contact ${c.status}`);

    if (source === 'quiz') {
      const sent = await resend(env, 'POST', '/emails', {
        from,
        to: [email],
        subject: t.corrigeSubject(score),
        html: corrigeHtml(lang, score, site),
      });
      if (!sent.ok) throw new Error(`corrige ${sent.status}`);
    }

    if (newsletter) {
      const token = await hmacHex(env.CONFIRM_SECRET, email);
      const link = `${site}/api/confirm?e=${b64url(email)}&t=${token}`;
      const sent = await resend(env, 'POST', '/emails', {
        from,
        to: [email],
        subject: t.confirmSubject,
        html: confirmHtml(lang, link, site),
      });
      if (!sent.ok) throw new Error(`confirm ${sent.status}`);
    }

    return json(200, { ok: true });
  } catch (err) {
    // Pas de détail amont côté client ; le détail va dans les logs Pages.
    console.error('subscribe failed:', err instanceof Error ? err.message : err);
    return json(502, { error: 'upstream' });
  }
}

function resend(env, method, path, payload) {
  return fetch(`${RESEND}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(s) {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shell(inner, site, footerText, privacyLabel) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f9fafb;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;" cellpadding="0" cellspacing="0">
    <tr><td style="background:#0a1628;border-radius:14px 14px 0 0;padding:18px 28px;">
      <span style="font-size:18px;font-weight:800;color:#ffffff;">Regafy<span style="color:#e3b341;">.</span></span>
    </td></tr>
    <tr><td style="padding:28px;">${inner}</td></tr>
    <tr><td style="padding:0 28px 24px;"><p style="margin:0;font-size:12px;color:#9ca3af;">${footerText} <a href="${site}/confidentialite" style="color:#9ca3af;">${privacyLabel}</a></p></td></tr>
  </table></td></tr></table></body></html>`;
}

function corrigeHtml(lang, score, site) {
  const t = MAIL[lang];
  const items = CORRIGE[lang]
    .map(
      (q, i) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">${t.question} ${i + 1} · ${esc(q.domain)}</p>
      <p style="margin:0 0 6px;font-weight:600;color:#0c1b33;">${esc(q.text)}</p>
      <p style="margin:0 0 6px;color:#047857;font-weight:600;">✓ ${esc(q.answer)}</p>
      <p style="margin:0 0 6px;color:#374151;">${esc(q.explain)}</p>
      <p style="margin:0;font-style:italic;color:#6b7280;font-size:13px;">— ${esc(q.source)}</p>
    </td></tr>`
    )
    .join('');
  const inner = `
      <h1 style="margin:0 0 6px;font-size:21px;color:#0c1b33;">${t.corrigeTitle(score)}</h1>
      <p style="margin:0 0 10px;color:#4b5563;">${t.corrigeIntro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
      <p style="margin:22px 0 0;color:#4b5563;">${t.corrigeOutro}</p>`;
  return shell(inner, site, t.corrigeFooter, t.privacy);
}

function confirmHtml(lang, link, site) {
  const t = MAIL[lang];
  const inner = `
      <h1 style="margin:0 0 6px;font-size:21px;color:#0c1b33;">${t.confirmTitle}</h1>
      <p style="margin:0 0 18px;color:#4b5563;">${t.confirmBody}</p>
      <p style="margin:0 0 18px;"><a href="${link}" style="display:inline-block;background:#1a56db;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:10px;">${t.confirmBtn}</a></p>
      <p style="margin:0;font-size:13px;color:#6b7280;">${t.confirmIgnore}</p>`;
  return shell(inner, site, '', t.privacy);
}
