# Pharnos

OS des affaires réglementaires pharmaceutiques **UEMOA/CEDEAO**.
MVP : **Catalogue**, **CTD Workspace (Module 1)**, **Dashboard** — rapide, sécurisé, **offline-first**.

> Plan d'exécution complet et milestones : [`docs/PLAN.md`](docs/PLAN.md).

## Structure

- `web/` — App frontend : Vite + React + TS, PWA offline-first (Tailwind v4 + shadcn/ui)
- `supabase/` — Backend : Postgres, Auth, RLS, migrations, Edge Functions (à venir)
- `docs/` — Plan & documentation
- `.github/` — CI (GitHub Actions)

## Stack

- **Frontend** : Vite, React 19, TypeScript (strict), PWA (Workbox), Tailwind CSS v4, shadcn/ui, TanStack Query, Dexie (offline).
- **Backend** : Supabase (Postgres + Auth + Storage + RLS) + Edge Functions.
- **IA (Regafy AI)** : Google Gemini via Vertex AI (no-train) — branché en M4.
- **Hébergement** : Cloudflare Pages (web) + Supabase (managé).

## Démarrer (web)

```bash
cd web
npm install
cp .env.example .env.local   # renseigner les clés Supabase quand disponibles
npm run dev
```

Scripts (dans `web/`) : `npm run typecheck` · `lint` · `test` · `build` · `format`.

## État

- ✅ **M0 — Fondations** : scaffold PWA, design system, tooling, CI, socle Supabase (schéma + RLS).
- ⏳ **M1 — Catalogue** (prochain).
