import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Download,
  FileText,
  Loader2,
  Lock,
  MessagesSquare,
  Paperclip,
  PauseCircle,
  RefreshCw,
  Send,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  STATUS_BADGE_CLASSES,
  statusBadgeClass,
  statusLabel,
} from '@/features/correspondence/correspondence-constants'
import { MessageThread } from '@/features/correspondence/MessageThread'
import { PanelHandle } from '@/features/workspace/components/PanelHandle'
import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import { cn } from '@/lib/utils'
import {
  callShare,
  fileToBase64,
  SHARE_ERROR_MESSAGES,
  type OpenPayload,
  type ReviewAttachmentInput,
  type ShareErrorCode,
} from './review-api'

// PDF.js (lourd) chargé à la demande, uniquement quand l'aperçu est prêt à s'afficher.
const PdfViewer = lazy(() =>
  import('@/features/workspace/PdfViewer').then((m) => ({ default: m.PdfViewer })),
)

const MAX_FILES = 3
const MAX_FILE_BYTES = 4 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx'
const REFRESH_MS = 90_000
const PANEL_KEY = 'pharnos.review.panelCollapsed'
// URL signée TTL 1 h → rotation de l'URL d'aperçu à 40 min (marge avant expiration).
const VIEWER_URL_MAX_AGE_MS = 40 * 60_000

type Phase = 'loading' | 'password' | 'error' | 'ready' | 'done'
type Decision = 'accepted' | 'suspended' | 'rejected'

const DECISION_OPTIONS: { value: Decision; label: string; icon: typeof Check }[] = [
  { value: 'accepted', label: 'Accepter', icon: Check },
  { value: 'suspended', label: 'Mettre en suspens', icon: PauseCircle },
  { value: 'rejected', label: 'Rejeter', icon: XCircle },
]

