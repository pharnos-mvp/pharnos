/* POST /api/subscribe — leads Regafy → Resend (contact + corrigé quiz + double opt-in Regafy Pulse).
   JS volontairement (pas de build/typescript sur ce projet statique) ; contrat d'entrée strict.
   Bilingue : `lang` ('en' par défaut, 'fr' si navigateur francophone) pilote les deux e-mails.
   Corrigé PERSONNALISÉ : le front envoie les `ids` des 10 questions de SON tirage (banque
   functions/api/bank.js) ; ids invalides → jeu par défaut (les 10 questions historiques).
   Env requis : RESEND_API_KEY, CONFIRM_SECRET. Optionnel : FROM_ADDR, SITE_URL. */

import { BANK } from './bank.js';

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,24}$/;
const SOURCES = new Set(['quiz', 'home', 'outils']);
const RESEND = 'https://api.resend.com';
const DEFAULT_IDS = ['q01a', 'q02a', 'q03a', 'q04a', 'q05a', 'q06a', 'q07a', 'q08a', 'q09a', 'q10a'];
const BY_ID = new Map(BANK.map((q) => [q.id, q]));

const MAIL = {
  fr: {
    corrigeSubject: (s) => `Votre corrigé détaillé — Le Test RA UEMOA${s === null ? '' : ` (${s}/10)`}`,
    corrigeTitle: (s) => `Votre corrigé détaillé${s === null ? '' : ` — ${s}/10`}`,
    corrigeIntro: 'Le Test RA UEMOA : les 10 questions de votre tirage, chacune avec sa réponse, son explication et sa référence officielle.',
    greeting: (n) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    refsTitle: '\u{1F4DA} Les références citées dans votre corrigé',
    inlineConfirmTitle: '\u26A1 Activez Regafy Pulse — un clic et c\u2019est fait',
    inlineConfirmBody: 'Vous avez coché l\u2019abonnement : confirmez-le pour recevoir textes officiels, notes de service, masterclass et actus du secteur. Sans clic, aucun autre e-mail ne vous sera envoyé.',
    refsNote: 'Gardez ce corrigé sous la main : chaque réponse cite son texte — le réflexe qui fait la différence avant un dépôt.',
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
    corrigeIntro: 'The UEMOA RA Test: the 10 questions of your draw, each with its answer, explanation and official reference.',
    greeting: (n) => (n ? `Hi ${n},` : 'Hello,'),
    refsTitle: '\u{1F4DA} References cited in your answer key',
    inlineConfirmTitle: '\u26A1 Activate Regafy Pulse — one click and done',
    inlineConfirmBody: 'You ticked the subscription box: confirm it to receive official texts, agency memos, masterclasses and industry news. No click, no further emails.',
    refsNote: 'Keep this answer key at hand: every answer cites its source text — the reflex that makes the difference before a submission.',
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
  if (Number(request.headers.get('content-length') || 0) > 4096) {
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
  // Anti-bot Turnstile (siteverify serveur) — actif dès que TURNSTILE_SECRET est posé
  if (env.TURNSTILE_SECRET) {
    const token = typeof body.turnstile === 'string' ? body.turnstile : '';
    const human = await verifyTurnstile(env.TURNSTILE_SECRET, token, request.headers.get('CF-Connecting-IP'));
    if (!human) return json(403, { error: 'bot_check_failed' });
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json(400, { error: 'invalid_email' });
  const source = SOURCES.has(body.source) ? body.source : 'home';
  const newsletter = body.newsletter === true;
  const lang = body.lang === 'fr' ? 'fr' : 'en';
  const t = MAIL[lang];
  const score =
    Number.isInteger(body.score) && body.score >= 0 && body.score <= 10 ? body.score : null;
  // Prénom optionnel (affiché dans les e-mails + contact Resend)
  const firstName = String(body.name || '')
    .replace(/[<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 24);
  // Le tirage du joueur ; toute anomalie → jeu par défaut
  let ids = Array.isArray(body.ids) ? body.ids.filter((i) => typeof i === 'string' && BY_ID.has(i)).slice(0, 12) : [];
  if (ids.length === 0) ids = DEFAULT_IDS;

  const from = env.FROM_ADDR || 'Regafy Pulse <pulse@regafy.com>';
  const site = env.SITE_URL || new URL(request.url).origin;

  try {
    const contactPayload = { email, unsubscribed: true };
    if (firstName) contactPayload.firstName = firstName;
    const c = await resend(env, 'POST', '/contacts', contactPayload);
    if (!c.ok && c.status !== 409) throw new Error(`contact ${c.status}`);

    // Un seul e-mail : le corrigé embarque le bouton de double opt-in quand la case est cochée.
    // L'e-mail de confirmation isolé ne sert que pour un futur point d'entrée sans corrigé.
    let confirmLink = null;
    if (newsletter) {
      const token = await hmacHex(env.CONFIRM_SECRET, email);
      confirmLink = `${site}/api/confirm?e=${b64url(email)}&t=${token}`;
    }

    if (source === 'quiz') {
      const sent = await resend(env, 'POST', '/emails', {
        from,
        to: [email],
        subject: t.corrigeSubject(score),
        html: corrigeHtml(lang, score, site, ids, firstName, confirmLink),
      });
      if (!sent.ok) throw new Error(`corrige ${sent.status}`);
    } else if (newsletter) {
      const sent = await resend(env, 'POST', '/emails', {
        from,
        to: [email],
        subject: t.confirmSubject,
        html: confirmHtml(lang, confirmLink, site, firstName),
      });
      if (!sent.ok) throw new Error(`confirm ${sent.status}`);
    }

    return json(200, { ok: true });
  } catch (err) {
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

function corrigeHtml(lang, score, site, ids, firstName, confirmLink) {
  const t = MAIL[lang];
  const refs = [...new Set(ids.map((id) => BY_ID.get(id)[lang].source))];
  const refsHtml = refs
    .map((r) => `<li style="margin:0 0 5px;color:#374151;font-size:13.5px;">${esc(r)}</li>`)
    .join('');
  const items = ids
    .map((id, i) => {
      const item = BY_ID.get(id);
      const q = item[lang];
      const answerText = q.options[item.answer];
      return `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">${t.question} ${i + 1} · ${esc(q.domain)}</p>
      <p style="margin:0 0 6px;font-weight:600;color:#0c1b33;">${esc(q.text)}</p>
      <p style="margin:0 0 6px;color:#047857;font-weight:600;">✓ ${esc(answerText)}</p>
      <p style="margin:0 0 6px;color:#374151;">${esc(q.explain)}</p>
      <p style="margin:0;font-style:italic;color:#6b7280;font-size:13px;">— ${esc(q.source)}</p>
    </td></tr>`;
    })
    .join('');
  const inner = `
      <h1 style="margin:0 0 6px;font-size:21px;color:#0c1b33;">${t.corrigeTitle(score)}</h1>
      <p style="margin:0 0 4px;color:#0c1b33;font-weight:600;">${esc(t.greeting(firstName || ''))}</p>
      <p style="margin:0 0 10px;color:#4b5563;">${t.corrigeIntro}</p>
      ${confirmLink ? `
      <div style="margin:0 0 16px;padding:16px 18px;background:#f3efff;border:1.5px solid #8b5cf6;border-radius:12px;">
        <p style="margin:0 0 6px;font-weight:700;color:#0c1b33;">${t.inlineConfirmTitle}</p>
        <p style="margin:0 0 12px;font-size:13.5px;color:#4b5563;">${t.inlineConfirmBody}</p>
        <a href="${confirmLink}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;">${t.confirmBtn}</a>
      </div>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
      <div style="margin:22px 0 0;padding:16px 18px;background:#fdf3d7;border:1px solid #e3b341;border-radius:12px;">
        <p style="margin:0 0 8px;font-weight:700;color:#0c1b33;">${t.refsTitle}</p>
        <ul style="margin:0;padding-left:18px;">${refsHtml}</ul>
        <p style="margin:10px 0 0;font-size:13px;color:#6b7280;font-style:italic;">${t.refsNote}</p>
      </div>
      <p style="margin:18px 0 0;color:#4b5563;">${t.corrigeOutro}</p>`;
  return shell(inner, site, t.corrigeFooter, t.privacy);
}

function confirmHtml(lang, link, site, firstName) {
  const t = MAIL[lang];
  const inner = `
      <h1 style="margin:0 0 6px;font-size:21px;color:#0c1b33;">${t.confirmTitle}</h1>
      <p style="margin:0 0 4px;color:#0c1b33;font-weight:600;">${esc(t.greeting(firstName || ''))}</p>
      <p style="margin:0 0 18px;color:#4b5563;">${t.confirmBody}</p>
      <p style="margin:0 0 18px;"><a href="${link}" style="display:inline-block;background:#1a56db;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:10px;">${t.confirmBtn}</a></p>
      <p style="margin:0;font-size:13px;color:#6b7280;">${t.confirmIgnore}</p>`;
  return shell(inner, site, '', t.privacy);
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip) form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('turnstile failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
