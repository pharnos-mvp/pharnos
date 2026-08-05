/**
 * `app.pharnos.com/u/{token}` — tout l'après-paiement, pour un acheteur SANS COMPTE.
 *
 * Patron : celui de `/r/{token}` (`App.tsx`), qui tourne en production. Aucune authentification,
 * aucune organisation, aucune synchronisation hors ligne — la possession du jeton EST
 * l'autorisation, et elle est vérifiée par les Edge Functions, jamais ici.
 *
 * ⚠️ **Le navigateur ne calcule aucun droit.** Il affiche un verdict rendu par le serveur : le
 * nombre de dépôts restants, la recevabilité, l'avancement. Cette page n'accorde rien, ne débite
 * rien, et ne sait pas ce qui a été payé.
 *
 * Ce qu'elle fait, en revanche, personne d'autre ne peut le faire : **lire le PDF**. Le corpus de
 * contrôle sort d'ici (`prepareUpgradeSource`, couche texte sinon reconnaissance de caractères) —
 * c'est le second lecteur, indépendant du modèle, sans lequel la vérification des citations ne
 * vérifierait rien.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, FileText, Info, Loader2, Upload } from 'lucide-react'

import { LangSwitch } from '@/components/layout/LangSwitch'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import {
  ControlCorpusTooLargeError,
  prepareUpgradeSource,
  type PreparePhase,
  type PreparedUpgradeSource,
} from '@/lib/ocr/prepare-source'
import { cn } from '@/lib/utils'
import {
  demanderSource,
  demanderUrlDepot,
  franchirPorte,
  lireStatut,
  telechargerSource,
  televerserAvecReprises,
  UpgradeApiError,
} from './upgrade-api'
import {
  DOC_TYPES,
  doitChercherSource,
  doitSonder,
  estDocType,
  resteEstimeS,
  SONDAGE_MS,
  validerFichierSource,
  vueDepuis,
  type DocType,
  type ResumeCommande,
} from './upgrade-flow'

const LIBELLES_DOC: Record<DocType, { fr: string; en: string }> = {
  rcp: { fr: 'RCP (Résumé des Caractéristiques du Produit)', en: 'SmPC' },
  notice: { fr: 'Notice patient', en: 'Package leaflet' },
  labeling: { fr: 'Étiquetage', en: 'Labelling' },
}

/** Ce que la page FAIT en propre, par opposition à ce que le serveur fait pour elle. */
type Travail =
  | { quoi: 'repos' }
  /** Récupération du document déjà déposé depuis l'autre origine. */
  | { quoi: 'source' }
  /** Lecture du PDF, dans cet onglet — c'est la phase qu'il ne faut pas interrompre. */
  | { quoi: 'lecture'; phase: PreparePhase; ratio: number }
  | { quoi: 'envoi' }
  | { quoi: 'porte' }

/**
 * L'accès à la commande, distingué de son CONTENU.
 *
 * ⚠️ « Je n'ai pas de données » n'est PAS « votre lien est mort ». Sans cette distinction, une
 * coupure 3G, un 503 ou un 429 — `order-status` compte par IP, et les opérateurs mobiles de la
 * région font du CGNAT derrière une poignée d'adresses — affichait « Ce lien n'est plus valable »
 * à quelqu'un qui venait de payer 19 000 F.
 */
type Acces = 'inconnu' | 'ok' | 'invalide' | 'injoignable'

