/* GET /api/stats — preuve sociale de l'intro : nombre de joueurs (réels + amorçage).
   Mise en cache edge 60 s pour préserver la D1. */

import { SEED_GLOBAL } from './seed.js';

export async function onRequestGet({ env }) {
  let real = 0;
  try {
    if (env.DB) {
      const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first();
      real = (r && r.n) || 0;
    }
  } catch (err) {
    console.error('stats failed:', err instanceof Error ? err.message : err);
  }
  return new Response(JSON.stringify({ players: real + SEED_GLOBAL }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
