import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

// k6 — charge LÉGÈRE sur les chemins de REJET des Edge functions Pharnos (jalon N3, gate GO-LIVE).
//
// Objectif : prouver que les gardes tiennent sous charge + mesurer la p95, **sans jamais déclencher
// d'appel Gemini payant** (tout est rejeté AVANT Vertex) et **sans session valide** — on teste la
// surface d'abus ANONYME, le vrai vecteur DoS :
//   1. Edge gated-JWT (regafy-ai/translate/upgrade/admin/team) appelées avec une clé anon (JWT valide
//      mais SANS utilisateur) → la fonction rejette en 401/403 avant tout quota/Gemini.
//   2. Surface publique `share` : token bidon → 4xx ; sous rafale depuis 1 IP → rate-limit 429.
// Les paths 403 (feature) / 429 (quota) authentifiés sont prouvés par ailleurs (pgTAP + impersonation
// rolled-back en prod) — ils exigent une session, hors-scope d'un k6 anonyme.
//
// Usage : k6 run -e SUPA_URL=https://<ref>.supabase.co -e SUPA_ANON=<clé anon PUBLIQUE> load/k6-edge-gates.js

const BASE = `${__ENV.SUPA_URL}/functions/v1`
const ANON = __ENV.SUPA_ANON

const GATED = ['regafy-ai', 'translate', 'upgrade', 'admin', 'team']

const gateLeak = new Counter('gate_leak') // une réponse 2xx = la garde a LAISSÉ PASSER (critique)

export const options = {
  scenarios: {
    auth_reject: { executor: 'constant-vus', vus: 8, duration: '20s', exec: 'authReject' },
    share_public: {
      executor: 'constant-vus',
      vus: 8,
      duration: '20s',
      exec: 'sharePublic',
      startTime: '21s',
    },
  },
  thresholds: {
    gate_leak: ['count==0'], // AUCUNE garde ne doit laisser passer une requête non autorisée
    http_req_failed: ['rate<0.02'], // < 2 % de 5xx sous charge (les 4xx attendus ne comptent pas)
    'http_req_duration{scenario:auth_reject}': ['p(95)<2500'],
    'http_req_duration{scenario:share_public}': ['p(95)<2500'],
  },
}

// Les rejets 4xx sont ATTENDUS → seuls les 5xx comptent comme des échecs http.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }))

const authHeaders = {
  'Content-Type': 'application/json',
  apikey: ANON,
  Authorization: `Bearer ${ANON}`, // JWT anon valide mais sans utilisateur → la fonction rejette
}

function hex(n) {
  let s = ''
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)]
  return s
}

export function authReject() {
  const fn = GATED[Math.floor(Math.random() * GATED.length)]
  const res = http.post(`${BASE}/${fn}`, JSON.stringify({ ping: 1 }), {
    headers: authHeaders,
    tags: { fn },
  })
  check(res, { 'gated → 401/403': (r) => r.status === 401 || r.status === 403 })
  if (res.status >= 200 && res.status < 300) gateLeak.add(1, { fn })
}

export function sharePublic() {
  // Token bidon (64 hex) → introuvable ; rafale depuis 1 IP → rate-limit 429. Jamais 2xx.
  const res = http.post(`${BASE}/share`, JSON.stringify({ token: hex(64), action: 'status' }), {
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    tags: { fn: 'share' },
  })
  check(res, { 'share public → 4xx': (r) => r.status >= 400 && r.status < 500 })
  if (res.status >= 200 && res.status < 300) gateLeak.add(1, { fn: 'share' })
}
