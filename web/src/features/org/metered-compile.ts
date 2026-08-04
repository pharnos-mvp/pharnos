import type { CompileGate } from './use-org-plan'

/**
 * Orchestration du métrage d'une compilation — PURE, sans dépendance réseau ni React.
 *
 * L'ordre des trois temps EST la règle métier (audit du 2026-08-03, `docs/PLAN-CTD-BUILDER.md`
 * §5.2.5), et c'est pour pouvoir le prouver qu'il vit ici plutôt que dans le corps de la page :
 *
 *   1. `preflight` — lecture seule. Refuser tôt, avant de faire fabriquer un PDF de plusieurs
 *      dizaines de Mo à quelqu'un qui est déjà au plafond.
 *   2. `compile` — la fabrication. Si elle lève, l'exception remonte **avant** tout décompte :
 *      aucun crédit n'est brûlé sans livrable.
 *   3. `record` — l'enregistrement au registre serveur, seule autorité. Un refus ici est la
 *      course rare où le quota s'est épuisé pendant la fabrication : rien n'est facturé, et rien
 *      n'est livré.
 *
 * `metered: false` (hors ligne, ou backend non configuré) court-circuite les deux appels : la
 * compilation a lieu et n'est comptée nulle part. Ce trou est assumé et documenté — sa fermeture
 * est l'autorisation préalable par bons signés du lot licence, pas une réconciliation a posteriori.
 *
 * La même forme servira au CTD Builder autonome : `preflight`/`record` y deviendront la
 * vérification et la consommation d'un bon Ed25519, sans que l'ordre change.
 */
export interface MeteredCompileSteps<T> {
  /** Le métrage est-il joignable ? Faux hors ligne ou sans backend configuré. */
  metered: boolean
  preflight: () => Promise<CompileGate>
  compile: () => Promise<T>
  /** Reçoit ce qui vient d'être fabriqué : c'est de LUI que se tire l'empreinte du paquet. */
  record: (produced: T) => Promise<CompileGate>
}

/**
 * Empreinte des octets livrés — l'identité du paquet, et rien d'autre.
 *
 * Elle existe pour ne jamais faire payer deux fois la même chose : mêmes octets déjà facturés =
 * récupération, gratuite pour toujours (§5.2.3 — on limite la création, jamais la récupération).
 * Elle n'autorise rien : la forger ne donne accès à aucun paquet qu'on n'ait déjà en main.
 *
 * `crypto.subtle` est une API du navigateur, pas une sortie réseau — cette fonction reste donc
 * utilisable telle quelle dans l'édition autonome du builder.
 */
export async function packageFingerprint(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  // `digest` accepte directement une vue typée et en respecte l'offset et la longueur. Passer
  // `bytes.buffer` serait faux (une vue partielle hacherait tout le buffer sous-jacent), et
  // recopier serait ruineux : un CTD compilé pèse des dizaines de Mo.
  // Le cast ne contourne qu'une subtilité de typage (`Uint8Array<ArrayBufferLike>` couvre aussi
  // `SharedArrayBuffer`, qui n'existe nulle part ici) ; `digest` accepte toute vue à l'exécution.
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type MeteredCompileOutcome<T> =
  | { ok: true; value: T; gate?: CompileGate }
  | { ok: false; gate: CompileGate }

export async function runMeteredCompile<T>({
  metered,
  preflight,
  compile,
  record,
}: MeteredCompileSteps<T>): Promise<MeteredCompileOutcome<T>> {
  if (metered) {
    const pre = await preflight()
    if (!pre.allowed) return { ok: false, gate: pre }
  }
  // Volontairement hors try/catch : une fabrication qui échoue doit remonter telle quelle à
  // l'appelant, et surtout ne jamais atteindre `record`.
  const value = await compile()
  if (!metered) return { ok: true, value }
  const gate = await record(value)
  if (!gate.allowed) return { ok: false, gate }
  return { ok: true, value, gate }
}
