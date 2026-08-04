import { useCallback, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { ArborescenceTree } from '@/features/workspace/ArborescenceTree'
import {
  COUNTRIES,
  REG_ACTIVITIES,
  activityLabel,
  countryFlag,
  countryLabel,
} from '@/features/workspace/dossier-constants'
import { createDossier, getDossier, listDossiers } from '@/features/workspace/dossier-repository'
import type { CtdNodeDef } from '@/features/workspace/module1-tree'
import { LOCAL_WORKSPACE_ID } from './local-workspace'

/**
 * Le montage de dossier du CTD Builder autonome (lot B1).
 *
 * Tout ce qui suit s'exécute sur le poste : `dossier-repository` écrit dans IndexedDB, et
 * l'arborescence du Module 1 est calculée en local depuis le référentiel embarqué. Aucun de ces
 * modules ne parle au réseau — ce n'est pas une intention, c'est vérifié à chaque build par
 * `src/builder/isolation.ts`.
 *
 * ⚠️ Ces trois vues sont pilotées par un ÉTAT, pas par une route. Le tableau de bord et sa
 * navigation sont le lot B4 ; poser un routeur maintenant reviendrait à figer une arborescence
 * d'écrans avant d'avoir décidé laquelle. Coût assumé et connu : pas de retour arrière du
 * navigateur, pas de lien profond.
 */

type View = { kind: 'liste' } | { kind: 'nouveau' } | { kind: 'dossier'; id: string }

/**
 * Le titre de la vue prend le focus dès qu'il est attaché.
 *
 * Sans ceci, changer d'écran démonte le bouton qui portait le focus : celui-ci retombe sur
 * `<body>`, et un lecteur d'écran n'annonce RIEN — ni le changement d'écran, ni le nouveau titre.
 * C'est ce qu'un routeur aurait apporté et que la navigation par état ne donne pas gratuitement.
 * Sur un outil dont l'écran principal est un arbre à navigation clavier, l'oubli coûte cher.
 *
 * ⚠️ Une ref de RAPPEL, et non un `useEffect` sur une ref classique. La différence n'est pas
 * stylistique : la vue d'un dossier affiche « Lecture du dossier… » pendant que Dexie répond, donc
 * le `<h1>` n'existe PAS encore au montage. Un effet à dépendances vides tirerait sur une ref
 * nulle et ne repasserait jamais — mesuré : le focus retombait sur `<body>`. Le rappel se
 * déclenche quand l'élément est réellement attaché, et une seule fois.
 */
function useTitreFocus() {
  const fait = useRef(false)
  return useCallback((el: HTMLHeadingElement | null) => {
    if (el && !fait.current) {
      fait.current = true
      el.focus()
    }
  }, [])
}

/** L'arborescence n'est pas encore un contenant : zéro est la vérité, pas un bouchon. */
const AUCUN_DOCUMENT = () => 0

/** Date lisible sans dépendance : « 4 août 2026, 03:12 ». */
function whenLabel(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const FIELD =
  'border-border bg-background text-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none'
const LABEL = 'text-foreground block text-sm font-medium'

function NouveauDossier({
  onCree,
  onAnnule,
}: {
  onCree: (id: string) => void
  onAnnule: () => void
}) {
  const [nom, setNom] = useState('')
  const [pays, setPays] = useState('BJ')
  const [activite, setActivite] = useState('new_ma')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const titre = useTitreFocus()

  const nomValide = nom.trim().length > 0

  async function soumettre(e: React.FormEvent) {
    e.preventDefault()
    if (!nomValide || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      // `productId` : le builder n'a pas de catalogue produit (lot B1, catalogue minimal à venir).
      // Le dossier porte donc son propre identifiant de produit, stable pour lui seul.
      const dossier = await createDossier(LOCAL_WORKSPACE_ID, {
        productId: crypto.randomUUID(),
        productName: nom.trim(),
        format: 'ctd',
        activity: activite,
        country: pays,
      })
      onCree(dossier.id)
    } catch (err) {
      console.error(err)
      setErreur(
        "Le dossier n'a pas pu être créé sur ce poste. Si votre navigateur est en navigation privée, le stockage local est parfois désactivé.",
      )
      setEnCours(false)
    }
  }

  return (
    <form onSubmit={(e) => void soumettre(e)} className="max-w-xl">
      <h1
        ref={titre}
        tabIndex={-1}
        className="font-display text-2xl font-semibold tracking-tight outline-none"
      >
        Nouveau dossier
      </h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Le pays détermine l'arborescence du Module 1 — c'est le seul module du CTD qui varie dans
        l'UEMOA.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="nom" className={LABEL}>
            Nom du produit
          </label>
          <input
            id="nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Amoxicilline 500 mg"
            autoComplete="off"
            className={`${FIELD} mt-1.5`}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="pays" className={LABEL}>
              Pays de dépôt
            </label>
            <select
              id="pays"
              value={pays}
              onChange={(e) => setPays(e.target.value)}
              className={`${FIELD} mt-1.5`}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="activite" className={LABEL}>
              Opération
            </label>
            <select
              id="activite"
              value={activite}
              onChange={(e) => setActivite(e.target.value)}
              className={`${FIELD} mt-1.5`}
            >
              {REG_ACTIVITIES.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Région live montée en permanence : une région insérée EN MÊME TEMPS que son contenu
          n'est pas annoncée par les lecteurs d'écran. */}
      <div role="status" aria-live="polite" className="mt-4 empty:hidden">
        {erreur && (
          <p className="border-danger-subtle bg-danger-subtle text-danger-subtle-foreground rounded-lg border p-3 text-sm leading-relaxed">
            {erreur}
          </p>
        )}
      </div>

      <div className="mt-7 flex items-center gap-3">
        <button
          type="submit"
          disabled={!nomValide || enCours}
          className="bg-primary text-primary-foreground ring-offset-background focus-visible:ring-ring rounded-lg px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
        >
          {enCours ? 'Création…' : 'Créer le dossier'}
        </button>
        <button
          type="button"
          onClick={onAnnule}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-lg px-2 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}

function ListeDossiers({
  onNouveau,
  onOuvrir,
}: {
  onNouveau: () => void
  onOuvrir: (id: string) => void
}) {
  const dossiers = useLiveQuery(() => listDossiers(LOCAL_WORKSPACE_ID), [])
  const titre = useTitreFocus()

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          ref={titre}
          tabIndex={-1}
          className="font-display text-2xl font-semibold tracking-tight outline-none"
        >
          Vos dossiers
        </h1>
        <button
          type="button"
          onClick={onNouveau}
          className="bg-primary text-primary-foreground ring-offset-background focus-visible:ring-ring rounded-lg px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          + Nouveau dossier
        </button>
      </div>

      {dossiers === undefined ? (
        <p className="text-muted-foreground mt-8 text-sm">Lecture du poste…</p>
      ) : dossiers.length === 0 ? (
        <div className="border-border mt-8 rounded-xl border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">Aucun dossier sur ce poste.</p>
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
            Choisissez un pays de dépôt : l'arborescence du Module 1 se construit selon les
            exigences de ce pays, et vous n'avez plus qu'à ranger vos pièces.
          </p>
        </div>
      ) : (
        <ul className="divide-border border-border mt-6 divide-y overflow-hidden rounded-xl border">
          {dossiers.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onOuvrir(d.id)}
                className="hover:bg-card focus-visible:ring-ring flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:-outline-offset-2"
              >
                <span className="min-w-0">
                  <span className="text-foreground text-sm font-medium">{d.productName}</span>
                  <span className="text-muted-foreground ml-2 text-sm">
                    {countryFlag(d.country)} {countryLabel(d.country)} · {activityLabel(d.activity)}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  modifié le {whenLabel(d.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VueDossier({ id, onRetour }: { id: string; onRetour: () => void }) {
  // ⚠️ `getDossier` rend `undefined` quand le dossier n'existe pas, et `useLiveQuery` rend
  // `undefined` pendant la lecture : sans cette normalisation, « en cours de lecture » et
  // « disparu » sont la MÊME valeur. L'écran restait alors sur « Lecture du dossier… » à jamais,
  // sans issue, si le dossier était supprimé dans un second onglet.
  const dossier = useLiveQuery(async () => (await getDossier(id)) ?? null, [id])
  const [selection, setSelection] = useState<string | null>(null)
  const titre = useTitreFocus()

  if (dossier === undefined) {
    return <p className="text-muted-foreground text-sm">Lecture du dossier…</p>
  }
  if (dossier === null) {
    return (
      <div>
        <p className="text-foreground text-sm">Ce dossier n'existe plus sur ce poste.</p>
        <button
          type="button"
          onClick={onRetour}
          className="text-muted-foreground hover:text-foreground mt-3 text-sm underline"
        >
          Revenir à la liste
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={onRetour}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 rounded px-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        ← Vos dossiers
      </button>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1
          ref={titre}
          tabIndex={-1}
          className="font-display text-2xl font-semibold tracking-tight outline-none"
        >
          {dossier.productName}
        </h1>
        <span className="text-muted-foreground text-sm">
          {countryFlag(dossier.country)} {countryLabel(dossier.country)} ·{' '}
          {activityLabel(dossier.activity)} · CTD Module 1
        </span>
      </div>

      <section aria-labelledby="arborescence" className="mt-6">
        <h2 id="arborescence" className="sr-only">
          Arborescence du Module 1
        </h2>
        <div className="border-border bg-card rounded-xl border p-2">
          <ArborescenceTree
            tree={dossier.tree as CtdNodeDef[]}
            selectedId={selection}
            onSelect={(n) => setSelection(n.id ?? null)}
            docCount={AUCUN_DOCUMENT}
            editing={false}
            onChange={() => {}}
          />
        </div>
      </section>
    </div>
  )
}

export function BuilderWorkspace() {
  const [vue, setVue] = useState<View>({ kind: 'liste' })

  if (vue.kind === 'nouveau') {
    return (
      <NouveauDossier
        onCree={(id) => setVue({ kind: 'dossier', id })}
        onAnnule={() => setVue({ kind: 'liste' })}
      />
    )
  }
  if (vue.kind === 'dossier') {
    // `key` : sans elle, passer d'un dossier à l'autre (lot B4) hériterait de la sélection
    // et de l'état de pliage du précédent.
    return <VueDossier key={vue.id} id={vue.id} onRetour={() => setVue({ kind: 'liste' })} />
  }
  return (
    <ListeDossiers
      onNouveau={() => setVue({ kind: 'nouveau' })}
      onOuvrir={(id) => setVue({ kind: 'dossier', id })}
    />
  )
}
