// HARNAIS DU BANC D'ESSAI (U0.3) — joue la chaîne COMPLÈTE d'une mise à niveau sur le banc Edge
// et en rend les mesures : rubriques FR (passe 1), traduction EN (passe 2), revue (passe 3).
//
//   BENCH_TOKEN=… deno run --allow-net --allow-read --allow-write --allow-env \
//     docs/gabarits/tools/bench-harness.ts \
//     --source <texte.txt> --product "AARCOLD" --source-name "RCP_Sample.pdf" \
//     --country BJ --out <répertoire>
//
// CE QU'IL EST. Le prototype du pilotage : l'état vit chez l'appelant entre les invocations —
// exactement comme il vivra en base chez le worker (U4) ou dans l'onglet côté navigateur. Chaque
// invocation du banc est une vague ; le harnais enchaîne les vagues et tient les sorties.
//
// CE QU'IL N'EST PAS. Un outil client. Il parle au banc (`bench`), fermé par jeton, jamais à
// l'Edge de production. Et il ne rend pas les fichiers livrables : l'assemblage DOCX/PDF
// appartient à `web/src/lib/deliverables/` — le harnais écrit les trois markdowns et `run.json`,
// puis `UPGRADE_RUN_DIR=<out> npm run deliverables:run` (dans `web/`) fabrique les 5 fichiers par
// LE MÊME code que la livraison navigateur.
//
// POURQUOI DENO. Il importe `conformity-specs.ts` — la source de vérité du gabarit — au lieu d'en
// recopier la structure. Une rubrique ajoutée au spec entre ici sans retouche.
import {
  CONFORMITY_SPECS,
  flattenRubrics,
  type RubricSpec,
} from "../../../supabase/functions/_shared/conformity-specs.ts";
import {
  MISSING_MARKER,
  MISSING_MARKER_EN,
} from "../../../supabase/functions/_shared/upgrade-section-core.ts";

/* ─────────────────────────────── Tarifs Claude Opus 5 (USD / M jetons) ─────────────────────── */
const PRICE = { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 };

interface Usage {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}
const zero = (): Usage => ({ in: 0, out: 0, cacheRead: 0, cacheWrite: 0 });
const addTo = (a: Usage, b: Usage) => {
  a.in += b.in;
  a.out += b.out;
  a.cacheRead += b.cacheRead;
  a.cacheWrite += b.cacheWrite;
};
const costOf = (u: Usage): number =>
  ((u.in - u.cacheRead - u.cacheWrite) * PRICE.in +
    u.cacheWrite * PRICE.cacheWrite +
    u.cacheRead * PRICE.cacheRead +
    u.out * PRICE.out) /
  1e6;

/* ────────────────────────────────────── Arguments ──────────────────────────────────────────── */
function arg(name: string, fallback?: string): string {
  const i = Deno.args.indexOf(`--${name}`);
  const v = i >= 0 ? Deno.args[i + 1] : undefined;
  if (v === undefined && fallback === undefined) {
    console.error(`argument --${name} requis`);
    Deno.exit(1);
  }
  return v ?? fallback!;
}

const TOKEN = Deno.env.get("BENCH_TOKEN") ?? "";
if (!TOKEN) {
  console.error("BENCH_TOKEN absent de l’environnement");
  Deno.exit(1);
}
const URL_ =
  Deno.env.get("BENCH_URL") ??
  "https://uhsireqwzqqymgsxuvqh.supabase.co/functions/v1/bench";
const SOURCE_PATH = arg("source");
const PRODUCT = arg("product");
const SOURCE_NAME = arg("source-name");
const COUNTRY = arg("country", "BJ");
const OUT = arg("out");
const ACTIVITY = arg("activity", "nouvelle demande d'AMM");
const REPORT_DATE = arg("date", new Date().toISOString().slice(0, 10));
const WAVE = 6;

const sourceText = await Deno.readTextFile(SOURCE_PATH);
const spec = CONFORMITY_SPECS.rcp;
const flat = flattenRubrics(spec);
const isParent = (r: RubricSpec) => Boolean(r.children?.length);

