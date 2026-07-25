// Edge Function `admin` — API de la console d'administration Pharnos (jalon M2).
//
// Double barrière de sécurité :
//   1) le JWT de l'appelant est vérifié et DOIT être super-admin Pharnos (is_platform_admin()) ;
//   2) toute la donnée cross-org est lue/écrite via un client SERVICE-ROLE (jamais exposé au client),
//      à travers des RPC réservées au service_role (migration 0021). Aucun accès cross-tenant côté client.
//
// Lecture : overview (KPIs + santé + growth + usage IA + audit récent), orgs, users,
//           audit (journal COMPLET paginé keyset — LOT 8b).
// Écriture (audit-loggée) : set_plan, set_quota, set_disabled, set_plan_limits.
import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { logJson, newReqId, userHash } from "../_shared/log.ts";

const PLANS = new Set(["free", "pro", "team", "business", "enterprise"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Référentiel réglementaire versionné (P4.4). `ctd_structure` (P4.5) volontairement ABSENTE tant
// que la machinerie d'arbre n'est pas livrée : publier une section que personne ne rend serait
// un piège (le client l'ignore, le god croit avoir publié).
const REF_SECTIONS = new Set(["agency", "fees", "submission", "samples"]);
const COUNTRY_RE = /^[A-Z]{2}$/;
const REF_LABEL_RE = /^v\d{4}\.\d{1,3}$/; // « v2026.2 » — cohérent avec le tri d'applicabilité
/** Cap de taille d'un payload/provenance sérialisé (anti-abus, le contenu réel fait < 5 Ko). */
const REF_JSON_CAP = 20_000;
/** Cap CUMULÉ d'un brouillon (200 entrées × 2 × 20 Ko ≈ 8 Mo sinon — revue #417 m11). */
const REF_TOTAL_CAP = 1_000_000;

/** Date ISO stricte (le regex seul accepte « 2026-13-45 » → 500 opaque, revue #417 m5). */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** Traduisible non vide (fr ET en) — la brique des contrôles d'efficacité. */
function isT(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.fr === "string" && o.fr.trim() !== "" &&
    typeof o.en === "string" && o.en.trim() !== ""
  );
}

/**
 * Un payload est-il EFFECTIF pour sa section — c.-à-d. produira-t-il quelque chose une fois
 * normalisé par le résolveur client (`ref-content.ts`) ? Sans ce contrôle, une entrée vide/
 * malformée donnait une « version publiée qui ne rend rien » : le god croit avoir publié, le
 * client l'ignore (revue #417, M7). Miroir volontairement STRICT des normalisateurs client.
 */
function refPayloadEffective(section: string, p: Record<string, unknown>): boolean {
  switch (section) {
    case "agency": {
      const name = typeof p.name === "string" ? p.name.trim() : "";
      const full = typeof p.full === "string" ? p.full.trim() : "";
      return name !== "" || full !== "";
    }
    case "fees": {
      const fees = p.fees;
      if (!fees || typeof fees !== "object" || Array.isArray(fees)) return false;
      const f = fees as Record<string, unknown>;
      return ["new_ma", "renewal", "variation_minor", "variation_major"].some(
        (k) => typeof f[k] === "number" && Number.isFinite(f[k] as number),
      );
    }
    case "submission":
      return isT(p.note);
    case "samples": {
      const s = p.samples;
      if (!s || typeof s !== "object" || Array.isArray(s)) return false;
      const o = s as Record<string, unknown>;
      const list = (v: unknown) => Array.isArray(v) && v.some(isT);
      return list(o.new_ma) || list(o.renewal_variation) || isT(o.reserve);
    }
    default:
      return false;
  }
}
// Console Acquisition (0064) — statuts du pipeline de leads + format des codes d'invitation.
const DEMO_STATUSES = new Set([
  "nouveau",
  "contacte",
  "demo_faite",
  "converti",
  "sans_suite",
]);
const INVITE_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

/** Code par défaut depuis le label : « Dr Kouamé » → DR-KOUAME-X7Q4 (suffixe aléatoire =
 * défense anti force-brute en profondeur, en plus du throttle du RPC create_org_onboarding). */
function codeFromLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 26)
    .replace(/-+$/g, "");
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rand = crypto.getRandomValues(new Uint8Array(4));
  let suffix = "";
  for (const byte of rand) suffix += alphabet[byte % alphabet.length];
  return `${base || "INVITE"}-${suffix}`;
}