const formatSize = (bytes: number) => {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`
}

const stampFmt = new Intl.DateTimeFormat('fr', { dateStyle: 'short', timeStyle: 'short' })

/** Texte du filigrane reviewer (aperçu canvas + PDF téléchargé) — traçabilité L1. */
const watermarkText = (c: { recipientEmail: string }, at: Date) =>
  `${c.recipientEmail} · ${stampFmt.format(at)}`

/**
 * Page publique de review (jalon H, layout v2) — `/r/{token}`, AUCUN compte requis.
 * L'aperçu PDF occupe l'écran (streaming HTTP Range : première page en ~centaines de Ko) ;
 * le panneau review (contexte, décision, fil) est un TIROIR collé au bord droit, repliable
 * via une languette (même geste que les panneaux du montage CTD), overlay plein écran en mobile.
 */
export function PublicReviewPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorCode, setErrorCode] = useState<ShareErrorCode>('server_error')
  const [data, setData] = useState<OpenPayload | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  // Mot de passe validé — rejoué sur chaque action (decide/reply/refresh).
  const grantedPassword = useRef<string | undefined>(undefined)

  // URL d'aperçu STABLE : chaque `open` renvoie une nouvelle URL signée — la passer telle
  // quelle remonterait le viewer (perte du scroll) à chaque refresh silencieux (90 s). On ne
  // la fait tourner qu'à l'approche de l'expiration (TTL 1 h → rotation à 40 min).
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const viewerUrlAt = useRef(0)
  // Horodatage du filigrane FIGÉ à l'ouverture de la session : une string stable — un texte
  // recalculé à chaque rendu (wall-clock) changerait la prop `watermark` du viewer et
  // déclencherait un re-téléchargement complet + perte du scroll à chaque poll.
  const [openedAt] = useState(() => new Date())

  // Tiroir review : replié ↔ déplié (persisté) ; en mobile, overlay togglé par bouton flottant.
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem(PANEL_KEY) === '1',
  )
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  function togglePanel() {
    setPanelCollapsed((c) => {
      localStorage.setItem(PANEL_KEY, c ? '0' : '1')
      return !c
    })
  }

  const [downloading, setDownloading] = useState(false)

  const [decisionPick, setDecisionPick] = useState<Decision | null>(null)
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  // Après décision : le lien a-t-il été auto-révoqué (écran terminal véridique) ?
  const [linkClosed, setLinkClosed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const open = useCallback(
    async (pwd: string | undefined, opts: { silent?: boolean } = {}) => {
      const res = await callShare({ action: 'open', token, password: pwd, silent: opts.silent })
      if (res.ok) {
        grantedPassword.current = pwd
        setData(res.data)
        setViewerUrl((current) => {
          if (current && Date.now() - viewerUrlAt.current < VIEWER_URL_MAX_AGE_MS) return current
          viewerUrlAt.current = Date.now()
          return res.data.pdfUrl
        })
        setPhase('ready')
        return true
      }
      if (opts.silent) return false
      if (res.error === 'password_required') {
        setPhase('password')
      } else if (res.error === 'wrong_password' || res.error === 'rate_limited') {
        setPhase('password')
        setPasswordError(SHARE_ERROR_MESSAGES[res.error])
      } else {
        setErrorCode(res.error)
        setPhase('error')
      }
      return false
    },
    [token],
  )

  useEffect(() => {
    // Chargement initial (fetch on mount) : tous les setState d'`open` surviennent APRÈS un
    // await (jamais synchrones dans le corps de l'effet) — exception légitime à la règle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void open(undefined)
  }, [open])

  // Rafraîchissement périodique discret (réponses du labo) — pause quand l'onglet est masqué.
  useEffect(() => {
    if (phase !== 'ready') return
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void open(grantedPassword.current, { silent: true })
      }
    }
    const id = setInterval(tick, REFRESH_MS)
    return () => clearInterval(id)
  }, [phase, open])

  async function handleUnlock() {
    if (!password.trim()) return
    setUnlocking(true)
    setPasswordError(null)
    const ok = await open(password)
    if (ok) setPassword('')
    setUnlocking(false)
  }

  function handlePickFiles(picked: FileList | null) {
    if (!picked) return
    const next = [...files]
    for (const f of picked) {
      if (next.length >= MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} pièces par message.`)
        break
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`« ${f.name} » dépasse 4 Mo.`)
        continue
      }
      next.push(f)
    }
    setFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit() {
    const body = comment.trim()
    if (!decisionPick && !body && files.length === 0) {
      toast.error('Choisissez une décision ou écrivez un message.')
      return
    }
    setSubmitting(true)
    try {
      let attachments: ReviewAttachmentInput[] | undefined
      if (files.length > 0) {
        attachments = await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            mime: f.type,
            dataBase64: await fileToBase64(f),
          })),
        )
      }
      const res = await callShare({
        action: decisionPick ? 'decide' : 'reply',
        token,
        password: grantedPassword.current,
        decision: decisionPick ?? undefined,
        body,
        attachments,
      })
      if (!res.ok) {
        toast.error(SHARE_ERROR_MESSAGES[res.error])
        return
      }
      setData(res.data)
      const wasDecision = decisionPick !== null
      setDecisionPick(null)
      setComment('')
      setFiles([])
      if (wasDecision) {
        // Une DÉCISION clôt le tour de review : écran terminal. Selon l'option de
        // l'expéditeur, le lien reste valide (retour à l'échange) ou vient d'être
        // auto-révoqué — l'écran dit la vérité. Un simple message de chat ne ferme
        // pas la page (aller-retour type WhatsApp).
        setLinkClosed(res.data.linkRevoked === true)
        setPhase('done')
      } else {
        toast.success('Message envoyé.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  /** Téléchargement à la demande (l'aperçu streame par Range — on ne télécharge le fichier
   *  complet QUE sur ce clic), filigrané au nom du reviewer (L1 — traçabilité). */
  async function downloadPdf() {
    if (!data) return
    setDownloading(true)
    try {
      const r = await fetch(data.pdfUrl)
      if (!r.ok) throw new Error(String(r.status))
      const { watermarkPdfBlob } = await import('./watermark')
      // Le fichier téléchargé porte l'heure RÉELLE du téléchargement (pas une prop de rendu).
      const blob = await watermarkPdfBlob(
        await r.blob(),
        watermarkText(data.correspondence, new Date()),
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.correspondence.productName.replace(/[^\p{L}\p{N}]+/gu, '-')}-module-1.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch {
      toast.error('Téléchargement impossible — réessayez (le lien d’aperçu expire après 1 h).')
    } finally {
      setDownloading(false)
    }
  }

  const c = data?.correspondence

  const reviewPanel = c ? (
    <div className="flex h-full flex-col overflow-auto">
      <section className="border-b p-4">
        <h1 className="text-base font-semibold">{c.productName}</h1>
        <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt>Pays cible</dt>
          <dd className="text-foreground">{countryLabel(c.country)}</dd>
          <dt>Activité</dt>
          <dd className="text-foreground">{activityLabel(c.activity)}</dd>
          <dt>Expéditeur</dt>
          <dd className="text-foreground break-all">{c.senderEmail}</dd>
          <dt>Envoyé le</dt>
          <dd className="text-foreground">
            {new Intl.DateTimeFormat('fr', { dateStyle: 'long' }).format(new Date(c.createdAt))}
          </dd>
          {c.expiresAt ? (
            <>
              <dt>Lien valable</dt>
              <dd className="text-foreground">
                jusqu’au{' '}
                {new Intl.DateTimeFormat('fr', { dateStyle: 'long' }).format(new Date(c.expiresAt))}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="border-b p-4">
        <h2 className="text-sm font-semibold">
          {c.status === 'in_review' ? 'Votre décision' : 'Réviser la décision / répondre'}
        </h2>
        <div className="mt-3 grid gap-2">
          {DECISION_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={decisionPick === value}
              onClick={() => setDecisionPick(decisionPick === value ? null : value)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                decisionPick === value ? STATUS_BADGE_CLASSES[value] : 'hover:bg-muted/60',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          placeholder={
            decisionPick
              ? 'Commentaire (recommandé)…'
              : 'Message à l’expéditeur (ou choisissez une décision)…'
          }
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {files.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="bg-muted/40 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1">
                  <Paperclip className="size-3 shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-muted-foreground shrink-0">· {formatSize(f.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Retirer ${f.name}`}
                  className="cursor-pointer"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => handlePickFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={files.length >= MAX_FILES}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" /> Joindre
          </Button>
          <Button size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {decisionPick ? 'Envoyer la décision' : 'Envoyer'}
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          PDF, PNG, JPG, WebP, DOCX — 4 Mo max par pièce, {MAX_FILES} pièces.
        </p>
      </section>

      <section className="flex-1 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Échanges</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Actualiser le fil"
            onClick={() => void open(grantedPassword.current, { silent: true })}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <div className="mt-3">
          <MessageThread messages={data?.messages ?? []} viewpoint="recipient" />
        </div>
      </section>
    </div>
  ) : null

  return (
    <div className="bg-background flex h-svh flex-col">
      <header className="bg-card/80 z-20 border-b backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="text-base font-semibold tracking-tight">Pharnos</span>
            <span className="text-muted-foreground hidden text-sm sm:inline">
              · Review de dossier réglementaire
            </span>
          </div>
          {c ? (
            <Badge className={cn('px-2.5 py-0.5', statusBadgeClass(c.status))}>
              {statusLabel(c.status)}
            </Badge>
          ) : null}
        </div>
      </header>

      {phase === 'loading' ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Ouverture du dossier…
        </div>
      ) : phase === 'password' ? (
        <main className="flex-1 overflow-auto px-4">
          <div className="mx-auto mt-16 max-w-sm rounded-lg border p-6">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="size-4" /> Lien protégé par mot de passe
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Saisissez le mot de passe communiqué par l’expéditeur.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void handleUnlock()
              }}
            >
              <Input
                type="password"
                autoFocus
                aria-label="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordError ? <p className="text-destructive text-sm">{passwordError}</p> : null}
              <Button type="submit" className="w-full" disabled={unlocking || !password.trim()}>
                {unlocking ? <Loader2 className="size-4 animate-spin" /> : null} Accéder au dossier
              </Button>
            </form>
          </div>
        </main>
      ) : phase === 'error' ? (
        <main className="flex-1 overflow-auto px-4">
          <div className="mx-auto mt-16 max-w-md rounded-lg border p-6 text-center">
            <CircleAlert className="text-muted-foreground mx-auto size-8" />
            <p className="mt-3 text-sm font-medium">{SHARE_ERROR_MESSAGES[errorCode]}</p>
            {errorCode !== 'invalid' && errorCode !== 'revoked' ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setPhase('loading')
                  void open(grantedPassword.current)
                }}
              >
                <RefreshCw className="size-4" /> Réessayer
              </Button>
            ) : null}
          </div>
        </main>
      ) : phase === 'done' && c ? (
        <main className="flex flex-1 items-center justify-center overflow-auto px-4">
          <div className="max-w-md py-10 text-center">
            <div className="bg-muted mx-auto grid size-14 place-items-center rounded-full">
              <Check className="size-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Merci d’avoir répondu.</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Votre décision —{' '}
              <Badge className={cn('align-middle', statusBadgeClass(c.status))}>
                {statusLabel(c.status)}
              </Badge>{' '}
              — a été transmise à <span className="font-medium">{c.senderEmail}</span>.
            </p>
            <p className="text-muted-foreground mt-3 text-sm">
              {linkClosed
                ? 'Vous pouvez fermer cette page. Ce lien est maintenant clôturé — si l’expéditeur souhaite poursuivre l’échange, il vous transmettra un nouveau lien par e-mail.'
                : 'Vous pouvez fermer cette page. Si l’expéditeur vous répond ou met le dossier à jour, vous serez prévenu par e-mail — ce même lien vous ramènera à l’échange complet.'}
            </p>
          </div>
        </main>
      ) : c ? (
        <main className="relative flex min-h-0 flex-1">
          {/* Visionneuse plein écran — barre d'en-tête FIGÉE (hors zone de scroll) */}
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="bg-card flex shrink-0 items-center justify-between gap-2 border-b p-2.5">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0" />
                <span className="truncate font-medium">
                  Module 1 — {c.productName} ({countryLabel(c.country)})
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatSize(c.pdfSize)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={downloading}
                onClick={() => void downloadPdf()}
              >
                {downloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Télécharger
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <Suspense
                fallback={
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
                    <Loader2 className="size-4 animate-spin" /> Préparation de l’aperçu…
                  </div>
                }
              >
                {/* Streaming par Range : la 1re page s'affiche sans télécharger le fichier entier. */}
                {viewerUrl ? (
                  <PdfViewer url={viewerUrl} watermark={watermarkText(c, openedAt)} />
                ) : null}
              </Suspense>
            </div>
          </section>

          {/* Languette de rabat (desktop) — même geste que les panneaux du montage CTD */}
          <PanelHandle
            side="right"
            open={!panelCollapsed}
            onClick={togglePanel}
            label={
              panelCollapsed ? 'Afficher le panneau de review' : 'Replier le panneau de review'
            }
            className="z-10 -mr-px hidden lg:grid"
          />

          {/* Tiroir review — colonne dockée à droite (desktop), repliable */}
          <aside
            className={cn(
              'bg-card hidden shrink-0 overflow-hidden border-l transition-[width] duration-200 lg:block',
              panelCollapsed ? 'w-0 border-l-0' : 'w-[400px]',
            )}
            aria-label="Panneau de review"
            aria-hidden={panelCollapsed}
          >
            <div className="h-full w-[400px]">{reviewPanel}</div>
          </aside>

          {/* Mobile : tiroir en overlay plein écran + bouton flottant */}
          <Button
            className="fixed right-4 bottom-4 z-30 shadow-lg lg:hidden"
            onClick={() => setMobilePanelOpen(true)}
          >
            <MessagesSquare className="size-4" /> Review
          </Button>
          {mobilePanelOpen ? (
            <div className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:hidden">
              <div className="bg-card flex h-full w-full max-w-md flex-col">
                <div className="flex items-center justify-between border-b p-3">
                  <h2 className="text-sm font-semibold">Review</h2>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fermer le panneau"
                    onClick={() => setMobilePanelOpen(false)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1">{reviewPanel}</div>
              </div>
            </div>
          ) : null}
        </main>
      ) : null}

      <footer className="text-muted-foreground shrink-0 border-t py-2.5 text-center text-xs">
        Propulsé par <span className="font-medium">Pharnos</span> — l’OS des affaires réglementaires
        pharmaceutiques UEMOA/CEDEAO.
      </footer>
    </div>
  )
}