/* ─────────────────── Titres EN — lus dans le gabarit verrouillé, jamais inventés ───────────── */
const gabaritEn = await Deno.readTextFile(
  new URL("../RCP/Gabarit-SmPC-EN-UEMOA.md", import.meta.url),
);
function enTitles(): Map<string, string> {
  const map = new Map<string, string>();
  const lines = gabaritEn.split("\n");
  // Parents à sous-parties nommées : leurs enfants se lisent dans l'ORDRE des lignes en gras.
  const dashParents = flat.filter(
    (r) => isParent(r) && r.children!.some((c) => c.id.includes("-")),
  );
  let current: RubricSpec | undefined;
  let taken = 0;
  for (const line of lines) {
    const h = line.match(/^#{3,4} (?:(\d+(?:\.\d+)?)\. )?(.+)$/);
    if (h) {
      const [, id, title] = h;
      if (id) {
        map.set(id, title.trim());
        current = dashParents.find((p) => p.id === id);
        taken = 0;
      } else if (/^CONDITIONS OF/i.test(title)) {
        map.set("prescription", title.trim());
        current = undefined;
      }
      continue;
    }
    const bold = line.match(/^\*\*<?([^*<>]+)>?\*\*$/);
    if (bold && current && taken < current.children!.length) {
      map.set(current.children![taken].id, bold[1].trim());
      taken++;
    }
  }
  return map;
}
const EN_TITLES = enTitles();
{
  const missing = flat.filter((r) => !EN_TITLES.has(r.id)).map((r) => r.id);
  if (missing.length) {
    console.error(
      `titres EN introuvables dans le gabarit pour : ${missing.join(", ")}`,
    );
    Deno.exit(1);
  }
}

/* ──────────────────────────────────── Appels au banc ───────────────────────────────────────── */
async function bench(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bench-token": TOKEN },
    body: JSON.stringify(body),
  });
  const out = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    // Le corps d'un échec porte durée et jetons : un appel qui a échoué a quand même coûté, et le
    // banc perdrait sa raison d'être s'il ne comptait que les succès.
    throw Object.assign(
      new Error(`bench ${res.status} : ${out.error ?? "sans détail"}`),
      { body: out },
    );
  }
  out._clientMs = Date.now() - t0;
  return out;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

interface SectionRow {
  sectionId: string;
  title: string;
  status: string;
  verdict?: string;
  content: string;
  ungrounded: string[];
  figuresAdvisory: boolean;
  attempts?: number;
  ms: number;
  usage: Usage;
  error?: string;
}

interface PhaseMeasure {
  waves: {
    ms: number;
    slowestMs: number;
    ok: number;
    failed: number;
    skipped: number;
  }[];
  totals: Usage;
  ms: number;
}

/* ────────────────────────────── Reprise — l'état survit aux passes ─────────────────────────── */
// La leçon du premier run : la revue a dépassé son délai APRÈS 59 appels payés, et tout était
// perdu — le harnais ne tenait l'état qu'en mémoire. C'est exactement le défaut que le worker
// (U4) évitera en écrivant en base après chaque vague ; le harnais fait pareil avec un fichier.
// Un état présent dans `--out` saute la passe correspondante ; le supprimer force le re-jeu.
await Deno.mkdir(OUT, { recursive: true });
async function loadState<T>(name: string): Promise<T | undefined> {
  try {
    return JSON.parse(await Deno.readTextFile(`${OUT}/${name}`)) as T;
  } catch {
    return undefined;
  }
}
const saveState = (name: string, value: unknown) =>
  Deno.writeTextFile(`${OUT}/${name}`, JSON.stringify(value, null, 2) + "\n");