export function PublicUpgradePage({ token }: { token: string }) {
  const { t, lang } = useI18n()
  const [resume, setResume] = useState<ResumeCommande | null>(null)
  const [acces, setAcces] = useState<Acces>('inconnu')
  const [chargement, setChargement] = useState(true)
  const [travail, setTravail] = useState<Travail>({ quoi: 'repos' })
  /** Refus de recevabilité — le message du SERVEUR s'affiche tel quel : il dit ce qui n'a pas été débité. */
  const [refus, setRefus] = useState<Message | null>(null)
  /** Ce qui mérite d'être dit sans empêcher d'avancer (document tronqué, lecture partielle). */
  const [avis, setAvis] = useState<Message | null>(null)
  /** La lecture du PDF a échoué : l'écran doit rouvrir le dépôt, pas laisser tourner un sablier. */
  const [echecLecture, setEchecLecture] = useState(false)
  const [docType, setDocType] = useState<DocType>('rcp')
  /** L'acheteur a-t-il choisi son type de document lui-même ? Alors le serveur ne l'écrase plus. */
  const choixManuel = useRef(false)
  /**
   * Garde de réentrance NON RÉACTIVE. Un second onglet, un `StrictMode` de développement ou un
   * changement de langue lançaient une deuxième préparation en parallèle : deux moteurs de
   * reconnaissance sur le même téléphone, deux barres qui se disputent, puis deux `franchirPorte`
   * dont le second reçoit 409 — et l'écran annonçait « ce dépôt a été refusé » alors que le
   * traitement venait de démarrer normalement.
   */
  const enVol = useRef(false)

  const rafraichir = useCallback(async (): Promise<ResumeCommande | null> => {
    try {
      const r = (await lireStatut(token)) as ResumeCommande
      setResume(r)
      setAcces('ok')
      // ⚠️ Ne JAMAIS écraser un choix de l'acheteur. Après un refus, `orders.doc_type` porte encore
      // le type du dépôt précédent : le réappliquer effacerait en silence la correction que
      // l'acheteur vient de faire, et le dépôt suivant serait jugé contre le même mauvais gabarit.
      if (!choixManuel.current && estDocType(r.docType)) setDocType(r.docType)
      return r
    } catch (e) {
      const mort = e instanceof UpgradeApiError && e.raison === 'lien_invalide'
      // ⚠️ Un lien invalide EFFACE le résumé : garder l'ancien afficherait un écran de suivi
      // rassurant sur une commande à laquelle on n'a plus accès. Une panne, elle, n'efface RIEN.
      if (mort) setResume(null)
      setAcces(mort ? 'invalide' : 'injoignable')
      return null
    }
  }, [token])

  const vue = vueDepuis(resume, {
    preparationEnCours: travail.quoi !== 'repos',
    echecLecture,
  })

  // Sondage — uniquement pendant le traitement. Sonder un état stable, c'est ~150 requêtes par
  // onglet oublié sur une surface publique.
  //
  // ⚠️ La dépendance est `vue.etape`, PAS `vue` : `vueDepuis` rend un objet neuf à chaque rendu,
  // donc dépendre de lui ferait démonter et remonter l'intervalle à chaque rendu — y compris ceux
  // qui n'ont rien à voir avec l'avancement. Le minuteur repartirait de zéro à chaque fois et,
  // sous une cascade de rendus, il ne se déclencherait jamais : la barre de progression resterait
  // figée sur une commande qui, elle, avance.
  const sonder = doitSonder(vue)
  useEffect(() => {
    if (!sonder) return
    const id = setInterval(() => void rafraichir(), SONDAGE_MS)
    return () => clearInterval(id)
  }, [sonder, rafraichir])

  /**
   * Lit le PDF — c'est ce que le navigateur seul sait faire, et c'est ce qui décide de tout.
   *
   * ⚠️ Rend `null` sur échec, après avoir posé `echecLecture` : l'écran rouvre alors le dépôt au
   * lieu de laisser tourner un sablier que rien ne vient arrêter.
   */
  const lireLeDocument = useCallback(
    async (donnees: ArrayBuffer): Promise<PreparedUpgradeSource | null> => {
      try {
        setTravail({ quoi: 'lecture', phase: 'reading', ratio: 0 })
        const prep = await prepareUpgradeSource(donnees, {
          onPhase: (phase) => setTravail({ quoi: 'lecture', phase, ratio: 0 }),
          onProgress: (ratio) => setTravail((v) => (v.quoi === 'lecture' ? { ...v, ratio } : v)),
        })
        if (prep.truncated) setAvis('tronque')
        return prep
      } catch (e) {
        // ⚠️ On NOMME la cause. « Texte source requis » ferait passer un défaut de fichier pour une
        // panne de notre service, sur une page où l'acheteur a déjà payé.
        setRefus(e instanceof ControlCorpusTooLargeError ? 'trop_volumineux' : 'illisible')
        setEchecLecture(true)
        return null
      }
    },
    [],
  )

  /** Franchit la porte de recevabilité. Le `jobId` désigne le dépôt : le serveur seul le donne. */
  const franchir = useCallback(
    async (prep: PreparedUpgradeSource, jobId: string) => {
      try {
        setTravail({ quoi: 'porte' })
        const verdict = await franchirPorte(token, jobId, prep.controlText, prep.sourceKind)
        // Un refus revient en 200 : la commande est intacte, et le message du serveur dit
        // lui-même que rien n'a été débité. On l'affiche tel quel plutôt que de le reformuler.
        setRefus(verdict.status === 'refused' ? { serveur: verdict.message ?? '' } : null)
      } catch (e) {
        // ⚠️ `already_running` arrive en 409, donc en exception : c'est le cas NOMINAL de deux
        // onglets ouverts sur la même commande. L'annoncer « refusé » ferait croire à un rejet
        // alors que le traitement vient de démarrer.
        setRefus(estDejaLance(e) ? null : cleErreur(e))
      } finally {
        setTravail({ quoi: 'repos' })
        await rafraichir()
      }
    },
    [token, rafraichir],
  )

  /** Le document que le pont a déjà téléversé depuis `pharnos.com`. */
  const reprendreDepuisServeur = useCallback(async () => {
    if (enVol.current) return
    enVol.current = true
    setTravail({ quoi: 'source' })
    setChargement(false)
    try {
      const src = await demanderSource(token)
      const donnees = await telechargerSource(src.url)
      if (!choixManuel.current && estDocType(src.docType)) setDocType(src.docType)
      const prep = await lireLeDocument(donnees)
      if (prep) await franchir(prep, src.jobId)
      else await rafraichir()
    } catch (e) {
      // ⚠️ Trois situations OPPOSÉES arrivaient ici ensemble. `no_source`, `source_absente`,
      // `gated_out` et `already_started` sont nominaux : on relit l'état et `vueDepuis` choisit
      // l'écran. Une panne réseau ou un 429, en revanche, ne disent RIEN de la commande — et
      // proposer un écran de dépôt à quelqu'un dont le document est déjà chez nous, c'est
      // l'inviter à brûler un dépôt sur trois pour un incident qui n'est pas le sien.
      if (e instanceof UpgradeApiError && e.raison === 'refus') setRefus(null)
      else setAcces('injoignable')
    } finally {
      setTravail({ quoi: 'repos' })
      enVol.current = false
      await rafraichir()
    }
  }, [token, lireLeDocument, franchir, rafraichir])

  // Séquence d'ouverture, en UN seul effet : lire l'état, puis — et seulement si le document ne
  // peut pas être un document REFUSÉ — demander au serveur s'il en détient déjà un.
  //
  // ⚠️ `chargement` ne tombe qu'une fois la branche connue. Le faire tomber dès la lecture de
  // l'état ferait clignoter l'écran de dépôt juste avant celui de la préparation — et sur une page
  // atteinte après un paiement, « déposez votre document » qui apparaît puis disparaît se lit comme
  // un bogue, ou pire, comme un document perdu.
  useEffect(() => {
    let vivant = true
    // Aucun `setState` synchrone dans le corps de l'effet : tout est posé après un `await`.
    void (async () => {
      const r = await rafraichir()
      if (!vivant) return
      if (doitChercherSource(r)) await reprendreDepuisServeur()
      else setChargement(false)
    })()
    return () => {
      vivant = false
    }
  }, [rafraichir, reprendreDepuisServeur])

  /** Le document que l'acheteur choisit ICI — parce qu'il a fermé l'onglet, ou qu'il redépose. */
  const deposer = useCallback(
    async (fichier: File) => {
      if (enVol.current) return
      enVol.current = true
      setRefus(null)
      setAvis(null)
      setEchecLecture(false)
      try {
        const invalide = validerFichierSource(fichier)
        if (invalide) {
          setRefus(invalide === 'taille' ? 'trop_gros' : 'pdf_seulement')
          return
        }

        let donnees: ArrayBuffer
        try {
          donnees = await fichier.arrayBuffer()
        } catch {
          setRefus('fichier_inaccessible')
          return
        }

        // ⚠️ ON LIT LE PDF AVANT DE DEMANDER L'URL DE DÉPÔT, et l'ordre EST la décision.
        //
        // C'est `order-upload-url` qui consomme un dépôt sur les trois, par compare-and-swap. Lire
        // d'abord, c'est refuser gratuitement un PDF chiffré, corrompu ou vide de couche texte —
        // exactement les fichiers qui échouent. Dans l'autre ordre, chacun de ces trois cas prenait
        // une tentative sur une commande déjà payée, et trois essais suffisaient à la verrouiller.
        //
        // (Copier les octets — `arrayBuffer()` — ne juge RIEN : ce n'est pas « lire le PDF ».)
        const prep = await lireLeDocument(donnees)
        if (!prep) return

        setTravail({ quoi: 'envoi' })
        const depot = await demanderUrlDepot(token, fichier.size, docType)
        await televerserAvecReprises(depot.uploadUrl, depot.uploadToken, fichier)
        await franchir(prep, depot.jobId)
      } catch (e) {
        setRefus(cleErreur(e))
      } finally {
        setTravail({ quoi: 'repos' })
        enVol.current = false
        await rafraichir()
      }
    },
    [token, docType, lireLeDocument, franchir, rafraichir],
  )

  /** La reprise manuelle — le seul bouton de cette page qui ne dépend d'aucun état serveur. */
  const reessayer = useCallback(async () => {
    setAcces('inconnu')
    setChargement(true)
    const r = await rafraichir()
    if (doitChercherSource(r)) await reprendreDepuisServeur()
    else setChargement(false)
  }, [rafraichir, reprendreDepuisServeur])

  if (chargement) {
    return (
      <Cadre>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {t({ fr: 'Chargement de votre commande…', en: 'Loading your order…' })}
        </div>
      </Cadre>
    )
  }

  // ⚠️ « Je n'ai pas pu joindre le serveur » N'EST PAS « votre lien est mort ». Une coupure 3G, un
  // 503 ou un 429 — `order-status` compte par IP, et les opérateurs de la région partagent les
  // leurs — affichaient à quelqu'un qui venait de payer que sa commande n'existait plus.
  if (acces === 'injoignable' && !resume) {
    return (
      <Cadre>
        <Titre
          icone={<CircleAlert className="text-muted-foreground size-5" />}
          titre={t({ fr: 'Connexion perdue', en: 'Connection lost' })}
        />
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Nous n’arrivons pas à joindre nos serveurs. Votre commande et votre lien sont intacts — ce lien reste valable 30 jours.',
            en: 'We cannot reach our servers. Your order and your link are intact — this link stays valid for 30 days.',
          })}
        </p>
        <Button type="button" onClick={() => void reessayer()} className="w-full">
          {t({ fr: 'Réessayer', en: 'Try again' })}
        </Button>
      </Cadre>
    )
  }

  if (vue.etape === 'expire') {
    return (
      <Cadre>
        <Titre
          icone={<CircleAlert className="text-destructive size-5" />}
          titre={t({ fr: 'Ce lien n’est plus valable', en: 'This link is no longer valid' })}
        />
        <p className="text-muted-foreground text-sm">
          {t({
            fr: 'Un lien de livraison reste ouvert 30 jours. Écrivez-nous à contact@pharnos.com avec votre référence de commande : elle, elle ne se perd pas.',
            en: 'A delivery link stays open for 30 days. Write to contact@pharnos.com with your order reference — that one does not expire.',
          })}
        </p>
      </Cadre>
    )
  }

  const dire = (m: Message): string => (typeof m === 'string' ? t(MESSAGES[m]) : m.serveur)

  return (
    <Cadre>
      <Titre
        icone={<FileText className="text-primary size-5" />}
        titre={t({ fr: 'Mise à niveau documentaire', en: 'Document upgrade' })}
        sousTitre={t(LIBELLES_DOC[docType])}
      />

      {avis && <Encart ton="avis">{dire(avis)}</Encart>}
      {refus && <Encart ton="refus">{dire(refus)}</Encart>}

      {vue.etape === 'depot' && (
        <EcranDepot
          resume={resume}
          docType={docType}
          onDocType={(d) => {
            choixManuel.current = true
            setDocType(d)
          }}
          onFichier={(f) => void deposer(f)}
        />
      )}

      {vue.etape === 'preparation' && <EcranPreparation travail={travail} />}

      {vue.etape === 'traitement' && <EcranTraitement resume={resume} vue={vue} />}

      {vue.etape === 'livraison' && <EcranLivraison resume={resume} lang={lang} />}

      {vue.etape === 'panne' && (
        <>
          <Encart ton="refus">
            {t({
              fr: 'Le traitement s’est arrêté et ne reprendra pas seul. Votre commande reste ouverte : écrivez-nous à contact@pharnos.com, nous la relançons sans nouveau paiement.',
              en: 'Processing stopped and will not resume on its own. Your order stays open: write to contact@pharnos.com and we restart it at no extra cost.',
            })}
          </Encart>
          {resume?.erreur && (
            <p className="text-muted-foreground font-mono text-xs">{resume.erreur}</p>
          )}
        </>
      )}
    </Cadre>
  )
}

