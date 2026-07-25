-- 0071 — Référentiel réglementaire VERSIONNÉ (P4.1, PLAN-ORG-REFERENTIEL §6).
--
-- Sépare le CONTENU réglementaire du CODE (modèle MedDRA « packs versionnés ») : les agences,
-- barèmes et exigences nationales deviennent des données publiées en versions datées, avec
-- PROVENANCE par entrée (n° de texte, JO). Tables GLOBALES (hors tenant) :
--   ref_versions — version publiable (draft → published → archived) ;
--   ref_entries  — 1 ligne = (version, pays, section) ; payload/provenance jsonb.
-- Sections : agency · fees · submission · samples · ctd_structure (réservée P4.5 — deltas de
-- composition du Module 1 par pays, cf. décision CEO 2026-07-24).
--
-- Lecture : tout utilisateur AUTHENTIFIÉ, versions PUBLIÉES uniquement (les brouillons du God
-- dashboard restent invisibles). Écriture : AUCUNE policy client — service role seul (P4.4) et
-- migrations. L'adoption par org (consentement) et les overrides arrivent en P4.2/P4.3 : en P4.1
-- le client lit la dernière version publiée, avec repli sur le socle code (offline-first).
--
-- Le seed v2026.1 ci-dessous est GÉNÉRÉ depuis `web/src/features/workspace/roadmap-data.ts`
-- (générateur committé : `web/src/features/catalogue/ref-seed.ts`, parité verrouillée par
-- `ref-seed.test.ts`) — contenu strictement identique au code : zéro changement de
-- comportement, la provenance (jusqu'ici en commentaires) devient une donnée.
--
-- ⚠ GARDE-FOU (P4.1) : tant que les consommateurs code-only (letter-context, RoadmapPage,
-- NewDossierPage, DossierPreviewPage, submission-language, listAgencies) ne passent PAS par le
-- résolveur `ref-content.ts`, publier un contenu qui DIFFÈRE de `roadmap-data.ts` est INTERDIT —
-- la fiche Autorité afficherait le nouveau barème pendant que la Roadmap/les lettres serviraient
-- l'ancien. Le test de parité `ref-seed.test.ts` casse volontairement si l'un des deux bouge seul.
--
-- Sémantique `effective_date` : une version publiée avec une date d'effet FUTURE n'est PAS
-- servie par le résolveur avant cette date (modèle MedDRA « à date d'effet », plan §6).

create table if not exists public.ref_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  effective_date date,
  release_note text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ref_entries (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ref_versions (id) on delete cascade,
  country text not null,
  section text not null
    check (section in ('agency', 'fees', 'submission', 'samples', 'ctd_structure')),
  payload jsonb not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (version_id, country, section)
);

-- FK + parcours « toutes les entrées d'une version » (pull client, éditeur god).
create index if not exists ref_entries_version_idx on public.ref_entries (version_id);

alter table public.ref_versions enable row level security;
alter table public.ref_entries enable row level security;

-- Défaut deny ; SELECT seul, versions publiées seules. Pas de policy insert/update/delete :
-- le service role (God dashboard P4.4, migrations) bypasse la RLS, les clients ne peuvent RIEN écrire.
drop policy if exists ref_versions_select on public.ref_versions;
create policy ref_versions_select on public.ref_versions
  for select to authenticated
  using (status = 'published');

drop policy if exists ref_entries_select on public.ref_entries;
create policy ref_entries_select on public.ref_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.ref_versions v
      where v.id = ref_entries.version_id and v.status = 'published'
    )
  );

-- ─── Seed v2026.1 (généré depuis roadmap-data.ts — ne pas éditer à la main) ───

insert into public.ref_versions (id, label, status, effective_date, release_note, published_at)
values ('7a1e4d20-0000-4000-8000-000000000071', 'v2026.1', 'published', null,
  'Socle initial — agences UEMOA/CEDEAO + barèmes BJ/CI/SN (contenu repris du code, provenance citée).',
  now())