/* ─────────────────────────────── Passe 1 — rubriques FR ────────────────────────────────────── */
const p1: PhaseMeasure = { waves: [], totals: zero(), ms: 0 };
const rows = new Map<string, SectionRow>();
const prior1 = await loadState<{ p1: PhaseMeasure; rows: SectionRow[] }>(
  "state-p1.json",
);
if (prior1) {
  Object.assign(p1, prior1.p1);
  for (const s of prior1.rows) rows.set(s.sectionId, s);
  console.error(
    `passe 1 — reprise depuis state-p1.json (${rows.size} rubriques)`,
  );
}
if (!prior1) {
  console.error(`passe 1 — ${flat.length} rubriques en vagues de ${WAVE}…`);
  for (const wave of chunks(
    flat.map((r) => r.id),
    WAVE,
  )) {
    const r = await bench({
      phase: "sections",
      sourceText,
      docType: "rcp",
      countryCode: COUNTRY,
      sections: wave,
      concurrency: WAVE,
      // Préchauffage sur la PREMIÈRE vague seulement : ensuite le cache est déjà écrit, sérialiser
      // le premier appel ne ferait qu'allonger la vague.
      warmupFirst: p1.waves.length === 0,
    });
    const w = r.wave as PhaseMeasure["waves"][number];
    p1.waves.push(w);
    p1.ms += w.ms;
    addTo(p1.totals, r.totals as Usage);
    for (const s of r.sections as SectionRow[]) rows.set(s.sectionId, s);
    console.error(
      `  vague [${wave.join(", ")}] : ${(w.ms / 1000).toFixed(1)} s · ${w.ok} ok · ${w.failed} échec(s)`,
    );
  }
  const failed1 = [...rows.values()].filter((s) => s.error);
  if (failed1.length) {
    console.error(
      `ÉCHEC passe 1 : ${failed1.map((s) => `${s.sectionId} (${s.error})`).join(" ; ")}`,
    );
    Deno.exit(1);
  }
  await saveState("state-p1.json", { p1, rows: [...rows.values()] });
}

/* ─────────────────────────────── Passe 2 — traduction EN ───────────────────────────────────── */
// Seules les FEUILLES au contenu réel se traduisent : un conteneur n'a pas de corps, et une
// rubrique absente se rend par le marqueur EN sans dépenser un appel — le statut se recopie,
// jamais ne se recalcule (étape 2, décision verrouillée).
const toTranslate = flat.filter((r) => {
  const row = rows.get(r.id)!;
  return (
    !isParent(r) && row.status !== "missing" && row.content !== MISSING_MARKER
  );
});
const p2: PhaseMeasure = { waves: [], totals: zero(), ms: 0 };
const en = new Map<
  string,
  { content: string; translated: boolean; driftedFigures: string[] }
>();
type EnRow = { sectionId: string } & NonNullable<
  ReturnType<(typeof en)["get"]>
>;
const prior2 = await loadState<{ p2: PhaseMeasure; en: EnRow[] }>(
  "state-p2.json",
);
if (prior2) {
  Object.assign(p2, prior2.p2);
  for (const e of prior2.en) en.set(e.sectionId, e);
  console.error(
    `passe 2 — reprise depuis state-p2.json (${en.size} traductions)`,
  );
}
if (!prior2) {
  console.error(`passe 2 — ${toTranslate.length} rubriques à traduire…`);
  for (const wave of chunks(toTranslate, WAVE)) {
    const r = await bench({
      phase: "translate",
      targetLang: "en",
      items: wave.map((rub) => ({
        sectionId: rub.id,
        title: EN_TITLES.get(rub.id)!,
        status: rows.get(rub.id)!.status,
        content: rows.get(rub.id)!.content,
      })),
      concurrency: WAVE,
    });
    const w = r.wave as PhaseMeasure["waves"][number];
    p2.waves.push(w);
    p2.ms += w.ms;
    addTo(p2.totals, r.totals as Usage);
    for (const item of r.items as (SectionRow & {
      translated: boolean;
      driftedFigures: string[];
    })[]) {
      if (item.error) {
        console.error(`ÉCHEC passe 2 : ${item.sectionId} (${item.error})`);
        Deno.exit(1);
      }
      en.set(item.sectionId, item);
    }
    console.error(
      `  vague [${wave.map((x) => x.id).join(", ")}] : ${(w.ms / 1000).toFixed(1)} s`,
    );
  }
  await saveState("state-p2.json", {
    p2,
    en: [...en.entries()].map(([sectionId, e]) => ({ ...e, sectionId })),
  });
}