/* ───────────────────────────────────────── Les écrans ──────────────────────────────────────── */

function EcranDepot({
  resume,
  docType,
  onDocType,
  onFichier,
}: {
  resume: ResumeCommande | null
  docType: DocType
  onDocType: (d: DocType) => void
  onFichier: (f: File) => void
}) {
  const { t } = useI18n()
  const champ = useRef<HTMLInputElement>(null)
  const restants = resume?.depositsLeft ?? 0
  const epuise = restants <= 0

  if (epuise) {
    return (
      <Encart ton="refus">
        {t({
          fr: 'Trois dépôts ont été faits sur cette commande. Elle reste ouverte : envoyez-nous le document à contact@pharnos.com avec votre référence, nous prenons la suite — sans nouveau paiement.',
          en: 'Three uploads have been made on this order. It stays open: send us the document at contact@pharnos.com with your reference and we take it from there — at no extra cost.',
        })}
      </Encart>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {t({
          fr: 'Déposez le document à mettre au standard. Il reste sur nos serveurs 30 jours, puis il est effacé.',
          en: 'Upload the document to bring up to standard. It stays on our servers for 30 days, then it is deleted.',
        })}
      </p>

      <label className="block space-y-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          {t({ fr: 'Type de document', en: 'Document type' })}
        </span>
        <select
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          value={docType}
          onChange={(e) => {
            if (estDocType(e.target.value)) onDocType(e.target.value)
          }}
        >
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>
              {t(LIBELLES_DOC[d])}
            </option>
          ))}
        </select>
      </label>

      <input
        ref={champ}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          // Le champ se vide APRÈS lecture : sans cela, redéposer le même fichier après un refus
          // n'émettrait aucun `change` et le bouton paraîtrait mort.
          e.target.value = ''
          if (f) onFichier(f)
        }}
      />
      <Button type="button" className="w-full" onClick={() => champ.current?.click()}>
        <Upload className="size-4" />
        {t({ fr: 'Choisir mon document (PDF)', en: 'Choose my document (PDF)' })}
      </Button>

      <p className="text-muted-foreground text-xs">
        {t({
          fr: `PDF, 25 Mo au plus. Les documents scannés sont acceptés — nous les lisons page par page. ${restants} dépôt${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''} sur cette commande.`,
          en: `PDF, 25 MB max. Scanned documents are accepted — we read them page by page. ${restants} upload${restants > 1 ? 's' : ''} left on this order.`,
        })}
      </p>
    </div>
  )
}

