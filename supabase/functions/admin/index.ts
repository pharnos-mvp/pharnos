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