on conflict (label) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'BJ', 'agency', $j${"name":"ABMed","full":"Agence Béninoise du Médicament et des autres produits de santé","directeur":"Dr Yossounon Chabi","sexe":"M","adresse":"Cotonou, Zone résidentielle","officialLang":"fr"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'BJ', 'fees', $j${"currency":"FCFA","fees":{"new_ma":500000,"renewal":250000,"variation_minor":50000,"variation_major":100000},"processingDays":120}$j$::jsonb, $j${"texte":"Barème officiel ABMed (Bénin)","note":"Source CEO — fiches ABMed"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'BJ', 'samples', $j${"samples":{"new_ma":[{"fr":"Cinq (05) échantillons modèle vente pour toutes les formes galéniques des conditionnements officinaux","en":"Five (05) sales-model samples for all galenic forms of retail (officinal) packaging"},{"fr":"Trois (03) échantillons modèle vente pour toutes les formes galéniques des conditionnements hospitaliers","en":"Three (03) sales-model samples for all galenic forms of hospital packaging"}],"renewal_variation":[{"fr":"Trois (03) échantillons modèle lors du renouvellement des autorisations et des variations nécessitant des échantillons","en":"Three (03) model samples for the renewal of authorisations and for variations requiring samples"}],"reserve":{"fr":"L’ABMed se réserve, selon le cas, le droit de demander des échantillons complémentaires.","en":"ABMed reserves the right, as the case may be, to request additional samples."}}}$j$::jsonb, $j${"texte":"Barème officiel ABMed (Bénin)","note":"Source CEO — fiches ABMed"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'BF', 'agency', $j${"name":"ANRP","full":"Agence Nationale de Régulation Pharmaceutique","directeur":"Dr Aminata P. Nacoulma","sexe":"F","adresse":"Ouagadougou, 01 BP 7009","officialLang":"fr"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'CI', 'agency', $j${"name":"AIRP","full":"Autorité Ivoirienne de Régulation Pharmaceutique","directeur":"Dr Assane Coulibaly","sexe":"M","adresse":"Abidjan, Cocody","telephone":"+225 27 22 22 01 55 / 25 22 00 55 61","email":"secretariat@airp.ci","officialLang":"fr"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'CI', 'fees', $j${"currency":"FCFA","fees":{"new_ma":500000,"renewal":250000,"variation_minor":50000,"variation_major":500000,"notes":{"new_ma":{"fr":"Par forme galénique, par dosage et par présentation — barème identique princeps/génériques. Industries de l’espace UEMOA : moitié prix (250 000 FCFA). Règlement en deux chèques barrés (100 000 F Receveur Général des Finances + 400 000 F AIRP), originaux + 4 copies.","en":"Per pharmaceutical form, strength and presentation — same schedule for innovators and generics. UEMOA-based industries: half price (250,000 FCFA). Paid by two crossed cheques (100,000 F Receiver General of Finance + 400,000 F AIRP), originals + 4 copies."},"renewal":{"fr":"Par forme, dosage et présentation — industries de l’espace UEMOA : moitié prix.","en":"Per form, strength and presentation — UEMOA-based industries: half price."},"variation":{"fr":"Majeure = modification avec répercussion sur l’activité du médicament ; mineure = sans répercussion (décret 2015-602). Par forme, dosage et présentation — industries UEMOA : moitié prix.","en":"Major = change affecting the medicine’s activity; minor = no such impact (Decree 2015-602). Per form, strength and presentation — UEMOA industries: half price."}}}}$j$::jsonb, $j${"texte":"Décret n° 2015-602 du 02/09/2015 (redevances AMM)","complements":"Modalités AIRP n° 01509 du 22/07/2024 · Note circulaire n° 0914/AIRP du 24/03/2026","note":"RA-source/RAG_Ivory cost/"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'CI', 'submission', $j${"note":{"fr":"Sessions d’enregistrement programmées (appel à manifestation d’intérêt, plan annuel de réception) — réception sur rendez-vous, 8 h 30–15 h 30 (note circulaire n° 0914/AIRP du 24 mars 2026).","en":"Scheduled registration sessions (call for expressions of interest, annual reception plan) — reception by appointment, 8:30 am–3:30 pm (AIRP circular No. 0914 of 24 March 2026)."}}$j$::jsonb, $j${"texte":"Décret n° 2015-602 du 02/09/2015 (redevances AMM)","complements":"Modalités AIRP n° 01509 du 22/07/2024 · Note circulaire n° 0914/AIRP du 24/03/2026","note":"RA-source/RAG_Ivory cost/"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'CI', 'samples', $j${"samples":{"new_ma":[{"fr":"Trente (30) échantillons du produit fini (modèle vente définitif) présentés en français — ou maquette avec lettre d’engagement à fournir les échantillons.","en":"Thirty (30) samples of the finished product (final sales model) presented in French — or a mock-up with a letter of undertaking to supply the samples."},{"fr":"Échantillons accompagnés des certificats d’analyse des lots soumis, validité d’au moins 2/3 de la durée de vie du produit.","en":"Samples accompanied by the certificates of analysis of the submitted batches, with at least 2/3 of the product shelf life remaining."},{"fr":"Vrac non accepté. Conditionnement hospitalier : boîte de 100 → 5 échantillons ; boîte de 1 000 → 2. PGHT > 100 000 FCFA → 3 échantillons.","en":"Bulk packaging not accepted. Hospital packs: box of 100 → 5 samples; box of 1,000 → 2. Ex-factory price above 100,000 FCFA → 3 samples."}],"reserve":{"fr":"Le laboratoire peut être invité à fournir un supplément d’échantillons pour les expertises (modalités AIRP n° 01509 du 22 juillet 2024).","en":"The laboratory may be asked to supply additional samples for expert assessments (AIRP procedures No. 01509 of 22 July 2024)."}}}$j$::jsonb, $j${"texte":"Décret n° 2015-602 du 02/09/2015 (redevances AMM)","complements":"Modalités AIRP n° 01509 du 22/07/2024 · Note circulaire n° 0914/AIRP du 24/03/2026","note":"RA-source/RAG_Ivory cost/"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'GW', 'agency', $j${"name":"DIFALRM","full":"Direção dos Serviços de Farmácia e Medicamentos","directeur":"Dr. Edson Moniz","sexe":"M","adresse":"Bissau, Ministère de la Santé Publique","officialLang":"pt"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'ML', 'agency', $j${"name":"DPM","full":"Direction de la Pharmacie et du Médicament","directeur":"Pr Fanta Sangho","sexe":"F","adresse":"Bamako, Darsalam, BPE 5202","officialLang":"fr"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'NE', 'agency', $j${"name":"DPM/MT","full":"Direction de la Pharmacie et de la Médecine Traditionnelle","directeur":"Dr Abdou Bagoudou Rakia","sexe":"F","adresse":"Niamey, Ministère de la Santé","officialLang":"fr"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'SN', 'agency', $j${"name":"ARP","full":"Agence Sénégalaise de Réglementation Pharmaceutique","directeur":"Dr Oumy Kalsoum Ndiaye Ndao","sexe":"F","adresse":"Dakar, Point E, Rue A x Rue 6","telephone":"+221 33 868 11 27","email":"contact@arp.sn","officialLang":"fr"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'SN', 'fees', $j${"currency":"FCFA","fees":{"new_ma":1000000,"renewal":500000,"variation_minor":100000,"variation_major":1000000,"notes":{"new_ma":{"fr":"Générique, industrie étrangère — princeps : 1 500 000 FCFA · procédure accélérée : 2 000 000 FCFA · industrie locale : 500 000 FCFA. AMM valable 5 ans.","en":"Generic, foreign industry — innovator: 1,500,000 FCFA · fast-track procedure: 2,000,000 FCFA · local industry: 500,000 FCFA. MA valid for 5 years."},"renewal":{"fr":"Industrie étrangère (locale : 250 000 FCFA). Retard de renouvellement : pénalité de 1 % du montant par jour de retard.","en":"Foreign industry (local: 250,000 FCFA). Late renewal: penalty of 1% of the fee per day of delay."},"variation":{"fr":"Mineure générique (princeps : 150 000 FCFA) — industrie locale : majeure 500 000 FCFA, mineure 50 000 FCFA.","en":"Minor, generic (innovator: 150,000 FCFA) — local industry: major 500,000 FCFA, minor 50,000 FCFA."}}}}$j$::jsonb, $j${"texte":"Décret n° 2025-1833 du 18/11/2025 (redevances régulation pharmaceutique), section 4","jo":"Journal officiel n° 7871 du 29/12/2025","note":"RA-source/Decret-2025-1833-redevances-ARP-Senegal.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'SN', 'samples', $j${"samples":{"new_ma":[{"fr":"Autorisation d'importation des échantillons : 100 000 FCFA par produit, par forme et par dosage (validité 6 mois).","en":"Sample import authorisation: 100,000 FCFA per product, per form and per strength (valid 6 months)."}],"renewal_variation":[{"fr":"Si des échantillons sont requis : autorisation d'importation de 100 000 FCFA par produit, par forme et par dosage (validité 6 mois).","en":"If samples are required: import authorisation of 100,000 FCFA per product, per form and per strength (valid 6 months)."}],"reserve":{"fr":"Le décret n° 2025-1833 ne fixe pas le nombre d'échantillons modèle-vente — à confirmer auprès de l'ARP.","en":"Decree No. 2025-1833 does not set the number of sales-model samples — to be confirmed with the ARP."}}}$j$::jsonb, $j${"texte":"Décret n° 2025-1833 du 18/11/2025 (redevances régulation pharmaceutique), section 4","jo":"Journal officiel n° 7871 du 29/12/2025","note":"RA-source/Decret-2025-1833-redevances-ARP-Senegal.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'TG', 'agency', $j${"name":"DPML","full":"Direction de la Pharmacie, du Médicament et des Laboratoires","directeur":"Dr NYANSA A. T. Atany","sexe":"M","adresse":"Lomé, Avenue du 2 Février","officialLang":"fr"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'NG', 'agency', $j${"name":"NAFDAC","full":"National Agency for Food and Drug Administration and Control","directeur":"","sexe":"M","adresse":"","officialLang":"en"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;

insert into public.ref_entries (version_id, country, section, payload, provenance)
values ('7a1e4d20-0000-4000-8000-000000000071', 'GH', 'agency', $j${"name":"FDA","full":"Food and Drugs Authority","directeur":"Dr Delese Mimi Darko","sexe":"F","adresse":"Accra","officialLang":"en"}$j$::jsonb, $j${"texte":"Liste officielle des autorités nationales du médicament (UEMOA/CEDEAO)","note":"Curée Pharnos — RA-source/Agence Reglementaire Nationale _UEMOA.pdf"}$j$::jsonb)
on conflict (version_id, country, section) do nothing;