function EcranPreparation({ travail }: { travail: Travail }) {
  const { t } = useI18n()
  // ⚠️ Nommer la cause AVANT l'attente. Une reconnaissance de caractères prend plusieurs secondes
  // par page ; muette, elle passe pour une panne.
  const texte =
    travail.quoi === 'source'
      ? t({ fr: 'Récupération de votre document…', en: 'Fetching your document…' })
      : travail.quoi === 'envoi'
        ? t({ fr: 'Envoi de votre document…', en: 'Uploading your document…' })
        : travail.quoi === 'porte'
          ? t({ fr: 'Vérification du document…', en: 'Checking the document…' })
          : travail.quoi === 'lecture' && travail.phase === 'recognizing'
            ? // ⚠️ Ne JAMAIS écrire « aucun texte n'est enregistré dans ce fichier » : ce serait
              // affirmer un fait sur le fichier du client, alors que la bascule peut venir d'une
              // couche de texte pauvre ou de pages mixtes.
              t({
                fr: 'Aucun texte exploitable dans ce PDF : nous le lisons page par page. Cela prend un moment.',
                en: 'No usable text layer in this PDF: we are reading it page by page. This takes a moment.',
              })
            : t({ fr: 'Lecture de votre document…', en: 'Reading your document…' })

  const ratio = travail.quoi === 'lecture' ? travail.ratio : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="text-primary size-4 animate-spin" />
        {texte}
      </div>
      <Barre ratio={ratio} />
      <p className="text-muted-foreground text-xs">
        {t({
          fr: 'Cette étape se passe dans votre navigateur — ne fermez pas cet onglet.',
          en: 'This step runs in your browser — please keep this tab open.',
        })}
      </p>
    </div>
  )
}