/* ─────────────────────────────────── Passe 3 — revue ───────────────────────────────────────── */
// Miroir exact de `reportInputFrom` : TOUTES les rubriques, dans l'ordre du gabarit, et les
// valeurs à relire seulement quand la provenance est océrisée.
//
// La revue est UNE tentative de 90 s au plus (`REPORT_ATTEMPT_TIMEOUT_MS`) : au premier run réel,
// Opus 5 l'a dépassée une fois. Dans une même invocation, un timeout n'est jamais re-tenté (§8.9) ;
// une NOUVELLE invocation est un nouvel essai — le harnais s'en accorde deux, et compte les jetons
// des deux : un dépassement a un coût même sans sortie.
console.error("passe 3 — revue réglementaire…");
const p3 = { ms: 0, totals: zero(), attempts: 0 };
let r3: Record<string, unknown> | undefined;
for (let attempt = 1; attempt <= 2 && !r3; attempt++) {
  p3.attempts = attempt;
  const res = await bench({
    phase: "report",
    docType: "rcp",
    productName: PRODUCT,
    sourceName: SOURCE_NAME,
    sourceText,
    lang: "fr",
    reportDate: REPORT_DATE,
    reportSections: flat.map((r) => {
      const row = rows.get(r.id)!;
      return {
        sectionId: r.id,
        title: row.title,
        status: row.status,
        ...(row.figuresAdvisory && row.ungrounded.length
          ? { figuresToVerify: row.ungrounded }
          : {}),
      };
    }),
  }).catch(
    (e: Error & { body?: Record<string, unknown> }) =>
      ({ ...(e.body ?? {}), error: e.message }) as Record<string, unknown>,
  );
  p3.ms += Number(res.ms ?? 0);
  if (res.totals) addTo(p3.totals, res.totals as Usage);
  if (res.error) {
    console.error(`  tentative ${attempt} : ${res.error}`);
    continue;
  }
  r3 = res;
}
if (!r3) {
  console.error(
    "ÉCHEC passe 3 : la revue a dépassé son délai deux fois — constat STRUCTUREL, " +
      "pas transitoire. Les états des passes 1–2 sont conservés dans --out pour re-tenter.",
  );
  Deno.exit(1);
}
console.error(
  `  revue : ${(p3.ms / 1000).toFixed(1)} s (${p3.attempts} tentative(s))`,
);

/* ───────────────────────── Assemblage des markdowns (conventions des références) ───────────── */
function sectionHeading(r: RubricSpec, title: string): string {
  if (r.id === "prescription") return `### ${title}`;
  if (r.id.includes("-")) return `**${title}**`;
  return r.id.includes(".")
    ? `#### ${r.id}. ${title}`
    : `### ${r.id}. ${title}`;
}

function assemble(lang: "fr" | "en"): string {
  const out: string[] = [];
  if (lang === "fr") {
    out.push(
      `# RCP ${PRODUCT} — version conforme au gabarit ABMed/UEMOA 2026`,
      "",
      `> **LIVRABLE.** Produit à partir du seul \`${SOURCE_NAME}\`, restructuré selon le gabarit`,
      `> RCP ABMed/UEMOA 2026. Aucune information n'y a été ajoutée depuis une connaissance générale`,
      `> du médicament, ni depuis un autre document du dossier.`,
      `>`,
      `> Pays de dépôt : ${COUNTRY} · Activité : ${ACTIVITY}.`,
      `> L'analyse et les recommandations figurent dans le **rapport séparé** — jamais dans ce document.`,
      "",
      "---",
      "",
      "## RÉSUMÉ DES CARACTÉRISTIQUES DU PRODUIT",
    );
  } else {
    out.push(
      `# ${PRODUCT} SmPC — English version`,
      "",
      `> **DELIVERABLE.** Companion to the French version, both produced from \`${SOURCE_NAME}\``,
      `> alone, restructured to the ABMed/UEMOA 2026 template. Section status is carried over,`,
      `> never recalculated: the same sections are marked as incomplete in both languages.`,
      `>`,
      `> Country of filing: ${COUNTRY} · Activity: ${ACTIVITY}.`,
      "",
      "---",
      "",
      "## SUMMARY OF PRODUCT CHARACTERISTICS",
    );
  }
  for (const r of flat) {
    const row = rows.get(r.id)!;
    const title = lang === "fr" ? row.title : EN_TITLES.get(r.id)!;
    out.push("", sectionHeading(r, title));
    if (isParent(r)) continue; // un conteneur n'a pas de corps : ses enfants suivent
    const content =
      lang === "fr"
        ? row.content
        : row.status === "missing" || row.content === MISSING_MARKER
          ? MISSING_MARKER_EN
          : en.get(r.id)!.content;
    out.push("", content);
  }
  out.push("");
  return out.join("\n");
}

