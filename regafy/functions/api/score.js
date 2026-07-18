/* POST /api/score — classement du Test RA UEMOA (D1, binding DB via wrangler.toml).
   Rang = score DESC puis time_ms ASC. Pays = request.cf.country (déterminé par Cloudflare,
   pas par le client). v1 assumée sans anti-triche forte : score/temps viennent du client,
   avec bornes de vraisemblance ; un durcissement (signature de session) viendra si abus. */

const EMAIL_LIKE = /@|https?:|www\./i;
const CONTROL_OR_TAG = new RegExp('[<>\\u0000-\\u001f]', 'g');

/* Amorcage social (demande CEO 2026-07-18) : 115 participants « de lancement »
   comptes dans les TOTAUX uniquement - jamais dans les rangs : tout joueur reel
   les devance tous. Aucune ligne en base, aucun nom : decalage d'affichage. */
const SEED_GLOBAL = 115;
const SEED_BY_COUNTRY = { CI: 24, SN: 21, BJ: 14, TG: 11, BF: 10, ML: 9, NE: 7, GW: 3, GN: 4, CM: 4, FR: 5, MA: 3 };

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json(503, { error: 'service_not_configured' });
  if (Number(request.headers.get('content-length') || 0) > 1024) {
    return json(413, { error: 'too_large' });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_json' });
  }
  if (typeof body.website === 'string' && body.website !== '') {
    return json(200, { ok: true, global: { rank: 0, total: 0 }, country: null });
  }
  // Nom : 2-24 caractères imprimables, sans balises, liens ni caractères de contrôle
  const name = String(body.name || '')
    .replace(CONTROL_OR_TAG, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24 || EMAIL_LIKE.test(name)) {
    return json(400, { error: 'invalid_name' });
  }
  const score = body.score;
  const timeMs = body.time_ms;
  if (!Number.isInteger(score) || score < 0 || score > 10) return json(400, { error: 'invalid_score' });
  if (!Number.isInteger(timeMs) || timeMs < 5000 || timeMs > 330000) return json(400, { error: 'invalid_time' });
  const lang = body.lang === 'fr' ? 'fr' : 'en';
  const country =
    request.cf && typeof request.cf.country === 'string' && /^[A-Z]{2}$/.test(request.cf.country)
      ? request.cf.country
      : 'XX';

  try {
    await env.DB.prepare(
      'INSERT INTO scores (name, country, score, time_ms, lang) VALUES (?1, ?2, ?3, ?4, ?5)'
    )
      .bind(name, country, score, timeMs, lang)
      .run();

    const [gRank, gTotal, cRank, cTotal] = await env.DB.batch([
      env.DB.prepare(
        'SELECT COUNT(*) AS n FROM scores WHERE score > ?1 OR (score = ?1 AND time_ms < ?2)'
      ).bind(score, timeMs),
      env.DB.prepare('SELECT COUNT(*) AS n FROM scores'),
      env.DB.prepare(
        'SELECT COUNT(*) AS n FROM scores WHERE country = ?3 AND (score > ?1 OR (score = ?1 AND time_ms < ?2))'
      ).bind(score, timeMs, country),
      env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE country = ?1').bind(country),
    ]);

    return json(200, {
      ok: true,
      global: { rank: gRank.results[0].n + 1, total: gTotal.results[0].n + SEED_GLOBAL },
      country:
        country === 'XX'
          ? null
          : { rank: cRank.results[0].n + 1, total: cTotal.results[0].n + (SEED_BY_COUNTRY[country] || 0), code: country },
    });
  } catch (err) {
    console.error('score failed:', err instanceof Error ? err.message : err);
    return json(502, { error: 'upstream' });
  }
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