const PHASE_CONFORMITE = { fr: 'Mise en conformité', en: 'Compliance pass' }
/** ⚠️ Une phase inconnue retombe sur la première, jamais sur un libellé vide : le serveur peut
 *  nommer une passe que cette version de la page ne connaît pas encore. */
const LIBELLES_PHASE: Record<string, { fr: string; en: string } | undefined> = {
  conformity: PHASE_CONFORMITE,
  translation: { fr: 'Traduction anglaise', en: 'English translation' },
  report: { fr: 'Revue réglementaire', en: 'Regulatory review' },
}

function EcranTraitement({
  resume,
  vue,
}: {
  resume: ResumeCommande | null
  vue: ReturnType<typeof vueDepuis>
}) {
  const { t } = useI18n()
  const reste = resteEstimeS(vue)
  const phase = LIBELLES_PHASE[resume?.phase ?? 'conformity'] ?? PHASE_CONFORMITE

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{t(phase)}</span>
          <span className="text-muted-foreground tabular-nums">
            {resume?.faites ?? 0} / {resume?.total ?? 0}
          </span>
        </div>
        <Barre ratio={vue.progression} />
      </div>

      {reste !== null && (
        <p className="text-muted-foreground text-sm">
          {t({
            fr: `Environ ${Math.ceil(reste / 60)} min restantes.`,
            en: `About ${Math.ceil(reste / 60)} min remaining.`,
          })}
        </p>
      )}

      {/* La promesse de la maquette, et elle devient VRAIE ici : le travail vit sur nos serveurs,
          plus dans cet onglet.

          ⚠️ ELLE NE PARLE PAS D'E-MAIL. L'e-mail « vos fichiers sont prêts » appartient à U5 et
          n'existe pas encore : `job-tick` n'envoie rien. Adosser « vous pouvez fermer » à un envoi
          qui n'a pas lieu transformerait une fermeture d'onglet en abandon silencieux. Ce qui est
          vrai, en revanche, c'est que le LIEN dure 30 jours — et c'est cela qu'on promet. */}
      <Encart ton="avis">
        {t({
          fr: 'Vous pouvez fermer cette page : le traitement continue sans vous. Revenez sur ce lien quand vous voulez, il reste valable 30 jours.',
          en: 'You can close this page: processing continues without you. Come back to this link whenever you like — it stays valid for 30 days.',
        })}
      </Encart>

      {(resume?.echecs ?? 0) > 0 && (
        <p className="text-muted-foreground text-xs">
          {t({
            fr: `${resume?.echecs} rubrique(s) en échec — elles seront signalées dans la revue.`,
            en: `${resume?.echecs} section(s) failed — they will be flagged in the review.`,
          })}
        </p>
      )}
    </div>
  )
}