/** Borne un entier optionnel (quota) : null (= défaut du plan) ou entier >= 0 borné. */
function optInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 9_000_000_000);
}

/** Idem pour des OCTETS (stockage) : borne plus haute (1 Po) — 20 Go dépasse le cap d'optInt. */
function optBig(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 1_000_000_000_000_000);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const reqId = newReqId();
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: "admin", reqId, op: "cors", status: "forbidden" });
    return new Response("origine non autorisée", { status: 403 });
  }
  const cors = corsHeaders(origin);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        "content-type": "application/json",
        "x-request-id": reqId,
      },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) Auth — JWT de l'appelant.
  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );
  const {
    data: { user },
    error: authErr,
  } = await authed.auth.getUser();
  if (authErr || !user) {
    logJson({ fn: "admin", reqId, op: "auth", status: "unauthorized" });
    return json({ error: "unauthorized" }, 401);
  }
  const log = { fn: "admin", reqId, user: await userHash(user.id) };

  // 1bis) Gate super-admin Pharnos — vérifié avec le JWT appelant (is_platform_admin()).
  const { data: isAdmin, error: gateErr } =
    await authed.rpc("is_platform_admin");
  if (gateErr || isAdmin !== true) {
    logJson({ ...log, op: "gate", status: "forbidden" });
    return json({ error: "forbidden" }, 403);
  }

  // 2) Client service-role — accès cross-org via les RPC admin_* (service_role only).
  const svc = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const b = (raw ?? {}) as Record<string, unknown>;
  const action = typeof b.action === "string" ? b.action : "";
  const actorId = user.id;
  const actorEmail = user.email ?? "";

  const callRpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await svc.rpc(fn, args);
    if (error) {
      logJson({
        ...log,
        op: action,
        status: "rpc_error",
        rpc: fn,
        err: String(error.message).slice(0, 200),
      });
      return json({ error: "rpc_failed" }, 500);
    }
    return json({ ok: true, data });
  };

  try {
    switch (action) {
      // ── Lectures ──────────────────────────────────────────────────────────────────────────
      case "overview":
        logJson({ ...log, op: "overview", status: "ok" });
        return await callRpc("admin_overview", {});
      case "orgs":
        logJson({ ...log, op: "orgs", status: "ok" });
        return await callRpc("admin_orgs", {});
      case "users":
        logJson({ ...log, op: "users", status: "ok" });
        return await callRpc("admin_users", {});
      case "plans":
        logJson({ ...log, op: "plans", status: "ok" });
        return await callRpc("admin_plan_limits", {});
      // Journal d'audit COMPLET, paginé keyset (LOT 8b — l'overview tronque à 25).
      case "audit": {
        const limit = b.limit === undefined ? 50 : optInt(b.limit);
        if (limit === null) return json({ error: "bad_request" }, 400);
        const org =
          b.orgId === undefined || b.orgId === null ? null : String(b.orgId);
        if (org !== null && !UUID_RE.test(org))
          return json({ error: "bad_request" }, 400);
        // Curseur = (at, id) de la DERNIÈRE ligne reçue — les deux voyagent ensemble.
        const hasCursor = b.beforeAt !== undefined || b.beforeId !== undefined;
        const beforeAt = typeof b.beforeAt === "string" ? b.beforeAt : null;
        const beforeId = typeof b.beforeId === "string" ? b.beforeId : null;
        if (hasCursor) {
          if (!beforeAt || Number.isNaN(Date.parse(beforeAt)))
            return json({ error: "bad_request" }, 400);
          if (!beforeId || !UUID_RE.test(beforeId))
            return json({ error: "bad_request" }, 400);
        }
        logJson({ ...log, op: "audit", status: "ok" });
        return await callRpc("admin_audit", {
          p_limit: Math.min(Math.max(limit, 1), 100),
          p_before_at: beforeAt,
          p_before_id: beforeId,
          p_org: org,
        });
      }

      // ── Écritures (audit-loggées dans la RPC) ───────────────────────────────────────────────
      case "set_plan": {
        const org = String(b.orgId ?? "");
        const plan = String(b.plan ?? "");
        if (!UUID_RE.test(org) || !PLANS.has(plan))
          return json({ error: "bad_request" }, 400);
        logJson({ ...log, op: "set_plan", status: "ok" });
        return await callRpc("admin_set_org_plan", {
          p_org: org,
          p_plan: plan,
          p_actor_id: actorId,
          p_actor_email: actorEmail,
        });
      }
      case "set_quota": {
        const org = String(b.orgId ?? "");
        if (!UUID_RE.test(org)) return json({ error: "bad_request" }, 400);
        logJson({ ...log, op: "set_quota", status: "ok" });
        return await callRpc("admin_set_org_quota", {
          p_org: org,
          p_max_dossiers: optInt(b.maxDossiers),
          p_monthly_ai_tokens: optInt(b.monthlyAiTokens),
          p_max_storage_bytes: optBig(b.maxStorageBytes),
          p_actor_id: actorId,
          p_actor_email: actorEmail,
        });
      }
      case "set_disabled": {
        const org = String(b.orgId ?? "");
        if (!UUID_RE.test(org) || typeof b.disabled !== "boolean")
          return json({ error: "bad_request" }, 400);
        logJson({
          ...log,
          op: "set_disabled",
          status: "ok",
          disabled: b.disabled,
        });
        return await callRpc("admin_set_org_disabled", {
          p_org: org,
          p_disabled: b.disabled,
          p_actor_id: actorId,
          p_actor_email: actorEmail,
        });
      }
      case "set_plan_limits": {
        const plan = String(b.plan ?? "");
        if (!PLANS.has(plan)) return json({ error: "bad_request" }, 400);
        // Ancre d'audit = org de l'admin (audit_log.org_id NOT NULL) — résolue via service-role.
        const { data: m } = await svc
          .from("memberships")
          .select("org_id")
          .eq("user_id", actorId)
          .limit(1)
          .maybeSingle();
        const actorOrg = (m as { org_id?: string } | null)?.org_id;
        if (!actorOrg) return json({ error: "actor_without_org" }, 409);
        const features =
          b.features &&
          typeof b.features === "object" &&
          !Array.isArray(b.features)
            ? b.features
            : null;
        logJson({ ...log, op: "set_plan_limits", status: "ok", plan });
        return await callRpc("admin_set_plan_limits", {
          p_plan: plan,
          p_max_dossiers: optInt(b.maxDossiers),
          p_dossiers_period:
            b.dossiersPeriod === "lifetime" || b.dossiersPeriod === "month"
              ? b.dossiersPeriod
              : null,
          p_monthly_ai_tokens: optInt(b.monthlyAiTokens),
          p_max_seats: optInt(b.maxSeats),
          p_max_storage_bytes: optBig(b.maxStorageBytes),
          p_features: features,
          p_actor_org: actorOrg,
          p_actor_id: actorId,
          p_actor_email: actorEmail,
        });
      }
      // ── Console Acquisition (0064) — leads + invitations + apport par expert ────────────────
      case "acq_demos": {
        const { data, error } = await svc
          .from("demo_requests")
          .select(
            "id, created_at, updated_at, full_name, email, org_type, org_type_other, company, job_title, country, status, notes",
          )
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) {
          logJson({ ...log, op: action, status: "query_error", err: error.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        logJson({ ...log, op: action, status: "ok" });
        return json({ ok: true, data });
      }
      case "acq_demo_status": {
        const id = String(b.id ?? "");
        const status = String(b.status ?? "");
        const notes =
          b.notes === undefined || b.notes === null ? undefined : String(b.notes).slice(0, 2000);
        if (!UUID_RE.test(id) || !DEMO_STATUSES.has(status))
          return json({ error: "bad_request" }, 400);
        const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
        if (notes !== undefined) patch.notes = notes || null;
        const { error } = await svc.from("demo_requests").update(patch).eq("id", id);
        if (error) {
          logJson({ ...log, op: action, status: "query_error", err: error.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        logJson({ ...log, op: action, status: "ok", to: status });
        return json({ ok: true, data: null });
      }
      case "acq_invites": {
        const { data, error } = await svc
          .from("platform_invites")
          .select("id, code, label, max_uses, used_count, revoked_at, expires_at, note, created_at")
          .order("created_at", { ascending: false });
        if (error) {
          logJson({ ...log, op: action, status: "query_error", err: error.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        logJson({ ...log, op: action, status: "ok" });
        return json({ ok: true, data });
      }
      case "acq_invite_create": {
        const label = String(b.label ?? "").trim();
        if (label.length < 1 || label.length > 120) return json({ error: "bad_request" }, 400);
        const code =
          typeof b.code === "string" && b.code.trim() !== ""
            ? b.code.trim().toUpperCase()
            : codeFromLabel(label);
        if (!INVITE_CODE_RE.test(code)) return json({ error: "bad_code" }, 400);
        const maxUses = optInt(b.maxUses) ?? 50;
        if (maxUses < 1 || maxUses > 10000) return json({ error: "bad_request" }, 400);
        const expiresAt =
          typeof b.expiresAt === "string" && !Number.isNaN(Date.parse(b.expiresAt))
            ? b.expiresAt
            : null;
        const note = b.note ? String(b.note).slice(0, 400) : null;
        const { data, error } = await svc
          .from("platform_invites")
          .insert({ code, label, max_uses: maxUses, expires_at: expiresAt, note, created_by: actorId })
          .select("id, code, label, max_uses, used_count, revoked_at, expires_at, note, created_at")
          .single();
        if (error) {
          // 23505 = code déjà pris (contrainte unique) — l'admin choisit un autre code.
          if (error.code === "23505") return json({ error: "code_taken" }, 409);
          logJson({ ...log, op: action, status: "query_error", err: error.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        logJson({ ...log, op: action, status: "ok" });
        return json({ ok: true, data });
      }
      case "acq_invite_revoke": {
        const id = String(b.id ?? "");
        if (!UUID_RE.test(id)) return json({ error: "bad_request" }, 400);
        // Révocation, jamais de DELETE : l'attribution (redemptions) doit survivre au code.
        const { error } = await svc
          .from("platform_invites")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id)
          .is("revoked_at", null);
        if (error) {
          logJson({ ...log, op: action, status: "query_error", err: error.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        logJson({ ...log, op: action, status: "ok" });
        return json({ ok: true, data: null });
      }
      case "acq_report":
        logJson({ ...log, op: "acq_report", status: "ok" });
        return await callRpc("admin_acquisition_report", {});

      // ── Référentiel réglementaire versionné (P4.4) — publication god-only ──────────────────
      // Le service role est le SEUL chemin d'écriture de ref_versions/ref_entries (0071 : aucune
      // policy d'écriture). Invariants tenus ici : une version PUBLIÉE est immuable (photographie
      // opposable — on republie, on ne réécrit pas) ; provenance OBLIGATOIRE sur chaque entrée
      // (pas de source, pas de publication — briefing CEO) ; le socle ne s'archive jamais.
      case "ref_overview":
        // Agrégats + « latest » + contenu RÉSOLU calculés EN SQL (RPC 0076) : pas de selects nus
        // tronqués à max_rows sans erreur, et UNE seule implémentation de la règle
        // d'applicabilité (celle du trigger 0075 et de ref-state.ts) — revue #417 M3/M9.
        logJson({ ...log, op: action, status: "ok" });
        return await callRpc("admin_ref_overview", {});
      case "ref_entries": {
        // Entrées COMPLÈTES d'une version (payload+provenance) — l'éditeur de brouillon les précharge.
        const versionId = String(b.versionId ?? "");
        if (!UUID_RE.test(versionId)) return json({ error: "bad_request" }, 400);
        const { data, error } = await svc
          .from("ref_entries")
          .select("id,version_id,country,section,payload,provenance,created_at")
          .eq("version_id", versionId)
          .order("country");
        if (error) {
          logJson({ ...log, op: action, status: "query_error", err: error.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        logJson({ ...log, op: action, status: "ok" });
        return json({ ok: true, data });
      }
      case "ref_save_draft": {
        const versionId =
          b.versionId === undefined || b.versionId === null ? null : String(b.versionId);
        if (versionId !== null && !UUID_RE.test(versionId))
          return json({ error: "bad_request" }, 400);
        const label = String(b.label ?? "").trim();
        if (!REF_LABEL_RE.test(label)) return json({ error: "bad_label" }, 400);
        const releaseNote = String(b.releaseNote ?? "").slice(0, 2000);
        const effectiveDate = isIsoDate(b.effectiveDate) ? b.effectiveDate : null;
        const entries = Array.isArray(b.entries) ? b.entries : [];
        if (entries.length === 0 || entries.length > 200)
          return json({ error: "bad_request" }, 400);
        const seen = new Set<string>();
        let totalBytes = 0;
        const rows: {
          country: string;
          section: string;
          payload: unknown;
          provenance: unknown;
        }[] = [];
        for (const raw of entries) {
          const e = (raw ?? {}) as Record<string, unknown>;
          const country = String(e.country ?? "");
          const section = String(e.section ?? "");
          const key = `${country}/${section}`;
          if (!COUNTRY_RE.test(country) || !REF_SECTIONS.has(section) || seen.has(key))
            return json({ error: "bad_entry" }, 400);
          seen.add(key);
          const payload = e.payload;
          const provenance = e.provenance as Record<string, unknown> | undefined;
          if (!payload || typeof payload !== "object" || Array.isArray(payload))
            return json({ error: "bad_entry" }, 400);
          // Un payload qui ne RENDRAIT rien (vide/malformé après normalisation client) est
          // refusé : « version publiée qui ne rend rien » = le piège exact de ctd_structure.
          if (!refPayloadEffective(section, payload as Record<string, unknown>))
            return json({ error: "payload_ineffective", country, section }, 400);
          // PROVENANCE OBLIGATOIRE : pas de texte officiel cité, pas d'entrée.
          if (
            !provenance ||
            typeof provenance !== "object" ||
            typeof provenance.texte !== "string" ||
            provenance.texte.trim().length < 3
          )
            return json({ error: "provenance_required" }, 400);
          const size = JSON.stringify(payload).length + JSON.stringify(provenance).length;
          if (size > REF_JSON_CAP * 2) return json({ error: "too_large" }, 400);
          totalBytes += size;
          if (totalBytes > REF_TOTAL_CAP) return json({ error: "too_large" }, 400);
          rows.push({ country, section, payload, provenance });
        }

        // ATOMIQUE (RPC 0076, verrou `for update`) : plus de fenêtre où un publish concurrent
        // laissait muter les entrées d'une PUBLIÉE, plus de brouillon vidé par un insert en échec.
        const { data: vid, error } = await svc.rpc("admin_ref_save_draft", {
          p_version: versionId,
          p_label: label,
          p_effective: effectiveDate,
          p_note: releaseNote,
          p_entries: rows,
        });
        if (error) {
          const m = String(error.message);
          if (m.includes("not_a_draft")) return json({ error: "not_a_draft" }, 409);
          if (m.includes("not_found")) return json({ error: "not_found" }, 404);
          if (m.includes("bad_label") || m.includes("bad_entr"))
            return json({ error: "bad_request" }, 400);
          if (m.includes("ref_versions_label_key") || error.code === "23505")
            return json({ error: "label_taken" }, 409);
          logJson({ ...log, op: action, status: "rpc_error", err: m.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        logJson({ ...log, op: action, status: "ok", entries: rows.length });
        return json({ ok: true, data: { versionId: vid } });
      }
      case "ref_publish": {
        const versionId = String(b.versionId ?? "");
        if (!UUID_RE.test(versionId)) return json({ error: "bad_request" }, 400);
        // Publier du contenu réglementaire mondial SANS trace DB serait pire que refuser :
        // même règle stricte que set_plan_limits (actor_without_org = 409, revue #417 M5).
        const { data: m } = await svc
          .from("memberships")
          .select("org_id")
          .eq("user_id", actorId)
          .limit(1)
          .maybeSingle();
        const actorOrg = (m as { org_id?: string } | null)?.org_id;
        if (!actorOrg) return json({ error: "actor_without_org" }, 409);

        const { data: v, error } = await svc
          .from("ref_versions")
          .select("id,label,status,effective_date")
          .eq("id", versionId)
          .maybeSingle();
        if (error || !v) return json({ error: "not_found" }, 404);
        if (v.status !== "draft") return json({ error: "not_a_draft" }, 409);

        // ── B1 : JAMAIS de rétro-datation. Le rang d'applicabilité = effective_date d'abord :
        // publier « le décret de 2025 » daté 2025 classerait la version SOUS le socle — inerte,
        // sans bannière, non-adoptable, et appliquée SANS consentement pour les sections que le
        // socle ne couvre pas (violation de l'invariant P4.2). La date du décret se cite dans
        // la PROVENANCE ; la date d'effet ne peut pas précéder les versions déjà applicables.
        const { data: pubs, error: pubErr } = await svc
          .from("ref_versions")
          .select("effective_date,published_at,created_at")
          .eq("status", "published");
        if (pubErr) {
          logJson({ ...log, op: action, status: "query_error", err: pubErr.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        const today = new Date().toISOString().slice(0, 10);
        const applicability = (r: {
          effective_date: string | null;
          published_at: string | null;
          created_at: string;
        }) => r.effective_date ?? r.published_at ?? r.created_at;
        // Seules les versions DÉJÀ applicables bornent (une version à effet FUTUR ne doit pas
        // empêcher de publier « effet immédiat » maintenant — les deux coexistent par rang).
        const maxApplicable = (pubs ?? [])
          .filter((r) => !r.effective_date || r.effective_date <= today)
          .map(applicability)
          .sort()
          .at(-1);
        const mine = v.effective_date ?? new Date().toISOString();
        if (maxApplicable && mine < maxApplicable)
          return json({ error: "effective_date_backdated" }, 409);

        // Jamais de version vide, jamais d'entrée sans source ni payload inerte (re-vérifié AU
        // MOMENT de publier : la table a pu être écrite par un autre canal).
        const { data: ents, error: entErr } = await svc
          .from("ref_entries")
          .select("country,section,payload,provenance")
          .eq("version_id", versionId);
        if (entErr) {
          logJson({ ...log, op: action, status: "query_error", err: entErr.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        if (!ents || ents.length === 0) return json({ error: "empty_version" }, 409);
        for (const e of ents) {
          const p = e.provenance as Record<string, unknown> | null;
          if (!p || typeof p.texte !== "string" || p.texte.trim().length < 3)
            return json({ error: "provenance_required" }, 409);
          if (!refPayloadEffective(e.section, (e.payload ?? {}) as Record<string, unknown>))
            return json({ error: "payload_ineffective", country: e.country, section: e.section }, 409);
        }

        const upd = await svc
          .from("ref_versions")
          .update({ status: "published", published_at: new Date().toISOString() })
          .eq("id", versionId)
          .eq("status", "draft")
          .select("id");
        if (upd.error || !upd.data || upd.data.length === 0) {
          if (upd.error)
            logJson({ ...log, op: action, status: "query_error", err: upd.error.message.slice(0, 200) });
          // 0 ligne = un concurrent a publié/supprimé entre-temps — jamais un faux succès.
          return json({ error: upd.error ? "query_failed" : "not_a_draft" }, upd.error ? 500 : 409);
        }
        const audit = await svc.from("audit_log").insert({
          id: crypto.randomUUID(),
          org_id: actorOrg,
          actor_id: actorId,
          actor_email: actorEmail,
          entity: "ref_version",
          entity_id: versionId,
          action: "update",
          label: `référentiel ${v.label} publié`,
        });
        if (audit.error) {
          // La publication est faite (ne pas la rollback) mais une trace perdue doit se VOIR.
          logJson({ ...log, op: action, status: "audit_failed", err: audit.error.message.slice(0, 200) });
        }
        logJson({ ...log, op: action, status: "ok", label: v.label });
        return json({ ok: true, data: null });
      }
      case "ref_delete_draft": {
        const versionId = String(b.versionId ?? "");
        if (!UUID_RE.test(versionId)) return json({ error: "bad_request" }, 400);
        // DELETE réservé aux BROUILLONS (cascade sur les entrées). Une publiée s'archive (plus tard),
        // ne se supprime pas — et la FK restrict des dossiers épinglés la protège de toute façon.
        const { data, error } = await svc
          .from("ref_versions")
          .delete()
          .eq("id", versionId)
          .eq("status", "draft")
          .select("id,label");
        if (error) {
          logJson({ ...log, op: action, status: "query_error", err: error.message.slice(0, 200) });
          return json({ error: "query_failed" }, 500);
        }
        // 0 ligne = id publié/inexistant : dire la vérité, pas un faux succès qui ferme l'éditeur.
        if (!data || data.length === 0) return json({ error: "not_found" }, 404);
        logJson({ ...log, op: action, status: "ok", label: data[0].label });
        return json({ ok: true, data: null });
      }

      default:
        return json({ error: "bad_request" }, 400);
    }
  } catch (e) {
    logJson({
      ...log,
      op: action,
      status: "fatal",
      err: String(e instanceof Error ? e.message : e).slice(0, 200),
    });
    return json({ error: "server_error" }, 500);
  }
});
