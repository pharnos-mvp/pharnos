/* GET /api/confirm?e=<b64url(email)>&t=<hmac> — double opt-in La Dépêche RA.
   Vérifie le jeton HMAC puis passe le contact Resend en `unsubscribed: false`
   (nouvelle API Contacts « flat », PATCH /contacts/{email} — pas d'audienceId).
   Env requis : RESEND_API_KEY, CONFIRM_SECRET. */

const RESEND = 'https://api.resend.com';

export async function onRequestGet({ request, env }) {
  if (!env.RESEND_API_KEY || !env.CONFIRM_SECRET) {
    return new Response('Service non configuré.', { status: 503 });
  }
  const url = new URL(request.url);
  const e = url.searchParams.get('e') || '';
  const t = url.searchParams.get('t') || '';
  let email;
  try {
    email = decodeURIComponent(escape(atob(e.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch {
    return new Response('Lien invalide.', { status: 400 });
  }
  const expected = await hmacHex(env.CONFIRM_SECRET, email);
  if (!timingSafeEqual(expected, t)) {
    return new Response('Lien invalide ou expiré.', { status: 400 });
  }
  try {
    const res = await fetch(
      `${RESEND}/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unsubscribed: false }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) throw new Error(`patch ${res.status}`);
  } catch (err) {
    console.error('confirm failed:', err instanceof Error ? err.message : err);
    return new Response('Une erreur est survenue — réessayez le lien dans un instant.', {
      status: 502,
    });
  }
  return Response.redirect(new URL('/merci', request.url).toString(), 302);
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

/* Comparaison en temps constant (les deux chaînes sont des hex de même longueur attendue). */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