function EcranLivraison({ resume, lang }: { resume: ResumeCommande | null; lang: string }) {
  const { t } = useI18n()
  const expire = resume?.expireLe ? new Date(resume.expireLe) : null
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="size-5 text-emerald-600" />
        {t({ fr: 'Votre dossier est terminé.', en: 'Your dossier is complete.' })}
      </div>
      <p className="text-muted-foreground text-sm">
        {t({
          fr: 'Votre livrable comprend cinq fichiers : le document en français et en anglais, chacun en Word et en PDF, plus la revue réglementaire.',
          en: 'Your deliverable has five files: the document in French and in English, each in Word and PDF, plus the regulatory review.',
        })}
      </p>
      {/* ⚠️ SEAM U5 — la fabrication des cinq fichiers est le lot suivant (`lib/deliverables`, plus
          la conversion du JSON de `order-status` en markdown). Tant qu'elle n'est pas branchée, on
          ne montre AUCUN bouton de téléchargement : un bouton qui ne rend rien sur la page d'un
          client qui a payé est pire qu'une phrase qui dit où l'on en est. */}
      <Encart ton="avis">
        {t({
          fr: 'Nous finalisons la remise de vos fichiers. Écrivez-nous à contact@pharnos.com si vous les voulez tout de suite.',
          en: 'We are finalising file delivery. Write to contact@pharnos.com if you want them right away.',
        })}
      </Encart>
      {expire && (
        <p className="text-muted-foreground text-xs">
          {t({
            fr: `Ce lien reste valable jusqu’au ${expire.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')}.`,
            en: `This link stays valid until ${expire.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')}.`,
          })}
        </p>
      )}
    </div>
  )
}