/* ──────────────────────────────────────── Sorties ──────────────────────────────────────────── */
await Deno.mkdir(OUT, { recursive: true });
const slug = PRODUCT.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
const write = (name: string, text: string) =>
  Deno.writeTextFile(`${OUT}/${name}`, text);
await write("conforme-FR.md", assemble("fr"));
await write("conforme-EN.md", assemble("en"));
await write("rapport.md", String(r3.markdown));
await write(
  "run.json",
  JSON.stringify(
    {
      slug,
      product: PRODUCT,
      sourceName: SOURCE_NAME,
      country: COUNTRY,
      activity: ACTIVITY,
      reportLang: "fr",
      reportHeader: `${PRODUCT} — Revue réglementaire`,
      reportDate: REPORT_DATE,
    },
    null,
    2,
  ) + "\n",
);

const total = zero();
addTo(total, p1.totals);
addTo(total, p2.totals);
addTo(total, p3.totals);
const calls1 = flat.length;
const calls2 = toTranslate.length;
const grand = {
  ms: p1.ms + p2.ms + p3.ms,
  cost: costOf(p1.totals) + costOf(p2.totals) + costOf(p3.totals),
};

const fmt = (n: number) => n.toLocaleString("en-US");
const line = (label: string, calls: number, m: PhaseMeasure | typeof p3) =>
  `| ${label} | ${calls} | ${(m.ms / 1000).toFixed(1)} s | ${fmt(m.totals.in)} | ${fmt(
    m.totals.cacheRead,
  )} | ${fmt(m.totals.cacheWrite)} | ${fmt(m.totals.out)} | ${costOf(m.totals).toFixed(3)} $ |`;

const statuses = [...rows.values()].reduce<Record<string, number>>((a, s) => {
  a[s.status] = (a[s.status] ?? 0) + 1;
  return a;
}, {});
const mesures = [
  `# Mesures — ${PRODUCT} (${SOURCE_NAME})`,
  "",
  `Banc Edge (production), Claude Opus 5, vagues de ${WAVE}, le ${REPORT_DATE}.`,
  `Durées = somme des vagues côté serveur (les invocations s'enchaînent depuis le poste).`,
  "",
  "| Passe | Appels | Durée | Jetons entrée | dont lus (0,1×) | dont écrits (1,25×) | Sortie | Coût |",
  "|---|---|---|---|---|---|---|---|",
  line("1 — conformité FR", calls1, p1),
  line("2 — traduction EN", calls2, p2),
  line("3 — revue", p3.attempts, p3),
  `| **Total** | **${calls1 + calls2 + 1}** | **${(grand.ms / 1000).toFixed(1)} s** | **${fmt(
    total.in,
  )}** | **${fmt(total.cacheRead)}** | **${fmt(total.cacheWrite)}** | **${fmt(total.out)}** | **${grand.cost.toFixed(
    3,
  )} $** |`,
  "",
  `Statuts passe 1 : ${Object.entries(statuses)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ")}.`,
  `Traductions refusées (contenu source conservé) : ${
    [...en.values()].filter((e) => !e.translated).length
  }.`,
  `Constats écartés par le contrôle d'ancrage de la revue : ${
    (r3.droppedClaims as string[]).length
  }.`,
  "",
  "## Détail par rubrique (passe 1)",
  "",
  "| Rubrique | Statut | Verdict | Tentatives | Durée | Coût |",
  "|---|---|---|---|---|---|",
  ...flat.map((r) => {
    const s = rows.get(r.id)!;
    return `| ${s.sectionId} | ${s.status} | ${s.verdict ?? ""} | ${s.attempts ?? ""} | ${(
      s.ms / 1000
    ).toFixed(1)} s | ${costOf(s.usage).toFixed(4)} $ |`;
  }),
  "",
].join("\n");
await write("MESURES.md", mesures);

console.error("");
console.error(mesures.split("\n").slice(0, 14).join("\n"));
console.error("");
console.error(`écrit dans ${OUT} — rendu des 5 fichiers :`);
console.error(`  cd web && UPGRADE_RUN_DIR=${OUT} npm run deliverables:run`);