/* ──────────────────────────────────────── Les briques ──────────────────────────────────────── */

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-page flex min-h-svh justify-center px-4 py-10">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">Pharnos</span>
          <LangSwitch />
        </div>
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <div className="space-y-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Titre({
  icone,
  titre,
  sousTitre,
}: {
  icone: React.ReactNode
  titre: string
  sousTitre?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5">{icone}</span>
      <div>
        <h1 className="text-base font-semibold">{titre}</h1>
        {sousTitre && <p className="text-muted-foreground text-sm">{sousTitre}</p>}
      </div>
    </div>
  )
}

function Encart({ ton, children }: { ton: 'avis' | 'refus'; children: React.ReactNode }) {
  return (
    <div
      role={ton === 'refus' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-sm',
        ton === 'refus'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'text-muted-foreground bg-muted/40',
      )}
    >
      {/* ⚠️ Pas d'icône d'alerte sur un `avis` : le même encart porte « vous pouvez fermer cette
          page », qui est une bonne nouvelle. Un triangle jaune devant en ferait un avertissement. */}
      {ton === 'refus' ? (
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  )
}

function Barre({ ratio }: { ratio: number }) {
  return (
    <div
      className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <div
        className="bg-primary h-full transition-[width] duration-500"
        style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
      />
    </div>
  )
}

/* ─────────────────────────────────────── Les messages ──────────────────────────────────────── */
//
// ⚠️ LES ÉTATS PORTENT DES CLÉS, PAS DES PHRASES — et ce n'est pas une préférence de style.
//
// `t` est un `useCallback` dont l'identité change avec la langue. Traduire dans les rappels le
// faisait entrer dans leurs dépendances, donc dans celles de l'effet d'ouverture : un clic sur
// FR/EN pendant la reconnaissance d'un scan relançait TOUTE la séquence. Deux moteurs de
// reconnaissance en parallèle sur le même téléphone, deux barres de progression concurrentes,
// puis deux appels à la porte dont le second recevait 409 — et l'écran annonçait « refusé » sur
// un traitement qui venait de démarrer normalement. Une clé, elle, ne dépend d'aucune langue.

type CleMessage =
  | 'trop_volumineux'
  | 'illisible'
  | 'pdf_seulement'
  | 'trop_gros'
  | 'fichier_inaccessible'
  | 'trop_de_requetes'
  | 'refus_generique'
  | 'reseau'
  | 'tronque'

/** Un message vient soit de NOUS (une clé), soit du SERVEUR (déjà rédigé, déjà dans la bonne langue). */
type Message = CleMessage | { serveur: string }

const MESSAGES: Record<CleMessage, { fr: string; en: string }> = {
  trop_volumineux: {
    fr: 'Ce document est trop volumineux pour être traité rubrique par rubrique. Envoyez-nous le fichier à contact@pharnos.com — votre commande reste ouverte.',
    en: 'This document is too large to process section by section. Send us the file at contact@pharnos.com — your order stays open.',
  },
  illisible: {
    fr: "Nous n'avons pas réussi à lire ce PDF — il est peut-être protégé par mot de passe ou endommagé. Essayez le fichier d'origine, ou un export PDF récent. Cette tentative n'a rien coûté.",
    en: 'We could not read this PDF — it may be password-protected or damaged. Try the original file, or a fresh PDF export. This attempt cost you nothing.',
  },
  pdf_seulement: {
    fr: 'Seuls les fichiers PDF sont acceptés.',
    en: 'Only PDF files are accepted.',
  },
  trop_gros: {
    fr: 'Ce fichier dépasse 25 Mo. Un export PDF sans les images de fond passe presque toujours.',
    en: 'This file is over 25 MB. A PDF export without background images almost always fits.',
  },
  fichier_inaccessible: {
    fr: 'Ce fichier n’a pas pu être ouvert depuis cet appareil. Réessayez, ou choisissez-le à nouveau.',
    en: 'This file could not be opened from this device. Try again, or pick it once more.',
  },
  trop_de_requetes: {
    fr: 'Trop de tentatives depuis cette connexion. Patientez une minute, puis réessayez.',
    en: 'Too many attempts from this connection. Wait a minute, then try again.',
  },
  refus_generique: {
    fr: 'Ce dépôt a été refusé. Si cela se reproduit, écrivez-nous à contact@pharnos.com — votre commande reste ouverte.',
    en: 'This upload was refused. If it happens again, write to contact@pharnos.com — your order stays open.',
  },
  reseau: {
    fr: 'La connexion a échoué. Votre commande est intacte — réessayez dans un instant.',
    en: 'The connection failed. Your order is intact — try again in a moment.',
  },
  tronque: {
    fr: 'Ce document est long : nous ne l’avons pas lu en entier. Les rubriques situées dans les dernières pages pourront ressortir « Non fourni ».',
    en: 'This document is long: we did not read all of it. Sections in the last pages may come back as “Not provided”.',
  },
}

/** Le serveur a-t-il dit « c'est déjà lancé » ? Ce n'est pas un refus, c'est la course de deux onglets. */
const estDejaLance = (e: unknown): boolean =>
  e instanceof UpgradeApiError && e.code === 'already_running'

/** Traduit une panne d'appel en clé. Jamais un code, jamais « erreur inconnue ». */
function cleErreur(e: unknown): Message {
  if (e instanceof UpgradeApiError) {
    if (e.messageClient) return { serveur: e.messageClient }
    if (e.raison === 'trop_de_requetes') return 'trop_de_requetes'
    if (e.raison === 'refus') return 'refus_generique'
  }
  return 'reseau'
}
